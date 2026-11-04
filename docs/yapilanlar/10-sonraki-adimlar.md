# 10. Açık konular ve sonraki adımlar

4 Kasım 2026 itibarıyla bilerek sonraya bırakılanlar, canlıya çıkmadan önce elle denenmesi gerekenler ve bilinen sınırlar.

## Sonraya bırakılan yük testleri

4 Kasım'da planlandı, sonraya bırakıldı. Ayrıntı ve süreler: [`loadtest/README.md` → Sonraya bırakılan testler](../../loadtest/README.md).

| # | Test | Ne ölçer |
|---|---|---|
| 1 | Kampanya günü | Yazma ağırlıklı karışık yük: 1000 bayi sipariş verir, 50 yönetici onaylar |
| 2 | 100 firma, gürültülü komşu | Bir firma ağır yükteyken diğer firmaların yanıt süresi |
| 3 | Uzun süre (2–4 saat) | Bellek sızıntısı, açık bağlantılar, büyüyen tablolar |
| 4 | 10 kat veri | 500 bin sipariş, 50 bin ürün, 10 bin bayide sorgu planları |
| 5 | Ağır uçlar | Excel, 12 aylık rapor, ekstre, PDF bir süreci kilitliyor mu? |
| 6 | ERP API yükü | On binlerce ürünün stok / fiyat güncellemesi |
| 7 | Aşırı ani yük | 10 sn'de 0 → 3000 kullanıcı |
| 8 | Dayanıklılık | Yük altında Redis / işçi süreç / veritabanı kesintisi |
| 9 | Tarayıcıyla sayfa açılışı | Yük altında katalog ve ödeme sayfasının açılış süresi |

Önerilen sıra: 1, 2, 4, 5 → gece 3 → 6, 7, 8, 9. Hazırlık yaklaşık 4–5 saat, çalışma yaklaşık 2 saat ve bir gece.

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
- [ ] **Personel yönetimi:** gerçek verilerle bir ay: izin ve masraf talepleri, ödeme ve Gelir-Gider, ay sonunda hedef kapanışı ve prim ödemesi.
- [ ] **Barkod okutma:** gerçek telefon kamerasıyla, https adresinde.

## Bilinen sınırlar

- **e-İrsaliye entegre değil.** İrsaliye numarası elle ya da ERP'den girilir, fiyatsız irsaliye yazdırılır. GİB'e elektronik irsaliye gönderilmez; e-İrsaliye mükellefi firmalar irsaliyeyi ERP / muhasebe programından düzenler.
- **Barkod okutma** https ister; tarayıcı kamera izni sorar.
- **Yük testi sayıları** geliştirme bilgisayarında alındı; canlı kapasiteyi göstermez.
- **iPhone'da anlık bildirim** yalnızca ana ekrana eklenen uygulamada çalışır (iOS 16.4+).
- **Personel yönetimi:** izin hakkı (kalan gün), avans mahsubu, departman yöneticisi onayı, ayrı personel rolü ve kısmi ödeme yok; ayrıntı [11. bölüm](11-personel-yonetimi.md).

## 4 Kasım'daki davranış değişiklikleri

Kullanıcıların fark edeceği değişiklikler, duyurulmalı:

- **Stoktan fazla sipariş verilemez.** Bekleyen siparişler stoktan ayrılmış sayılır. Stokta olmayan mal teklif talebiyle istenir.
- **Tamamen iptal edilen siparişin kuponu** yeniden kullanılabilir.
- **Sepet kullanıcıya özel:** çıkışta tarayıcıdan silinir; bayinin sepeti sunucuda saklanır.
- **Plasiyer girişi:** plasiyerler artık kendi hesabıyla girer ve plasiyer paneline düşer.

## Canlıya alırken

- Veritabanı migration'ları: `npx prisma migrate deploy` (son migration `20261126120000_b2b_eksikleri`; tekliften gelen mevcut siparişlere kanal, kargoya verilmiş siparişlerin kalemlerine gönderilen miktar yazılır).
- Frontend bağımlılıkları: `npm ci` (yeni paket `@zxing/browser`).
- `ENCRYPTION_KEY` bir kez belirlenir, sonra değiştirilmez; değişirse firmaların kayıtlı anahtarları çözülemez.
- Google ile giriş için `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (yönlendirme adresi: `https://api.akisb2b.com/api/public/google/callback`).
- Push için `VAPID_*` anahtarları; uyarılar için `PLATFORM_ALERT_EMAIL` ve SMTP.
- Adım adım: [`docs/canliya-cikis.md`](../canliya-cikis.md).

## Depo durumu

- SaaS dönemine ait 66 commit `feature/saas-platform` dalındadır; `main` dalında yalnızca Mayıs sürümü var.
- Dal henüz uzak depoya gönderilmedi. `main`'e birleştirme ve gönderim ayrıca kararlaştırılacak.
- `.env`, `uploads/support`, `uploads/private` ve `backups` depoya girmez.
