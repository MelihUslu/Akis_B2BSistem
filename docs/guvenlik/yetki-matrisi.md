# Yetki matrisi

Her uca kimin girebildiği. Tablo, yetki matrisi testinin (`backend/test/integration/authzMatrix.test.js`) uçlardaki koruyuculardan (rol, yönetici yetkisi, bayi yetkisi) hesapladığı sonuçtur; test her satırı gerçek istekle de doğrular. Uçların kendi içindeki ek denetimler tabloda görünmez. Örnekler: izin onayında personelin yöneticisi olma, bayide yalnızca kendi kaydını görme, ana kullanıcıya ait işler. Bu denetimler `dealers`, `dealerIdor`, `hr` ve `dealerPermissions` testlerinde ayrıca denenir.

Son üretim: 12 Kasım 2026 · 450 uç · yeniden üretmek için [12. bölüm](../yapilanlar/12-guvenlik-denetimi.md#çalıştırma).

| Kişi | Açıklama |
|---|---|
| Sahip | Firma sahibi (bütün yönetici yetkileri) |
| Yetkisiz üye | Yönetici hesabı, hiçbir yetkisi yok (ör. yalnızca Personel Alanım'ı kullanan çalışan) |
| Ürünler yetkili üye | Yalnızca Ürünler (katalog) yetkisi olan yönetici |
| Bayi ana kullanıcısı | Bayinin sahibi |
| Bayi çalışanı (kısıtlı) | Fiyat, cari, iade ve adres yetkileri kapalı, sipariş veremez |
| Plasiyer | Kendi kimliğiyle (bayi adına işlemde bayi gibi görünür) |
| Personel | Yalnızca Personel Alanım |
| Platform yöneticisi | Platform paneli |

Oturumsuz, başka firmanın ve platformun oturumu hiçbir firma ucuna giremez; tabloda yalnızca girebilenler yazılıdır. "Yetkisiz üye" ya da "Ürünler yetkili üye" bir satırda yoksa, o uç bu kişiye 403 döner.

### /api/account

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/account/audit-logs` | Sahip |
| GET | `/api/account/announcements` | Sahip, Yetkisiz üye, Ürünler yetkili üye |
| GET | `/api/account/support-meta` | Sahip, Yetkisiz üye, Ürünler yetkili üye |
| POST | `/api/account/support/upload` | Sahip, Yetkisiz üye, Ürünler yetkili üye |
| GET | `/api/account/support` | Sahip, Yetkisiz üye, Ürünler yetkili üye |
| POST | `/api/account/support` | Sahip, Yetkisiz üye, Ürünler yetkili üye |
| GET | `/api/account/support/:id` | Sahip, Yetkisiz üye, Ürünler yetkili üye |
| POST | `/api/account/support/:id/messages` | Sahip, Yetkisiz üye, Ürünler yetkili üye |
| POST | `/api/account/support/:id/close` | Sahip, Yetkisiz üye, Ürünler yetkili üye |
| POST | `/api/account/support/:id/rate` | Sahip, Yetkisiz üye, Ürünler yetkili üye |
| GET | `/api/account/help` | Sahip, Yetkisiz üye, Ürünler yetkili üye |
| GET | `/api/account/help/:id` | Sahip, Yetkisiz üye, Ürünler yetkili üye |
| POST | `/api/account/help/:id/feedback` | Sahip, Yetkisiz üye, Ürünler yetkili üye |
| GET | `/api/account/domain` | Sahip |
| PUT | `/api/account/domain` | Sahip |
| POST | `/api/account/domain/verify` | Sahip |
| DELETE | `/api/account/domain` | Sahip |
| GET | `/api/account/export` | Sahip |
| POST | `/api/account/close` | Sahip |

### /api/addresses

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/addresses/` | Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı) |
| POST | `/api/addresses/` | Bayi ana kullanıcısı |
| PATCH | `/api/addresses/:id` | Bayi ana kullanıcısı |
| DELETE | `/api/addresses/:id` | Bayi ana kullanıcısı |

### /api/auth

| Yöntem | Uç | Girebilen |
|---|---|---|
| POST | `/api/auth/handoff` | **herkes (oturumsuz)** |
| POST | `/api/auth/google` | **herkes (oturumsuz)** |
| POST | `/api/auth/login` | **herkes (oturumsuz)** |
| POST | `/api/auth/forgot-password` | **herkes (oturumsuz)** |
| POST | `/api/auth/reset-password` | **herkes (oturumsuz)** |
| POST | `/api/auth/2fa/verify` | **herkes (oturumsuz)** |
| GET | `/api/auth/me` | Sahip, Yetkisiz üye, Ürünler yetkili üye, Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı), Plasiyer, Personel |
| GET | `/api/auth/notification-prefs` | Sahip, Yetkisiz üye, Ürünler yetkili üye, Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı), Personel |
| PUT | `/api/auth/notification-prefs` | Sahip, Yetkisiz üye, Ürünler yetkili üye, Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı), Personel |
| GET | `/api/auth/2fa` | Sahip, Yetkisiz üye, Ürünler yetkili üye, Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı) |
| POST | `/api/auth/2fa/setup` | Sahip, Yetkisiz üye, Ürünler yetkili üye, Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı) |
| POST | `/api/auth/2fa/enable` | Sahip, Yetkisiz üye, Ürünler yetkili üye, Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı) |
| POST | `/api/auth/2fa/disable` | Sahip, Yetkisiz üye, Ürünler yetkili üye, Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı) |
| POST | `/api/auth/change-password` | Sahip, Yetkisiz üye, Ürünler yetkili üye, Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı), Plasiyer, Personel |
| POST | `/api/auth/register` | Sahip |
| GET | `/api/auth/users` | Sahip |

