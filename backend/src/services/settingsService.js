import prisma from '../utils/prisma.js';

// Ayar tablosunda değer yoksa kullanılacak varsayılanlar
export const SETTING_DEFAULTS = {
  global_hide_price: 'false',
  qty_discount_threshold: '10', // Bu miktar ve üzerindeki kalemlere...
  qty_discount_rate: '5',       // ...yüzde bu kadar ekstra indirim uygulanır
  group_discount_STANDART: '0',
  group_discount_GOLD: '0',
  group_discount_VIP: '0',
  plasiyer_rate: '5',           // Plasiyer primi (% - KDV hariç tutar üzerinden)
  due_reminder_days: '3',       // Vadeye kaç gün kala hatırlatma gönderilir
  usd_try: '',                  // TCMB'ye ulaşılamazsa kullanılacak manuel kurlar
  eur_try: ''
};

export const getSettingsMap = async () => {
  const rows = await prisma.setting.findMany();
  const map = { ...SETTING_DEFAULTS };
  for (const r of rows) map[r.key] = r.value;
  return map;
};

export const num = (value, fallback = 0) => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
};
