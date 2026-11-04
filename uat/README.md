# Kullanıcı kabul testleri (UAT)

Bayinin ve yöneticinin gerçek iş akışları, gerçek tarayıcıda (Playwright + Chrome) ekrana tıklanarak uçtan uca denenir. Birim ve entegrasyon testleri tek tek parçaları doğrular. UAT ise "bayi sipariş verir, yönetici onaylar, borç cariye yazılır" gibi bir işin baştan sona ekranda doğru sonuçlandığını gösterir.

```bash
./uat/run.sh                                  # hepsi (~2 dk)
./uat/run.sh tests/siparis.spec.mjs           # tek senaryo dosyası
./uat/run.sh --headed                         # tarayıcıyı görerek
./uat/run.sh --ui                             # Playwright arayüzünde adım adım
UAT_KEEP=1 ./uat/run.sh                       # bitince UAT backend'i açık kalsın (veriye bakmak için)
npx --prefix uat playwright show-report uat/.data/report   # son çalıştırmanın raporu
```

Gerekenler: geliştirme ortamı çalışıyor olmalı (`docker compose up`: db, redis, backend) ve bilgisayarda Google Chrome kurulu olmalı. Chrome yoksa `UAT_BROWSER=chromium` verin ve bir kez `npx --prefix uat playwright install chromium` çalıştırın.

## Ortam: geliştirme verisine dokunulmaz

`run.sh` her çalıştırmada ortamı sıfırdan kurar:

| Parça | UAT'de | Geliştirmede |
|---|---|---|
| Veritabanı | `akis_uat` (her çalıştırmada silinip yeniden kurulur) | `akis_b2b` |
| Backend | `akis_uat_backend` kopyası, port **5002** (kod aynı) | port 5001 |
| Frontend | canlı derleme (`vite build`), **uat.localhost:5174** | 5173 (geliştirme sunucusu) |
| Redis | 6. veritabanı | 0 |
| Yüklenen dosyalar | konteyner içinde geçici bellek | `backend/uploads` |

Test verisi [`data.mjs`](data.mjs) dosyasındadır; [`seed.mjs`](seed.mjs) kayıtları buradan oluşturur, senaryolar da aynı değerleri kullanır. Her senaryonun kendi bayisi ve ürünü vardır. Bu sayede senaryo dosyaları paralel koşar ve birinin düşürdüğü stok ya da yazdığı borç ötekini etkilemez.

Oturumlar test başında giriş ucu çağrılmadan, UAT backend'inin gizli anahtarıyla imzalanarak hazırlanır ([`global-setup.mjs`](global-setup.mjs); kullanıcı kimlikleri `seed.mjs`'ten gelir). Giriş ekranının kendisi UAT-01'de gerçek girişle denenir. Her senaryo giriş yapsaydı giriş ucunun 15 dakikada 20 deneme sınırına takılırdı.

## Senaryolar

