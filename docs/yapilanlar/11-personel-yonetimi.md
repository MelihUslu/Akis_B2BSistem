# 11. Personel yönetimi (4 Kasım 2026)

Firmanın kendi çalışanları için modül: personel kartları, izin, masraf ve avans, aylık satış hedefi ve prim, şirket duyuruları. Firma bazında açılıp kapanır. Bordro, SGK hesabı ve ayrıntılı özlük dosyası kapsamda değildir.

## Mevcut yapılarla ilişkisi

Modül yeni bir kullanıcı ya da rol sistemi kurmaz, var olanları kullanır:

| Mevcut yapı | Modülde nasıl kullanıldı |
|---|---|
| Kullanıcılar ve ekip yetkileri | Personel kartı firmanın yönetici ya da plasiyer hesabına bağlanır. Yeni yetki: **Personel** (`HR`). Ödemeler mevcut **Finans** yetkisiyle yapılır. |
| Plasiyer ve bayi ataması | Personelin satışı, sorumlu olduğu bayilerin siparişlerinden ve bayi adına girdiği siparişlerden hesaplanır. |
| Siparişler ve iadeler | Bayi hedefiyle aynı kural: onaylanan satış (KDV hariç, kupon düşülmüş, kargo hariç), iptaller sayılmaz, iadeler düşülür. |
| Tahsilatlar | "Tahsilat" esaslı primde bayilerden alınan ödemeler (dövizliler TL karşılığıyla, ters kaydı yapılanlar hariç). |
| Gelir-Gider | Masraf, avans ve prim ödemesi Gelir-Gider'e gider olarak yazılır. Ayrı bir ödeme tablosu açılmadı. |
| Bildirimler | Mevcut bildirim altyapısı (panel, e-posta, telefona anlık bildirim). Yeni tür: "Personel". |
| İşlem kaydı | Onay, ret, ödeme ve geri almalar mevcut işlem kaydına yazılır. |
| Ayarlar | Modül anahtarı mevcut ayar tablosunda (`hr_enabled`). |

Yeni tablolar: personel kartı (`Employee`), izin (`LeaveRequest`), masraf / avans (`StaffClaim`), personel hedefi (`StaffTarget`), şirket duyurusu (`StaffAnnouncement`). Ayrı tutulmalarının nedeni şu: mevcut duyurular platformdan firmalara gidiyor; bayi hedefi ise primi bayinin carisine yazıyor. Personelde duyuru firma içinde kalıyor, prim ise ödemeyle Gelir-Gider'e gidiyor.

## Ekranlar

- **Personel Yönetimi** (`/admin/personel`): sekmeler Personel, İzinler, Masraf ve avans, Hedef ve prim, Duyurular. Yalnızca Finans yetkisi olan kişi masraf / avans ve hedef / prim sekmelerini görür (ödeme için).
- **Personel Alanım** (`/admin/personel-alanim`, plasiyerde `/plasiyer/personel`): kişinin kartı, yıl içindeki izin günleri, bekleyen talepleri, ödeme bekleyen tutarı; izin ve masraf / avans talebi açma; hedef ve primleri; duyurular.
- **Açma / kapama:** Personel Yönetimi sayfasındaki "Modülü aç" düğmesi ya da Ayarlar → Modüller.
- **Menü:** "Personel" grubu, bekleyen onay ve ödeme sayısı rozeti. Modül kapalıyken grup yalnızca Ayarlar yetkilisine "Kapalı" etiketiyle görünür (modül bulunabilsin diye). Plasiyer panelinde "Personel Alanım" kartı ve bildirim zili.
- **Gelir-Gider:** personel ödemesinden gelen kayıt "Personel ödemesi" etiketiyle görünür, düzenle / sil düğmesi yoktur.
- Bütün ekranlar telefonda alt alta kart düzenindedir.

## Kurallar

