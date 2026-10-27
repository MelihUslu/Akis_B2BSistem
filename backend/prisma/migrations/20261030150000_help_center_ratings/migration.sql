-- AlterTable
ALTER TABLE "SupportTicket" ADD COLUMN     "ratedAt" TIMESTAMP(3),
ADD COLUMN     "rating" INTEGER,
ADD COLUMN     "ratingComment" TEXT;

-- CreateTable
CREATE TABLE "HelpArticle" (
    "id" SERIAL NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'USAGE',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "keywords" TEXT NOT NULL DEFAULT '',
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "helpfulYes" INTEGER NOT NULL DEFAULT 0,
    "helpfulNo" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HelpArticle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HelpArticle_isPublished_category_idx" ON "HelpArticle"("isPublished", "category");


-- Yardım merkezi başlangıç yazıları
INSERT INTO "HelpArticle" ("category", "title", "summary", "keywords", "body", "sortOrder", "updatedAt") VALUES
('USAGE', 'Excel ile toplu ürün, fiyat ve stok yükleme', 'Yüzlerce ürünü tek dosyayla ekleyin veya fiyat/stok güncelleyin.', 'excel, csv, toplu, içe aktar, import, yükleme, fiyat güncelleme, stok güncelleme', '1. Ürün Yönetimi sayfasında "Excel ile Toplu" düğmesine tıklayın.
2. İşlem türünü seçin: yeni ürün yükleme, fiyat güncelleme veya stok güncelleme.
3. Dosyanızın ilk satırı başlık olmalı; pencerede gösterilen sütun adlarını kullanın.
4. Dosyayı seçip "Yükle ve Uygula"ya basın. Ürünler SKU (stok kodu) ile eşleştirilir.

İpuçları
- SKU her üründe ve varyantta benzersiz olmalıdır.
- Ondalık ayırıcı olarak virgül veya nokta kullanabilirsiniz.
- "Dosya işlenemedi" hatası alırsanız dosyayı .xlsx olarak yeniden kaydedin ve boş satır olmadığından emin olun.', 0, CURRENT_TIMESTAMP),
('USAGE', 'Yeni bayi ekleme ve bayilik başvurularını onaylama', 'Bayileri elle ekleyin veya portal üzerinden gelen başvuruları onaylayın.', 'bayi, müşteri, başvuru, onay, kullanıcı ekle, giriş bilgisi', 'Elle eklemek için
1. Bayi Yönetimi → "Yeni Bayi" düğmesine tıklayın.
2. Firma unvanı, vergi bilgileri, yetkili ve e-posta adresini girin.
3. Bayi grubu, iskonto, risk limiti ve vadeyi belirleyin. Giriş bilgileri bayiye e-postayla gider.

Başvuru ile
- Bayiler giriş sayfasındaki "Bayilik başvurusu yapın" bağlantısıyla başvurur.
- Başvurular Bayi Yönetimi''nde "Başvurular" sekmesinde görünür; onayladığınızda bayi belirlediği şifreyle giriş yapar.

Bir bayiye birden fazla kullanıcı (şube, çalışan) eklemek için bayinin satırındaki "Kullanıcılar" menüsünü kullanın.', 10, CURRENT_TIMESTAMP),
('USAGE', 'Bayiye özel fiyat, iskonto ve grup indirimleri', 'Fiyatların bayiye nasıl hesaplandığını ve nasıl değiştirileceğini öğrenin.', 'iskonto, indirim, özel fiyat, grup, gold, vip, fiyat listesi, net fiyat', 'Bayinin gördüğü net fiyat şu sırayla hesaplanır:
1. Ürünün liste fiyatı (döviz ise günlük kurla TL''ye çevrilir).
2. Bayiye özel fiyat tanımlıysa doğrudan o fiyat kullanılır.
3. Yoksa bayinin net iskontosu ve ardından bayi grubunun (STANDART/GOLD/VIP) iskontosu uygulanır.
4. Sepette miktar indirimi eşiği aşılırsa ekstra indirim eklenir.

Değiştirmek için
- Grup iskontoları ve miktar indirimi: Ayarlar → Genel.
- Bayiye özel net iskonto: Bayi Yönetimi → bayiyi düzenle.
- Ürün bazında bayiye veya gruba özel fiyat: Ürün Yönetimi → ürünü düzenle → "Özel Fiyatlar" adımı.', 20, CURRENT_TIMESTAMP),
('USAGE', 'Siparişleri onaylama, kısmi onay ve kargoya verme', 'Gelen siparişleri onaylayın, stokta olmayan kalemleri iptal edin, kargoya verin.', 'sipariş, onay, kısmi, iptal, kargo, takip numarası, teslim', '1. Siparişler sayfasında "Onay bekleyen" filtresini açın ve siparişi görüntüleyin.
2. Tüm kalemleri onaylayabilir ya da stokta olmayan kalemleri iptal edip kısmi onay verebilirsiniz. Stok ve cari hesap otomatik işlenir.
3. Hazır olduğunda "Kargoya Ver" ile kargo firmasını ve takip numarasını girin. Kargo entegrasyonu açıksa gönderi kendiliğinden oluşturulur ve etiket yazdırılabilir.
4. Teslim edildiğinde sipariş "Teslim Edildi" olur; entegrasyonla bu durum otomatik güncellenir.

Bayi her adımda bildirim alır.', 30, CURRENT_TIMESTAMP),
('BILLING', 'Cari hesap, risk limiti ve vade nasıl çalışır?', 'Bayi bakiyesi, kullanılabilir limit ve vade takibi.', 'cari, bakiye, risk limiti, vade, borç, alacak, ekstre, mutabakat, tahsilat', '- Onaylanan her sipariş bayinin cari hesabına borç olarak yazılır; tahsilatlar alacak olarak düşer.
- Kullanılabilir limit = risk limiti − bakiye − onay bekleyen siparişler. Limit yetersizse bayi "Cari Hesaptan Öde" ile sipariş veremez, Havale/EFT seçebilir.
- Vadesi yaklaşan ve geçen siparişler için bayiye otomatik hatırlatma gider (Ayarlar → Genel → vade hatırlatma).
- Tahsilat ve manuel borç/alacak kayıtları: Finans & Prim sayfası.
- Bayi, Finansal Durum sayfasından ekstresini indirebilir ve dönem sonu mutabakatını onaylayabilir.', 40, CURRENT_TIMESTAMP),
('TECHNICAL', 'Sanal POS (kartla ödeme) kurulumu', 'iyzico veya PayTR hesabınızı bağlayarak bayilerinizin kartla ödeme yapmasını sağlayın.', 'sanal pos, kredi kartı, iyzico, paytr, ödeme, tahsilat, 3d secure', '1. Ayarlar → Sanal POS sekmesine gidin.
2. Sağlayıcıyı seçin (iyzico veya PayTR) ve sağlayıcı panelinden aldığınız API anahtarlarını girin.
3. Önce test modunda deneyin; başarılı bir test ödemesinden sonra canlı moda geçin.

Bayi ödemeleri anında cari hesaba işlenir ve risk limiti yeniden açılır. Ödeme sağlayıcısı panelinde bildirim (callback) adresinin doğru olduğundan emin olun; adres Sanal POS sekmesinde gösterilir.', 50, CURRENT_TIMESTAMP),
('TECHNICAL', 'E-fatura / e-arşiv entegrasyonu (Paraşüt)', 'Onaylanan siparişlerin faturasını otomatik kesin.', 'e-fatura, e-arşiv, fatura, paraşüt, gib, entegrasyon', '1. Ayarlar → E-Fatura sekmesinde sağlayıcı olarak Paraşüt''ü seçin.
2. Paraşüt hesabınızın firma numarası, istemci bilgileri ve kullanıcı bilgilerini girin; "Bağlantıyı test et" ile doğrulayın.
3. İsterseniz "Sipariş onaylanınca otomatik fatura kes" seçeneğini açın.

Fatura sipariş detayındaki Fatura bölümünden de tek tıkla kesilebilir veya kâğıt fatura numarası elle girilebilir. Bayi faturanın PDF''ini kendi sipariş sayfasından görür.', 60, CURRENT_TIMESTAMP),
('TECHNICAL', 'Kargo entegrasyonu (Yurtiçi Kargo)', 'Kargoya verirken gönderiyi otomatik oluşturun, takip durumunu otomatik güncelleyin.', 'kargo, yurtiçi, gönderi, takip, etiket, barkod, teslimat', '1. Ayarlar → Kargo sekmesinde Yurtiçi Kargo''yu seçin ve kullanıcı adı / şifrenizi girin (Yurtiçi müşteri temsilcinizden alınır).
2. "Test et" ile bağlantıyı doğrulayın.
3. Siparişi kargoya verirken gönderi otomatik oluşur; barkodlu etiketi sipariş sayfasından yazdırabilirsiniz.

Gönderi durumları düzenli aralıklarla sorgulanır; teslim edilen siparişler kendiliğinden "Teslim Edildi" olur. Bayilerin teslimat adreslerinde il ve ilçenin dolu olması gerekir.', 70, CURRENT_TIMESTAMP),
('TECHNICAL', 'Kendi alan adınızı bağlama (b2b.firmaniz.com)', 'Portalınızı kendi alan adınızla yayınlayın.', 'alan adı, domain, dns, cname, txt, ssl, özel alan adı', '1. Ayarlar → Alan Adı sekmesine alan adınızı yazın (örn. b2b.firmaniz.com) ve kaydedin.
2. Alan adı sağlayıcınızın DNS panelinde ekranda gösterilen TXT kaydını ve CNAME kaydını oluşturun.
3. "Doğrula" düğmesine tıklayın. DNS değişikliklerinin yayılması birkaç dakika ile birkaç saat sürebilir.

SSL sertifikası doğrulamadan sonra otomatik oluşturulur. Bu özellik paketinize bağlıdır; görünmüyorsa Abonelik sayfasından paketinizi yükseltin.', 80, CURRENT_TIMESTAMP),
('USAGE', 'Ekip üyesi ekleme ve yetkiler', 'Çalışanlarınıza sadece ihtiyaç duydukları ekranları açın.', 'ekip, personel, kullanıcı, yetki, rol, izin, çalışan', '1. Ayarlar → Ekip ve Yetkiler sekmesinde "Kullanıcı Ekle"ye tıklayın.
2. Ad, e-posta ve yetkileri seçin (katalog, bayiler, siparişler, finans, ayarlar).
3. Kullanıcıya davet e-postası gider.

Firma sahibi tüm ekranlara erişir. Yetkisi olmayan kullanıcı ilgili menüleri görmez ve bildirimlerini almaz. Yapılan işlemler Ayarlar → İşlem Kaydı''nda kullanıcı adıyla listelenir.', 90, CURRENT_TIMESTAMP),
('TECHNICAL', 'İki aşamalı doğrulama (2FA) ve şifre sıfırlama', 'Hesabınızı doğrulama uygulamasıyla koruyun; şifrenizi unutursanız sıfırlayın.', '2fa, iki aşamalı, doğrulama, authenticator, şifre, unuttum, kurtarma kodu, giriş', '2FA açmak için
1. Sağ üstteki adınıza tıklayarak Hesabım sayfasını açın ve İki Aşamalı Doğrulama bölümünde kurulumu başlatın.
2. QR kodu Google Authenticator veya Microsoft Authenticator ile okutun ve 6 haneli kodu girin.
3. Gösterilen kurtarma kodlarını güvenli bir yere kaydedin.

Telefonunuzu kaybettiyseniz girişte "Kurtarma kodu kullan" seçeneğini kullanın.
Şifrenizi unuttuysanız giriş sayfasındaki "Şifremi unuttum" bağlantısıyla e-postanıza sıfırlama bağlantısı isteyin. Bağlantı 1 saat geçerlidir.', 100, CURRENT_TIMESTAMP),
('FEATURE', 'ERP entegrasyonu: API anahtarı ve webhook', 'Muhasebe / ERP yazılımınızı ürün, stok ve siparişlerle senkronize edin.', 'api, erp, entegrasyon, webhook, logo, netsis, mikro, anahtar, senkronizasyon', '1. Ayarlar → Entegrasyon (ERP) sekmesinde "Anahtar Oluştur"a tıklayın. Önce "Test" anahtarıyla deneyin; test anahtarı yazma işlemlerini doğrular ama kaydetmez.
2. API dokümanı /developer adresindedir: ürün/stok/fiyat güncelleme, sipariş çekme, kargo ve fatura bilgisi gönderme.
3. Webhook ekleyerek yeni sipariş, durum değişikliği gibi olayları anında ERP''nize iletebilirsiniz. Gönderimler başarısız olursa otomatik yeniden denenir; geçmişi aynı sekmeden izlenir.

Anahtar yalnızca oluşturulduğunda gösterilir; güvenli bir yerde saklayın.', 110, CURRENT_TIMESTAMP),
('BILLING', 'Abonelik, paket değiştirme ve faturalar', 'Paketinizi yükseltin, ödeme yönteminizi ve platform faturalarınızı görün.', 'abonelik, paket, ödeme, fatura, deneme süresi, yükselt, plan, iptal', '- Abonelik sayfasında mevcut paketiniz, kullanım limitleriniz ve bir sonraki ödeme tarihi görünür.
- Paket yükseltme ödeme alındığında hemen geçerli olur.
- Platform faturalarınız aynı sayfadaki ödeme geçmişinde listelenir.
- Deneme süresi bitene kadar ödeme yapılmazsa bayi portalına erişim durur, yönetici yalnızca Abonelik sayfasını görür. Verileriniz silinmez; ödeme yapınca her şey kaldığı yerden devam eder.', 120, CURRENT_TIMESTAMP),
('OTHER', 'Verilerimi dışa aktarma ve hesabı kapatma (KVKK)', 'Tüm verilerinizi indirin veya hesabınızı kapatın.', 'kvkk, veri, dışa aktar, yedek, hesap kapatma, silme, gdpr', '- Ayarlar → Veri & Hesap sekmesinden tüm verilerinizi (ürünler, bayiler, siparişler, cari hareketler) tek dosya olarak indirebilirsiniz.
- Hesabı kapatma talebinden sonra yasal saklama süresi boyunca veriler korunur, ardından kalıcı olarak silinir.', 130, CURRENT_TIMESTAMP);