| No | Dosya | İş akışı | Doğrulanan |
|---|---|---|---|
| UAT-01 | `giris` | Giriş ve yetki | Yanlış şifre reddedilir; bayi kataloğa, yönetici panele düşer; bayi yönetici sayfasını açamaz; **başka firmanın bayisi bu firmadan giremez**; çıkıştan sonra korunan sayfa açılmaz |
| UAT-02 | `siparis` | Siparişten tahsilata | Bayi kendi iskontolu fiyatını görür, cari hesapla sipariş verir → yönetici onaylar → **stok düşer**, bayiye bildirim gider, **tutar cariye borç yazılır** → yönetici tahsilat alır → borç kapanır |
| UAT-03 | `kismi-onay` | Kısmi onay | Bir kalem iptal edilir; yalnızca onaylanan kalemin stoğu düşer ve tutarı cariye yazılır; bayi "Kısmen Onaylandı" görür |
| UAT-04 | `gel-al` | Gel-Al (depodan teslim) | Depo adresi ve saatleri görünür; saat seçmeden sipariş verilemez; onay → hazır → bayi bildirimi → teslim edildi |
| UAT-05 | `teklif` | Stokta olmayan ürüne teklif | Tükenen ürün sepete eklenemez, teklif istenir → yönetici fiyatlar, gönderir → bayi onaylar → sipariş oluşur, yöneticinin onayına düşer |
| UAT-06 | `hizli-siparis` | Hızlı Sipariş (Excel'den yapıştırma) | Stoktakiler sepete girer; stokta olmayan işaretlenir, eklenmez; bulunamayan kod bildirilir |
| UAT-07 | `risk-limiti` | Risk limiti | Limit yetersizken cari hesapla sipariş engellenir ve uyarı çıkar; Havale/EFT ile verilebilir |
| UAT-08 | `mobil` | Telefon (390 px) | Telefonda sipariş verilir; bayi sayfaları yana taşmaz |
| UAT-09 | `urun` | Ürün ekleme | Yönetici ürün ekler → bayi katalogda kendi iskontolu fiyatı ve stokla görür |
| UAT-10 | `bayi-ekle` | Bayi açma | Yönetici bayi açar → bayi verilen şifreyle girer, kendi iskontosunu görür |
| UAT-11 | `gelir-gider` | Gelir-Gider | Gider ve gelir kaydı eklenir, listede ve özette görünür, silinir |
| UAT-12 | `plasiyer` | Plasiyer (saha satış) | Plasiyer yalnızca kendi bayisini görür, onun adına bayinin fiyatıyla sipariş verir; bayi bildirim alır, yönetici kimin girdiğini görür |
| UAT-13 | `bayi-adina` | Yönetici bayi adına sipariş | Telefonla gelen sipariş bayi seçilerek girilir; moddan çıkınca yönetim paneline dönülür |
| UAT-14 | `iptal-not` | Sipariş notu ve bayi iptali | Not / referans no siparişte görünür; bayi onay beklerken iptal eder, stok ayrılmaz |
| UAT-15 | `kismi-sevk` | Kısmi sevkiyat ve irsaliye | Siparişin bir kısmı kendi takip numarasıyla gönderilir, kalan sonra; tamamı gidince "Kargoda"; irsaliye no bayiye görünür |
| UAT-16 | `hedef` | Bayi hedefi ve ciro primi | Hedef tanımlanır, bayi ilerlemeyi görür, dönem kapatılınca prim cariye yazılır |
| UAT-17 | `sepet` | Sepet cihazlar arası | Telefonda eklenen ürün bilgisayarda sepette; çıkışta tarayıcıdan silinir |

## Elle kontrol edilecekler

Aşağıdakiler dış servise ya da fiziksel çıktıya bağlı olduğu için otomatik senaryoda yok. Canlıya çıkmadan önce test hesabıyla elle denenir:

- **E-posta:** sipariş, onay, şifre sıfırlama ve bayi açılış e-postaları gerçekten geliyor mu; bağlantılar doğru adrese gidiyor mu?
- **Online ödeme (iyzico):** bayinin kartla cari ödemesi ve firmanın abonelik ödemesi, sandbox kartıyla.
- **E-fatura (Paraşüt), kargo (Yurtiçi), WhatsApp:** firmanın kendi test hesabıyla.
- **Anlık bildirim (PWA):** telefona ana ekrana eklenmiş uygulamada bildirim geliyor mu?
- **Yazdırma:** sipariş, teklif PDF'i, makbuz, ekstre ve kargo etiketi çıktısı.
- **İngilizce portal:** bayi dili EN seçince ekranlar ve e-postalar.
- **Özel alan adı:** firmanın kendi alan adıyla açılış (DNS gerektirir).
- **Google ile giriş:** firma girişinde ve ortak girişte (`/giris`), gerçek bir Google hesabıyla (Google Cloud'da OAuth istemcisi ve yönlendirme adresi tanımlı olmalı).
- **Barkod okutma:** Hızlı Sipariş'te gerçek telefon kamerasıyla (https adresinde; tarayıcı kamera izni ister).
- **İrsaliye:** irsaliye numarası elle ya da ERP'den girilir ve fiyatsız irsaliye yazdırılır. GİB'e elektronik irsaliye (e-İrsaliye) gönderimi entegre değildir; e-İrsaliye mükellefi firmalar irsaliyeyi ERP / muhasebe programından düzenler.

## Yeni senaryo eklerken

- Yeni bayi ve ürünü `data.mjs`'e ekleyin. Paylaşılan kayıtları değiştirmeyin; başka senaryonun beklediği stok ya da bakiye bozulur.
- Adımları birbirine bağlı senaryolarda `test.describe.configure({ mode: 'serial' })` kullanın.
- Öğeleri ekrandaki yazı ve rollerle bulun (`getByRole`, `getByText`, `getByPlaceholder`); CSS sınıflarına bağlanmayın. Ortak yardımcılar [`fixtures.mjs`](fixtures.mjs) dosyasındadır.
