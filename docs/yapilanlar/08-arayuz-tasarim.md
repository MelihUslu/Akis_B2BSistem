# 8. Arayüz ve tasarım

Mayıs'taki "premium" beyaz temadan bugünkü lacivert / bronz kurumsal kimliğe kadar arayüzde yapılanlar. Amaç, ekranların her cihazda okunur ve hızlı kullanılır olması.

## Mayıs: ilk tema

Beyaz zeminli, ikon odaklı tema; ortada açılan sade pencereler; özel uyarı penceresi; yenilenen giriş ekranı; daraltılabilir sol menü; gece modu (bkz. [1. bölüm](01-ilk-surum.md)).

## SaaS dönüşümüyle (`b0613c5`)

Başlıklar, listeler, formlar, pencereler, sipariş ve destek ekranları yenilendi. Sayfalar gerektiğinde yüklenir (kod bölme), koyu mod bütün ekranlara yayıldı.

## Mobil uyum

- **Yönetici ve platform panelleri** (`09cc954`): telefonda çekmece menü, ürün tablosunda yatay kaydırma.
- **Mobil uygulama (PWA)** (`ce93bea`): portal telefona firmanın adıyla uygulama olarak kurulur ("Uygulamayı Yükle"; iPhone'da Ana Ekrana Ekle). Telefonda alt sekme çubuğu: katalog, hızlı sipariş, sepet, siparişler, menü. Web Push bildirimleri uygulama kapalıyken de gelir.
- **Taşma düzeltmeleri** (`4047afc`): yakınlaştırmada ve dar ekranda içerik kesilmez; listeler kendi genişliğine göre sütun azaltır (container query), pencereler ekran yüksekliğiyle sınırlı ve kendi içinde kayar.
- **Telefonda sipariş listesi** kart görünümünde (`a8e2226`).

## Çoklu dil (`2f2bf2e`, `ce93bea`)

Bayi portalı, giriş ve başvuru sayfaları Türkçe / İngilizce. Sözlük anahtarı Türkçe metnin kendisidir (`t('Sepete Ekle')`), çevirisi olmayan metin Türkçe görünür. API mesajları `X-Lang` başlığıyla çevrilir. Firma ve platform panelleri Türkçedir. Sonraki her bayi ekranında yeni metinler sözlüğe eklendi (4 Kasım'da yaklaşık 44 anahtar).

## Düzen ve gezinme

- **Bayi paneli tutarlılığı** (`ad314f3`): ortak sayfa başlığı (`PageHeader`) ve boş durum (`EmptyState`) bileşenleri, koyu menüde logo beyaz zeminde, eşit sayfa genişlikleri, kırık görsel yerine ikon.
- **Üst çubukta kullanıcı menüsü ve Destek** (`bcd26ca`): Hesabım / Abonelik / Ayarlar / Çıkış sağ üstte. Bayinin Destek düğmesi platformun değil, kendi firmasının iletişim bilgilerini gösterir. Sol menü sadeleşti, 768 px yükseklikte bütün öğeler sığar.
- **Gruplu sol menü ve rozetler** (`02f790a`): Katalog, Satış, Müşteriler, Finans grupları; açık gruplar hatırlanır. Bekleyen sipariş, teklif, iade, bayilik başvurusu, yeni müşteri adayı ve WhatsApp konuşması için rozet; grup kapalıysa toplam başlıkta görünür.
- **Arayüz standardı** (`16087c8`): bütün pencere ve çekmecelerde tek tip başlık (`ModalHeader`: ikon kutusu, başlık, alt başlık, kapatma); ortak ikincil düğme stili; tek marka rengi. Durum anlamı taşıyan renkler (Kargoda, onay, silme) korundu.

## Kurumsal renkler (`7b2ec8a`)

| Renk | Kod | Kullanım |
|---|---|---|
| Lacivert | `#14283F` | Menü, tablo başlığı, koyu yüzeyler (`navy` skalası) |
| Bronz | `#B7865F` | Seçili menü, vurgu, ana düğmeler (`brand` skalası) |
| Koyu bronz | `#986B47` | Beyaz yazılı küçük düğmeler (okunurluk için) |
| Zemin | `#F5F7FA` | İçerik zemini |
| Kart | `#FFFFFF` | Kartlar |

Renkler `index.css`'te iki skala olarak tanımlıdır; eski indigo sınıfları bronza, koyu tonlar laciverte bağlandı. Panel kartları, tanıtım sayfası, grafikler, e-posta düğmesi, uygulama simgeleri, paylaşım görseli ve tarayıcı tema rengi de yeni renklerdedir. Koyu mod karşılıkları eklendi. Bu sırada ürünler sayfasında 1440 px'te taşan başlık düğmeleri düzeltildi.

## Giriş ekranları (`0d0028f`)

Bütün kimlik ekranları (giriş, şifremi unuttum, yeni şifre, e-posta doğrulama, iki aşamalı doğrulama, platform girişi) ortak `AuthShell` çerçevesini kullanır: üstte firmanın logosu / adı ve dil seçici, ortada kart. Firma girişi ortak girişle (`/giris`) aynı görünümdedir.

## Kullanım kolaylığı (4 Kasım, `a8e2226`)

Genel kullanım incelemesinden sonra:

- Düğmeler 14 px ve cümle düzeninde (büyük harf yerine "Siparişi onayla" gibi).
- 9 ve 10 px'lik yazılar 10–11 px'e büyütüldü.
- Sepet penceresi açık renkli, sade tasarımda.
- Telefonda sipariş listesi kart görünümünde.
- Sipariş onay ekranında sipariş bilgileri, kargo ve kısmi sevkiyat tek yerde.

## Erişilebilirlik

UAT sırasında bulunan eksikler giderildi (`819afaa`): uyarı, pencere, sepet ve bildirim paneline `dialog` rolü; sepet düğmesine ve teklif miktarına erişilebilir ad. Testler öğeleri ekrandaki yazı ve rolle bulduğu için bu eksikler testte ortaya çıktı.

## Commit'ler

| Commit | Tarih | Açıklama |
|---|---|---|
| `09cc954` | 27 Ekim | Mobil uyumlu yönetici ve platform panelleri |
| `2f2bf2e` | 27 Ekim | Çoklu dil (TR / EN) |
| `ce93bea` | 27 Ekim | PWA, Web Push, alt sekme çubuğu |
| `ad314f3` | 27 Ekim | Bayi paneli görünüm tutarlılığı |
| `bcd26ca` | 28 Ekim | Üst çubukta kullanıcı menüsü |
| `4047afc` | 28 Ekim | Taşma düzeltmeleri |
| `02f790a` | 2 Kasım | Gruplu menü, rozetler |
| `16087c8` | 3 Kasım | Arayüz standardı |
| `7b2ec8a` | 4 Kasım | Kurumsal renkler |
| `0d0028f` | 4 Kasım | Ortak giriş görünümü |
| `a8e2226` | 4 Kasım | Düğme ve yazı boyutları, sepet penceresi, mobil sipariş kartları |
