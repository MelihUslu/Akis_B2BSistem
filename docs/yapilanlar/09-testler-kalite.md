# 9. Testler ve kalite

Üç katman var: kodun parçalarını doğrulayan birim ve entegrasyon testleri, sistemin yük altındaki davranışını ölçen yük testleri (k6) ve iş akışlarını gerçek tarayıcıda baştan sona deneyen kullanıcı kabul testleri (UAT). Hiçbiri geliştirme veritabanına yazmaz.

## Birim ve entegrasyon testleri

İlk kez 27 Ekim'de eklendi (`2a15af6`). GitHub Actions'ta her push ve pull request'te testler ve arayüz derlemesi çalışacak şekilde tanımlıdır (`.github/workflows/ci.yml`).

| Dosya | Test | Ne doğrular |
|---|---|---|
| `test/unit/*` | 38 | Fiyat ve KDV hesabı, teklif, ayar kontrolü, tarih (gece yarısı), güvenlik, çeviri, push, yardım |
| `integration/isolation` | 30 | Firmalar arası veri yalıtımı, eşzamanlı onay ve iade, toplu bildirim, oturum önbelleği |
| `integration/quotes` | 18 | Teklif akışı, sürümler, onay sınırları, siparişe dönüşüm |
| `integration/dealers` | 11 | Aynı firmadaki bayiler arası erişim: sipariş, fatura, ekstre, ödeme, iade, teklif, adres, şablon, bildirim, bayi kullanıcıları, özel fiyat ve kupon; gruba kapalı ürünler hiçbir uçtan görünmez |
| `integration/b2b` | 13 | Stok ayırma, bayi iptali, kargo ücreti, otomatik onay, süreli fiyat, görünürlük, kısmi sevkiyat, hedef, bayi adına sipariş, sepet |
| `integration/hr` | 15 | Personel yönetimi: modül, erişim, izolasyon, personel rolü, izin hakkı / tatiller / yarım gün, departman yöneticisi, onay akışları, kısmi ödeme ve mükerrer ödeme engeli, avans mahsubu, prim hesabı, duyurular |
| `integration/google` | 8 | Google ile giriş: firma ve ortak giriş, tek kullanımlık bilet, tarayıcı bağı, iptal, doğrulanmamış e-posta, iki aşamalı doğrulama |
| `integration/site` | 7 | Tanıtım sitesi, sohbet, talepler |
| `integration/monitoring` | 7 | İzleme kayıtları ve uyarılar |
| `integration/catalog` | 4 | Katalog sıralama ve filtreler |

Paraşüt, Yurtiçi, WhatsApp ve Google'ın token ucu taklit sunucularla denenir. Entegrasyon testleri boş bir test veritabanında (`akis_test`) çalışır, verisini sonunda siler.

**İlk testlerin bulduğu hatalar:** KDV / toplamda kuruş yuvarlama hatası; başka firmanın ürününü güncelleme isteğinin 404 yerine farklı yanıt vermesi (`2a15af6`).

**Lint** (`0b39a89`): kullanılmayan importlar, effect içinde senkron `setState` kullanımları (türetilmiş state, `then` tabanlı yükleyiciler), eslint yapılandırması. Lint bugün temiz.

## Yük testleri (k6)

### Temel testler (`ac5893e`)

`loadtest/` klasöründe gerçekçi bayi (katalog, arama, sepet hesabı, siparişler) ve yönetici (panel, siparişler, ürünler, rapor) akışları. Docker ile çalışır, k6 kurmak gerekmez.

| Test | Amaç |
|---|---|
| `smoke` | 1 kullanıcı, 30 sn: bütün akışlar çalışıyor mu? |
| `load` | Normal yoğun gün: %85 bayi, %15 yönetici, 50 eşzamanlı kullanıcı |
| `stress`, `spike` | Kırılma noktası ve ani yük |
| `order-write` | Sipariş yazar; yalnızca `WRITE_OK=1` ile ve test firmasında |

Eşikler: hata oranı %1'in altında; okumada %95 süre 500 ms, sepet hesabında 800 ms altında.

