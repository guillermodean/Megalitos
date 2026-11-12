# Routes report (fase 2)

Source: Geofabrik `navarra-latest.osm.pbf`, OSM timestamp **2026-11-11 21:22:47** (UTC). Generated with `tools/routes/build_routes.py`, loaded by `scripts/refresh-routes.sh`.

## Counts
- `route=hiking|foot` relations in the extract: 315; 34 are superroutes/containers (discarded), 281 have way members, 280 produced a geometry (1 empty/too short).
- Kept (>= 1 megalito within 1500 m): **93** routes; 738 megalito-route pairs (<= 1500 m).
- By network (kept): nwn 36, lwn 30, rwn 23, iwn 4 (no route is without a valid network); 20 kept routes have no `ref` (name only).
- Megalitos with coordinates: 416 of 476.

## Coverage (416 megalitos with coordinates)
| Metric | Megalitos | % |
|---|---|---|
| route <= 500 m | 219 | 52.6 |
| route <= 1000 m | 276 | 66.3 |
| route <= 1500 m | 305 | 73.3 |
| path/track/footway/bridleway <= 100 m | 348 | 83.7 |
| path/track/footway/bridleway <= 300 m | 404 | 97.1 |
| none within 3 km | 0 | 0 |

(Matches the research doc: 50 / 62 / 71 % and 84 / 97 %.) Access types: path 276, track 139, footway 1.

## Top 15 by n_megalitos (<= 500 m)
GR 12 (57), GR 11 (38), GR 322 Nafarroa Xtrem (23), GR 282 Artzaintza naturbidea (18), PR-NA 125 (15), GRT 5 (11), PR-NA 11 (11), Baztango Donejakue bidea (10), PR-NA 82 Aralarko Done Mikel (10), GR 20 Aralarko bira (9), PR-NA 1 Abartan (9), PR-NA 90 Sorginen bidea (8), Belateko itzulia (7), Sorogaingo ibilbide megalitikoa (7), HRP Etape 03 (7).

## Spot checks
- ARMAIIA (id 3, 42.9577,-1.5562): GR 322 at 21 m (the research point 42.9596,-1.5548 is ~240 m away from the catalogue coordinates, consistent with the ~250 m there).
- Aralar megalitos (ids 446, 456, 459-466, 470): GR 282, GR 20 and PR-NA 82 all listed (e.g. id 462 EKIALDEKO ELURMENTA: GR 282 218 m, GR 20 696 m, PR-NA 82 974 m).

## Decisions
- **Superroutes** (`type=superroute`, or hiking relations with only relation members): discarded; their child routes are kept individually if near a megalito. Relations with both ways and sub-relations use only their own ways.
- **Member roles**: ways with role `alternative`, `excursion`, `approach` are excluded from the geometry; everything else is included (`forward`, `backward`, empty, `main`, ...).
- Geometry: way pieces merged with shapely `linemerge` into a MultiLineString; clipped-extract ways with missing nodes are split at the gap (routes leaving Navarra are truncated at the extract border). Lengths in EPSG:25830 (sum of merged lines).
- Simplification (preserve topology, in EPSG:25830, coords rounded to 6 decimals): 5 m -> `geojson`, 25 m -> `geojson_lite`. Distances and access points are computed on the unsimplified geometry.
- Name fallback: name -> name:es -> name:eu -> ref. `red` only iwn/nwn/rwn/lwn else NULL. `web` (website, else url) only if it starts with http(s)://. Text fields are whitespace-normalised and truncated to column size.
- `megalito_acceso`: nearest `highway` in path/track/footway/bridleway within 3 km (NULL columns beyond), with `sac_scale` if tagged (the sac column is NULL for nearly all rows). One row per megalito with coordinates.
- Load: a single transaction (`DELETE` all four tables, `INSERT`, `COMMIT`) instead of staging tables + `RENAME TABLE`: RENAME with FKs between the renamed tables would need the constraint names re-pointed, and the transaction gives the same atomicity (readers see the old data until COMMIT; any error aborts and rolls back; verified with a deliberately broken file). Output SQL is byte-for-byte deterministic for the same inputs (`generado` uses `NOW()` in SQL).
- Megalitos without coordinates (60) have no rows in `megalito_acceso` and no pairs.

## Sizes
- `geojson` total 0.54 MB; `geojson_lite` total 0.19 MB (whole layer, uncompressed; well under the 1.5 MB target, so no tolerance increase needed). Largest single route: 55 KB detail. `rutas.sql` ~0.9 MB.

## Run time
- Build container: ~13 s (pbf 38 MB, 100k access ways). Full `refresh-routes.sh` (excluding download): ~16 s. Loading twice verified idempotent (same counts).