### /api/billing

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/billing/` | Sahip |
| POST | `/api/billing/checkout` | Sahip |
| POST | `/api/billing/cancel` | Sahip |
| POST | `/api/billing/transfer` | Sahip |
| DELETE | `/api/billing/transfer/:id` | Sahip |
| GET | `/api/billing/payments/:id/invoice` | Sahip |

### /api/bulk-mail

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/bulk-mail/meta` | Sahip |
| GET | `/api/bulk-mail/recipients` | Sahip |
| POST | `/api/bulk-mail/test` | Sahip |
| POST | `/api/bulk-mail/send` | Sahip |
| GET | `/api/bulk-mail/campaigns` | Sahip |
| GET | `/api/bulk-mail/campaigns/:id` | Sahip |

### /api/bulk-sms

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/bulk-sms/meta` | Sahip |
| GET | `/api/bulk-sms/recipients` | Sahip |
| POST | `/api/bulk-sms/send` | Sahip |
| GET | `/api/bulk-sms/campaigns` | Sahip |
| GET | `/api/bulk-sms/campaigns/:id` | Sahip |

### /api/cargo-settings

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/cargo-settings/` | Sahip |
| PUT | `/api/cargo-settings/` | Sahip |
| POST | `/api/cargo-settings/test` | Sahip |

### /api/cart

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/cart/` | Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı) |
| PUT | `/api/cart/` | Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı) |

### /api/cash

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/cash/` | Sahip |
| GET | `/api/cash/export` | Sahip |
| GET | `/api/cash/forecast` | Sahip |
| PUT | `/api/cash/budgets` | Sahip |
| POST | `/api/cash/recurring` | Sahip |
| PUT | `/api/cash/recurring/:id` | Sahip |
| DELETE | `/api/cash/recurring/:id` | Sahip |
| POST | `/api/cash/` | Sahip |
| PUT | `/api/cash/:id` | Sahip |
| DELETE | `/api/cash/:id` | Sahip |
| POST | `/api/cash/:id/file` | Sahip |
| GET | `/api/cash/:id/file` | Sahip |
| DELETE | `/api/cash/:id/file` | Sahip |

### /api/categories

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/categories/` | Sahip, Yetkisiz üye, Ürünler yetkili üye, Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı) |
| POST | `/api/categories/reorder` | Sahip, Ürünler yetkili üye |
| POST | `/api/categories/` | Sahip, Ürünler yetkili üye |
| POST | `/api/categories/upload-image` | Sahip, Ürünler yetkili üye |
| PATCH | `/api/categories/:id` | Sahip, Ürünler yetkili üye |
| DELETE | `/api/categories/:id` | Sahip, Ürünler yetkili üye |

### /api/cheques

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/cheques/` | Sahip |
| POST | `/api/cheques/:id/:action` | Sahip |

### /api/companies

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/companies/` | Sahip, Ürünler yetkili üye |
| POST | `/api/companies/` | Sahip |
| PATCH | `/api/companies/:id` | Sahip |
| POST | `/api/companies/:companyId/reset-password` | Sahip |
| GET | `/api/companies/:companyId/users` | Sahip |
| POST | `/api/companies/:companyId/users` | Sahip |
| PATCH | `/api/companies/:companyId/users/:userId` | Sahip |
| POST | `/api/companies/:companyId/users/:userId/reset-password` | Sahip |
| GET | `/api/companies/:companyId/addresses` | Sahip |
| POST | `/api/companies/:companyId/addresses` | Sahip |
| PATCH | `/api/companies/:companyId/addresses/:id` | Sahip |
| DELETE | `/api/companies/:companyId/addresses/:id` | Sahip |

### /api/coupons

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/coupons/` | Sahip, Ürünler yetkili üye |
| POST | `/api/coupons/` | Sahip, Ürünler yetkili üye |
| PATCH | `/api/coupons/:id` | Sahip, Ürünler yetkili üye |
| DELETE | `/api/coupons/:id` | Sahip, Ürünler yetkili üye |

