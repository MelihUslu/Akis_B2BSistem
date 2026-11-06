#!/bin/sh
# Veritabanı + yüklenen dosyaların yedeği ve (kuruluysa) Google Drive'a şifreli kopyası. Docker Compose "backup" servisi
# açılışta ve her gün BACKUP_TIME'da (03:00) çalıştırır; elle almak için:  docker compose exec backup /scripts/backup.sh
# Ortam: PGHOST PGUSER PGPASSWORD PGDATABASE, BACKUP_DIR (/backups), BACKUP_KEEP_DAYS (14), UPLOADS_DIR (/uploads)
#        Google Drive (bir kez: scripts/drive-setup.sh): BACKUP_DRIVE_REMOTE (yedek), BACKUP_DRIVE_KEEP_DAYS (30),
#        BACKUP_DRIVE_KEEP_MONTHS (12)
#        BACKUP_POST_CMD: yedekten sonra çalışacak ek komut (isteğe bağlı)
# Her çalışma BACKUP_DIR/.yedek-gecmisi.jsonl'a bir satır yazar: Platform → Yedekler ve günlük özet e-postası okur.
# Argüman: tetikleyen (acilis | zamanli; boşsa elle)
set -eu
BACKUP_DIR="${BACKUP_DIR:-/backups}"
UPLOADS="${UPLOADS_DIR:-/uploads}"
KEEP="${BACKUP_KEEP_DAYS:-14}"
REMOTE="${BACKUP_DRIVE_REMOTE:-yedek}"
DRIVE_DAYS="${BACKUP_DRIVE_KEEP_DAYS:-30}"
DRIVE_MONTHS="${BACKUP_DRIVE_KEEP_MONTHS:-12}"
TRIGGER="${1:-elle}"
STAMP="$(date +%Y%m%d-%H%M%S)"
STARTED="$(date -Iseconds)"
HISTORY="$BACKUP_DIR/.yedek-gecmisi.jsonl"
mkdir -p "$BACKUP_DIR"
LOG="$(mktemp)"

# ─── Geçmiş kaydı ────────────────────────────────────────────────────────────
STEP="Başlangıç"; ERROR=""
DB_FILE=""; DB_SIZE=0; TABLES=0; UP_FILE=""; UP_SIZE=0; UP_COUNT=0
DRIVE="kapali"; DRIVE_ERROR=""; DRIVE_LINK=""; MONTHLY_LINK=""; FOLDER_LINK=""; SYNCED=0
# JSON metni: tırnak, ters bölü ve satır sonları atılır
clean() { printf '%s' "$1" | tr -d '"\\\r' | tr '\n' ' ' | cut -c1-300; }
lastError() { grep -E 'ERROR|CRITICAL|Failed|error|FATAL' "$LOG" 2>/dev/null | tail -1 | sed -E 's#^[0-9/]+ [0-9:]+ ##' || true; }
finish() {
  code=$?
  ok=true
  if [ "$code" -ne 0 ]; then ok=false; [ -n "$ERROR" ] || ERROR="$STEP başarısız: $(lastError)"; fi
  printf '{"start":"%s","end":"%s","trigger":"%s","ok":%s,"error":"%s","db":{"file":"%s","size":%s,"tables":%s},"uploads":{"file":"%s","size":%s,"count":%s},"drive":{"status":"%s","error":"%s","link":"%s","monthlyLink":"%s","folderLink":"%s","synced":%s},"keep":{"local":%s,"drive":%s,"months":%s},"time":"%s"}\n' \
    "$STARTED" "$(date -Iseconds)" "$TRIGGER" "$ok" "$(clean "$ERROR")" \
    "$DB_FILE" "$DB_SIZE" "${TABLES:-0}" "$UP_FILE" "$UP_SIZE" "$UP_COUNT" \
    "$DRIVE" "$(clean "$DRIVE_ERROR")" "$DRIVE_LINK" "$MONTHLY_LINK" "$FOLDER_LINK" "$SYNCED" \
    "$KEEP" "$DRIVE_DAYS" "$DRIVE_MONTHS" "${BACKUP_TIME:-03:00}" >> "$HISTORY"
  tail -n 500 "$HISTORY" > "$HISTORY.tmp" && mv "$HISTORY.tmp" "$HISTORY" # son 500 çalışma
  rm -f "$LOG"
}
trap finish EXIT

