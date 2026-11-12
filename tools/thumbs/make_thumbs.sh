#!/usr/bin/env bash
# Generate 480px-wide webp thumbnails: <basename>.webp, from an input dir into an output dir.
# Usage: make_thumbs.sh INPUT_DIR OUTPUT_DIR      (env: WIDTH=480 QUALITY=78 LIMIT=0 FORCE=0)
# Needs only Docker; builds a small alpine+libvips image (megalitos-thumbs) on first use.
# Never writes into INPUT_DIR (mounted read-only). Idempotent: up-to-date thumbs are skipped.
set -euo pipefail
[ $# -eq 2 ] || { echo "usage: $0 INPUT_DIR OUTPUT_DIR" >&2; exit 2; }
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IN="$(cd "$1" && pwd)"; mkdir -p "$2"; OUT="$(cd "$2" && pwd)"
[ "$IN" != "$OUT" ] || { echo "input and output must differ" >&2; exit 2; }
docker image inspect megalitos-thumbs >/dev/null 2>&1 || docker build -q -t megalitos-thumbs "$HERE" >/dev/null
docker run --rm --user "$(id -u):$(id -g)" -e WIDTH -e QUALITY -e LIMIT -e FORCE \
  -v "$IN:/in:ro" -v "$OUT:/out" megalitos-thumbs