### /api/customer-leads

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/customer-leads/` | Sahip |
| GET | `/api/customer-leads/export` | Sahip |
| GET | `/api/customer-leads/form` | Sahip |
| PUT | `/api/customer-leads/form` | Sahip |
| POST | `/api/customer-leads/` | Sahip |
| PATCH | `/api/customer-leads/:id` | Sahip |
| DELETE | `/api/customer-leads/:id` | Sahip |

### /api/dashboard

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/dashboard/` | Sahip, Yetkisiz üye, Ürünler yetkili üye |
| GET | `/api/dashboard/menu-counts` | Sahip, Yetkisiz üye, Ürünler yetkili üye |

### /api/dealer-applications

| Yöntem | Uç | Girebilen |
|---|---|---|
| POST | `/api/dealer-applications` | **herkes (oturumsuz)** |

### /api/feed

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/feed/` | Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı) |
| POST | `/api/feed/` | Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı) |
| DELETE | `/api/feed/` | Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı) |

### /api/finance

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/finance/my-statement` | Bayi ana kullanıcısı |
| GET | `/api/finance/my-statement/export` | Bayi ana kullanıcısı |
| POST | `/api/finance/reconcile` | Bayi ana kullanıcısı |
| POST | `/api/finance/transaction` | Sahip |
| GET | `/api/finance/summary` | Sahip |
| GET | `/api/finance/aging` | Sahip |
| GET | `/api/finance/plasiyer-points` | Sahip |
| GET | `/api/finance/reconciliations` | Sahip |
| GET | `/api/finance/statement/:companyId` | Sahip |
| GET | `/api/finance/statement/:companyId/export` | Sahip |

### /api/hr

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/hr/status` | Sahip, Yetkisiz üye, Ürünler yetkili üye, Plasiyer, Personel |
| GET | `/api/hr/me` | Sahip, Yetkisiz üye, Ürünler yetkili üye, Plasiyer, Personel |
| GET | `/api/hr/me/leaves` | Sahip, Yetkisiz üye, Ürünler yetkili üye, Plasiyer, Personel |
| GET | `/api/hr/me/leave-preview` | Sahip, Yetkisiz üye, Ürünler yetkili üye, Plasiyer, Personel |
| POST | `/api/hr/me/leaves` | Sahip, Yetkisiz üye, Ürünler yetkili üye, Plasiyer, Personel |
| POST | `/api/hr/me/leaves/:id/cancel` | Sahip, Yetkisiz üye, Ürünler yetkili üye, Plasiyer, Personel |
| GET | `/api/hr/me/claims` | Sahip, Yetkisiz üye, Ürünler yetkili üye, Plasiyer, Personel |
| POST | `/api/hr/me/claims` | Sahip, Yetkisiz üye, Ürünler yetkili üye, Plasiyer, Personel |
| POST | `/api/hr/me/claims/:id/cancel` | Sahip, Yetkisiz üye, Ürünler yetkili üye, Plasiyer, Personel |
| GET | `/api/hr/me/targets` | Sahip, Yetkisiz üye, Ürünler yetkili üye, Plasiyer, Personel |
| GET | `/api/hr/me/announcements` | Sahip, Yetkisiz üye, Ürünler yetkili üye, Plasiyer, Personel |
| GET | `/api/hr/claims/:id/file` | Sahip, Yetkisiz üye, Ürünler yetkili üye, Plasiyer, Personel |
| GET | `/api/hr/team` | Sahip, Yetkisiz üye, Ürünler yetkili üye, Plasiyer, Personel |
| GET | `/api/hr/settings` | Sahip |
| PUT | `/api/hr/settings` | Sahip |
| GET | `/api/hr/employees` | Sahip |
| POST | `/api/hr/employees` | Sahip |
| PUT | `/api/hr/employees/:id` | Sahip |
| POST | `/api/hr/employees/:id/account` | Sahip |
| GET | `/api/hr/linkable-users` | Sahip |
| GET | `/api/hr/departments` | Sahip |
| GET | `/api/hr/leaves` | Sahip |
| POST | `/api/hr/leaves/:id/approve` | Sahip, Yetkisiz üye, Ürünler yetkili üye, Plasiyer, Personel |
| POST | `/api/hr/leaves/:id/reject` | Sahip, Yetkisiz üye, Ürünler yetkili üye, Plasiyer, Personel |
| GET | `/api/hr/claims` | Sahip |
| POST | `/api/hr/claims/:id/approve` | Sahip, Yetkisiz üye, Ürünler yetkili üye, Plasiyer, Personel |
| POST | `/api/hr/claims/:id/reject` | Sahip, Yetkisiz üye, Ürünler yetkili üye, Plasiyer, Personel |
| POST | `/api/hr/claims/:id/pay` | Sahip |
| POST | `/api/hr/claims/:id/settle` | Sahip |
| DELETE | `/api/hr/payments/:id` | Sahip |
| GET | `/api/hr/targets` | Sahip |
| POST | `/api/hr/targets` | Sahip |
| PUT | `/api/hr/targets/:id` | Sahip |
| DELETE | `/api/hr/targets/:id` | Sahip |
| POST | `/api/hr/targets/:id/close` | Sahip |
| POST | `/api/hr/targets/:id/pay` | Sahip |
| GET | `/api/hr/announcements` | Sahip |
| POST | `/api/hr/announcements` | Sahip |
| DELETE | `/api/hr/announcements/:id` | Sahip |

### /api/integrations

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/integrations/` | Sahip |
| POST | `/api/integrations/keys` | Sahip |
| DELETE | `/api/integrations/keys/:id` | Sahip |
| POST | `/api/integrations/webhooks` | Sahip |
| PATCH | `/api/integrations/webhooks/:id` | Sahip |
| DELETE | `/api/integrations/webhooks/:id` | Sahip |
| POST | `/api/integrations/webhooks/:id/test` | Sahip |
| GET | `/api/integrations/webhooks/:id/deliveries` | Sahip |
| POST | `/api/integrations/deliveries/:deliveryId/redeliver` | Sahip |

