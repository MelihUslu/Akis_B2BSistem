# 10. Açık konular ve sonraki adımlar

4 Kasım 2026 itibarıyla bilerek sonraya bırakılanlar, canlıya çıkmadan önce elle denenmesi gerekenler ve bilinen sınırlar.

## Yük testlerinden kalan iyileştirmeler

4 Kasım'da planlanan dokuz ileri testin hepsi 5 Kasım'da yapıldı (bkz. [9. bölüm](09-testler-kalite.md)). Bulunan sorunlar düzeltildi; aşağıdakiler hata değil, ileride yapılabilecek iyileştirmeler:

- **Sayfa açılışında sıralı bekleme:** ön yüz firma bilgisini (`/api/tenant/public`) almadan hiçbir sayfayı çizmiyor; bayi sayfasının kodu ve katalog istekleri ancak ondan sonra başlıyor. Yoğunlukta bu tek istek 0,5–0,9 sn sürebiliyor ve açılışa olduğu gibi ekleniyor. Firma bilgisi tarayıcıda saklanıp sayfa onunla hemen çizilebilir, yenisi arka planda alınır.
- **`/api/auth/me` sayfa başına üç kez:** oturum tazeleme, destek menüsü ve katalog aynı isteği ayrı ayrı atıyor. Tek istekte paylaşılabilir (bayi adına işlem yapılırken yanıt değiştiği için o da hesaba katılmalı).
- **Okunmamış bildirimler hiç silinmiyor:** okunanlar 90 gün sonra siliniyor; bildirimlerine bakmayan bir personelin satırları birikir. Örneğin bir yıldan eski okunmamışlar da silinebilir.

## Canlıdan önce elle denenecekler

Dış servise ya da fiziksel çıktıya bağlı oldukları için otomatik testlerde yoklar ([`uat/README.md`](../../uat/README.md)):

- [ ] **E-posta:** sipariş, onay, şifre sıfırlama ve bayi açılış e-postaları geliyor mu, bağlantılar doğru adrese gidiyor mu?
- [ ] **Online ödeme (iyzico):** bayinin kartla cari ödemesi ve firmanın abonelik ödemesi, sandbox kartıyla.
- [ ] **Paraşüt:** gerçek bir Paraşüt hesabıyla (tercihen test şirketi) bir e-arşiv ve bir e-fatura.
- [ ] **Yurtiçi Kargo ve WhatsApp:** firmanın kendi test hesabıyla.
- [ ] **Anlık bildirim (PWA):** ana ekrana eklenmiş uygulamada bildirim geliyor mu?
- [ ] **Yazdırma:** sipariş, irsaliye, teklif PDF'i, makbuz, ekstre, kargo etiketi.
- [ ] **İngilizce portal:** bayi dili EN iken ekranlar ve e-postalar.
- [ ] **Özel alan adı:** firmanın kendi alan adıyla açılış (DNS gerekir).
- [ ] **Google ile giriş:** Google Cloud'da OAuth istemcisi ve yönlendirme adresi tanımlandıktan sonra gerçek Google hesabıyla, firma girişinde ve `/giris`'te.
- [ ] **Personel yönetimi:** gerçek verilerle bir ay: izin ve masraf talepleri, ödeme ve Gelir-Gider, ay sonunda hedef kapanışı ve prim ödemesi. Kullanmadan önce İzin ayarlarına o yılın dini bayramlarını ekleyin ve personel kartlarına işe giriş tarihi / devir bakiyesi girin.
- [ ] **Barkod okutma:** gerçek telefon kamerasıyla, https adresinde.
- [ ] **Gerçek iPhone'da bir tur:** kabul testleri Safari motorunda ve iPhone taklidinde geçiyor; ekran klavyesi, alt güvenli alan ve ana ekrana eklenen uygulama yalnızca gerçek cihazda görülür (katalog, sepet, sipariş, ekstre).

## Bilinen sınırlar

