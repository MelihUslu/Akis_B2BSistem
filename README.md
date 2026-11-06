# Akis B2B — Çok Kiracılı B2B Bayi Portalı (SaaS)

Toptancı / üretici firmaların bayilerine online sipariş, cari, ödeme ve teklif süreçlerini sunduğu B2B portal.
Tek kurulumda çok sayıda firma (kiracı) çalışır. Her firmanın kendi adresi (`firma.akisb2b.com` ya da kendi alan adı `b2b.firmasi.com`), kendi yöneticileri, bayileri ve verisi vardır.

| Kim | Nerede | Ne yapar |
|---|---|---|
| **Platform sahibi** | `platform.ROOT_DOMAIN` | Müşteri firmaları, paketleri, abonelik ödemelerini, duyuruları ve destek taleplerini yönetir |
| **Firma yöneticisi** (müşteri) | `<firma>.ROOT_DOMAIN/admin` | Ürün, bayi, sipariş, finans, kampanya, ekip, entegrasyon ve sanal POS ayarları |
| **Bayi** | `<firma>.ROOT_DOMAIN/bayi` | Katalog, sepet, sipariş, teklif isteme, iade, cari ekstre, kartla ödeme |
| **Plasiyer** (saha satış) | `<firma>.ROOT_DOMAIN/plasiyer` | Sorumlu olduğu bayileri, bakiyelerini ve primlerini görür; bayi adına sipariş verir |
| **Personel** (personel modülü açıksa) | `<firma>.ROOT_DOMAIN/personel` | Yalnızca Personel Alanım: izin, masraf / avans talepleri, hedef ve prim, şirket duyuruları |
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

Yük testleri (k6, Docker ile): `./loadtest/run.sh smoke | load | stress | spike` · ayrıntı: [loadtest/README.md](loadtest/README.md)

Kullanıcı kabul testleri (UAT, gerçek tarayıcıda uçtan uca iş akışları; ayrı veritabanında): `./uat/run.sh` · ayrıntı: [uat/README.md](uat/README.md)

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

### Google ile giriş

Firma girişi (`firma.akisb2b.com/login`, özel alan adı) ve ortak giriş (`/giris`) ekranlarında "Google ile giriş yap" düğmesi çıkar (`GOOGLE_CLIENT_ID` ve `GOOGLE_CLIENT_SECRET` tanımlıysa). Platform paneli girişinde yoktur.

