# 3. Sipariş, katalog ve lojistik

Bayinin ürünü bulmasından siparişin kapısına gelmesine kadar olan bölüm. Temeli Mayıs sürümünde atıldı; SaaS dönüşümüyle fiyat motoru genişledi, Ekim ve Kasım'da lojistik ve sipariş kuralları tamamlandı.

## Fiyatlandırma

Bayinin gördüğü fiyat tek bir fiyat motorundan (`pricingService`) çıkar. Sepet, sipariş, teklif ve ERP aynı hesabı kullanır.

- **Net iskonto ve bayi grubu:** her bayinin kendi iskontosu ve grubu (Standart, Gold, VIP gibi) vardır.
- **Özel fiyat:** ürün için bayiye ya da gruba özel fiyat; asgari miktarla kademeli fiyat. 4 Kasım'dan beri başlangıç ve bitiş tarihi verilebilir, aralık dışında uygulanmaz (`a8e2226`).
- **Kupon:** yüzde ya da tutar, asgari sepet tutarı. Sipariş tamamen iptal edilince kupon kullanılmamış sayılır.
- **Döviz:** dövizle girilen ürün bayiye TCMB kuruyla TL gösterilir.
- **Kuruş yuvarlama:** KDV ve toplamlarda kuruş hatası testlerle bulunup düzeltildi (`2a15af6`).

## Katalog

- **Varyantlar:** seçenekler (renk, ölçü…) ve her varyantın kendi SKU, barkod, fiyat ve stoğu.
- **Uyumlu / muadil ürünler, favoriler, sipariş listeleri** (tekrar sipariş için kayıtlı listeler), **stok gelince haber ver**.
- **Yenilenen bayi kataloğu** (`3af03d9`): kart (4'lü) ve sipariş tablosu görünümü, tercih kullanıcı başına hatırlanır. Tek satır filtre çubuğu: kategori menüsü (arama, alt kategoriler, ürün sayıları), marka, fiyat, özellikler, stoktakiler, favoriler, sıralama. Miktar yazıp Enter ile ekleme, toplu seçip sepete ekleme, alt sepet çubuğu, "Daha fazla göster" ile sayfalama (önceden 12'den sonraki ürünler görünmüyordu). Türkçe ada göre sıralama; üst kategoride alt kategorilerin ürünleri de listelenir.
- **Görünürlük** (`a8e2226`): ürün ve kategori yalnızca seçilen bayi gruplarına açılabilir; kategori kısıtı alt kategorilere geçer. Gruba kapalı ürün katalogda, aramada, filtrelerde, hızlı siparişte ve teklif talebinde çıkmaz, sipariş edilemez.

## Hızlı Sipariş

- SKU kodlarını yazarak ya da Excel'den yapıştırarak toplu sepet oluşturma.
- Stokta olmayan ürün "Stokta yok · sepete eklenmez" etiketiyle işaretlenir; düğme yalnızca eklenebilecek ürün sayısını gösterir. Teklif isteme açıksa stokta olmayanlar için tek tıkla teklif talebi açılır (`2754e79`).
- Telefon kamerasıyla barkod okutma (`@zxing/browser`, gerektiğinde yüklenir; https gerekir) (`a8e2226`).

## Sepet

4 Kasım'dan beri sepet kullanıcıya özeldir ve çıkışta tarayıcıdan silinir. Bayinin sepeti sunucuda da saklanır: telefonda başlanan sepet bilgisayarda devam eder (`/api/cart`). Sepet penceresi açık renkli, sade tasarıma geçti.

## Sipariş kuralları

| Kural | Açıklama |
|---|---|
| **Risk limiti** | Cari hesapla sipariş, bayinin açık hesap limiti yetmezse verilemez; Havale / EFT ile verilebilir. Dövizli caride kontrol TL karşılığıyla yapılır. |
| **Minimum sipariş tutarı** | Firma ayarıyla sepet alt limiti. |
| **Parçalı onay** | Yönetici bazı kalemleri iptal edip kalanı onaylar; yalnızca onaylanan kalemin stoğu düşer ve tutarı cariye yazılır. |
| **Tek onay mantığı** | Elle ve otomatik onay aynı fonksiyonla (`decideOrder`) aynı stok ve cari kurallarıyla işler (`a8e2226`). |
| **Stok ayırma** | Onay bekleyen siparişlerdeki miktar stoktan ayrılmış sayılır. Bayiye gösterilen ve sipariş edilebilen miktar "stok − bekleyen siparişler"dir. Sipariş anında ürün satırları kilitlenir: son ürünleri iki bayi birden alamaz. Yönetici ürün listesinde ayrılan miktarı görür. |
| **Otomatik onay** | Açıksa cari hesapla verilen ve limiti yeten sipariş (isteğe bağlı üst tutara kadar) beklemeden onaylanır. Stok yetmezse sipariş onay bekler; Havale / EFT her zaman bekler. |
| **Bayi iptali** | Bayi onay bekleyen siparişini kendisi iptal eder; ayrılan stok, limit ve kupon serbest kalır. Onaylanmış sipariş yalnızca yönetici kararıyla değişir. |
| **Not ve referans no** | Bayi siparişe not ve kendi sipariş numarasını yazar; yönetici ekranında, çıktıda, Excel'de ve ERP API'sinde görünür. |
| **Kanal** | Siparişin nereden geldiği kaydedilir: portal, yönetici (bayi adına), plasiyer, tekliften. |

