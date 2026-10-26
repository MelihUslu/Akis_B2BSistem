#!/bin/sh
# Veritabanı + yüklenen dosyaların yedeği. Docker Compose "backup" servisi her gün çalıştırır;
# elle almak için:  docker compose exec backup /scripts/backup.sh
# Ortam: PGHOST PGUSER PGPASSWORD PGDATABASE, BACKUP_DIR (/backups), BACKUP_KEEP_DAYS (14), UPLOADS_DIR (/uploads)
set -eu
BACKUP_DIR="${BACKUP_DIR:-/backups}"
KEEP="${BACKUP_KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Özel biçim (-Fc): sıkıştırılmış, pg_restore ile tablo tablo geri yüklenebilir
pg_dump -Fc --no-owner --no-acl -f "$BACKUP_DIR/db-$STAMP.dump.tmp"
mv "$BACKUP_DIR/db-$STAMP.dump.tmp" "$BACKUP_DIR/db-$STAMP.dump"

if [ -d "${UPLOADS_DIR:-/uploads}" ]; then
  tar -czf "$BACKUP_DIR/uploads-$STAMP.tar.gz" -C "${UPLOADS_DIR:-/uploads}" .
fi

# Eski yedekleri sil
find "$BACKUP_DIR" -name 'db-*.dump' -mtime +"$KEEP" -delete
find "$BACKUP_DIR" -name 'uploads-*.tar.gz' -mtime +"$KEEP" -delete

echo "[yedek] $(date '+%F %T') db-$STAMP.dump ($(du -h "$BACKUP_DIR/db-$STAMP.dump" | cut -f1))"