# Drive kuruluysa durum önce "atlandi": yerel yedek başarısız olursa Drive adımına sıra gelmez
DRIVE_ON=""
if command -v rclone >/dev/null 2>&1 && rclone listremotes 2>/dev/null | grep -qx "$REMOTE:"; then DRIVE_ON=1; DRIVE="atlandi"; fi

# ─── Yerel yedek ─────────────────────────────────────────────────────────────
# Özel biçim (-Fc): sıkıştırılmış, pg_restore ile tablo tablo geri yüklenebilir
STEP="Veritabanı yedeği"
pg_dump -Fc --no-owner --no-acl -f "$BACKUP_DIR/db-$STAMP.dump.tmp" 2> "$LOG" || { rm -f "$BACKUP_DIR/db-$STAMP.dump.tmp"; exit 1; }
# Doğrulama: yedek okunabiliyor ve tablo verisi içeriyor mu? (bozuk dosya "başarılı" sayılmasın)
TABLES="$(pg_restore --list "$BACKUP_DIR/db-$STAMP.dump.tmp" 2> "$LOG" | grep -c 'TABLE DATA' || true)"
if [ "${TABLES:-0}" -lt 10 ]; then
  ERROR="Yedek doğrulanamadı (${TABLES:-0} tablo verisi)"; echo "[yedek] HATA: $ERROR"; rm -f "$BACKUP_DIR/db-$STAMP.dump.tmp"; exit 1
fi
mv "$BACKUP_DIR/db-$STAMP.dump.tmp" "$BACKUP_DIR/db-$STAMP.dump"
DB_FILE="db-$STAMP.dump"; DB_SIZE="$(stat -c %s "$BACKUP_DIR/$DB_FILE")"

# Yüklenen dosyalar: ürün görselleri, destek ekleri ve cari belgeleri (uploads/private dahil)
if [ -d "$UPLOADS" ]; then
  STEP="Dosya arşivi"
  tar -czf "$BACKUP_DIR/uploads-$STAMP.tar.gz.tmp" -C "$UPLOADS" . 2> "$LOG"
  mv "$BACKUP_DIR/uploads-$STAMP.tar.gz.tmp" "$BACKUP_DIR/uploads-$STAMP.tar.gz"
  UP_FILE="uploads-$STAMP.tar.gz"; UP_SIZE="$(stat -c %s "$BACKUP_DIR/$UP_FILE")"; UP_COUNT="$(find "$UPLOADS" -type f | wc -l | tr -d ' ')"
fi

# Eski yedekleri sil
STEP="Eski yedeklerin silinmesi"
find "$BACKUP_DIR" -name 'db-*.dump' -mtime +"$KEEP" -delete
find "$BACKUP_DIR" -name 'uploads-*.tar.gz' -mtime +"$KEEP" -delete

echo "[yedek] $(date '+%F %T') $DB_FILE ($(du -h "$BACKUP_DIR/$DB_FILE" | cut -f1), $TABLES tablo)"

# ─── Google Drive'a şifreli kopya ────────────────────────────────────────────
# gunluk/: her günün veritabanı yedeği (BACKUP_DRIVE_KEEP_DAYS gün) · aylik/: her ayın ilk yedeği (BACKUP_DRIVE_KEEP_MONTHS ay)
# dosyalar/: yüklenen dosyalar eşitlenir (yalnızca değişenler gider); değişen / silinen dosyanın eski hâli
# dosyalar-eski/<zaman>/ altında BACKUP_DRIVE_KEEP_DAYS gün durur. İçerik ve adlar şifrelidir (rclone crypt).

