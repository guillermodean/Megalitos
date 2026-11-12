SET NAMES utf8mb4;
INSERT INTO tipologias VALUES (1,'Dolmen','dolmen'),(2,'Túmulo','tumulo'),(3,'Menhir','menhir');
INSERT INTO megalitos (id,nombre,tipologia_id,tipologia_texto,municipio,ubicacion,altitud,lat,lon,coord_fuente,localizado_fecha,descripcion) VALUES
(1,'Dolmen de Aizkomendi',1,'Dolmen','Eguilaz','Sierra de Entzia',700,42.7,-2.3,'utm','1990-05-01','Primera linea.\n\nSegunda <b>parrafo</b>.'),
(2,'Túmulo de Bidaurreta',2,'Túmulo?','Burguete','Collado',900,42.9,-1.3,'gpx',NULL,'Un tumulo en el collado.'),
(5,'Menhir 100% Alto_Rojo',3,'Menhir','Eguilaz',NULL,NULL,NULL,NULL,NULL,NULL,NULL),
(7,'Sin tipologia',NULL,NULL,NULL,NULL,NULL,43.0,-1.5,'original',NULL,NULL);
INSERT INTO anexos (megalito_id,tipo,archivo,orden,existe) VALUES
(1,'FOT','0001_FOT_1_1.jpg',1,1),(1,'DIB','0001_DIB_1_1.jpg',1,1),(1,'FOT','0001_FOT_1_2.jpg',2,0),
(2,'MAP','0002_MAP_1_1.jpg',1,1);
