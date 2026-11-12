-- Test copy of the phase-2 schema (CONTRACT-FASE2.md). run.sh prefers db/init/04-rutas-schema.sql when present.
SET NAMES utf8mb4;
CREATE TABLE IF NOT EXISTS rutas (
  id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  ref VARCHAR(40) NULL,
  nombre VARCHAR(255) NULL,
  red ENUM('iwn','nwn','rwn','lwn') NULL,
  operador VARCHAR(160) NULL,
  desde VARCHAR(160) NULL, hasta VARCHAR(160) NULL,
  web VARCHAR(255) NULL,
  simbolo VARCHAR(80) NULL,
  longitud_m INT UNSIGNED NOT NULL,
  min_lat DECIMAL(9,6), min_lon DECIMAL(9,6), max_lat DECIMAL(9,6), max_lon DECIMAL(9,6),
  geojson MEDIUMTEXT NOT NULL,
  geojson_lite MEDIUMTEXT NOT NULL,
  n_megalitos SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  actualizado DATETIME NOT NULL,
  KEY (n_megalitos)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS megalito_ruta (
  megalito_id SMALLINT UNSIGNED NOT NULL,
  ruta_id BIGINT UNSIGNED NOT NULL,
  dist_m INT UNSIGNED NOT NULL,
  acceso_lat DECIMAL(9,6) NOT NULL, acceso_lon DECIMAL(9,6) NOT NULL,
  PRIMARY KEY (megalito_id, ruta_id), KEY (ruta_id, dist_m),
  CONSTRAINT fk_mr_megalito FOREIGN KEY (megalito_id) REFERENCES megalitos(id) ON DELETE CASCADE,
  CONSTRAINT fk_mr_ruta FOREIGN KEY (ruta_id) REFERENCES rutas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS megalito_acceso (
  megalito_id SMALLINT UNSIGNED NOT NULL PRIMARY KEY,
  senda_dist_m INT UNSIGNED NULL,
  senda_tipo VARCHAR(20) NULL,
  senda_sac VARCHAR(40) NULL,
  actualizado DATETIME NOT NULL,
  CONSTRAINT fk_ma_megalito FOREIGN KEY (megalito_id) REFERENCES megalitos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS rutas_meta (
  clave VARCHAR(40) NOT NULL PRIMARY KEY,
  valor VARCHAR(255) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
