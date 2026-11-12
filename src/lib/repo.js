'use strict';

// All SQL lives here. Every query is parameterised.

const { escapeLike, booleanQuery } = require('./validate');

const TIPO_LABEL = { DIB: 'Dibujo', FOT: 'Fotografía', MAP: 'Mapa', TEX: 'Texto' };
const CACHE_MS = 10 * 60 * 1000;
const LITE_CACHE_MS = 60 * 60 * 1000;
const MISSING_RETRY_MS = 60 * 1000;
const MAX_NEAR_ROUTE_M = 1000;
const MAX_NEAR_MEGALITO_M = 1500;
const MAX_NEAR_MEGALITO_N = 8;

const RED_NOMBRE = {
  iwn: 'Internacional', nwn: 'Nacional (GR)', rwn: 'Regional', lwn: 'Local',
};
const redNombre = (red) => RED_NOMBRE[red] || 'Sin clasificar';
const km = (m) => (Number(m) / 1000).toFixed(1).replace('.', ',');
const isMissingTable = (e) => e && (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146);

function toRutaCard(r) {
  return {
    id: r.id, ref: r.ref ?? null, nombre: r.nombre ?? null, red: r.red ?? null, redNombre: redNombre(r.red),
    longitudKm: km(r.longitud_m), nMegalitos: Number(r.n_megalitos),
  };
}

function toRutaCercana(r) {
  return {
    id: r.id, ref: r.ref ?? null, nombre: r.nombre ?? null, red: r.red ?? null, redNombre: redNombre(r.red),
    distM: Number(r.dist_m), longitudKm: km(r.longitud_m), accesoLat: r.acceso_lat, accesoLon: r.acceso_lon,
  };
}

// Stored GeoJSON text -> geometry object (null when unparsable). Tolerates Feature wrappers.
function parseGeometry(text) {
  try {
    const g = JSON.parse(text);
    return g && g.type === 'Feature' ? g.geometry : g;
  } catch { return null; }
}

const thumbOf = (archivo) => (archivo ? `/anexos/thumbs/${archivo.replace(/\.jpg$/, '')}.webp` : null);

// First available photo of a megalito, used as card thumbnail.
const THUMB_SQL = `(SELECT a.archivo FROM anexos a
  WHERE a.megalito_id = m.id AND a.tipo = 'FOT' AND a.existe = 1
  ORDER BY a.orden LIMIT 1)`;

function toCard(r) {
  return {
    id: r.id,
    nombre: r.nombre,
    tipologia: r.tipologia ?? null,
    municipio: r.municipio ?? null,
    altitud: r.altitud ?? null,
    thumb: thumbOf(r.thumb_archivo),
  };
}

function toMegalito(r) {
  return {
    id: r.id,
    nombre: r.nombre,
    tipologia: r.tipologia ?? null,
    tipologiaTexto: r.tipologia_texto,
    municipio: r.municipio,
    ubicacion: r.ubicacion,
    itinerarioTexto: r.itinerario_texto,
    hojaCartografica: r.hoja_cartografica,
    utmX: r.utm_x,
    utmY: r.utm_y,
    altitud: r.altitud,
    lat: r.lat,
    lon: r.lon,
    localizadoFecha: r.localizado_fecha || null,
    localizadoFechaTexto: r.localizado_fecha_texto,
    localizadoAutor: r.localizado_autor,
    descripcion: r.descripcion,
    excavacion: r.excavacion,
    observaciones: r.observaciones,
    caracteristicas: r.caracteristicas,
    otrosAspectos: r.otros_aspectos,
  };
}

function toImg(a, nombre) {
  const base = a.archivo.replace(/\.jpg$/, '');
  return {
    src: `/anexos/${a.archivo}`,
    thumb: `/anexos/thumbs/${base}.webp`,
    alt: `${TIPO_LABEL[a.tipo] || a.tipo} ${a.orden} de ${nombre}`,
    tipo: a.tipo,
  };
}

