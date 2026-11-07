import prisma from '../utils/prisma.js';
import { encrypt } from '../utils/secretBox.js';
import * as iyzico from '../services/iyzicoService.js';
import * as paytr from '../services/paytrService.js';
import { API_PUBLIC_URL, tenantUrl, tenantPortalUrl } from '../config.js';
import { tenantPosCreds, INSTALLMENT_OPTIONS } from '../services/tenantPosService.js';
import { tenantAccess, invalidateTenantCache } from '../middlewares/tenantMiddleware.js';
import { googleEnabled } from '../services/googleAuth.js';
import { hrEnabled } from '../services/hrService.js';

// Giriş ekranı için marka bilgisi (oturum gerektirmez)
export const getPublicTenant = async (req, res) => {
  const t = req.tenant;
  // Firmada açık modüller (menüler buna göre görünür; uçlar ayrıca sunucuda kontrol edilir)
  const hr = await hrEnabled().catch(() => false);
  const access = tenantAccess(t);
  res.json({
    name: t.name,
    slug: t.slug,
    logoUrl: t.logoUrl,
    phone: t.phone,
    contactEmail: t.contactEmail,
    address: t.address,
    taxNumber: t.taxNumber,
    taxOffice: t.taxOffice,
    access: { active: access.active, reason: access.reason },
    googleLogin: googleEnabled(),
    modules: { hr }
  });
};

// Kiracı yöneticisinin firma / marka ayarları
export const updateTenant = async (req, res) => {
  try {
    const { name, logoUrl, phone, contactEmail, address, taxNumber, taxOffice } = req.body;
    if (name !== undefined && String(name).trim().length < 2) {
      return res.status(400).json({ message: 'Firma adı en az 2 karakter olmalıdır.' });
    }
    const tenant = await prisma.tenant.update({
      where: { id: req.tenant.id },
      data: { name: name?.trim(), logoUrl: logoUrl === undefined ? undefined : (logoUrl || null), phone, contactEmail, address, taxNumber, taxOffice }
    });
    invalidateTenantCache(tenant.slug);
    res.json({ message: 'Firma bilgileri güncellendi.', tenant: { name: tenant.name, logoUrl: tenant.logoUrl } });
  } catch (error) {
    res.status(400).json({ message: 'Firma bilgileri güncellenemedi.' });
  }
};

// ─── Firmanın kendi sanal POS'u (bayilerden tahsilat) ────────────────────────

const mask = (v) => (v ? (v.length > 8 ? `${v.slice(0, 6)}…${v.slice(-4)}` : `${v.slice(0, 2)}…`) : null);

const posView = (t) => ({
  provider: t.posProvider,
  mode: t.posMode,
  apiKeyMasked: mask(t.posApiKey),
  configured: Boolean(t.posProvider && t.posApiKey && t.posSecretEnc),
  maxInstallment: t.posMaxInstallment,
  installmentMin: t.posInstallmentMin,
  installmentOptions: INSTALLMENT_OPTIONS,
  // PayTR: mağaza panelinde "Bildirim URL" olarak girilmesi gereken adres
  paytrNotifyUrl: `${API_PUBLIC_URL}/api/public/paytr/notify/${t.slug}`
});

export const getPosSettings = async (req, res) => {
  const tenant = await prisma.tenant.findUnique({ where: { id: req.tenant.id } });
  res.json(posView(tenant));
};