### /api/invoicing

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/invoicing/` | Sahip |
| PUT | `/api/invoicing/` | Sahip |
| POST | `/api/invoicing/test` | Sahip |

### /api/lead-form

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/lead-form` | **herkes (oturumsuz)** |
| POST | `/api/lead-form` | **herkes (oturumsuz)** |

### /api/lists

| Yöntem | Uç | Girebilen |
|---|---|---|
| POST | `/api/lists/favorites/:productId` | Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı) |
| DELETE | `/api/lists/favorites/:productId` | Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı) |
| GET | `/api/lists/templates` | Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı) |
| POST | `/api/lists/templates` | Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı) |
| PATCH | `/api/lists/templates/:id` | Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı) |
| DELETE | `/api/lists/templates/:id` | Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı) |

### /api/notifications

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/notifications/` | Sahip, Yetkisiz üye, Ürünler yetkili üye, Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı), Plasiyer, Personel |
| POST | `/api/notifications/read-all` | Sahip, Yetkisiz üye, Ürünler yetkili üye, Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı), Plasiyer, Personel |
| PATCH | `/api/notifications/:id/read` | Sahip, Yetkisiz üye, Ürünler yetkili üye, Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı), Plasiyer, Personel |
| GET | `/api/notifications/push` | Sahip, Yetkisiz üye, Ürünler yetkili üye, Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı), Plasiyer, Personel |
| POST | `/api/notifications/push/subscribe` | Sahip, Yetkisiz üye, Ürünler yetkili üye, Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı), Plasiyer, Personel |
| POST | `/api/notifications/push/unsubscribe` | Sahip, Yetkisiz üye, Ürünler yetkili üye, Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı), Plasiyer, Personel |

### /api/order-requests

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/order-requests/` | Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı) |
| POST | `/api/order-requests/:id/approve` | Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı) |
| POST | `/api/order-requests/:id/reject` | Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı) |
| POST | `/api/order-requests/:id/cancel` | Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı) |

