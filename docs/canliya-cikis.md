# Canlıya çıkış rehberi

Bu belge, Akis B2B'yi bir Linux sunucuda canlıya almak için gereken adımları sırasıyla anlatır. Kurulum Docker Compose ile yapılır. Arayüzü ve HTTPS sertifikalarını **Caddy** yönetir; veritabanı yedeği her gün otomatik alınır.

## Genel bakış

```
İnternet ──443──> web (Caddy) ──┬── statik arayüz (firma.akisb2b.com, platform.akisb2b.com, b2b.firmasi.com)
                                └── api.akisb2b.com ──> backend (Node) ──> db (PostgreSQL), redis
                       backup ── her gün 03:00 ──> ./backups ──şifreli──> Google Drive (rclone)
```

| Dosya | Görev |
|---|---|
| `docker-compose.prod.yml` | Canlı servisler: db, redis, backend, web, backup |
| `deploy/Caddyfile` | HTTPS, ters vekil, güvenlik başlıkları |
| `deploy/Dockerfile.web` | Arayüzü derleyip Caddy imajına koyar |
| `deploy/production.env.example` | Compose değişkenleri → proje kökünde `.env` |
| `deploy/backend.production.env.example` | Backend ayarları → `backend/.env.production` |

## 1. Sunucu

- Ubuntu 22.04/24.04, en az 2 vCPU, 4 GB RAM, 40 GB disk (ürün görselleri ve yedekler için büyütün).
- Docker ve Docker Compose eklentisi kurulu olmalı.
- Güvenlik duvarında yalnızca 22 (SSH), 80 ve 443 açık olmalı. Veritabanı portu dışarı açılmaz.

## 2. DNS

| Kayıt | Tür | Değer |
|---|---|---|
| `akisb2b.com` | A | sunucu IP |
| `*.akisb2b.com` | A | sunucu IP (firma alt alan adları ve platform paneli) |
| `api.akisb2b.com` | A | sunucu IP (wildcard da kapsar) |
| `custom.akisb2b.com` | A | sunucu IP (müşteriler özel alan adlarına buraya CNAME verir) |

## 3. Ayarlar

```bash
git clone … akis && cd akis
cp deploy/production.env.example .env
cp deploy/backend.production.env.example backend/.env.production
```

Doldurulacaklar:

- **`.env`:** `ROOT_DOMAIN`, `ACME_EMAIL` (sertifika uyarıları için), `POSTGRES_PASSWORD` (`openssl rand -base64 32`).
- **`backend/.env.production`:** zorunlu olanlar `JWT_SECRET`, `ENCRYPTION_KEY`, `ROOT_DOMAIN`, `FRONTEND_PROTOCOL=https`, `API_PUBLIC_URL` ve ilk kurulum için `PLATFORM_ADMIN_*`.

> **ENCRYPTION_KEY bir kez belirlenir, sonra değiştirilmez.** Firmaların sanal POS, e-fatura ve kargo anahtarları bununla şifrelenir; değişirse çözülemez. Daha önce ENCRYPTION_KEY olmadan çalışmış bir kurulumda kayıtlı anahtar varsa, ENCRYPTION_KEY'e mevcut JWT_SECRET değerini yazın.

Ayarları kontrol edin. Zorunlu ayar eksik veya güvensizse sunucu zaten açılmaz; bu komut nedenini önceden gösterir:

```bash
docker compose -f docker-compose.prod.yml run --rm backend npm run check:config
```

## 4. Başlatma

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f backend   # "Server is running" görünmeli
```

İlk açılışta migration'lar uygulanır ve boş veritabanında paketler ile platform yöneticisi oluşturulur.

**İlk kontroller:**

1. `https://platform.akisb2b.com` adresinde `PLATFORM_ADMIN_EMAIL` ile giriş yapın. Şifrenizi değiştirin ve **Güvenlik** sayfasından iki aşamalı doğrulamayı açın.
2. **Sistem Durumu** sayfasında veritabanı, Redis, son yedek ve döviz kuru yeşil görünmeli. Ortam ayarlarındaki uyarıları okuyun.
3. Kök alan adında deneme firması açın; `firma.akisb2b.com` adresinin HTTPS ile açıldığını görün. İlk istekte sertifika alındığı için birkaç saniye sürebilir.

## 5. İzleme

