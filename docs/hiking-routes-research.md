# Fase 2: rutas de senderismo junto a megalitos. Investigación

Fecha: 2026-11-11. Decisión orientada a: web pública sin ánimo de lucro, Node/Express + Leaflet + MariaDB, VM Proxmox de 8 GB tras túnel Cloudflare.

## Recomendación (resumen)

1. **MVP (fase 2): precómputo offline, cero llamadas de terceros desde el navegador.** Un script (Node o Python/pyosmium) lee el extracto Geofabrik de Navarra (38 MB), extrae las relaciones `route=hiking` (309 en Navarra) y, por cada megalito, guarda en MariaDB las rutas oficiales a < 1500 m con su geometría simplificada. La web sirve GeoJSON/GPX desde MariaDB. Complemento: sendas/pistas cercanas (`highway=path|track`) para el último tramo de aproximación.
2. **Rutas de enlace entre megalitos / "cómo llegar" (fase 3): BRouter autoalojado** (perfil `hiking-mountain`, MIT, ~1 GB RAM, segmentos 5x5 grados) y perfil de elevación con MDT05/MDT25 del IGN (CC BY 4.0). Orden de visita con heurística TSP propia (vecino más cercano + 2-opt, N <= 15), no hace falta VROOM.
3. **No usar**: Wikiloc (sin API ni permiso, términos de uso personal), Komoot/AllTrails/Outdooractive (APIs para socios, sin acceso para sitio pequeño verificado), Overpass público en producción (política de uso: ~100 consultas/día si es uso regular).
4. **Opcional barato**: enlazar a Waymarked Trails (visor, página de la ruta por id de relación OSM) en vez de reimplementar.

## Pruebas reales (2026-11-11)

Overpass público (`overpass-api.de`) devolvió **502 "at capacity"** repetidas veces y 429/timeouts en otras instancias; es la evidencia práctica de que no sirve para producción. Para validar, se descargó el extracto Geofabrik y se hizo la misma consulta en local (pyosmium, geometría exacta de las vías miembro):

| Megalito / punto | Resultado (relaciones `route=hiking` a < 1500 m) |
|---|---|
| Armaiia, 42.9596 -1.5548 (Ulzama) | `GR 322` "Nafarroa Xtrem" (rel. 19045968), a 248 m. Única ruta. Además 48 vías path/track a < 1500 m (solo 4 con `sac_scale=hiking`) |
| Aralar, 42.955 -1.994 | `GR 282` "Artzaintza naturbidea" (rel. 4275896, a 91 m); `GR 20` "Aralarko bira" (rel. 6545762, 840 m); `PR-NA 82` "Aralarko Done Mikel" (rel. 8657756, 1001 m) |

La consulta Overpass de Aralar sí respondió una vez en vivo con exactamente esas tres relaciones (coincide con el extracto local).

Cobertura sobre el GPX de megalitos del proyecto (1638 waypoints; incluye varios puntos por ficha, tomar como porcentaje):
- relación de senderismo a <= 500 m: 50 %; <= 1000 m: 62 %; <= 1500 m: 71 %
- sendero/pista (`highway=path|track|footway`) a <= 100 m: 84 %; <= 300 m: 97 %

Lectura: la red de rutas **oficiales** no cubre a todos los megalitos (~30 % sin ruta a 1,5 km), pero casi todos tienen sendero/pista cerca, así que hace falta routing para "sugerir ruta" en el resto.

**BRouter público** (`brouter.de`): petición real OK (HTTP 200, 139 puntos GPX):
`https://brouter.de/brouter?lonlats=-1.5548,42.9596|-1.5300,42.9700&profile=hiking-mountain&alternativeidx=0&format=geojson` → 3502 m, +118 m, ~50 min. Formatos `gpx`, `geojson`. Sin política escrita; es instancia comunitaria: solo para pruebas.