- **Hesap eşleşmesi:** Google'ın doğruladığı e-posta, portaldaki kullanıcının e-postasıyla eşleşir. Google ile yeni hesap açılmaz; yönetici bayiyi / ekip üyesini o e-postayla tanımlamış olmalıdır. Doğrulama bekleyen e-posta Google girişiyle doğrulanmış sayılır.
- **Kontroller şifreli girişle aynıdır:** pasif hesap, abonelik, bayi durumu; iki aşamalı doğrulama açıksa kod yine istenir.
- **Akış:** firmalar farklı adreslerde çalıştığı için yönlendirmeli akış kullanılır; tek dönüş adresi API'dedir. Giriş sayfası → `/api/public/google/start` → Google → `/api/public/google/callback` → giriş sayfası (`#google=<bilet>`). Bilet 2 dakika geçerli, tek kullanımlıktır ve yalnızca başlatıldığı portalda geçer; dönüş, girişi başlatan tarayıcıya çerezle bağlıdır. Ortak girişte e-posta birden fazla portalda kayıtlıysa portal seçtirilir.
- **Kurulum (Google Cloud Console):** API'ler ve Hizmetler → OAuth izin ekranı (Harici; kapsamlar: `openid`, `email`, `profile`) → Kimlik bilgileri → OAuth istemci kimliği, tür "Web uygulaması". **Yetkilendirilmiş yönlendirme URI'si:** `https://api.akisb2b.com/api/public/google/callback` (geliştirmede `http://localhost:5001/api/public/google/callback`; adres `API_PUBLIC_URL` + `/api/public/google/callback`). JavaScript kaynağı gerekmez. İstemci kimliği ve gizli anahtar `backend/.env`'e yazılır.
- Kodu: `services/googleAuth.js`, testleri: `test/integration/google.test.js` (Google'ın token ucu taklit edilir).

### KVKK: veri dışa aktarma ve hesap kapatma

- Firma, Ayarlar → Veri & Hesap'tan tüm verisini Excel olarak indirebilir.
- Firma sahibi hesabı kapatabilir: abonelik iptal edilir, erişim kapanır, veri 30 gün saklanır. Platform bu sürede hesabı geri açabilir.
- `AUTO_PURGE_CLOSED=true` ise süresi dolan hesapların verisi saatlik iş tarafından kalıcı silinir. Platform panelinden elle de silinebilir.

### Teslimat adresleri ve kargo

Bayi, profilinden birden fazla teslimat adresi (il / ilçe ayrı) tanımlar ve siparişte seçer; seçilen adres siparişe kopyalanır. Firma, Ayarlar → Kargo'dan **Yurtiçi Kargo** web servisini bağlarsa sipariş ekranından tek tıkla gönderi oluşturur ve 10×15 barkodlu etiketi yazdırır. Kargo paketi teslim alınca takip numarası (yarım saatte bir ya da "Durumu güncelle" ile) otomatik gelir, sipariş "Kargoda", teslimde "Teslim edildi" olur ve bayiye bildirilir. Diğer kargo firmalarında takip numarası elle girilir. Yurtiçi istemcisi, Yurtiçi'nin herkese açık test servisine karşı denenmiştir (`YURTICI_LIVE=1 npm run test:integration`).

### Sipariş kuralları

- **Stok ayırma:** onay bekleyen siparişlerdeki miktar stoktan ayrılmış sayılır. Bayiye gösterilen ve sipariş edilebilen miktar "stok − bekleyen siparişler"dir; stok onayda düşer. Aynı son ürünleri iki bayi birden sipariş edemez (sipariş anında ürün satırları kilitlenir). Yönetici ürün listesinde ayrılan miktar görünür.
- **Bayi iptali:** bayi, onay bekleyen siparişini kendisi iptal eder; ayrılan stok ve limit serbest kalır, kupon kullanılmamış sayılır. Onaylanmış sipariş yalnızca yönetici kararıyla değişir.
- **Sipariş notu ve referans no:** bayi siparişe not ve kendi sipariş numarasını yazar; yönetici ekranında, çıktıda, Excel'de ve ERP API'sinde görünür.
- **Kargo ücreti:** Ayarlar → Sipariş ve Teslimat'tan sabit ücret (KDV hariç) ve "bu tutar üstü ücretsiz" eşiği. Adrese teslim siparişlere KDV ile eklenir, cariye ve faturaya (ayrı satır) dahildir; Gel-Al'da uygulanmaz. Kısmi onayda ücret kalır, tüm kalemler iptal edilirse sıfırlanır.
- **Otomatik onay:** açıksa cari hesapla verilen ve limiti yeten siparişler (isteğe bağlı üst tutara kadar) beklemeden onaylanır: stok düşer, borç yazılır, bayiye bildirim gider. Stok yetmezse sipariş onay bekler; Havale/EFT her zaman bekler. Onay mantığı tektir (`decideOrder`): elle ve otomatik onay aynı kurallarla işler.
- **Süreli özel fiyat:** özel / kademeli fiyatlara başlangıç ve bitiş tarihi verilebilir; aralık dışında uygulanmaz.
- **Görünürlük:** ürün ve kategori yalnızca seçilen bayi gruplarına açılabilir (kategori kısıtı alt kategorilere geçer). Gruba kapalı ürün katalogda, aramada, filtrelerde, hızlı siparişte ve teklif talebinde çıkmaz, sipariş edilemez.
- **Kısmi sevkiyat ve irsaliye:** onaylanan sipariş kalem / miktar seçilerek parça parça kargoya verilir (her gönderinin kendi takip numarası); tamamı gidince "Kargoda" olur. Kısmen gönderilen kalem iptal edilemez (iade olarak işlenir). İrsaliye numarası elle ya da ERP'den (`PATCH /api/v1/orders/:id/status` gövdesinde `despatchNumber`) girilir; sipariş fiyatsız sevk irsaliyesi olarak yazdırılabilir.
- **Bayi adına sipariş:** yönetici (sipariş yetkili) ve plasiyer (yalnızca kendi bayileri) bir bayi seçip portalını o bayinin fiyat, limit ve adresleriyle kullanır (`X-Act-As-Company` başlığı; seçim sekmeye özeldir). Sipariş girenin adıyla kaydedilir (`channel`: STAFF / PLASIYER), bayiye bildirim gider. Bu modda iade, profil ve yönetim uçları açılmaz.
- **Bayi hedefi ve ciro primi:** Finans ve Prim'den bayiye dönem hedefi (KDV hariç ciro) ve prim yüzdesi tanımlanır. Gerçekleşen: dönemde onaylanan siparişler eksi iadeler. Bayi ilerlemeyi Finansal Durum'da görür; dönem kapatılınca hedef tuttuysa prim cariye alacak yazılır (bir kez).
- **Sepet:** kullanıcıya özeldir, çıkışta tarayıcıdan silinir; bayinin sepeti sunucuda da saklanır, telefonda başlanan sepet bilgisayarda devam eder.
- **Barkod okutma:** Hızlı Sipariş'te telefon kamerasıyla barkod okutulur (https gerekir).

### Personel yönetimi

Firma bazında açılır: sol menü → Personel → Personel Yönetimi → "Modülü aç" ya da Ayarlar → Genel → Modüller (`hr_enabled`). Kapalıyken menüde yalnızca Ayarlar yetkilisine "Kapalı" etiketiyle görünür, diğer ekip üyelerine görünmez; `/api/hr` uçları 403 döner. Bordro, SGK ve özlük dosyası kapsamda değildir.

- **Kim ne yapar:** "Personel" yetkisi (`HR`) kartları, izin / masraf / avans onaylarını, hedefleri, duyuruları ve izin ayarlarını yönetir. Personelin **yöneticisi** (karttaki "Yöneticisi"; departmanın tamamına tek seferde atanabilir) Personel yetkisi olmadan yalnızca kendi ekibinin taleplerine karar verir (Personel Alanım → Ekibim); yeni talep bildirimi de ona gider. Ödemeyi "Finans" yetkisi kaydeder; onay ile ödeme farklı kişilerde olabilir. Kişi kendi talebine karar veremez (firma sahibi hariç). Bayi hesapları modüle giremez (rol kontrolü sunucuda).
- **Personel kartı:** ad, iletişim, departman, görev, işe giriş, yönetici, yıllık izin hakkı ve devir, aktif / pasif. Firmanın yönetici ya da plasiyer hesabı karta bağlanırsa personel "Personel Alanım"dan (`/admin/personel-alanim`, plasiyerde `/plasiyer/personel`) kendi taleplerini açar. Hesabı olmayan personele kartından **"Personel girişi"** açılır (`PERSONEL` rolü): yalnızca `/personel` sayfasına ve `/api/hr` uçlarına girer, paketteki yönetici sayısına dahil değildir; geçici şifre e-postayla gider (gönderilemezse ekranda bir kez gösterilir). Pasife alınan personelin bu hesabı da kapanır.
- **İzin:** tür, tarih aralığı ya da yarım gün (sabah / öğleden sonra), açıklama. Gün sayısı: Pazar sayılmaz; Cumartesi yalnızca "Cumartesi iş günü" açıksa; sabit resmî tatiller (1 Ocak, 23 Nisan, 1 Mayıs, 19 Mayıs, 15 Temmuz, 30 Ağustos, 28 Ekim yarım gün, 29 Ekim) otomatik, dini bayramlar ve firma tatilleri İzin ayarlarındaki listeden düşülür (arife yarım gün). Talep penceresi gün sayısını, aradaki tatilleri ve kalan izni önceden gösterir. Çakışan talep açılamaz. Onay ya da gerekçeli ret; karar verenin adı ve zamanı kayda yazılır, personele bildirim gider.
- **Yıllık izin hakkı:** işe giriş tarihinin her yıl dönümünde eklenir: 1–5 yıl 14, 5–15 yıl 20, 15 yıl ve üstü 26 gün (İş Kanunu md. 53); firma daha fazlasını kartta tanımlayabilir (yasal sürenin altı sayılmaz). Kullanılmayan izin devreder. Sisteme geçişte "şu tarih itibarıyla kalan X gün" devri girilir; öncesi sayılmaz. Kalan günü aşan yıllık izin talebi reddedilir; İzin ayarlarından "avans izin" açılırsa bakiye eksiye düşebilir.
- **Masraf ve avans:** tutar, tarih, açıklama, fiş / fatura (PDF ya da görsel; sahibi, yöneticisi ve yetkililer indirir). Onaylanan talep ödenmiş sayılmaz. **Ödeme kısmi olabilir** (`StaffPayment`): her nakit / banka / kart ödemesi Gelir-Gider'e ayrı "Personel masrafı / avansı" gideri açar (fiş kopyalanır); kalan tutardan fazlası ödenemez, satır kilidiyle eşzamanlı ödemeler sırayla işler. Gelir-gider kaydının kaynak anahtarı (`STAFF_PAY:<ödeme>`) tekildir; bu kayıtlar Gelir-Gider'den değiştirilemez, yanlış ödeme Personel Yönetimi'nden ödeme bazında geri alınır.
- **Avans mahsubu:** ödenen avans açık kalır. Masraf ya da prim ödenirken "avanstan mahsup" seçilirse tutar açık avanslardan (eskisi önce) düşülür; nakit çıkmaz. Kalanı "Avansı kapat" ile nakit iade (Gelir-Gider'e "Personel avans iadesi" geliri) ya da maaştan kesinti (bordro sistem dışında; yalnızca kayıt) olarak kapanır. Mahsup / iade kaydı olan avansın ödemesi, önce onlar geri alınmadan geri alınamaz.
- **Satış hedefi ve prim:** personel başına aylık hedef, prim oranı ve esas (satış / tahsilat). Satış: personelin sorumlu olduğu bayilerin ve bayi adına girdiği siparişlerin ayda onaylanan KDV hariç tutarı (kupon düşülmüş, kargo hariç, iptaller sayılmaz) eksi ayda onaylanan iadeler. Tahsilat: sorumlu olduğu bayilerden alınan ödemeler (TL karşılığı). Hedef tutarsa gerçekleşenin yüzdesi prim olur. Ay bitince dönem kapatılır, prim sabitlenir; ödeme ayrıca kaydedilir, kısmi olabilir ve açık avanstan düşülebilir (hesaplanan ve ödenen prim ayrı görünür). Sipariş başına plasiyer primi (`plasiyer_rate`) bundan ayrıdır.
- **Şirket duyuruları:** tüm personele ya da seçilen departmanlara; hesabı olan personele bildirim gider.
- **Kayıt:** onay, ret, ödeme ve geri almalar işlem kaydına (Ayarlar → İşlem Kaydı) ayrıca yazılır. Firma verisi dışa aktarmaya ve kalıcı silmeye dahildir.
- Kodu: `services/hrService.js`, `controllers/hrController.js`, `routes/hrRoutes.js`; testleri: `test/integration/hr.test.js`, `uat/tests/personel.spec.mjs`.

### Çoklu depo

Ayarlar → Depolar'dan depo eklenince stok depo bazında tutulur (ilk depo eklenince mevcut stoklar ona aktarılır); `Product.stock` tüm depoların toplamıdır ve bayi toplamı görür. Sipariş onaylanırken karşılanacak depo seçilir, stok o depodan düşer; kalem iptali ve iade aynı depoya geri yazılır. Depolar arası transfer yapılabilir. Excel'de "Depo" sütunu, ERP'de `warehouse` alanı (depo kodu) ile depo bazında stok güncellenir; depo verilmezse toplam stok güncellenir ve fark varsayılan depoya yazılır. Tüm stok değişiklikleri `services/stockService.js` üzerinden geçer.

### E-fatura / e-arşiv

Firma, Ayarlar → E-Fatura'dan yöntemi seçer:

- **Paraşüt ile otomatik:** Fatura Paraşüt'te oluşturulur; alıcının vergi numarası GİB e-fatura listesindeyse e-fatura, değilse e-arşiv gönderilir. Elle, sipariş onaylanınca ya da kargolanınca kesilebilir. Hata olursa sipariş ekranında görünür ve yeniden denenir.
- **ERP'den veya elle:** ERP faturayı keser ve numara/PDF adresini `PUT /api/v1/orders/{id}/invoice` ile yazar ya da yönetici sipariş ekranından girer.

Fatura kesilince bayiye bildirim ve `invoice.issued` webhook'u gider; bayi sipariş detayında PDF'i açar. Platformun abonelik faturaları `PARASUT_*` ortam değişkenleri tanımlıysa ödeme alınınca otomatik kesilir.

> Paraşüt akışı, testlerde Paraşüt API'sini taklit eden bir sunucuyla doğrulanmıştır. Canlıya almadan önce gerçek bir Paraşüt hesabıyla (tercihen test şirketi) bir e-arşiv ve bir e-fatura kesilerek denenmelidir.

### Destek, yardım merkezi ve memnuniyet
- Firma yöneticisi **Destek** sayfasından platforma talep açar (konu türü, öncelik, ek dosya, otomatik teknik bilgi, hedef yanıt süresi).
- **Yardım merkezi:** aynı sayfada aranabilir yazılar; yeni talep yazılırken konuya uygun yazılar önerilir ("işe yaradı mı?" oyu toplanır). Yazılar platform panelindeki **Yardım Merkezi** sayfasından yönetilir; başlangıç yazıları migration ile gelir.
- **Memnuniyet puanı:** kapanan talebe firma 1–5 yıldız ve yorum verir. Platform destek sayfasında ortalama puan ve memnun oranı (4–5 puan) görünür; 2 ve altı puanlarda platforma e-posta gider.

### Mobil uygulama (PWA) ve anlık bildirimler
Portal telefona uygulama olarak kurulur (Android/masaüstü Chrome: menüdeki **Uygulamayı Yükle**; iPhone: Safari → Paylaş → Ana Ekrana Ekle). Mağaza uygulaması gerekmez.
- Kurulan uygulama firmanın adıyla görünür (manifest firma bilgisiyle tarayıcıda üretilir). Telefonda alt sekme çubuğu: katalog, hızlı sipariş, sepet, siparişler, menü.
- **Web Push:** bildirim zilinde izin verilince cihaz abone olur; panel bildirimleri uygulama kapalıyken de telefona düşer. Çıkışta cihazın aboneliği silinir. iPhone'da push yalnızca ana ekrana eklenen uygulamada çalışır (iOS 16.4+).
- `backend/.env`: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (üretmek için `npx web-push generate-vapid-keys`). Boşsa push kapalıdır; panel içi bildirim ve e-posta çalışmaya devam eder. Anahtarlar değişirse cihazlar bir sonraki açılışta kendiliğinden yeniden abone olur.
- Service worker yalnızca production build'de kaydolur (push izni verilince geliştirmede de kaydolur). Push için site HTTPS üzerinden sunulmalıdır (localhost hariç).
- **Saklama:** okunmuş bildirimler 90, okunmamışlar 180 gün sonra saatlik işle silinir. Tekrar engelleme anahtarı olanlar (ör. vade hatırlatması; silinirse aynı hatırlatma yeniden giderdi) silinmez.

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
| `WEB_CONCURRENCY` | | İşçi süreç sayısı (varsayılan 1). Çekirdek sayısı kadar verilebilir; zamanlanmış işler yalnızca ilk süreçte çalışır. Birden fazlaysa `REDIS_URL` önerilir |
| `DB_POOL_SIZE`, `DB_POOL_TIMEOUT` | | Süreç başına veritabanı bağlantı havuzu ve bekleme süresi (sn). Toplam = süreç × havuz, PostgreSQL `max_connections` altında kalmalı |
| `CUSTOM_DOMAIN_IP` | | Alan adının tamamını (`firma.com`) bağlayan firmaların A kaydı için sunucu IP'si (boşsa CNAME hedefinin IP'si) |
| `AUTO_PURGE_CLOSED` | | Kapatılan hesapların 30 gün sonra otomatik silinmesi |
| `PARASUT_*`, `SUBSCRIPTION_VAT_RATE` | | Platformun abonelik faturaları (Paraşüt) |
| `TZ` | | Tarih filtreleri ve raporların saat dilimi (varsayılan `Europe/Istanbul`) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | | Telefon / masaüstü bildirimi (`npx web-push generate-vapid-keys`) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | | Google ile giriş (OAuth istemcisi, "Web uygulaması"). İkisi de boşsa düğme görünmez. Kurulum: yukarıda "Google ile giriş" |
| `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_EFFORT`, `AI_TIMEOUT_MS`, `AI_DAILY_LIMIT` | | Yapay zekâ ile teklif. Anahtar yoksa manuel teklif çalışır; `mock` yalnızca geliştirme içindir |
| `BACKUP_DIR` | | Sistem Durumu'nun son yedeği okuduğu klasör (Compose'da `/backups`) |
| `FX_FIXED` | yalnızca test | Sabit döviz kuru (`USD:40,EUR:45`); canlıda tanımlanırsa sunucu açılmaz |

