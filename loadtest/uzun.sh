#!/usr/bin/env bash
# Uzun süre testi (gece, 2–4 saat): uzun.js yükü sürerken 5 dk'da bir ölçüm. Zamanla artan bellek, süre ya da bağlantı
# sayısı sızıntı demektir; tablolar yazma hızıyla orantılı büyümeli.
#   results/uzun-olcum.csv   zaman, yoklama süreleri (katalog / siparişler / panel), işçi belleği, DB bağlantısı, DB boyutu
#   results/uzun-tablolar.txt  başta ve sonda en büyük 12 tablo (satır sayısı, boyut)
# Bilgisayar uyumasın diye caffeinate ile:
#   caffeinate -ims env DOCKER_NETWORK=akis_b2bsistem_default BASE_URL=http://akis_loadtest_caddy:8080 TENANT=yuktest \
#     WRITE_OK=1 ./loadtest/uzun.sh            # DURATION=3h USERS=300; ek argümanlar run.sh'a geçer
set -uo pipefail
cd "$(dirname "$0")/.."
DOCKER="${DOCKER:-docker}"
command -v "$DOCKER" >/dev/null 2>&1 || for app in /Applications/Docker*.app; do [ -x "$app/Contents/Resources/bin/docker" ] && DOCKER="$app/Contents/Resources/bin/docker"; done
BACKEND="${BACKEND_CONTAINER:-akis_loadtest_backend}"
DB="${DB_CONTAINER:-akis_b2bsistem-db-1}"
EVERY="${EVERY:-300}"
CSV=loadtest/results/uzun-olcum.csv
TABLES=loadtest/results/uzun-tablolar.txt
mkdir -p loadtest/results

"$DOCKER" inspect "$BACKEND" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -q '^DATABASE_URL=.*/akis_load$' \
  || { echo "Güvenlik: $BACKEND akis_load veritabanını kullanmıyor."; exit 1; }

psql() { "$DOCKER" exec "$DB" psql -U akis -d akis_load -Atc "$1"; }
tables() {
  echo "== $1 ($(date '+%H:%M'))"
  psql "select relname, n_live_tup, pg_size_pretty(pg_total_relation_size(relid)) from pg_stat_user_tables order by pg_total_relation_size(relid) desc limit 12" | column -t -s '|'
}
measure() {
  local probe conns size
  probe=$("$DOCKER" exec -e TENANT="${TENANT:-yuktest}" "$BACKEND" node /loadtest/seed/yoklama.mjs 2>/dev/null | tail -1)
  conns=$(psql "select count(*) from pg_stat_activity where datname = 'akis_load'")
  size=$(psql "select pg_database_size('akis_load') / 1024 / 1024")
  echo "$(date '+%H:%M:%S'),${probe:-,,,,,},$conns,$size" >> "$CSV"
}

echo "zaman,katalog_ms,siparisler_ms,panel_ms,isci_bellek_mb,en_cok_isci_mb,isci_sayisi,db_baglanti,db_boyut_mb" > "$CSV"
tables "başlangıç" > "$TABLES"
measure

./loadtest/run.sh uzun "$@" > loadtest/results/uzun.out 2>&1 &
K6=$!
while kill -0 "$K6" 2>/dev/null; do
  for _ in $(seq "$EVERY"); do kill -0 "$K6" 2>/dev/null || break; sleep 1; done
  measure
done
wait "$K6"
CODE=$?
sleep 60 # yük bittikten sonra bellek ve bağlantılar inmeli
measure
tables "son" >> "$TABLES"
echo "k6 çıkış: $CODE"
cat "$CSV"
exit $CODE