**Waymarked Trails**: `https://hiking.waymarkedtrails.org/api/v1/list/by_area?bbox=-1.57,42.945,-1.54,42.975&limit=5` responde 200 (vacío en ese bbox; no verificado el endpoint de GPX, `details/.../gpx` dio 404). Es una capa sobre OSM, mismos datos que Overpass.

**Navarra extracto**: `https://download.geofabrik.de/europe/spain/navarra-latest.osm.pbf` (38 MB, versión 2026-11-08) existe como subregión propia.

## Comparación

| Opción | Qué da | Calidad Navarra | Licencia / atribución | Coste / límites | Footprint propio | Esfuerzo | Privacidad |
|---|---|---|---|---|---|---|---|
| **Extracto Geofabrik + proceso local** | Relaciones hiking, sendas, sac_scale | Buena en GR/PR; 309 relaciones; sac_scale escaso | ODbL: atribuir "© OpenStreetMap contributors"; GPX derivado = base de datos derivada, publicar atribución y ofrecer el origen | Gratis | 38 MB pbf; cron semanal/mensual; <1 GB RAM en el proceso | Bajo-medio | Máxima (sin terceros) |
| Overpass público | Consultas en vivo | Igual (mismos datos) | ODbL | ~10k consultas/día "puntual"; uso regular /100 (~100/día); 502/429 observados | Ninguno | Bajo | Si lo llama el navegador, filtra IPs a terceros. Servidor sí |
| Overpass propio (Navarra) | Lo mismo, API local | Igual | ODbL | Gratis | Extracto pequeño: ~1-2 GB disco, 2-4 GB RAM (instancias de ref. UK&IE 4 core/8 GB). Sobredimensionado | Medio-alto | Máxima |
| Waymarked Trails | Rutas OSM con símbolos, GPX | Igual que OSM | ODbL + sus condiciones (no abusar de la API) | Sin límite publicado; cortesía | Ninguno | Bajo (enlazar) | Teselas/API de terceros |
| **BRouter autoalojado** | Routing hiking, alternativas, GPX | Buena sobre OSM (sendas); depende de tagging | MIT (código), datos ODbL | Gratis | Segmentos E0_N40 (~150-300 MB) + JVM ~512 MB-1 GB; Docker | Medio | Máxima |
| BRouter público | Idem | Idem | Idem | Instancia comunitaria, uso moderado | Ninguno | Bajo | Terceros |
| OpenRouteService | `foot-hiking`, optimización VROOM | Buena | ODbL datos; ToS ORS | Plan free: 2000 directions/día, 40/min (plans page); repetido abuso = bloqueo. Clave en el navegador o proxy | Self-host: Docker, grafo España ~ varios GB RAM; Navarra solo cabe bien | Medio-alto | Terceros si público |
| GraphHopper | Perfil `hike` | Buena | Apache 2.0 código; API: free no comercial 500 créditos/día | Self-host gratis | JVM + grafo Navarra ~1-2 GB | Medio | Idem |
| Valhalla | `pedestrian` con `max_hiking_difficulty` | Buena | MIT | Self-host | Tiles Navarra ~1 GB | Medio-alto | Idem |
| Wikiloc | Rutas de usuarios | Excelente en cantidad | Propietaria, uso personal; sin API pública; embed iframe solo por usuario | Pedir permiso por escrito | -- | No viable | Cookies de terceros en iframe |
| FEDME / IGN senderos homologados (GR/PR/SL) | GPX/KML/SHP por etapa | Oficial y revisado | CC BY 4.0 (FEDME 2020-2026). Marcas GR/PR/SL registradas: pedir permiso para usar el nombre/logo | Gratis, descarga CNIG | Pocos MB | Medio (descarga manual, sin API/WFS) | Máxima |
| Datos abiertos Gobierno de Navarra / IDENA | Portal con CC0 en general; sin dataset GR/PR/SL localizado | No verificado | No verificado | -- | -- | Revisar manualmente | -- |
| Komoot / AllTrails / Outdooractive | Rutas curadas | -- | APIs para socios/comerciales; sin acceso verificado para sitio pequeño | Contacto comercial | -- | No viable | Terceros |
| MDT05/MDT25 IGN (elevación) | Perfil altimétrico | Muy buena (LiDAR PNOA) | CC BY 4.0 SCNE-IGN | WCS gratuito o descarga | Navarra MDT25 ~100-200 MB | Medio | Máxima si local |
| OpenTopoData / Open-Elevation | API de elevación autoalojable | Con MDT propio, igual | Según dataset | Gratis | Bajo | Medio (no verificado en esta ronda) | Máxima si local |

