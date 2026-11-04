/**
 * UAT test verisi. seed.mjs bu kayıtları oluşturur, senaryolar aynı değerlerle çalışır.
 * Her senaryonun kendi bayisi ve ürünü vardır: bir senaryonun düşürdüğü stok ya da yazdığı borç diğerini etkilemez.
 */
export const TENANT = 'uat';
export const OTHER_TENANT = 'uat-diger';
export const PASSWORD = 'Uat12345!';

export const WEB_PORT = 5174;
export const API_PORT = 5002;
export const WEB = `http://${TENANT}.localhost:${WEB_PORT}`;
export const API = `http://localhost:${API_PORT}/api`;

export const ADMIN = { key: 'admin', email: 'yonetici@uat.test', name: 'Ayşe Yönetici' };
// Plasiyer (saha satış): yalnızca "saha" bayisinin sorumlusu
export const PLASIYER = { key: 'plasiyer', email: 'saha@uat.test', name: 'Murat Saha' };
// Yetkisi olmayan ekip üyesi (depo personeli): Personel Alanım'dan izin ve masraf talebi açar
export const STAFF = { key: 'personel', email: 'depo@uat.test', name: 'Deniz Depo' };

// Bayiler: key → oturum dosyası adı. netDiscount: tüm liste fiyatlarına uygulanan iskonto (%)
export const DEALERS = {
  siparis: { email: 'siparis@uat.test', company: 'Yıldız Hırdavat Ltd.', netDiscount: 10, riskLimit: 100000 },
  kismi: { email: 'kismi@uat.test', company: 'Ege Yapı Market', netDiscount: 0, riskLimit: 100000 },
  gelal: { email: 'gelal@uat.test', company: 'Kuzey İnşaat Malzemeleri', netDiscount: 0, riskLimit: 100000 },
  teklif: { email: 'teklif@uat.test', company: 'Marmara Teknik', netDiscount: 0, riskLimit: 100000 },
  limit: { email: 'limit@uat.test', company: 'Limitli Ticaret', netDiscount: 0, riskLimit: 1000 },
  hizli: { email: 'hizli@uat.test', company: 'Hızlı Yapı Ltd.', netDiscount: 0, riskLimit: 100000 },
  mobil: { email: 'mobil@uat.test', company: 'Mobil Hırdavat', netDiscount: 0, riskLimit: 100000 },
  saha: { email: 'saha-bayi@uat.test', company: 'Saha Hırdavat', netDiscount: 5, riskLimit: 100000, plasiyer: true },
  adina: { email: 'adina@uat.test', company: 'Telefonla Sipariş Ltd.', netDiscount: 0, riskLimit: 100000 },
  iptal: { email: 'iptal@uat.test', company: 'Vazgeçen Yapı', netDiscount: 0, riskLimit: 100000 },
  sevk: { email: 'sevk@uat.test', company: 'Parça Sevk Ticaret', netDiscount: 0, riskLimit: 100000 },
  hedef: { email: 'hedef@uat.test', company: 'Hedef Hırdavat', netDiscount: 0, riskLimit: 100000 },
  sepet: { email: 'sepet@uat.test', company: 'Çok Cihazlı Bayi', netDiscount: 0, riskLimit: 100000 }
};

// Başka bir firmanın bayisi: bu firmanın adresinden giriş yapamamalı
export const OTHER_DEALER = { email: 'bayi@uat-diger.test', company: 'Diğer Firma Bayisi' };

// Fiyatlar KDV hariç, KDV %20
export const PRODUCTS = {
  matkap: { sku: 'UAT-MATKAP', name: 'Darbeli Matkap 750W', price: 1000, stock: 50 },
  vida: { sku: 'UAT-VIDA', name: 'Sunta Vidası 4x40 Paket', price: 250, stock: 100 },
  pense: { sku: 'UAT-PENSE', name: 'İzoleli Pense 200 mm', price: 400, stock: 40 },
  gelal: { sku: 'UAT-GELAL', name: 'Su Terazisi 60 cm', price: 500, stock: 20 },
  tukendi: { sku: 'UAT-TUKENDI', name: 'Akülü Vidalama Seti', price: 600, stock: 0 },
  limit: { sku: 'UAT-LIMIT', name: 'Kırıcı Delici 1500W', price: 2000, stock: 10 },
  hizli1: { sku: 'UAT-HIZLI-1', name: 'Silikon Tabancası', price: 120, stock: 60 },
  hizli2: { sku: 'UAT-HIZLI-2', name: 'Maket Bıçağı 18 mm', price: 45, stock: 200 },
  mobil: { sku: 'UAT-MOBIL', name: 'Çelik Şerit Metre 5 m', price: 300, stock: 30 },
  saha: { sku: 'UAT-SAHA', name: 'Kombine Pense Seti', price: 400, stock: 40 },
  adina: { sku: 'UAT-ADINA', name: 'Tij Çubuğu M10', price: 80, stock: 300 },
  iptal: { sku: 'UAT-IPTAL', name: 'Boya Rulosu 25 cm', price: 90, stock: 100 },
  sevk1: { sku: 'UAT-SEVK-1', name: 'Kaynak Maskesi', price: 600, stock: 20 },
  sevk2: { sku: 'UAT-SEVK-2', name: 'Kaynak Eldiveni', price: 150, stock: 80 },
  hedef: { sku: 'UAT-HEDEF', name: 'Akülü Matkap 18V', price: 1500, stock: 30 },
  sepet: { sku: 'UAT-SEPET', name: 'Su Pompası 1 HP', price: 2500, stock: 10 }
};

export const PICKUP = { address: 'Merkez Depo — İkitelli OSB, Başakşehir/İstanbul', hours: 'Hafta içi 08:30–18:00' };
