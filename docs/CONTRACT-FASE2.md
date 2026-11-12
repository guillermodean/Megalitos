# Fase 2 — Rutas de senderismo (contrato común, leer primero)

Lee también `docs/CONTRACT.md` (fase 1: stack, reglas CSP, estilo, ownership) y `docs/hiking-routes-research.md` (decisión: precómputo offline desde el extracto Geofabrik de Navarra; nada de APIs de terceros en el navegador ni Overpass en producción).

Objetivo: para cada megalito, mostrar las rutas de senderismo señalizadas de OpenStreetMap (`route=hiking`: GR, PR, SL, locales) que pasan cerca; y para cada ruta, qué megalitos recorre. Descarga GPX. Atribución ODbL siempre visible.

App en producción: https://megalitosnavarra.guillermodean.com (no tocar el servidor; el orquestador despliega). No hay Node en el host: todo con Docker. No hacer git commit.

## Datos (owner: agente de ingesta)

Fuente: `https://download.geofabrik.de/europe/spain/navarra-latest.osm.pbf` (~38 MB). Incluir relaciones `type=route` + `route=hiking` (también `route=foot` si las hay) cuyo bbox interseque Navarra, con sus vías miembro (excluir miembros con role `alternative`/`excursion`/`approach` de la geometría principal es opcional — documentar la decisión). Super-rutas (relaciones de relaciones, `type=superroute` o relaciones cuyos miembros son relaciones): aplanar a sus hijas o descartar; documentar.

Esquema nuevo en `db/init/04-rutas-schema.sql` (se ejecuta tras 01–03 en una BBDD nueva; en la BBDD de producción existente lo aplicará el script de refresco con `CREATE TABLE IF NOT EXISTS`):
```sql
rutas(
  id BIGINT UNSIGNED PK,              -- id de relación OSM
  ref VARCHAR(40) NULL,               -- 'GR 11', 'PR-NA 82', 'SL-NA 50'...
  nombre VARCHAR(255) NULL,           -- name (o name:es / name:eu si falta name)
  red ENUM('iwn','nwn','rwn','lwn') NULL,  -- tag network
  operador VARCHAR(160) NULL,         -- operator
  desde VARCHAR(160) NULL, hasta VARCHAR(160) NULL,   -- from / to
  web VARCHAR(255) NULL,              -- website / url si es http(s)
  simbolo VARCHAR(80) NULL,           -- osmc:symbol (texto)
  longitud_m INT UNSIGNED NOT NULL,   -- suma de longitudes de la geometría (metros)
  min_lat DECIMAL(9,6), min_lon DECIMAL(9,6), max_lat DECIMAL(9,6), max_lon DECIMAL(9,6),
  geojson MEDIUMTEXT NOT NULL,        -- MultiLineString simplificada ~5 m (lon,lat, 6 decimales)
  geojson_lite MEDIUMTEXT NOT NULL,   -- versión ~25 m para la capa general del mapa
  n_megalitos SMALLINT UNSIGNED NOT NULL DEFAULT 0,   -- megalitos a <= 500 m
  actualizado DATETIME NOT NULL,      -- fecha del extracto OSM
  KEY (n_megalitos)
)
megalito_ruta(
  megalito_id SMALLINT UNSIGNED NOT NULL FK -> megalitos.id ON DELETE CASCADE,
  ruta_id BIGINT UNSIGNED NOT NULL FK -> rutas.id ON DELETE CASCADE,
  dist_m INT UNSIGNED NOT NULL,       -- distancia mínima megalito-ruta
  acceso_lat DECIMAL(9,6) NOT NULL, acceso_lon DECIMAL(9,6) NOT NULL,  -- punto de la ruta más cercano
  PRIMARY KEY (megalito_id, ruta_id), KEY (ruta_id, dist_m)
)                                     -- solo pares con dist_m <= 1500
megalito_acceso(
  megalito_id SMALLINT UNSIGNED PK FK -> megalitos.id ON DELETE CASCADE,
  senda_dist_m INT UNSIGNED NULL,     -- vía highway=path|track|footway|bridleway más cercana
  senda_tipo VARCHAR(20) NULL,        -- path / track / footway / bridleway
  senda_sac VARCHAR(40) NULL,         -- sac_scale si lo tiene
  actualizado DATETIME NOT NULL
)
rutas_meta(clave VARCHAR(40) PK, valor VARCHAR(255))   -- 'osm_timestamp', 'generado', 'n_rutas', 'fuente'
```
Distancias en metros sobre proyección métrica (EPSG:25830), usando lat/lon de `megalitos` (los que tienen coordenadas). Solo se guardan rutas con al menos un megalito a <= 1500 m (las demás no interesan a esta web).

## Endpoints y vistas (owner: backend)

