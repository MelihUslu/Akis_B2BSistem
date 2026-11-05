# Yük testleri (k6)

API'nin eşzamanlı kullanıcı altında nasıl davrandığını ölçer. k6 kurmak gerekmez; testler Docker ile (`grafana/k6:0.54.0`) çalışır.

## Testler

| Test | Ne yapar | Ne zaman |
|---|---|---|
| `smoke` | 1 kullanıcı, 30 sn. Bütün akışlar 200 dönüyor mu? | Her değişiklikten sonra, canlıya çıkmadan önce |
| `load` | Normal yoğun gün: %85 bayi, %15 yönetici, 50 eşzamanlı kullanıcıya kadar (1 dk artış, 3 dk sabit) | Sürüm öncesi, performans karşılaştırması |
| `stress` | 50 → 100 → 150 → 200 kullanıcı, her basamakta 2 dk. Nerede yavaşlıyor, nerede hata veriyor? | Kapasite planlarken |
| `spike` | 10 kullanıcıdan 10 saniyede 150'ye çıkar, 1 dk tutar, geri iner (kampanya duyurusu) | Toparlanmayı görmek için |
| `order-write` | Saniyede N sipariş oluşturur. **Veri yazar.** | Yalnızca ayrı bir test firmasında |

`smoke`, `load`, `stress` ve `spike` **yalnızca okur**. Sepet hesabı (`POST /orders/quote`) tutarı hesaplar ama kayıt oluşturmaz.

### Kullanıcı akışları (`lib/flows.js`)

- **Bayi:** kategoriler, filtreler, katalog ve portal ayarları (aynı anda), arama, sayfa 2, stoktakiler, 1–3 ürünlük sepet hesabı, siparişlerim. Adımlar arasında 1–5 sn düşünme süresi var.
- **Yönetici:** panel ve menü rozetleri, sipariş listesi ve sayaçları, ürün listesi, son 30 günün satış raporu.

## Çalıştırma

```bash
# Hazır oturum anahtarıyla
ADMIN_TOKEN=… DEALER_TOKEN=… ./loadtest/run.sh smoke

# ya da e-posta / şifreyle (test başında bir kez giriş yapılır)
ADMIN_EMAIL=admin@firma.com ADMIN_PASSWORD=… DEALER_EMAIL=bayi@firma.com DEALER_PASSWORD=… ./loadtest/run.sh load

# Ayarlar
PEAK=100 HOLD=5m ./loadtest/run.sh load          # tepe kullanıcı sayısı ve sabit yük süresi
BASE_URL=https://api.akisb2b.com TENANT=firma ./loadtest/run.sh smoke

# Yazma testi: yalnızca test firmasında
WRITE_OK=1 TENANT=yuktest RATE=3 DURATION=2m DEALER_EMAIL=… DEALER_PASSWORD=… ./loadtest/run.sh order-write
```

- `BASE_URL`: backend adresi. Varsayılan, bilgisayarınızdaki backend (`http://host.docker.internal:5001`).
- `TENANT`: firma kısa adı; `X-Tenant` başlığıyla gönderilir. Varsayılan `akis`.
- `DOCKER_NETWORK`: yerelde k6'yı backend'le aynı Docker ağında çalıştırır (ör. `DOCKER_NETWORK=akis_b2bsistem_default BASE_URL=http://backend:5001`). Docker Desktop'ın port yönlendirmesinden gelen ara sıra bağlantı zaman aşımlarını ölçümden ayırır.
- Giriş ucunda 15 dakikada 20 deneme sınırı vardır. Testler her sanal kullanıcı için ayrı giriş yapmaz; başta bir kez giriş yapıp oturumu paylaşır.

## Büyük ölçekli testler (1000+ kullanıcı, gerçekçi veri)

Geliştirme veritabanında birkaç ürün olduğu için sonuçlar fazla iyimser çıkar. Büyük testler **ayrı bir veritabanında** (`akis_load`) ve **ayrı bir backend kopyasında** çalışır; geliştirme verinize dokunulmaz.