| Konu | Kural |
|---|---|
| Erişim | Modül kapalıyken menü ekip üyelerinden gizlenir (Ayarlar yetkilisine "Kapalı" etiketiyle görünür) ve `/api/hr` uçları 403 döner. Bayi hesapları rol kontrolüyle girmez. Personel `/me` uçlarında yalnızca kendi kaydını görür. |
| Firma ayrımı | Bütün tablolar kiracı yalıtımında; başka firmanın kaydına erişim 404. |
| Hesap bağlama | Yalnızca firmanın yönetici / plasiyer hesabı; bir hesap tek karta. Bayi hesabı bağlanamaz. |
| İzin | İş günü sayılır (hafta sonu hariç). Çakışan talep açılamaz. Ret gerekçesi zorunlu. Personel bekleyen talebini iptal edebilir. |
| Kendi talebi | Kişi kendi talebine karar veremez (firma sahibi hariç). |
| Onay ve ödeme | Onaylanan masraf / avans "ödeme bekliyor" olur. Ödeme Finans yetkisiyle, tarih ve ödeme şekliyle kaydedilir. |
| Mükerrer ödeme | Gelir-gider kaydının kaynak anahtarı (`STAFF_CLAIM:<id>`, `STAFF_BONUS:<id>`) veritabanında tekil. Eşzamanlı üç denemeden yalnızca biri kaydedilir. |
| Geri alma | Yanlış ödeme Personel Yönetimi'nden geri alınır: gelir-gider kaydı silinir, talep yeniden ödeme bekler. Gelir-Gider'den değiştirmek ya da silmek reddedilir. |
| Prim | Hedef tutarsa gerçekleşenin yüzdesi. Ay bitmeden dönem kapatılamaz. Kapanışta prim sabitlenir; sonradan gelen iade kapalı ayı değiştirmez. Hesaplanan ve ödenen prim ayrı. |
| Kayıt | Karar verenin ve ödeyenin adı, zamanı kayıtta; işlem kaydına ayrıca yazılır. |
| KVKK | Yeni tablolar firma verisi dışa aktarmaya ve kalıcı silmeye dahil; fişler `uploads/private/hr` altında. |

## Yolda düzeltilenler

- **Yetkisiz ekip üyesine firma özeti:** Ana Sayfa'daki panel özeti (ciro, borçlular, bekleyen siparişler) hiç yetkisi olmayan kullanıcıya da gidiyordu. Personel hesabı bu yolla açılacağı için kapatıldı. Bu kullanıcılar sade bir karşılama ekranı görüyor.
- **Arama:** üst çubuk araması artık her bölümü yalnızca o kaydı açabilen yetkiyle arıyor (ürün: katalog / sipariş / teklif; bayi: bayi / finans / sipariş; sipariş: sipariş / finans).
- **Bildirim paneli:** telefonda zil ekranın sağ ucunda değilse panel sola taşıp kesiliyordu. Telefonda ekran genişliğine sabitlendi (bütün panellerde).

## Testler

- **Entegrasyon:** `test/integration/hr.test.js`, 10 senaryo:
  - modül aç / kapa; bayi, yetkisiz personel ve plasiyer erişimi;
  - firma izolasyonu; hesap bağlama kuralları;
  - izin akışı ve kendi talebini onaylama engeli;
  - onay ile ödemenin ayrı olması; Finans yetkisi şartı;
  - eşzamanlı ödemede tek kayıt; gelir-gider kaydının korunması ve geri alma;
  - prim hesabı (iptal, kısmi onay, kupon, iade, bayi adına sipariş, dövizli tahsilat);
  - kapanışta sabitlenme; duyuru hedefleme; yetkisiz kullanıcıya özet ve aramanın kapalı olması.
- **UAT-18** (`uat/tests/personel.spec.mjs`): gerçek tarayıcıda modülü açma, kart, izin ve fişli masraf talebi, onay, ödeme ve Gelir-Gider'e yansıması, departman duyurusu, plasiyerin telefonda kendi alanı.

## 5 Kasım: eksiklerin tamamlanması

İlk sürümde kapsam dışı bırakılan beş konu eklendi (yeni tablo `StaffPayment`; migration `20261128120000_personel_eksikleri`).

