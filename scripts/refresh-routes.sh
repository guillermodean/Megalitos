#!/usr/bin/env bash
# Refresh the hiking-routes tables from the Geofabrik Navarra extract.
# Run on the homelab from the deploy dir (e.g. ~/dockers/megalitos):  scripts/refresh-routes.sh
#   - downloads the pbf on the host (at most once per run, skipped if the local file is < 7 days old;
#     FORCE_DOWNLOAD=1 to override)
#   - exports megalito coordinates from the DB container to a TSV
#   - runs the build container offline (no network, no DB) -> rutas.sql
#   - loads rutas.sql into MariaDB in ONE transaction (a failure leaves the live data untouched)
# Env overrides: DEPLOY_DIR, DB_CONTAINER (megalitos-db), PBF_URL, FORCE_DOWNLOAD, SKIP_BUILD_IMAGE.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="${DEPLOY_DIR:-$(dirname "$SCRIPT_DIR")}"
DB_CONTAINER="${DB_CONTAINER:-megalitos-db}"
PBF_URL="${PBF_URL:-https://download.geofabrik.de/europe/spain/navarra-latest.osm.pbf}"
IMAGE="megalitos-routes-build"
cd "$DEPLOY_DIR"

[ -f .env ] || { echo "refresh-routes: $DEPLOY_DIR/.env not found" >&2; exit 1; }
# read only the two variables we need (do not source arbitrary .env content)
envval() { grep -E "^$1=" .env | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'\$//"; }
MYSQL_PWD="$(envval MARIADB_ROOT_PASSWORD)"
DB_NAME="$(envval MARIADB_DATABASE)"; DB_NAME="${DB_NAME:-megalitos}"
[ -n "$MYSQL_PWD" ] || { echo "refresh-routes: MARIADB_ROOT_PASSWORD missing in .env" >&2; exit 1; }
export MYSQL_PWD

dbq() { docker exec -i -e MYSQL_PWD "$DB_CONTAINER" mariadb -uroot --max-allowed-packet=64M "$@"; }

OSM_DIR="$DEPLOY_DIR/data/osm"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/megalitos-routes.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$OSM_DIR"
PBF="$OSM_DIR/navarra-latest.osm.pbf"
START=$(date +%s)

# 1. download (Geofabrik courtesy: once per run, not if < 7 days old)
if [ -s "$PBF" ] && [ -z "${FORCE_DOWNLOAD:-}" ] && [ -n "$(find "$PBF" -mtime -7 -print)" ]; then
  echo "refresh-routes: local pbf is < 7 days old, skipping download"
else
  echo "refresh-routes: downloading $PBF_URL"
  curl -fsSL --retry 3 -A "megalitos-navarra-refresh (non-commercial)" -o "$PBF.part" "$PBF_URL"
  [ -s "$PBF.part" ] || { echo "refresh-routes: empty download" >&2; exit 1; }
  mv "$PBF.part" "$PBF"
fi
# keep only the last pbf
find "$OSM_DIR" -maxdepth 1 -type f -name '*.osm.pbf*' ! -name 'navarra-latest.osm.pbf' -delete

# 2. schema (idempotent) + megalito coordinates
dbq < "$DEPLOY_DIR/db/init/04-rutas-schema.sql"
dbq -N -e "SELECT id,lat,lon FROM \`$DB_NAME\`.megalitos WHERE lat IS NOT NULL AND lon IS NOT NULL ORDER BY id" > "$WORK/megalitos.tsv"
[ -s "$WORK/megalitos.tsv" ] || { echo "refresh-routes: no megalitos exported" >&2; exit 1; }

# 3. build (offline container)
if [ -z "${SKIP_BUILD_IMAGE:-}" ]; then
  docker build -q -t "$IMAGE" "$DEPLOY_DIR/tools/routes" >/dev/null
fi
docker run --rm --network none -u "$(id -u):$(id -g)" \
  -v "$OSM_DIR":/in:ro -v "$WORK":/work "$IMAGE" \
  --pbf /in/navarra-latest.osm.pbf --megalitos /work/megalitos.tsv --out /work/rutas.sql --stats /work/stats.json

# 4. atomic load (single transaction inside rutas.sql; client aborts on first error -> rollback)
dbq < "$WORK/rutas.sql"

N_RUTAS=$(dbq -N -e "SELECT COUNT(*) FROM \`$DB_NAME\`.rutas")
N_PARES=$(dbq -N -e "SELECT COUNT(*) FROM \`$DB_NAME\`.megalito_ruta")
OSM_TS=$(dbq -N -e "SELECT valor FROM \`$DB_NAME\`.rutas_meta WHERE clave='osm_timestamp'")
echo "refresh-routes: OK rutas=$N_RUTAS pares=$N_PARES osm_timestamp=$OSM_TS elapsed=$(( $(date +%s) - START ))s"
