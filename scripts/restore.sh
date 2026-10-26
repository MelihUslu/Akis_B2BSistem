#!/bin/sh
# Yedekten geri yükleme. DİKKAT: hedef veritabanındaki mevcut veri silinir.
#   docker compose exec backup /scripts/restore.sh /backups/db-20261030-030000.dump [hedef_veritabani]
# Hedef verilmezse PGDATABASE kullanılır. Önce farklı bir veritabanına yükleyip kontrol etmeniz önerilir.
set -eu
FILE="${1:?Kullanım: restore.sh <yedek.dump> [hedef_veritabani]}"
TARGET="${2:-$PGDATABASE}"
[ -f "$FILE" ] || { echo "Yedek bulunamadı: $FILE"; exit 1; }

if ! psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$TARGET'" | grep -q 1; then
  createdb "$TARGET"
fi
pg_restore --clean --if-exists --no-owner --no-acl -d "$TARGET" "$FILE"
echo "[geri yükleme] $FILE → $TARGET tamamlandı"
