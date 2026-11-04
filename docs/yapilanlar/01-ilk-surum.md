# 1. İlk sürüm (10–14 Mayıs 2026)

Projenin ilk hâli tek bir firma için yazılmış bir B2B sistemiydi. Firma yöneticisi ürünleri, bayileri ve siparişleri yönetiyor, bayi kendi iskontolu fiyatıyla sipariş veriyordu. Bu dönemin çalışma istekleri [`docs/gelistirme-notlari/`](../gelistirme-notlari/) klasöründe `calisma-01` … `calisma-18` olarak durur.

Bu sürüm `main` dalındadır. Sonraki bütün işler bunun üzerine kuruldu.

## Teknik temel

- **Backend:** Node.js, Express, Prisma. Veritabanı o dönemde **SQLite** idi (SaaS dönüşümünde PostgreSQL'e geçildi).
- **Frontend:** React, Vite, Tailwind CSS, Recharts (grafikler), dnd-kit (sürükle-bırak), xlsx (Excel).
- **Kimlik doğrulama:** JWT ile oturum, bcrypt ile şifre özeti. Şifreler düz metin saklanmaz; yönetici bile göremez, yalnızca sıfırlayabilir.
- **Roller:** `ADMIN` (firma yönetimi) ve `BAYI` (müşteri). Giriş yapan kullanıcı rolüne göre kendi paneline yönlendirilir.
- **Docker:** db, backend ve frontend servisleri. İlk kurulumda bütün migration'lar ve seed çalışır, kullanıcı adı ve şifre `.env`'den gelir. Sonradan eklenen migration ve seed dosyaları mevcut veriyi bozmadan uygulanır (`b40c9de`).

## Veri modeli

| Tablo | İçerik |
|---|---|
| `User` | Kullanıcılar, rol, bağlı olduğu firma |
| `Company` | Bayi firması: risk limiti, güncel bakiye, bayi grubu, net iskonto |
| `Category` | Sınırsız alt kategori (üst kategori bağlantısı), sıra, görünürlük, görsel |
| `Product` | SKU, barkod, döviz cinsi, varyantlar, açıklama, medya, alternatif / muadil ürünler |
| `Order`, `OrderItem` | Sipariş ve kalemleri, ödeme şekli |
| `Payment`, `FinancialTransaction` | Ödemeler ve cari hareketleri (borç / alacak) |
| `PlasiyerPoint` | Satışı yapan plasiyere yazılan prim puanı |
| `Setting` | Firma ayarları (ör. minimum sipariş tutarı) |

## Yönetici paneli

- **Kategori yönetimi:** iç içe kategori ağacı, sürükle-bırak sıralama, pasife alma, kapak görseli için dosya yükleme.
- **Ürün yönetimi:** varyantlı ürün ekleme, medya (görsel) yükleme, barkod alanı, açıklama, alternatif / muadil ürün bağlama, Excel ile toplu fiyat güncelleme, sürükle-bırak sıralama. Form alanlarına ikonlar eklendi.
- **Bayi yönetimi:** yeni bayi tanımlama, bayiye özel net iskonto, risk limiti (açık hesap limiti), bayi grubu, durum (aktif / pasif), unvan ve vergi numarasıyla arama.
- **Sipariş onayı:** bayiden gelen siparişlerin listesi; parçalı onay (stoğu olmayan kalemi iptal edip kalanı onaylama), kargo takip numarası.
- **Finans ve prim:** bayi ekstresine elle borç / alacak girişi, plasiyer prim puanları.
- **Panel ana sayfası:** grafiklerle özet.

## Bayi paneli

- Girişte kartlar hâlinde ürünler; fiyat bayinin iskontosuna göre hesaplanır.
- Ürün detayında açıklama ve medya; sepete ekleme, sepette adet değiştirme.
- Ödeme ekranı ve sipariş onayı, siparişlerim sayfası, cari ekstre (finans) sayfası.

## Temel iş akışı

Bayi sipariş verir → sipariş yönetici paneline düşer → yönetici onaylar → stok düşer ve tutar bayinin cari borcuna yazılır.

## Arayüz

- Beyaz zeminli, ikon odaklı "premium" tema (`calisma-09`).
- Pencereler sağdan kayan çekmece yerine ekranın ortasında açılır; içerik sadeleştirildi.
- Tarayıcının `alert()` kutusu yerine özel, animasyonlu uyarı penceresi (`f0cee4f`).
- Giriş ekranı yenilendi, çalışmayan çıkış düğmesi düzeltildi, kartlar sıkılaştırıldı (`80bb411`).
- Sol menü daraltılabilir (`9bc5a38`), gece modu (`c6c41f7`).

## Düzeltilen hatalar

- Ödeme ekranında "Sipariş oluşturulamadı" hatası: siparişe `paymentMethod` alanı eklendi (`b40c9de`).
- Bayinin verdiği siparişlerin yönetici panelinde görünmemesi ve 403 hataları: tek bir merkezi API istemcisine geçildi (`985692b`).
- Konsol hataları: yazı tipi yükleme hatası, tablo gövdesinde (`tbody`) geçersiz `div` uyarısı (sürükle-bırak bileşeni); ürün görselleri güncellendi (`cc66489`).

## Commit'ler

| Commit | Tarih | Açıklama |
|---|---|---|
| `a758837` | 10 Mayıs | İlk commit |
| `6c1c70f`, `a1a45bc` | 14 Mayıs | Sürüm 1.0: paneller, modüller, veri modeli |
| `f0cee4f` | 14 Mayıs | Özel uyarı penceresi |
| `b40c9de` | 14 Mayıs | `paymentMethod`; Docker'da otomatik migration ve seed |
| `985692b` | 14 Mayıs | Merkezi API yapısı, 403 çözümü |
| `cc66489` | 14 Mayıs | Konsol hataları, ürün görselleri |
| `80bb411` | 14 Mayıs | Giriş ekranı, çıkış düğmesi, kart tasarımı |
| `9bc5a38` | 14 Mayıs | Sol menü daraltma |
| `c6c41f7` | 14 Mayıs | Gece modu |
