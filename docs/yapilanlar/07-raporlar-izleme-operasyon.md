# 7. Raporlar, izleme ve operasyon

Firmanın işini ölçtüğü raporlar ile platformun ayakta kalmasını sağlayan izleme, yedekleme ve performans çalışmaları.

## Raporlar

- **Satış raporu** (`130ab59`): ürün, bayi ve kategori bazında satış, kâr marjı, satılmayan ürünler, trend, Excel. Tarih filtreleri Türkiye saatine göredir.
- **Dönemsel müşteri takip raporu** (`115d0a1`, `5764fb8`):
  - Haftalık ve aylık rapor ayrı açılır; gün, saat ve kayıp eşiği seçilir. Zamanı gelince rapor saklanır, sipariş / finans yetkililerine bildirim ve e-posta gider; kaçırılan rapor 3 gün içinde telafi edilir.
  - İçerik: sipariş veren müşteri sayısı, ciro ve önceki dönemle karşılaştırma, yeni ve kayba düşen müşteriler, cari borç / tahsilat / açık alacak, en çok alanlar.
  - Müşteri durumu her müşterinin kendi sipariş sıklığına göre belirlenir: risk altında, düşüşte, kaybedildi, yeni, aktif, hiç sipariş vermedi.
  - Öncelikli aranacaklar listesi (değer × alışkanlıktan sapma) ve nedeni; dönemsel trend grafikleri, durum dağılımı, müşteri ayrıntı penceresi (Ara / WhatsApp / Cari kartı).
- Raporlar sol menüde ayrı başlık oldu.
- Yaşlandırma ve gelir-gider raporları için bkz. [4. bölüm](04-finans-cari.md).

## Bildirimler

