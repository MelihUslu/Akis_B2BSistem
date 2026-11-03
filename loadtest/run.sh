#!/usr/bin/env bash
# k6 yük testlerini Docker ile çalıştırır (k6 kurulumu gerekmez).
#   ./loadtest/run.sh smoke            # 1 kullanıcı, 30 sn
#   ./loadtest/run.sh load             # 50 kullanıcıya kadar (PEAK=… HOLD=…)
#   ./loadtest/run.sh stress           # 200 kullanıcıya kadar (PEAK=…)
#   ./loadtest/run.sh spike            # ani yük (PEAK=…)
#   WRITE_OK=1 TENANT=yuktest ./loadtest/run.sh order-write   # VERİ YAZAR, yalnızca test firmasında
# Oturum: ADMIN_TOKEN / DEALER_TOKEN ya da ADMIN_EMAIL + ADMIN_PASSWORD, DEALER_EMAIL + DEALER_PASSWORD
# Hedef: BASE_URL (varsayılan yerel backend http://host.docker.internal:5001), TENANT (varsayılan akis), DOCKER_NETWORK (isteğe bağlı)
set -euo pipefail
cd "$(dirname "$0")"
TEST="${1:-smoke}"
[ -f "$TEST.js" ] || { echo "Bilinmeyen test: $TEST (smoke, load, stress, spike, order-write)"; exit 1; }
shift || true
mkdir -p results
# docker PATH'te yoksa Docker Desktop'ın kendi klasörü (kimlik yardımcısı da orada) kullanılır
if [ -z "${DOCKER:-}" ]; then
  if command -v docker >/dev/null 2>&1; then DOCKER=docker
  else
    for app in "/Applications/Docker.app" /Applications/Docker*.app; do
      [ -x "$app/Contents/Resources/bin/docker" ] && { DOCKER="$app/Contents/Resources/bin/docker"; break; }
    done
  fi
fi
[ -n "${DOCKER:-}" ] || { echo "Docker bulunamadı. Docker Desktop'ı kurun ya da DOCKER=/yol/docker verin."; exit 1; }
export PATH="$(dirname "$DOCKER"):$PATH"
ENVS=(-e TEST_NAME="$TEST" -e BASE_URL="${BASE_URL:-http://host.docker.internal:5001}")
for v in TENANT ADMIN_TOKEN DEALER_TOKEN ADMIN_EMAIL ADMIN_PASSWORD DEALER_EMAIL DEALER_PASSWORD PEAK HOLD DURATION RATE WRITE_OK ALLOW_DEFAULT_TENANT; do
  [ -n "${!v:-}" ] && ENVS+=(-e "$v=${!v}")
done
# DOCKER_NETWORK: k6 backend'le aynı Docker ağında çalışır (Mac'in port yönlendirmesi devre dışı kalır), ör.
#   DOCKER_NETWORK=akis_b2bsistem_default BASE_URL=http://backend:5001 ./loadtest/run.sh load
NET=()
[ -n "${DOCKER_NETWORK:-}" ] && NET=(--network "$DOCKER_NETWORK")
exec "$DOCKER" run --rm -i "${NET[@]}" --add-host=host.docker.internal:host-gateway -v "$PWD":/scripts -w /scripts "${ENVS[@]}" grafana/k6:0.54.0 run "$TEST.js" "$@"
