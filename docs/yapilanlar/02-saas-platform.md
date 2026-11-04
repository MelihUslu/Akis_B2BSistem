# 2. SaaS platformu

26 Ekim 2026'da tek firmalık sistem, çok sayıda firmanın aynı kurulumda çalıştığı bir SaaS platformuna dönüştürüldü (`b0613c5`). Sonraki günlerde güvenlik, KVKK, destek, kayıt / giriş, abonelik ve özel alan adı tarafı tamamlandı.

## Çok kiracılı yapı

- **Adres:** her firmanın kendi alt alan adı (`firma.akisb2b.com`) ya da kendi alan adı (`b2b.firmasi.com`) vardır. Platform paneli `platform.akisb2b.com`, tanıtım sitesi kök alan adındadır.
- **Firma çözümleme:** frontend firmayı adresten bulur ve `X-Tenant` (alt alan adı) ya da `X-Tenant-Host` (özel alan adı) başlığını gönderir. `resolveTenant` isteği `AsyncLocalStorage` içinde o firmanın bağlamında çalıştırır.
- **Veri yalıtımı:** `utils/prisma.js` içindeki Prisma uzantısı, firmaya ait bütün modellerin sorgularına `tenantId` filtresini otomatik ekler. Bağlam yoksa sorgu hata verir. Platform uçları `runAsPlatform` ile çalışır.
- **Oturum:** JWT içinde `tenantId` bulunur; başka firmanın adresinde kullanılan oturum reddedilir.
- **Veritabanı:** SQLite'tan PostgreSQL 15'e geçildi; Redis isteğe bağlı olarak eklendi (istek sınırlama, kilitler, önbellek).

## Abonelik ve paketler

- Paketler bayi, ürün ve yönetici sayısı ile özel alan adı hakkını sınırlar (`limitService`).
- Durumlar: `TRIAL → ACTIVE ↔ PAST_DUE (3 gün tolerans) → SUSPENDED / CANCELLED`. Erişimi kapanan firmanın bayileri giremez, yönetici yalnızca abonelik sayfasını görür (HTTP 402).
- Abonelik ödemesi iyzico ile alınır. Platformun abonelik faturaları Paraşüt ayarları tanımlıysa ödemeden sonra otomatik kesilir (`2314836`).
- **Abonelik sayfası** (`040da5c`, `f039144`, `17dc5d0`): paketler önde, aylık / yıllık fiyat ve yıllık tasarruf, önerilen paket. Tek pencerede kartla ödeme (fatura bilgileri hatırlanır) ya da havale / EFT (IBAN, tutar ve açıklama kodu kopyalanır, "havaleyi yaptım" bildirimi). Platform bekleyen havaleyi onaylayınca abonelik uzar ve fatura kesilir; reddedince sebep firmaya iletilir. Otomatik yenilenmeyen aboneliklere bitişten 7, 3 ve 1 gün önce hatırlatma gider. Aboneliğim, kullanım ve ödemeler tek kartta sekmelidir.

## Firmanın kendi sanal POS'u

Firma bayilerden kartla tahsilat için kendi iyzico ya da PayTR hesabını bağlar. Gizli anahtarlar AES-256-GCM ile şifrelenir (`ENCRYPTION_KEY`).

## Ekip yetkileri

Firma sahibi ekibine yönetici ekler ve her birine yetki verir: katalog, siparişler, teklif (hazırlama, iskonto / elle fiyat, sınırı aşanı onaylama), bayiler, finans, WhatsApp mesajları, müşteri adayları, ayarlar. Müşteri adayları ve mesaj yetkileri sonradan eklendi. Yönetici bildirimleri de yetkiye göre süzülür (`4c417c0`).

## Platform paneli

Platform sahibinin paneli zamanla şu sayfalara ulaştı:

| Sayfa | İşlev |
|---|---|
| Panel | Platformun genel özeti |
| Firmalar, Firma detayı | Firma listesi, paket, durum, kullanım; müşteri olarak giriş |
| Paketler | Paket fiyatları ve limitleri |
| Ödemeler | Abonelik ödemeleri, bekleyen havaleler |
| Duyurular | Firmalara duyuru |
| Destek | Firmaların talepleri, ekler, hedef yanıt süresi (SLA), memnuniyet puanı |
| Yardım Merkezi | Yardım yazıları (`2dd27a9`) |
| Canlı Destek, Site ve Chatbot | Tanıtım sitesi sohbetleri ve site ayarları (`bf1e966`) |
| İşlem Kaydı | Bütün firmaların işlem kaydı |
| Güvenlik | Platform yöneticisinin iki aşamalı doğrulaması |
| Hatalar, Sistem Durumu, İzleme | Hata izleme, sağlık durumu, istek metrikleri (bkz. [7. bölüm](07-raporlar-izleme-operasyon.md)) |

**Müşteri olarak giriş:** platform yöneticisi destek için firma sahibinin yetkisiyle 1 saatlik oturum açabilir. Firma sahibine bildirim gider, her işlem "destek oturumu" etiketiyle kaydedilir. Bu oturumda şifre, 2FA ve hesap kapatma işlemleri yapılamaz.

## Güvenlik