### /api/orders

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/orders/` | Sahip, Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı) |
| GET | `/api/orders/export` | Sahip, Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı) |
| GET | `/api/orders/stats` | Sahip |
| GET | `/api/orders/:id/invoice` | Sahip, Bayi ana kullanıcısı |
| GET | `/api/orders/:id/invoice/pdf` | Sahip, Bayi ana kullanıcısı |
| POST | `/api/orders/:id/invoice` | Sahip |
| PUT | `/api/orders/:id/invoice` | Sahip |
| DELETE | `/api/orders/:id/invoice` | Sahip |
| POST | `/api/orders/:id/shipment` | Sahip |
| POST | `/api/orders/:id/shipment/refresh` | Sahip |
| DELETE | `/api/orders/:id/shipment` | Sahip |
| GET | `/api/orders/:id` | Sahip, Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı) |
| POST | `/api/orders/quote` | Bayi ana kullanıcısı |
| POST | `/api/orders/` | Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı) |
| PATCH | `/api/orders/:id/cancel` | Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı) |
| PATCH | `/api/orders/:id/partial-approve` | Sahip |
| PATCH | `/api/orders/:id/ship` | Sahip |
| PATCH | `/api/orders/:id/ready` | Sahip |
| PATCH | `/api/orders/:id/complete` | Sahip |
| POST | `/api/orders/:id/shipments` | Sahip |
| PATCH | `/api/orders/:id/despatch` | Sahip |

### /api/partners

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/partners/` | Sahip |
| GET | `/api/partners/meta` | Sahip |
| GET | `/api/partners/export` | Sahip |
| GET | `/api/partners/import/template` | Sahip |
| POST | `/api/partners/import` | Sahip |
| POST | `/api/partners/` | Sahip |
| GET | `/api/partners/payments/:paymentId` | Sahip |
| GET | `/api/partners/:id` | Sahip |
| PATCH | `/api/partners/:id` | Sahip |
| DELETE | `/api/partners/:id` | Sahip |
| POST | `/api/partners/:id/convert-to-dealer` | Sahip |
| POST | `/api/partners/:id/payments` | Sahip |
| GET | `/api/partners/:id/transactions` | Sahip |
| GET | `/api/partners/:id/transactions/export` | Sahip |
| POST | `/api/partners/:id/transactions/:txId/reverse` | Sahip |
| POST | `/api/partners/:id/statement-link` | Sahip |
| POST | `/api/partners/:id/notes` | Sahip |
| PATCH | `/api/partners/:id/notes/:noteId` | Sahip |
| DELETE | `/api/partners/:id/notes/:noteId` | Sahip |
| POST | `/api/partners/:id/documents` | Sahip |
| GET | `/api/partners/:id/documents/:docId` | Sahip |
| DELETE | `/api/partners/:id/documents/:docId` | Sahip |

### /api/payments

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/payments/` | Sahip, Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı) |
| GET | `/api/payments/pos-info` | Bayi ana kullanıcısı |
| POST | `/api/payments/pos` | Bayi ana kullanıcısı |
| POST | `/api/payments/pos/checkout` | Bayi ana kullanıcısı |

### /api/plasiyer

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/plasiyer/dealers` | Plasiyer |
| GET | `/api/plasiyer/summary` | Plasiyer |
| GET | `/api/plasiyer/visits` | Plasiyer |
| POST | `/api/plasiyer/visits` | Plasiyer |
| POST | `/api/plasiyer/visits/check-in` | Plasiyer |
| POST | `/api/plasiyer/visits/:id/cancel` | Plasiyer |

### /api/platform

