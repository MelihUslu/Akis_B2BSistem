// Tanıtım sayfası içerikleri. Yalnızca ürünün gerçekte yaptıkları yazılır (uydurma rakam / yorum yok).

export const PROBLEMS = [
  ['WhatsApp ve telefonla gelen siparişler', 'Mesajlar kayboluyor, yanlış ürün yazılıyor, mesai dışında kimse yok.'],
  ['Her bayiye ayrı fiyat listesi', 'Excel listeleri güncel değil; yanlış iskonto faturaya kadar gidiyor.'],
  ['Risk limiti takibi elle', 'Borcu limiti aşan bayiye mal çıkıyor, fark edildiğinde iş işten geçmiş.'],
  ['Stok sorusu için arama', '"Bu ürün var mı?" sorusu satış ekibinin gününü yiyor.'],
  ['Tahsilat ve ekstre gönderimi', 'Vadeler takip edilemiyor, mutabakat için PDF\'ler e-postayla gidip geliyor.'],
];

export const SOLUTIONS = [
  ['Bayiler 7/24 portaldan sipariş verir', 'Sipariş eksiksiz, ürün kodu ve miktarıyla düşer; siz onaylarsınız.'],
  ['Her bayi kendi fiyatını görür', 'Grup iskontosu, özel ve kademeli fiyat, miktar indirimi otomatik uygulanır.'],
  ['Limit aşımında sipariş durur', 'Bakiye, vade ve kullanılabilir limit her siparişte kontrol edilir.'],
  ['Stok portalda görünür', 'Bayi stoğu görür; tükenen ürüne "gelince haber ver" der.'],
  ['Cari hesap bayinin cebinde', 'Ekstre, mutabakat, kartla ödeme ve vade hatırlatması portalda.'],
];

export const SECTORS = [
  ['🔩', 'Hırdavat ve nalbur'], ['🧱', 'Yapı market'], ['📦', 'Ambalaj ve sarf'], ['🥫', 'Gıda toptan'],
  ['🧴', 'Kozmetik ve temizlik'], ['🚗', 'Otomotiv yedek parça'], ['💡', 'Elektrik malzemesi'], ['🩺', 'Medikal sarf'],
  ['👕', 'Tekstil ve iş elbisesi'], ['🖊️', 'Kırtasiye'], ['🌱', 'Tarım ve bahçe'], ['🔧', 'Endüstriyel ekipman'],
];

export const ROLES = [
  { who: 'Firma sahibi', icon: 'owner', points: ['Ciro, sipariş ve tahsilatı tek ekrandan izler', 'Kim ne kadar borçlu, kim limitte, anında görür', 'Satış ekibinden bağımsız 7/24 sipariş alır'] },
  { who: 'Satış ekibi', icon: 'sales', points: ['Telefonda sipariş yazmak yerine onaylar', 'Yapay zekâ ile dakikalar içinde teklif hazırlar', 'Plasiyer primleri otomatik hesaplanır'] },
  { who: 'Muhasebe', icon: 'finance', points: ['Siparişler cari hesaba kendiliğinden işlenir', 'Ekstre ve mutabakat bağlantıyla gönderilir', 'Gecikmiş alacaklar yaşlandırma raporunda'] },
  { who: 'Bayileriniz', icon: 'dealer', points: ['Kendi fiyatlarıyla, istediği saatte sipariş verir', 'Sipariş, kargo ve bakiyesini telefondan takip eder', 'Borcunu kartla öder, ekstresini indirir'] },
];

