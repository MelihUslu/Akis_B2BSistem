// Yasal metin TASLAKLARI. Yayına almadan önce bir hukukçuya kontrol ettirin.
// Platform → Site ve Chatbot → Yasal metinler bölümüne metin girilirse taslak yerine o gösterilir.
// Her metin: [başlık, [paragraf | [madde listesi]]] bölümlerinden oluşur.

const who = (c) => c.legalName || c.brand || 'Şirketimiz';
const contact = (c) => [c.address && `adres: ${c.address}`, c.email && `e-posta: ${c.email}`, c.kepAddress && `KEP: ${c.kepAddress}`].filter(Boolean).join(', ') || 'sitemizdeki iletişim bilgileri';

export const LEGAL_PAGES = {
  kvkk: {
    path: '/kvkk',
    title: 'KVKK Aydınlatma Metni',
    build: (c) => [
      ['Veri sorumlusu', [`6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") kapsamında veri sorumlusu ${who(c)}${c.mersis ? ` (MERSİS: ${c.mersis})` : ''}'dir. Bu metin, internet sitemiz, canlı sohbet, demo talep formu ve deneme hesabı kaydı sırasında işlenen kişisel verileriniz hakkında sizi bilgilendirmek için hazırlanmıştır.`]],
      ['İşlenen kişisel veriler', [[
        'Kimlik ve iletişim: ad soyad, firma adı, telefon, e-posta.',
        'Müşteri işlem: demo talebi ve sohbet mesajlarınızın içeriği, seçtiğiniz paket.',
        'İşlem güvenliği: IP adresi, tarayıcı bilgisi, işlem kayıtları.',
        'Pazarlama: siteye hangi reklam veya bağlantıdan geldiğiniz (kampanya parametreleri), çerez onayınıza bağlı ölçüm verileri.'
      ]]],
      ['İşleme amaçları ve hukuki sebepler', [[
        'Talebinize dönüş yapılması, teklif ve tanıtım sunulması: bir sözleşmenin kurulmasıyla doğrudan ilgili olması (KVKK m.5/2-c).',
        'Deneme hesabının açılması ve hizmetin sunulması: sözleşmenin ifası (m.5/2-c).',
        'Bilgi güvenliği, kötüye kullanımın önlenmesi: hukuki yükümlülük ve meşru menfaat (m.5/2-ç, m.5/2-f).',
        'Reklam etkinliğinin ölçülmesi: açık rızanız (çerez onayı) (m.5/1).'
      ]]],
      ['Aktarım', [
        'Verileriniz, hizmetin sunulması için çalıştığımız barındırma (sunucu), e-posta gönderimi ve ödeme hizmeti sağlayıcılarına, yalnızca gerekli olduğu ölçüde aktarılabilir. Yetkili kamu kurumlarına hukuki zorunluluk halinde aktarım yapılabilir.',
        'Canlı sohbette yanıtlar yapay zekâ hizmeti kullanılarak üretilebilir; bu durumda sohbet mesajlarınız yurt dışında bulunan yapay zekâ hizmet sağlayıcısının sunucularında işlenir (KVKK m.9). Sohbette kişisel veri paylaşmak zorunda değilsiniz; iletişim bilgilerinizi demo formu üzerinden de iletebilirsiniz.'
      ]],
      ['Toplama yöntemi', ['Verileriniz internet sitemizdeki formlar, canlı sohbet ve çerezler aracılığıyla elektronik ortamda toplanır.']],
      ['Saklama süresi', ['Talep ve sohbet kayıtları, ilgili mevzuatta öngörülen ya da işleme amacının gerektirdiği süre boyunca saklanır, süre sonunda silinir, yok edilir veya anonim hale getirilir.']],
      ['Haklarınız (KVKK m.11)', [[
        'Kişisel verilerinizin işlenip işlenmediğini öğrenme ve bilgi talep etme,',
        'İşleme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme,',
        'Aktarıldığı üçüncü kişileri bilme, eksik veya yanlış işlenmişse düzeltilmesini isteme,',
        'Silinmesini veya yok edilmesini isteme ve bu işlemlerin aktarılan kişilere bildirilmesini isteme,',
        'Otomatik sistemlerle analiz sonucu aleyhinize bir sonuca itiraz etme, zarara uğramanız halinde giderilmesini talep etme.'
      ], `Başvurularınızı ${contact(c)} üzerinden iletebilirsiniz. Başvurunuz en geç 30 gün içinde sonuçlandırılır.`]]
    ]
  },
  privacy: {
    path: '/gizlilik',
    title: 'Gizlilik Politikası',
    build: (c) => [
      ['Genel', [`Bu politika, ${who(c)} tarafından işletilen internet sitesi ve B2B portal hizmetinde kişisel verilerin nasıl korunduğunu açıklar. Kişisel verilerin işlenmesine ilişkin ayrıntılar KVKK Aydınlatma Metni'nde yer alır.`]],
      ['Portal verileri', ['Hizmeti kullanan firmaların portala yüklediği ürün, bayi, sipariş ve cari verileri ilgili firmaya aittir. Bu verilerin veri sorumlusu ilgili firmadır; biz bu verileri yalnızca hizmeti sunmak amacıyla, firmanın talimatları doğrultusunda veri işleyen sıfatıyla işleriz.']],
      ['Güvenlik', [[
        'Her firmanın verisi mantıksal olarak ayrılmıştır; bir firma diğerinin verisine erişemez.',
        'Bağlantılar şifrelidir (HTTPS); hassas entegrasyon anahtarları şifreli saklanır.',
        'Veritabanı her gün yedeklenir; erişimler ve önemli işlemler kayıt altına alınır.',
        'Yönetici hesaplarında iki aşamalı doğrulama kullanılabilir.'
      ]]],
      ['Hesabın kapatılması', ['Firma hesabını kapattığında, yasal saklama yükümlülükleri dışında kalan veriler bekleme süresinin sonunda kalıcı olarak silinir. Firma, kapatmadan önce verilerini dışa aktarabilir.']],
      ['İletişim', [`Gizlilikle ilgili sorularınız için: ${contact(c)}.`]]
    ]
  },
  terms: {
    path: '/kullanim-kosullari',
    title: 'Kullanım Koşulları',
    build: (c) => [
      ['Taraflar ve konu', [`Bu koşullar, ${who(c)} ("Hizmet Sağlayıcı") tarafından sunulan bulut tabanlı B2B sipariş portalı hizmetinin ("Hizmet") kullanımına ilişkindir. Hesap oluşturan firma ("Müşteri") bu koşulları kabul etmiş sayılır.`]],
      ['Deneme ve abonelik', [[
        'Deneme süresince tüm özellikler ücretsizdir; deneme sonunda paket seçilmezse bayi erişimi durdurulur, veriler saklanır.',
        'Ücretler seçilen pakete göre aylık veya yıllık olarak peşin tahsil edilir; fiyatlara KDV dahil değildir.',
        'Paket limitlerinin (bayi, ürün, yönetici sayısı) aşılması için üst pakete geçilmesi gerekir.'
      ]]],
      ['Müşterinin yükümlülükleri', [[
        'Hesap bilgilerinin gizliliğinden ve ekip üyelerinin yetkilerinden Müşteri sorumludur.',
        'Portala yüklenen içerik ve verilerin hukuka uygunluğundan, bayilerine karşı yükümlülüklerinden Müşteri sorumludur.',
        'Hizmet; yasa dışı amaçlarla, başkalarının haklarını ihlal edecek veya sistemin işleyişini bozacak şekilde kullanılamaz.'
      ]]],
      ['Hizmet seviyesi ve sorumluluk', ['Hizmet Sağlayıcı, hizmetin kesintisiz ve hatasız çalışması için makul özeni gösterir; planlı bakımlar önceden duyurulur. Hizmet Sağlayıcının sorumluluğu, doğrudan zararlarla ve son 12 ayda ödenen hizmet bedeliyle sınırlıdır; dolaylı zarar ve kâr kaybından sorumlu değildir.']],
      ['Fesih', ['Müşteri aboneliğini dilediği zaman sonlandırabilir; ödenmiş dönem sonuna kadar hizmet devam eder. Koşulların ağır ihlali halinde Hizmet Sağlayıcı hesabı askıya alabilir.']],
      ['Uyuşmazlıklar', [`Bu koşullara Türkiye Cumhuriyeti hukuku uygulanır. ${c.address ? 'Hizmet Sağlayıcının merkezinin bulunduğu yer' : 'İlgili'} mahkemeleri ve icra daireleri yetkilidir.`]]
    ]
  },
  cookies: {
    path: '/cerez-politikasi',
    title: 'Çerez Politikası',
    build: () => [
      ['Çerez nedir?', ['Çerezler, ziyaret ettiğiniz sitenin tarayıcınıza kaydettiği küçük metin dosyalarıdır.']],
      ['Kullandığımız çerezler', [[
        'Zorunlu: oturumun sürdürülmesi, canlı sohbetin hatırlanması, çerez tercihinizin saklanması. Bunlar onay gerektirmez.',
        'Ölçüm ve reklam (onayınıza bağlı): reklamlarımızın etkinliğini ölçmek için Meta (Facebook) ve Google ölçüm araçları. Yalnızca "Kabul et" seçerseniz yüklenir.'
      ]]],
      ['Tercihinizi değiştirme', ['Tarayıcınızın ayarlarından çerezleri silebilir veya engelleyebilirsiniz. Çerez tercihinizi sıfırlamak için tarayıcınızda bu sitenin verilerini temizlemeniz yeterlidir; bir sonraki ziyaretinizde tercih yeniden sorulur.']]
    ]
  }
};
