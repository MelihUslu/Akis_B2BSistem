#!/usr/bin/env bash
# UAT (kullanıcı kabul testleri): ayrı ortamı sıfırdan kurar ve senaryoları gerçek tarayıcıda çalıştırır.
# Geliştirme veritabanına, yüklemelerine ve oturumlarına dokunmaz:
#   veritabanı akis_uat · backend kopyası akis_uat_backend (port 5002) · Redis 6. veritabanı · frontend canlı derlemesi (port 5174)
#
#   ./uat/run.sh                      # hepsi
#   ./uat/run.sh tests/siparis.spec.mjs --headed
#   ./uat/run.sh --ui                 # Playwright arayüzüyle adım adım
#   UAT_BROWSER=webkit ./uat/run.sh   # Safari motoruyla (iPhone'daki tarayıcılar); bir kez: npx --prefix uat playwright install webkit
# Ek argümanlar olduğu gibi Playwright'a geçer. Rapor: npx --prefix uat playwright show-report uat/.data/report
set -euo pipefail
cd "$(dirname "$0")"
UAT="$PWD"
ROOT="$(cd .. && pwd)"
DOCKER="${DOCKER:-docker}"
DB="${DB_CONTAINER:-akis_b2bsistem-db-1}"
DEV_BACKEND="${DEV_BACKEND:-akis_b2bsistem-backend-1}"
REDIS="${REDIS_CONTAINER:-akis_b2bsistem-redis-1}"
NET="${DOCKER_NETWORK:-akis_b2bsistem_default}"
NAME=akis_uat_backend
API_PORT=5002
WEB_PORT=5174
# Firma alt alan adıyla açılır (uat.localhost). WebKit macOS'ta *.localhost'u çözemez: lvh.me (*.lvh.me → 127.0.0.1)
[ "${UAT_BROWSER:-}" = webkit ] && : "${UAT_HOST:=lvh.me}"
export UAT_HOST="${UAT_HOST:-localhost}"

mkdir -p .data
[ -f .data/secret ] || openssl rand -hex 24 > .data/secret

# Geliştirme backend'inin bağlantı adresinden yalnızca veritabanı adı değiştirilir
DEV_URL="$("$DOCKER" exec "$DEV_BACKEND" printenv DATABASE_URL)"
UAT_URL="$(printf '%s' "$DEV_URL" | sed -E 's#/[^/?]+(\?.*)?$#/akis_uat\1#')"
case "$UAT_URL" in */akis_uat|*/akis_uat\?*) ;; *) echo "UAT veritabanı adresi üretilemedi: $UAT_URL" >&2; exit 1 ;; esac

echo "▸ Ortam sıfırlanıyor (akis_uat, Redis 6)"
"$DOCKER" rm -f "$NAME" >/dev/null 2>&1 || true
"$DOCKER" exec -e PGOPTIONS='-c client_min_messages=warning' "$DB" sh -c 'psql -q -U "$POSTGRES_USER" -d postgres -c "drop database if exists akis_uat with (force)" -c "create database akis_uat"'
"$DOCKER" exec "$REDIS" redis-cli -n 6 flushdb >/dev/null # giriş deneme sayaçları

echo "▸ Backend kopyası başlatılıyor (tablolar + test verisi)"
NM="$("$DOCKER" inspect "$DEV_BACKEND" --format '{{range .Mounts}}{{if eq .Destination "/app/node_modules"}}{{.Name}}{{end}}{{end}}')"
IMAGE="$("$DOCKER" inspect "$DEV_BACKEND" --format '{{.Config.Image}}')"
# /app/uploads geçici bellekte: testte yüklenen dosyalar geliştirme klasörüne yazılmaz
"$DOCKER" run -d --name "$NAME" --network "$NET" -p "$API_PORT:5001" \
  -v "$ROOT/backend:/app" -v "$NM:/app/node_modules:ro" -v "$UAT:/uat:ro" --tmpfs /app/uploads -w /app \
  -e DATABASE_URL="$UAT_URL" -e JWT_SECRET="$(cat .data/secret)" -e PORT=5001 -e TZ=Europe/Istanbul \
  -e ROOT_DOMAIN="$UAT_HOST" -e FRONTEND_PORT="$WEB_PORT" -e REDIS_URL=redis://redis:6379/6 \
  "$IMAGE" sh -c 'npx prisma migrate deploy >/dev/null && node /uat/seed.mjs && exec node src/server.js' >/dev/null
# Bitince backend günlüğü .data/backend.log'a yazılır ve kopya kapatılır (UAT_KEEP=1: açık kalır, veriye bakılabilir)
cleanup() { "$DOCKER" logs "$NAME" > .data/backend.log 2>&1 || true; [ "${UAT_KEEP:-}" = 1 ] || "$DOCKER" rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "▸ Frontend derleniyor (canlı derleme, API → :$API_PORT)"
(cd "$ROOT/frontend" && VITE_API_URL="http://localhost:$API_PORT/api" VITE_ROOT_DOMAIN="$UAT_HOST" VITE_DEFAULT_TENANT= \
  npx vite build --outDir "$UAT/.data/web" --emptyOutDir --logLevel error)

[ -d node_modules/@playwright/test ] || npm ci --no-audit --no-fund --loglevel error

printf '▸ Backend bekleniyor'
for _ in $(seq 1 60); do
  curl -sf "http://localhost:$API_PORT/health/ready" >/dev/null 2>&1 && break
  if [ "$("$DOCKER" inspect -f '{{.State.Running}}' "$NAME")" != true ]; then echo; "$DOCKER" logs --tail 30 "$NAME"; exit 1; fi
  printf '.'; sleep 1
done
echo
curl -sf "http://localhost:$API_PORT/health/ready" >/dev/null || { echo "Backend 60 sn'de hazır olmadı." >&2; "$DOCKER" logs --tail 30 "$NAME"; exit 1; }
# Oturumlar giriş ucu çağrılmadan imzalanır (giriş ucunun deneme sınırına takılmamak için); kimlikler tohumlamadan gelir
"$DOCKER" logs "$NAME" 2>&1 | sed -n 's/^UAT_USERS //p' > .data/users.json
"$DOCKER" logs "$NAME" 2>&1 | grep 'UAT verisi' || true

echo "▸ Senaryolar"
npx playwright test "$@"
