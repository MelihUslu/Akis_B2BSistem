import bcrypt from 'bcrypt';
import crypto from 'crypto';
import xlsx from 'xlsx';
import prisma, { currentTenantId } from '../utils/prisma.js';
import { hasPermission } from '../services/permissions.js';
import { emitEvent } from '../services/webhookService.js';
import { assertWithinLimit, LimitError } from '../services/limitService.js';
import { sendCredentialsMail } from '../services/mailService.js';
import { partnerSummary, LedgerError } from '../services/partnerLedgerService.js';
import { round2 } from '../services/pricingService.js';
import { normalizeCurrency, assertCurrencyChangeAllowed, CurrencyError, postEntry, currentRate } from '../services/accountPosting.js';

/**
 * Cari Hesaplar: bayiler, portal dışı müşteriler ve tedarikçiler tek listede.
 * Bayiler portal hesabı gerektirdiği için Bayi Yönetimi'nden eklenir; burada yalnızca yetkili kişileri,
 * iletişim e-postası, etiket, sorumlu ve iç notu düzenlenebilir. Müşteri ve tedarikçi kartları burada açılır.
 */
export const PARTNER_KINDS = ['DEALER', 'CUSTOMER', 'SUPPLIER'];
const EDITABLE_KINDS = ['CUSTOMER', 'SUPPLIER'];
const KIND_LABEL = { DEALER: 'Bayi', CUSTOMER: 'Müşteri', SUPPLIER: 'Tedarikçi' };

const str = (v, max = 200) => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
};
const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class PartnerError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export const fail = (res, error, fallback) => {
  if (error instanceof PartnerError || error instanceof LedgerError || error instanceof CurrencyError) return res.status(error.status).json({ message: error.message });
  if (error instanceof LimitError) return res.status(error.status).json({ message: error.message, code: error.code });
  if (error.code === 'P2002') return res.status(400).json({ message: 'Bu vergi numarası, cari kodu veya e-posta başka bir kayıtta kullanılıyor.' });
  console.error(fallback, error);
  return res.status(400).json({ message: fallback });
};

// Kart yönetimi: Finans veya Bayiler yetkisi. Teklif hazırlayan personel yalnızca müşteri kartı açabilir.
export const canManage = (user) => hasPermission(user, 'FINANCE') || hasPermission(user, 'DEALERS');

export const partnerAccess = (req, res, next) => {
  if (canManage(req.user)) return next();
  return res.status(403).json({ message: 'Bu işlem için yetkiniz yok. Firma yöneticinizden "Finans" veya "Bayiler" yetkisi isteyin.', code: 'NO_PERMISSION' });
};

export const loadPartner = async (id) => {
  const company = await prisma.company.findUnique({ where: { id: parseInt(id) || 0 } });
  if (!company) throw new PartnerError('Cari bulunamadı.', 404);
  return company;
};

const contactsOf = (list) => (Array.isArray(list) ? list : []).slice(0, 30)
  .map((c, i) => ({ name: str(c.name, 120), title: str(c.title, 80), phone: str(c.phone, 40), email: str(c.email, 160), isPrimary: Boolean(c.isPrimary), sortOrder: i }))
  .filter((c) => c.name);

export const tagsOf = (v) => [...new Set((Array.isArray(v) ? v : String(v ?? '').split(','))
  .map((t) => String(t).trim().slice(0, 30)).filter(Boolean))].slice(0, 10);

// Sorumlu personel firma yöneticilerinden biri olmalı
const ownerIdOf = async (v) => {
  if (v === undefined) return undefined;
  const id = parseInt(v);
  if (!id) return null;
  const user = await prisma.user.findFirst({ where: { id, role: 'ADMIN', isActive: true }, select: { id: true } });
  if (!user) throw new PartnerError('Sorumlu personel bulunamadı.');
  return id;
};

// Cari para birimi (TRY, USD, EUR); boşsa TL
export const currencyOf = (v) => {
  if (v === undefined || v === null || v === '') return undefined;
  const c = normalizeCurrency(v);
  if (!c) throw new PartnerError('Para birimi TL, USD veya EUR olmalı.');
  return c;
};