- Panel içi bildirim, e-posta ve telefona anlık bildirim (Web Push, `ce93bea`).
- **Tercihler** (`4c417c0`): kullanıcı türe göre e-posta bildirimini açar / kapatır. Yönetici bildirimleri yetkiye göre süzülür.
- **SMS (6 Kasım, isteğe bağlı):** firma Ayarlar → SMS'te kendi Netgsm hesabını bağlar (kullanıcı adı, API şifresi, BTK onaylı gönderici adı; şifreli saklanır) ve açar / kapatır; kapatınca bilgiler silinmez. Hangi bildirimlerin SMS ile gideceği bayi ve ekip için ayrı seçilir (sipariş, ödeme, vade, teklif, iade; varsayılan: bayiye sipariş / ödeme / vade, ekibe yeni sipariş). SMS, cep telefonu kayıtlı kullanıcıya gider; kullanıcı kendi bildirim tercihlerinden tür tür kapatabilir. Telefonu kullanıcı kendisi girer, bayi kullanıcılarınınkini yönetici ya da bayinin ana kullanıcısı da girebilir. Bir bildirim dağıtımındaki SMS'ler tek Netgsm isteğinde gider; metin firma adı + başlık + mesaj + portal bağlantısı, en fazla 300 karakter. Yalnızca bilgilendirme mesajı (İYS süzgeci gönderilmez). Gönderilen / gönderilemeyen SMS sayısı ve son hata SMS ayarlarında, her çağrı İzleme → Dış servislerde görünür. Aynı Netgsm hesabıyla toplu SMS de gönderilir ([5. bölüm](05-teklif-satis-pazarlama.md)); ticari toplu SMS'in ret metni de Ayarlar → SMS'te.
- **Toplu yazma** (`2197736`): bildirimler tek sorguyla, tekrar engelleme anahtarıyla yazılır; e-posta ve push arka planda toplu gider.
- **Saklama** (`3bf45bf`; okunmamışlar 6 Kasım'dan): okunmuş bildirimler 90, okunmamışlar 180 gün sonra saatlik işle 5000'lik parçalar hâlinde silinir. Tekrar engelleme anahtarı olanlar (ör. vade hatırlatması) silinmez; silinseler aynı hatırlatma yeniden giderdi.

## Hata izleme (`117006d`)

- Sunucu (5xx, yakalanmamış ve loglanan) ve tarayıcı hataları gruplanır.
- İlk kez görülen hata için `PLATFORM_ALERT_EMAIL` adresine e-posta gider.
- Platform panelinde "Hatalar" sayfası: inceleme, çözüldü işareti.
- Sayfa çökerse kullanıcı boş ekran yerine yenileme seçenekli bir hata ekranı görür.

## Platform izleme (`cad46b7`)

- Uç bazında dakikalık istek sayısı, süre ve hata oranı; 1 saniyeden yavaş istek örnekleri.
- Arka plan işleri, dış servis çağrıları (iyzico, PayTR, Paraşüt, Yurtiçi, TCMB, yapay zekâ, SMTP) ve ERP API istekleri.
- **Uyarılar:** tekrarlayan hata, son 10 dakikada hata artışı, hata veren iş; aynı konu saatte en fazla bir kez. Her sabah günlük özet e-postası. İsteğe bağlı Sentry.
- Kayıtlar 7–30 gün tutulur; firma silinince izleme kayıtları da silinir.

## Yedekleme (`38e7754`, `5f9f72c`)

- Compose'daki `backup` servisi her gün veritabanını ve yüklenen dosyaları yedekler; `BACKUP_KEEP_DAYS` (varsayılan 14) günden eskiler silinir.
- Geri yükleme betiği; yedek doğrulama ve isteğe bağlı sunucu dışı kopya komutu. Geri yükleme denendi.
- Sistem Durumu sayfasında son yedek 26 saatten eskiyse kırmızı görünür.
- **Google Drive'a şifreli kopya (6 Kasım):** yedek servisi rclone'lu kalıpla (`deploy/Dockerfile.backup`) her yedekten sonra Drive'a kopyalar: günlük veritabanı yedeği 30 gün, her ayın ilki 12 ay; yüklenen dosyalar yalnızca değişenler gönderilerek eşitlenir, eski hâlleri 30 gün durur. İçerik ve adlar rclone crypt ile şifreli, erişim `drive.file` izniyle sınırlı. Kurulum bir kez: `scripts/drive-setup.sh`. Saat `BACKUP_TIME` (03:00).
- **Yedek geçmişi:** her çalışma `backups/.yedek-gecmisi.jsonl`'a yazılır (zaman, tetikleyen, veritabanı boyutu ve tablo sayısı, dosya sayısı, Drive bağlantısı, hata). Platform → Geliştirici → **Yedekler** sayfası geçmişi tarih aralığı ve "yalnızca hatalılar" süzgeciyle gösterir; Sistem Durumu ve günlük özet e-postası Drive kopyasını da kontrol eder.

## Canlıya çıkış hazırlığı (`5f9f72c`)

- `docker-compose.prod.yml`, `deploy/Caddyfile`, `deploy/Dockerfile.web`: HTTPS (istek anında sertifika), derlenmiş arayüz, dışarı kapalı veritabanı, üretim modunda backend.
- Ayar şablonları (`deploy/*.env.example`). `.env.production` imaja, `uploads/private` depoya girmez.
- Zorunlu ayar eksik ya da güvensizse sunucu açılmaz; `npm run check:config` nedenini önceden gösterir.
- `/health/ready` (dış izleme için; veritabanına ulaşılamazsa 503) ve platform panelinde "Sistem Durumu" (veritabanı, Redis, son yedek, kur, ayarlar).
- Adım adım rehber: [`docs/canliya-cikis.md`](../canliya-cikis.md).

## Performans (`2197736`)

Büyük ölçekli yük testinin (bkz. [9. bölüm](09-testler-kalite.md)) bulduklarına göre:

- Satış raporu ve yaşlandırma düz SQL'e çevrildi (çok siparişte parametre sınırı hatası giderildi).
- Panel, menü sayıları ve raporlar firma başına kısa süreli önbellekte; aynı anda gelen istekler tek hesabı bekler.
- Oturum kontrolündeki kullanıcı sorgusu 10 saniye önbellekte; kullanıcı ya da firma değişince hemen temizlenir.
- Eksik indeksler eklendi: sipariş kalemleri, bayinin siparişleri, sipariş listesi, ürün varyantları, özellik değerleri; bildirim tarihine indeks (`3bf45bf`).
- `WEB_CONCURRENCY` ile çok süreçli çalışma (zamanlanmış işler tek süreçte); Redis ile ortak kilitler; `DB_POOL_SIZE` / `DB_POOL_TIMEOUT` ayarları.
- Boştaki bağlantı Caddy'den sonra kapanır; 502 hataları ve yeniden bağlanma fırtınası önlendi.

## Diğer

- Kullanılmayan sayfalar kaldırıldı: `CartPage`, `BayiDashboard`, `AdminDashboard` (`74d86ee`).
- Docker imajına destek ekleri girmez; uygulama testler için `app.js` / `server.js` olarak ayrıldı (`0a726c1`).

## Commit'ler

| Commit | Tarih | Açıklama |
|---|---|---|
| `130ab59` | 27 Ekim | Satış raporları |
| `4c417c0` | 27 Ekim | Bildirim tercihleri |
| `117006d` | 27 Ekim | Hata izleme |
| `38e7754` | 27 Ekim | Günlük yedekleme |
| `5f9f72c` | 27 Ekim | Canlıya çıkış hazırlığı |
| `cad46b7` | 27 Ekim | Platform izleme |
| `115d0a1`, `5764fb8` | 2–3 Kasım | Müşteri takip raporu, Raporlar menüsü |
| `2197736` | 3 Kasım | Performans: önbellek, indeksler, çok süreç |
| `3bf45bf` | 3 Kasım | Bildirim saklama süresi |