- **Dış izleme:** UptimeRobot, Better Stack gibi bir servise `https://api.akisb2b.com/health/ready` adresini ekleyin. Veritabanına ulaşılamazsa 503 döner. Kontrol aralığı 1–5 dakika olabilir, uyarı e-posta veya SMS ile gelmeli.
- **Uygulama hataları:** Platform → **Hatalar**. Yeni bir hata ilk görüldüğünde `PLATFORM_ALERT_EMAIL` adresine e-posta gider; bunun için SMTP tanımlı olmalı.
- **İzleme (Platform → Geliştirici → İzleme):** uç bazında istek sayısı, süre ve hata oranı; yavaş istekler (1 sn üzeri); arka plan işleri; dış servis çağrıları (iyzico, PayTR, Paraşüt, Yurtiçi, TCMB, yapay zekâ, SMTP); ERP API istekleri. Kayıtlar 7–30 gün tutulur.
- **Uyarı e-postaları** (`PLATFORM_ALERT_EMAIL`): yeni hata, "çözüldü" işaretlenen hatanın tekrarlaması, son 10 dakikada `ALERT_ERROR_SPIKE` (varsayılan 30) sunucu hatası ve hata veren arka plan işi için gönderilir. Aynı konu saatte en fazla bir kez gelir. Her sabah `DIGEST_HOUR` (varsayılan 08:00) saatinde günlük özet gider; kapatmak için `DAILY_DIGEST=false`.
- **Sentry (isteğe bağlı):** `npm install @sentry/node` yapıp `SENTRY_DSN` tanımlayın.
- **Yedekler (Platform → Geliştirici → Yedekler):** her yedeklemenin zamanı, alınan veritabanı ve dosyalar, Google Drive bağlantısı ve varsa hatası. Sistem Durumu'nda son yedek ya da son Drive kopyası 26 saatten eskiyse kırmızı görünür; günlük özet e-postası da ikisini raporlar ve sorun varsa "kontrol edilmesi gerekenler var" konusuyla gelir.
- **Disk:** `df -h` ile disk doluluğunu izleyin. Yedekler `BACKUP_KEEP_DAYS` (varsayılan 14) günden sonra silinir.

## 6. Yedekleme ve geri yükleme

`backup` servisi açılışta ve her gün `BACKUP_TIME`'da (varsayılan 03:00; bayilerin çalışmadığı saat) çalışır:

- `backups/db-*.dump`: veritabanı yedeği. Alındıktan sonra okunabildiği ve tablo verisi içerdiği doğrulanır.
- `backups/uploads-*.tar.gz`: yüklenen dosyalar (ürün görselleri, destek ekleri, cari belgeleri).
- Sunucuda `BACKUP_KEEP_DAYS` (14) gün saklanır. Her çalışmanın kaydı (ne alındı, Drive kopyası, hata) `backups/.yedek-gecmisi.jsonl`'a yazılır ve **Platform → Geliştirici → Yedekler**'de görünür.

### Google Drive'a şifreli kopya

**Sunucu dışı kopya şarttır;** sunucu kaybolursa yerel yedek de kaybolur. Yedek servisi her yedekten hemen sonra rclone ile Google Drive'a kopyalar:

| Drive'da | Ne | Saklama |
|---|---|---|
| `gunluk/` | Her günün veritabanı yedeği | `BACKUP_DRIVE_KEEP_DAYS` (30) gün |
| `aylik/` | Her ayın ilk veritabanı yedeği | `BACKUP_DRIVE_KEEP_MONTHS` (12) ay |
| `dosyalar/` | Yüklenen dosyalar; her gece yalnızca yeni / değişenler gider | Güncel hâl |
| `dosyalar-eski/<zaman>/` | Değişen ya da silinen dosyanın önceki hâli | 30 gün |

İçerik ve dosya adları şifrelenir (rclone crypt): Drive hesabı ele geçse de yedek okunamaz. Erişim `drive.file` izniyle sınırlıdır; rclone Drive'da yalnızca kendi oluşturduğu `Akis-B2B-Yedek` klasörünü görür. Silinen eski yedekler çöp kutusuna gitmez (kotayı doldurmasın). Ücretsiz Drive 15 GB'tır; Yedekler sayfasındaki boyutlara göre (30 günlük + 12 aylık veritabanı yedeği + dosyalar) gerekirse Google One ile büyütün ya da süreleri kısaltın.

**Kurulum (bir kez, ~5 dakika):**

1. Tarayıcısı olan bir bilgisayarda rclone kurun (Mac: `brew install rclone`; diğerleri: rclone.org/install). Yedeklerin gideceği Google hesabıyla giriş yapın; ekrana yazılan `{"access_token":...}` satırını kopyalayın:

   ```bash
   rclone authorize "drive" "eyJzY29wZSI6ImRyaXZlLmZpbGUifQ"
   ```