# Drive'daki nesnenin bağlantısı (yalnızca hesabın sahibi açar; dosya şifreli, rclone ile indirilip açılır)
fileLink() {
  id="$(rclone lsjson --original --files-only "$1" --include "/$2" 2>/dev/null | sed -n 's/.*"ID":"\([^"]*\)".*/\1/p' | head -1)"
  [ -z "$id" ] || printf 'https://drive.google.com/file/d/%s/view' "$id"
  return 0
}
folderLink() {
  base="$(rclone config show "$REMOTE" 2>/dev/null | sed -n 's/^remote = //p')" # ör. gdrive:Akis-B2B-Yedek
  id="$(rclone lsjson --dirs-only "${base%%:*}:" 2>/dev/null | grep "\"Name\":\"${base#*:}\"" | sed -n 's/.*"ID":"\([^"]*\)".*/\1/p' | head -1)"
  [ -z "$id" ] || printf 'https://drive.google.com/drive/folders/%s' "$id"
  return 0
}
driveCopy() {
  R="$REMOTE:"
  STEP="Veritabanı yedeğinin yüklenmesi"
  rclone copy "$BACKUP_DIR/$DB_FILE" "${R}gunluk" > "$LOG" 2>&1 || return 1
  DRIVE_LINK="$(fileLink "${R}gunluk" "$DB_FILE")"
  if [ -z "$(rclone lsf "${R}aylik" --include "db-$(date +%Y%m)*" 2>/dev/null)" ]; then
    STEP="Aylık kopyanın yüklenmesi"
    rclone copy "$BACKUP_DIR/$DB_FILE" "${R}aylik" > "$LOG" 2>&1 || return 1
    MONTHLY_LINK="$(fileLink "${R}aylik" "$DB_FILE")"
  fi
  if [ -d "$UPLOADS" ]; then
    STEP="Dosyaların eşitlenmesi"
    rclone sync "$UPLOADS" "${R}dosyalar" --backup-dir "${R}dosyalar-eski/$STAMP" -v > "$LOG" 2>&1 || return 1
    SYNCED="$(grep -c 'Copied (' "$LOG" || true)"
  fi
  STEP="Drive'daki eski yedeklerin silinmesi"
  rclone delete "${R}gunluk" --min-age "${DRIVE_DAYS}d" > "$LOG" 2>&1 || return 1
  rclone delete "${R}aylik" --min-age "$(( DRIVE_MONTHS * 31 ))d" > "$LOG" 2>&1 || return 1
  # Dosyaların eski hâlleri klasör adındaki tarihe göre (dosyanın kendi tarihi eski olabilir)
  CUT="$(date -d "@$(( $(date +%s) - DRIVE_DAYS * 86400 ))" +%Y%m%d)"
  for d in $(rclone lsf --dirs-only "${R}dosyalar-eski" 2>/dev/null); do
    day="${d%%-*}"
    if [ "$day" -lt "$CUT" ] 2>/dev/null; then rclone purge "${R}dosyalar-eski/${d%/}" > "$LOG" 2>&1 || return 1; fi
  done
  FOLDER_LINK="$(folderLink)"
}

if [ -n "$DRIVE_ON" ]; then
  if driveCopy; then
    DRIVE="ok"
    echo "[yedek] Google Drive'a kopyalandı (dosyalardan $SYNCED değişiklik)"
  else
    DRIVE="hata"; DRIVE_ERROR="$STEP başarısız: $(lastError)"; ERROR="Google Drive kopyası: $DRIVE_ERROR"
    echo "[yedek] HATA: $ERROR"
  fi
fi

# ─── Ek komut (isteğe bağlı) ─────────────────────────────────────────────────
if [ -n "${BACKUP_POST_CMD:-}" ]; then
  STEP="Ek komut (BACKUP_POST_CMD)"
  echo "[yedek] Ek komut çalıştırılıyor"
  sh -c "$BACKUP_POST_CMD" > "$LOG" 2>&1 || { ERROR="${ERROR:+$ERROR · }Ek komut başarısız: $(lastError)"; echo "[yedek] HATA: ek komut başarısız"; exit 2; }
fi

# Yerel yedek tamam ama Drive kopyası başarısızsa hata kodu (geçmişte ve günlük özette görünür)
[ "$DRIVE" != "hata" ] || exit 2
