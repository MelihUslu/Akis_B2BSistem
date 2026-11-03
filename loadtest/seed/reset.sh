#!/usr/bin/env bash
# Yük testi veritabanını (akis_load) sıfırlar ve tabloları kurar. Geliştirme veritabanına dokunmaz.
set -euo pipefail
DOCKER="${DOCKER:-docker}"
DB="${DB_CONTAINER:-akis_b2bsistem-db-1}"
"$DOCKER" exec "$DB" psql -U akis -d postgres -c "drop database if exists akis_load with (force)" -c "create database akis_load"
"$DOCKER" exec -e DATABASE_URL=postgresql://akis:akis_dev_password@db:5432/akis_load -w /app akis_loadtest_backend npx prisma migrate deploy
