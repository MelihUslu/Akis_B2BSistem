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

## Sonuçlar

- **Ekrandaki özet:** kontroller (✓ / ✗), istek süreleri (ortalama, %90, %95) ve hata oranı.
- **`loadtest/results/<test>-<zaman>.json`:** karşılaştırma için saklanır, git'e girmez.
- **Başarısız istekler:** durum kodu ve yanıtın başı ekrana yazılır.

**Eşikler** (`lib/config.js`; aşılırsa test başarısız olur ve komut hata koduyla biter):

- hata oranı %1'in altında, kontrollerin %99'u geçmeli;
- okuma isteklerinde %95 süre 500 ms, %99 süre 1,2 sn altında;
- sepet hesabında %95 süre 800 ms altında.

`stress` ve `spike` bilerek daha gevşek eşik kullanır; amaç kırılma noktasını görmektir.

## Dikkat

- **Canlı ortama karşı** çalıştırırken düşük yoğunluklu bir saat seçin. Önce `smoke`, sonra küçük bir `PEAK` ile `load` deneyin.
- **Geliştirme ortamındaki sonuçlar** (nodemon, Docker Desktop, tek Postgres) canlıyı birebir yansıtmaz. Karşılaştırma için aynı ortamda aynı testi tekrarlayın.
- **Yazma testinden sonra** test firmasını silmek, oluşan siparişleri de temizler.