function createRepo(pool) {
  const cache = new Map();
  async function cached(key, fn) {
    const hit = cache.get(key);
    if (hit && hit.exp > Date.now()) return hit.value;
    const value = await fn();
    cache.set(key, { value, exp: Date.now() + CACHE_MS });
    return value;
  }
  const query = async (sql, params = []) => (await pool.execute(sql, params))[0];

  // --- rutas (phase 2): tables may be missing on an old DB -> "not available", pages keep working.
  let rutasState = { ok: false, exp: 0 };
  async function rutasDisponibles() {
    if (rutasState.exp > Date.now()) return rutasState.ok;
    let ok;
    try {
      const [r] = await query('SELECT COUNT(*) AS n FROM rutas');
      ok = Number(r.n) > 0;
    } catch (e) {
      if (!isMissingTable(e)) throw e;
      ok = false;
    }
    rutasState = { ok, exp: Date.now() + (ok ? CACHE_MS : MISSING_RETRY_MS) };
    return ok;
  }
  // Run fn only when rutas exist; any missing-table error degrades to the fallback.
  async function guard(fn, fallback) {
    if (!(await rutasDisponibles())) return fallback;
    try { return await fn(); } catch (e) {
      if (!isMissingTable(e)) throw e;
      rutasState = { ok: false, exp: Date.now() + MISSING_RETRY_MS };
      return fallback;
    }
  }
  let liteCache = { json: null, exp: 0 };

  const repo = {
    async ping() {
      await pool.query('SELECT 1');
    },

    tipologias() {
      return cached('tipologias', () =>
        query('SELECT id, nombre, slug FROM tipologias ORDER BY nombre'));
    },

    municipios() {
      return cached('municipios', async () =>
        (await query(`SELECT DISTINCT municipio FROM megalitos
          WHERE municipio IS NOT NULL AND municipio <> '' ORDER BY municipio`)).map((r) => r.municipio));
    },

    async stats() {
      const [t] = await query(`SELECT COUNT(*) AS total,
        SUM(lat IS NOT NULL AND lon IS NOT NULL) AS con_coord FROM megalitos`);
      const [i] = await query('SELECT COUNT(*) AS n FROM anexos WHERE existe = 1');
      const tip = await query(`SELECT t.nombre, t.slug, COUNT(m.id) AS count
        FROM tipologias t LEFT JOIN megalitos m ON m.tipologia_id = t.id
        GROUP BY t.id, t.nombre, t.slug HAVING COUNT(m.id) > 0 ORDER BY count DESC, t.nombre`);
      return {
        total: Number(t.total),
        conCoordenadas: Number(t.con_coord || 0),
        totalImagenes: Number(i.n),
        tipologias: tip.map((r) => ({ nombre: r.nombre, slug: r.slug, count: Number(r.count) })),
      };
    },

    async destacados(n = 6) {
      const rows = await query(`SELECT m.id, m.nombre, t.nombre AS tipologia, m.municipio, m.altitud,
          ${THUMB_SQL} AS thumb_archivo
        FROM megalitos m LEFT JOIN tipologias t ON t.id = m.tipologia_id
        WHERE EXISTS (SELECT 1 FROM anexos a WHERE a.megalito_id = m.id AND a.tipo = 'FOT' AND a.existe = 1)
        ORDER BY RAND() LIMIT ${Math.max(1, Math.min(50, Number(n) | 0))}`);
      return rows.map(toCard);
    },

    // filters: { q, tipo (validated slug or ''), municipio }
    async search({ q = '', tipo = '', municipio = '' } = {}) {
      const where = [];
      const params = [];
      if (q) {
        const like = `%${escapeLike(q)}%`;
        const bq = q.length >= 3 ? booleanQuery(q) : null;
        if (bq) {
          where.push('(MATCH(m.nombre, m.municipio, m.ubicacion, m.descripcion) AGAINST (? IN BOOLEAN MODE) OR m.nombre LIKE ?)');
          params.push(bq, like);
        } else {
          where.push('m.nombre LIKE ?');
          params.push(like);
        }
      }
      if (tipo) {
        where.push('t.slug = ?');
        params.push(tipo);
      }
      if (municipio) {
        where.push('m.municipio = ?');
        params.push(municipio);
      }
      const rows = await query(`SELECT m.id, m.nombre, t.nombre AS tipologia, m.municipio, m.altitud,
          ${THUMB_SQL} AS thumb_archivo
        FROM megalitos m LEFT JOIN tipologias t ON t.id = m.tipologia_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY m.nombre, m.id`, params);
      return rows.map(toCard);
    },

    async getMegalito(id) {
      const [r] = await query(`SELECT m.*, t.nombre AS tipologia
        FROM megalitos m LEFT JOIN tipologias t ON t.id = m.tipologia_id WHERE m.id = ?`, [id]);
      return r ? toMegalito(r) : null;
    },

    async getAnexos(id, nombre) {
      const rows = await query(`SELECT tipo, archivo, orden FROM anexos
        WHERE megalito_id = ? AND existe = 1 ORDER BY orden, id`, [id]);
      const out = { dib: [], fot: [], map: [], tex: [] };
      for (const a of rows) out[a.tipo.toLowerCase()].push(toImg(a, nombre));
      return out;
    },

    async prevNext(id) {
      const [p] = await query('SELECT id, nombre FROM megalitos WHERE id < ? ORDER BY id DESC LIMIT 1', [id]);
      const [n] = await query('SELECT id, nombre FROM megalitos WHERE id > ? ORDER BY id ASC LIMIT 1', [id]);
      return { prev: p || null, next: n || null };
    },

    async geojson() {
      const rows = await query(`SELECT m.id, m.nombre, t.nombre AS tipologia, m.municipio, m.altitud, m.lat, m.lon
        FROM megalitos m LEFT JOIN tipologias t ON t.id = m.tipologia_id
        WHERE m.lat IS NOT NULL AND m.lon IS NOT NULL ORDER BY m.id`);
      return {
        type: 'FeatureCollection',
        features: rows.map((r) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
          properties: {
            id: r.id, nombre: r.nombre, tipologia: r.tipologia ?? null,
            municipio: r.municipio ?? null, altitud: r.altitud ?? null,
          },
        })),
      };
    },

    // ---------- rutas ----------
    rutasDisponibles,

    redes() {
      return Object.entries(RED_NOMBRE).map(([value, nombre]) => ({ value, nombre }));
    },

    rutasMeta() {
      return guard(() => cached('rutasMeta', async () => {
        const rows = await query('SELECT clave, valor FROM rutas_meta').catch((e) => {
          if (isMissingTable(e)) return [];
          throw e;
        });
        const m = Object.fromEntries(rows.map((r) => [r.clave, r.valor]));
        const [agg] = await query('SELECT COUNT(*) AS n, MAX(actualizado) AS act FROM rutas');
        const raw = m.osm_timestamp || agg.act || null;
        const iso = raw && /^(\d{4}-\d{2}-\d{2})/.exec(String(raw));
        return { actualizado: iso ? iso[1] : raw, nRutas: Number(agg.n) };
      }), null);
    },

    // filters: { q, red } already validated by the caller.
    listRutas({ q = '', red = '' } = {}) {
      return guard(async () => {
        const where = [];
        const params = [];
        if (q) {
          const like = `%${escapeLike(q)}%`;
          where.push('(r.ref LIKE ? OR r.nombre LIKE ?)');
          params.push(like, like);
        }
        if (red) {
          where.push('r.red = ?');
          params.push(red);
        }
        const rows = await query(`SELECT r.id, r.ref, r.nombre, r.red, r.longitud_m, r.n_megalitos
          FROM rutas r ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
          ORDER BY r.n_megalitos DESC, r.ref IS NULL, r.ref, r.nombre, r.id`, params);
        return rows.map(toRutaCard);
      }, []);
    },

    getRuta(id) {
      return guard(async () => {
        const [r] = await query(`SELECT id, ref, nombre, red, operador, desde, hasta, web, simbolo,
            longitud_m, n_megalitos, actualizado FROM rutas WHERE id = ?`, [id]);
        if (!r) return null;
        return {
          ...toRutaCard(r), operador: r.operador ?? null, desde: r.desde ?? null, hasta: r.hasta ?? null,
          web: r.web ?? null, simbolo: r.simbolo ?? null, actualizado: r.actualizado ?? null,
          longitudM: Number(r.longitud_m),
        };
      }, null);
    },

    // Parsed detail geometry (object) or null.
    getRutaGeometry(id) {
      return guard(async () => {
        const [r] = await query('SELECT geojson FROM rutas WHERE id = ?', [id]);
        return r ? parseGeometry(r.geojson) : null;
      }, null);
    },

    // Megalitos within maxM of the route, nearest first.
    megalitosDeRuta(id, maxM = MAX_NEAR_ROUTE_M) {
      return guard(async () => {
        const rows = await query(`SELECT m.id, m.nombre, t.nombre AS tipologia, m.municipio, m.altitud,
            m.lat, m.lon, mr.dist_m, ${THUMB_SQL} AS thumb_archivo
          FROM megalito_ruta mr JOIN megalitos m ON m.id = mr.megalito_id
          LEFT JOIN tipologias t ON t.id = m.tipologia_id
          WHERE mr.ruta_id = ? AND mr.dist_m <= ? ORDER BY mr.dist_m, m.id`, [id, Math.floor(maxM)]);
        return rows.map((r) => ({ ...toCard(r), distM: Number(r.dist_m), lat: r.lat ?? null, lon: r.lon ?? null }));
      }, []);
    },

    rutasCercanas(megalitoId, maxM = MAX_NEAR_MEGALITO_M, limit = MAX_NEAR_MEGALITO_N) {
      return guard(async () => {
        const n = Math.max(1, Math.min(50, Number(limit) | 0));
        const rows = await query(`SELECT r.id, r.ref, r.nombre, r.red, r.longitud_m, mr.dist_m,
            mr.acceso_lat, mr.acceso_lon
          FROM megalito_ruta mr JOIN rutas r ON r.id = mr.ruta_id
          WHERE mr.megalito_id = ? AND mr.dist_m <= ?
          ORDER BY mr.dist_m, r.n_megalitos DESC, r.id LIMIT ${n}`, [megalitoId, Math.floor(maxM)]);
        return rows.map(toRutaCercana);
      }, []);
    },

    acceso(megalitoId) {
      return guard(async () => {
        const [r] = await query(`SELECT senda_dist_m, senda_tipo, senda_sac FROM megalito_acceso
          WHERE megalito_id = ?`, [megalitoId]);
        if (!r || r.senda_dist_m === null) return null;
        return { sendaDistM: Number(r.senda_dist_m), sendaTipo: r.senda_tipo ?? null, sendaSac: r.senda_sac ?? null };
      }, null);
    },

    // JSON string of the lite FeatureCollection (parsed once, cached 1 h).
    async rutasLiteJson() {
      if (liteCache.json && liteCache.exp > Date.now()) return liteCache.json;
      const json = await guard(async () => {
        const rows = await query(`SELECT id, ref, nombre, red, n_megalitos, geojson_lite FROM rutas
          ORDER BY n_megalitos DESC, id`);
        const features = [];
        for (const r of rows) {
          const geometry = parseGeometry(r.geojson_lite);
          if (!geometry) continue;
          features.push({ type: 'Feature', geometry,
            properties: { id: r.id, ref: r.ref ?? null, nombre: r.nombre ?? null, red: r.red ?? null,
              n_megalitos: Number(r.n_megalitos) } });
        }
        return JSON.stringify({ type: 'FeatureCollection', features });
      }, null);
      if (json === null) return JSON.stringify({ type: 'FeatureCollection', features: [] });
      liteCache = { json, exp: Date.now() + LITE_CACHE_MS };
      return json;
    },

    // Feature with detail geometry + full properties, or null.
    async rutaFeature(id) {
      const [ruta, geometry] = await Promise.all([repo.getRuta(id), repo.getRutaGeometry(id)]);
      if (!ruta || !geometry) return null;
      return { type: 'Feature', geometry, properties: {
        id: ruta.id, ref: ruta.ref, nombre: ruta.nombre, red: ruta.red, redNombre: ruta.redNombre,
        operador: ruta.operador, desde: ruta.desde, hasta: ruta.hasta, web: ruta.web, simbolo: ruta.simbolo,
        longitud_m: ruta.longitudM, n_megalitos: ruta.nMegalitos,
        actualizado: ruta.actualizado } };
    },
  };
  return repo;
}

module.exports = { createRepo };
