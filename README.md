# Akis B2B — Çok Kiracılı B2B Bayi Portalı (SaaS)

Toptancı / üretici firmaların bayilerine online sipariş, cari, ödeme ve teklif süreçlerini sunduğu B2B portal.
Tek kurulumda çok sayıda firma (kiracı) çalışır. Her firmanın kendi adresi (`firma.akisb2b.com` ya da kendi alan adı `b2b.firmasi.com`), kendi yöneticileri, bayileri ve verisi vardır.

| Kim | Nerede | Ne yapar |
|---|---|---|
| **Platform sahibi** | `platform.ROOT_DOMAIN` | Müşteri firmaları, paketleri, abonelik ödemelerini, duyuruları ve destek taleplerini yönetir |
| **Firma yöneticisi** (müşteri) | `<firma>.ROOT_DOMAIN/admin` | Ürün, bayi, sipariş, finans, kampanya, ekip, entegrasyon ve sanal POS ayarları |
| **Bayi** | `<firma>.ROOT_DOMAIN/bayi` | Katalog, sepet, sipariş, teklif isteme, iade, cari ekstre, kartla ödeme |
| **Tanıtım / kayıt** | `ROOT_DOMAIN` | Paketler ve kendi kendine kayıt (deneme süresiyle) |

## Teknolojiler

- **Backend:** Node.js 20, Express 5, Prisma 5 (PostgreSQL 15), JWT, bcrypt, nodemailer, ioredis (isteğe bağlı)
- **Frontend:** React 19, Vite, Tailwind CSS v4, React Router, Recharts, dnd-kit, lucide-react
- **Ödeme:** iyzico (platform abonelikleri), firmaların kendi iyzico veya PayTR sanal POS'u (bayi tahsilatı)
- **Altyapı:** Docker Compose (db + redis + backend + frontend)

## Hızlı başlangıç (geliştirme)

```bash
cp backend/.env.example backend/.env       # JWT_SECRET ve PLATFORM_ADMIN_* alanlarını doldurun
cp frontend/.env.example frontend/.env
docker compose up --build
```

İlk açılışta `backend/entrypoint.sh` migration'ları uygular, veritabanı boşsa seed çalıştırır (paketler + platform yöneticisi; `SEED_DEMO=true` ise `demo` firması).

| Adres | Açıklama |
|---|---|
| http://localhost:5173 | Tanıtım ve kayıt sayfası |
| http://platform.localhost:5173 | Platform paneli (`PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD`) |
| http://demo.localhost:5173 | Demo firma: `admin@demo.com` / `demo12345`, bayi `bayi1@demo.com` / `bayi12345` |
| http://localhost:5001/health | Backend sağlık kontrolü |

`*.localhost` adresleri modern tarayıcılarda ek ayar olmadan 127.0.0.1'e gider.

Bağımlılık ekledikten sonra konteynerdeki `node_modules` hacmini yenilemek için: `docker compose up --build -V backend`.

### Docker'sız çalıştırma

```bash
cd backend && npm ci && npx prisma migrate deploy && node prisma/seed.js && npm run dev
cd frontend && npm ci && npm run dev
```

### Şema değişikliği

```bash
cd backend
npx prisma migrate dev --name aciklama     # yeni migration üretir ve uygular
# Docker'daki veritabanına uygulamak için:
docker compose exec backend sh -c "npx prisma migrate deploy && npx prisma generate" && docker compose restart backend
```

## Testler

```bash
cd backend
npm test                     # birim testleri: fiyat/iskonto/KDV, TOTP, şifreleme, imzalar (veritabanı gerekmez)
# Kiracı izolasyonu: boş bir test veritabanı verin (tablolar oluşturulur, test verisi sonunda silinir)
TEST_DATABASE_URL=postgresql://akis:akis_dev_password@localhost:5433/akis_test npm run test:integration
```

Her push'ta GitHub Actions (`.github/workflows/ci.yml`) testleri ve arayüz derlemesini çalıştırır.

## Mimari

