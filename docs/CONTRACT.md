# Megalitos Navarra — shared contract (all agents read this first)

Project root: `.../13-Proyectos/Megalitos Navarra/` (path has a space — always quote it).
- `Megalitos/` = LEGACY app. Read-only reference. Never modify.
- `Docs/` = source data. Read-only. `Docs/1-Mysql/megalitos.sql` (phpMyAdmin dump, MariaDB 10.4, 491 rows in `fichas`, 15 in `clasificacion`), `Docs/Megalitos de Navarra.gpx` (WGS84 waypoints from 2009, names in uppercase).
- Images: `Megalitos/src/public/img/141208_Megalitos/*.jpg` (1,338 files, 272 MB, named `NNNN_TYPE_X_Y.jpg`, TYPE ∈ DIB/FOT/MAP/TEX). NOT copied into the repo; mounted as a volume at runtime (`IMAGES_DIR`).
- `app/` = NEW app, own git repo. Do not commit; the orchestrator commits.
- No Node.js on the host. Use Docker for everything (`node:22-alpine`, `mariadb:11.4`). Docker 29 + compose v2 available.
- Language of the UI and content: Spanish. Code/comments: English.

## Stack (decided)
- Node 22 LTS, Express 5, `mysql2/promise`, `express-handlebars` (v8), `helmet`, `express-rate-limit`. Minimal deps; no jQuery, no Bootstrap, no DataTables, no sessions/passport/socket.io.
- MariaDB 11.4 LTS, utf8mb4 / utf8mb4_unicode_ci.
- Tests: `node:test` + `supertest`, run inside Docker against a real MariaDB.
- All third-party front-end assets (Leaflet, fonts) self-hosted under `src/public/vendor/` and `src/public/fonts/`. No CDNs at runtime.

## Database schema (owned by data agent, consumed by backend)
```sql
tipologias(id TINYINT UNSIGNED PK, nombre VARCHAR(40) NOT NULL, slug VARCHAR(40) UNIQUE)
megalitos(
  id SMALLINT UNSIGNED PK,           -- original Id, keep it (URLs /megalitos/:id)
  nombre VARCHAR(80) NOT NULL,
  tipologia_id TINYINT UNSIGNED NULL FK -> tipologias.id,
  tipologia_texto VARCHAR(60) NULL,  -- original Des_clas (has '?' nuances)
  municipio VARCHAR(120) NULL,
  ubicacion VARCHAR(255) NULL,
  itinerario_texto TEXT NULL,
  hoja_cartografica VARCHAR(40) NULL, -- extracted if parseable, else NULL
  utm_x INT NULL, utm_y INT NULL,     -- corrected (swapped values fixed)
  altitud SMALLINT NULL,              -- from UTM_Z
  lat DECIMAL(9,6) NULL, lon DECIMAL(9,6) NULL,  -- WGS84
  coord_fuente ENUM('utm','gpx','original') NULL,
  localizado_fecha DATE NULL,         -- parsed when possible
  localizado_fecha_texto VARCHAR(40) NULL,
  localizado_autor VARCHAR(120) NULL,
  descripcion TEXT NULL, excavacion TEXT NULL, observaciones TEXT NULL,
  caracteristicas VARCHAR(255) NULL, otros_aspectos VARCHAR(120) NULL,
  FULLTEXT KEY ft_busqueda (nombre, municipio, ubicacion, descripcion)
)
anexos(
  id INT UNSIGNED AUTO_INCREMENT PK,
  megalito_id SMALLINT UNSIGNED NOT NULL FK -> megalitos.id ON DELETE CASCADE,
  tipo ENUM('DIB','FOT','MAP','TEX') NOT NULL,
  archivo VARCHAR(40) NOT NULL,       -- basename, e.g. 0001_DIB_1_2.jpg
  orden TINYINT UNSIGNED NOT NULL,
  existe BOOLEAN NOT NULL DEFAULT 1,  -- file present in image folder
  KEY (megalito_id, tipo, orden)
)
```
Init files in `app/db/init/` (mounted at `/docker-entrypoint-initdb.d`): `01-schema.sql`, `02-seed.sql`, `03-app-user.sh` (creates `${MYSQL_APP_USER}` with **SELECT only** on `megalitos.*`, password from env `MYSQL_APP_PASSWORD`).