const emailOf = (v) => {
  const email = str(v, 160);
  if (email && !EMAIL.test(email)) throw new PartnerError('Geçersiz e-posta adresi.');
  return email;
};

const cardData = (b, kind) => ({
  name: str(b.name, 200),
  externalCode: str(b.externalCode, 60),
  taxNumber: str(b.taxNumber, 20),
  taxOffice: str(b.taxOffice, 80),
  authorizedPerson: str(b.authorizedPerson, 120),
  phone: str(b.phone, 40),
  email: emailOf(b.email),
  address: str(b.address, 500),
  notes: str(b.notes, 2000),
  paymentTermDays: Math.max(0, parseInt(b.paymentTermDays) || 0),
  // Risk limiti yalnızca müşteride anlamlı (tedarikçiye satış yapılmaz)
  riskLimit: kind === 'CUSTOMER' ? Math.max(0, num(b.riskLimit) ?? 0) : 0,
  ...(b.tags !== undefined && { tags: tagsOf(b.tags) })
});

const listSelect = {
  id: true, kind: true, name: true, externalCode: true, taxNumber: true, taxOffice: true, phone: true, email: true,
  authorizedPerson: true, status: true, currentBalance: true, currency: true, riskLimit: true, paymentTermDays: true, createdAt: true, tags: true,
  address: true, owner: { select: { id: true, name: true } },
  _count: { select: { users: true, contacts: true, orders: true } },
  contacts: { orderBy: { isPrimary: 'desc' }, take: 1, select: { name: true, title: true, phone: true, email: true } }
};

// Liste filtreleri (ekran ve Excel dışa aktarımı aynı filtreyi kullanır)
const listWhere = (query, userId) => {
  const kind = PARTNER_KINDS.includes(query.kind) ? query.kind : null;
  const term = String(query.q || '').trim();
  const ci = { contains: term, mode: 'insensitive' };
  const search = term ? { OR: [{ name: ci }, { taxNumber: ci }, { externalCode: ci }, { authorizedPerson: ci }, { phone: ci }, { email: ci }, { contacts: { some: { name: ci } } }] } : {};
  const extra = {
    ...(query.balance === 'debtor' && { currentBalance: { lt: 0 } }),
    ...(query.balance === 'creditor' && { currentBalance: { gt: 0 } }),
    ...(query.balance === 'zero' && { currentBalance: 0 }),
    ...(['ACTIVE', 'PASSIVE', 'PENDING'].includes(query.status) && { status: query.status }),
    ...(query.tag && { tags: { has: String(query.tag) } }),
    ...(query.ownerId === 'none' ? { ownerId: null } : parseInt(query.ownerId) ? { ownerId: parseInt(query.ownerId) } : {}),
    // Hatırlatması gelmiş, tamamlanmamış notu olanlar (yalnızca benim notlarım)
    ...(query.reminder === 'mine' && { partnerNotes: { some: { userId, doneAt: null, remindAt: { lte: new Date(Date.now() + 86400000) } } } })
  };
  return { search, where: { ...search, ...extra, ...(kind && { kind }) }, extra };
};

export const listPartners = async (req, res) => {
  try {
    const { where, search, extra } = listWhere(req.query, req.user.id);
    const take = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const orderBy = { balance: [{ currentBalance: 'asc' }], name: [{ name: 'asc' }], newest: [{ createdAt: 'desc' }] }[req.query.sort] || [{ name: 'asc' }];
    const [data, total, groups] = await Promise.all([
      prisma.company.findMany({ where, select: listSelect, orderBy, take, skip: (page - 1) * take }),
      prisma.company.count({ where }),
      prisma.company.groupBy({ by: ['kind'], where: { ...search, ...extra }, _count: { _all: true } })
    ]);
    const counts = Object.fromEntries(groups.map((g) => [g.kind, g._count._all]));
    counts.ALL = groups.reduce((s, g) => s + g._count._all, 0);
    res.json({ data, counts, pagination: { total, page, pages: Math.max(1, Math.ceil(total / take)) } });
  } catch (error) {
    fail(res, error, 'Cari hesaplar getirilemedi.');
  }
};

