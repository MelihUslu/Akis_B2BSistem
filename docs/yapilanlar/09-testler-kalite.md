# 9. Testler ve kalite

Üç katman var: kodun parçalarını doğrulayan birim ve entegrasyon testleri, sistemin yük altındaki davranışını ölçen yük testleri (k6) ve iş akışlarını gerçek tarayıcıda baştan sona deneyen kullanıcı kabul testleri (UAT). Hiçbiri geliştirme veritabanına yazmaz.

## Birim ve entegrasyon testleri

İlk kez 27 Ekim'de eklendi (`2a15af6`). GitHub Actions'ta her push ve pull request'te testler ve arayüz derlemesi çalışacak şekilde tanımlıdır (`.github/workflows/ci.yml`).

| Dosya | Test | Ne doğrular |
|---|---|---|
| `test/unit/*` | 34 | Fiyat ve KDV hesabı, teklif, ayar kontrolü, tarih (gece yarısı), güvenlik, çeviri, push, yardım |
| `integration/isolation` | 30 | Firmalar arası veri yalıtımı, eşzamanlı onay ve iade, toplu bildirim, oturum önbelleği |
| `integration/quotes` | 18 | Teklif akışı, sürümler, onay sınırları, siparişe dönüşüm |
| `integration/b2b` | 12 | Stok ayırma, bayi iptali, kargo ücreti, otomatik onay, süreli fiyat, görünürlük, kısmi sevkiyat, hedef, bayi adına sipariş, sepet |
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

## Kullanıcı kabul testleri (UAT)

Playwright ve Chrome ile gerçek tarayıcıda, ekrana tıklanarak (`819afaa`, `eddc54f`).

- **Ortam:** `./uat/run.sh` her çalıştırmada sıfırdan kurar: ayrı veritabanı (`akis_uat`), backend kopyası (port 5002), canlı derleme arayüz (`uat.localhost:5174`), ayrı Redis veritabanı.
- **Veri:** her senaryonun kendi bayisi ve ürünü vardır (`uat/data.mjs`); senaryolar paralel koşar, birbirinin stoğunu ve bakiyesini bozmaz.
- **Oturumlar:** giriş ucu çağrılmadan UAT backend'inin gizli anahtarıyla imzalanır (giriş ucunun 15 dakikada 20 deneme sınırına takılmamak için). Giriş ekranının kendisi UAT-01'de gerçek girişle denenir.
- **Kapsam:** 17 senaryo, 41 test, yaklaşık 2 dakika.

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

**UAT'nin bulduğu hatalar:**

- Katalog aramasında iki tane "temizle" düğmesi çıkması.
- Gelir-gider grafiğinde 1.300'ün "1 B" yazılması.
- Pencere, uyarı, sepet ve bildirim panelinde `dialog` rolünün, bazı düğmelerde erişilebilir adın olmaması.
- **Bayi adına sipariş tarayıcıda hiç çalışmıyordu:** `X-Act-As-Company` başlığı CORS izinli başlıklar listesinde yoktu. Backend testleri tarayıcı kullanmadığı için yakalayamamıştı; düzeltildi.

Ayrıntı: [`uat/README.md`](../../uat/README.md).

## Çalıştırma

```bash
# Birim testleri (veritabanı gerekmez)
cd backend && npm test

# Entegrasyon testleri (boş test veritabanı; dosyalar sırayla koşar)
TEST_DATABASE_URL=postgresql://akis:akis_dev_password@localhost:5433/akis_test npm run test:integration

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