### Yük altında doğruluk (`2197736`)

1000 eşzamanlı kullanıcıyla yapılan yük testi iki ciddi hata gösterdi: aynı anda yapılan onaylar stoğu eksiye düşürüyor, aynı sipariş iki kez borç yazabiliyordu. Düzeltmeler:

- Onay sipariş satırını kilitler, stok koşullu düşer (stok ≥ miktar), ürünler sabit sırayla kilitlenir (kilitlenme önlenir).
- Aynı kararın tekrarı (iki yönetici, çift tıklama) bildirimi, webhook'u ve otomatik faturayı yeniden tetiklemez.
- İade kararı durum karşılaştırmalı alınır; aynı iade iki kez onaylanamaz (ikincisi 409 döner).
- Depo transferinde yetersiz stok anlaşılır mesajla döner.

## Teslimat ve kargo

- **Teslimat adresleri** (`4c861fa`): bayinin adres defteri (il / ilçe ayrı), siparişte adres seçimi; seçilen adres siparişe kopyalanır.
- **Yurtiçi Kargo:** firma web servisini bağlarsa sipariş ekranından tek tıkla gönderi oluşturur, 10×15 barkodlu etiket yazdırır. Takip numarası yarım saatte bir (ya da "Durumu güncelle" ile) otomatik gelir; sipariş "Kargoda", teslimde "Teslim edildi" olur ve bayiye bildirilir. Diğer kargo firmalarında takip numarası elle girilir.
- **Kargo ücreti** (`a8e2226`): sabit ücret (KDV hariç) ve "bu tutar üstü ücretsiz" eşiği. Adrese teslim siparişlere KDV ile eklenir, cariye ve faturaya ayrı satır olarak girer; Gel-Al'da uygulanmaz. Bütün kalemler iptal edilirse sıfırlanır.
- **Gel-Al** (`c54bc80`): bayi ödeme ekranında depodan teslim alma tarih ve saatini seçer (depo adresi, çalışma saatleri, en erken süre ayarlardan). Yeni durum "Teslim Almaya Hazır": yönetici hazır olunca bayiye bildirim gider, sonra "Teslim Edildi" yapılır. Gel-Al siparişi kargoya verilmez.
- **Kısmi sevkiyat ve irsaliye** (`a8e2226`): onaylanan sipariş kalem ve miktar seçilerek parça parça gönderilir, her gönderinin kendi takip numarası olur; tamamı gidince sipariş "Kargoda" olur. Kısmen gönderilmiş kalem iptal edilemez, iade olarak işlenir. İrsaliye numarası elle ya da ERP'den girilir; sipariş fiyatsız sevk irsaliyesi olarak yazdırılabilir. GİB'e e-İrsaliye gönderimi yoktur (bkz. [10. bölüm](10-sonraki-adimlar.md)).

## Çoklu depo (`7c25dc0`)

- Ayarlar → Depolar'dan depo eklenince stok depo bazında tutulur; ilk depo eklenince mevcut stoklar ona aktarılır. Ürün stoğu bütün depoların toplamıdır, bayi toplamı görür.
- Onayda karşılanacak depo seçilir, stok o depodan düşer; kalem iptali ve iade aynı depoya geri yazılır.
- Depolar arası transfer; Excel'de "Depo" sütunu, ERP'de depo kodu.
- Bütün stok değişiklikleri tek servisten (`stockService`) geçer.

## İadeler

Bayi iade / değişim talebi açar, yönetici karar verir. Onaylanan iade stoğa (aynı depoya) ve cariye işlenir.

## Stokta olmayan ürüne teklif (`c54bc80`)

Ayar açıkken bayi stokta olmayan üründe miktar belirterek teklif ister. Sipariş oluşmaz, stok düşmez; talep yöneticiye "stokta yoktu" uyarısıyla düşer. Yönetici fiyatlayıp gönderir, bayi onaylarsa sipariş oluşur. Stok ayırma kuralından beri stoktan fazla sipariş verilemediği için stokta olmayan mal bu yoldan istenir.

## Commit'ler

| Commit | Tarih | Açıklama |
|---|---|---|
| `b0613c5` | 26 Ekim | Varyantlar, özel fiyatlar, kupon, teklif, listeler |
| `4c861fa` | 27 Ekim | Teslimat adresleri, Yurtiçi Kargo |
| `7c25dc0` | 27 Ekim | Çoklu depo |
| `3af03d9` | 28 Ekim | Bayi kataloğu yenilendi |
| `c54bc80` | 3 Kasım | Stokta olmayana teklif, Gel-Al |
| `2754e79` | 3 Kasım | Hızlı Sipariş'te stokta olmayanlar |
| `2197736` | 3 Kasım | Eşzamanlı onay ve iade düzeltmeleri |
| `a8e2226` | 4 Kasım | Stok ayırma, iptal, not, kargo ücreti, otomatik onay, süreli fiyat, görünürlük, kısmi sevkiyat, sunucu sepeti, barkod |
