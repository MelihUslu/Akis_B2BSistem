-- Okunmuş eski bildirimlerin saatlik temizliği tarih aralığıyla bulur (tam tablo taraması yapmaz)

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");