```
backend/src
├── server.js               Express uygulaması, rotalar
├── config.js               Ortam değişkenleri, alan adı yardımcıları
├── middlewares/            tenantMiddleware (firma çözümleme), authMiddleware (JWT, yetki), rateLimit, apiKeyAuth
├── controllers/            HTTP uçları
├── routes/                 Express router'ları
├── services/               İş kuralları: fiyat, varyant, abonelik, iyzico, PayTR, webhook, bildirim, işlem kaydı, 2FA…
└── utils/prisma.js         Kiracı izolasyonu yapan Prisma istemcisi
frontend/src
├── App.jsx                 Mod seçimi (root / platform / tenant) ve sayfa rotaları (lazy yükleme)
├── layouts/                AdminLayout, BayiLayout
├── pages/{admin,bayi,platform,root,print}
├── components/             Ortak bileşenler (settings/, shared/, admin/, bayi/)
├── context/                Auth, Tenant, Cart, Theme
└── services/api.js         api (firma), platformApi, publicApi
```

### Çok kiracılılık

1. Frontend firmayı adresten bulur: alt alan adı → `X-Tenant: <slug>` başlığı; özel alan adı → `X-Tenant-Host: <host>`.
2. `resolveTenant` firmayı bulur ve isteği `AsyncLocalStorage` içinde o firmanın bağlamında çalıştırır.
3. `utils/prisma.js` Prisma uzantısı, kiracıya ait tüm modellerin sorgularına `tenantId` filtresini **otomatik** ekler; bağlam yoksa sorgu hata verir. Böylece bir firmanın verisi diğerine sızamaz.
4. Platform uçları `runAsPlatform` ile tüm firmalara erişir.
5. JWT içinde `tenantId` bulunur; başka firmanın adresinde kullanılan token reddedilir.

### Abonelik ve erişim

`TRIAL → ACTIVE ↔ PAST_DUE (3 gün tolerans) → SUSPENDED / CANCELLED`. Erişimi kapanan firmanın bayileri giriş yapamaz, yönetici yalnızca abonelik sayfasına yönlendirilir (HTTP 402). Paket limitleri (bayi, ürün, yönetici sayısı, özel alan adı) `limitService` ile uygulanır.

### Güvenlik

- **İki aşamalı doğrulama (TOTP):** Firma yöneticileri (Hesabım) ve platform yöneticisi (Güvenlik) için; 8 adet tek kullanımlık kurtarma kodu.
- **İşlem kaydı:** Girişler, başarısız denemeler ve tüm değişiklik istekleri `AuditLog` tablosuna yazılır (şifre / anahtar alanları maskelenir). Firma kendi kaydını Ayarlar → İşlem Kaydı'nda, platform tümünü görür.
- **Müşteri olarak giriş:** Platform yöneticisi destek için firma sahibinin yetkisiyle 1 saatlik oturum açabilir. Firma sahibine bildirim gider, her işlem "destek oturumu" etiketiyle kaydedilir; bu oturumda şifre, 2FA ve hesap kapatma işlemleri yapılamaz.
- **İstek sınırlama:** Giriş, kayıt ve doğrulama uçlarında. `REDIS_URL` verilirse sayaçlar Redis'te tutulur (birden çok backend örneği aynı sınırı paylaşır); Redis'e ulaşılamazsa bellek içi sayaca düşer.
- **Hata izleme:** Sunucu (5xx, yakalanmamış ve loglanan hatalar) ve tarayıcı hataları `ErrorLog`'da gruplanır; ilk kez görülen hata `PLATFORM_ALERT_EMAIL`'e bildirilir. Platform panelinde "Hatalar" sayfasından incelenip çözüldü işaretlenir. Bir sayfa çökerse kullanıcı boş ekran yerine yenileme seçenekli bir hata ekranı görür.
- **Webhook kuyruğu ve zamanlanmış işler:** Her webhook gönderimi kaydedilir; başarısız olanlar 1 dk → 6 sa aralıklarla 6 kez denenir (panelde gönderim kaydı ve "yeniden gönder"). Kayıt kilidi sayesinde birden çok sunucuda tek gönderim yapılır. Saatlik hatırlatmalar ve kargo senkronu, Redis varsa tek sunucuda çalışır (`utils/redis.js` → `withJobLock`).
- POS gizli anahtarları AES-256-GCM ile şifrelenir (`ENCRYPTION_KEY`).
- **Güvenlik başlıkları:** API `helmet` ile sıkı içerik politikası, iframe engeli ve `nosniff` döndürür; arayüz başlıkları ters vekilde (aşağıdaki Caddy örneği) verilir. Görsel olmayan yüklemeler indirme olarak sunulur.
- **Şifre sıfırlama ve oturumlar:** "Şifremi unuttum" bağlantısı tek kullanımlık ve 1 saat geçerlidir (yalnızca özeti saklanır). Şifre değişince o kullanıcının diğer cihazlardaki oturumları kapanır.

