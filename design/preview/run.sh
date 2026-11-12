#!/bin/sh
# Design preview: renders src/views with fixtures and (optionally) takes screenshots.
#   ./run.sh serve     -> http://localhost:8099 (Ctrl-C to stop)
#   ./run.sh shots     -> design/screenshots/*.png   (SCHEMES=light,dark for both)
# Needs Docker. IMAGES_DIR_HOST = folder with the scanned images (optional).
set -e
APP="$(cd "$(dirname "$0")/../.." && pwd)"
IMGS="${IMAGES_DIR_HOST:-$APP/../Megalitos/src/public/img/141208_Megalitos}"
CACHE="${PREVIEW_CACHE:-/tmp/megalitos-fe-preview-cache}"
mkdir -p "$CACHE"
NAME=megalitos-fe-tmp-preview
docker rm -f $NAME >/dev/null 2>&1 || true
CMD="apk add --no-cache chromium >/dev/null && cd /cache && [ -d node_modules ] || npm i --silent express@5 express-handlebars@8 puppeteer-core@23; cd /app/design/preview; "
if [ "$1" = shots ]; then
  CMD="$CMD (node server.cjs & sleep 4; node shots.cjs /app/design/screenshots; kill %1)"
else
  CMD="$CMD node server.cjs"
fi
docker run --rm --name $NAME --network host -e NODE_PATH=/cache/node_modules -e FASE2="${FASE2:-0}" -e SCHEMES="${SCHEMES:-light}" \
  -v "$APP":/app -v "$CACHE":/cache -v "$IMGS":/data/anexos:ro node:22-alpine sh -c "$CMD"