| Yöntem | Uç | Girebilen |
|---|---|---|
| POST | `/api/platform/auth/login` | **herkes (oturumsuz)** |
| POST | `/api/platform/auth/forgot-password` | **herkes (oturumsuz)** |
| POST | `/api/platform/auth/reset-password` | **herkes (oturumsuz)** |
| POST | `/api/platform/auth/2fa/verify` | **herkes (oturumsuz)** |
| GET | `/api/platform/me/2fa` | Platform yöneticisi |
| POST | `/api/platform/me/2fa/setup` | Platform yöneticisi |
| POST | `/api/platform/me/2fa/enable` | Platform yöneticisi |
| POST | `/api/platform/me/2fa/disable` | Platform yöneticisi |
| GET | `/api/platform/dashboard` | Platform yöneticisi |
| GET | `/api/platform/tenants` | Platform yöneticisi |
| POST | `/api/platform/tenants` | Platform yöneticisi |
| GET | `/api/platform/tenants/:id` | Platform yöneticisi |
| PATCH | `/api/platform/tenants/:id` | Platform yöneticisi |
| POST | `/api/platform/tenants/:id/payments` | Platform yöneticisi |
| POST | `/api/platform/tenants/:id/admins/:userId/reset-password` | Platform yöneticisi |
| GET | `/api/platform/plans` | Platform yöneticisi |
| POST | `/api/platform/plans` | Platform yöneticisi |
| PATCH | `/api/platform/plans/:id` | Platform yöneticisi |
| POST | `/api/platform/plans/:id/sync-iyzico` | Platform yöneticisi |
| GET | `/api/platform/payments` | Platform yöneticisi |
| GET | `/api/platform/transfers` | Platform yöneticisi |
| POST | `/api/platform/transfers/:id/approve` | Platform yöneticisi |
| POST | `/api/platform/transfers/:id/reject` | Platform yöneticisi |
| POST | `/api/platform/payments/:id/invoice` | Platform yöneticisi |
| GET | `/api/platform/payments/:id/invoice/pdf` | Platform yöneticisi |
| POST | `/api/platform/tenants/:id/impersonate` | Platform yöneticisi |
| GET | `/api/platform/tenants/:id/export` | Platform yöneticisi |
| POST | `/api/platform/tenants/:id/reopen` | Platform yöneticisi |
| POST | `/api/platform/tenants/:id/purge` | Platform yöneticisi |
| GET | `/api/platform/audit-logs` | Platform yöneticisi |
| GET | `/api/platform/errors` | Platform yöneticisi |
| GET | `/api/platform/system` | Platform yöneticisi |
| GET | `/api/platform/backups` | Platform yöneticisi |
| GET | `/api/platform/site` | Platform yöneticisi |
| PUT | `/api/platform/site` | Platform yöneticisi |
| GET | `/api/platform/chats` | Platform yöneticisi |
| GET | `/api/platform/chats/:id` | Platform yöneticisi |
| POST | `/api/platform/chats/:id/messages` | Platform yöneticisi |
| PATCH | `/api/platform/chats/:id` | Platform yöneticisi |
| GET | `/api/platform/leads` | Platform yöneticisi |
| PATCH | `/api/platform/leads/:id` | Platform yöneticisi |
| GET | `/api/platform/monitoring/overview` | Platform yöneticisi |
| GET | `/api/platform/monitoring/filters` | Platform yöneticisi |
| GET | `/api/platform/monitoring/jobs` | Platform yöneticisi |
| GET | `/api/platform/monitoring/external` | Platform yöneticisi |
| GET | `/api/platform/monitoring/api-requests` | Platform yöneticisi |
| GET | `/api/platform/monitoring/slow` | Platform yöneticisi |
| POST | `/api/platform/errors/:id/resolve` | Platform yöneticisi |
| GET | `/api/platform/announcements` | Platform yöneticisi |
| POST | `/api/platform/announcements` | Platform yöneticisi |
| DELETE | `/api/platform/announcements/:id` | Platform yöneticisi |
| POST | `/api/platform/support/upload` | Platform yöneticisi |
| GET | `/api/platform/support` | Platform yöneticisi |
| GET | `/api/platform/support/:id` | Platform yöneticisi |
| POST | `/api/platform/support/:id/messages` | Platform yöneticisi |
| GET | `/api/platform/help` | Platform yöneticisi |
| POST | `/api/platform/help` | Platform yöneticisi |
| PUT | `/api/platform/help/:id` | Platform yöneticisi |
| DELETE | `/api/platform/help/:id` | Platform yöneticisi |

### /api/products

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/products/` | Sahip, Yetkisiz üye, Ürünler yetkili üye, Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı) |
| GET | `/api/products/filters` | Sahip, Yetkisiz üye, Ürünler yetkili üye, Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı) |
| GET | `/api/products/frequent` | Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı) |
| POST | `/api/products/resolve-skus` | Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı) |
| POST | `/api/products/:id/stock-alert` | Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı) |
| DELETE | `/api/products/:id/stock-alert` | Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı) |
| POST | `/api/products/` | Sahip, Ürünler yetkili üye |
| POST | `/api/products/reorder` | Sahip, Ürünler yetkili üye |
| PATCH | `/api/products/:id` | Sahip, Ürünler yetkili üye |
| DELETE | `/api/products/:id` | Sahip, Ürünler yetkili üye |
| GET | `/api/products/:id/special-prices` | Sahip, Ürünler yetkili üye |
| PUT | `/api/products/:id/special-prices` | Sahip, Ürünler yetkili üye |
| POST | `/api/products/link-alternative` | Sahip, Ürünler yetkili üye |
| GET | `/api/products/:id/compatible` | Sahip, Ürünler yetkili üye |
| PUT | `/api/products/:id/compatible` | Sahip, Ürünler yetkili üye |
| POST | `/api/products/upload-image` | Sahip, Ürünler yetkili üye |
| POST | `/api/products/bulk-update/:type` | Sahip, Ürünler yetkili üye |

### /api/public

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/public/plans` | **herkes (oturumsuz)** |
| GET | `/api/public/unsubscribe/:token` | **herkes (oturumsuz)** |
| POST | `/api/public/unsubscribe/:token` | **herkes (oturumsuz)** |
| GET | `/api/public/feed/:token` | **herkes (oturumsuz)** |
| GET | `/api/public/domain-check` | **herkes (oturumsuz)** |
| POST | `/api/public/client-errors` | **herkes (oturumsuz)** |
| GET | `/api/public/slug-available` | **herkes (oturumsuz)** |
| POST | `/api/public/login` | **herkes (oturumsuz)** |
| GET | `/api/public/google/start` | **herkes (oturumsuz)** |
| GET | `/api/public/google/callback` | **herkes (oturumsuz)** |
| POST | `/api/public/google/portals` | **herkes (oturumsuz)** |
| GET | `/api/public/portal` | **herkes (oturumsuz)** |
| POST | `/api/public/find-portal` | **herkes (oturumsuz)** |
| POST | `/api/public/signup` | **herkes (oturumsuz)** |
| POST | `/api/public/verify-email` | **herkes (oturumsuz)** |
| POST | `/api/public/resend-verification` | **herkes (oturumsuz)** |
| GET | `/api/public/site` | **herkes (oturumsuz)** |
| POST | `/api/public/chat` | **herkes (oturumsuz)** |
| GET | `/api/public/chat/:id` | **herkes (oturumsuz)** |
| POST | `/api/public/chat/:id/contact` | **herkes (oturumsuz)** |
| POST | `/api/public/chat/:id/messages` | **herkes (oturumsuz)** |
| POST | `/api/public/leads` | **herkes (oturumsuz)** |
| POST | `/api/public/iyzico/callback` | **herkes (oturumsuz)** |
| POST | `/api/public/iyzico/webhook` | **herkes (oturumsuz)** |
| POST | `/api/public/pos/callback` | **herkes (oturumsuz)** |
| POST | `/api/public/paytr/notify/:slug` | **herkes (oturumsuz)** |

