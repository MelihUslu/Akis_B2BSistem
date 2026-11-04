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
# 1) Yük testi backend'i (kod sizinkiyle aynı; veritabanı akis_load, nodemon yok)
mkdir -p loadtest/.data && openssl rand -hex 24 > loadtest/.data/secret
NM=$(docker inspect akis_b2bsistem-backend-1 --format '{{range .Mounts}}{{if eq .Destination "/app/node_modules"}}{{.Name}}{{end}}{{end}}')
docker run -d --name akis_loadtest_backend --network akis_b2bsistem_default \
  -v "$PWD/backend:/app" -v "$NM:/app/node_modules:ro" -v "$PWD/loadtest:/loadtest" -w /app \
  -e DATABASE_URL=postgresql://akis:akis_dev_password@db:5432/akis_load -e JWT_SECRET="$(cat loadtest/.data/secret)" \
  -e PORT=5001 -e TZ=Europe/Istanbul -e ROOT_DOMAIN=localhost \
  -e WEB_CONCURRENCY=4 -e DB_POOL_SIZE=15 -e REDIS_URL=redis://redis:6379/5 \
  akis_b2bsistem-backend node src/server.js
# WEB_CONCURRENCY=4: 4 işçi süreç (canlıya yakın). Tek süreci ölçmek için bu satırı çıkarın.
# REDIS_URL'deki /5: geliştirme Redis'inde ayrı veritabanı (geliştirme verisine karışmaz).

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
kill %1                                                  # izlemeyi durdur
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

## Sonraya bırakılan testler

Henüz yapılmadı (4 Kasım 2026'da planlandı, sonraya bırakıldı). Hazırlık toplam ~4–5 saat, çalışma ~2 saat + bir gece. Bulunan sorunların düzeltilmesi buna dahil değil.

| # | Test | Ne ölçer | Hazırlık | Çalışma |
|---|---|---|---|---|
| 1 | **Kampanya günü** (yazma ağırlıklı karışık yük) | Aynı anda 1000 bayi sipariş verir, 50 yönetici onaylar, tahsilat ve teklif akar, katalog okunur. Kilit beklemesi, bağlantı havuzu, stok yarışı birlikte. | 30–45 dk | 15 dk |
| 2 | **100 firma, gürültülü komşu** | Bir firma ağır yükteyken (toplu ERP senkronu, Excel dışa aktarma, büyük rapor) diğer 99 firmanın yanıt süresi bozuluyor mu? SaaS için en kritik risk. | 45–60 dk | 15 dk |
| 3 | **Uzun süre** (2–4 saat, gece) | Bellek sızıntısı, açık kalan bağlantılar, büyüyen tablolar (bildirim, istek metrikleri); saatlik işler yük altında birkaç kez çalışır. `soak.js` hazır, `caffeinate` ile başlatılır. | 10 dk | 2–4 saat |
| 4 | **10 kat veri** | 500 bin sipariş, 50 bin ürün, 10 bin bayi (`seed.mjs` ORDERS= PRODUCTS= DEALERS=). Sorgu planları büyük veride değişiyor mu? | 15 dk | ~20 dk |
| 5 | **Ağır uçlar yük altında** | Excel dışa aktarma, 12 aylık satış raporu, ekstre, PDF. Tek ağır istek bir Node sürecini kilitleyip diğer istekleri bekletiyor mu? | 30 dk | 10 dk |
| 6 | **ERP API yükü** | `/api/v1` ile on binlerce ürünün stok/fiyat güncellemesi; API anahtarı istek sınırları. | 30–45 dk | 10 dk |
| 7 | **Aşırı ani yük** | 10 sn'de 0 → 3000 kullanıcı (kampanya bildirimi anı). Bilgisayarda kapasiteyi değil toparlanmayı gösterir. | 10 dk | 5 dk |
| 8 | **Dayanıklılık** | Yük sürerken Redis'i / bir işçi süreci yeniden başlatmak, veritabanını kısa süre kesmek. Sistem kendiliğinden toparlanıyor mu? | 30 dk | 15 dk |
| 9 | **k6 tarayıcı ile sayfa açılışı** | 1000 bayi API'ye yüklenirken birkaç gerçek tarayıcıyla katalog ve ödeme sayfasının açılış süresi. | 30 dk | 10 dk |

**Önerilen sıra:** önce 1, 2, 4, 5 (en çok sorun çıkarabilecekler; düzeltmeye zaman kalsın) → gece 3 → sonra 6, 7, 8, 9.

**Dikkat:** testler sırayla koşmalı (aynı anda koşarlarsa işlemciyi paylaşıp birbirini bozar). Bilgisayarda alınan sayılar önceki ölçümle karşılaştırma içindir; "canlıda kaç bayi kaldırır" sorusu için canlıyla aynı boyutta bir sunucu (Caddy + HTTPS dahil) ve k6'nın ayrı bir makineden çalışması gerekir.

## Dikkat

- **Canlı ortama karşı** çalıştırırken düşük yoğunluklu bir saat seçin. Önce `smoke`, sonra küçük bir `PEAK` ile `load` deneyin.
- **Geliştirme ortamındaki sonuçlar** (nodemon, Docker Desktop, tek Postgres) canlıyı birebir yansıtmaz. Karşılaştırma için aynı ortamda aynı testi tekrarlayın.
- **Yazma testinden sonra** test firmasını silmek, oluşan siparişleri de temizler.
