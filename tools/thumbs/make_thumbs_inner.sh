#!/bin/sh
# Inside the container: /in (read-only) -> /out. Env: WIDTH (480), QUALITY (78), LIMIT (0 = all), FORCE (0|1).
WIDTH="${WIDTH:-480}"; Q="${QUALITY:-78}"; LIMIT="${LIMIT:-0}"; FORCE="${FORCE:-0}"
n=0; skipped=0; fail=0
for f in /in/*.jpg /in/*.JPG /in/*.jpeg; do
  [ -f "$f" ] || continue
  b=$(basename "$f"); b="${b%.*}"
  out="/out/$b.webp"
  if [ "$FORCE" != 1 ] && [ -s "$out" ] && [ "$out" -nt "$f" ]; then skipped=$((skipped+1)); continue; fi
  [ "$LIMIT" -gt 0 ] && [ "$n" -ge "$LIMIT" ] && break
  # '480x' = fixed width; '>' = only shrink, never upscale. --rotate honours EXIF orientation.
  if vipsthumbnail "$f" --size "${WIDTH}x>" --rotate -o "/out/%s.webp[Q=$Q,strip]"; then n=$((n+1)); else fail=$((fail+1)); echo "FAILED $f" >&2; fi
done
echo "thumbs: generated=$n skipped=$skipped failed=$fail"
[ "$fail" -eq 0 ]
