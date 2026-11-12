#!/usr/bin/env bash
# Rebuild app/db/init/02-seed.sql and app/db/DATA_REPORT.md from the legacy dump.
# Requires only Docker. Usage: app/db/tools/build_seed.sh
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DB="$(dirname "$HERE")"
ROOT="$(cd "$APP_DB/../.." && pwd)"
DUMP="$ROOT/Docs/1-Mysql/megalitos.sql"
GPX="$ROOT/Docs/Megalitos de Navarra.gpx"
IMAGES="${IMAGES_DIR:-$ROOT/Megalitos/src/public/img/141208_Megalitos}"
WORK="$(mktemp -d)"
C=megalitos-data-tmp-src
cleanup() { docker rm -f "$C" >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

docker rm -f "$C" >/dev/null 2>&1 || true
docker run -d --name "$C" -e MARIADB_ROOT_PASSWORD=x -e MARIADB_DATABASE=megalitos \
  -v "$DUMP:/docker-entrypoint-initdb.d/a.sql:ro" mariadb:11.4 >/dev/null
# wait for the init (temporary server) to finish: the real server logs "ready for connections" twice
for _ in $(seq 1 60); do
  [ "$(docker logs "$C" 2>&1 | grep -c 'ready for connections')" -ge 2 ] && break; sleep 1
done
export_tbl() { docker exec "$C" mariadb -uroot -px megalitos --default-character-set=utf8mb4 --batch -e "select * from $1 order by 1" > "$WORK/$1.tsv"; }
export_tbl fichas; export_tbl clasificacion
docker rm -f "$C" >/dev/null

docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp -e PATH=/tmp/.local/bin:/usr/local/bin:/usr/bin:/bin -v "$WORK:/work" -v "$HERE:/tools:ro" -v "$GPX:/in/m.gpx:ro" -v "$IMAGES:/in/img:ro" \
  -v "$APP_DB/init:/out/init" -v "$APP_DB:/out/db" -w /work python:3.12-slim sh -c \
  "pip install -q --no-cache-dir --user pyproj==3.7.* >/dev/null 2>&1 && python /tools/build_seed.py \
   --fichas fichas.tsv --clasificacion clasificacion.tsv --gpx /in/m.gpx --images /in/img \
   --out-sql /out/init/02-seed.sql --out-report /out/db/DATA_REPORT.md"