```bash
# 1) Yük testi backend'i (kod sizinkiyle aynı; veritabanı akis_load, nodemon yok), ayrı Redis'i ve önündeki Caddy
mkdir -p loadtest/.data && openssl rand -hex 24 > loadtest/.data/secret
docker run -d --name akis_loadtest_redis --network akis_b2bsistem_default redis:7-alpine
NM=$(docker inspect akis_b2bsistem-backend-1 --format '{{range .Mounts}}{{if eq .Destination "/app/node_modules"}}{{.Name}}{{end}}{{end}}')
docker run -d --name akis_loadtest_backend --network akis_b2bsistem_default \
  -v "$PWD/backend:/app" -v "$NM:/app/node_modules:ro" -v "$PWD/loadtest:/loadtest" -w /app \
  -e DATABASE_URL=postgresql://akis:akis_dev_password@db:5432/akis_load -e JWT_SECRET="$(cat loadtest/.data/secret)" \
  -e PORT=5001 -e TZ=Europe/Istanbul -e ROOT_DOMAIN=localhost \
  -e WEB_CONCURRENCY=4 -e DB_POOL_SIZE=15 -e REDIS_URL=redis://akis_loadtest_redis:6379 \
  akis_b2bsistem-backend node src/server.js
docker run -d --name akis_loadtest_caddy --network akis_b2bsistem_default \
  -v "$PWD/loadtest/caddy/Caddyfile:/etc/caddy/Caddyfile:ro" -v "$PWD/loadtest/.data/web:/srv:ro" caddy:2.8-alpine
# WEB_CONCURRENCY=4: 4 işçi süreç (canlıya yakın). Tek süreci ölçmek için bu satırı çıkarın.
# Ayrı Redis: dayanıklılık testi onu yeniden başlatır; geliştirme Redis'ine dokunulmaz.
# Caddy (loadtest/caddy/Caddyfile, canlıdaki api bloğunun HTTPS'siz hâli): ani yük ve dayanıklılık testleri canlıdaki gibi
# Caddy arkasından ölçülür (BASE_URL=http://akis_loadtest_caddy:8080). Kod değişince: docker restart akis_loadtest_backend

# 2) Veritabanını sıfırla ve gerçekçi veri üret (1000 yönetici, 1000 bayi, 5000 ürün, 60.000 sipariş; ~15 sn)
./loadtest/seed/reset.sh
docker exec -w /app akis_loadtest_backend node /loadtest/seed/seed.mjs     # ADMINS= DEALERS= PRODUCTS= ORDERS= ile değiştirilebilir

# 3) Testler (k6 backend'le aynı Docker ağında)
export DOCKER_NETWORK=akis_b2bsistem_default BASE_URL=http://akis_loadtest_backend:5001 TENANT=yuktest
./loadtest/monitor.sh loadtest/results/izleme.csv &      # CPU / bellek / DB bağlantısı (5 sn'de bir)
./loadtest/run.sh scale                                  # 1000 yönetici + 1000 bayi (ADMINS= DEALERS= RAMP= HOLD=)
./loadtest/run.sh breakpoint                             # istek hızı artar, %95 > 2 sn ya da hata > %5 olunca durur (MAX_RPS=)
./loadtest/run.sh soak                                   # 300 kullanıcı, 20 dk (USERS= DURATION=)
WRITE_OK=1 ./loadtest/run.sh concurrency                 # eşzamanlı sipariş + onay yarışı (VERİ YAZAR, yalnızca akis_load)
WRITE_OK=1 ./loadtest/run.sh kampanya                    # kampanya günü: sipariş, onay, tahsilat, teklif, katalog aynı anda (VERİ YAZAR)
./loadtest/run.sh agir                                   # ağır uçlar yük altında: sakin 3 dk ↔ ağır işler sürerken 3 dk (USERS= HEAVY=)
kill %1                                                  # izlemeyi durdur

# Kampanya gününden sonra doğruluk kontrolü (eksi stok, çift borç, bakiye tutarsızlığı, çakışan makbuz no…; sorun varsa çıkış kodu 2)
docker exec -w /app akis_loadtest_backend node /loadtest/seed/check.mjs

# Gürültülü komşu: 99 küçük firma daha üret, sonra büyük firma ağır iş yaparken komşuların süresini ölç
docker exec -w /app akis_loadtest_backend node /loadtest/seed/neighbors.mjs   # FIRMS= DEALERS= PRODUCTS= ORDERS=
./loadtest/run.sh komsu                                  # QUIET= (komşu kullanıcı) NOISY= (ağır iş sekmesi)

# ERP API yükü: normal kullanıcılar çalışırken ERP bütün ürünlerin stok ve fiyatını 1.000'lik partilerle günceller;
# API anahtarı başına dakikalık sınır (600) ve aynı IP'deki başka firmanın anahtarı da denenir (VERİ YAZAR)
docker exec -w /app akis_loadtest_backend node /loadtest/seed/apikey.mjs
WRITE_OK=1 ./loadtest/run.sh erp                         # USERS= BATCH=

# Aşırı ani yük ve dayanıklılık: Caddy arkasından
BASE_URL=http://akis_loadtest_caddy:8080 ./loadtest/run.sh ani      # taban → 10 sn'de tepe (PEAK=600 açılış/sn) → taban
BASE_URL=http://akis_loadtest_caddy:8080 ./loadtest/dayaniklilik.sh  # yük sürerken: işçi süreç, Redis, veritabanı kesintisi

# Uzun süre (gece, 2–4 saat): okuma yükü + düşük hızda yazma; 5 dk'da bir süre, işçi belleği, bağlantı ve tablo ölçümü
# (results/uzun-olcum.csv, results/uzun-tablolar.txt). Bilgisayar açık ve prize takılı kalmalı.
caffeinate -ims env BASE_URL=http://akis_loadtest_caddy:8080 WRITE_OK=1 DURATION=3h ./loadtest/uzun.sh

# Tarayıcıyla sayfa açılışı: ön yüzü yük testi firmasına sabit derle (Caddy 8081'den sunar), sonra gerçek Chromium
# oturumları katalog ve ödeme sayfasını önce yük yokken, sonra 600 bayi API'ye yüklenirken açar
(cd frontend && VITE_API_URL=/api VITE_DEFAULT_TENANT=yuktest npx vite build --outDir ../loadtest/.data/web --emptyOutDir)
BASE_URL=http://akis_loadtest_caddy:8080 ./loadtest/run.sh tarayici             # DEALERS= PAGES= WEB_URL=

# 10 kat veri: aynı seed, büyük sayılarla (~3 dk)
./loadtest/seed/reset.sh && docker exec -w /app -e ADMINS=1000 -e DEALERS=10000 -e PRODUCTS=50000 -e ORDERS=600000 akis_loadtest_backend node /loadtest/seed/seed.mjs
```

