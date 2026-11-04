# 4. Finans ve cari

Siparişin parası bu bölümde izlenir: cari borç ve alacak, tahsilat, fatura, firmanın kendi gelir ve giderleri, bayi primleri.

## Temel akış

- Yönetici siparişi onaylayınca tutar bayinin carisine borç yazılır (Mayıs sürümünden beri).
- Bayi portalda kartla öder (firmanın iyzico ya da PayTR sanal POS'u); borç düşer, risk limiti hemen yeniden açılır.
- Bayi Finansal Durum sayfasında bakiyesini, limitini ve ekstresini görür.
- Mayıs sürümünde elle borç / alacak girişi ve plasiyer prim puanı vardı.

## Cari hesaplar (`94e13d4`)

- **Cari türleri:** bayi, portal dışı müşteri, tedarikçi; yetkili kişiler. Bayi ekranları ayrı kalır.
- **Hareketler:** tahsilat / ödeme ve makbuz, hareketin kaynağı, filtreler, ters kayıt, Excel'e aktarma.
- **Excel'den cari aktarımı:** önizleme ve açılış bakiyesiyle.
- **Takip:** etiket, sorumlu personel, görüşme notları ve hatırlatma, gizli belgeler.
- **Mutabakat:** ekstre bağlantısıyla mutabakat isteği, cari özet kartı, portal dışı müşteriyi bayiye dönüştürme.
- Finans ve Prim ekranı tahsilat, vade, prim ve mutabakat takibine sadeleştirildi.

## Dövizli cari (`20a8661`)

- Cari para birimi TL, USD ya da EUR olabilir; bakiye, risk limiti ve ekstre carinin para birimindedir. Hareketi olan carinin para birimi değiştirilemez.
- Bütün borç / alacak yazımları tek serviste (`accountPosting`) toplanır; her harekette kur ve TL karşılığı saklanır.
- Siparişler TL'dir; dövizli cariye sipariş anındaki kurla yazılır, iadeler siparişin kuruyla. Kartla ödeme günün kuruyla çevrilir. Ters kayıt orijinal kurla yapılır.
- Finans özeti ve yaşlandırma para birimine göre ayrı, ayrıca güncel kurla TL toplamı.

## Gecikmiş alacaklar (yaşlandırma)

- Ekran açık dille yeniden yazıldı (`7ffe7c1`): "Vadesi gelmemiş", "1–30 gün gecikmiş" … "Tarihi bilinmeyen" dilimleri, gecikmeye göre renk, her cari için "En eski borç N gün gecikmiş" özeti, en riskli cari en üstte, örnekli açıklama.
- Rapor tek sorguya indirildi: 10 bin ürün / 5 bin siparişte 2 sn → 50 ms (`5f9f72c`).

## E-fatura ve e-arşiv (`2314836`)

- **Paraşüt ile otomatik:** fatura Paraşüt'te oluşturulur; alıcı GİB e-fatura listesindeyse e-fatura, değilse e-arşiv gönderilir. Elle, onayda ya da kargoda kesilebilir; hata olursa sipariş ekranında görünür ve yeniden denenir.
- **ERP'den veya elle:** ERP faturayı keser, numara ve PDF adresini API ile yazar ya da yönetici sipariş ekranından girer.
- Bayi sipariş detayında fatura PDF'ini açar. Kargo ücreti faturaya ayrı satır olarak girer (`a8e2226`).
- Paraşüt akışı testlerde Paraşüt'ü taklit eden bir sunucuyla doğrulandı; gerçek hesapla deneme canlı öncesine kaldı.

## Gelir-gider (`23928bf`, `49b50fa`)

Finans → Gelir-Gider, firmanın cariye bağlı olmayan giderleri ve satış dışı gelirleri içindir. Cari tahsilatları ve tedarikçi ödemeleri özete otomatik ve salt okunur gelir.

- Aylık / yıllık dönem, önceki dönemle karşılaştırma (süren dönemde aynı süreyle), 12 aylık eğilim, dönem içi birikimli nakit akışı.
- Kategori bütçeleri ve aşım uyarısı; kategori %90'a gelince ve aşılınca Finans yetkililerine bildirim (her eşik ayda bir kez).
- Düzenli gelir / gider: her ay seçilen gün otomatik kayıt.
- Fiş / fatura eki (PDF, görsel), telefonda kamerayla fiş çekme; KDV oranı ve KDV özeti, ödeme şekli dağılımı.
- **Önümüzdeki 30 gün:** vadesi gelen bayi alacakları ve tedarikçi borçları, çek / senet vadeleri, düzenli kayıtlar; gün gün birikimli net, vadesi geçmişler ayrı uyarı.
- Arama, filtreler, güne göre gruplu liste, Excel (özet, kategoriler, kayıtlar).

## Bayi hedefi ve ciro primi (`a8e2226`)

- Finans ve Prim'den bayiye dönem hedefi (KDV hariç ciro) ve prim yüzdesi tanımlanır.
- Gerçekleşen: dönemde onaylanan siparişler eksi iadeler. Bayi ilerlemeyi Finansal Durum'da görür.
- Dönem kapatılınca hedef tuttuysa prim cariye alacak olarak bir kez yazılır.
- Plasiyer kendi primlerini panelinde görür.

## Tarih ve saat düzeltmeleri (`5793d6d`)

Sunucu UTC çalıştığı için gece 00:00–03:00 arasındaki işlemler önceki güne yazılıyordu. Hesaplar Türkiye gününe çekildi:

- Cari ekstre bağlantısında kesim anı bağlantının oluşturulduğu an oldu (gece yapılan son hareketler ekstreden düşüyordu).
- Satış raporunda günlük / aylık gruplama, Excel dosya adları, yapay zekâ günlük kotası ve yasal metin tarihi Türkiye gününe göre.
- `localDay` / `localDate` yardımcıları ve gece yarısı birim testi eklendi.

## Yük altında doğruluk (`2197736`)

Yük testinde eşzamanlı onaylarla aynı siparişe iki kez borç yazıldığı görüldü (testte toplam 433.787 TL fazla borç). Sipariş satırı kilidiyle düzeltildi; tekrar testinde çift borç çıkmadı (bkz. [9. bölüm](09-testler-kalite.md)).

## Commit'ler

| Commit | Tarih | Açıklama |
|---|---|---|
| `2314836` | 27 Ekim | E-fatura (Paraşüt), abonelik faturaları |
| `94e13d4` | 27 Ekim | Cari hesaplar (müşteri / tedarikçi, defter, mutabakat) |
| `20a8661` | 27 Ekim | Dövizli cari |
| `7ffe7c1` | 27 Ekim | Yaşlandırma ekranı sadeleşti |
| `5f9f72c` | 27 Ekim | Yaşlandırma tek sorgu |
| `5793d6d` | 3 Kasım | Gece yarısı tarih kayması |
| `23928bf`, `49b50fa` | 3 Kasım | Gelir-gider, nakit tahmini, bütçe bildirimi |
| `a8e2226` | 4 Kasım | Bayi hedefi ve ciro primi, kargo ücreti cariye ve faturaya |