// Filtre seçenekleri: kullanılan etiketler ve sorumlu atanabilecek personel
export const partnerMeta = async (req, res) => {
  const [tagged, staff] = await Promise.all([
    prisma.company.findMany({ where: { NOT: { tags: { isEmpty: true } } }, select: { tags: true }, take: 5000 }),
    prisma.user.findMany({ where: { role: 'ADMIN', isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
  ]);
  const tags = [...new Set(tagged.flatMap((c) => c.tags))].sort((a, b) => a.localeCompare(b, 'tr'));
  res.json({ tags, staff });
};

export const getPartner = async (req, res) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: parseInt(req.params.id) || 0 },
      include: {
        owner: { select: { id: true, name: true } },
        contacts: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] },
        partnerNotes: { orderBy: [{ doneAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }], take: 50, include: { user: { select: { id: true, name: true } } } },
        documents: { orderBy: { createdAt: 'desc' } },
        statementLinks: { orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, createdAt: true, sentTo: true, emailed: true, response: true, responseNote: true, responderName: true, respondedAt: true, balance: true, expiresAt: true } },
        _count: { select: { users: true, orders: true, quoteRequests: true, transactions: true } }
      }
    });
    if (!company) return res.status(404).json({ message: 'Cari bulunamadı.' });
    res.json({ ...company, summary: await partnerSummary(company) });
  } catch (error) {
    fail(res, error, 'Cari getirilemedi.');
  }
};

// Müşteri / tedarikçi kartı açar. Yalnızca unvan zorunludur (ara sıra alışveriş yapan müşteri hızlıca eklenebilsin).
export const createPartner = async (req, res) => {
  try {
    const kind = req.body.kind;
    if (kind === 'DEALER') throw new PartnerError('Portala giriş yapacak bayiler Bayi Yönetimi ekranından eklenir.');
    if (!EDITABLE_KINDS.includes(kind)) throw new PartnerError('Cari türü seçin (müşteri veya tedarikçi).');
    if (!canManage(req.user) && !(kind === 'CUSTOMER' && hasPermission(req.user, 'QUOTES'))) {
      throw new PartnerError('Bu işlem için yetkiniz yok.', 403);
    }
    const data = cardData(req.body, kind);
    if (!data.name) throw new PartnerError('Unvan / ad soyad zorunludur.');
    const ownerId = await ownerIdOf(req.body.ownerId);
    const contacts = contactsOf(req.body.contacts);
    const currency = currencyOf(req.body.currency) || 'TRY';
    const company = await prisma.company.create({
      data: {
        ...data, kind, currency, status: 'ACTIVE', source: 'ADMIN', ...(ownerId !== undefined && { ownerId }),
        ...(contacts.length && { contacts: { create: contacts.map((c) => ({ ...c, tenantId: req.tenant.id })) } })
      },
      select: listSelect
    });
    res.locals.auditEntityId = company.id;
    emitEvent(req.tenant.id, 'company.created', { id: company.id, name: company.name, kind, taxNumber: company.taxNumber, externalCode: company.externalCode, source: 'ADMIN' });
    res.status(201).json({ ...company, message: kind === 'CUSTOMER' ? 'Müşteri kartı oluşturuldu.' : 'Tedarikçi kartı oluşturuldu.' });
  } catch (error) {
    fail(res, error, 'Cari kartı oluşturulamadı.');
  }
};

