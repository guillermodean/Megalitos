
## Data agent notes
- The dump holds **476** megalitos (ids 1..479 with gaps), not 491 (491 = 476 + 15 clasificacion rows). Nothing excluded. Total anexos 1338 (all files on disk, 2 orphans added). 14 tipologias; 9 megalitos have `tipologia_id` NULL.
- No schema deviations from CONTRACT.md. 60 megalitos have no coordinates (lat/lon NULL), so `/api/megalitos.geojson` yields 416 features.
- UTM datum is ED50 (EPSG:23030), see `db/DATA_REPORT.md`. App user env: `MYSQL_APP_USER` / `MYSQL_APP_PASSWORD` (+ `MARIADB_ROOT_PASSWORD`, `MARIADB_DATABASE=megalitos`) for the db container.
- Thumbs: `tools/thumbs/make_thumbs.sh IN OUT` (Docker, alpine+vips, skips up-to-date files, preserves `<basename>.webp`).
- Regenerate seed + report: `db/tools/build_seed.sh` (Docker only).

## Backend notes
- Prod compose publishes 8050:8000 (cloudflared -> megalitosnavarra.guillermodean.com); dev override uses 8096. Prod compose expects the repo cloned in ~/dockers/megalitos with data/{anexos,thumbs,mysql}.
- Tests: `test/run.sh` (real MariaDB + db/init; `FIXTURE=1` forces the tiny fixture). `test/integration.test.js` also renders the real `src/views` (200s, no inline script/style/on* handlers) once `src/views/home.hbs` exists.
- Views must provide `404` and `error` templates in addition to the contract pages (the error handler renders them; `message` var).
- Layout vars: title, description, active, year. `active` is '' on error pages. Rendering of unit tests uses test/fixtures/views, independent of the frontend.
- Static: /vendor and /fonts immutable 1y; other public files 1h. Thumbs URL `/anexos/thumbs/<base>.webp` falls back to the jpg.
- Rate limit counts pages+api only (not static/anexos/healthz). Env RATE_LIMIT_MAX.

## Frontend notes (design agent)
- Layout uses `eq`, `fmtNum`, `nl2p` only. Layout reads `active`, `title`, `description`, `year`. No `pad4` helper exists: catalogue numbers render as "Nº 24" (optional: add `pad4` helper to get "Nº 0024").
- `ficha`/`mapa` views include `<script src="/vendor/leaflet/leaflet.js">` and `/js/map.js` at the end of the view body (external, CSP-safe). Layout always loads `/js/site.js` (defer).
- CSP: CSS uses `mask:url(/img/*.svg)` (same-origin, no data: URIs). Leaflet tiles need `img-src` to allow https://tile.openstreetmap.org, https://tile.opentopomap.org, https://www.ign.es (and `data:`/`blob:` is not required).
- Client JS expects `/api/megalitos.geojson` features with `properties.{id,nombre,tipologia,municipio,altitud}`; tipologia grouped by regex (dolmen/cromlech/tumulo/menhir|monolito/otros).
- `Img.thumb` 404 falls back to `Img.src` via `data-fallback` in site.js (ficha only); Card thumbs have no fallback, so the server should fall back to the jpg as per contract.
- `/404` + `error` views take `{message}`; layout still needs title/description/active ('' for active is fine).
- Preview: `design/preview/run.sh serve|shots` (Docker node:22-alpine + chromium, needs network for tiles).

## Fase 2
### Ingesta (rutas)
- Tables in `db/init/04-rutas-schema.sql` (empty on a fresh DB; filled by `scripts/refresh-routes.sh`, run on the homelab from `~/dockers/megalitos`: downloads pbf to `data/osm/`, exports megalito coords, builds offline in the `megalitos-routes-build` image, loads in one transaction). Needs the repo (tools/routes, db/init) in the deploy dir; uses `.env` `MARIADB_ROOT_PASSWORD` via `MYSQL_PWD`. Overrides: `DB_CONTAINER`, `DEPLOY_DIR`, `FORCE_DOWNLOAD=1`.
- Real numbers (OSM 2026-11-11): 93 routes, 738 pairs, 416 acceso rows (all megalitos with coords have a row; `senda_dist_m` is never NULL in practice, `senda_sac` almost always NULL). `geojson` total 0.54 MB, `geojson_lite` 0.19 MB (whole layer fine to serve). Max single route detail 55 KB.
- Notes for backend: `ref` is NULL for 20 routes (use `nombre`); `red` is never NULL in current data but may be; `operador/desde/hasta/web` are mostly NULL; `simbolo` is osmc:symbol raw text; `actualizado` = OSM extract time (UTC). GeoJSON columns are MultiLineStrings (geometry only, `[lon,lat]`).
- Fixture for tests: `tools/routes/fixture-rutas.sql` (GR 322, GR 282, PR-NA 82; geojson = lite). It DELETEs the four route tables first and runs with FK checks off; load after `04-rutas-schema.sql` and `02-seed.sql`.