// Anahtarlar kaydedilmeden önce sağlayıcıda denenir
export const savePosSettings = async (req, res) => {
  try {
    const provider = req.body.provider === 'PAYTR' ? 'PAYTR' : 'IYZICO';
    const mode = req.body.mode === 'LIVE' ? 'LIVE' : 'SANDBOX';
    let apiKey;
    let secret;

    if (provider === 'IYZICO') {
      apiKey = String(req.body.apiKey || '').trim();
      const secretKey = String(req.body.secretKey || '').trim();
      if (!apiKey || !secretKey) return res.status(400).json({ message: 'API anahtarı ve gizli anahtar zorunludur.' });
      await iyzico.testCredentials({ apiKey, secretKey, baseUrl: mode === 'LIVE' ? iyzico.LIVE_URL : iyzico.SANDBOX_URL });
      secret = secretKey;
    } else {
      apiKey = String(req.body.merchantId || '').trim();
      const merchantKey = String(req.body.merchantKey || '').trim();
      const merchantSalt = String(req.body.merchantSalt || '').trim();
      if (!/^\d+$/.test(apiKey) || !merchantKey || !merchantSalt) {
        return res.status(400).json({ message: 'Mağaza no (sadece rakam), mağaza parola ve mağaza gizli anahtar zorunludur.' });
      }
      const back = `${tenantPortalUrl(req.tenant)}/bayi/finance`;
      await paytr.testCredentials({ merchantId: apiKey, merchantKey, merchantSalt }, { okUrl: back, failUrl: back });
      secret = JSON.stringify({ merchantKey, merchantSalt });
    }

    const tenant = await prisma.tenant.update({
      where: { id: req.tenant.id },
      data: { posProvider: provider, posMode: mode, posApiKey: apiKey, posSecretEnc: encrypt(secret) }
    });
    invalidateTenantCache(tenant.slug);
    const name = provider === 'PAYTR' ? 'PayTR' : 'iyzico';
    res.json({
      message: provider === 'PAYTR'
        ? `PayTR bağlantısı doğrulandı (${mode === 'LIVE' ? 'canlı' : 'test'} mod). Son adım: PayTR mağaza panelinde Bildirim URL olarak ${posView(tenant).paytrNotifyUrl} adresini girin.`
        : `${name} bağlantısı doğrulandı (${mode === 'LIVE' ? 'canlı' : 'test'} ortam). Bayileriniz artık kartla ödeme yapabilir.`,
      pos: posView(tenant)
    });
  } catch (error) {
    if (error instanceof iyzico.IyzicoError) return res.status(400).json({ message: `iyzico anahtarları doğrulanamadı: ${error.message}` });
    if (error instanceof paytr.PaytrError) return res.status(400).json({ message: `PayTR anahtarları doğrulanamadı: ${error.message}` });
    console.error('savePosSettings error:', error);
    res.status(400).json({ message: 'Sanal POS ayarları kaydedilemedi.' });
  }
};

// Taksit ayarı (anahtarlardan ayrı; anahtar yeniden girilmeden değişir)
export const savePosInstallments = async (req, res) => {
  const max = parseInt(req.body.maxInstallment);
  const min = req.body.installmentMin === '' || req.body.installmentMin == null ? 0 : Number(req.body.installmentMin);
  if (!INSTALLMENT_OPTIONS.includes(max)) return res.status(400).json({ message: `Taksit sayısı ${INSTALLMENT_OPTIONS.join(', ')} olabilir.` });
  if (!Number.isFinite(min) || min < 0 || min > 1_000_000) return res.status(400).json({ message: 'Taksit için en düşük tutar 0 ile 1.000.000 arasında olmalı.' });
  const tenant = await prisma.tenant.update({ where: { id: req.tenant.id }, data: { posMaxInstallment: max, posInstallmentMin: Math.round(min * 100) / 100 } });
  invalidateTenantCache(tenant.slug);
  res.json({ message: max > 1 ? `Bayileriniz ${max} taksite kadar ödeyebilir.` : 'Kartla ödeme tek çekim.', pos: posView(tenant) });
};

export const removePosSettings = async (req, res) => {
  const tenant = await prisma.tenant.update({ where: { id: req.tenant.id }, data: { posProvider: null, posApiKey: null, posSecretEnc: null } });
  invalidateTenantCache(tenant.slug);
  res.json({ message: 'Sanal POS bağlantısı kaldırıldı.', pos: posView(tenant) });
};

export { tenantPosCreds };
