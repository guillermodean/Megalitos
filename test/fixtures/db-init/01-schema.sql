SET NAMES utf8mb4;
CREATE TABLE tipologias (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  nombre VARCHAR(40) NOT NULL,
  slug VARCHAR(40) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE megalitos (
  id SMALLINT UNSIGNED NOT NULL PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL,
  tipologia_id TINYINT UNSIGNED NULL,
  tipologia_texto VARCHAR(60) NULL,
  municipio VARCHAR(120) NULL,
  ubicacion VARCHAR(255) NULL,
  itinerario_texto TEXT NULL,
  hoja_cartografica VARCHAR(40) NULL,
  utm_x INT NULL, utm_y INT NULL,
  altitud SMALLINT NULL,
  lat DECIMAL(9,6) NULL, lon DECIMAL(9,6) NULL,
  coord_fuente ENUM('utm','gpx','original') NULL,
  localizado_fecha DATE NULL,
  localizado_fecha_texto VARCHAR(40) NULL,
  localizado_autor VARCHAR(120) NULL,
  descripcion TEXT NULL, excavacion TEXT NULL, observaciones TEXT NULL,
  caracteristicas VARCHAR(255) NULL, otros_aspectos VARCHAR(120) NULL,
  FULLTEXT KEY ft_busqueda (nombre, municipio, ubicacion, descripcion),
  CONSTRAINT fk_tipologia FOREIGN KEY (tipologia_id) REFERENCES tipologias(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE anexos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  megalito_id SMALLINT UNSIGNED NOT NULL,
  tipo ENUM('DIB','FOT','MAP','TEX') NOT NULL,
  archivo VARCHAR(40) NOT NULL,
  orden TINYINT UNSIGNED NOT NULL,
  existe BOOLEAN NOT NULL DEFAULT 1,
  KEY (megalito_id, tipo, orden),
  CONSTRAINT fk_megalito FOREIGN KEY (megalito_id) REFERENCES megalitos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