## Fase 2
Backend notes (rutas):
- View models as in CONTRACT-FASE2. Extras: `rutas` view also gets `disponible` (bool; false => show "Rutas aún no disponibles") and `redes` = the 4 networks only (`{value,nombre,selected}`, no "Todas" option; add it in the template). `ficha` gets `rutas`, `acceso` and `rutasDisponibles` (use it to avoid showing "Sin ruta señalizada..." when the feature is off). `Ruta` also has `longitudM`. `meta` may be `null` on `/rutas` when unavailable; `meta.actualizado` is `YYYY-MM-DD`.
- `/rutas/:id` renders `ruta` with `active: 'rutas'`; ficha stays `active: 'list'`. `/rutas/:id.gpx` is registered before `/rutas/:id`. Unknown/invalid ids -> 404 (also when rutas tables are absent).
- API: `/api/rutas.geojson` (lite, parsed once, cached 1 h in memory, `Cache-Control: public, max-age=86400`; empty FeatureCollection when unavailable), `/api/rutas/:id.geojson` (Feature, detail geometry, properties id/ref/nombre/red/redNombre/operador/desde/hasta/web/simbolo/longitud_m/n_megalitos/actualizado), `/api/megalitos/:id/rutas` -> `{rutas, acceso}` (404 if megalito unknown). Content type `application/geo+json`.
- Availability is probed with `SELECT COUNT(*) FROM rutas` (ER_NO_SUCH_TABLE or 0 rows => off), re-probed after 60 s when off, 10 min when on; no restart needed after the refresh script creates the tables.
- Tests: `test/run.sh` assembles a temp init dir: base init + `04-rutas-schema.sql` (db/init one if present, else test/fixtures/rutas) + `05-rutas-fixture.sql` (routes 1001-1003, linked to the two lowest megalito ids) + `06-norutas-db.sh` (DB `megalitos_norutas` = phase-1 DB). Fixture views `rutas.hbs`/`ruta.hbs` live in test/fixtures/views; real-view rendering tests for rutas auto-enable once `src/views/rutas.hbs` and `ruta.hbs` exist. XML well-formedness is checked with a small strict checker in test/helpers.js (no XML dependency).
- GPX: waypoints for megalitos <= 500 m, one `<trkseg>` per LineString, ASCII slug filename `<ref>-<nombre>.gpx`.

## Fase 2
- Frontend: nav ahora 01 Catálogo, 02 Mapa, 03 Rutas, 04 Miguel Ezkurdia. Vistas nuevas `rutas.hbs`, `ruta.hbs`, partials `placa.hbs` (placa de ruta; color por prefijo de `ref` vía CSS `[data-ref^="GR" i]`, sin JS; sin ref muestra "s/n" neutro) y `acceso-senda.hbs`. `ficha.hbs` usa `rutas`, `acceso`, `rutasDisponibles`; `rutas.hbs` usa `disponible`, `meta` (puede ser null) y `redes` (la opción "Todas" la añade la vista).
- JS: `map.js` ampliado (capa de rutas con halo en un pane propio z-index 390, por debajo de los puntos; colores desde `--rt-*` en CSS y repintado al cambiar el esquema; popups con DOM+textContent). Respeta `prefers-reduced-motion` (sin animaciones de zoom/fundido). Sin Node en host: no se ha ejecutado test automático de JS, solo capturas con Chromium.
- Contract gaps: `meta.actualizado` se imprime tal cual (`YYYY-MM-DD`); `ruta` espera `meta.actualizado` (cae a `r.actualizado`). `MegalitoEnRuta` debe traer `lat`, `lon`, `tipologia`, `municipio`, `altitud` (se pasan por data-*). `/api/rutas.geojson` vacío => el toggle muestra "0 rutas". `/api/rutas/:id.geojson` debe incluir `properties.red` (si no, se usa el data-red de la página).
- Preview: `FASE2=1 SCHEMES=light,dark design/preview/run.sh shots`; geometrías inventadas en `design/preview/routes.cjs`; capturas en `design/screenshots/fase2/` (los ficheros los crea root por Docker).

