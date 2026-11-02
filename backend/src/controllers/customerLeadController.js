import prisma from '../utils/prisma.js';
import { notifyAdmins, safeNotify } from '../services/notificationService.js';
import { sendWorkbook } from './partnerController.js';
import { randomBytes } from 'node:crypto';

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
    // Formdaki ek sorular ayrı sütun olur (Talep'ten sonra, ilk görüldüğü sırayla)
    const extra = [...new Set(rows.flatMap((l) => (Array.isArray(l.answers) ? l.answers.map((a) => a.label) : [])))];
    sendWorkbook(res, rows.map((l) => ({
      'Tarih': l.createdAt.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
      'Ad Soyad': l.name, 'Telefon': l.phone, 'E-posta': l.email, 'Şehir': l.city,
      'Kaynak': SOURCES[l.source] || l.source, 'Kampanya / Reklam': l.campaign, 'Talep': l.request,
      ...Object.fromEntries(extra.map((label) => [label, (Array.isArray(l.answers) ? l.answers.find((x) => x.label === label)?.value : '') || ''])),
      'Durum': STATUSES[l.status] || l.status, 'Not': l.note,
      'Kaydeden': l.viaForm ? 'Talep formu' : l.createdByName
    })), 'Müşteri Adayları', `musteri-adaylari-${new Date().toISOString().slice(0, 10)}.xlsx`, [17, 24, 15, 24, 14, 12, 22, 50, ...extra.map(() => 20), 13, 40, 16]);
  } catch (error) {
    console.error('exportLeads error:', error);
    res.status(500).json({ message: 'Excel oluşturulamadı.' });
  }
};

// ─── Talep formu ayarları (firma panelden düzenler; Setting tablosunda "lead_form" anahtarıyla JSON) ─────────

const FORM_KEY = 'lead_form';
const FIELD_TYPES = ['text', 'textarea', 'number', 'select'];
const MAX_CUSTOM = 12;

// Hazır alanlar: ad ve telefon her zaman açık ve zorunlu; diğerleri gizlenebilir / zorunlu yapılabilir
const BUILTIN = {
  name: { label: 'Ad Soyad', type: 'text', locked: true },
  phone: { label: 'Telefon', type: 'tel', locked: true, placeholder: '05xx xxx xx xx' },
  email: { label: 'E-posta', type: 'email' },
  city: { label: 'Şehir', type: 'text' },
  request: { label: 'Ne istiyorsunuz?', type: 'textarea', placeholder: 'Ürün, adet, sorunuz…' }
};

export const DEFAULT_FORM = {
  title: 'Bilgilerinizi bırakın, sizi arayalım',
  description: 'Fiyat, stok ve sipariş için ekibimiz en kısa sürede size dönecek.',
  buttonText: 'Beni arayın',
  successMessage: 'Talebiniz alındı. En kısa sürede sizi arayacağız.',
  fields: [
    { key: 'name', enabled: true, required: true, label: BUILTIN.name.label, placeholder: '' },
    { key: 'phone', enabled: true, required: true, label: BUILTIN.phone.label, placeholder: BUILTIN.phone.placeholder },
    { key: 'email', enabled: false, required: false, label: BUILTIN.email.label, placeholder: '' },
    { key: 'city', enabled: true, required: false, label: BUILTIN.city.label, placeholder: '' },
    { key: 'request', enabled: true, required: false, label: BUILTIN.request.label, placeholder: BUILTIN.request.placeholder }
  ]
};

// Gelen ayarı temizler: bilinmeyen alanlar atılır, hazır alanlar eksikse eklenir, ad/telefon kilitli kalır
export const normalizeForm = (raw) => {
  const r = raw && typeof raw === 'object' ? raw : {};
  const text = (v, def, max) => (str(v, max) || def);
  const seen = new Set();
  const fields = [];
  let customCount = 0;
  for (const f of Array.isArray(r.fields) ? r.fields : []) {
    if (!f || typeof f !== 'object') continue;
    if (BUILTIN[f.key]) {
      if (seen.has(f.key)) continue;
      seen.add(f.key);
      const b = BUILTIN[f.key];
      fields.push({
        key: f.key, enabled: b.locked ? true : Boolean(f.enabled), required: b.locked ? true : Boolean(f.required) && Boolean(f.enabled),
        label: text(f.label, b.label, 80), placeholder: str(f.placeholder, 120)
      });
    } else if (customCount < MAX_CUSTOM) {
      const label = str(f.label, 80);
      if (!label) continue;
      const key = /^c_[a-z0-9]{6,12}$/.test(f.key) && !seen.has(f.key) ? f.key : `c_${randomBytes(4).toString('hex')}`;
      const type = FIELD_TYPES.includes(f.type) ? f.type : 'text';
      const options = type === 'select'
        ? [...new Set((Array.isArray(f.options) ? f.options : String(f.options || '').split(',')).map((o) => str(o, 60)).filter(Boolean))].slice(0, 30)
        : [];
      if (type === 'select' && options.length < 2) continue;
      seen.add(key);
      customCount += 1;
      fields.push({ key, custom: true, type, enabled: f.enabled !== false, required: Boolean(f.required), label, placeholder: str(f.placeholder, 120), options });
    }
  }
  for (const d of DEFAULT_FORM.fields) if (!seen.has(d.key)) fields.push({ ...d });
  return {
    title: text(r.title, DEFAULT_FORM.title, 120),
    description: str(r.description ?? DEFAULT_FORM.description, 400),
    buttonText: text(r.buttonText, DEFAULT_FORM.buttonText, 40),
    successMessage: text(r.successMessage, DEFAULT_FORM.successMessage, 300),
    fields
  };
};

