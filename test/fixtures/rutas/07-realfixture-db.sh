#!/bin/bash
# Test-only: DB `megalitos_real` = megalitos copy + real schema + tools/routes/fixture-rutas.sql (ingestion agent's real routes).
# No-op when the fixture or the real schema is absent, or the seed is the tiny fixture (ids don't match).
D=/docker-entrypoint-initdb.d
[ -f "$D/real-fixture-rutas.txt" ] && [ -f "$D/04-rutas-schema.sql" ] || exit 0
M="mariadb -uroot -p${MARIADB_ROOT_PASSWORD}"
[ "$($M -N -e 'SELECT COUNT(*) FROM megalitos.megalitos WHERE id >= 66')" -gt 0 ] || exit 0
$M <<SQL
CREATE DATABASE megalitos_real CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE megalitos_real.tipologias LIKE megalitos.tipologias;
INSERT INTO megalitos_real.tipologias SELECT * FROM megalitos.tipologias;
CREATE TABLE megalitos_real.megalitos LIKE megalitos.megalitos;
INSERT INTO megalitos_real.megalitos SELECT * FROM megalitos.megalitos;
CREATE TABLE megalitos_real.anexos LIKE megalitos.anexos;
INSERT INTO megalitos_real.anexos SELECT * FROM megalitos.anexos;
GRANT SELECT ON \`megalitos_real\`.* TO '${MYSQL_APP_USER}'@'%';
FLUSH PRIVILEGES;
SQL
sed 's/USE `megalitos`;//' "$D/04-rutas-schema.sql" | $M megalitos_real
sed 's/USE `megalitos`;//' "$D/real-fixture-rutas.txt" | $M megalitos_real
