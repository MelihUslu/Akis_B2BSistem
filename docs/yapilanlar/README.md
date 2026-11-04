# Akis B2B: yapılanlar (10 Mayıs – 4 Kasım 2026)

Bu klasör, projenin ilk commit'inden bugüne kadar yapılan işleri konu konu anlatır. Her belge kendi başına okunabilir. Ayrıntısına inmek istediğiniz değişikliğin commit kısaltması belgelerde yazılıdır: `git show <kısaltma>` ile kodun kendisine ulaşılır.

**Akis B2B nedir?** Toptancı ve üretici firmaların bayilerine online sipariş, cari, ödeme ve teklif süreçlerini sunduğu bir B2B portalıdır. Tek kurulumda çok sayıda firma (kiracı) çalışır. Her firmanın kendi adresi, yöneticileri, plasiyerleri, bayileri ve verisi vardır. Platform sahibi firmaları, paketleri ve abonelikleri ayrı bir panelden yönetir.

## Belgeler

| # | Belge | Konu |
|---|---|---|
| 1 | [İlk sürüm (Mayıs 2026)](01-ilk-surum.md) | Tek firmalık ilk B2B sürümü: roller, veri modeli, yönetici ve bayi panelleri |
| 2 | [SaaS platformu](02-saas-platform.md) | Çok kiracılı yapı, abonelik, platform paneli, güvenlik, KVKK, kayıt ve giriş, özel alan adı |
| 3 | [Sipariş, katalog ve lojistik](03-siparis-katalog-lojistik.md) | Katalog, hızlı sipariş, sepet, onay kuralları, stok ayırma, kargo, Gel-Al, depo, kısmi sevkiyat |
| 4 | [Finans ve cari](04-finans-cari.md) | Cari hesaplar, dövizli cari, yaşlandırma, e-fatura, gelir-gider, hedef ve ciro primi |
| 5 | [Teklif, satış ve pazarlama](05-teklif-satis-pazarlama.md) | Akıllı teklif, plasiyer paneli, bayi adına sipariş, müşteri adayları, WhatsApp, tanıtım sitesi ve sohbet botu |
| 6 | [Entegrasyon ve API](06-entegrasyon-api.md) | ERP API, webhook kuyruğu, OpenAPI dokümanı, test anahtarları, dış servisler |
| 7 | [Raporlar, izleme ve operasyon](07-raporlar-izleme-operasyon.md) | Raporlar, bildirimler, hata izleme, yedekleme, canlıya çıkış hazırlığı, performans |
| 8 | [Arayüz ve tasarım](08-arayuz-tasarim.md) | Mobil uyum, çoklu dil, PWA, menü, arayüz standardı, kurumsal renkler, kullanım kolaylığı |
| 9 | [Testler ve kalite](09-testler-kalite.md) | Birim ve entegrasyon testleri, CI, yük testleri (k6), kullanıcı kabul testleri (UAT) |
| 10 | [Açık konular ve sonraki adımlar](10-sonraki-adimlar.md) | Sonraya bırakılanlar, elle kontrol listesi, bilinen sınırlar, canlıya alma notları |
| 11 | [Personel yönetimi](11-personel-yonetimi.md) | Personel kartları, izin, masraf ve avans, satış hedefi ve prim, şirket duyuruları |

## Zaman çizelgesi

| Tarih | Dönem | Commit | Öne çıkanlar |
|---|---|---|---|
| 10–14 Mayıs | İlk sürüm | 10 | Yönetici ve bayi panelleri, ürün / kategori / bayi yönetimi, sipariş onayı, gece modu |
| 26 Ekim | SaaS dönüşümü | 5 | Çok kiracılı yapı, PostgreSQL, abonelik, platform paneli, 2FA, KVKK, güvenlik başlıkları |
| 27 Ekim | Modüller ve altyapı | 24 | Testler ve CI, raporlar, e-fatura, kargo, çoklu depo, ERP API dokümanı, izleme, yedekleme, TR/EN, PWA, cari hesaplar, akıllı teklif |
| 28–29 Ekim | Katalog ve tanıtım | 8 | Yeni bayi kataloğu, tanıtım sitesi, sohbet botu, ayrı kayıt ve ortak giriş |
| 2–3 Kasım | Satış, finans, ölçek | 21 | Müşteri adayları, WhatsApp, müşteri takip raporu, Gel-Al, gelir-gider, abonelik sayfası, yük testleri, UAT |
| 4 Kasım | Kurumsal kimlik ve B2B eksikleri | 8 | Lacivert / bronz renkler, ortak giriş görünümü, plasiyer paneli, bayi adına sipariş, stok ayırma, kısmi sevkiyat, bu belgeler, Google ile giriş, personel yönetimi |

Mayıs ile Ekim arasında commit yoktur. SaaS dönüşümü 26 Ekim'de tek büyük commit olarak geldi (`b0613c5`, 226 dosya).

## Bugünkü durum (4 Kasım 2026)

- **Kod:** 76 commit, 36 veritabanı migration'ı, backend ve frontend'de yaklaşık 330 kaynak dosyası.
- **Roller:** platform sahibi, firma yöneticisi (ekip yetkileriyle), plasiyer, bayi. Personel modülü açıksa ekip üyeleri ve plasiyerler "Personel Alanım"ı kullanır.
- **Testler:** 34 birim, 96 entegrasyon testi, 45 kullanıcı kabul testi (18 senaryo); hepsi geçiyor. Lint temiz, derleme sorunsuz.
- **Dal:** SaaS dönemine ait 66 commit `feature/saas-platform` dalındadır. `main` dalında yalnızca Mayıs sürümü vardır. Dal henüz uzak depoya gönderilmedi.

## Diğer kaynaklar

- [Kök README](../../README.md): kurulum, mimari, ortam değişkenleri, sipariş kuralları.
- [Canlıya çıkış rehberi](../canliya-cikis.md): sunucu, DNS, ayarlar, izleme, yedek.
- [Geliştirme notları](../gelistirme-notlari/): Mayıs dönemindeki çalışma istekleri (çalışma 01–18).
- [Yük testleri](../../loadtest/README.md) ve [kullanıcı kabul testleri](../../uat/README.md).