| Ruta | Respuesta |
|---|---|
| `GET /rutas` | vista `rutas` — listado de rutas ordenado por `n_megalitos` desc, luego `ref`; filtro `q` (ref/nombre, max 100) y `red` |
| `GET /rutas/:id` | vista `ruta` — id numérico (1..2^53), si no existe 404 |
| `GET /rutas/:id.gpx` | GPX 1.1 `application/gpx+xml`, `Content-Disposition: attachment; filename="<slug>.gpx"`; `<metadata>` con nombre, `<copyright author="OpenStreetMap contributors"><license>https://opendatacommons.org/licenses/odbl/1-0/</license></copyright>`, `<link href="https://www.openstreetmap.org/relation/<id>">`; un `<trk>` con un `<trkseg>` por LineString; `<wpt>` por cada megalito a <= 500 m (nombre + "Nº 0024" + tipología). XML escapado correctamente. |
| `GET /api/rutas.geojson` | FeatureCollection con `geojson_lite`, properties `{id, ref, nombre, red, n_megalitos}` — capa general del mapa. Cache-Control 1 día. |
| `GET /api/rutas/:id.geojson` | Feature con `geojson` (detalle) + properties completas |
| `GET /api/megalitos/:id/rutas` | `{ rutas: [RutaCercana], acceso: Acceso|null }` |

Las páginas existentes cambian:
- `ficha` recibe además `rutas: [RutaCercana]` (ordenadas por dist_m, máx. 8) y `acceso: Acceso|null`.
- `mapa` sin cambios en el view model (la capa de rutas se carga por fetch).
- Nav: nuevo elemento `rutas` → `active: 'rutas'`.

View models:
- `rutas`: `{ items: [RutaCard], total, q, red, redes: [{value, nombre, selected}], meta: {actualizado, nRutas} }`
- `ruta`: `{ r: Ruta, megalitos: [MegalitoEnRuta] /* dist <= 1000 m, ordenados por dist_m */, gpxUrl, osmUrl, waymarkedUrl, meta: {actualizado} }`
- `RutaCard = { id, ref, nombre, red, redNombre, longitudKm /* "12,4" */, nMegalitos }`
- `Ruta = RutaCard + { operador, desde, hasta, web, simbolo, actualizado }`
- `RutaCercana = { id, ref, nombre, red, redNombre, distM, longitudKm, accesoLat, accesoLon }`
- `MegalitoEnRuta = Card (fase 1) + { distM, lat, lon }`
- `Acceso = { sendaDistM, sendaTipo, sendaSac }`
- `redNombre`: iwn → "Internacional", nwn → "Nacional (GR)", rwn → "Regional", lwn → "Local", null → "Sin clasificar".
- `waymarkedUrl = https://hiking.waymarkedtrails.org/#route?id=<id>`; `osmUrl = https://www.openstreetmap.org/relation/<id>`.

Si las tablas de rutas no existen o están vacías (BBDD vieja), la web NO debe romper: `ficha` sin sección de rutas, `/rutas` muestra "Rutas aún no disponibles".

## UI (owner: frontend)

- Nueva entrada de nav "04 Rutas" (o reordenar: Catálogo, Mapa, Rutas, Miguel Ezkurdia).
- `rutas.hbs`: catálogo de rutas en la misma estética (ficha de campo, papel, verde/marrón), cada fila: ref como "placa" (estilo señal GR rojo-blanco / PR amarillo-blanco / SL verde-blanco dibujada con CSS, sin logos oficiales), nombre, km, nº megalitos.
- `ruta.hbs`: mapa grande con la línea de la ruta (trazo con halo, color por red) + megalitos cercanos (mismos puntos que el mapa general), lista de megalitos con distancia, datos (desde/hasta, operador, km), botones "Descargar GPX", "Ver en OpenStreetMap", "Waymarked Trails", aviso de seguridad ("Trazado orientativo procedente de OpenStreetMap; comprueba el estado del camino y las condiciones de montaña antes de salir") y atribución ODbL con fecha del extracto.
- `ficha.hbs`: sección "Rutas cercanas" (placa ref + nombre + "a 240 m" + enlace a /rutas/:id); en el minimapa de la ficha pintar las rutas cercanas (fetch `/api/rutas/:id.geojson` de las 3 primeras). Si no hay rutas: "Sin ruta señalizada a menos de 1,5 km" + si hay `acceso`, "Senda o pista más cercana a N m".
- `mapa`: control/checkbox "Rutas de senderismo" (desactivado por defecto) que carga `/api/rutas.geojson` una vez y pinta las líneas bajo los puntos; popup con ref/nombre/enlace. Las etiquetas de megalitos siguen funcionando.
- Todo con la misma CSP estricta (sin inline), Leaflet ya autoalojado, `textContent` para datos de la BBDD (nunca HTML en bindPopup/bindTooltip).

## Ownership
- Ingesta: `tools/routes/**`, `db/init/04-rutas-schema.sql`, `db/ROUTES_REPORT.md`, `scripts/refresh-routes.sh`.
- Backend: `src/*.js`, `src/lib/**`, `src/routes/**`, `test/**` (fixtures de rutas incluidas), `README.md`.
- Frontend: `src/views/**`, `src/public/**`, `design/**`.
- Notas cruzadas: añadir a `docs/NOTES.md` bajo "## Fase 2".