2. Sunucuda, proje klasöründe:

   ```bash
   docker compose -f docker-compose.prod.yml up -d --build backup            # rclone'lu yedek kalıbı
   docker compose -f docker-compose.prod.yml exec backup /scripts/drive-setup.sh '<kopyalanan satır>'
   docker compose -f docker-compose.prod.yml exec backup /scripts/backup.sh  # ilk kopyayı hemen al
   ```

   Kurulum bir deneme dosyasını şifreleyip yükler, geri okur ve siler. Sonunda **yedek şifresi** bir kez gösterilir: parola yöneticisine kaydedin. Sunucu kaybolursa Drive'daki yedekler yalnızca bu şifreyle açılır. rclone ayarı (Google girişi + şifreleme anahtarı) sunucuda `rclone/rclone.conf`'tadır, git'e girmez.

3. Platform → Yedekler'de son satırda "Drive'da aç" bağlantısını ve Drive'da `Akis-B2B-Yedek` klasörünü görün.

Google girişi geçersiz olursa (şifre değiştirildi, erişim kaldırıldı) Yedekler sayfasında ve günlük özette Drive hatası görünür. 1. adımı tekrarlayıp `drive-setup.sh '<yeni satır>' --yenile` çalıştırın; yedek şifresi değişmez.

### Geri yükleme

Önce mutlaka ayrı bir veritabanına yükleyip kontrol edin:

```bash
# Sunucudaki yedekten
docker compose -f docker-compose.prod.yml exec backup /scripts/restore.sh /backups/db-YYYYMMDD-HHMMSS.dump kontrol_db
# Drive'daki yedekten: önce listele ve sunucuya indir (şifre otomatik çözülür)
docker compose -f docker-compose.prod.yml exec backup rclone lsl yedek:gunluk     # aylıklar: yedek:aylik
docker compose -f docker-compose.prod.yml exec backup rclone copy yedek:gunluk/db-YYYYMMDD-HHMMSS.dump /backups/
# kontrol ettikten sonra asıl veritabanına (MEVCUT VERİ SİLİNİR):
docker compose -f docker-compose.prod.yml stop backend
docker compose -f docker-compose.prod.yml exec backup /scripts/restore.sh /backups/db-YYYYMMDD-HHMMSS.dump
tar -xzf backups/uploads-YYYYMMDD-HHMMSS.tar.gz -C backend/uploads
#   ya da dosyaları Drive'dan:
docker compose -f docker-compose.prod.yml run --rm --entrypoint rclone -v ./backend/uploads:/geri backup copy yedek:dosyalar /geri
docker compose -f docker-compose.prod.yml start backend
```

**Sunucu tamamen kaybolduysa:** yeni sunucuyu bu rehberle kurun, 1. adımdaki satırı alın ve eski şifreyle bağlanın; sonra yukarıdaki gibi indirip geri yükleyin:

```bash
docker compose -f docker-compose.prod.yml exec -e YEDEK_SIFRESI='<kayıtlı şifre>' backup /scripts/drive-setup.sh '<satır>'
```

**Ek komut:** `BACKUP_POST_CMD` tanımlanırsa her yedekten sonra yedek konteynerinde çalışır (ör. ikinci bir depoya kopya). Başarısız olursa yedek geçmişinde hata görünür.

> Geri yükleme 27.10.2026'da geliştirme ortamında denendi: yedekten ayrı bir veritabanına yüklenen verinin tablo sayıları ve migration listesi birebir tuttu; dosya arşivinde cari belgeleri klasörü de vardı. Canlıda ilk haftada bir kez daha deneyin. Drive'dan geri yükleme de canlıda bir kez denenmeli (Yedekler sayfasının altında komutlar var).

