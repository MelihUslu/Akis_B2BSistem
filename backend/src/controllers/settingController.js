import prisma from '../utils/prisma.js';

export const getSettings = async (req, res) => {
  try {
    const settings = await prisma.setting.findMany();
    // Key-value objesine dönüştür
    const settingsMap = settings.reduce((acc, s) => {
      acc[s.key] = s.value;
      return acc;
    }, {});
    res.json(settingsMap);
  } catch (error) {
    res.status(500).json({ message: 'Ayarlar yüklenemedi.' });
  }
};

export const updateSetting = async (req, res) => {
  try {
    const { key, value } = req.body;
    const setting = await prisma.setting.upsert({
      where: { key },
      update: { value: String(value) },
      create: { key, value: String(value) }
    });
    res.json(setting);
  } catch (error) {
    res.status(400).json({ message: 'Ayar güncellenemedi.' });
  }
};