### /api/quote-links

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/quote-links/:token` | **herkes (oturumsuz)** |
| POST | `/api/quote-links/:token/respond` | **herkes (oturumsuz)** |

### /api/quotes

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/quotes/meta` | Sahip |
| GET | `/api/quotes/catalog` | Sahip |
| POST | `/api/quotes/price` | Sahip |
| POST | `/api/quotes/ai/draft` | Sahip |
| POST | `/api/quotes/draft` | Sahip |
| GET | `/api/quotes/` | Sahip, Bayi ana kullanıcısı |
| GET | `/api/quotes/:id` | Sahip, Bayi ana kullanıcısı |
| GET | `/api/quotes/:id/document` | Sahip, Bayi ana kullanıcısı |
| POST | `/api/quotes/` | Bayi ana kullanıcısı |
| POST | `/api/quotes/:id/accept` | Bayi ana kullanıcısı |
| POST | `/api/quotes/:id/forward` | Bayi ana kullanıcısı |
| POST | `/api/quotes/:id/feedback` | Bayi ana kullanıcısı |
| POST | `/api/quotes/:id/cancel` | Bayi ana kullanıcısı |
| PUT | `/api/quotes/:id` | Sahip |
| DELETE | `/api/quotes/:id` | Sahip |
| GET | `/api/quotes/:id/history` | Sahip |
| POST | `/api/quotes/:id/submit` | Sahip |
| POST | `/api/quotes/:id/approve` | Sahip |
| POST | `/api/quotes/:id/withdraw` | Sahip |
| POST | `/api/quotes/:id/revise` | Sahip |
| POST | `/api/quotes/:id/reject` | Sahip |
| POST | `/api/quotes/:id/share` | Sahip |
| DELETE | `/api/quotes/:id/share` | Sahip |
| POST | `/api/quotes/:id/email` | Sahip |
| POST | `/api/quotes/:id/convert` | Sahip |

### /api/reports

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/reports/sales` | Sahip |
| GET | `/api/reports/sales/export` | Sahip |
| GET | `/api/reports/periodic/settings` | Sahip |
| PUT | `/api/reports/periodic/settings` | Sahip |
| GET | `/api/reports/periodic/live` | Sahip |
| GET | `/api/reports/periodic/live/export` | Sahip |
| GET | `/api/reports/periodic` | Sahip |
| GET | `/api/reports/periodic/:id` | Sahip |
| GET | `/api/reports/periodic/:id/export` | Sahip |

### /api/returns

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/returns/` | Sahip, Bayi ana kullanıcısı |
| POST | `/api/returns/` | Bayi ana kullanıcısı |
| POST | `/api/returns/upload-photo` | Bayi ana kullanıcısı |
| PATCH | `/api/returns/:id` | Sahip |