(Las cifras de disco/RAM de BRouter, GraphHopper, Valhalla y MDT son estimaciones; no medidas aquí.)

## Arquitectura recomendada

### Fase 2 (MVP, ~3-5 días)
- Tabla `rutas_osm` (osm_id, ref, nombre, red [lwn/rwn/nwn], operador, longitud_m, geom_simplificada GeoJSON/LINESTRING, actualizado) y `megalito_ruta` (megalito_id, ruta_id, dist_min_m, punto_cercano lat/lon).
- Script de ingesta `scripts/build-routes.*`, ejecutado por systemd timer / cron mensual: descarga `navarra-latest.osm.pbf`, filtra `route=hiking`, ensambla las vías de cada relación, simplifica (Douglas-Peucker ~5 m), calcula distancia a cada megalito (índice en rejilla o `ST_Distance_Sphere` de MariaDB 11.4) y vuelca a MariaDB.
- Endpoints Express: `GET /api/megalitos/:id/rutas` (lista), `GET /api/rutas/:id.geojson`, `GET /api/rutas/:id.gpx` (generado en servidor, incluir `<metadata><copyright>` ODbL/OSM y `<link>`).
- Leaflet pinta rutas con la capa de megalitos; ficha del megalito con "Rutas cercanas (GR 282, a 91 m)". Cuando no hay ruta oficial: aviso y enlace a mapa topo.
- Descargo en la UI: "orientativo, comprobar estado, sin garantía; condiciones de montaña".

### Fase 3 (avanzada)
- Contenedor `brouter` (Docker, segmento E0_N40 de `brouter.de/brouter/segments4/`, perfil `hiking-mountain`), solo accesible desde el backend (proxy Express, caché por par de puntos en MariaDB, rate limit ya presente con express-rate-limit).
- "Ruta por N megalitos": usuario selecciona 2-15 puntos, backend ordena (NN + 2-opt, ida y vuelta opcional), llama a BRouter con `lonlats=a|b|c...`, devuelve GeoJSON + GPX.
- Perfil de elevación: muestreo cada ~25 m contra un ráster MDT25 de Navarra preprocesado a GeoTIFF/COG leído con `geotiff` en Node o servido por OpenTopoData local. Ascenso/descenso, dificultad por pendiente.
- Opcional: importar GR/PR/SL FEDME (GPX) como fuente curada cuando se confirme la licencia/atribución y el permiso de las marcas.
- Alternativa si BRouter no convence: GraphHopper o Valhalla (mismo patrón de contenedor).

## Pipeline: precómputo vs. llamadas en vivo
Precómputo para rutas oficiales (datos casi estáticos, 491 puntos, evita depender de Overpass, privacidad total, rápido). Llamadas en vivo solo para routing de usuario (fase 3) contra BRouter propio, con caché. Nada de peticiones del navegador a APIs de terceros; las teselas del mapa base son la única excepción (revisar política de teselas OSM para tráfico público; considerar IGN/PNOA WMTS, CC BY 4.0, o teselas propias).

