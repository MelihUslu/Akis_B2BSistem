# 6. Entegrasyon ve API

Firmalar Akis'i kendi ERP ve muhasebe programlarına bağlar; Akis de ödeme, fatura, kargo, kur, yapay zekâ ve mesajlaşma için dış servisleri kullanır.

## ERP API (`/api/v1`)

SaaS dönüşümüyle geldi (`b0613c5`).

- Firma Ayarlar → Entegrasyon'dan API anahtarı üretir.
- Ürün, stok, fiyat ve bayi aktarımı; depo kodu verilirse stok depo bazında güncellenir (`7c25dc0`).
- Siparişler teslimat adresi, depo ve fatura bilgisiyle çekilir; kargo ve fatura bilgisi geri yazılır. ERP'den gelen kargo güncellemesi yönetici ekranıyla aynı akıştan geçer (`3bd1f84`).
- Gel-Al alanları (`deliveryMethod`, `pickupAt`) ve "Teslim Almaya Hazır" durumu (`c54bc80`).
- 4 Kasım'da eklenen alanlar: sipariş notu, bayinin referans numarası, kanal, kargo ücreti, sevkiyatlar. İrsaliye numarası `PATCH /api/v1/orders/:id/status` gövdesinde `despatchNumber` ile yazılır (`a8e2226`).
- Her API isteği kaydedilir ve platform izleme ekranında görünür (`cad46b7`).

## Webhook'lar

- Sipariş, ödeme, iade ve fatura olayları ERP'ye HMAC-SHA256 ile imzalı olarak gönderilir.
- **Gönderim kaydı ve yeniden deneme kuyruğu** (`6571065`): her gönderim kaydedilir; başarısız olanlar 1 dakikadan 6 saate uzanan aralıklarla 6 kez denenir. Panelde gönderim kaydı ve "yeniden gönder" vardır. Kayıt kilidi sayesinde birden çok sunucuda tek gönderim yapılır.
- Zamanlanmış işler (hatırlatmalar, kargo senkronu) Redis kilidiyle tek sunucuda çalışır (`withJobLock`).

## API dokümanı (`3bd1f84`)

- Her firma portalında `/developer` sayfası; giriş gerektirmez, ERP yazılımcısıyla paylaşılır.
- Makine okunur tanım: `GET /api/v1/openapi.json` (OpenAPI 3.1; Redocly ile doğrulandı, Postman ve kod üreticilere aktarılabilir).

## Test (sandbox) anahtarları (`31b40a2`)

Test anahtarı okur, yazma isteklerini doğrular ama kaydetmez. ERP yazılımcısı canlı veriyi bozmadan entegrasyonu dener. Örnek webhook olayı gönderen bir uç da vardır.

## Dış servisler

| Servis | Kullanım | Bölüm |
|---|---|---|
| iyzico | Platform abonelik ödemesi; firmanın bayi tahsilatı | [2](02-saas-platform.md), [4](04-finans-cari.md) |
| PayTR | Firmanın bayi tahsilatı (iyzico'ya seçenek) | [4](04-finans-cari.md) |
| Paraşüt | E-fatura / e-arşiv, platform abonelik faturası | [4](04-finans-cari.md) |
| Yurtiçi Kargo | Gönderi, barkodlu etiket, takip, teslim | [3](03-siparis-katalog-lojistik.md) |
| TCMB | Döviz kurları | [3](03-siparis-katalog-lojistik.md), [4](04-finans-cari.md) |
| Yapay zekâ sağlayıcısı | Akıllı teklif, WhatsApp cevabı, sohbet botu | [5](05-teklif-satis-pazarlama.md) |
| Meta WhatsApp Cloud API | WhatsApp gelen kutusu | [5](05-teklif-satis-pazarlama.md) |
| SMTP | E-postalar | |
| Netgsm | SMS bildirimi ve toplu SMS (firmanın kendi hesabı; isteğe bağlı, Ayarlar → SMS) | [5](05-teklif-satis-pazarlama.md), [7](07-raporlar-izleme-operasyon.md) |
| Web Push (VAPID) | Telefona anlık bildirim | [8](08-arayuz-tasarim.md) |

Firmaların kendi anahtarları (sanal POS, Paraşüt, Yurtiçi, WhatsApp) şifreli saklanır. Her dış servis çağrısı süre ve sonucuyla kaydedilir (`cad46b7`).

**Testlerde:** Paraşüt, Yurtiçi ve WhatsApp, taklit sunucularla (`test/integration/*Mock.js`) denenir. Yurtiçi istemcisi ayrıca Yurtiçi'nin herkese açık test servisine karşı denenebilir (`YURTICI_LIVE=1`).

## Commit'ler

| Commit | Tarih | Açıklama |
|---|---|---|
| `b0613c5` | 26 Ekim | ERP API ve imzalı webhook'lar |
| `3bd1f84` | 27 Ekim | OpenAPI 3.1, `/developer`, ERP siparişine adres / depo / fatura |
| `6571065` | 27 Ekim | Webhook kaydı, yeniden deneme kuyruğu, Redis kilidi |
| `31b40a2` | 27 Ekim | Test (sandbox) anahtarları |
| `c54bc80` | 3 Kasım | Gel-Al alanları |
| `a8e2226` | 4 Kasım | Not, referans no, kanal, kargo ücreti, irsaliye no |
