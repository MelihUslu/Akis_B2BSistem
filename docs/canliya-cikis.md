# Canlıya çıkış rehberi

Bu belge, Akis B2B'yi bir Linux sunucuda canlıya almak için gereken adımları sırasıyla anlatır. Kurulum Docker Compose ile yapılır. Arayüzü ve HTTPS sertifikalarını **Caddy** yönetir; veritabanı yedeği her gün otomatik alınır.

## Genel bakış

```
İnternet ──443──> web (Caddy) ──┬── statik arayüz (firma.akisb2b.com, platform.akisb2b.com, b2b.firmasi.com)
                                └── api.akisb2b.com ──> backend (Node) ──> db (PostgreSQL), redis
                       backup ── her gün 03:00 ──> ./backups  (+ isteğe bağlı sunucu dışı kopya)
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
- **Sistem Durumu:** Son yedek 26 saatten eskiyse kırmızı görünür.
- **Disk:** `df -h` ile disk doluluğunu izleyin. Yedekler `BACKUP_KEEP_DAYS` (varsayılan 14) günden sonra silinir.

## 6. Yedekleme ve geri yükleme

`backup` servisi açılışta ve her gün 03:00'te iki dosya üretir:

- `backups/db-*.dump`: veritabanı yedeği. Yedek alındıktan sonra okunabilir olduğu doğrulanır.
- `backups/uploads-*.tar.gz`: yüklenen dosyalar (ürün görselleri, destek ekleri, cari belgeleri).

**Sunucu dışı kopya şarttır;** sunucu kaybolursa yerel yedek de kaybolur. İki yol var:

- Sunucunun kendi cron'u ile (önerilen):

  ```bash
  # rclone ile S3 / Backblaze / Google Drive vb. (bir kez: rclone config)
  15 3 * * * rclone copy /opt/akis/backups yedek:akis-yedek --max-age 48h
  ```

- `BACKUP_POST_CMD` ile: yedek servisi her yedekten sonra bu komutu çalıştırır. Komut, yedek konteynerinde bulunan araçlarla yazılmalıdır; rclone gibi ek araç gerekiyorsa cron yolunu kullanın.

**Geri yükleme** (önce mutlaka ayrı bir veritabanına yükleyip kontrol edin):

```bash
docker compose -f docker-compose.prod.yml exec backup /scripts/restore.sh /backups/db-YYYYMMDD-HHMMSS.dump kontrol_db
# kontrol ettikten sonra asıl veritabanına (MEVCUT VERİ SİLİNİR):
docker compose -f docker-compose.prod.yml stop backend
docker compose -f docker-compose.prod.yml exec backup /scripts/restore.sh /backups/db-YYYYMMDD-HHMMSS.dump
tar -xzf backups/uploads-YYYYMMDD-HHMMSS.tar.gz -C backend/uploads
docker compose -f docker-compose.prod.yml start backend
```

> Geri yükleme 27.10.2026'da geliştirme ortamında denendi: yedekten ayrı bir veritabanına yüklenen verinin tablo sayıları ve migration listesi birebir tuttu; dosya arşivinde cari belgeleri klasörü de vardı. Canlıda ilk haftada bir kez daha deneyin.

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
| Yapay zekâ ile teklif | `AI_API_KEY` | Teklifler → Yeni Teklif → gerçek ürünlerinizle bir talep yazın; önerileri kontrol edin |
| Telefona bildirim | `VAPID_*`, HTTPS | Telefonda portalı açın → Uygulamayı Yükle → bildirim izni → bilgisayardan siparişi onaylayın |
| Sanal POS | firmanın iyzico/PayTR hesabı | Bayi olarak küçük bir tutarla kartla ödeyin; cariye işlendiğini görün |
| Abonelik tahsilatı | `IYZICO_*` (canlı) | Deneme firmasıyla paket satın alın; Paketler → iyzico eşlemesini yapın |
| E-fatura | Paraşüt hesabı (test şirketi) | Ayarlar → E-Fatura → bağlantı testi; bir e-arşiv ve bir e-fatura kesin |
| Kargo | Yurtiçi hesabı | Bir siparişte gönderi oluşturup etiket yazdırın |

## 9. Bilinen sınırlar

- **Sertifika sınırı:** Her firma alt alan adı ilk istekte kendi sertifikasını alır. Let's Encrypt aynı ana alan adı için haftada en fazla 50 yeni sertifika verir. Haftada 50'den fazla yeni firma beklenirse wildcard sertifikaya (DNS doğrulaması, Caddy'nin DNS sağlayıcı eklentisiyle) geçin.
- **Tek sunucu:** Bu kurulum tek sunucu içindir. Birden fazla backend örneği için `REDIS_URL` zaten tanımlıdır (istek sınırları ve zamanlanmış işler paylaşılır). Yüklenen dosyalar için ortak depolama gerekir.
- **Performans:** 10.000 ürün, 500 cari, 5.000 sipariş ve 8.000 cari hareketle ölçüldü (27.10.2026). Ekranların çoğu 15 ms altında; teklif katalog araması ~100–150 ms, gecikmiş alacaklar raporu ~50 ms. Bundan çok daha büyük kataloglarda (100 bin+ ürün) ürün araması için PostgreSQL metin indeksi gerekebilir.