export const updatePartner = async (req, res) => {
  try {
    const before = await loadPartner(req.params.id);
    const contacts = req.body.contacts !== undefined ? contactsOf(req.body.contacts) : undefined;
    const ownerId = await ownerIdOf(req.body.ownerId);
    let data;
    if (before.kind === 'DEALER') {
      // Bayi kartının ticari ayarları Bayi Yönetimi'nde; burada iletişim, etiket, sorumlu ve not
      data = { notes: str(req.body.notes, 2000) };
      if (req.body.email !== undefined) data.email = emailOf(req.body.email);
      if (req.body.tags !== undefined) data.tags = tagsOf(req.body.tags);
    } else {
      const kind = EDITABLE_KINDS.includes(req.body.kind) ? req.body.kind : before.kind;
      data = { ...cardData(req.body, kind), kind };
      if (!data.name) throw new PartnerError('Unvan / ad soyad zorunludur.');
      if (['ACTIVE', 'PASSIVE'].includes(req.body.status)) data.status = req.body.status;
    }
    if (ownerId !== undefined) data.ownerId = ownerId;
    const currency = currencyOf(req.body.currency);
    if (currency && currency !== before.currency) {
      await assertCurrencyChangeAllowed(before, currency);
      data.currency = currency;
    }
    await prisma.$transaction(async (tx) => {
      await tx.company.update({ where: { id: before.id }, data });
      if (contacts) {
        await tx.companyContact.deleteMany({ where: { companyId: before.id } });
        if (contacts.length) await tx.companyContact.createMany({ data: contacts.map((c) => ({ ...c, companyId: before.id })) });
      }
    });
    res.json({ message: 'Cari kartı güncellendi.' });
  } catch (error) {
    fail(res, error, 'Cari kartı güncellenemedi.');
  }
};

// Hareketi olmayan müşteri / tedarikçi silinir; geçmişi olan pasife alınır (ekstre korunur)
export const deletePartner = async (req, res) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: parseInt(req.params.id) || 0 },
      include: { _count: { select: { orders: true, transactions: true, quoteRequests: true, payments: true, users: true, documents: true } } }
    });
    if (!company) throw new PartnerError('Cari bulunamadı.', 404);
    if (company.kind === 'DEALER') throw new PartnerError('Bayiler Bayi Yönetimi ekranından pasife alınır.');
    const c = company._count;
    if (c.orders || c.transactions || c.quoteRequests || c.payments || c.users || c.documents) {
      await prisma.company.update({ where: { id: company.id }, data: { status: 'PASSIVE' } });
      return res.json({ archived: true, message: 'Carinin geçmiş hareketleri veya belgeleri olduğu için silinmedi, pasife alındı.' });
    }
    await prisma.company.delete({ where: { id: company.id } });
    res.json({ message: 'Cari kartı silindi.' });
  } catch (error) {
    fail(res, error, 'Cari silinemedi.');
  }
};

/**
 * Portal dışı müşteriyi bayiye dönüştürür: portal kullanıcısı açılır, giriş bilgisi e-postayla gider.
 * Geçmiş hareketler, teklifler ve siparişler aynı kartta kalır. Bayi paket limitine sayılır.
 */
export const convertToDealer = async (req, res) => {
  try {
    const company = await loadPartner(req.params.id);
    if (company.kind !== 'CUSTOMER') throw new PartnerError('Yalnızca müşteri kartı bayiye dönüştürülebilir.');
    const email = emailOf(req.body.email || company.email);
    if (!email) throw new PartnerError('Bayinin portala giriş e-postasını girin.');
    const password = String(req.body.password || '');
    if (password && password.length < 8) throw new PartnerError('Şifre en az 8 karakter olmalıdır.');
    await assertWithinLimit(req.tenant, 'dealers');
    const plain = password || crypto.randomBytes(9).toString('base64url').slice(0, 12);
    const name = str(req.body.name, 120) || company.authorizedPerson || company.name;
    await prisma.company.update({
      where: { id: company.id },
      data: {
        kind: 'DEALER', status: 'ACTIVE', email: company.email || email,
        users: { create: { tenantId: currentTenantId(), email: email.toLowerCase(), password: await bcrypt.hash(plain, 10), name, role: 'BAYI', isOwner: true, emailVerifiedAt: new Date() } }
      }
    });
    const mail = await sendCredentialsMail({ to: email, name, password: plain, tenant: req.tenant }).catch(() => ({ delivered: false }));
    res.json({
      message: mail.delivered
        ? 'Müşteri bayiye dönüştürüldü; portal giriş bilgileri e-postayla gönderildi.'
        : 'Müşteri bayiye dönüştürüldü ancak e-posta gönderilemedi. Bayi Yönetimi\'nden şifre sıfırlayarak giriş bilgisini iletebilirsiniz.'
    });
  } catch (error) {
    fail(res, error, 'Bayiye dönüştürülemedi.');
  }
};