## Environment variables (backend)
`PORT` (8000), `DB_HOST`, `DB_PORT` (3306), `DB_NAME` (megalitos), `DB_USER`, `DB_PASSWORD`, `IMAGES_DIR` (/data/anexos), `THUMBS_DIR` (/data/thumbs), `TRUST_PROXY` (1 behind cloudflared), `NODE_ENV`.
Template `.env.example` in repo; real `.env` never committed.

## Routes (backend owns; frontend renders)
| Route | View | Notes |
|---|---|---|
| `GET /` | `home` | |
| `GET /megalitos` | `list` | query `q`, `tipo` (slug), `municipio`; server-side filter, works without JS |
| `GET /megalitos/:id` | `ficha` | id must be integer 1..9999 else 404 |
| `GET /mapa` | `mapa` | data from `/api/megalitos.geojson` |
| `GET /miguel-ezkurdia` | `ezkurdia` | static text (port from legacy `views/Information/information.hbs`) |
| `GET /api/megalitos.geojson` | JSON | FeatureCollection, only rows with lat/lon; properties `{id, nombre, tipologia, municipio, altitud}` |
| `GET /api/megalitos/:id` | JSON | full record + anexos |
| `GET /anexos/:archivo` | static | from `IMAGES_DIR`, strict filename regex `^\d{4}_(DIB|FOT|MAP|TEX)_\d+_\d+\.jpg$`, long cache |
| `GET /anexos/thumbs/:archivo` | static | webp thumbs from `THUMBS_DIR` (`<basename>.webp`, 480px wide); fall back to full jpg if missing |
| `GET /healthz` | text | `ok` if DB ping succeeds |
| legacy `/table`, `/table/vista/:id`, `/maps`, `/information` | 301 | redirects to new routes |
| anything else | `404` | |

## View models (backend passes exactly these; frontend templates use exactly these)
Layout `layouts/main.hbs` always receives: `title`, `description`, `active` (`home|list|mapa|ezkurdia`), `year`.
- `home`: `{ stats: { total, conCoordenadas, totalImagenes, tipologias: [{nombre, slug, count}] }, destacados: [Card] }` (destacados = 6 random megalitos with at least one FOT)
- `list`: `{ items: [Card], total, q, tipo, municipio, tipologias: [{nombre, slug, selected}], municipios: [{nombre, selected}] }`
- `ficha`: `{ m: Megalito, anexos: { dib: [Img], fot: [Img], map: [Img], tex: [Img] }, totalAnexos, prev: {id, nombre}|null, next: {id, nombre}|null, osmUrl, googleUrl }`
- `mapa`: `{}`
- `ezkurdia`: `{}`
- `404`, `error`: `{ message }` (never stack traces)

`Card = { id, nombre, tipologia, municipio, altitud, thumb /* url or null */ }`
`Img = { src: '/anexos/<archivo>', thumb: '/anexos/thumbs/<basename>.webp', alt, tipo }`
`Megalito` = DB row with camelCase keys: `id, nombre, tipologia, tipologiaTexto, municipio, ubicacion, itinerarioTexto, hojaCartografica, utmX, utmY, altitud, lat, lon, localizadoFecha (ISO or null), localizadoFechaTexto, localizadoAutor, descripcion, excavacion, observaciones, caracteristicas, otrosAspectos`.

Templates use `{{ }}` only (escaped). Triple-stash `{{{ }}}` is forbidden except `{{{body}}}` in the layout. No inline `<script>` or `style=""` (CSP: `script-src 'self'`, `style-src 'self'`). JSON for the client is fetched from the API, never inlined.

## Directory ownership (avoid edit conflicts)
- data agent: `app/db/**`, `app/tools/thumbs/**`
- backend agent: `app/src/*.js`, `app/src/lib/**`, `app/src/routes/**`, `app/test/**`, `app/package.json`, `app/Dockerfile`, `app/compose*.yml`, `app/.env.example`, `app/.dockerignore`, `app/README.md`
- frontend agent: `app/src/views/**`, `app/src/public/**`, `app/design/**`
- research agent: `app/docs/hiking-routes-research.md`
Anyone may append a short section to `app/docs/NOTES.md` to flag cross-cutting issues for the orchestrator.

## Deployment facts (orchestrator, 2026-11-11)
- Public hostname already in the Cloudflare tunnel: `megalitosnavarra.guillermodean.com` → homelab host port **8050**. Prod compose publishes `8050:8000`; dev uses 8096.
- Prod dir on server: `/home/guillermo/dockers/megalitos/` (replaces old compose that ran `guillermojdean/megalitos-navarra:2.0.0`).
