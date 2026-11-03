#!/usr/bin/env bash
# Test sırasında sunucu kaynaklarını kaydeder: CPU / bellek (docker stats) ve veritabanı bağlantı sayısı.
#   ./loadtest/monitor.sh results/izleme-scale.csv &   (testten önce başlatın, sonra durdurun)
set -uo pipefail
OUT="${1:-results/izleme.csv}"
DOCKER="${DOCKER:-docker}"
BACKEND="${BACKEND_CONTAINER:-akis_loadtest_backend}"
DB="${DB_CONTAINER:-akis_b2bsistem-db-1}"
mkdir -p "$(dirname "$OUT")"
echo "zaman,backend_cpu,backend_bellek,db_cpu,db_bellek,db_baglanti,db_aktif" > "$OUT"
while true; do
  STATS=$("$DOCKER" stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}}' "$BACKEND" "$DB" 2>/dev/null)
  B=$(echo "$STATS" | awk -v n="$BACKEND" '$1==n {print $2","$3}')
  D=$(echo "$STATS" | awk -v n="$DB" '$1==n {print $2","$3}')
  C=$("$DOCKER" exec "$DB" psql -U akis -d postgres -At -c "select count(*), count(*) filter (where state='active') from pg_stat_activity where datname='akis_load'" 2>/dev/null | tr '|' ',')
  echo "$(date +%H:%M:%S),$B,$D,$C" >> "$OUT"
  sleep 5
done
