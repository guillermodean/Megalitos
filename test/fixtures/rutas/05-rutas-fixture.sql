-- Test routes. Links use the two lowest megalito ids so it works on the tiny fixture DB and the real seed.
SET NAMES utf8mb4;
SET @a = (SELECT MIN(id) FROM megalitos);
SET @b = (SELECT MIN(id) FROM megalitos WHERE id > @a);
INSERT INTO rutas (id, ref, nombre, red, operador, desde, hasta, web, simbolo, longitud_m,
  min_lat, min_lon, max_lat, max_lon, geojson, geojson_lite, n_megalitos, actualizado) VALUES
(1001, 'GR 11', 'Camino & <Ruta> "de" ''Ñandú''', 'nwn', 'FEDME', 'Orreaga', 'Zuriza', 'https://example.org/gr11', 'red:white:red_bar',
 12400, 42.7, -2.4, 42.8, -2.2,
 '{"type":"MultiLineString","coordinates":[[[-2.3,42.7],[-2.29,42.71],[-2.28,42.72]],[[-2.25,42.75],[-2.24,42.76]]]}',
 '{"type":"MultiLineString","coordinates":[[[-2.3,42.7],[-2.28,42.72]],[[-2.25,42.75],[-2.24,42.76]]]}',
 1, '2026-11-10 20:21:00'),
(1002, 'PR-NA 82', 'Vuelta a Eguilaz', 'rwn', NULL, NULL, NULL, NULL, NULL,
 3050, 42.6, -2.3, 42.65, -2.2,
 '{"type":"MultiLineString","coordinates":[[[-2.2,42.6],[-2.21,42.61],[-2.22,42.62]]]}',
 '{"type":"MultiLineString","coordinates":[[[-2.2,42.6],[-2.22,42.62]]]}',
 0, '2026-11-10 20:21:00'),
(1003, NULL, 'Sendero sin clasificar', NULL, NULL, NULL, NULL, NULL, NULL,
 999, 42.9, -1.3, 42.95, -1.25,
 '{"type":"MultiLineString","coordinates":[[[-1.3,42.9],[-1.25,42.95]]]}',
 '{"type":"MultiLineString","coordinates":[[[-1.3,42.9],[-1.25,42.95]]]}',
 0, '2026-11-10 20:21:00');
INSERT INTO megalito_ruta (megalito_id, ruta_id, dist_m, acceso_lat, acceso_lon) VALUES
(@a, 1001, 120, 42.701000, -2.299000),
(@b, 1001, 800, 42.711000, -2.289000),
(@a, 1002, 1400, 42.601000, -2.201000),
(@b, 1003, 300, 42.901000, -1.299000);
INSERT INTO megalito_acceso (megalito_id, senda_dist_m, senda_tipo, senda_sac, actualizado) VALUES
(@a, 35, 'track', NULL, '2026-11-10 20:21:00'),
(@b, NULL, NULL, NULL, '2026-11-10 20:21:00');
INSERT INTO rutas_meta (clave, valor) VALUES
('osm_timestamp', '2026-11-10T20:21:00Z'), ('generado', '2026-11-11'), ('n_rutas', '3'), ('fuente', 'OpenStreetMap contributors (ODbL), Geofabrik');