**Ölçüm araçları**

```bash
# Ham çıktıyı iCloud dışına yazın: proje iCloud'daysa yüzlerce MB'lık dosya senkronize edilirken işlemciyi testle paylaşır
OUT_DIR=/tmp/k6 ./loadtest/run.sh scale --out json=/out/scale.jsonl
python3 loadtest/uclar.py /tmp/k6/scale.jsonl                  # uç bazında istek, hata, ortanca, %95, %99
python3 loadtest/uclar.py /tmp/k6/agir.jsonl phase=agir_altinda  # yalnızca bir aşama
python3 loadtest/dilimler.py /tmp/k6/ani.jsonl                 # 10 sn'lik dilimler: kesintinin etkisi ve toparlanma
# Ağır bir istek işçi süreci ne kadar kilitliyor? (yük olmadan, uç uç)
docker exec -w /app akis_loadtest_backend node /loadtest/seed/blocking.mjs
# Yavaş sorgular: akis_load'da 300 ms'yi aşan sorgular Postgres günlüğüne yazılır (reset.sh sonrası yeniden açın)
docker exec akis_b2bsistem-db-1 psql -U akis -d postgres -c 'ALTER DATABASE akis_load SET log_min_duration_statement = 300'
```

Oturum anahtarları `seed.mjs` tarafından `loadtest/.data/tokens.json` dosyasına yazılır (git'e girmez); her sanal kullanıcı farklı bir hesapla girer.

**Eşzamanlılık testinden sonra stok kontrolü** (hiçbir ürün eksiye düşmemeli):

```bash
docker exec akis_b2bsistem-db-1 psql -U akis -d akis_load -c 'select id, sku, stock from "Product" where id in (1,2,3,4,5) order by id'
```

## Sonuçlar

- **Ekrandaki özet:** kontroller (✓ / ✗), istek süreleri (ortalama, %90, %95) ve hata oranı.
- **`loadtest/results/<test>-<zaman>.json`:** karşılaştırma için saklanır, git'e girmez.
- **Başarısız istekler:** durum kodu ve yanıtın başı ekrana yazılır.

**Eşikler** (`lib/config.js`; aşılırsa test başarısız olur ve komut hata koduyla biter):

- hata oranı %1'in altında, kontrollerin %99'u geçmeli;
- okuma isteklerinde %95 süre 500 ms, %99 süre 1,2 sn altında;
- sepet hesabında %95 süre 800 ms altında.

`stress` ve `spike` bilerek daha gevşek eşik kullanır; amaç kırılma noktasını görmektir.

## İleri testler

4 Kasım 2026'da planlandı, dokuzu da 5 Kasım'da yapıldı; bulunan sorunlar düzeltildi.

| # | Test | Ne ölçer | Durum |
|---|---|---|---|
| 1 | **Kampanya günü** (`kampanya.js`) | 600 bayi sipariş verir, 50 yönetici onaylar, tahsilat ve teklif akar, katalog okunur. Kilit beklemesi, bağlantı havuzu, stok yarışı birlikte. | ✓ 5 Kasım |
| 2 | **100 firma, gürültülü komşu** (`komsu.js`) | Büyük firma ağır iş yaparken (Excel, 12 aylık rapor, tüm veri dışa aktarımı) 99 komşu firmanın yanıt süresi bozuluyor mu? | ✓ 5 Kasım |
| 3 | **Uzun süre** (`uzun.sh` + `uzun.js`, 3 saat) | 300 kullanıcı okurken düşük hızda sipariş, onay, tahsilat ve teklif. Bellek sızıntısı, açık kalan bağlantılar, büyüyen tablolar; saatlik işler yük altında birkaç kez çalışır. | ✓ 5 Kasım |
| 4 | **10 kat veri** (`scale.js`, büyük seed) | 600 bin sipariş, 50 bin ürün, 10 bin bayi. Sorgu planları büyük veride değişiyor mu? | ✓ 5 Kasım |
| 5 | **Ağır uçlar yük altında** (`agir.js`) | Excel, 12 aylık rapor, yaşlandırma, ekstre, tüm veri dışa aktarımı bir Node sürecini kilitleyip diğer istekleri bekletiyor mu? | ✓ 5 Kasım |
| 6 | **ERP API yükü** (`erp.js`) | `/api/v1` ile on binlerce ürünün stok/fiyat güncellemesi; API anahtarı istek sınırları. | ✓ 5 Kasım |
| 7 | **Aşırı ani yük** (`ani.js`) | 10 sn'de saniyede 600 açılışa (~3000 bayi) çıkış (kampanya bildirimi anı). Bilgisayarda kapasiteyi değil davranışı ve toparlanmayı gösterir. | ✓ 5 Kasım |
| 8 | **Dayanıklılık** (`dayaniklilik.sh`) | Yük sürerken bir işçi süreci öldürmek, Redis'i yeniden başlatmak, veritabanını 15 sn kesmek. Sistem kendiliğinden toparlanıyor mu? | ✓ 5 Kasım |
| 9 | **Tarayıcıyla sayfa açılışı** (`tarayici.js`) | 600 bayi API'ye yüklenirken gerçek Chromium oturumlarıyla katalog ve ödeme sayfasının açılış süresi. | ✓ 5 Kasım |

### 5 Kasım sonuçları

Hepsi geliştirme bilgisayarında (10 çekirdek, Docker'a 8 GB) ölçüldü; k6, backend (4 işçi) ve veritabanı aynı işlemciyi paylaşıyor.

| Test | Bulunan | Düzeltmeden sonra |
|---|---|---|
| Kampanya günü | Aynı anda girilen tahsilatlarda makbuz numarası, tekliflerde teklif numarası çakışıyordu (kayıt düşüyordu); yoğunlukta sipariş işlemi 5 sn sınırına takılıyordu. | 81.034 istek, %0 hata; 4.589 sipariş, 6.791 onay, 708 tahsilat, 573 teklif. Doğruluk kontrolü temiz (eksi stok, çift borç, bakiye farkı yok). |
| Gürültülü komşu | Tüm veri dışa aktarımı (+2,8 GB) ve 12 aylık satış raporu (+700 MB) işçi süreçleri bellek yetersizliğinden düşürüyordu: komşularda %5 hata, %95 süre 34 sn. | Komşularda %0 hata; %95 süre sakin 23 ms, gürültü altında 3,0 sn. |
| 10 kat veri | Katalog her saat başı TCMB kurunu beklerken 3,4 sn; satış raporu yanıtı 10,5 MB (150 yönetici açınca sunucu belleği 4,5 GB, k6 bellek yetmediğinden öldü); katalog araması, sıralaması ve sipariş sayaçları tabloyu baştan sona tarıyordu; marka filtresi 50 bin ürünü belleğe çekiyordu. | 127 → 195 istek/sn, %0 hata; okuma ortancası 0,19 sn, %95 süre 13 → 5,8 sn (kalan gecikme işlemci sınırı). Yavaş sorgu toplamı 3.286 → 758 sn. |
| Ağır uçlar | Bellekte kurulan Excel'ler işçi süreci 0,3–1 sn kilitliyordu; istemci ayrılınca tüm veri dışa aktarımı sürüp tek hakkı tutuyordu. | Ağır işler sürerken normal kullanıcılarda ortanca 110 → 187 ms, %95 süre 1,7 → 2,3 sn; %0 hata, bütün eşikler geçti. |
| ERP API | Stok / fiyat partisi kayıt başına sırayla sorgu atıyordu (1.000 kayıt: stok 11 sn, fiyat 5 sn; 50 bin ürünün tam senkronu ~7 dk). İstek sınırı IP + yol ile sayılıyordu: `/orders/:id`'de her sipariş ayrı sayılıyor, aynı IP'deki firmalar birbirinin sınırını yiyordu. Fiyat indeksi her fiyat güncellemesinde 10 indekse yazdırıyordu. | Parti 0,2 sn (tam senkron ~40 sn); sınır anahtar başına 600/dk (700 istekten tam 100'ü 429, komşu firma etkilenmedi); ürün güncellemelerinin %60'ı yerinde (önce %13). %0 hata. |
| Aşırı ani yük | Kapasitenin ~3 katında istekler kuyrukta 60 sn bekleyip zaman aşımına düşüyordu (5.091 istek); Caddy arkasında da yeni bağlantılar Node'un devir kuyruğunda bekliyordu. | Yük atma (işçi başına 100 eşzamanlı istek; fazlasına anında 503) + Caddy'de backend'e 1024 kalıcı bağlantı: zaman aşımı yok, tepede %95 süre ~2 sn, tepe biter bitmez taban süreleri. Ön yüz 503'te okuma isteklerini kendiliğinden yeniden dener. |
| Dayanıklılık | İşçi süreç ve Redis kesintisi sorunsuz. Veritabanı kesintisinde kullanıcılar 500 aldı, 15 sn'de 11 bin satır kayıt yazıldı. Ağır iş sınırında kaybolan bir bırakma, denemeler sürdükçe yeri kalıcı dolu tutabiliyordu. | Veritabanı kapalıyken istekler veritabanına gitmeden hızlı 503 alır (ön yüz yeniden dener), kayıt 172 satır; açılınca anında toparlanır. Ağır iş sınırı sahip başına süreli. |
| Uzun süre (3 saat) | Sızıntı yok: işçi belleği ilk dakikalardan sonra ~1 GB'ta (4 işçi) sabit, veritabanı bağlantısı 61'de sabit, yoklama süreleri 3 saat boyunca aynı (katalog ortancası ~20 ms; yük bitince 12 ms). Sunucu ve veritabanı günlüğünde hata yok; 3 saatte tek yavaş sorgu (303 ms). Veritabanı 79 → 287 MB: büyümenin tamamı bildirimler (962 bin satır), çünkü test firmasındaki 1.000 yöneticinin hepsi sipariş yetkili ve her sipariş / teklif her birine bildirim yazar. Gerçek firmada yönetici sayısı kadar satır; okunanlar 90 günde silinir. | Düzeltme gerekmedi. 2,6 milyon istek, %0 hata, %95 süre 27 ms, %99 süre 59 ms. |
| Tarayıcıyla sayfa açılışı | Katalog ilk ürün kartına kadar: sakinken ortanca 0,49 sn (%95 0,55); 600 bayi yüklenirken ortanca 1,57 sn (%95 2,15). Ödeme sayfası "Siparişi onayla" düğmesine kadar: sakinken 0,42 sn; yükte ortanca 0,72 sn (%95 1,1). LCP %95 0,86 sn, CLS 0,03. API yükünde 130 bin istekten 14'ü bilerek verilen 503 (yük atma; ön yüz yeniden dener). | Düzeltme gerekmedi. İyileştirme fırsatları: [`docs/yapilanlar/10-sonraki-adimlar.md`](../docs/yapilanlar/10-sonraki-adimlar.md). |

Düzeltmelerin ayrıntısı: [`docs/yapilanlar/09-testler-kalite.md`](../docs/yapilanlar/09-testler-kalite.md).

**Dikkat:** testler sırayla koşmalı (aynı anda koşarlarsa işlemciyi paylaşıp birbirini bozar). Bilgisayarda alınan sayılar önceki ölçümle karşılaştırma içindir; "canlıda kaç bayi kaldırır" sorusu için canlıyla aynı boyutta bir sunucu (Caddy + HTTPS dahil) ve k6'nın ayrı bir makineden çalışması gerekir.

## Dikkat

- **Canlı ortama karşı** çalıştırırken düşük yoğunluklu bir saat seçin. Önce `smoke`, sonra küçük bir `PEAK` ile `load` deneyin.
- **Geliştirme ortamındaki sonuçlar** (nodemon, Docker Desktop, tek Postgres) canlıyı birebir yansıtmaz. Karşılaştırma için aynı ortamda aynı testi tekrarlayın.
- **Yazma testinden sonra** test firmasını silmek, oluşan siparişleri de temizler.
