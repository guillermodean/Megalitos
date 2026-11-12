-- Fase 2: hiking routes (OSM) near megalitos. Source of truth: docs/CONTRACT-FASE2.md
-- Idempotent (CREATE TABLE IF NOT EXISTS); also applied by scripts/refresh-routes.sh on the live DB.
-- Data is (re)loaded by tools/routes/build_routes.py output (single transaction); the
-- schema itself ships empty. The app DB user already has SELECT on megalitos.*.
SET NAMES utf8mb4;
USE `megalitos`;

CREATE TABLE IF NOT EXISTS `rutas` (
  `id`          BIGINT UNSIGNED NOT NULL,
  `ref`         VARCHAR(40) NULL,
  `nombre`      VARCHAR(255) NULL,
  `red`         ENUM('iwn','nwn','rwn','lwn') NULL,
  `operador`    VARCHAR(160) NULL,
  `desde`       VARCHAR(160) NULL,
  `hasta`       VARCHAR(160) NULL,
  `web`         VARCHAR(255) NULL,
  `simbolo`     VARCHAR(80) NULL,
  `longitud_m`  INT UNSIGNED NOT NULL,
  `min_lat`     DECIMAL(9,6) NULL,
  `min_lon`     DECIMAL(9,6) NULL,
  `max_lat`     DECIMAL(9,6) NULL,
  `max_lon`     DECIMAL(9,6) NULL,
  `geojson`      MEDIUMTEXT NOT NULL,
  `geojson_lite` MEDIUMTEXT NOT NULL,
  `n_megalitos` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `actualizado` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_rutas_n_megalitos` (`n_megalitos`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `megalito_ruta` (
  `megalito_id` SMALLINT UNSIGNED NOT NULL,
  `ruta_id`     BIGINT UNSIGNED NOT NULL,
  `dist_m`      INT UNSIGNED NOT NULL,
  `acceso_lat`  DECIMAL(9,6) NOT NULL,
  `acceso_lon`  DECIMAL(9,6) NOT NULL,
  PRIMARY KEY (`megalito_id`, `ruta_id`),
  KEY `idx_megalito_ruta_ruta_dist` (`ruta_id`, `dist_m`),
  CONSTRAINT `fk_megalito_ruta_megalito` FOREIGN KEY (`megalito_id`) REFERENCES `megalitos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_megalito_ruta_ruta` FOREIGN KEY (`ruta_id`) REFERENCES `rutas` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `megalito_acceso` (
  `megalito_id`  SMALLINT UNSIGNED NOT NULL,
  `senda_dist_m` INT UNSIGNED NULL,
  `senda_tipo`   VARCHAR(20) NULL,
  `senda_sac`    VARCHAR(40) NULL,
  `actualizado`  DATETIME NOT NULL,
  PRIMARY KEY (`megalito_id`),
  CONSTRAINT `fk_megalito_acceso_megalito` FOREIGN KEY (`megalito_id`) REFERENCES `megalitos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rutas_meta` (
  `clave` VARCHAR(40) NOT NULL,
  `valor` VARCHAR(255) NULL,
  PRIMARY KEY (`clave`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
