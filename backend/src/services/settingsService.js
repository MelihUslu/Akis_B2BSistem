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
  quote_discount_limit: '10',   // Teklifte onaysız verilebilecek en yüksek ek iskonto (%)
  quote_valid_days: '15',       // Yeni teklifin varsayılan geçerlilik süresi (gün)
  quote_payment_terms: '',      // Yeni teklife önerilen ödeme / teslimat koşulları
  quote_delivery_terms: '',
  quote_out_of_stock: 'false', // Stokta olmayan ürün için bayi teklif talebi açabilir
  pickup_enabled: 'false',      // Gel-Al teslimat seçeneği
  pickup_address: '',           // Teslim alma adresi (boşsa firma adresi)
  pickup_hours: '',             // Teslim alma saatleri (bayiye bilgi, örn. "Hafta içi 09:00–18:00")
  pickup_lead_hours: '2',       // Teslim alma zamanı en erken kaç saat sonrası seçilebilir
  shipping_fee: '0',            // Kargo ücreti (KDV hariç TL; 0 = kargo ücreti alınmaz)
  shipping_free_over: '0',      // Bu KDV hariç sepet tutarı ve üstünde kargo ücretsiz (0 = eşik yok)
  auto_approve: 'false',        // Limiti yeten, stoktaki cari hesaplı siparişler otomatik onaylansın
  auto_approve_max: '0',        // Otomatik onayın üst sınırı (KDV dahil TL; 0 = sınırsız)
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

export const flag = (value) => String(value) === 'true';

// Bayi portalının bilmesi gereken sipariş / teslimat ayarları
export const portalSettings = (map, tenant) => ({
  quoteOutOfStock: flag(map.quote_out_of_stock),
  pickup: {
    enabled: flag(map.pickup_enabled),
    address: map.pickup_address || tenant?.address || '',
    hours: map.pickup_hours || '',
    leadHours: Math.max(0, num(map.pickup_lead_hours, 2))
  },
  shipping: { fee: Math.max(0, num(map.shipping_fee, 0)), freeOver: Math.max(0, num(map.shipping_free_over, 0)) }
});
