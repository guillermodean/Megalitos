#!/bin/bash
# Test-only: a second DB that looks like the phase-1 production DB (no rutas tables).
mariadb -uroot -p"${MARIADB_ROOT_PASSWORD}" <<SQL
CREATE DATABASE megalitos_norutas CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE megalitos_norutas.tipologias LIKE megalitos.tipologias;
INSERT INTO megalitos_norutas.tipologias SELECT * FROM megalitos.tipologias;
CREATE TABLE megalitos_norutas.megalitos LIKE megalitos.megalitos;
INSERT INTO megalitos_norutas.megalitos SELECT * FROM megalitos.megalitos;
CREATE TABLE megalitos_norutas.anexos LIKE megalitos.anexos;
INSERT INTO megalitos_norutas.anexos SELECT * FROM megalitos.anexos;
GRANT SELECT ON \`megalitos_norutas\`.* TO '${MYSQL_APP_USER}'@'%';
FLUSH PRIVILEGES;
SQL
