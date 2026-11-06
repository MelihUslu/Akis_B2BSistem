# 5. Teklif, satış ve pazarlama

İki tarafı var: firmanın bayilerine satış yapmasını kolaylaştıran araçlar (teklif, plasiyer, bayi adına sipariş, müşteri adayları, WhatsApp) ve platformun kendisini firmalara satan tanıtım sitesi.

## Teklifler

Teklif talebi (RFQ) SaaS dönüşümüyle geldi (`b0613c5`); 27 Ekim'de "akıllı teklif" modülüne dönüştü (`94e13d4`).

- **Yapay zekâ ile taslak:** müşterinin yazdığı talep kalemlere ayrılır, katalogda aday ürün aranır, seçim yalnızca adaylardan yapılır. Sonuç backend'de doğrulanır; fiyat, KDV ve toplam mevcut fiyat motoruyla hesaplanır. Sağlayıcı ayarla seçilir (`AI_PROVIDER`, `AI_API_KEY`); anahtar yoksa teklif elle hazırlanır.
- Özel varyantlar, kayıtlı paket dönüşümü (1 Koli = N Adet), uyumlu ürün ilişkisi.
- **Yetki ve onay:** iskonto / elle fiyat yetkisi; sınırı aşan ya da maliyetin altındaki teklif yönetici onayına düşer.
- **Sürümler:** gönderilen sürümün değişmez kopyası, revizyonlar; eski sürümle kabul engellenir.
- PDF, iptal edilebilir müşteri bağlantısı, e-posta, siparişe dönüştürme (çift sipariş kilidiyle).
- Stokta olmayan ürüne ve Hızlı Sipariş'ten teklif isteme (bkz. [3. bölüm](03-siparis-katalog-lojistik.md)). Gel-Al ya da adrese teslim tercihi teklif talebine de taşınır.

## Plasiyer (saha satış) paneli (`a8e2226`)

- Plasiyer kendi hesabıyla girer ve `/plasiyer` paneline düşer.
- Yalnızca sorumlu olduğu bayileri görür: bakiye, limit, vadesi geçen tutar, son sipariş; ayrıca kendi primleri.
- Bayi seçip onun adına sipariş verir.

## Bayi adına sipariş (`a8e2226`)

Telefonla ya da WhatsApp'tan gelen sipariş için:

- Yönetici (sipariş yetkili) ya da plasiyer (yalnızca kendi bayileri) bir bayi seçer ve portalı o bayinin fiyatı, limiti ve adresleriyle kullanır. Ekranın üstünde "… adına işlem yapıyorsunuz" şeridi görünür.
- Seçim `X-Act-As-Company` başlığıyla taşınır ve tarayıcı sekmesine özeldir. Başlık yalnızca katalog, sipariş, teklif, adres ve listeler uçlarında geçerlidir; iade, profil ve yönetim uçları bu modda açılmaz.
- Sipariş girenin adıyla kaydedilir (kanal: yönetici ya da plasiyer), bayiye bildirim gider.
- Moddan çıkınca kullanıcı kendi paneline döner.

## Müşteri adayları (`3abe067`, `95838b9`)

- Firma panelinde "Müşteri Adayları": durum sekmeleri, arama, kanal / kampanya / tarih filtresi, satırdan durum değiştirme, WhatsApp ve arama düğmeleri, Excel'e aktarma.
- Instagram DM'lerinden gelenler için elle ekleme; aynı numara uyarısı.
- **`/talep` formu:** kanal (`?k=`) ve kampanya (`?kampanya=`, utm) bilgisiyle kayıt, KVKK onayı; 24 saat içinde aynı numaradan gelen talepler tek kayıtta birleşir; yeni talepte bildirim.
- **Form düzenleyici:** başlık, açıklama, düğme ve teşekkür yazısı; hazır alanları gösterme / gizleme / zorunlu yapma / sıralama; en fazla 12 ek soru (kısa metin, uzun metin, sayı, seçenek). Canlı önizleme; yanıtlar listede ve Excel'de ayrı sütundur.

## WhatsApp (`321bb9a`)