- **İki aşamalı doğrulama (TOTP):** firma yöneticileri ve platform yöneticisi için; 8 tek kullanımlık kurtarma kodu.
- **İşlem kaydı (`AuditLog`):** girişler, başarısız denemeler ve bütün değişiklik istekleri; şifre ve anahtar alanları maskelenir.
- **İstek sınırlama:** giriş, kayıt ve doğrulama uçlarında. Redis varsa sayaçlar ortaktır, yoksa bellek içi sayaca düşer.
- **Şifremi unuttum** (`7e69e68`): firma ve platform için e-postayla sıfırlama. Bağlantı tek kullanımlık ve 1 saat geçerlidir, yalnızca özeti saklanır. Şifre değişince kullanıcının diğer cihazlardaki oturumları kapanır.
- **Güvenlik başlıkları** (`a566e44`, `545ece5`): API'de `helmet` ile sıkı içerik politikası (CSP), iframe engeli, `nosniff`. Görsel olmayan yüklemeler indirme olarak sunulur. Tema başlatma betiği CSP'ye uysun diye ayrı dosyaya taşındı.

## KVKK

- Firma bütün verisini Ayarlar → Veri & Hesap'tan Excel olarak indirir.
- Firma sahibi hesabı kapatabilir: abonelik iptal edilir, erişim kapanır, veri 30 gün saklanır; platform bu sürede hesabı geri açabilir.
- Kalıcı silmede firmanın yüklediği dosyalar da silinir (`efcc85e`). `AUTO_PURGE_CLOSED=true` ise süresi dolan hesaplar saatlik işle silinir.
- Sonradan eklenen her modül (gelir-gider, müşteri adayları, WhatsApp, izleme kayıtları, sevkiyatlar, hedefler) dışa aktarmaya ve silmeye dahil edildi.

## Destek, yardım merkezi ve memnuniyet

- Firma yöneticisi Destek sayfasından talep açar: konu türü, öncelik, ek dosya, otomatik teknik bilgi, hedef yanıt süresi.
- **Yardım merkezi** (`2dd27a9`): aranabilir yazılar; talep yazılırken konuya uygun yazılar önerilir, "işe yaradı mı?" oyu toplanır.
- **Memnuniyet puanı:** kapanan talebe 1–5 yıldız ve yorum. Platform ortalamayı ve memnun oranını görür; 2 ve altı puanda e-posta gider.

## Kayıt ve giriş

- **Ayrı kayıt ve giriş sayfaları** (`cfe7ff9`): `/kayit` paket seçimli ücretsiz deneme kaydı. `/giris` ortak giriştir: e-posta ve şifreyle kullanıcının portalı bulunur, tek kullanımlık ve 2 dakika geçerli, firmaya bağlı bir kodla portalda (`/giris-aktar`) oturum açılır. Birden çok portalı olan hesap portal seçer; portal adresi e-postayla gönderilebilir.
- **Ortak görünüm** (`0d0028f`): giriş, şifremi unuttum, yeni şifre, e-posta doğrulama, iki aşamalı doğrulama ve platform girişi aynı çerçeveyi (`AuthShell`) kullanır. Firma girişi `/giris` ile aynı görünümdedir; eski mor tanıtım görseli ve işlevsiz "Beni hatırla" kutusu kaldırıldı.

## Özel alan adı

Firma Ayarlar → Alan Adı'ndan iki yöntemden birini seçer (`05426c2`):

- **Alt alan adı** (`b2b.firma.com`): CNAME kaydı.
- **Alan adının tamamı** (`firma.com`): A kaydı, `www` için CNAME ve doğrulama için TXT kaydı. `www.firma.com` de firmaya eşlenir ve ana adrese yönlendirilir.

Doğrulamadan sonra DNS'in sunucuya yönlenip yönlenmediği kontrol edilir. Ekranda adım adım kurulum ve sağlayıcı ipuçları (GoDaddy, Natro / İsimtescil, Cloudflare) vardır. Sertifikayı Caddy kendiliğinden alır.

## Commit'ler

| Commit | Tarih | Açıklama |
|---|---|---|
| `b0613c5` | 26 Ekim | SaaS dönüşümü, platform paneli, arayüz yenilemesi |
| `7e69e68` | 26 Ekim | Şifremi unuttum, oturumları kapatma |
| `a566e44` | 26 Ekim | Güvenlik başlıkları (helmet) |
| `545ece5` | 26 Ekim | Tema betiği ayrı dosyada (CSP) |
| `efcc85e` | 26 Ekim | Kalıcı silmede dosyaların silinmesi (KVKK) |
| `0a726c1` | 27 Ekim | Docker: destek ekleri imaja girmez; `app.js` / `server.js` ayrımı |
| `2dd27a9` | 27 Ekim | Yardım merkezi, memnuniyet puanı |
| `cfe7ff9` | 29 Ekim | Ayrı kayıt ve giriş sayfaları, ortak giriş |
| `05426c2` | 3 Kasım | Özel alan adı: alan adının tamamı |
| `040da5c`, `f039144`, `17dc5d0` | 3 Kasım | Abonelik sayfası, havale / EFT, sekmeli kart |
| `0d0028f` | 4 Kasım | Giriş ekranları ortak görünümde |