- **e-İrsaliye entegre değil.** İrsaliye numarası elle ya da ERP'den girilir, fiyatsız irsaliye yazdırılır. GİB'e elektronik irsaliye gönderilmez; e-İrsaliye mükellefi firmalar irsaliyeyi ERP / muhasebe programından düzenler.
- **Barkod okutma** https ister; tarayıcı kamera izni sorar.
- **Yük testi sayıları** geliştirme bilgisayarında alındı; canlı kapasiteyi göstermez.
- **Tüm veri dışa aktarımı** çok büyük firmada uzun sürer (600 bin sipariş: boşta 49 sn, yoğunlukta 3 dakikadan fazla); tarayıcı sonuna kadar bekler. Bu boyutta firmalar için arka planda hazırlayıp e-postayla bağlantı göndermek daha uygun olur.
- **iPhone'da anlık bildirim** yalnızca ana ekrana eklenen uygulamada çalışır (iOS 16.4+).
- **Personel yönetimi:** dini bayram tarihleri firma tarafından eklenir; yaşa bağlı izin kuralı ve iki aşamalı onay yok; ayrıntı [11. bölüm](11-personel-yonetimi.md).

## 4 Kasım'daki davranış değişiklikleri

Kullanıcıların fark edeceği değişiklikler, duyurulmalı:

- **Stoktan fazla sipariş verilemez.** Bekleyen siparişler stoktan ayrılmış sayılır. Stokta olmayan mal teklif talebiyle istenir.
- **Tamamen iptal edilen siparişin kuponu** yeniden kullanılabilir.
- **Sepet kullanıcıya özel:** çıkışta tarayıcıdan silinir; bayinin sepeti sunucuda saklanır.
- **Plasiyer girişi:** plasiyerler artık kendi hesabıyla girer ve plasiyer paneline düşer.

## 5 Kasım'daki davranış değişiklikleri

- **Satış raporu ekranı** ürün, bayi ve satılmayan listelerinde ilk 200 satırı gösterir; tamamı Excel'dedir.
- **Ağır işlerde sınır:** firma başına aynı anda en fazla 2 Excel / rapor dışa aktarımı; tüm veri dışa aktarımı bütün sistemde tek. Dolu ise "biri bitince tekrar deneyin" mesajı çıkar.
- **Marka filtresi** alfabetik sıralı gelir.
- **Sistem çok yoğunken** istekler beklemek yerine "sistem şu an çok yoğun" (503) yanıtı alır; ekranlar okuma isteklerini birkaç saniye sonra kendiliğinden yeniden dener. Veritabanına kısa süre ulaşılamazsa da aynı yanıt döner.
- **ERP API istek sınırı** artık API anahtarı başına, bütün uçlar toplamında dakikada 600 (önce IP ve uç başınaydı). Dakikada 600'den fazla istek atan bir entegrasyon varsa partileri büyütmeli (tek istekte 1.000 kayıt).

## Canlıya alırken

- Veritabanı migration'ları: `npx prisma migrate deploy` (son migration `20261129120000_buyuk_veri_indeksleri`). `20261126120000_b2b_eksikleri` tekliften gelen mevcut siparişlere kanal, kargoya verilmiş siparişlerin kalemlerine gönderilen miktar yazar. Son migration `pg_trgm` eklentisini kurar (PostgreSQL 13+'ta veritabanı sahibi kurabilir) ve ürün / sipariş tablolarına indeks ekler; büyük tabloda birkaç saniye yazma bekletebilir.
- Frontend bağımlılıkları: `npm ci` (yeni paket `@zxing/browser`).
- `ENCRYPTION_KEY` bir kez belirlenir, sonra değiştirilmez; değişirse firmaların kayıtlı anahtarları çözülemez.
- Google ile giriş için `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (yönlendirme adresi: `https://api.akisb2b.com/api/public/google/callback`).
- Push için `VAPID_*` anahtarları; uyarılar için `PLATFORM_ALERT_EMAIL` ve SMTP.
- **Google Drive yedeği:** `scripts/drive-setup.sh` ile bir kez kurun, gösterilen yedek şifresini parola yöneticisine kaydedin; ilk hafta Drive'daki bir yedeği ayrı veritabanına geri yükleyip deneyin ([6. bölüm](../canliya-cikis.md)).
- Adım adım: [`docs/canliya-cikis.md`](../canliya-cikis.md).

## Depo durumu

- SaaS dönemine ait 66 commit `feature/saas-platform` dalındadır; `main` dalında yalnızca Mayıs sürümü var.
- Dal 5 Kasım'da uzak depoya gönderildi. `main`'e birleştirme ayrıca kararlaştırılacak.
- `.env`, `uploads/support`, `uploads/private` ve `backups` depoya girmez.
