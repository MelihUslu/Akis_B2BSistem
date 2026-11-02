import prisma from '../utils/prisma.js';
import { notifyAdmins, safeNotify } from '../services/notificationService.js';
import { sendWorkbook } from './partnerController.js';

/**
 * Müşteri adayları: Instagram / WhatsApp reklamından yazan kişiler.
 * Kişi firmanın talep formunu (/talep) kendisi doldurur ya da yönetici DM'den gördüğünü elle ekler.
 * Liste filtrelenir, durum ve not tutulur, Excel'e aktarılır.
 */

export const SOURCES = { INSTAGRAM: 'Instagram', WHATSAPP: 'WhatsApp', FACEBOOK: 'Facebook', FORM: 'Talep formu', PHONE: 'Telefon', OTHER: 'Diğer' };
export const STATUSES = { NEW: 'Yeni', CONTACTED: 'Görüşüldü', ORDERED: 'Sipariş verdi', LOST: 'Olumsuz' };

const str = (v, max) => String(v ?? '').trim().slice(0, max);

// Türkiye numaraları tek biçimde saklanır (0532…); yurt dışı numaralar + ile kalır
export const normalizePhone = (v) => {
  const raw = String(v ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 12 && digits.startsWith('90')) return `0${digits.slice(2)}`;
  if (digits.length === 10 && digits.startsWith('5')) return `0${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return digits;
  return raw.startsWith('+') ? `+${digits}` : digits;
};
const validPhone = (p) => p.replace(/\D/g, '').length >= 10;

const pickFields = (b) => {
  const data = {};
  if (b.name !== undefined) data.name = str(b.name, 120);
  if (b.phone !== undefined) data.phone = normalizePhone(b.phone).slice(0, 20);
  if (b.email !== undefined) data.email = str(b.email, 120).toLowerCase();
  if (b.city !== undefined) data.city = str(b.city, 60);
  if (b.source !== undefined) data.source = SOURCES[b.source] ? b.source : 'OTHER';
  if (b.campaign !== undefined) data.campaign = str(b.campaign, 100);
  if (b.request !== undefined) data.request = str(b.request, 2000);
  if (b.status !== undefined) data.status = STATUSES[b.status] ? b.status : 'NEW';
  if (b.note !== undefined) data.note = str(b.note, 2000);
  return data;
};

// Ekrandaki filtreler (liste ve Excel aynı filtreyi kullanır). withStatus=false: durum sekmelerindeki sayılar için
const listWhere = (q, withStatus = true) => {
  const where = {};
  if (withStatus && STATUSES[q.status]) where.status = q.status;
  if (SOURCES[q.source]) where.source = q.source;
  if (q.campaign) where.campaign = String(q.campaign);
  const from = q.from ? new Date(q.from) : null;
  const to = q.to ? new Date(`${q.to}T23:59:59.999`) : null;
  if ((from && !isNaN(from)) || (to && !isNaN(to))) {
    where.createdAt = { ...(from && !isNaN(from) && { gte: from }), ...(to && !isNaN(to) && { lte: to }) };
  }
  const text = str(q.q, 100);
  if (text) {
    const digits = text.replace(/\D/g, '');
    where.OR = [
      { name: { contains: text, mode: 'insensitive' } },
      { request: { contains: text, mode: 'insensitive' } },
      { campaign: { contains: text, mode: 'insensitive' } },
      { city: { contains: text, mode: 'insensitive' } },
      ...(digits.length >= 3 ? [{ phone: { contains: digits.replace(/^90/, '').replace(/^0/, '') } }] : [])
    ];
  }
  return where;
};

// Elle ekleyen yöneticinin adı (form ile gelenlerde boş)
const withCreators = async (rows) => {
  const ids = [...new Set(rows.map((r) => r.createdById).filter(Boolean))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const names = Object.fromEntries(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({ ...r, createdByName: r.createdById ? names[r.createdById] || '' : '' }));
};

export const listLeads = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(10, parseInt(req.query.pageSize) || 50));
    const where = listWhere(req.query);
    const [items, total, byStatus, campaigns] = await Promise.all([
      prisma.customerLead.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.customerLead.count({ where }),
      prisma.customerLead.groupBy({ by: ['status'], where: listWhere(req.query, false), _count: { _all: true } }),
      prisma.customerLead.findMany({ where: { campaign: { not: '' } }, distinct: ['campaign'], select: { campaign: true }, orderBy: { campaign: 'asc' }, take: 200 })
    ]);
    res.json({
      items: await withCreators(items), total, page, pageSize,
      counts: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
      campaigns: campaigns.map((c) => c.campaign)
    });
  } catch (error) {
    console.error('listLeads error:', error);
    res.status(500).json({ message: 'Müşteri adayları getirilemedi.' });
  }
};

export const createLead = async (req, res) => {
  try {
    const data = pickFields(req.body);
    if (!data.name) return res.status(400).json({ message: 'Ad soyad (ya da Instagram kullanıcı adı) girin.' });
    if (data.phone && !validPhone(data.phone)) return res.status(400).json({ message: 'Telefon numarası eksik görünüyor.' });
    // Aynı numara daha önce eklendiyse uyarılır (yine de kaydedilir; aynı kişi yeni reklamdan tekrar yazmış olabilir)
    const existing = data.phone ? await prisma.customerLead.findFirst({ where: { phone: data.phone }, orderBy: { createdAt: 'desc' }, select: { id: true, name: true, createdAt: true } }) : null;
    const lead = await prisma.customerLead.create({ data: { ...data, createdById: req.user.id } });
    res.status(201).json({ lead, duplicateOf: existing, message: existing ? `Kaydedildi. Bu numara daha önce "${existing.name}" adıyla da eklenmiş.` : 'Kişi eklendi.' });
  } catch (error) {
    console.error('createLead error:', error);
    res.status(500).json({ message: 'Kişi eklenemedi.' });
  }
};

export const updateLead = async (req, res) => {
  try {
    const lead = await prisma.customerLead.findFirst({ where: { id: parseInt(req.params.id) || 0 } });
    if (!lead) return res.status(404).json({ message: 'Kayıt bulunamadı.' });
    const data = pickFields(req.body);
    if (data.name === '') return res.status(400).json({ message: 'Ad soyad boş olamaz.' });
    if (data.phone && !validPhone(data.phone)) return res.status(400).json({ message: 'Telefon numarası eksik görünüyor.' });
    const updated = await prisma.customerLead.update({ where: { id: lead.id }, data });
    res.json({ lead: updated, message: 'Kaydedildi.' });
  } catch (error) {
    console.error('updateLead error:', error);
    res.status(500).json({ message: 'Kaydedilemedi.' });
  }
};

export const deleteLead = async (req, res) => {
  const lead = await prisma.customerLead.findFirst({ where: { id: parseInt(req.params.id) || 0 }, select: { id: true } });
  if (!lead) return res.status(404).json({ message: 'Kayıt bulunamadı.' });
  await prisma.customerLead.delete({ where: { id: lead.id } });
  res.json({ message: 'Kişi silindi.' });
};

// Ekrandaki filtrelerle Excel
export const exportLeads = async (req, res) => {
  try {
    const rows = await withCreators(await prisma.customerLead.findMany({ where: listWhere(req.query), orderBy: { createdAt: 'desc' }, take: 50000 }));
    sendWorkbook(res, rows.map((l) => ({
      'Tarih': l.createdAt.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
      'Ad Soyad': l.name, 'Telefon': l.phone, 'E-posta': l.email, 'Şehir': l.city,
      'Kaynak': SOURCES[l.source] || l.source, 'Kampanya / Reklam': l.campaign, 'Talep': l.request,
      'Durum': STATUSES[l.status] || l.status, 'Not': l.note,
      'Kaydeden': l.viaForm ? 'Talep formu' : l.createdByName
    })), 'Müşteri Adayları', `musteri-adaylari-${new Date().toISOString().slice(0, 10)}.xlsx`, [17, 24, 15, 24, 14, 12, 22, 50, 13, 40, 16]);
  } catch (error) {
    console.error('exportLeads error:', error);
    res.status(500).json({ message: 'Excel oluşturulamadı.' });
  }
};

const FORM_SOURCES = { instagram: 'INSTAGRAM', ig: 'INSTAGRAM', whatsapp: 'WHATSAPP', wa: 'WHATSAPP', facebook: 'FACEBOOK', fb: 'FACEBOOK' };
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

/**
 * Talep formu (/talep, oturum gerektirmez). Bağlantıdaki ?k=instagram|whatsapp|facebook kaynağı,
 * ?kampanya= (ya da utm_campaign) reklam adını belirler. Aynı numara 24 saat içinde tekrar gönderirse
 * yeni kayıt açılmaz, talep mevcut kayda eklenir.
 */
export const submitLeadForm = async (req, res) => {
  try {
    const b = req.body || {};
    if (b.website) return res.status(201).json({ message: 'Talebiniz alındı.' }); // bot tuzağı
    const name = str(b.name, 120);
    const phone = normalizePhone(b.phone).slice(0, 20);
    if (!name) return res.status(400).json({ message: 'Adınızı yazın.' });
    if (!validPhone(phone)) return res.status(400).json({ message: 'Geçerli bir telefon numarası yazın.' });
    if (!b.kvkkConsent) return res.status(400).json({ message: 'Kişisel verilerin işlenmesine onay vermeniz gerekiyor.' });

    const utm = Object.fromEntries(UTM_KEYS.map((k) => [k, str(b.utm?.[k], 100)]).filter(([, v]) => v));
    const source = FORM_SOURCES[String(b.k || utm.utm_source || '').toLowerCase()] || 'FORM';
    const campaign = str(b.campaign || utm.utm_campaign, 100);
    const request = str(b.request, 2000);
    const city = str(b.city, 60);

    const recent = await prisma.customerLead.findFirst({
      where: { phone, viaForm: true, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      orderBy: { createdAt: 'desc' }
    });
    if (recent) {
      const merged = [recent.request, request].filter(Boolean).join('\n— ');
      await prisma.customerLead.update({ where: { id: recent.id }, data: { request: merged.slice(0, 4000), name, ...(city && { city }), status: recent.status === 'LOST' ? 'NEW' : recent.status } });
    } else {
      await prisma.customerLead.create({ data: { name, phone, city, request, source, campaign, viaForm: true, utm: Object.keys(utm).length ? utm : undefined } });
      safeNotify(notifyAdmins({
        type: 'LEAD', title: 'Yeni müşteri adayı',
        message: `${name} (${phone}) ${SOURCES[source] === 'Talep formu' ? 'talep formunu doldurdu' : `${SOURCES[source]} üzerinden talep bıraktı`}.`,
        link: '/admin/leads'
      }));
    }
    res.status(201).json({ message: 'Talebiniz alındı. En kısa sürede sizi arayacağız.' });
  } catch (error) {
    console.error('submitLeadForm error:', error);
    res.status(400).json({ message: 'Talebiniz gönderilemedi. Lütfen tekrar deneyin.' });
  }
};
