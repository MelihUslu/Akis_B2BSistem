import prisma from '../utils/prisma.js';
import { invalidateTenantCache } from '../middlewares/tenantMiddleware.js';
import { CARGO_PROVIDERS, cargoCreds, encryptCargoConfig, testCargo, createShipmentForOrder, syncShipment, cancelShipmentForOrder } from '../services/cargoService.js';

export const getCargoSettings = async (req, res) => {
  const creds = cargoCreds(req.tenant);
  res.json({ provider: req.tenant.cargoProvider || null, mode: req.tenant.cargoMode || 'TEST', configured: Boolean(creds), username: creds?.username || '', hasPassword: Boolean(creds?.password) });
};

const mergedCreds = (req) => {
  const old = cargoCreds(req.tenant) || {};
  return {
    username: String(req.body.username ?? old.username ?? '').trim(),
    password: req.body.password ? String(req.body.password) : old.password,
    mode: req.body.mode === 'LIVE' ? 'LIVE' : 'TEST'
  };
};

export const saveCargoSettings = async (req, res) => {
  const provider = req.body.provider || null;
  if (provider && !CARGO_PROVIDERS.includes(provider)) return res.status(400).json({ message: 'Desteklenmeyen kargo firması.' });
  const data = { cargoProvider: provider, cargoMode: req.body.mode === 'LIVE' ? 'LIVE' : 'TEST', cargoConfigEnc: null };
  if (provider) {
    const creds = mergedCreds(req);
    if (!creds.username || !creds.password) return res.status(400).json({ message: 'Web servis kullanıcı adı ve şifresi gerekli.' });
    data.cargoConfigEnc = encryptCargoConfig({ username: creds.username, password: creds.password });
  }
  await prisma.tenant.update({ where: { id: req.tenant.id }, data });
  invalidateTenantCache(req.tenant.slug);
  res.json({ message: provider ? 'Kargo ayarları kaydedildi.' : 'Kargo entegrasyonu kapatıldı.' });
};

export const testCargoSettings = async (req, res) => {
  const creds = mergedCreds(req);
  if (!creds.username || !creds.password) return res.status(400).json({ message: 'Kullanıcı adı ve şifre girin.' });
  try {
    await testCargo(creds);
    res.json({ message: `Yurtiçi Kargo ${creds.mode === 'LIVE' ? 'canlı' : 'test'} servisine bağlanıldı.` });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const run = (fn, okMessage) => async (req, res) => {
  try {
    const order = await fn(req.tenant, parseInt(req.params.id));
    res.json({ message: okMessage(order), order });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const createShipment = run(createShipmentForOrder, (o) => `Gönderi oluşturuldu (${o.shipmentKey}). Etiketi yazdırıp pakete yapıştırın.`);
export const refreshShipment = run(syncShipment, (o) => (o?.trackingNumber ? `Takip numarası: ${o.trackingNumber}` : 'Kargo henüz teslim alınmamış.'));
export const cancelShipment = run(cancelShipmentForOrder, () => 'Gönderi iptal edildi.');