## 7. Güncelleme

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build    # migration'lar açılışta otomatik uygulanır
```

Büyük güncellemeden önce elle yedek alın:

```bash
docker compose -f docker-compose.prod.yml exec backup /scripts/backup.sh
```

## 8. Gerçek hesaplarla denenmesi gerekenler

Bunlar kodda hazır, ancak gerçek hesap olmadan doğrulanamadı. Canlıya çıkmadan önce birer kez deneyin:

| Konu | Gerekli | Nasıl denenir |
|---|---|---|
| E-posta | `SMTP_*` | Şifremi unuttum → e-posta gelmeli; bir teklifi e-postayla gönderin |
| Toplu e-posta | `SMTP_*`, SPF / DKIM / DMARC | Müşteriler → Toplu E-posta → Kendime deneme: gelen kutusuna düşmeli, gönderen firmanın adı, yanıt firmanın adresi olmalı. Kendi adreslerinize küçük bir gönderim yapıp abonelikten çıkma bağlantısını deneyin. SMTP sağlayıcınızın günlük sınırına göre `BULK_MAIL_DAILY_LIMIT` / `BULK_MAIL_PER_MINUTE` ayarlayın |
| Yapay zekâ ile teklif | `AI_API_KEY` | Teklifler → Yeni Teklif → gerçek ürünlerinizle bir talep yazın; önerileri kontrol edin |
| Google ile giriş | `GOOGLE_CLIENT_*` | Firma girişinde ve `/giris`'te "Google ile giriş yap" → portalda kayıtlı e-postanın Google hesabıyla girin; kayıtlı olmayan bir Google hesabıyla girişin reddedildiğini görün |
| Telefona bildirim | `VAPID_*`, HTTPS | Telefonda portalı açın → Uygulamayı Yükle → bildirim izni → bilgisayardan siparişi onaylayın |
| Sanal POS | firmanın iyzico/PayTR hesabı | Bayi olarak küçük bir tutarla kartla ödeyin; cariye işlendiğini görün. Taksit açacaksanız Ayarlar → Sanal POS → Taksit'i ve sağlayıcı panelindeki vade farkı ayarını yapıp taksitli bir ödeme deneyin (cariye net tutar işlenmeli) |
| Abonelik tahsilatı | `IYZICO_*` (canlı) | Deneme firmasıyla paket satın alın; Paketler → iyzico eşlemesini yapın |
| E-fatura | Paraşüt hesabı (test şirketi) | Ayarlar → E-Fatura → bağlantı testi; bir e-arşiv ve bir e-fatura kesin |
| Kargo | Yurtiçi hesabı | Bir siparişte gönderi oluşturup etiket yazdırın |
| SMS (isteğe bağlı) | firmanın Netgsm hesabı | Ayarlar → SMS → bağlantı testi ve deneme SMS'i; bir sipariş onayında bayiye SMS gelmeli. Müşteriler → Toplu SMS ile kendinize bilgilendirme mesajı; ticari gönderimden önce İYS süzgeç değerlerini Netgsm'den teyit edin. Netgsm API kullanıcısında IP kısıtı varsa sunucunun IP'sini ekleyin |

## 9. Bilinen sınırlar

- **Sertifika sınırı:** Her firma alt alan adı ilk istekte kendi sertifikasını alır. Let's Encrypt aynı ana alan adı için haftada en fazla 50 yeni sertifika verir. Haftada 50'den fazla yeni firma beklenirse wildcard sertifikaya (DNS doğrulaması, Caddy'nin DNS sağlayıcı eklentisiyle) geçin.
- **Tek sunucu:** Bu kurulum tek sunucu içindir. Birden fazla backend örneği için `REDIS_URL` zaten tanımlıdır (istek sınırları ve zamanlanmış işler paylaşılır). Yüklenen dosyalar için ortak depolama gerekir.
- **Aşırı yük:** bir işçi süreç aynı anda 100'den fazla istek işliyorsa (`MAX_INFLIGHT`) yenilere anında 503 "sistem çok yoğun" döner; ön yüz okuma isteklerini birkaç saniye sonra kendiliğinden yeniden dener. Veritabanına ulaşılamazsa da istekler birkaç saniye veritabanına gitmeden 503 alır. Caddy backend'e en fazla 1024 kalıcı bağlantı açar (`deploy/Caddyfile`); `WEB_CONCURRENCY` 10'u geçerse bu sınırı da artırın. Kayıt dosyaları servis başına 5 × 20 MB ile sınırlıdır (`docker-compose.prod.yml`).
- **Performans:** 10.000 ürün, 500 cari, 5.000 sipariş ve 8.000 cari hareketle ölçüldü (27.10.2026). Ekranların çoğu 15 ms altında; teklif katalog araması ~100–150 ms, gecikmiş alacaklar raporu ~50 ms. 5.11.2026'da tek firmada 50 bin ürün, 10 bin bayi ve 600 bin siparişle yük testi yapıldı; katalog araması ve sıralaması için indeksler eklendi (`pg_trgm` eklentisi migration'la kurulur). Bu boyutta tüm veri dışa aktarımı dakikalar sürer. Ayrıntı: `loadtest/README.md`.
