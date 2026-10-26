#!/bin/sh
set -e

echo "--- [Entrypoint] Prisma migration deploy başlatılıyor..."
npx prisma migrate deploy

echo "--- [Entrypoint] Seed kontrol ediliyor..."
# Seed'i sadece ilk kurulumda (paket tablosu boşken) çalıştır
USER_COUNT=$(node prisma/check-empty.js | tail -n 1)

if [ "$USER_COUNT" = "0" ]; then
  echo "--- [Entrypoint] Veritabanı boş. Seed çalıştırılıyor..."
  node prisma/seed.js
  echo "--- [Entrypoint] Seed tamamlandı."
else
  echo "--- [Entrypoint] Veritabanında $USER_COUNT paket mevcut. Seed atlanıyor."
fi

echo "--- [Entrypoint] Uygulama başlatılıyor..."
exec "$@"