### KVKK: veri dışa aktarma ve hesap kapatma

- Firma, Ayarlar → Veri & Hesap'tan tüm verisini Excel olarak indirebilir.
- Firma sahibi hesabı kapatabilir: abonelik iptal edilir, erişim kapanır, veri 30 gün saklanır. Platform bu sürede hesabı geri açabilir.
- `AUTO_PURGE_CLOSED=true` ise süresi dolan hesapların verisi saatlik iş tarafından kalıcı silinir. Platform panelinden elle de silinebilir.

### Teslimat adresleri ve kargo

Bayi, profilinden birden fazla teslimat adresi (il / ilçe ayrı) tanımlar ve siparişte seçer; seçilen adres siparişe kopyalanır. Firma, Ayarlar → Kargo'dan **Yurtiçi Kargo** web servisini bağlarsa sipariş ekranından tek tıkla gönderi oluşturur ve 10×15 barkodlu etiketi yazdırır. Kargo paketi teslim alınca takip numarası (yarım saatte bir ya da "Durumu güncelle" ile) otomatik gelir, sipariş "Kargoda", teslimde "Teslim edildi" olur ve bayiye bildirilir. Diğer kargo firmalarında takip numarası elle girilir. Yurtiçi istemcisi, Yurtiçi'nin herkese açık test servisine karşı denenmiştir (`YURTICI_LIVE=1 npm run test:integration`).

### Çoklu depo

Ayarlar → Depolar'dan depo eklenince stok depo bazında tutulur (ilk depo eklenince mevcut stoklar ona aktarılır); `Product.stock` tüm depoların toplamıdır ve bayi toplamı görür. Sipariş onaylanırken karşılanacak depo seçilir, stok o depodan düşer; kalem iptali ve iade aynı depoya geri yazılır. Depolar arası transfer yapılabilir. Excel'de "Depo" sütunu, ERP'de `warehouse` alanı (depo kodu) ile depo bazında stok güncellenir; depo verilmezse toplam stok güncellenir ve fark varsayılan depoya yazılır. Tüm stok değişiklikleri `services/stockService.js` üzerinden geçer.

### E-fatura / e-arşiv

Firma, Ayarlar → E-Fatura'dan yöntemi seçer:

- **Paraşüt ile otomatik:** Fatura Paraşüt'te oluşturulur; alıcının vergi numarası GİB e-fatura listesindeyse e-fatura, değilse e-arşiv gönderilir. Elle, sipariş onaylanınca ya da kargolanınca kesilebilir. Hata olursa sipariş ekranında görünür ve yeniden denenir.
- **ERP'den veya elle:** ERP faturayı keser ve numara/PDF adresini `PUT /api/v1/orders/{id}/invoice` ile yazar ya da yönetici sipariş ekranından girer.

Fatura kesilince bayiye bildirim ve `invoice.issued` webhook'u gider; bayi sipariş detayında PDF'i açar. Platformun abonelik faturaları `PARASUT_*` ortam değişkenleri tanımlıysa ödeme alınınca otomatik kesilir.

> Paraşüt akışı, testlerde Paraşüt API'sini taklit eden bir sunucuyla doğrulanmıştır. Canlıya almadan önce gerçek bir Paraşüt hesabıyla (tercihen test şirketi) bir e-arşiv ve bir e-fatura kesilerek denenmelidir.