// ─── Excel ───────────────────────────────────────────────────────────────────

const sendWorkbook = (res, rows, sheetName, fileName, widths) => {
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.json_to_sheet(rows);
  if (widths) ws['!cols'] = widths.map((w) => ({ wch: w }));
  xlsx.utils.book_append_sheet(wb, ws, sheetName);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }));
};

export { sendWorkbook };

// Ekrandaki filtrelerle cari listesi
export const exportPartners = async (req, res) => {
  try {
    const { where } = listWhere(req.query, req.user.id);
    const rows = await prisma.company.findMany({ where, select: listSelect, orderBy: { name: 'asc' }, take: 20000 });
    sendWorkbook(res, rows.map((c) => ({
      'Tür': KIND_LABEL[c.kind], 'Cari Kodu': c.externalCode || '', 'Unvan': c.name, 'Vergi Dairesi': c.taxOffice || '', 'Vergi No': c.taxNumber || '',
      'Telefon': c.phone || '', 'E-posta': c.email || '', 'Adres': c.address || '', 'Vade (gün)': c.paymentTermDays, 'Para Birimi': c.currency === 'TRY' ? 'TL' : c.currency, 'Risk Limiti': c.riskLimit,
      'Bakiye': round2(c.currentBalance), 'Bakiye Durumu': c.currentBalance < 0 ? 'Borçlu' : c.currentBalance > 0 ? 'Alacaklı' : '',
      'Etiketler': c.tags.join(', '), 'Sorumlu': c.owner?.name || '', 'Yetkili Adı': c.contacts[0]?.name || c.authorizedPerson || '',
      'Yetkili Telefon': c.contacts[0]?.phone || '', 'Yetkili E-posta': c.contacts[0]?.email || '', 'Durum': c.status === 'PASSIVE' ? 'Pasif' : 'Aktif'
    })), 'Cariler', `cariler-${new Date().toISOString().slice(0, 10)}.xlsx`, [10, 14, 34, 16, 14, 16, 26, 34, 10, 12, 14, 12, 20, 16, 22, 16, 26, 8]);
  } catch (error) {
    fail(res, error, 'Excel oluşturulamadı.');
  }
};

// İçe aktarma şablonu (örnek iki satırla)
export const importTemplate = (req, res) => {
  sendWorkbook(res, [
    { 'Tür': 'Müşteri', 'Cari Kodu': '120.01.001', 'Unvan': 'Örnek Kafe Ltd. Şti.', 'Vergi Dairesi': 'Kadıköy', 'Vergi No': '1234567890', 'Telefon': '0212 000 00 00', 'E-posta': 'muhasebe@ornek.com', 'Adres': 'Moda Cad. No:1 Kadıköy / İstanbul', 'Vade (gün)': 30, 'Para Birimi': 'TL', 'Risk Limiti': 50000, 'Açılış Borcu': 12500, 'Açılış Alacağı': '', 'Etiketler': 'İstanbul, Toptan', 'Yetkili Adı': 'Ayşe Yılmaz', 'Yetkili Görevi': 'Satın alma', 'Yetkili Telefon': '0532 000 00 00', 'Yetkili E-posta': 'ayse@ornek.com', 'Not': '' },
    { 'Tür': 'Tedarikçi', 'Cari Kodu': '320.01.001', 'Unvan': 'Örnek Ambalaj San. A.Ş.', 'Vergi Dairesi': 'Gebze', 'Vergi No': '9876543210', 'Telefon': '', 'E-posta': '', 'Adres': '', 'Vade (gün)': 60, 'Para Birimi': 'USD', 'Risk Limiti': '', 'Açılış Borcu': '', 'Açılış Alacağı': 8000, 'Etiketler': 'Hammadde', 'Yetkili Adı': '', 'Yetkili Görevi': '', 'Yetkili Telefon': '', 'Yetkili E-posta': '', 'Not': '' }
  ], 'Cariler', 'cari-aktarim-sablonu.xlsx', [10, 14, 34, 16, 14, 16, 26, 34, 10, 12, 12, 13, 18, 18, 16, 16, 24, 20]);
};