- Firma WhatsApp Business (Meta Cloud API) numarasını bağlar; anahtarlar şifreli saklanır, firmaya özel webhook adresi üretilir. Meta istekleri imzayla doğrulanır.
- **Yapay zekâ ile otomatik cevap:** firma bilgileri ve katalogdaki ilgili ürünlerle (liste fiyatı, stok durumu) cevap verir; art arda gelen mesajlar tek cevapta toplanır; fiyat gizliyse fiyat paylaşmaz.
- Emin olmadığında, müşteri insan / indirim istediğinde, şikâyette ya da hata olursa konuşma ekibe devredilir ve bildirim gider.
- **Gelen kutusu:** konuşma listesi ve filtreler, mesaj durumları, devral / yapay zekâya bırak / kapat, ekip yanıtı, 24 saat kuralı. Yazan kişi müşteri adaylarına otomatik eklenir.

## Toplu SMS (6 Kasım)

Müşteriler → **Toplu SMS** ("Toplu SMS" yetkisi; firmada SMS açık ve Netgsm bağlıyken gönderir).

- **Alıcılar:** bayiler, bayi olmayan müşteri carileri ve müşteri adayları; seçim sekmeler arasında korunur. Süzgeçler: ad, etiket, bayi grubu, plasiyer, borcu olanlar, 30 / 60 / 90 gündür sipariş vermeyenler; adaylarda durum, kaynak, şehir.
- **Numaralar** sunucuda kayıtlardan çözülür (yalnızca cep telefonu): önce bayi kullanıcıları (ana kullanıcı önce), sonra cari yetkili kişileri, sonra carinin telefonu. Firma başına bir numara ya da bütün numaraları; aynı numaraya bir kez.
- **Mesaj:** `{ad}`, `{yetkili}`, `{bakiye}` ile kişiselleştirme, önizleme, karakter / SMS boyu / toplam SMS tahmini, göndermeden önce onay. En fazla 900 karakter, tek gönderimde 5.000 numara.
- **Tür:** *Bilgilendirme* (bayram tatili, teslimat günü…) İYS süzgeci olmadan gider. *Ticari (İYS)* (kampanya, indirim, yeni ürün) Netgsm'in İYS süzgeciyle gider (cariler tacir `12`, adaylar bireysel `11`; değerler Netgsm belgelerinden, canlıda Netgsm'den teyit edilmeli) ve sonuna firmanın ret metni eklenir (Ayarlar → SMS; yoksa ticari gönderilemez).
- **Geçmiş:** her gönderim alıcılarıyla kaydedilir (kim, ne zaman, hangi metin, kaçı gönderildi, hata); Netgsm'e 500'lük partilerle gider, başarısız parti diğerlerini durdurmaz. İşlem kaydında "Toplu SMS gönderildi" olarak görünür.

## Tanıtım sitesi (platformun satış sitesi)

- **Yeniden tasarım** (`d5327df`, `0da0fd2`): pastel giriş bölümü, HTML ile çizilmiş bayi portalı, sekmeli özellikler, 4 adımlı kurulum, aylık / yıllık paketler, kayıt formu, SSS. Önce / sonra karşılaştırması, canlı olay akışı, rol bazlı faydalar, 6 başlıkta tam özellik listesi, kazanç hesaplayıcı, e-ticaret altyapısıyla karşılaştırma, telefonda sabit "ücretsiz dene" çubuğu. Yalnızca ürünün gerçekten yaptıkları yazıldı.
- **Canlı sohbet botu** (`bf1e966`, `f6e1cfb`): ziyaretçinin sorularını yanıtlar, sektör ve bayi sayısını sorup paket önerir, ad ve telefon ister; "Beni arayın" formu. Talep özetiyle satış ekibine iletilir; temsilci sohbeti platform panelinden devralabilir.
- Satış talepleri ve reklam kaynağı (UTM) kaydı; KVKK, gizlilik, kullanım koşulları ve çerez politikası sayfaları; çerez onayıyla Meta / Google ölçümü; paylaşım önizlemesi (og) etiketleri.

## Commit'ler

| Commit | Tarih | Açıklama |
|---|---|---|
| `94e13d4` | 27 Ekim | Akıllı teklif modülü |
| `d5327df`, `0da0fd2` | 28 Ekim | Tanıtım sayfası |
| `bf1e966`, `f6e1cfb` | 29 Ekim | Sohbet botu, satış talepleri, yasal sayfalar |
| `3abe067`, `95838b9` | 2 Kasım | Müşteri adayları, talep formu düzenleyici |
| `321bb9a` | 2 Kasım | WhatsApp entegrasyonu |
| `a8e2226` | 4 Kasım | Plasiyer paneli, bayi adına sipariş |
