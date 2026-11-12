#!/usr/bin/env bash
# Runs the whole suite in Docker: MariaDB 11.4 (real init scripts) + node:22-alpine.
# Usage: test/run.sh            (uses ../db/init if present, else test/fixtures/db-init)
#        FIXTURE=1 test/run.sh  (force the tiny fixture DB)
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SUFFIX="$$"
NET="megalitos-be-tmp-net-$SUFFIX"
DB="megalitos-be-tmp-db-$SUFFIX"
JOB="megalitos-be-tmp-job-$SUFFIX"

INIT_DIR="$APP_DIR/db/init"
FIXTURE_FLAG=0
if [ "${FIXTURE:-0}" = "1" ] || [ ! -f "$INIT_DIR/01-schema.sql" ] || [ ! -f "$INIT_DIR/02-seed.sql" ]; then
  INIT_DIR="$APP_DIR/test/fixtures/db-init"
  FIXTURE_FLAG=1
fi

# Phase 2: assemble init dir = base init + rutas schema (real 04 if present) + rutas fixture + "no rutas" DB.
TMP_INIT="$(mktemp -d)"
cp -a "$INIT_DIR"/. "$TMP_INIT"/
[ -f "$TMP_INIT/04-rutas-schema.sql" ] || cp "$APP_DIR/test/fixtures/rutas/04-rutas-schema.sql" "$TMP_INIT/"
cp "$APP_DIR/test/fixtures/rutas/05-rutas-fixture.sql" "$APP_DIR/test/fixtures/rutas/06-norutas-db.sh" "$TMP_INIT/"
cp "$APP_DIR/test/fixtures/rutas/07-realfixture-db.sh" "$TMP_INIT/"
# Ingestion agent's real-route fixture goes to a separate DB (megalitos_real); .txt so the entrypoint skips it.
[ -f "$APP_DIR/tools/routes/fixture-rutas.sql" ] && cp "$APP_DIR/tools/routes/fixture-rutas.sql" "$TMP_INIT/real-fixture-rutas.txt"
chmod -R a+rX "$TMP_INIT"
INIT_DIR="$TMP_INIT"
echo ">> DB init: $INIT_DIR (fixture flag $FIXTURE_FLAG)"

cleanup() {
  docker rm -f "$JOB" "$DB" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  rm -rf "${TMP_INIT:-}"
}
trap cleanup EXIT

ROOT_PW="$(head -c 18 /dev/urandom | base64 | tr -d '/+=')"
APP_PW="$(head -c 18 /dev/urandom | base64 | tr -d '/+=')"

docker network create "$NET" >/dev/null
docker run -d --name "$DB" --network "$NET" \
  -e MARIADB_ROOT_PASSWORD="$ROOT_PW" -e MARIADB_DATABASE=megalitos \
  -e MYSQL_APP_USER=megalitos_app -e MYSQL_APP_PASSWORD="$APP_PW" \
  -v "$INIT_DIR":/docker-entrypoint-initdb.d:ro \
  --health-cmd 'healthcheck.sh --connect --innodb_initialized' --health-interval 3s --health-retries 60 \
  mariadb:11.4 >/dev/null

echo ">> waiting for MariaDB..."
for _ in $(seq 1 120); do
  st="$(docker inspect -f '{{.State.Health.Status}}' "$DB")"
  [ "$st" = "healthy" ] && break
  sleep 2
done
[ "$st" = "healthy" ] || { docker logs "$DB" | tail -30; echo "MariaDB not healthy"; exit 1; }

docker run --rm --name "$JOB" --network "$NET" \
  -v "$APP_DIR":/src:ro \
  -e DB_HOST="$DB" -e DB_USER=megalitos_app -e DB_PASSWORD="$APP_PW" -e DB_NAME=megalitos \
  -e TEST_FIXTURE_DB="$FIXTURE_FLAG" -e NODE_ENV=test \
  node:22-alpine sh -c '
    set -e
    mkdir /work && cd /src && tar cf - --exclude=./node_modules --exclude=./.git --exclude=./data . | tar xf - -C /work
    cd /work && npm ci --no-audit --no-fund --loglevel=error
    node --test "test/*.test.js"
  '