### frontend/.env

| Değişken | Açıklama |
|---|---|
| `VITE_API_URL` | Backend adresi + `/api` (ör. `https://api.akisb2b.com/api`) |
| `VITE_ROOT_DOMAIN` | Backend'deki `ROOT_DOMAIN` ile aynı |
| `VITE_DEFAULT_TENANT` | Alt alan adı kullanılamayan ortamda (IP ile erişim) açılacak firma |
| `VITE_PLATFORM_NAME`, `VITE_SUPPORT_EMAIL`, `VITE_SUPPORT_PHONE` | Marka ve bayi panelindeki destek kutusu |

## Canlıya alma

Adım adım rehber: **[docs/canliya-cikis.md](docs/canliya-cikis.md)** (sunucu, DNS, ayarlar, başlatma, izleme, yedekleme / geri yükleme, güncelleme, gerçek hesaplarla denenecekler).

Özet:

```bash
cp deploy/production.env.example .env                                 # alan adı, veritabanı şifresi, ACME e-postası
cp deploy/backend.production.env.example backend/.env.production      # JWT_SECRET, ENCRYPTION_KEY, SMTP, AI…
docker compose -f docker-compose.prod.yml run --rm backend npm run check:config
docker compose -f docker-compose.prod.yml up -d --build
```