| Konu | Yapılan |
|---|---|
| **Yıllık izin hakkı** | Her işe giriş yıl dönümünde hak eklenir: 1–5 yıl 14, 5–15 yıl 20, 15+ yıl 26 gün (İş Kanunu md. 53). Firma daha fazlasını kartta tanımlar; yasal sürenin altı sayılmaz. Kullanılmayan izin devreder. Sisteme geçişte "şu tarih itibarıyla kalan X gün" devri girilir. Kalan gün, bekleyen talepler ve bir sonraki hak tarihi personelde, kartlarda ve onay ekranlarında görünür. Kalanı aşan talep reddedilir; "avans izin" ayarı açılırsa eksiye düşebilir. |
| **Resmî tatil ve yarım gün** | Sabit resmî tatiller otomatik düşülür (28 Ekim yarım gün). Dini bayramlar ve firma tatilleri İzin ayarlarındaki listeye eklenir (arife yarım gün). "Cumartesi iş günü" ayarı. Tek günlük izinde sabah / öğleden sonra yarım gün. Talep penceresi gün sayısını, aradaki tatilleri ve kalan izni önceden gösterir. |
| **Kısmi ödeme** | Masraf, avans ve prim birden çok parçada ödenir; her parça Gelir-Gider'de ayrı gider kaydı açar (kaynak `STAFF_PAY:<ödeme>`, tekil). Kalan tutardan fazlası ödenemez; satır kilidiyle eşzamanlı ödemeler sırayla işler (3 eşzamanlı denemede kalanı aşan reddedilir). Her ödeme ayrı geri alınır. "Kısmen ödendi" durumu. |
| **Avans mahsubu** | Ödenen avans "açık avans" olur. Masraf ya da prim ödenirken "avanstan mahsup" seçilirse açık avanslardan (eskisi önce) düşülür, nakit çıkmaz. Kalan avans nakit iade (Gelir-Gider'e "Personel avans iadesi" geliri) ya da maaştan kesinti ile kapanır. Mahsubu olan avansın ödemesi önce mahsup geri alınmadan geri alınamaz. |
| **Departman yöneticisi** | Kartta "Yöneticisi" (hesabı olan personel); departmanın tamamına tek seferde atanabilir. Yönetici Personel yetkisi olmadan yalnızca kendi ekibinin izin ve masraf / avans taleplerine "Personel Alanım → Ekibim"den karar verir; yeni talep bildirimi ona gider. Personel yetkilisi her zaman karar verebilir. Ödeme yine Finans yetkisinde. |
| **Personel rolü** | Hesabı olmayan personele kartından "Personel girişi" açılır (`PERSONEL` rolü). Yalnızca `/personel` sayfasına ve `/api/hr` uçlarına girer; panel, katalog, sipariş ve finans uçları 403. Paketteki yönetici sayısına dahil değil. Geçici şifre e-postayla gider, gönderilemezse ekranda bir kez gösterilir. Kart pasife alınınca hesap da kapanır. Ortak giriş (`/giris`) ve Google girişi bu rolü tanır. |

Testler: `hr.test.js` 15 senaryoya çıktı (personel rolü, izin hakkı / tatiller / yarım gün / avans izin, departman yöneticisi, kısmi ödeme ve avans mahsubu, pasif personelin hesabı). UAT-18'e personel girişiyle gerçek giriş, yarım gün izin, yönetici onayı ve iki parçalı ödeme adımı eklendi.

## Eksik kalanlar

- **Dini bayram tarihleri otomatik değil:** her yıl değiştikleri için firma İzin ayarlarından ekler (Diyanet takvimi). Eklenmezse o günler iş günü sayılır.
- **Yaşa bağlı izin kuralı:** 18 yaş altı ve 50 yaş üstü için en az 20 gün kuralı otomatik değil (doğum tarihi tutulmuyor); kartta "firmanın verdiği gün" ile tanımlanır.
- **Tek aşamalı onay:** yönetici ya da Personel yetkilisi onaylar; "önce yönetici, sonra İK" gibi iki aşamalı onay yok.
- **Bordro yok:** maaştan kesinti yalnızca avansı kapatan kayıttır, maaş hesabına yansımaz.
- **Satış ataması:** bayinin plasiyeri ay içinde değişirse ay hesabı güncel atamaya göre yapılır.
- **İki prim sistemi:** mevcut sipariş başına plasiyer primi (`plasiyer_rate`, varsayılan %5) duruyor. Yalnızca hedef primi istenirse Ayarlar'da oran 0 yapılmalı.
- **Panel özeti:** bazı yetkileri olan kullanıcı (ör. yalnızca Personel ya da Müşteri adayları) panel özetini hâlâ görüyor (mevcut davranış). Yetkiye göre daraltmak ayrı iş.
