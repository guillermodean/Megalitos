-- Megalitos Navarra schema (MariaDB 11.4). Source of truth: app/docs/CONTRACT.md
-- Runs on first init of the official mariadb image (/docker-entrypoint-initdb.d).
SET NAMES utf8mb4;
CREATE DATABASE IF NOT EXISTS `megalitos` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `megalitos`;

CREATE TABLE `tipologias` (
  `id`     TINYINT UNSIGNED NOT NULL,
  `nombre` VARCHAR(40) NOT NULL,
  `slug`   VARCHAR(40) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tipologias_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `megalitos` (
  `id`                     SMALLINT UNSIGNED NOT NULL,
  `nombre`                 VARCHAR(80) NOT NULL,
  `tipologia_id`           TINYINT UNSIGNED NULL,
  `tipologia_texto`        VARCHAR(60) NULL,
  `municipio`              VARCHAR(120) NULL,
  `ubicacion`              VARCHAR(255) NULL,
  `itinerario_texto`       TEXT NULL,
  `hoja_cartografica`      VARCHAR(40) NULL,
  `utm_x`                  INT NULL,
  `utm_y`                  INT NULL,
  `altitud`                SMALLINT NULL,
  `lat`                    DECIMAL(9,6) NULL,
  `lon`                    DECIMAL(9,6) NULL,
  `coord_fuente`           ENUM('utm','gpx','original') NULL,
  `localizado_fecha`       DATE NULL,
  `localizado_fecha_texto` VARCHAR(40) NULL,
  `localizado_autor`       VARCHAR(120) NULL,
  `descripcion`            TEXT NULL,
  `excavacion`             TEXT NULL,
  `observaciones`          TEXT NULL,
  `caracteristicas`        VARCHAR(255) NULL,
  `otros_aspectos`         VARCHAR(120) NULL,
  PRIMARY KEY (`id`),
  KEY `idx_megalitos_tipologia` (`tipologia_id`),
  KEY `idx_megalitos_municipio` (`municipio`(60)),
  FULLTEXT KEY `ft_busqueda` (`nombre`, `municipio`, `ubicacion`, `descripcion`),
  CONSTRAINT `fk_megalitos_tipologia` FOREIGN KEY (`tipologia_id`) REFERENCES `tipologias` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `anexos` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `megalito_id` SMALLINT UNSIGNED NOT NULL,
  `tipo`        ENUM('DIB','FOT','MAP','TEX') NOT NULL,
  `archivo`     VARCHAR(40) NOT NULL,
  `orden`       TINYINT UNSIGNED NOT NULL,
  `existe`      BOOLEAN NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_anexos_megalito_tipo_orden` (`megalito_id`, `tipo`, `orden`),
  CONSTRAINT `fk_anexos_megalito` FOREIGN KEY (`megalito_id`) REFERENCES `megalitos` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