- `web` servisi (Caddy) arayüzü sunar ve HTTPS sertifikalarını ilk istekte otomatik alır. `ask` adresi (`/api/public/domain-check`) yalnızca kayıtlı firma alt alan adlarına ve doğrulanmış özel alan adlarına izin verir. Güvenlik başlıkları `deploy/Caddyfile` içindedir.
- Backend canlıda (`NODE_ENV=production`) eksik veya güvensiz ayarla **açılmaz**: kısa `JWT_SECRET`, eksik `ENCRYPTION_KEY`, `localhost` alan adı, `http` bağlantı, örnek yapay zekâ. Kontrol için `npm run check:config`; aynı liste platform panelindeki **Sistem Durumu** sayfasında da görünür.
- Dış izleme için `GET /health/ready` (veritabanına ulaşılamazsa 503).
- `backup` servisi her gün 03:00'te veritabanını ve yüklenen dosyaları `./backups`'a alır ve yedeği doğrular. Sunucu dışı kopya için rehberdeki rclone örneğine bakın.
- iyzico: canlı anahtarları girip platform panelinde Paketler → paket düzenleme → "iyzico" (senkronize et). Bildirim adresi: `https://api.akisb2b.com/api/public/iyzico/webhook`.

## Geliştirme notları

Geçmiş çalışma oturumlarının notları `docs/gelistirme-notlari/` klasöründedir. Başlangıçtan bugüne yapılanların konu konu özeti: [docs/yapilanlar/](docs/yapilanlar/README.md).