## Licencias y atribución
- OSM: ODbL. Atribución visible "© OpenStreetMap contributors" en mapa y en cada GPX/descarga; los GPX derivados de datos OSM se consideran base de datos derivada: indicar origen y licencia.
- IGN (MDT, FEDME, PNOA): CC BY 4.0, atribución "IGN / CNIG / FEDME" y año.
- Marcas GR®, PR®, SL®: son de FEDME; usar los códigos como texto descriptivo de OSM es habitual, pero logos/marcas requieren permiso.

## Riesgos
- Calidad desigual en OSM: `sac_scale` y `trail_visibility` escasos (pocos tramos etiquetados); la dificultad no es fiable. Mostrar "orientativo".
- ~30 % de megalitos sin ruta oficial a < 1,5 km: depender de routing sobre sendas, con riesgo de rutas por terreno sin sendero real o propiedad privada/ganado.
- Seguridad: rutas por montaña (Aralar, Pirineo) sin aviso podrían ser peligrosas; añadir disclaimer y no prometer navegación.
- Relaciones OSM cambian (rutas renombradas/rotas): refrescar mensual y registrar fecha.
- Overpass público inestable: no depender de él.
- Wikiloc/Komoot: no usar sin permiso.
- Marca GR/PR/SL y condiciones FEDME: verificar antes de publicar nombres comerciales.
- No verificado: dataset de senderos en datos abiertos de Navarra/IDENA; términos exactos de uso de brouter.de y Waymarked Trails; cifras de RAM de BRouter/GraphHopper/Valhalla.

## Esfuerzo
- Fase 2: 3-5 días (ingesta + tablas + 3 endpoints + capa Leaflet + GPX + atribución).
- Fase 3: 6-10 días (BRouter Docker, proxy y caché, selector de multi-megalito, TSP, MDT y perfil, tests).

## Consultas y endpoints validados
- Overpass (válida, sintaxis; respuesta real obtenida para Aralar; 502 en ejecuciones posteriores):
  `[out:json][timeout:60];relation(around:1500,42.9596,-1.5548)[route=hiking];out tags;` POST a `https://overpass-api.de/api/interpreter` con `User-Agent` identificativo.
- Geofabrik: `https://download.geofabrik.de/europe/spain/navarra-latest.osm.pbf` (HTTP 307 a `navarra-261108.osm.pbf`, 38 MB).
- BRouter: URL anterior (HTTP 200).
- Waymarked Trails: `/api/v1/list/by_area?bbox=...` (HTTP 200).
- IGN MDT WCS: `https://servicios.idee.es/wcs-inspire/mdt?request=GetCoverage&service=WCS&version=2.0.1` (según metadatos, no probado).

## Fuentes
- Overpass API (política y listas de instancias): https://wiki.openstreetmap.org/wiki/Overpass_API
- Overpass manual: https://dev.overpass-api.de/overpass-doc/en/preface/commons.html
- Geofabrik Navarra: https://download.geofabrik.de/europe/spain/navarra.html
- ORS planes y cuotas: https://openrouteservice.org/plans/ ; https://ask.openrouteservice.org/t/updated-api-quotas/500
- GraphHopper planes: https://docs.graphhopper.com/openapi/section/plans-and-rate-limits ; https://www.graphhopper.com/pricing/
- BRouter: https://github.com/abrensch/brouter ; https://brouter.de/brouter/online.html ; segmentos https://brouter.de/brouter/segments4/
- FEDME/IGN senderos (CC BY 4.0): https://www.idee.es/csw-inspire-idee/srv/api/records/spaignFEDME ; CNIG http://centrodedescargas.cnig.es/CentroDescargas/buscar.do?filtro.codFamilia=FEDME
- MDT05 IGN (CC BY 4.0): https://inspire-geoportal.ec.europa.eu/srv/api/records/spaignMDT05
- Datos abiertos Navarra (CC0): https://datos.gob.es/es/iniciativas/open-data-navarra
- Wikiloc términos: https://www.wikiloc.com/wikiloc/terms_en.html
- Waymarked Trails: https://hiking.waymarkedtrails.org
