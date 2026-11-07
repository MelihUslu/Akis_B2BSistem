-- Bayi kullanıcı yetkileri: ana kullanıcı çalışanı için fiyat, cari / ödeme, iade ve adres yetkilerini kapatabilir
ALTER TABLE "User" ADD COLUMN "dealerDeny" TEXT[] DEFAULT ARRAY[]::TEXT[];
