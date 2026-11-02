import prisma, { currentTenantId } from '../utils/prisma.js';
import { getSettingsMap, SETTING_DEFAULTS, portalSettings } from '../services/settingsService.js';
import { getExchangeRates } from '../services/exchangeRateService.js';

export const getSettings = async (req, res) => {
  try {
    res.json(await getSettingsMap());
  } catch (error) {
    res.status(500).json({ message: 'Ayarlar yüklenemedi.' });
  }
};

export const updateSetting = async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!Object.prototype.hasOwnProperty.call(SETTING_DEFAULTS, key)) {
      return res.status(400).json({ message: 'Bilinmeyen ayar anahtarı.' });
    }
    const setting = await prisma.setting.upsert({
      where: { tenantId_key: { tenantId: currentTenantId(), key } },
      update: { value: String(value) },
      create: { key, value: String(value) }
    });
    res.json(setting);
  } catch (error) {
    res.status(400).json({ message: 'Ayar güncellenemedi.' });
  }
};

export const getRates = async (req, res) => {
  const fx = await getExchangeRates();
  res.json(fx);
};

// Bayi portalı: teklif ve Gel-Al ayarları (tüm oturumlara açık)
export const getPortalSettings = async (req, res) => {
  res.json(portalSettings(await getSettingsMap(), req.tenant));
};