const loadForm = async () => {
  const row = await prisma.setting.findFirst({ where: { key: FORM_KEY } });
  try { return normalizeForm(row ? JSON.parse(row.value) : DEFAULT_FORM); } catch { return normalizeForm(DEFAULT_FORM); }
};

// Formda gösterilecek hâli (hazır alanların türü eklenir)
const publicForm = (form) => ({
  ...form,
  fields: form.fields.filter((f) => f.enabled).map((f) => ({ ...f, type: f.custom ? f.type : BUILTIN[f.key].type }))
});

export const getFormConfig = async (req, res) => {
  res.json({ form: await loadForm(), defaults: normalizeForm(DEFAULT_FORM), maxCustom: MAX_CUSTOM });
};

export const saveFormConfig = async (req, res) => {
  try {
    const form = normalizeForm(req.body);
    const value = JSON.stringify(form);
    await prisma.setting.upsert({ where: { tenantId_key: { tenantId: req.tenant.id, key: FORM_KEY } }, update: { value }, create: { key: FORM_KEY, value } });
    res.json({ form, message: 'Form kaydedildi.' });
  } catch (error) {
    console.error('saveFormConfig error:', error);
    res.status(500).json({ message: 'Form kaydedilemedi.' });
  }
};

// Herkese açık: formun başlığı ve görünen alanları
export const getPublicForm = async (req, res) => {
  res.json(publicForm(await loadForm()));
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
    const form = await loadForm();
    if (b.website) return res.status(201).json({ message: form.successMessage }); // bot tuzağı
    const fields = form.fields.filter((f) => f.enabled);
    const missing = fields.find((f) => f.required && !str(b[f.key], 2000));
    if (missing) return res.status(400).json({ message: `"${missing.label}" alanını doldurun.` });

    const name = str(b.name, 120);
    const phone = normalizePhone(b.phone).slice(0, 20);
    if (!validPhone(phone)) return res.status(400).json({ message: 'Geçerli bir telefon numarası yazın.' });
    const on = (key) => fields.some((f) => f.key === key);
    const email = on('email') ? str(b.email, 120).toLowerCase() : '';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'Geçerli bir e-posta yazın.' });
    if (!b.kvkkConsent) return res.status(400).json({ message: 'Kişisel verilerin işlenmesine onay vermeniz gerekiyor.' });

    // Ek sorular gönderildiği hâliyle (etiketiyle) saklanır; seçenek listesi dışındaki değer kabul edilmez
    const answers = [];
    for (const f of fields.filter((x) => x.custom)) {
      let value = str(b[f.key], f.type === 'textarea' ? 2000 : 300);
      if (!value) continue;
      if (f.type === 'select' && !f.options.includes(value)) return res.status(400).json({ message: `"${f.label}" için listeden seçim yapın.` });
      if (f.type === 'number') {
        const n = Number(value.replace(',', '.'));
        if (!Number.isFinite(n)) return res.status(400).json({ message: `"${f.label}" bir sayı olmalı.` });
        value = String(n);
      }
      answers.push({ label: f.label, value });
    }

    const utm = Object.fromEntries(UTM_KEYS.map((k) => [k, str(b.utm?.[k], 100)]).filter(([, v]) => v));
    const source = FORM_SOURCES[String(b.k || utm.utm_source || '').toLowerCase()] || 'FORM';
    const campaign = str(b.campaign || utm.utm_campaign, 100);
    const request = on('request') ? str(b.request, 2000) : '';
    const city = on('city') ? str(b.city, 60) : '';

    const recent = await prisma.customerLead.findFirst({
      where: { phone, viaForm: true, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      orderBy: { createdAt: 'desc' }
    });
    if (recent) {
      const merged = [recent.request, request].filter(Boolean).join('\n— ');
      const prev = Array.isArray(recent.answers) ? recent.answers : [];
      await prisma.customerLead.update({
        where: { id: recent.id },
        data: {
          request: merged.slice(0, 4000), name, ...(city && { city }), ...(email && { email }),
          ...(answers.length && { answers: [...prev.filter((a) => !answers.some((n) => n.label === a.label)), ...answers] }),
          status: recent.status === 'LOST' ? 'NEW' : recent.status
        }
      });
    } else {
      await prisma.customerLead.create({ data: { name, phone, email, city, request, source, campaign, viaForm: true, answers: answers.length ? answers : undefined, utm: Object.keys(utm).length ? utm : undefined } });
      safeNotify(notifyAdmins({
        type: 'LEAD', title: 'Yeni müşteri adayı',
        message: `${name} (${phone}) ${SOURCES[source] === 'Talep formu' ? 'talep formunu doldurdu' : `${SOURCES[source]} üzerinden talep bıraktı`}.`,
        link: '/admin/leads'
      }));
    }
    res.status(201).json({ message: form.successMessage });
  } catch (error) {
    console.error('submitLeadForm error:', error);
    res.status(400).json({ message: 'Talebiniz gönderilemedi. Lütfen tekrar deneyin.' });
  }
};