### Çoklu dil (bayi portalı)
Bayi portalı, giriş ve başvuru sayfaları Türkçe / İngilizce kullanılabilir (üst bardaki TR/EN seçici; seçim tarayıcıda saklanır). Firma paneli ve platform paneli Türkçedir.
- Arayüz: `frontend/src/i18n` — anahtar Türkçe metnin kendisidir: `t('Sepete Ekle')`, yer tutucular `t('{n} kalem', { n })`. Çevirisi olmayan metin Türkçe görünür. Yeni dil için `xx.js` sözlüğü ekleyip `DICTS` ve `LANGUAGES`'a ekleyin.
- API: istemci `X-Lang` başlığı gönderir; `backend/src/i18n` yanıttaki `message` alanını sözlükte varsa çevirir (controller'lar Türkçe yazmaya devam eder).
- Tarih biçimi seçili dile göre değişir; tutarlar ₺ olarak kalır.

### Entegrasyon (ERP)

Firma, Ayarlar → Entegrasyon'dan API anahtarı üretir. `/api/v1` uçları ile ürün / stok / fiyat / bayi aktarımı yapılır, siparişler (teslimat adresi, depo ve fatura bilgisiyle) çekilir, kargo ve fatura bilgisi geri yazılır. İmzalı (HMAC-SHA256) webhook'lar sipariş, ödeme, iade ve fatura olaylarını ERP'ye iletir.

**API dokümanı:** her firma portalında `/developer` sayfası (giriş gerektirmez; ERP yazılımcısıyla paylaşılır). Makine okunur tanım: `GET /api/v1/openapi.json` (OpenAPI 3.1, Redocly ile doğrulanmıştır; Postman / kod üreticilere içe aktarılabilir).

## Ortam değişkenleri

### backend/.env

| Değişken | Zorunlu | Açıklama |
|---|---|---|
| `DATABASE_URL` | ✓ | PostgreSQL bağlantısı (Docker'da compose verir) |
| `JWT_SECRET` | ✓ | Uzun rastgele değer (`openssl rand -base64 48`) |
| `ENCRYPTION_KEY` | canlıda ✓ | POS anahtarlarının şifreleme anahtarı. Sonradan değiştirilirse kayıtlı anahtarlar çözülemez |
| `ROOT_DOMAIN` | ✓ | Kök alan adı (geliştirmede `localhost`) |
| `FRONTEND_PROTOCOL`, `FRONTEND_PORT` | | E-posta ve yönlendirme linkleri için (canlıda `https` ve boş port) |
| `API_PUBLIC_URL` | ✓ | Backend'in dış adresi (iyzico/PayTR geri dönüşleri, dosya linkleri) |
| `PLATFORM_ADMIN_EMAIL`, `PLATFORM_ADMIN_PASSWORD`, `PLATFORM_ADMIN_NAME` | ilk kurulum | Seed ile oluşturulan platform yöneticisi |
| `PLATFORM_NAME`, `PLATFORM_ALERT_EMAIL` | | Marka adı; yeni kayıt / destek / ödeme hatası bildirim adresi |
| `SEED_DEMO` | | `true` ise demo firması oluşturulur |
| `IYZICO_API_KEY`, `IYZICO_SECRET_KEY`, `IYZICO_BASE_URL` | | Abonelik tahsilatı. Boşsa ödemeler platform panelinden elle işlenir |
| `SMTP_*`, `MAIL_FROM` | | E-posta. Boşsa içerik konsola yazılır |
| `REDIS_URL` | | İstek sınırlayıcı için Redis |
| `CUSTOM_DOMAIN_TARGET` | | Özel alan adlarının CNAME hedefi (varsayılan `custom.ROOT_DOMAIN`) |
| `AUTO_PURGE_CLOSED` | | Kapatılan hesapların 30 gün sonra otomatik silinmesi |
| `PARASUT_*`, `SUBSCRIPTION_VAT_RATE` | | Platformun abonelik faturaları (Paraşüt) |
| `TZ` | | Tarih filtreleri ve raporların saat dilimi (varsayılan `Europe/Istanbul`) |

### frontend/.env

| Değişken | Açıklama |
|---|---|
| `VITE_API_URL` | Backend adresi + `/api` (ör. `https://api.akisb2b.com/api`) |
| `VITE_ROOT_DOMAIN` | Backend'deki `ROOT_DOMAIN` ile aynı |
| `VITE_DEFAULT_TENANT` | Alt alan adı kullanılamayan ortamda (IP ile erişim) açılacak firma |
| `VITE_PLATFORM_NAME`, `VITE_SUPPORT_EMAIL`, `VITE_SUPPORT_PHONE` | Marka ve bayi panelindeki destek kutusu |

## Canlıya alma

1. **DNS:** `akisb2b.com`, `*.akisb2b.com` (wildcard) ve `api.akisb2b.com` kayıtlarını sunucuya yönlendirin. Özel alan adı satıyorsanız `custom.akisb2b.com` da sunucuyu göstersin; müşteriler kendi alan adlarına buraya CNAME verir.
2. **Ortam:** `ROOT_DOMAIN=akisb2b.com`, `FRONTEND_PROTOCOL=https`, `FRONTEND_PORT=` (boş), `API_PUBLIC_URL=https://api.akisb2b.com`, `NODE_ENV=production`, güçlü `JWT_SECRET` ve `ENCRYPTION_KEY`.
3. **Frontend:** `npm run build` çıktısını (`frontend/dist`) statik olarak sunun; tüm yollar `index.html`'e düşmeli (SPA).
4. **SSL ve ters vekil:** Caddy, hem `*.akisb2b.com` hem de müşterilerin özel alan adları için sertifikayı ilk istekte otomatik alabilir. `ask` adresi yalnızca sistemde kayıtlı firma alt alan adlarına ve doğrulanmış özel alan adlarına izin verir; böylece rastgele alan adlarına sertifika alınmaz.

```caddy
{
	on_demand_tls {
		ask http://localhost:5001/api/public/domain-check
	}
}

api.akisb2b.com {
	reverse_proxy localhost:5001
}

https:// {
	tls {
		on_demand
	}
	root * /srv/akis/frontend/dist
	try_files {path} /index.html
	file_server
	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		X-Content-Type-Options "nosniff"
		X-Frame-Options "DENY"
		Referrer-Policy "strict-origin-when-cross-origin"
		Permissions-Policy "camera=(), microphone=(), geolocation=()"
		# PayTR ödeme formu iframe ile açıldığı için frame-src'de izinlidir
		Content-Security-Policy "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://api.akisb2b.com; frame-src https://www.paytr.com https://*.iyzipay.com; frame-ancestors 'none'"
	}
}
```

5. **iyzico:** Canlı anahtarları girip platform panelinde Paketler → paket düzenleme ekranındaki "iyzico" (senkronize et) butonuyla her paketi eşleyin. Bildirim adresi: `https://api.akisb2b.com/api/public/iyzico/webhook`.
6. **Yedekleme:** Compose'daki `backup` servisi açılışta ve her gün 03:00'te veritabanını (`pg_dump -Fc`) ve yüklenen dosyaları `./backups` klasörüne alır; `BACKUP_KEEP_DAYS` (varsayılan 14) günden eskileri siler. Bu klasörü ayrıca sunucu dışına (S3, başka sunucu) kopyalayın.

   ```bash
   docker compose exec backup /scripts/backup.sh                                   # elle yedek
   docker compose exec backup /scripts/restore.sh /backups/db-…dump deneme_db       # önce ayrı veritabanına geri yükleyip kontrol edin
   docker compose exec backup /scripts/restore.sh /backups/db-…dump                 # asıl veritabanına (mevcut veri silinir)
   tar -xzf backups/uploads-….tar.gz -C backend/uploads                            # dosyalar
   ```

## Geliştirme notları

Geçmiş çalışma oturumlarının notları `docs/gelistirme-notlari/` klasöründedir.
