#!/bin/sh
# Veritabanı + yüklenen dosyaların yedeği. Docker Compose "backup" servisi her gün çalıştırır;
# elle almak için:  docker compose exec backup /scripts/backup.sh
# Ortam: PGHOST PGUSER PGPASSWORD PGDATABASE, BACKUP_DIR (/backups), BACKUP_KEEP_DAYS (14), UPLOADS_DIR (/uploads)
#        BACKUP_POST_CMD: yedekten sonra çalışacak komut (ör. sunucu dışına kopya; bkz. docs/canliya-cikis.md)
set -eu
BACKUP_DIR="${BACKUP_DIR:-/backups}"
KEEP="${BACKUP_KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Özel biçim (-Fc): sıkıştırılmış, pg_restore ile tablo tablo geri yüklenebilir
pg_dump -Fc --no-owner --no-acl -f "$BACKUP_DIR/db-$STAMP.dump.tmp"
# Doğrulama: yedek okunabiliyor ve tablo verisi içeriyor mu? (bozuk dosya "başarılı" sayılmasın)
TABLES="$(pg_restore --list "$BACKUP_DIR/db-$STAMP.dump.tmp" | grep -c 'TABLE DATA' || true)"
if [ "${TABLES:-0}" -lt 10 ]; then
  echo "[yedek] HATA: yedek doğrulanamadı ($TABLES tablo verisi)"; rm -f "$BACKUP_DIR/db-$STAMP.dump.tmp"; exit 1
fi
mv "$BACKUP_DIR/db-$STAMP.dump.tmp" "$BACKUP_DIR/db-$STAMP.dump"

# Yüklenen dosyalar: ürün görselleri, destek ekleri ve cari belgeleri (uploads/private dahil)
if [ -d "${UPLOADS_DIR:-/uploads}" ]; then
  tar -czf "$BACKUP_DIR/uploads-$STAMP.tar.gz.tmp" -C "${UPLOADS_DIR:-/uploads}" .
  mv "$BACKUP_DIR/uploads-$STAMP.tar.gz.tmp" "$BACKUP_DIR/uploads-$STAMP.tar.gz"
fi

# Eski yedekleri sil
find "$BACKUP_DIR" -name 'db-*.dump' -mtime +"$KEEP" -delete
find "$BACKUP_DIR" -name 'uploads-*.tar.gz' -mtime +"$KEEP" -delete

echo "[yedek] $(date '+%F %T') db-$STAMP.dump ($(du -h "$BACKUP_DIR/db-$STAMP.dump" | cut -f1), $TABLES tablo)"

# Sunucu dışı kopya (isteğe bağlı). Komut başarısız olursa hata verilir; yerel yedek yine durur.
if [ -n "${BACKUP_POST_CMD:-}" ]; then
  echo "[yedek] Sunucu dışı kopya: çalıştırılıyor"
  sh -c "$BACKUP_POST_CMD" || { echo "[yedek] HATA: sunucu dışı kopya başarısız"; exit 2; }
fi