### Büyük ölçekli testler (`9e70893`)

- Ayrı veritabanı (`akis_load`) ve ayrı backend kopyası. Veri: 1000 yönetici, 1000 bayi, 5000 ürün, 60.000 sipariş ve cari hareketler; her sanal kullanıcıya ayrı oturum.
- `scale` (1000 yönetici + 1000 bayi aynı anda), `breakpoint` (istek hızı artar; %95 süre 2 sn'yi ya da hata %5'i geçince durur), `concurrency` (az stoklu ürünlere sipariş yağmuru ve eşzamanlı onay), `soak` (300 kullanıcıyla uzun süre).
- `monitor.sh`: backend ve veritabanının işlemci, bellek ve bağlantı sayısını CSV'ye yazar.

### Sonuçlar: düzeltmeden önce ve sonra

Bulunan sorunlar `2197736` ile düzeltildi (bkz. [3](03-siparis-katalog-lojistik.md) ve [7](07-raporlar-izleme-operasyon.md)). Ölçümler geliştirme bilgisayarında yapıldı.

| Test | Önce | Sonra |
|---|---|---|
| Scale (1000 + 1000 kullanıcı) | %65 hata, ortanca 8,2 sn, 56 istek/sn | %0 hata, ortanca 302 ms, 560 istek/sn (%95 süre 6,5 sn; bilgisayarın işlemcisi sınırda) |
| Soak (uzun süre) | %95 süre 11,4 sn, 70 istek/sn | %95 süre 15 ms, 222 istek/sn |
| Breakpoint | %3,7 hata, ortanca 423 ms | %0 hata, ortanca 17 ms |
| Concurrency | Eksiye düşen stok, aynı siparişe çift borç (toplam 433.787 TL) | Hiçbiri yok |

Bu sayılar önceki ölçümle karşılaştırma içindir. "Canlıda kaç bayi kaldırır" sorusunun cevabı için canlıyla aynı boyutta bir sunucuda ve k6 ayrı makineden çalışırken ölçmek gerekir.

### İleri testler (5 Kasım)

Planlanan dokuz ileri testin hepsi yapıldı: kampanya günü, 100 firmada gürültülü komşu, uzun süre (3 saat), 10 kat veri, ağır uçlar, ERP API yükü, aşırı ani yük, dayanıklılık ve tarayıcıyla sayfa açılışı. Yeni betikler: `kampanya.js`, `komsu.js`, `agir.js`, `erp.js`, `ani.js`, `dayaniklilik.js` + `dayaniklilik.sh` (kesintileri uygular), `uzun.js` + `uzun.sh` (5 dk'da bir ölçüm), `seed/yoklama.mjs` (uzun testte sabit yoklama ve işçi belleği), `tarayici.js` (gerçek Chromium), `seed/neighbors.mjs` (99 komşu firma), `seed/apikey.mjs` (ERP anahtarları), `seed/check.mjs` (yazma testinden sonra doğruluk kontrolü), `seed/blocking.mjs` (ağır isteğin işçi süreci kilitleme süresi), `uclar.py` (uç bazında süre özeti), `dilimler.py` (10 sn'lik dilimlerle toparlanma), `caddy/Caddyfile` (canlıdaki gibi Caddy arkasından ölçmek için). Sayılar: [`loadtest/README.md` → 5 Kasım sonuçları](../../loadtest/README.md).

**Kampanya günü: aynı anda yazma**

