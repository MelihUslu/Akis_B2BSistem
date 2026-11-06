#!/bin/sh
# Google Drive'a şifreli yedek: bir kez kurulur (docs/canliya-cikis.md → 6. Yedekleme).
#  1) Tarayıcısı olan bir bilgisayarda (Mac: brew install rclone):
#       rclone authorize "drive" "eyJzY29wZSI6ImRyaXZlLmZpbGUifQ"
#     Yedeklerin gideceği Google hesabıyla giriş yapın; ekrana yazılan {"access_token":...} satırını kopyalayın.
#     (drive.file izni: rclone Drive'da yalnızca kendi oluşturduğu dosyaları görür, diğer dosyalarınıza erişemez)
#  2) Sunucuda, proje klasöründe:
#       docker compose -f docker-compose.prod.yml exec backup /scripts/drive-setup.sh '<kopyalanan satır>'
# Yedekler şifrelenir; şifre ekrana bir kez yazılır. Parola yöneticisine kaydedin: sunucu kaybolursa Drive'daki
# yedekleri yalnızca bu şifreyle açabilirsiniz.
# Yeni sunucuda eski yedeklere bağlanmak:  ... exec -e YEDEK_SIFRESI='<şifre>' backup /scripts/drive-setup.sh '<satır>'
# Google girişi geçersiz olduysa (şifre değişmez):  ... exec backup /scripts/drive-setup.sh '<yeni satır>' --yenile
set -eu
TOKEN="${1:-}"
[ -n "$TOKEN" ] || { sed -n '2,12p' "$0"; exit 1; }
CONF="${RCLONE_CONFIG:-/config/rclone.conf}"
REMOTE="${BACKUP_DRIVE_REMOTE:-yedek}"
FOLDER="${BACKUP_DRIVE_FOLDER:-Akis-B2B-Yedek}"
mkdir -p "$(dirname "$CONF")"

if rclone listremotes 2>/dev/null | grep -qx "$REMOTE:"; then
  [ "${2:-}" = "--yenile" ] || { echo "Google Drive yedeği zaten kurulu ($CONF). Yalnızca Google girişini yenilemek için sona --yenile ekleyin."; exit 1; }
  rclone config update gdrive token="$TOKEN" --non-interactive > /dev/null
  echo "Google girişi yenilendi."
else
  PASSWORD="${YEDEK_SIFRESI:-$(head -c 48 /dev/urandom | base64 | tr -d '/+=\n' | cut -c1-32)}"
  rclone config create gdrive drive scope=drive.file use_trash=false token="$TOKEN" --non-interactive > /dev/null
  rclone config create "$REMOTE" crypt remote="gdrive:$FOLDER" password="$PASSWORD" --non-interactive > /dev/null
  chmod 600 "$CONF"
fi

echo "▸ Deneme: şifreli dosya yüklenip geri okunuyor"
T="deneme-$(date +%s).txt"
echo "Akis B2B yedek denemesi $(date '+%F %T')" > "/tmp/$T"
rclone copyto "/tmp/$T" "$REMOTE:$T"
rclone cat "$REMOTE:$T"
rclone deletefile "$REMOTE:$T"
rm -f "/tmp/$T"
echo "✓ Google Drive bağlandı: Drive'da '$FOLDER' klasörü. Bir sonraki yedekten itibaren kopyalar oraya gider"
echo "  (hemen denemek için: docker compose -f docker-compose.prod.yml exec backup /scripts/backup.sh)."
if [ -z "${YEDEK_SIFRESI:-}" ] && [ -n "${PASSWORD:-}" ]; then
  printf '\nYEDEK ŞİFRESİ (bir kez gösterilir; parola yöneticisine kaydedin, kaybolursa Drive yedekleri açılamaz):\n  %s\n' "$PASSWORD"
fi