### /api/search

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/search` | Sahip, Yetkisiz üye, Ürünler yetkili üye |

### /api/settings

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/settings/` | Sahip, Ürünler yetkili üye |
| GET | `/api/settings/exchange-rates` | Sahip, Yetkisiz üye, Ürünler yetkili üye, Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı) |
| GET | `/api/settings/portal` | Sahip, Yetkisiz üye, Ürünler yetkili üye, Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı), Plasiyer |
| POST | `/api/settings/` | Sahip |

### /api/sms-settings

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/sms-settings/` | Sahip |
| PUT | `/api/sms-settings/` | Sahip |
| POST | `/api/sms-settings/headers` | Sahip |
| POST | `/api/sms-settings/test` | Sahip |

### /api/statement-links

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/statement-links/:token` | **herkes (oturumsuz)** |
| POST | `/api/statement-links/:token/respond` | **herkes (oturumsuz)** |

### /api/targets

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/targets/mine` | Bayi ana kullanıcısı |
| GET | `/api/targets/` | Sahip |
| POST | `/api/targets/` | Sahip |
| PATCH | `/api/targets/:id` | Sahip |
| DELETE | `/api/targets/:id` | Sahip |
| POST | `/api/targets/:id/close` | Sahip |

### /api/team

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/team/admins` | Sahip |
| POST | `/api/team/admins` | Sahip |
| PATCH | `/api/team/admins/:id` | Sahip |
| POST | `/api/team/admins/:id/reset-password` | Sahip |
| GET | `/api/team/my-company` | Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı) |
| POST | `/api/team/my-company` | Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı) |
| PATCH | `/api/team/my-company/:userId` | Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı) |
| POST | `/api/team/my-company/:userId/reset-password` | Bayi ana kullanıcısı, Bayi çalışanı (kısıtlı) |

### /api/tenant

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/tenant/public` | **herkes (oturumsuz)** |
| PATCH | `/api/tenant/` | Sahip |
| GET | `/api/tenant/pos` | Sahip |
| PUT | `/api/tenant/pos` | Sahip |
| PUT | `/api/tenant/pos/installments` | Sahip |
| DELETE | `/api/tenant/pos` | Sahip |

### /api/v1

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/v1/openapi.json` | **herkes (oturumsuz)** |
| GET | `/api/v1/products` | — (API anahtarı) |
| PUT | `/api/v1/products/stock` | — (API anahtarı) |
| PUT | `/api/v1/products/prices` | — (API anahtarı) |
| POST | `/api/v1/products/upsert` | — (API anahtarı) |
| GET | `/api/v1/companies` | — (API anahtarı) |
| POST | `/api/v1/companies/upsert` | — (API anahtarı) |
| PUT | `/api/v1/companies/balances` | — (API anahtarı) |
| GET | `/api/v1/orders` | — (API anahtarı) |
| GET | `/api/v1/orders/:id` | — (API anahtarı) |
| POST | `/api/v1/orders/:id/exported` | — (API anahtarı) |
| PATCH | `/api/v1/orders/:id/status` | — (API anahtarı) |
| PUT | `/api/v1/orders/:id/invoice` | — (API anahtarı) |
| POST | `/api/v1/webhooks/test` | — (API anahtarı) |

### /api/visits

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/visits/` | Sahip |

### /api/warehouses

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/warehouses/` | Sahip, Ürünler yetkili üye |
| GET | `/api/warehouses/stocks/:productId` | Sahip, Ürünler yetkili üye |
| POST | `/api/warehouses/transfer` | Sahip, Ürünler yetkili üye |
| POST | `/api/warehouses/` | Sahip |
| PATCH | `/api/warehouses/:id` | Sahip |
| DELETE | `/api/warehouses/:id` | Sahip |

### /api/whatsapp

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/api/whatsapp/webhook/:key` | **herkes (oturumsuz)** |
| POST | `/api/whatsapp/webhook/:key` | **herkes (oturumsuz)** |
| GET | `/api/whatsapp/channel` | Sahip |
| PUT | `/api/whatsapp/channel` | Sahip |
| PATCH | `/api/whatsapp/channel` | Sahip |
| DELETE | `/api/whatsapp/channel` | Sahip |
| POST | `/api/whatsapp/preview` | Sahip |
| GET | `/api/whatsapp/conversations` | Sahip |
| GET | `/api/whatsapp/conversations/:id` | Sahip |
| POST | `/api/whatsapp/conversations/:id/messages` | Sahip |
| PATCH | `/api/whatsapp/conversations/:id` | Sahip |

### /health

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/health` | **herkes (oturumsuz)** |

### /health/ready

| Yöntem | Uç | Girebilen |
|---|---|---|
| GET | `/health/ready` | **herkes (oturumsuz)** |
