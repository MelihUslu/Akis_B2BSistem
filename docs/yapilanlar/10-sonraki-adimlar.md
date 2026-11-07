# 10. Açık konular ve sonraki adımlar

4 Kasım 2026 itibarıyla bilerek sonraya bırakılanlar, canlıya çıkmadan önce elle denenmesi gerekenler ve bilinen sınırlar.

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
- [ ] **SMS (Netgsm):** firmanın gerçek hesabıyla Ayarlar → SMS → Bağlantıyı test et ve deneme SMS'i; ardından bir siparişi onaylayıp bayinin telefonuna SMS geldiğini görün. Netgsm'de API kullanıcısının IP kısıtı varsa sunucunun IP'si eklenmeli. İYS hatası (kod 50 / 51) gelirse Netgsm'e bilgilendirme amaçlı gönderimin nasıl işaretleneceği sorulmalı. Toplu SMS'te ticari gönderim için İYS süzgeç değerleri (tacir `12`, bireysel `11`) ve ret metni Netgsm'den teyit edilmeli; firmanın İYS marka kaydı olmalı.
- [ ] **Toplu e-posta:** canlı SMTP ile Müşteriler → Toplu E-posta → "Kendime deneme": gelen kutusuna (spam'e değil) düşüyor mu, gönderen adı firmanın adı mı, "Yanıtla" firmanın adresine mi gidiyor? Ardından iki üç kendi adresinize gerçek gönderim; e-postadaki "abonelikten çık" bağlantısı ve Gmail'deki "Aboneliği iptal et" düğmesi çalışıyor mu? Gmail / Yahoo günde 5.000'den fazla gönderen alan adından SPF, DKIM, DMARC ve tek tıkla çıkma ister; gönderim alan adında üçü de tanımlı olmalı.
- [ ] **Kartla taksit:** iyzico / PayTR panelinde taksit ve vade farkı ayarını yapıp test kartıyla 3 taksitli bir cari ödeme; cariye net tutarın, ödeme kaydına taksit sayısı ve karttan çekilen toplamın yazıldığını görün. PayTR'de mağaza için taksit açık olmalı.
- [ ] **XML ürün beslemesi:** bir bayinin e-ticaret altyapısında (ikas, Ticimax, T-Soft, IdeaSoft…) adresi XML kaynağı olarak tanımlayıp alanları eşleştirin; altyapının beklediği alan adları farklıysa eşleştirme ekranından ya da istek üzerine ikinci bir biçim eklenerek çözülür.
- [ ] **Gerçek iPhone'da bir tur:** kabul testleri Safari motorunda ve iPhone taklidinde geçiyor; ekran klavyesi, alt güvenli alan ve ana ekrana eklenen uygulama yalnızca gerçek cihazda görülür (katalog, sepet, sipariş, ekstre).

## Bilinen sınırlar

- **e-İrsaliye entegre değil.** İrsaliye numarası elle ya da ERP'den girilir, fiyatsız irsaliye yazdırılır. GİB'e elektronik irsaliye gönderilmez; e-İrsaliye mükellefi firmalar irsaliyeyi ERP / muhasebe programından düzenler.
- **Barkod okutma** https ister; tarayıcı kamera izni sorar.
- **Yük testi sayıları** geliştirme bilgisayarında alındı; canlı kapasiteyi göstermez.
- **Tüm veri dışa aktarımı** çok büyük firmada uzun sürer (600 bin sipariş: boşta 49 sn, yoğunlukta 3 dakikadan fazla); tarayıcı sonuna kadar bekler. Bu boyutta firmalar için arka planda hazırlayıp e-postayla bağlantı göndermek daha uygun olur.
- **iPhone'da anlık bildirim** yalnızca ana ekrana eklenen uygulamada çalışır (iOS 16.4+).
- **Toplu e-posta** platformun SMTP hesabından gider: firma başına günde 2.000 adres, her gönderim dakikada en fazla 120 e-posta (ortam değişkeniyle değişir; aynı anda süren gönderimler toplanır). SMTP sağlayıcısının kendi sınırı daha düşükse (ör. Google Workspace kullanıcısı günde 2.000, ücretsiz Gmail 500; bütün firmaların gönderimi toplamda) çok firmalı kullanımda toplu e-posta için Amazon SES, Brevo, Postmark gibi bir gönderim servisi gerekir. Açılma / tıklanma takibi ve geri dönen (bounce) adreslerin otomatik ayıklanması yok; SMTP'nin anında reddettiği adres gönderim geçmişinde hatalı görünür.
- **Ticari e-posta için izin:** ticari ileti onayı (6563 sayılı Kanun, İYS) firmanın sorumluluğundadır; sistem bayi / müşterinin onay verip vermediğini bilmez. Tacir ve esnafa (bayilerin ve carilerin çoğu) giden ticari iletide önceden onay gerekmez ama ret hakkı tanınmalıdır; bireylere (müşteri adaylarının çoğu) önceden onay gerekir. Her iletide çıkma bağlantısı bulunur.
- **Çek / senet:** vadesi yaklaşan çek için bildirim yok (portföy ekranında vadesi geçmiş ve 7 gün içindekiler toplanır). Firmanın kendi verdiği çek (borç çeki) ve kısmi tahsil izlenmez; çek tahsil edilince banka / kasa hareketi açılmaz.
- **Saha ziyareti:** rota planlama ve harita görünümü yok (konum harita bağlantısıyla açılır); konum telefon izin verirse alınır, doğrulanmaz.
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

## 6 Kasım'daki davranış değişiklikleri

- **Okunmamış bildirimler** 180 gün sonra silinir (okunmuşlar 90 gün; vade hatırlatması gibi tekrar engelleyen kayıtlar silinmez).
- **Yeni yetkiler:** "Toplu SMS" ve "Toplu e-posta". Firma sahibi otomatik görür; diğer yöneticilere Ayarlar → Ekip ve Yetkiler'den verilmelidir (mevcut yöneticilere kendiliğinden verilmez).

## 7 Kasım'daki davranış değişiklikleri

- **Çek / senet tahsilatları** portföye "Portföyde" olarak eklendi; gerçek durumları Finans → Çek / Senet'ten işaretlenmeli.
- **Yeni menüler:** Finans → Çek / Senet (Finans yetkisi), Müşteriler → Saha Ziyaretleri (Bayiler yetkisi); bayide Siparişlerim → Onay talepleri (talep varsa).
- **Sipariş onayı:** bayi çalışanına onay kuralı konunca o çalışanın siparişleri firmaya gelmeden önce bayinin ana kullanıcısına gider.

## Canlıya alırken

- Veritabanı migration'ları: `npx prisma migrate deploy` (son migration'lar 7 Kasım: `20261203120000_taksit` firmaya taksit ayarı ve ödemeye taksit / çekilen toplam, `20261204120000_xml_besleme` bayiye besleme anahtarı, `20261205120000_bayi_siparis_onayi` kullanıcıya onay kuralı ve onay talepleri tablosu, `20261206120000_cek_senet_portfoyu` portföy tablosu ve mevcut çek / senet tahsilatlarının portföye eklenmesi (yalnızca ekleme), `20261207120000_saha_ziyareti` ziyaret tablosu; ondan önceki `20261202120000_toplu_eposta` toplu e-posta gönderim, alıcı ve abonelikten çıkanlar tablolarını, ondan önceki `20261201120000_toplu_sms` toplu SMS gönderim ve alıcı tablolarını, ondan önceki `20261130120000_sms_bildirim` firmaya SMS ayarları, kullanıcıya cep telefonu ve SMS tercihleri ekler; üçü de veri değiştirmez). `20261126120000_b2b_eksikleri` tekliften gelen mevcut siparişlere kanal, kargoya verilmiş siparişlerin kalemlerine gönderilen miktar yazar. `20261129120000_buyuk_veri_indeksleri` `pg_trgm` eklentisini kurar (PostgreSQL 13+'ta veritabanı sahibi kurabilir) ve ürün / sipariş tablolarına indeks ekler; büyük tabloda birkaç saniye yazma bekletebilir.
- Frontend bağımlılıkları: `npm ci` (yeni paket `@zxing/browser`).
- `ENCRYPTION_KEY` bir kez belirlenir, sonra değiştirilmez; değişirse firmaların kayıtlı anahtarları çözülemez.
- Google ile giriş için `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (yönlendirme adresi: `https://api.akisb2b.com/api/public/google/callback`).
- Push için `VAPID_*` anahtarları; uyarılar için `PLATFORM_ALERT_EMAIL` ve SMTP. Toplu e-posta sınırları `BULK_MAIL_DAILY_LIMIT` (firma başına günlük adres, varsayılan 2000) ve `BULK_MAIL_PER_MINUTE` (gönderim başına, varsayılan 120); SMTP sağlayıcısının sınırına göre ayarlayın. Abonelikten çıkma bağlantısı `API_PUBLIC_URL`'e gider.
- **Google Drive yedeği:** `scripts/drive-setup.sh` ile bir kez kurun, gösterilen yedek şifresini parola yöneticisine kaydedin; ilk hafta Drive'daki bir yedeği ayrı veritabanına geri yükleyip deneyin ([6. bölüm](../canliya-cikis.md)).
- Adım adım: [`docs/canliya-cikis.md`](../canliya-cikis.md).

## Depo durumu

- SaaS dönemine ait 66 commit `feature/saas-platform` dalındadır; `main` dalında yalnızca Mayıs sürümü var.
- Dal 5 Kasım'da uzak depoya gönderildi. `main`'e birleştirme ayrıca kararlaştırılacak.
- `.env`, `uploads/support`, `uploads/private` ve `backups` depoya girmez.
