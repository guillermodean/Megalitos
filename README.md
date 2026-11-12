# Megalitos de Navarra

Catálogo web de dólmenes, túmulos, menhires y cromlechs de Navarra: buscador, fichas con fotos y dibujos, y mapa. Node 22 + Express 5 + Handlebars + MariaDB 11.4. Pública en https://megalitosnavarra.guillermodean.com.

## Ejecutar en local (Docker)

```bash
cp .env.example .env        # rellena contraseñas: openssl rand -base64 32
docker compose -f compose.yml -f compose.dev.yml up --build
# http://localhost:8096
```
El override de desarrollo monta las imágenes del legado (`../Megalitos/src/public/img/141208_Megalitos`).

## Tests

```bash
test/run.sh     # MariaDB 11.4 + node:22-alpine efímeros; usa db/init si existe, si no un fixture mínimo.
                # Carga además el esquema de rutas (db/init/04 o test/fixtures/rutas/04) + 3 rutas de prueba
                # y una BBDD `megalitos_norutas` sin tablas de rutas (BBDD de fase 1).
```

## Rutas de senderismo

Cada ficha muestra las rutas senderistas señalizadas (GR, PR, SL, locales) que pasan cerca, y `/rutas` las lista con descarga GPX (`/rutas/<id>.gpx`) y capa GeoJSON para el mapa (`/api/rutas.geojson`, `/api/rutas/<id>.geojson`, `/api/megalitos/<id>/rutas`).

- **Fuente:** relaciones `route=hiking` de OpenStreetMap (extracto Geofabrik de Navarra), precalculadas offline en las tablas `rutas`, `megalito_ruta`, `megalito_acceso` y `rutas_meta`. La web no consulta APIs de terceros.
- **Licencia:** datos © colaboradores de OpenStreetMap, bajo [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Los GPX llevan la atribución en `<copyright>`.
- **Refresco:** mensual, con `scripts/refresh-routes.sh` (ver `db/ROUTES_REPORT.md`). La app cachea la capa general 1 h en memoria; los GPX/GeoJSON se sirven con `Cache-Control` de 1 día.
- **BBDD antigua:** si las tablas no existen o están vacías la web sigue funcionando (sin sección de rutas; `/rutas` indica que aún no están disponibles). Se reintenta la detección cada minuto/10 min, sin reiniciar.
- **Aviso:** los trazados son orientativos y pueden estar desactualizados; comprueba el estado del camino y las condiciones de montaña antes de salir.

## Despliegue en el homelab

Clonar el repo en `~/dockers/megalitos/`, crear `.env`, copiar imágenes a `data/anexos/` y miniaturas `.webp` a `data/thumbs/`, y `docker compose up -d --build`. El puerto 8050 del host lo publica el túnel de Cloudflare. MariaDB no expone puertos (red interna). El usuario de la app solo tiene `SELECT`. Los scripts de `db/init` solo se ejecutan con `data/mysql` vacío.

## Variables de entorno

`DB_HOST`, `DB_USER`, `DB_PASSWORD` (obligatorias), `DB_PORT` (3306), `DB_NAME` (megalitos), `PORT` (8000), `IMAGES_DIR` (/data/anexos), `THUMBS_DIR` (/data/thumbs), `TRUST_PROXY` (1 tras cloudflared), `RATE_LIMIT_MAX` (300/5 min). Ver `.env.example`.

## Créditos de los datos

Inventario de megalitos: legado de Miguel Ezkurdia, con datos de la SCN Gorosti.