- Tahsilat makbuz numarası ve teklif numarası "en büyük + 1" ile veriliyordu; aynı anda girilen kayıtlar aynı numarayı alıp düşüyordu (tahsilatların %6'sı). Numara artık firma başına işlem kilidiyle (`pg_advisory_xact_lock`) veriliyor (`utils/prisma.js` → `sequenceLock`).
- Yoğunlukta sipariş, tahsilat ve teklif işlemleri Prisma'nın 5 sn işlem sınırına takılıyordu; bu işlemlere 30 sn süre verildi.
- Entegrasyon testi: 12 eşzamanlı tahsilat ve 8 eşzamanlı teklif, numaralar çakışmadan kaydedilir.

**Gürültülü komşu: bir firmanın ağır işi diğerlerini düşürmesin**

- Satış raporu bütün kalemleri JavaScript'e çekip topluyordu (12 ayda +700 MB). Toplama artık veritabanında, tek sorguda; sonuç eskisiyle birebir aynı (eski ve yeni kod 1 ve 10 kat veride karşılaştırıldı). On kat veride 12 aylık rapor sorgusu 5,7 → 2,5 sn.
- Tüm veri dışa aktarımı her şeyi bellekte kuruyordu (+2,8 GB). Artık tablolar 5.000 satırlık parçalarla okunup akışla geçici dosyaya yazılıyor (`utils/xlsxStream.js`); 1 milyon satırı aşan tablo yeni sayfaya bölünüyor. On kat veride (2,9 milyon satır) 49 sn, sunucu belleği neredeyse hiç artmıyor. Aynı anda tüm sunucularda tek dışa aktarım çalışır; indiren taraf ayrılırsa hazırlık durur.
- Ağır uçlara (Excel'ler, dönemsel rapor, dışa aktarım) firma başına aynı anda 2 iş sınırı (`middlewares/heavyLimit.js`); bayi kendi sınırını kullanır. Dolu ise 429 ve "biri bitince tekrar deneyin" mesajı; ön yüz bu mesajı gösterir.

**10 kat veri: büyük veride sorgular**

- Katalog her saat başı (ve sunucu açılışında) her işçide TCMB kurunu beklerken 3–5 sn takılıyordu; TCMB yanıt vermezse her istek 5 sn bekliyordu. Artık eski kur hemen kullanılıyor, yenisi arka planda çekiliyor; TCMB'ye ulaşılamazsa 1 dk yeniden denenmiyor; kur sunucu açılırken çekiliyor.
- Satış raporu ekranı ürün, bayi ve satılmayan listelerinin tamamını gönderiyordu (50 bin ürün: 10,5 MB; 150 yönetici açınca sunucu belleği 4,5 GB). Ekrana ilk 200 satır ve toplam sayı gider; tamamı Excel'de.
- Yaşlandırma ve nakit tahmini bütün borç hareketlerini okuyordu; artık yalnızca açık bakiyeyi karşılayan en yeni hareketler okunuyor (498 bin → 81 bin satır, sonuç aynı).
- Yeni indeksler (`20261129120000_buyuk_veri_indeksleri`): katalog varsayılan ve fiyat sıralaması, katalog araması için trigram (pg_trgm: ad, stok kodu, barkod, marka), bekleyen sipariş tutarı. Katalog ilk sayfası 13 → 0,05 ms, arama 38 → 0,6 ms, bekleyen tutar 191 → 4 ms.
- Marka filtresi 50 bin ürünü çekip bellekte tekilleştiriyordu; artık veritabanında gruplanıyor.

**Ağır uçlar: işçi süreç kilitlenmesin**

- Excel'ler (satış raporu, siparişler, cariler, ekstre, yaşlandırma, gelir-gider, müşteri raporu) SheetJS ile bellekte kurulup tek seferde yazılıyordu; on kat veride işçi süreci 0,3–1 sn kilitliyordu. Hepsi akışlı yazıcıya taşındı: en uzun kilit 0,1–0,3 sn.

**ERP API: toplu güncelleme ve istek sınırı**

- Stok ve fiyat partisi kayıt başına sırayla sorgu atıyordu: 1.000 kayıt yük altında stokta 11 sn, fiyatta 5 sn; 50 bin ürünün tam senkronu ~7 dk. Artık parti tek sorguda okunup tek sorguda yazılıyor (depolu firmada stok depo üzerinden, ürünler tek sorguda okunarak): parti 0,2 sn, tam senkron ~40 sn. Aynı SKU partide birden çok kez gelirse sonuncusu geçerli.
- İstek sınırı (dakikada 600) IP + yol ile sayılıyordu: `/orders/:id`'de her sipariş ayrı sayıldığı için sınır işlemiyor, aynı IP'den gelen farklı firmaların ERP'leri (entegratör sunucusu) birbirinin sınırını tüketiyordu. Artık API anahtarı başına, bütün uçlar toplamında.
- Fiyata eklenen sıralama indeksi geri alındı: her fiyat güncellemesinde trigram dahil bütün indekslere yazdırıyordu. Ürün tablosunda sayfalarda %10 boş yer bırakılıyor (`fillfactor 90`); stok / fiyat güncellemelerinin yerinde yapılanı %13 → %60.

**Aşırı ani yük: kuyrukta bekletmek yerine hızlı ret**

- Kapasitenin ~3 katı yükte (saniyede 600 açılış) istekler kuyrukta 60 sn bekleyip zaman aşımına düşüyordu. Caddy arkasında da yoğunlukta açılan yeni bağlantılar Node cluster'ın bağlantı devir kuyruğunda bekledi.
- Yük atma (`middlewares/overload.js`): işçi başına aynı anda en fazla 100 istek, fazlasına anında 503 + Retry-After. Ön yüz okuma isteklerinde 503'ü en fazla 2 kez kendiliğinden yeniden dener. Caddy backend'e en fazla 1024 kalıcı bağlantı açar ve boşalanları kapatmaz. Sonuç: zaman aşımı yok, tepede %95 süre ~2 sn, tepe bitince anında taban süreleri.

**Dayanıklılık: kesintiler**

- Yük sürerken bir işçi süreç öldürüldü ve Redis yeniden başlatıldı: hata yok. Veritabanı 15 sn kapatıldı: kesinti boyunca hata, açılınca anında toparlanma.
- Veritabanı kapalıyken kullanıcılar 500 alıyor, kayıtlara 15 sn'de 11 bin satır yazılıyordu. Artık bağlantı hatası görülünce birkaç saniye istekler veritabanına gitmeden 503 alıyor (ön yüz yeniden dener); kayıt 172 satır (`utils/dbHealth.js`).
- Ağır iş sınırı tek sayaçtı ve her denemede süresi uzuyordu: çöken süreç ya da Redis kesintisi yüzünden kaybolan bir bırakma, kullanıcılar denedikçe yeri kalıcı dolu tutabiliyordu (tüm veri dışa aktarımında sınır 1: herkes kilitlenirdi). Artık her sahip kendi süresiyle tutuluyor.
- Canlıda kayıt dosyaları döndürülüyor (servis başına 5 × 20 MB); önce sınırsız büyüyordu.

**Bayiler arası erişim (6 Kasım)**

- Firmalar arası yalıtım zaten test ediliyordu; aynı firmadaki iki bayinin birbirinin kaydına erişimi ise sistemli denenmemişti. Bayinin girebildiği ~90 uç rota dosyalarından çıkarıldı; numarayla kayıt açan ve `companyId` gibi parametre alan her biri `integration/dealers` testinde B'nin kaydıyla A'nın oturumundan denenir (her denemenin karşısında B'nin kendi kaydına eriştiği de doğrulanır).
- Sipariş, fatura, ekstre, ödeme, iade, teklif, adres, şablon, bildirim, bayi kullanıcıları, özel fiyat ve kupon doğru korunuyordu. Bayinin sahibi olmayan kullanıcısı da kendi firmasının kullanıcılarını yönetemiyor.
- Bulunan açık: "gelince haber ver" ve favori, bayinin grubuna kapalı ürüne de numarasıyla açılabiliyordu; ürün stoğa girince bildirimde gizli ürünün adı ve kodu gidiyordu (numaralar sıralı, tek tek denenebilir). Artık ikisi de görünmeyen ürüne var olmayan ürünle aynı 404'ü döner (`catalogAccess.js` → `findVisibleProduct`); bildirim gönderilirken de görünürlük yeniden kontrol edilir (ürün sonradan gruba kapatılmış olabilir).
- Plasiyer ve personel hesapları oturum denetiminde kendi yollarıyla sınırlı; plasiyer bir bayi adına işlem yaparken o bayinin yetkisine iner.

**Uzun süre: sızıntı yok**

- 3 saat boyunca 300 kullanıcı okudu; yanında dakikada ~5 sipariş, onaylar, tahsilat ve teklif yazıldı. 2,6 milyon istek, %0 hata, %95 süre 27 ms.
- 5 dk'da bir ölçüldü: işçi belleği ilk dakikalardan sonra ~1 GB'ta (4 işçi) sabit, veritabanı bağlantısı 61'de sabit, aynı isteklerin süresi baştan sona aynı. Saatlik işler yük altında üç kez çalıştı; günlükte hata yok.
- Veritabanındaki büyümenin tamamı bildirim tablosu: test firmasındaki 1.000 yöneticinin hepsi sipariş yetkili, her sipariş ve teklif her birine bildirim yazıyor. Gerçek firmada olay başına yönetici sayısı kadar satır; okunanlar 90 günde siliniyor.

**Tarayıcıyla sayfa açılışı**

- Ön yüz yük testi firmasına sabit derlenip Caddy'den sunuldu; gerçek Chromium oturumları katalog ve ödeme sayfasını önce yük yokken, sonra 600 bayi API'ye yüklenirken açtı.
- Katalog (ilk ürün kartı görünene kadar) sakinken 0,5 sn, yükte ortanca 1,6 sn (%95 2,2 sn); ödeme sayfası sakinken 0,4 sn, yükte 0,7 sn (%95 1,1 sn). Sayfa kayması (CLS) 0,03. Düzeltme gerekmedi; bulunan iyileştirme fırsatları [10. bölümde](10-sonraki-adimlar.md).
- `run.sh` macOS'un bash'inde `OUT_DIR` / `DOCKER_NETWORK` verilmeden çalıştırılınca "unbound variable" hatasıyla duruyordu; düzeltildi.

**Ölçümde dikkat:** proje iCloud'daysa testlerin yüzlerce MB'lık ham çıktısı senkronize edilirken işlemciyi testle paylaşır; aynı test %30–50 farklı sonuç verebilir. `OUT_DIR` ile ham çıktı iCloud dışına yazılır.

## Kullanıcı kabul testleri (UAT)

Playwright ve Chrome ile gerçek tarayıcıda, ekrana tıklanarak (`819afaa`, `eddc54f`).

- **Ortam:** `./uat/run.sh` her çalıştırmada sıfırdan kurar: ayrı veritabanı (`akis_uat`), backend kopyası (port 5002), canlı derleme arayüz (`uat.localhost:5174`), ayrı Redis veritabanı.
- **Veri:** her senaryonun kendi bayisi ve ürünü vardır (`uat/data.mjs`); senaryolar paralel koşar, birbirinin stoğunu ve bakiyesini bozmaz.
- **Oturumlar:** giriş ucu çağrılmadan UAT backend'inin gizli anahtarıyla imzalanır (giriş ucunun 15 dakikada 20 deneme sınırına takılmamak için). Giriş ekranının kendisi UAT-01'de gerçek girişle denenir.
- **Kapsam:** 18 senaryo, 46 test, yaklaşık 2 dakika.
- **Tarayıcılar (6 Kasım):** 46 test Chrome'da, Safari motorunda (WebKit, masaüstü) ve iPhone 15 taklidinde (ekran, dokunmatik, tarayıcı kimliği; yönetici akışları dahil) geçiyor: `UAT_BROWSER=webkit [UAT_DEVICE="iPhone 15"] ./uat/run.sh`. WebKit'te firma `uat.lvh.me` adresinden açılır (macOS `*.localhost` çözmüyor).

| No | İş akışı |
|---|---|
| UAT-01 | Giriş ve yetki; başka firmanın bayisi bu firmadan giremez |
| UAT-02 | Siparişten tahsilata: iskontolu fiyat → sipariş → onay → stok ve cari → tahsilat |
| UAT-03 | Kısmi onay |
| UAT-04 | Gel-Al |
| UAT-05 | Stokta olmayan ürüne teklif → siparişe dönüşüm |
| UAT-06 | Hızlı Sipariş (Excel'den yapıştırma) |
| UAT-07 | Risk limiti |
| UAT-08 | Telefon (390 px) |
| UAT-09, 10 | Ürün ekleme, bayi açma |
| UAT-11 | Gelir-gider |
| UAT-12 | Plasiyer: kendi bayisi adına sipariş |
| UAT-13 | Yönetici bayi adına sipariş |
| UAT-14 | Sipariş notu ve bayi iptali |
| UAT-15 | Kısmi sevkiyat ve irsaliye |
| UAT-16 | Bayi hedefi ve ciro primi |
| UAT-17 | Sepet cihazlar arası |
| UAT-18 | Personel yönetimi: talep → onay → ödeme → Gelir-Gider; personel girişi, yarım gün, yönetici onayı, kısmi ödeme |

**UAT'nin bulduğu hatalar:**

- Katalog aramasında iki tane "temizle" düğmesi çıkması.
- Gelir-gider grafiğinde 1.300'ün "1 B" yazılması.
- Pencere, uyarı, sepet ve bildirim panelinde `dialog` rolünün, bazı düğmelerde erişilebilir adın olmaması.
- **Bayi adına sipariş tarayıcıda hiç çalışmıyordu:** `X-Act-As-Company` başlığı CORS izinli başlıklar listesinde yoktu. Backend testleri tarayıcı kullanmadığı için yakalayamamıştı; düzeltildi.
- **Katalogda "Ekle" dokunuşu yutuluyordu (Safari / iPhone testinde, 6 Kasım):** miktar alanına dokunup değiştirmeden "Ekle"ye basınca alan odaktan çıkarken satır işaretleniyor, açılan alt çubuk düğmenin üstüne gelip tıklamayı alıyordu; ürün sepete girmiyordu (telefonda ve sayfa sonunda). Değişmeyen miktar artık satırı işaretlemez.
- **Telefonda yönetici sipariş kartında iptal edilen kalem sayısı yoktu** (masaüstü satırında vardı); eklendi.

Ayrıntı: [`uat/README.md`](../../uat/README.md).

## Çalıştırma

```bash
# Birim testleri (veritabanı gerekmez)
cd backend && npm test

# Entegrasyon testleri (boş test veritabanı; dosyalar sırayla koşar)
TEST_DATABASE_URL=postgresql://akis:akis_dev_password@localhost:5433/akis_test npm run test:integration
# Geliştirme backend kapsayıcısında (proje iCloud'daysa node_modules buluta boşaltılabiliyor; kapsayıcınınki etkilenmez).
# REDIS_URL boş: CI gibi Redis'siz; yoksa geliştirme Redis'ine bağlanır ve testler bitince süreç kapanmaz
docker exec akis_b2bsistem-backend-1 sh -c 'REDIS_URL= TEST_DATABASE_URL=postgresql://akis:akis_dev_password@db:5432/akis_test npm run test:integration'

# Yük testi (proje kökünden)
./loadtest/run.sh smoke

# Kullanıcı kabul testleri
./uat/run.sh
```

## Commit'ler

| Commit | Tarih | Açıklama |
|---|---|---|
| `2a15af6` | 27 Ekim | Birim ve izolasyon testleri, CI |
| `0b39a89` | 27 Ekim | Lint temizliği |
| `ac5893e` | 3 Kasım | k6 temel testleri |
| `2197736` | 3 Kasım | Yük testinin bulduklarının düzeltilmesi, yeni testler |
| `9e70893` | 3 Kasım | Büyük ölçekli yük testleri |
| `819afaa` | 3 Kasım | UAT: ilk 11 senaryo |
| `92b6e1e` | 4 Kasım | Sonraya bırakılan yük testlerinin listesi |
| `a8e2226` | 4 Kasım | `b2b.test.js` (12 senaryo) |
| `eddc54f` | 4 Kasım | UAT: 6 yeni senaryo, toplam 41 test |
| — | 5 Kasım | İleri yük testleri (kampanya, gürültülü komşu, 10 kat veri, ağır uçlar, ERP API, ani yük, dayanıklılık) ve bulunanların düzeltilmesi |
