'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../src/app');
const { loadConfig } = require('../src/config');

const FIXTURE_VIEWS = path.join(__dirname, 'fixtures', 'views');

const baseEnv = { DB_HOST: 'x', DB_USER: 'u', DB_PASSWORD: 'p' };

function makeDirs() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'megalitos-test-'));
  const images = path.join(root, 'anexos');
  const thumbs = path.join(root, 'thumbs');
  fs.mkdirSync(images); fs.mkdirSync(thumbs);
  fs.writeFileSync(path.join(images, '0001_FOT_1_1.jpg'), 'jpgdata');
  fs.writeFileSync(path.join(images, '0001_DIB_1_1.jpg'), 'jpgdata');
  fs.writeFileSync(path.join(thumbs, '0001_FOT_1_1.webp'), 'webpdata');
  fs.writeFileSync(path.join(root, 'secret.txt'), 'secret');
  return { root, images, thumbs };
}

function buildApp({ repo, env = {}, viewsDir = FIXTURE_VIEWS, dirs = makeDirs() } = {}) {
  const config = loadConfig({ ...baseEnv, IMAGES_DIR: dirs.images, THUMBS_DIR: dirs.thumbs, ...env });
  const logs = [];
  const app = createApp({ config, repo, viewsDir, log: (e) => logs.push(e) });
  return { app, logs, dirs, config };
}

// In-memory repo with the same surface as lib/repo.js (no DB needed).
function fakeRepo(overrides = {}) {
  const card = { id: 1, nombre: 'Dolmen X', tipologia: 'Dolmen', municipio: 'Eguilaz', altitud: 700, thumb: null };
  return {
    ping: async () => {},
    tipologias: async () => [{ id: 1, nombre: 'Dolmen', slug: 'dolmen' }],
    municipios: async () => ['Eguilaz'],
    stats: async () => ({ total: 1, conCoordenadas: 1, totalImagenes: 0, tipologias: [] }),
    destacados: async () => [card],
    search: async () => [card],
    getMegalito: async (id) => (id === 1 ? { id: 1, nombre: 'Dolmen X', tipologia: 'Dolmen', municipio: 'Eguilaz', lat: 42, lon: -2, descripcion: '<script>alert(1)</script>' } : null),
    getAnexos: async () => ({ dib: [], fot: [], map: [], tex: [] }),
    prevNext: async () => ({ prev: null, next: null }),
    geojson: async () => ({ type: 'FeatureCollection', features: [] }),
    // rutas (phase 2)
    rutasDisponibles: async () => true,
    redes: () => [{ value: 'iwn', nombre: 'Internacional' }, { value: 'nwn', nombre: 'Nacional (GR)' },
      { value: 'rwn', nombre: 'Regional' }, { value: 'lwn', nombre: 'Local' }],
    rutasMeta: async () => ({ actualizado: '2026-11-10', nRutas: 1 }),
    listRutas: async () => [FAKE_RUTA_CARD],
    getRuta: async (id) => (id === 123 ? FAKE_RUTA : null),
    getRutaGeometry: async (id) => (id === 123 ? FAKE_GEOM : null),
    megalitosDeRuta: async () => [{ ...card, distM: 120, lat: 42, lon: -2 }],
    rutasCercanas: async () => [],
    acceso: async () => null,
    rutasLiteJson: async () => JSON.stringify({ type: 'FeatureCollection', features: [] }),
    rutaFeature: async (id) => (id === 123 ? { type: 'Feature', geometry: FAKE_GEOM, properties: { id: 123 } } : null),
    ...overrides,
  };
}

const FAKE_RUTA_CARD = { id: 123, ref: 'GR 11', nombre: 'Camino & <x>', red: 'nwn', redNombre: 'Nacional (GR)',
  longitudKm: '12,4', nMegalitos: 1 };
const FAKE_RUTA = { ...FAKE_RUTA_CARD, operador: null, desde: 'A', hasta: 'B', web: null, simbolo: null,
  actualizado: '2026-11-10 20:21:00', longitudM: 12400 };
const FAKE_GEOM = { type: 'MultiLineString', coordinates: [[[-2.3, 42.7], [-2.2, 42.8]], [[-2.1, 42.9], [-2.0, 43.0]]] };

// Minimal strict XML well-formedness check (no XML parser in deps). Returns the number of elements.
// Throws on: unescaped < or & in text/attributes, bad entity, unbalanced tags, unquoted attributes.
function assertWellFormedXml(xml) {
  const tokenRe = /<\?xml[^>]*\?>|<\/([A-Za-z_][\w:.-]*)\s*>|<([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+="[^"<&]*(?:&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);[^"<&]*)*")*)\s*(\/?)>/gy;
  const stack = []; let pos = 0; let n = 0; let root = 0;
  const checkText = (t) => {
    if (/[<>]/.test(t.replace(/\s/g, '')) && /</.test(t)) throw new Error(`raw < in text: ${t.slice(0, 40)}`);
    if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i.test(t)) throw new Error(`bad entity in text: ${t.slice(0, 40)}`);
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(t)) throw new Error('control char');
    if (t.trim() && !stack.length) throw new Error('text outside root');
  };
  while (pos < xml.length) {
    const lt = xml.indexOf('<', pos);
    if (lt === -1) { checkText(xml.slice(pos)); break; }
    checkText(xml.slice(pos, lt));
    tokenRe.lastIndex = lt;
    const m = tokenRe.exec(xml);
    if (!m) throw new Error(`bad markup at ${lt}: ${xml.slice(lt, lt + 60)}`);
    if (m[1]) {
      if (stack.pop() !== m[1]) throw new Error(`mismatched </${m[1]}>`);
    } else if (m[2]) {
      n += 1;
      if (!stack.length) root += 1;
      if (!m[4]) stack.push(m[2]);
    }
    pos = tokenRe.lastIndex;
  }
  if (stack.length) throw new Error(`unclosed <${stack.pop()}>`);
  if (root !== 1) throw new Error(`expected 1 root, got ${root}`);
  return n;
}

module.exports = { assertWellFormedXml, buildApp, fakeRepo, makeDirs, baseEnv, FIXTURE_VIEWS };