export const FEATURE_GROUPS = [
  { title: 'Katalog ve fiyat', icon: 'catalog', items: ['Varyantlı ürünler (beden, renk, gramaj…)', 'Bayi grubuna göre iskonto', 'Bayiye özel ve kademeli fiyat', 'Miktar indirimi, kupon ve kampanyalar', 'Minimum sipariş ve koli katsayısı', 'USD / EUR fiyat, TCMB kuruyla çevrim', 'Excel ile toplu ürün, fiyat ve stok yükleme'] },
  { title: 'Sipariş ve lojistik', icon: 'order', items: ['Hızlı sipariş: SKU listesi ya da Excel\'den yapıştır', 'Favoriler, sık alınanlar, sipariş şablonları', 'Kalem bazında onay ve kısmi onay', 'Depo ve stok takibi, stok bildirimi', 'Yurtiçi Kargo ile gönderi ve etiket', 'Fotoğraflı iade / değişim süreci'] },
  { title: 'Finans ve cari', icon: 'finance', items: ['Bayi bakiyesi, risk limiti ve vade', 'Müşteri ve tedarikçi cari hesapları', 'Ekstre, paylaşım bağlantısı ve mutabakat', 'Sanal POS ile kartla tahsilat (iyzico, PayTR)', 'Gecikmiş alacaklar (yaşlandırma)', 'Dövizli cari hesap (USD, EUR)', 'Paraşüt ile e-fatura / e-arşiv'] },
  { title: 'Satış ve teklif', icon: 'sales', items: ['Yapay zekâ ile serbest metinden teklif', 'Teklif revizyonu, onay ve paylaşım bağlantısı', 'Onaylanan teklif tek tıkla siparişe döner', 'Bayi başvuru formu ve onay akışı', 'Plasiyer (satış temsilcisi) ve prim takibi', 'Satış, ürün ve bayi raporları'] },
  { title: 'Entegrasyon', icon: 'erp', items: ['REST API: ürün, stok, fiyat, cari, sipariş', 'Webhook ile anlık sipariş bildirimi', 'Test (sandbox) anahtarı ile güvenli deneme', 'OpenAPI dokümanı', 'Excel içe / dışa aktarma her ekranda'] },
  { title: 'Güvenlik ve yönetim', icon: 'security', items: ['Her firmanın verisi tamamen ayrı', 'Ekip üyelerine ekran bazında yetki', 'İki aşamalı doğrulama (2FA)', 'Kim ne yaptı: işlem kaydı', 'Günlük otomatik yedekleme', 'KVKK\'ya uygun veri silme', 'Türkçe ve İngilizce bayi portalı'] },
];

export const COMPARISON = {
  cols: ['Excel + WhatsApp', 'Genel e-ticaret altyapısı', 'B2B portal (bu ürün)'],
  rows: [
    ['Bayiye özel fiyat ve iskonto', false, 'kısmen', true],
    ['Risk limiti ve vade kontrolü', false, false, true],
    ['Cari ekstre ve mutabakat', 'elle', false, true],
    ['Kalem bazında sipariş onayı', false, false, true],
    ['7/24 sipariş', false, true, true],
    ['ERP entegrasyonu (API)', false, 'kısmen', true],
    ['Yapay zekâ ile teklif', false, false, true],
    ['Kurulum süresi', 'yok', 'haftalar', 'dakikalar'],
  ],
};

export const FAQ = [
  ['Kurulum ne kadar sürer? Teknik bilgi gerekir mi?', 'Hesabınız birkaç dakikada açılır. Ürünlerinizi hazır şablonla Excel\'den yüklersiniz, bayilerinizi eklersiniz; teknik bilgi gerekmez.'],
  ['Bayilerim portala nasıl giriş yapar?', 'Her firmanın kendi adresi vardır (firmaniz.{domain}). Bayileriniz bu adresten e-posta ve şifreyle girer; telefonlarına uygulama olarak da yükleyebilir.'],
  ['Her bayiye farklı fiyat verebilir miyim?', 'Evet. Bayi gruplarına iskonto, tek tek bayilere özel ve kademeli fiyat, miktar indirimi ve kampanyalar tanımlayabilirsiniz. Bayi yalnızca kendi fiyatını görür.'],
  ['Risk limitini aşan bayi sipariş verebilir mi?', 'Siz izin vermedikçe hayır. Sipariş anında bakiye, onay bekleyen siparişler ve kullanılabilir limit kontrol edilir.'],
  ['Kendi alan adımı ve logomu kullanabilir miyim?', 'Logonuz her pakette kullanılır. Paketiniz destekliyorsa b2b.firmaniz.com gibi kendi alan adınızı da bağlarsınız; sertifika otomatik alınır.'],
  ['ERP ya da muhasebe programımla çalışır mı?', 'REST API ve webhook ile ürün, stok, fiyat, cari bakiye ve siparişleri senkronlayabilirsiniz. E-fatura için Paraşüt entegrasyonu hazırdır.'],
  ['Bayilerim kartla ödeme yapabilir mi?', 'Evet. iyzico ya da PayTR hesabınızı bağladığınızda bayi borcunu kartla öder, tahsilat cari hesaba anında işlenir.'],
  ['Deneme süresi bitince ne olur?', 'Deneme bitmeden bir paket seçerseniz kesintisiz devam edersiniz. Seçmezseniz verileriniz saklanır, bayi girişleri paket seçilene kadar durur.'],
  ['Verilerim güvende mi?', 'Her firmanın verisi ayrıdır, başka firma göremez. Veritabanı her gün yedeklenir. Hesabınızı kapattığınızda verileriniz KVKK\'ya uygun şekilde silinir.'],
  ['Takıldığımda destek alabilir miyim?', 'Panelden destek talebi açarsınız; acil talepler için hedef yanıt süremiz 2 saat. Yardım merkezinde adım adım rehberler de var.'],
];
