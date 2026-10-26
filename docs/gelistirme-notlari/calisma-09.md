Anladım, "Gravity Code" veya benzeri AI asistanları UI/UX konusunda yönlendirilmezse genellikle standart, sıkıcı (Bootstrap tarzı) formlar ve boğucu pop-up'lar üretir.

Tasarımı "Yeni Nesil SaaS", "Premium B2B" ve "Apple/Stripe Estetiği" seviyesine çekmek için çok net, CSS/UI odaklı bir yönlendirme yapmamız gerekiyor.

İşte tasarımı tamamen değiştirecek, premium hissi verecek o Arayüz (UI) Revizyon Promptu:

GELİŞTİRME PROMPTU: Premium UI/UX ve Yeni Nesil Tasarım Revizyonu
"Senden şu ana kadar yaptığın 'Bayi Ekleme', 'Kategori' ve diğer tüm yönetim sayfalarının arayüzlerini (UI/UX) tamamen baştan, premium bir SaaS (Software as a Service) standartlarında yeniden tasarlamanı istiyorum. Basit pop-up'ları, sıkıcı HTML formlarını ve eski nesil Bootstrap görünümünü tamamen sil.

Aşağıdaki 'Premium Design System' kurallarını React ve Tailwind CSS (veya benzeri modern bir kütüphane) kullanarak birebir uygula:

1. Modal ve Pop-up Yerine 'Slide-over (Drawer)' ve 'Soft Modal' Kullanımı
Kategori/Bayi Ekleme Ekranları: Ekranın ortasında beliren çirkin ve küçük pop-up'lar KULLANMA. Bunun yerine ekranın sağından kayarak açılan geniş ve ferah Slide-over (Drawer/Offcanvas) yapıları kullan. Arka plan hafifçe blurlaşsın (backdrop-blur-sm).

Uyarı ve Onaylar: Silme veya onaylama işlemleri için kaba alertler yerine, köşeleri yumuşatılmış (rounded-2xl), yumuşak gölgeli (shadow-2xl) ve merkezinde şık bir ikon (Lucide/Heroicons) barındıran Soft Modallar tasarla.

2. Form Elemanları ve Veri Girişi (Stripe Tarzı Estetik)
Input ve Select'ler: Klasik çerçeveli kutular yerine; arka planı çok açık gri (bg-gray-50), çerçevesi olmayan (border-none), sadece üzerine tıklandığında (focus) zarif bir mavi/mor halka (ring) beliren modern inputlar tasarla.

Etiketler (Labels): Inputların içindeki yazılar (placeholder) çok açık renkli olsun, asıl başlıklar (label) inputun hemen üstünde küçük ve kalın (text-sm font-semibold) dursun.

Butonlar: Dümdüz renkli butonlar yerine, içine hafif bir gradient (geçiş) eklenmiş, üzerine gelindiğinde (hover) çok hafif yukarı kalkan (transform -translate-y-0.5) ve parlayan (glow effect) pürüzsüz butonlar tasarla. Köşeler tam yuvarlak değil, hafif kavisli (rounded-xl) olsun.

3. Tablo ve Listeleme Görünümü (Veri Okunabilirliği)
Sıkıcı Çizgileri Kaldır: Tablolardaki sert siyah/gri ayırıcı çizgileri (border) kaldır. Bunun yerine satırların arasına çok geniş boşluklar (padding) koy ve satırların arka planını her bir satırda çok hafif değiştirerek (zebra-striping ama çok soft) ayrışmayı sağla.

Durum Etiketleri (Badges): 'Bekliyor', 'Aktif', 'Pasif' gibi durumları düz yazı olarak değil; köşeleri tam yuvarlak (rounded-full), içi çok saydam (örn: açık yeşil), yazısı ise koyu (örn: koyu yeşil) renkli zarif hap biçimli etiketler (Pill Badges) şeklinde göster.

Satır İçi Aksiyonlar: Tablonun sonundaki 'Düzenle/Sil' butonları her zaman görünmesin, sadece mouse o satırın üzerine geldiğinde (hover state) zarif bir şekilde beliren şık ikonlar (Edit, Trash, Eye) olarak tasarla.

4. Genel Atmosfer ve Beyaz Alan (Whitespace)
Sayfaya nefes aldır. Bileşenler (kutular, formlar, tablolar) birbirine yapışık olmasın. Geniş Margin (dış boşluk) ve Padding (iç boşluk) kullan.

Arka planı dümdüz beyaz yapma; sayfa zemini çok açık, huzurlu bir gri (bg-slate-50 veya bg-gray-50) olsun, ancak veri tabloları ve form kutuları tam beyaz (bg-white) renkte ve çok hafif, geniş bir gölgeye (soft shadow) sahip kartlar (Cards) içinde yüzüyormuş gibi dursun.

Lütfen kodlarını bu premium vizyona göre güncelle ve sistemin arayüzünü sıradan bir web sitesinden, üst düzey bir kurumsal uygulamaya dönüştür."