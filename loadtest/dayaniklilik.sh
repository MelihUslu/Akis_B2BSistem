#!/usr/bin/env bash
# Dayanıklılık testi: dayaniklilik.js yükü sürerken sırayla kesintiler. Yalnızca yük testi ortamına dokunur:
#   60. sn   akis_loadtest_backend içinde bir işçi süreç öldürülür (kill -9; cluster yenisini başlatır)
#   150. sn  akis_loadtest_redis yeniden başlatılır (yük testine ayrılmış Redis; geliştirme Redis'i değil)
#   240. sn  akis_load veritabanına 15 sn bağlantı kapatılır ve açık bağlantılar kesilir (Postgres sunucusu durmaz)
# Olay zamanları results/dayaniklilik-olaylar.txt'ye yazılır. Ek argümanlar run.sh'a geçer (ör. --out json=/out/x.jsonl).
#   DOCKER_NETWORK=akis_b2bsistem_default BASE_URL=http://akis_loadtest_backend:5001 TENANT=yuktest ./loadtest/dayaniklilik.sh
# Hazırlık (bir kez): ayrı Redis ve REDIS_URL'si ona bakan yük testi backend'i (README → Dayanıklılık).
set -uo pipefail
cd "$(dirname "$0")/.."
DOCKER="${DOCKER:-docker}"
command -v "$DOCKER" >/dev/null 2>&1 || for app in /Applications/Docker*.app; do [ -x "$app/Contents/Resources/bin/docker" ] && DOCKER="$app/Contents/Resources/bin/docker"; done
BACKEND="${BACKEND_CONTAINER:-akis_loadtest_backend}"
REDIS="${REDIS_CONTAINER:-akis_loadtest_redis}"
DB="${DB_CONTAINER:-akis_b2bsistem-db-1}"
LOG=loadtest/results/dayaniklilik-olaylar.txt
mkdir -p loadtest/results

# Güvenlik: backend yük testi veritabanını ve ayrı Redis'i kullanmalı (geliştirme Redis'i yeniden başlatılmasın)
ENV=$("$DOCKER" inspect "$BACKEND" --format '{{range .Config.Env}}{{println .}}{{end}}')
echo "$ENV" | grep -q '^DATABASE_URL=.*/akis_load$' || { echo "Güvenlik: $BACKEND akis_load veritabanını kullanmıyor."; exit 1; }
echo "$ENV" | grep -q "^REDIS_URL=redis://$REDIS" || { echo "Güvenlik: $BACKEND REDIS_URL'si $REDIS'e bakmıyor (README → Dayanıklılık)."; exit 1; }

psql() { "$DOCKER" exec "$DB" psql -U akis -d postgres -Atc "$1"; }
reopen() { psql "ALTER DATABASE akis_load ALLOW_CONNECTIONS true" >/dev/null; }
trap reopen EXIT # yarıda kesilse de veritabanı yeniden açılır
mark() { echo "$(date -u +%H:%M:%S) $*" | tee -a "$LOG"; }

: > "$LOG"
mark "yük başladı"
./loadtest/run.sh dayaniklilik "$@" &
K6=$!

sleep 60
# İşçi süreçler: komut satırında src/server.js olan ve ebeveyni de server.js olan süreçler; en yenisi öldürülür
W=$("$DOCKER" exec "$BACKEND" sh -c 'for p in /proc/[0-9]*; do c=$(tr "\0" " " < $p/cmdline 2>/dev/null); case "$c" in *src/server.js*) echo "${p#/proc/} $(cut -d" " -f4 $p/stat)";; esac; done' \
  | awk '{pid[$1]=1; pp[$1]=$2} END {for (p in pp) if (pid[pp[p]]) print p}' | sort -n | tail -1)
mark "işçi süreç $W öldürülüyor"
"$DOCKER" exec "$BACKEND" kill -9 "$W"

sleep 90
mark "Redis yeniden başlatılıyor"
"$DOCKER" restart "$REDIS" >/dev/null
mark "Redis açıldı"

sleep 88
mark "veritabanı bağlantıları kapatılıyor ($(psql "ALTER DATABASE akis_load ALLOW_CONNECTIONS false; SELECT count(pg_terminate_backend(pid)) FROM pg_stat_activity WHERE datname = 'akis_load'" | tail -1) bağlantı kesildi)"
sleep 15
reopen
mark "veritabanı yeniden açıldı"

wait "$K6"
CODE=$?
mark "yük bitti (k6 çıkış: $CODE)"
"$DOCKER" logs --since 8m "$BACKEND" 2>&1 | grep -E "Cluster|kapandı|Redis|redis" | tail -10
exit $CODE
