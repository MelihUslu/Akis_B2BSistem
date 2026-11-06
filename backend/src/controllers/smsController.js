import prisma, { basePrisma } from '../utils/prisma.js';
import { invalidateTenantCache } from '../middlewares/tenantMiddleware.js';
import { smsCreds, encryptSmsConfig, smsActive, normalizePhone, PhoneError, testSms, smsHeaders } from '../services/smsService.js';
import { SMS_TYPES, firmSmsTypes, typesFor } from '../services/notificationPrefs.js';
import { forgetTenantForMail } from '../services/notificationService.js';
import { OPTOUT_KEY, optOutText } from '../services/bulkSmsService.js';

// Seçilebilir türler (ad ve açıklamayla): bayiye ve ekibe giden ayrı listeler
const typeOptions = () => ({
  dealer: typesFor('BAYI').filter((t) => SMS_TYPES.dealer.includes(t.id)),
  staff: typesFor('ADMIN').filter((t) => SMS_TYPES.staff.includes(t.id))
});

// Ekranda yazılmayan şifre kayıtlıdan alınır
const mergedCreds = (req) => {
  const old = smsCreds(req.tenant) || {};
  return {
    username: String(req.body.username ?? old.username ?? '').trim(),
    password: req.body.password ? String(req.body.password) : old.password,
    header: String(req.body.header ?? old.header ?? '').trim()
  };
};

const fail = (res, error) => res.status(400).json({ message: error.message || 'İşlem başarısız.' });

export const getSmsSettings = async (req, res) => {
  const creds = smsCreds(req.tenant);
  const since = new Date(Date.now() - 14 * 864e5);
  const [calls, lastError, phones, optOut] = await Promise.all([
    basePrisma.externalCall.findMany({ where: { tenantId: req.tenant.id, service: 'Netgsm', operation: { startsWith: 'SMS' }, createdAt: { gte: since } }, select: { ok: true, operation: true } }),
    basePrisma.externalCall.findFirst({ where: { tenantId: req.tenant.id, service: 'Netgsm', ok: false }, orderBy: { createdAt: 'desc' }, select: { error: true, createdAt: true } }),
    prisma.user.groupBy({ by: ['role'], where: { isActive: true, phone: { not: null } }, _count: true }),
    optOutText(req.tenant.id)
  ]);
  const count = (c) => parseInt(/\((\d+)\)/.exec(c.operation || '')?.[1]) || 1; // "SMS (3)" → 3 mesaj
  res.json({
    enabled: Boolean(req.tenant.smsEnabled),
    active: smsActive(req.tenant),
    configured: Boolean(creds),
    username: creds?.username || '',
    header: creds?.header || '',
    hasPassword: Boolean(creds?.password),
    types: firmSmsTypes(req.tenant),
    optOut, // Ticari toplu SMS'in sonuna eklenen ret metni
    options: typeOptions(),
    stats: {
      sent: calls.filter((c) => c.ok).reduce((s, c) => s + count(c), 0),
      failed: calls.filter((c) => !c.ok).reduce((s, c) => s + count(c), 0),
      lastError: lastError ? { message: lastError.error, at: lastError.createdAt } : null
    },
    phones: { dealer: phones.find((p) => p.role === 'BAYI')?._count || 0, staff: phones.find((p) => p.role === 'ADMIN')?._count || 0 }
  });
};

export const saveSmsSettings = async (req, res) => {
  // Bağlantıyı tamamen kaldır (bilgiler silinir)
  if (req.body.disconnect === true) {
    await prisma.tenant.update({ where: { id: req.tenant.id }, data: { smsEnabled: false, smsProvider: null, smsConfigEnc: null } });
  } else {
    const creds = mergedCreds(req);
    const enabled = req.body.enabled === true;
    if ((enabled || creds.username || creds.password) && (!creds.username || !creds.password || !creds.header)) {
      return res.status(400).json({ message: 'Netgsm kullanıcı adı, şifre ve gönderici adı (SMS başlığı) gerekli.' });
    }
    const types = Object.fromEntries(Object.entries(SMS_TYPES).map(([k, allowed]) => [k, (Array.isArray(req.body.types?.[k]) ? req.body.types[k] : []).filter((t) => allowed.includes(t))]));
    await prisma.tenant.update({
      where: { id: req.tenant.id },
      data: {
        smsEnabled: enabled,
        smsTypes: types,
        ...(creds.username && { smsProvider: 'NETGSM', smsConfigEnc: encryptSmsConfig(creds) })
      }
    });
  }
  // Ticari toplu SMS'in ret metni (ör. "Ret için RET yazıp 3XXX'e gönderin. B0XX")
  if (typeof req.body.optOutText === 'string') {
    const value = req.body.optOutText.trim().slice(0, 160);
    await prisma.setting.upsert({ where: { tenantId_key: { tenantId: req.tenant.id, key: OPTOUT_KEY } }, update: { value }, create: { key: OPTOUT_KEY, value } });
  }
  invalidateTenantCache(req.tenant.slug);
  forgetTenantForMail(req.tenant.id);
  res.json({ message: req.body.disconnect ? 'Netgsm bağlantısı kaldırıldı; SMS gönderilmez.' : req.body.enabled ? 'SMS bildirimleri açık.' : 'SMS ayarları kaydedildi; SMS bildirimleri kapalı.' });
};

// Hesaptaki onaylı gönderici adları (bilgileri doğrular)
export const listSmsHeaders = async (req, res) => {
  const creds = mergedCreds(req);
  if (!creds.username || !creds.password) return res.status(400).json({ message: 'Netgsm kullanıcı adı ve şifresini girin.' });
  try {
    const headers = await smsHeaders(creds);
    res.json({ headers, message: headers.length ? `Bağlantı başarılı: ${headers.length} gönderici adı bulundu.` : 'Bağlantı başarılı ama onaylı gönderici adı yok (Netgsm panelinden başlık alın).' });
  } catch (error) {
    fail(res, error);
  }
};

export const sendTestSms = async (req, res) => {
  const creds = mergedCreds(req);
  if (!creds.username || !creds.password || !creds.header) return res.status(400).json({ message: 'Kullanıcı adı, şifre ve gönderici adını girin.' });
  try {
    const phone = normalizePhone(req.body.phone);
    if (!phone) return res.status(400).json({ message: 'Deneme SMS\'inin gideceği cep telefonunu girin.' });
    await testSms(creds, phone, req.tenant.name);
    res.json({ message: `Deneme SMS'i ${phone} numarasına gönderildi.` });
  } catch (error) {
    if (error instanceof PhoneError) return res.status(400).json({ message: error.message });
    fail(res, error);
  }
};