const cell = (row, ...names) => {
  for (const n of names) {
    const key = Object.keys(row).find((k) => k.trim().toLocaleLowerCase('tr-TR') === n.toLocaleLowerCase('tr-TR'));
    if (key !== undefined && row[key] !== '' && row[key] !== null && row[key] !== undefined) return row[key];
  }
  return undefined;
};
const kindOf = (v) => {
  const s = String(v ?? '').trim().toLocaleLowerCase('tr-TR');
  if (['müşteri', 'musteri', 'customer', 'm'].includes(s)) return 'CUSTOMER';
  if (['tedarikçi', 'tedarikci', 'supplier', 't'].includes(s)) return 'SUPPLIER';
  if (['bayi', 'dealer'].includes(s)) return 'DEALER';
  return s ? 'INVALID' : 'CUSTOMER';
};

/**
 * Excel'den müşteri / tedarikçi aktarımı. Cari kodu, yoksa vergi no ile mevcut kart bulunur ve güncellenir.
 * Açılış borcu / alacağı yalnızca yeni açılan karta "Açılış" hareketi olarak yazılır.
 * ?dryRun=1 ile hiçbir şey kaydedilmeden satır satır sonuç döner (önizleme).
 */
export const importPartners = async (req, res) => {
  try {
    if (!req.file) throw new PartnerError('Excel dosyası seçin.');
    const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true';
    let rows;
    try {
      const wb = xlsx.read(req.file.buffer, { type: 'buffer' });
      rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    } catch {
      throw new PartnerError('Dosya okunamadı. Excel (.xlsx) şablonunu kullanın.');
    }
    if (!rows.length) throw new PartnerError('Dosyada satır yok.');
    if (rows.length > 5000) throw new PartnerError('Tek seferde en fazla 5000 satır aktarılabilir.');

    const results = [];
    const seen = new Set();
    for (const [i, row] of rows.entries()) {
      const line = i + 2; // başlık satırı 1
      try {
        const kind = kindOf(cell(row, 'Tür'));
        if (kind === 'INVALID') throw new PartnerError('Tür "Müşteri" veya "Tedarikçi" olmalı.');
        const body = {
          name: cell(row, 'Unvan', 'Ad Soyad'), externalCode: cell(row, 'Cari Kodu'), taxOffice: cell(row, 'Vergi Dairesi'),
          taxNumber: cell(row, 'Vergi No', 'TC Kimlik No') !== undefined ? String(cell(row, 'Vergi No', 'TC Kimlik No')) : undefined,
          phone: cell(row, 'Telefon') !== undefined ? String(cell(row, 'Telefon')) : undefined, email: cell(row, 'E-posta', 'Eposta'),
          address: cell(row, 'Adres'), paymentTermDays: cell(row, 'Vade (gün)', 'Vade'), riskLimit: cell(row, 'Risk Limiti'),
          tags: cell(row, 'Etiketler') ?? '', notes: cell(row, 'Not')
        };
        const key = String(body.externalCode || body.taxNumber || '').trim();
        if (key && seen.has(key)) throw new PartnerError('Aynı cari kodu / vergi no dosyada birden fazla kez geçiyor.');
        if (key) seen.add(key);

        const existing = (body.externalCode && await prisma.company.findFirst({ where: { externalCode: String(body.externalCode).trim() } }))
          || (body.taxNumber && await prisma.company.findFirst({ where: { taxNumber: String(body.taxNumber).trim() } })) || null;
        if (existing?.kind === 'DEALER' || (!existing && kind === 'DEALER')) {
          results.push({ line, action: 'skip', name: existing?.name || body.name, message: 'Bayi kartı — Bayi Yönetimi\'nden yönetilir, atlandı.' });
          continue;
        }
        const targetKind = existing ? existing.kind : kind;
        const data = cardData(body, targetKind);
        if (!data.name) throw new PartnerError('Unvan zorunlu.');
        const contactName = str(cell(row, 'Yetkili Adı', 'Yetkili'), 120);
        const contact = contactName && { name: contactName, title: str(cell(row, 'Yetkili Görevi'), 80), phone: str(cell(row, 'Yetkili Telefon'), 40), email: emailOf(cell(row, 'Yetkili E-posta')), isPrimary: true, sortOrder: 0 };
        const rowCurrency = currencyOf(cell(row, 'Para Birimi', 'Döviz'));
        const debt = Math.max(0, num(cell(row, 'Açılış Borcu')) ?? 0);
        const credit = Math.max(0, num(cell(row, 'Açılış Alacağı')) ?? 0);
        const opening = round2(credit - debt); // eksi: cari bize borçlu

        if (existing) {
          if (rowCurrency && rowCurrency !== existing.currency) await assertCurrencyChangeAllowed(existing, rowCurrency);
          if (!dryRun) {
            await prisma.$transaction(async (tx) => {
              await tx.company.update({ where: { id: existing.id }, data: { ...data, ...(rowCurrency && { currency: rowCurrency }) } });
              if (contact && !(await tx.companyContact.findFirst({ where: { companyId: existing.id, name: contact.name } }))) {
                await tx.companyContact.create({ data: { ...contact, isPrimary: !(await tx.companyContact.count({ where: { companyId: existing.id } })), companyId: existing.id } });
              }
            });
          }
          results.push({ line, action: 'update', name: data.name, message: opening ? 'Güncellendi. Açılış bakiyesi yalnızca yeni kartta yazılır; yok sayıldı.' : 'Güncellendi.' });
        } else {
          const currency = rowCurrency || 'TRY';
          // Açılış bakiyesi carinin para birimindedir; TL karşılığı güncel kurla saklanır
          const rate = opening ? await currentRate(currency) : 1;
          if (!dryRun) {
            await prisma.$transaction(async (tx) => {
              const c = await tx.company.create({
                data: { ...data, kind: targetKind, currency, status: 'ACTIVE', source: 'ADMIN', ...(contact && { contacts: { create: [{ ...contact, tenantId: currentTenantId() }] } }) }
              });
              if (opening) {
                await postEntry(tx, { company: c, type: opening > 0 ? 'CREDIT' : 'DEBT', amount: Math.abs(opening), rate, description: 'Açılış bakiyesi (Excel aktarımı)', source: 'OPENING', createdByName: req.user.name });
              }
            });
          }
          results.push({ line, action: 'create', name: data.name, kind: targetKind, message: opening ? `Açılış: ${opening < 0 ? 'borçlu' : 'alacaklı'} ${Math.abs(opening).toLocaleString('tr-TR')} ${currency === 'TRY' ? 'TL' : currency}` : (currency !== 'TRY' ? `${currency} cari` : '') });
        }
      } catch (error) {
        const message = error instanceof PartnerError || error instanceof CurrencyError ? error.message : error.code === 'P2002' ? 'Cari kodu veya vergi no başka bir kartta kayıtlı.' : 'Satır işlenemedi.';
        if (!(error instanceof PartnerError) && !(error instanceof CurrencyError) && error.code !== 'P2002') console.error('importPartners row', line, error);
        results.push({ line, action: 'error', name: cell(row, 'Unvan') || '', message });
      }
    }
    const count = (a) => results.filter((r) => r.action === a).length;
    res.json({ dryRun, summary: { create: count('create'), update: count('update'), skip: count('skip'), error: count('error') }, results });
  } catch (error) {
    fail(res, error, 'Excel aktarılamadı.');
  }
};
