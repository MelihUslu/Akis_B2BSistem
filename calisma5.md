"Mevcut sistemimizin üzerine şimdi 'Kategori Yönetimi' ve 'Ürün Yönetimi' modüllerini inşa etmeni istiyorum. Bu modüller B2B sisteminin kalbi olacak, bu yüzden arayüz beyaz temalı, modern ve veri girişini hızlandıracak (Excel/Toplu İşlem destekli) şekilde kurgulanmalıdır. Şu detayları birebir uygula:

A. Kategori Yönetimi Modülü (Admin Paneli)
Sistemde ürünler bağımsız duramaz, güçlü bir kategori ağacına bağlı olmalıdır:

Sınırsız Alt Kategori (Nested Structure): Admin, bir 'Ana Kategori' (Örn: Hırdavat) ve onun altına sınırsız seviyede 'Alt Kategori' (Örn: Hırdavat > Matkaplar > Şarjlı Matkaplar) ekleyebilmelidir. Veritabanında parent_id mantığını kur.

Kategori Sıralama ve Görünürlük: Kategorileri arayüzde sürükle-bırak (Drag&Drop) veya sıra numarası ile sıralayabilmeliyim. Ayrıca istenilen kategoriyi 'Pasif' çekip arayüzde gizleyebilmeliyim.

Kategori Görseli: Her kategoriye özel bir kapak fotoğrafı veya ikon yükleyebilmeliyim.

B. Ürün Yönetimi Modülü (Admin Paneli)
Ürün ekleme ve düzenleme ekranları, B2B'nin tüm ticari detaylarını kapsamalıdır:

Temel Ürün Kartı Bilgileri: Ürün Adı, Kategori (Dropdown), Marka, SKU (Stok Kodu), Barkod, Kısa Açıklama ve HTML formatında Detaylı Açıklama.

Varyantlı Ürün Mimarisi: Tek bir 'Master' ürün kartı açıp, altına Renk/Beden/Ölçü bazlı varyantlar ekleyebilmeliyim. Kritik Kural: Her varyantın kendi ayrı SKU kodu, barkodu ve stoğu olmak zorundadır.

B2B Fiyatlandırma ve Döviz Girişi:

Ürün fiyatı girerken para birimini (TRY, USD, EUR) seçebilmeliyim.

Liste Fiyatı (Standart fiyat) ve Maliyet Fiyatı (Sadece adminin göreceği) alanları olmalı.

Vergiler için KDV Oranı (%1, %10, %20) seçilebilir olmalı.

B2B Operasyonel Detaylar:

Satış Birimi: Ürün Adet, Kutu, Koli, Metre veya Kg olarak tanımlanabilmeli.

Minimum Sipariş Miktarı (MOQ): Bir bayinin bu üründen tek seferde en az kaç adet almak zorunda olduğunu belirleme alanı.

Artış Katsayısı (Step Quantity): Ürün örneğin kolide 12 adetse, sipariş sadece 12, 24, 36... şeklinde katlanarak verilebilmeli.

Görsel ve Teknik Arşiv: Ürüne çoklu yüksek çözünürlüklü fotoğraf yüklenebilmeli. Ayrıca bayilerin indirmesi için PDF Teknik Katalog dosyası ve youtube linki olarak Montaj/Tanıtım Videosu eklenebilmeli.

Alternatif ve Tamamlayıcı Ürünler: Stokta biten bir ürün için müşteriye gösterilecek Muadil/Alternatif Ürün bağlayabilmeliyim (Upsell/Cross-sell mantığı).

Toplu Veri Yönetimi: Adminin tek tek uğraşmaması için Excel/CSV formatında "Toplu Ürün Yükleme", "Toplu Stok Güncelleme" ve "Toplu Fiyat Güncelleme" arayüzünü hazırla.

C. Bayi Paneli (Müşteri) Ürün Listeleme Kuralları
Müşterinin (Bayinin) bu ürünleri gördüğü ekranlar şu kurallarla çalışmalı:

Dinamik Stok Gizliliği: Bayi, gerçek stok adedini asla görmesin. Eğer stok 100'den fazlaysa arayüzde 100+, kritik seviyedeyse Son 5 Ürün, stok bitmişse Tükendi veya Ön Sipariş yazsın.

Filtreleme: Bayi kategoriye girdiğinde; sol menüde markaya, fiyata ve varyant özelliklerine (Örn: Sadece Mavi renkleri göster) göre hızlı filtreleme (Faceted Search) yapabilsin.

Not: Bu modülü kodlarken Node.js tarafında API uçlarını yüksek performanslı arama ve sayfalama (Pagination) yapacak şekilde ayarla. React tarafında ise tablolar yerine modern kart (Card) tasarımları kullan."