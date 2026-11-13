# 12. Güvenlik denetimi (12 Kasım 2026)

Canlıya çıkıştan önce bütün sistem güvenlik açısından baştan sona denetlendi. Yetkiler ve firma ayrımı otomatik testlerle, kimlik doğrulama ve girdi işleme hedefli testlerle, bağımlılıklar `npm audit` ile, ERP API'si OWASP ZAP etkin taramasıyla denendi. Bulunan açıkların hepsi kapatıldı ve her birinin testi eklendi. 12 Kasım 2026'da erişim haritası, firma / bayi izolasyonu, kimlik doğrulama, sipariş / teklif iş kuralları ve girdi / entegrasyon katmanları kod üzerinden yeniden incelendi: yeni bir izolasyon ya da yetki sızıntısı bulunmadı; `xlsx` kapatıldı. Karar ya da canlı ortam gerektiren konular [Açık kalanlar](#açık-kalanlar) bölümündedir.

## Kapsam ve yöntem

| Alan | Nasıl denendi |
|---|---|
| Yetkiler | Uygulamadaki **450 ucun tamamı** Express yönlendiricisinden çıkarıldı. Her uç 10 kişiyle (oturumsuz, başka firma, platform, firma sahibi, yetkisiz ekip üyesi, yalnızca Ürünler yetkili üye, bayi ana kullanıcısı, kısıtlı bayi çalışanı, plasiyer, personel) denendi: **3.651 istek** (`authzMatrix`). |
| Firmalar arası ayrım | Şemadaki 90 firma → firma ilişkisi. İstekten gelen ilişki numarasıyla başka firmanın kaydına bağ kurma denemesi; dev veritabanında mevcut yanlış bağ taraması (sonuç: 0). |
| Firma içi ayrım | Bayi, aynı firmadaki başka bayinin siparişi, teklifi, adresi, şablonu, onay talebi, kullanıcısı ve bildirimiyle denendi; bayi çalışanı ana kullanıcı işleriyle denendi. |
| Kimlik doğrulama | İmzasız (`alg: none`), yanlış anahtarlı, süresi dolmuş, içeriği değiştirilmiş belirteç; 2FA / giriş aktarım biletinin oturum yerine kullanılması; hesap başına deneme; kullanıcı tespiti; şifre sıfırlama. |
| Girdi | Toplu atama (istek gövdesinin olduğu gibi yazılması), SQL enjeksiyonu (bütün ham sorgular), XSS (arayüz, e-posta şablonları, XML besleme), SSRF (webhook), açık yönlendirme, prototip anahtarları (`?sort=constructor`). |
| Dosya yükleme | Tür / uzantı, SVG, sunulan başlıklar, gizli klasörler, yüklemenin kimlik doğrulamadan önce çalışıp çalışmadığı. |
| Bağımlılıklar | `npm audit`: backend, frontend, UAT. Git geçmişinde gizli bilgi taraması. |
| Canlı yapılandırma | Caddy güvenlik başlıkları ve CSP, Docker portları, gizli anahtar kontrolleri. |
| OWASP ZAP | ERP API'sine (`/api/v1`) OpenAPI belgesi ve geçerli API anahtarıyla etkin tarama (UAT ortamında). |

## Bulunanlar ve düzeltmeler

| # | Önem | Bulgu | Düzeltme | Test |
|---|---|---|---|---|
| 1 | Yüksek | **Firmalar arası ilişki.** Ürün oluşturma / güncelleme ve "alternatif ürün bağla" istekteki kategori ve ürün numarasını doğrulamıyordu: A firmasının ürünü B firmasının kategorisine ya da ürününe bağlanabiliyor, B'nin kategori / ürün adı A'nın ekranında görünüyordu. Aynı kalıp 15 kadar uçta daha vardı. | Veritabanında 90 ilişkinin hepsine tetikleyici (`tenant_ref_check`, migration `20261209120000_firma_iliski_denetimi`): kayıt başka firmanın kaydına bağlanamaz; ham SQL de kapsanır. Uç 400 döner. | `tenantRefs` (yeni ilişki eklenip tetikleyicisi unutulursa test düşer) |
| 2 | Orta | **Firma içi en az yetki.** Hiç yetkisi olmayan ekip üyesi (ör. yalnızca Personel Alanım için açılmış depo çalışanı) menüde göremese de API'den bütün siparişleri, carileri, tahsilatları, iadeleri, ayarları ve kullanıcı listesini okuyabiliyordu. | Uçlar ekranlarla aynı yetkiyi ister (aşağıdaki tablo). Bayi yine yalnızca kendi kaydını görür. | `authzMatrix` |
| 3 | Orta | **Hesap başına deneme kilidi yoktu.** Sınır IP başınaydı; IP değiştirilerek tek hesaba şifre ya da 2FA kodu denenebilirdi. | Hesap başına 15 dakikada 10 hatalı denemeden sonra o hesaba giriş 15 dakika kapanır: firma girişi, ortak giriş, platform girişi, 2FA kodu. Başarılı giriş sayacı sıfırlar. | `authHardening`, birim |
| 4 | Orta | **Webhook SSRF.** İç ağ denetimi `::ffff:10.0.0.1` biçimli (IPv4 eşlemeli) adresleri, NAT64 / 6to4'ü ve DNS yeniden bağlamayı (doğrulamadan sonra kaydın iç ağa çevrilmesi) yakalamıyordu. | Kapsamlı blok listesi (özel, geri döngü, bağlantı yerel, CGNAT, çoklu yayın, belgeleme aralıkları; IPv6 karşılıkları). Canlıda bağlanırken çözülen adres de denetlenir. Kullanıcı adı / parola taşıyan adres reddedilir. | birim (`security`) |
| 5 | Orta | **Toplu e-posta denemesi.** İstek gövdesine `user` / `tenant` yazılarak "kendime deneme" e-postası başka bir adrese ve başka bir firmanın adıyla gönderilebiliyordu. | Firma ve alıcı her zaman oturumdan gelir. | `bulkMail` |
| 6 | Orta | **E-postada HTML enjeksiyonu.** Bildirim, şifre, doğrulama, teklif ve ekstre e-postalarında ad, firma adı, bildirim başlığı ve metni kaçırılmıyordu. Herkese açık bayilik başvurusuna ad olarak yazılan bir bağlantı, yöneticiye firmanın kendi adresinden giden bildirim e-postasına gömülebiliyordu (oltalama). | Şablona giren bütün değerler HTML olarak kaçırılır. | `bulkMail`, `isolation` |
| 7 | Düşük | **Kullanıcı tespiti.** Firma ve platform girişinde kayıtlı olmayan e-postada şifre karşılaştırılmadığı için yanıt belirgin biçimde hızlı dönüyordu. | Hesap yoksa da sahte karşılaştırma yapılır (ortak girişte zaten vardı). | `authHardening` |
| 8 | Düşük | **Açık yönlendirme.** Kartla ödeme dönüşü (`/api/public/pos/callback?tenant=`) firma kısa adını doğrulamadan yönlendirme adresine koyuyordu. | Yalnızca harf / rakam / tire. | — |
| 9 | Düşük | **Ürün bağlantıları.** Teknik katalog / video adresi olarak `javascript:` kabul ediliyordu (React 19 tarayıcıda engelliyor). | Yalnızca `http(s)`; başka adres 400. | — |
| 10 | Düşük | **Şifre sıfırlama.** Yöneticinin (ya da bayi ana kullanıcısının) sıfırladığı şifre kişinin açık oturumlarını kapatmıyordu. Ayarlar yetkili ekip üyesi firma sahibinin şifresini sıfırlayabiliyordu. | Sıfırlama açık oturumları kapatır. Sahibin şifresini yalnızca sahibi değiştirir. | `authHardening` |
| 11 | Düşük | **JWT.** Doğrulamada algoritma sabit değildi (kütüphane varsayılanı güvenliydi). Oturum doğrulaması, aynı anahtarla imzalanan 2FA / giriş aktarım / Google biletlerini ayrıca reddetmiyordu (alan adları farklı olduğu için istismar edilemiyordu). | Bütün doğrulamalar yalnızca HS256. Tür alanı taşıyan ya da numarası olmayan belirteç oturum sayılmaz. | `authHardening` |
| 12 | Düşük | **Geçersiz girdide 500** (ZAP). ERP API'de geçersiz tarih, metin sayfa numarası, sınırı aşan sipariş numarası; istek değeriyle nesne araması (`?sort=constructor`). | Genel hata işleyici geçersiz parametreyi 400'e çevirir (günlüğe yazılır). ERP tarih parametresi açık mesaj verir. `Object.hasOwn`. | `authHardening` |
| 13 | Düşük | **Yanıt başlıkları** (ZAP). API yanıtları önbelleğe alınabilir işaretliydi; bilinmeyen adres JSON yerine HTML dönüyordu. | API yanıtlarında `Cache-Control: no-store`; bilinmeyen adres JSON 404. | `authHardening` |
| 14 | Düşük | Platform: olmayan firmanın veri dışa aktarımı 500 dönüyordu. Sipariş şablonu silme olmayan / başka bayinin şablonunda "silindi" diyordu (silmiyordu). | 404. | `authzMatrix`, `dealerIdor` |
| 15 | Paket | Backend: `proxy-addr` (kritik, IP sahteciliği), `multer` (yükleme DoS, boyut sınırı aşma), `body-parser`, `qs`, `brace-expansion`; **`nodemailer` 6.9.16 → 10.5.0** (SMTP komut enjeksiyonu, adres ayrıştırma ve başlık açıkları). Frontend: `axios`, `react-router` (ters eğik çizgiyle açık yönlendirme), `vite`, `postcss`, `follow-redirects`, `form-data`. | Güncellendi. nodemailer 10 sahte bir SMTP sunucusuyla gerçek konuşmada denendi (AUTH, Türkçe ad / konu, `Reply-To`, `List-Unsubscribe`). | tüm testler |

### Yetkisiz ekip üyesine kapanan okumalar

Menüler zaten bu yetkilere göre gösteriliyordu; değişen, API'nin de aynı kuralı uygulaması.

| Uç | Gereken yetki (birinden biri) |
|---|---|
| Sipariş listesi, sipariş detayı, Excel, fatura | Siparişler, Finans |
| Tahsilat listesi | Finans |
| İade listesi | Siparişler |
| Bayi / cari seçim listesi (`/companies`) | Bayiler, Finans, Siparişler, Ürünler, Teklifler |
| Ayarlar (`/settings`) | Ayarlar, Ürünler |
| Kullanıcı listesi (`/auth/users`) | Ayarlar, Bayiler |

## Sağlam bulunanlar

- **Firma kapsamı:** Prisma eklentisi 63 modelin bütün sorgularına firma numarasını ekliyor. Kapsam dışı log tabloları elle süzülüyor. Bütün ham SQL parametreli (tek `$queryRawUnsafe` yalnızca koddaki tablo adını alıyor).
- **Yetki matrisi:** 3.651 denemede izinsiz kişi hiçbir uca ulaşamadı. Dosya yükleme hiçbir uçta kimlik doğrulamadan önce çalışmıyor. Oturumsuz açık 49 uç tek tek gözden geçirildi (giriş / kayıt, imzalı ya da rastgele anahtarlı bağlantılar, ödeme sağlayıcısı bildirimleri, formlar); hepsinde hız sınırı var.
- **Firma içi ayrım:** bayi başka bayinin hiçbir kaydına ulaşamıyor. Bayi çalışanı kullanıcı yönetimi ve onay gibi ana kullanıcı işlerini yapamıyor. `?companyId=` ile başka bayinin listesi istenemiyor.
- **Anahtarlar:** teklif / ekstre paylaşımı, XML besleme, sohbet ve şifre sıfırlama anahtarları 24–32 bayt rastgele. Abonelikten çıkma bağlantısı imzalı. API anahtarları özetiyle (hash) saklanıyor.
- **Ödeme bildirimleri:** PayTR imzası doğrulanıyor. iyzico bildirimi gövdeye güvenmiyor, durumu iyzico'dan yeniden sorguluyor. Tutar eşleşmesi ve tekrar gelen bildirim denetleniyor.
- **Google ile giriş:** dönüş adresi istekten değil firma kaydından üretiliyor. `state`, `nonce` ve tarayıcı çerezi eşleşmeli. Bilet tek kullanımlık.
- **Yükleme:** SVG kabul edilmiyor. Görsel dışı dosyalar indirme olarak sunuluyor, `nosniff` var. Cari / gelir-gider / personel belgeleri doğrudan sunulmuyor, yetkili uçtan iniyor. Dosya adları rastgele.
- **Arayüz:** `dangerouslySetInnerHTML` yok. Ham HTML yalnızca iyzico'nun kendi ödeme formunda kullanılıyor.
- **Canlı yapılandırma:** Caddy'de HSTS, CSP, `frame-ancestors 'none'`, `nosniff`, Referrer-Policy var. Veritabanı, Redis ve backend portları dışarı kapalı. Canlıda 32 karakterden kısa `JWT_SECRET` ya da tanımsız `ENCRYPTION_KEY` ile sunucu açılmıyor.
- **Git geçmişi:** hiçbir commit'te `.env`, anahtar dosyası ya da gömülü API anahtarı / özel anahtar yok.
- **OWASP ZAP:** düzeltmelerden sonra 120 kontrolün hepsi geçti (SQL / NoSQL enjeksiyonu, XSS, yol geçişi, komut enjeksiyonu, bulut meta veri SSRF'i, başlık kontrolleri; 0 FAIL, 0 WARN).

## Açık kalanlar

1. **`xlsx` (SheetJS) paketi — kapatıldı (12 Kasım 2026).** npm'deki son sürüm (0.18.5) prototip kirlenmesi ve ReDoS açığı taşıyordu; düzeltilmiş sürüm (0.20.3) yalnızca SheetJS'in kendi sunucusunda. Paket yalnızca iki yerde, yalnızca yüklenen dosyayı okumak için kullanılıyor (`xlsx.read` + `xlsx.utils.sheet_to_json`; ürün ve cari içe aktarımı); dışa aktarım kendi yazıcısıyla (`utils/xlsxStream.js`) yapılıyor, bu paketi kullanmıyor. 0.20.3 aynı API olduğu için kod değişmedi.
   - SheetJS 0.20.3 tarball'ı depoya gömüldü: `backend/vendor/xlsx-0.20.3.tgz` (sha256 `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`), `package.json`'da `"xlsx": "file:vendor/xlsx-0.20.3.tgz"`. Canlı derleme (`npm ci`) dış sunucuya bağımlı kalmaz.
   - CI backend paket taraması eşiği `--audit-level=high` yapıldı.
2. **Abonelik ödeme formu ve CSP.** Firmanın abonelik ödemesinde iyzico formu sayfaya gömülüyor ve satır içi betik çalıştırıyor. Canlı CSP'de `script-src` olmadığı için yalnızca kendi alan adından betik çalışır; form büyük olasılıkla açılmaz. Bayinin kartla cari ödemesi iyzico'nun sayfasına yönlendirmeyle çalıştığı için etkilenmez. Canlı benzeri ortamda iyzico sandbox kartıyla denenmeli. Çözüm, formu backend'den kendi CSP'siyle sunulan ayrı bir sayfada açmak ya da iyzico'nun ödeme sayfasına yönlendirmek. CSP'ye `'unsafe-inline'` eklemek XSS korumasını zayıflattığı için önerilmez.
3. **Konteyner kullanıcısı.** Backend imajı `node:20` ile root olarak çalışıyor. Öneri: canlı imajda `USER node` ve `node:20-slim` (Prisma için `openssl` kurulur). Sunucuda yükleme klasörünün sahibi 1000:1000 yapılmalı. Canlı sunucuda dosya izinleriyle birlikte denenmesi gerektiği için şimdi değiştirilmedi.
4. **Bilinen ve kabul edilen sınırlar:**
   - Oturum belirteci tarayıcıda localStorage'da duruyor (XSS olursa okunabilir; CSP ve React'in kaçışı bu riski düşürüyor).
   - 2FA kodu kendi 30 saniyelik penceresinde ikinci kez kullanılabilir (hesap kilidiyle sınırlı).
   - Ayarlar yetkili ekip üyesi kendine de yetki verebilir (Ayarlar yetkisi ekip yönetimini kapsar).
   - Bazı uçlar sınırı aşan numarada (ör. `/orders/99999999999`) 400 yerine 500 döner. Kayıt hata izlemeye düşer; veri sızdırmaz.

## Testler

| Dosya | Test | Ne doğrular |
|---|---|---|
| `integration/authzMatrix` | 3 | 450 uç × 10 kişi: izinsiz olan 401 / 403, izinli olan reddedilmez, 5xx yok; yükleme kimlik doğrulamadan sonra; herkese açık uç listesi gözden geçirilmiş listeyle aynı (yeni açık uç eklenirse düşer) |
| `integration/tenantRefs` | 3 | Her firma ilişkisinin tetikleyicisi var; API'den ve ham SQL'den başka firmanın kategorisine / ürününe / bayisine bağ reddedilir; işlem içinde yeni kayda bağ çalışır |
| `integration/dealerIdor` | 5 | `dealers` testine ek: onay talepleri, bayi çalışanının ana kullanıcı işleri, teklif kabul / iletme / iptal, `?companyId=` ile zorlama |
| `integration/authHardening` | 4 | Sahte / süresi dolmuş / değiştirilmiş belirteç ve başka tür biletler; hesap kilidi ve diğer hesabın etkilenmemesi; sıfırlamada oturumun kapanması, sahibin korunması; geçersiz parametrede 400, JSON 404, `no-store` |
| `unit/security` (ek) | 3 | SSRF blok listesi (eşlemeli IPv6, CGNAT, meta veri adresi), canlı ortam webhook adres kuralları ve bağlantı anında denetim, hesap başına deneme sayacı |
| `unit/excelImport` | 5 | Excel içe aktarım yardımcısı: geçerli dosya okunur; satır sınırı aşımı (sheet_to_json öncesi aralık denetimiyle) reddedilir; Excel olmayan metin çökertmeden işlenir; `sheetToJson` seçenekleri geçer |

Tam sonuç (12 Kasım): birim 46 / 46, entegrasyon 168 (167 geçti, 1 atlandı: canlı Yurtiçi), UAT 51 / 51, frontend lint ve derleme temiz. 13 Kasım: birim 51 / 51 (xlsx içe aktarım sınırı testleriyle).

Uç → kim girebilir tablosunun tamamı: [docs/guvenlik/yetki-matrisi.md](../guvenlik/yetki-matrisi.md).

## Sürekli güvenlik taramaları (CI, 13 Kasım 2026)

Tek seferlik denetime ek olarak, her değişikliği otomatik tarayan kalıcı bir ağ kuruldu (asıl değer: gelecekteki regresyonları insan gerektirmeden yakalamak). Bulgular GitHub → **Security → Code scanning**'de birikir.

| Tarama | Araç | Dosya | Davranış |
|---|---|---|---|
| SAST (kod) | **CodeQL** (`security-extended`) | `.github/workflows/codeql.yml` | Enjeksiyon, path traversal, güvensiz regex vb.; public repo'da ücretsiz |
| SAST (kod) | **Semgrep** (p/default, javascript, express, nodejsscan, security-audit, secrets) | `.github/workflows/security.yml` | SARIF olarak Code scanning'e yazılır (ilk aşamada derlemeyi durdurmaz) |
| Sır taraması | **gitleaks** (tam git geçmişi) | `.github/workflows/security.yml` | Sır bulursa işi **durdurur**; public repo'da geçmişteki sır herkese açık olduğu için kritik |
| Konteyner / CVE | **Trivy** (backend imajı, HIGH+CRITICAL) | `.github/workflows/security.yml` | `node:20` tabanı ve paket açıklarını listeler; slim + root'suz kararını besler |

Ek sertleştirmeler (13 Kasım):

- **Excel içe aktarım sınırı:** Ürün içe aktarımına da satır sınırı (5000) kondu; partnerde zaten vardı. `sheet_to_json` ÖNCESİ dosyanın bildirdiği aralık denetlenir — kötü niyetli bir dosya milyonlarca satır bildirip belleği parse sırasında şişiremez (`backend/src/utils/excelImport.js`). Herkese açık firma kaydı yüzünden gerçek ama düşük bir DoS yüzeyiydi.
- **Açık bildirimi:** `frontend/public/.well-known/security.txt` (RFC 9116) ve kök `SECURITY.md`. İletişim adresi (`security@akisb2b.com`) kurulup yönlendirilmeli; ilk dağıtımda `curl https://<alanadı>/.well-known/security.txt` ile teyit edilmeli.

### DAST, kötüye kullanım testi ve pentest kapsamı (13 Kasım)

- **Kötüye kullanım / DoS dayanıklılığı (`loadtest/abuse.js`, k6):** Yük-testi backend'inde (`akis_load`, dev DB'ye dokunmaz) giriş kaba kuvveti + kayıt taşması koşuldu. Sonuç: **150/150 kontrol geçti, 0 sunucu hatası (5xx), 60 istek 429** (IP sınırı + hesap kilidi devrede), saldırı boyunca `/health` 200 (canlılık). Veri yazmaz (yanlış şifre / geçersiz gövde). Çalıştırma: `DOCKER_NETWORK=akis_b2bsistem_default BASE_URL=http://akis_loadtest_backend:5001 TENANT=yuktest ./loadtest/run.sh abuse`.
- **DAST (ZAP) genişletme:** ERP API aktif taramasına (0 FAIL) ek olarak tenant API'ye **pasif baseline** koşuldu: **0 FAIL, 65 PASS, 3 düşük WARN** (önbellek/`CSP no-fallback`/`Permissions-Policy` — API'ye doğrudan erişimde; canlıda bu başlıkları Caddy ekliyor). Hata/PII/kaynak kodu sızıntısı yok.
- **Bağımsız pentest kapsamı:** Dış firmaya verilmek üzere kapsam, test hesapları, odak alanları ve kurallar hazırlandı: [docs/guvenlik/pentest-kapsam.md](../guvenlik/pentest-kapsam.md). Kimlikli aktif DAST ve iş-mantığı derinlemesi bu çalışmaya bırakıldı.
- **Nuclei (şablon tabanlı tarama, 13 Kasım):** 7246 şablon izole loadtest backend'ine koşuldu. **1 kritik bulgu** çıktı ve kapatıldı:

### Brotli istek gövdesi RCE (CVE-2026-111497 / node2shell) — kapatıldı (13 Kasım)

- **Bulgu:** Express 5'in gövde ayrıştırıcısı (`body-parser` 2.2.2) `Content-Encoding: br` İSTEK gövdelerini kendisi çözüyor (`read.js` → `zlib.createBrotliDecompress()`). Node 20.20.2'nin paketlediği **brotli 1.1.0**, CVE-2026-111497'nin zafiyetli aralığında (1.0.3–1.2.0; tamsayı taşması, CWE-190, CVSS 9.8). Böylece **kimlik doğrulaması olmadan** (signup, login, talep formu…) gönderilen hazırlanmış bir brotli gövdesi, çözme sırasında bellek bozulmasına / DoS'a / olası RCE'ye yol açabilirdi.
- **Doğrulama:** Önkoşullar canlı teyit edildi (gerçek brotli JSON `/api/public/signup`'ta çözülüp parse edildi); exploit çalıştırılmadı.
- **Düzeltme:** Uygulama sıkıştırılmış istek gövdesi beklemediği için, `Content-Encoding: br` taşıyan istekler gövde ayrıştırmadan **önce 415 ile reddedilir** (`backend/src/app.js`); gzip/deflate etkilenmez. Düzeltme sonrası nuclei artık zafiyet bildirmiyor; regresyon testi: `integration/authHardening` (br → 415, gzip → çözülür).
- **Derinlemesine savunma (öneri):** Canlı imajı `node:20`'nin brotli 1.1.1+ paketleyen son yamasıyla yeniden derlemek (middleware zaten tam kapatıyor, bu ek katman).

### Giriş kötüye kullanım koruması, CAPTCHA ve saldırı paneli (13 Kasım)

Mevcut istek sınırı (rateLimit) ve hesap kilidine (loginGuard) EK olarak:

- **IP kötüye kullanım blokesi (`services/abuseGuard.js`):** Bir IP'den arka arkaya ~10 başarısız giriş sonrası o IP **süreli ve kademeli** bloke edilir (15 dk → 1 sa → 6 sa → 24 sa; tekrar ettikçe uzar, sonra kendiliğinden kalkar). Tüm giriş yollarına uygulanır (firma, ortak giriş, platform). Bloke IP 429 `IP_BLOCKED` alır. Loopback / iç istekler muaftır (üretimde gerçek istemciler Caddy arkasından gerçek IP ile gelir — `trust proxy`). Redis varsa süreçler arası paylaşılır.
- **CAPTCHA — yalnızca platform/developer girişinde (Cloudflare Turnstile):** `TURNSTILE_SECRET` (+ `TURNSTILE_SITEKEY`) tanımlıysa platform girişi CAPTCHA ister; tanımsızsa CAPTCHA olmadan çalışır (panelde "kurulu değil" görünür). Kullanıcı girişlerine CAPTCHA konmadı (sürtünme) — orada IP blokesi var. Caddy CSP'ye `challenges.cloudflare.com` eklendi.
- **Panel (Platform → Güvenlik → "Saldırılar ve blokeler"):** aktif IP blokeleri + son olaylar (bloke / bloke IP denemesi / kaldırma) listelenir. Her blokenin yanında **"Kaldır"** düğmesi — haklı yere engellenen bir kullanıcı iletişime geçince developer kaldırabilir.
- **Bildirim:** yeni blokede (SMTP varsa) `PLATFORM_ALERT_EMAIL`'e uyarı gider (aynı IP için saatte en çok bir kez).
- **Doğrulama:** gerçek IP (XFF) 10 hatadan sonra `IP_BLOCKED`; loopback muaf; regresyon testi `integration/authHardening` (6/6).

## Çalıştırma

```bash
# Yetki matrisi ve tabloyu yeniden üretmek (geliştirme backend kapsayıcısında)
docker exec akis_b2bsistem-backend-1 sh -c 'REDIS_URL= JWT_SECRET=test-secret AUTHZ_OUT=/tmp/matrix.md \
  TEST_DATABASE_URL=postgresql://akis:akis_dev_password@db:5432/akis_test node --test test/integration/authzMatrix.test.js'

# OWASP ZAP: UAT ortamı açıkken (UAT_KEEP=1 ./uat/run.sh tests/giris.spec.mjs), panelden bir API anahtarı alıp
docker run --rm --add-host host.docker.internal:host-gateway -v "$PWD/zap:/zap/wrk" zaproxy/zap-stable \
  zap-api-scan.py -t http://host.docker.internal:5002/api/v1/openapi.json -f openapi -O http://host.docker.internal:5002 -r zap.html \
  -z "-config replacer.full_list(0).enabled=true -config replacer.full_list(0).matchtype=REQ_HEADER \
      -config replacer.full_list(0).matchstr=X-API-Key -config replacer.full_list(0).replacement=<ANAHTAR>"

# Paket açıkları (CI'de de her push'ta çalışır)
cd backend && npm audit --omit=dev
cd frontend && npm audit --omit=dev
```

GitHub'da Dependabot haftalık paket güncellemesi ve güvenlik düzeltmesi PR'ları açar (`.github/dependabot.yml`).
