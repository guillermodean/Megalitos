'use strict';
// Hand-written view models for the design preview. Entries 1, 24 and 41 are real rows
// from Docs/1-Mysql/megalitos.sql; the long-text example repeats real observation text.
const fs = require('fs');
const path = require('path');

const IMG_DIR = process.env.IMAGES_DIR || '/data/anexos';
const geo = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/megalitos.geojson'), 'utf8'));

let files = [];
try { files = fs.readdirSync(IMG_DIR); } catch { /* no images mounted: thumbs stay null */ }
const byId = {};
for (const f of files) {
  const m = /^(\d{4})_(DIB|FOT|MAP|TEX)_(\d+)_(\d+)\.jpg$/.exec(f);
  if (!m) continue;
  (byId[+m[1]] ||= []).push({ f, tipo: m[2], n: +m[4] });
}
Object.values(byId).forEach((a) => a.sort((x, y) => x.n - y.n));
const img = (a) => ({ src: '/anexos/' + a.f, thumb: '/anexos/thumbs/' + a.f.replace(/\.jpg$/, '.webp'), tipo: a.tipo, alt: `${{ DIB: 'Dibujo', FOT: 'Fotografía', MAP: 'Mapa', TEX: 'Texto' }[a.tipo]} ${a.n}` });
const anexosOf = (id) => {
  const r = { dib: [], fot: [], map: [], tex: [] };
  (byId[id] || []).forEach((a) => r[a.tipo.toLowerCase()].push(img(a)));
  return r;
};
const thumbOf = (id) => { const a = (byId[id] || []).find((x) => x.tipo === 'FOT'); return a ? img(a).thumb : null; };

const rows = {
  1: { id: 1, nombre: 'ANGAITZA', tipologia: 'Dolmen', tipologiaTexto: 'Dólmen corto cerrado', municipio: 'Concejo de Beorburu. Ayuntamiento del Valle de Juslapeña', ubicacion: 'Cerca del alto de Angaitza', itinerarioTexto: 'A 15 minutos desde Beorburu, en dirección Norte Hoja cartográfica Nº 115-12', hojaCartografica: '115-12', utmX: 603400, utmY: 4753750, altitud: 860, lat: 42.9262, lon: -1.8097, localizadoFecha: null, localizadoFechaTexto: 'sábado, abril 15, 1905', localizadoAutor: 'P. Urra',
    descripcion: 'Túmulo circular poco determinable. Cámara de recinto rectangular, más bien trapecial por tender las paredes a cerrarse a la entrada. Cubierta desplazada al realizar la cata de reconocimiento, por lo que se encuentra fragmentada. Documentado por tres diapositivas, en las que debido a la maleza tapa la conformación del monumento. ? W.E. 10 m ? N. S. 11m Altura aprox. 1m Tierra y piedra Viane tiene medidas las losas Hoy se ven Losa de cabecera orientada a 15? Losa N (W.E.) orientada a 120? Losa S (W.E.) orientada a 77? 6 piedras ( A6 x 40) al E. 1 piedrra (1 x 70) 1 piedra (1,3 x 1,7) E. enterradas 1 piedra ? E. enterradas 1 piedra 1 x 1 a SE (cierre cámara ?)',
    excavacion: 'En 1932, se realizó una cata de reconocimiento, por P. Urra',
    observaciones: 'P. Urra se lo comunicón a J.M. de Barandiarán y la cata de reconocimiento dio restos humanos cuyo paradero es desconocido. Este dómen tiene posibilidades de ser reconstruido, colocándole la tapa . Hay que levantar un croquis y medir las locas. Topónimo ARANGAITZ en mapa 1/25.000 115-1 Bibliografía: J.M. de Barandiarán. Catálogo des stations. 1946 J.M. de Barandiarán . Hombre prehistórico. 1953',
    caracteristicas: null, otrosAspectos: 'Bloc 12. Atez Ulzama' },
  24: { id: 24, nombre: 'PITXORTAR', tipologia: 'Dolmen', tipologiaTexto: 'Dolmen corto abierto', municipio: 'Urroz de Santesteban', ubicacion: 'A varios cientos de metros del dolmen de Mugasoro en dirección WNW., a 80m al N. de la cota 882m, en medio de un hayedo, a 878, s.n.m. Long. 1º 58´´ 05´´ Lat 43º 03´ 14´´', itinerarioTexto: null, hojaCartografica: null, utmX: null, utmY: null, altitud: 878, lat: 43.0539, lon: -1.9681, localizadoFecha: null, localizadoFechaTexto: 'domingo, mayo 07, 1905', localizadoAutor: 'J. Elosegui',
    descripcion: 'Túmulo circular de 12m de ? y 1,7m de altura. Cámara de 4 losas y cubierta al parecer in situ, con recinto rectangular. Orientación a 90º.', excavacion: 'No se conoce', observaciones: null, caracteristicas: null, otrosAspectos: 'Bloc 12. Atez Ulzama' },
  41: { id: 41, nombre: 'ANGERTA', tipologia: 'Dolmen', tipologiaTexto: 'Dolmen corto', municipio: 'Napal', ubicacion: 'En un collado que desciende del monte Bluntza, divisoria de los valles Romanzado y Urraul Alto', itinerarioTexto: 'Imirizaldu y Napal', hojaCartografica: null, utmX: 643800, utmY: 4731880, altitud: 720, lat: 42.7259639, lon: -1.2435715, localizadoFecha: null, localizadoFechaTexto: 'lunes, enero 06, 1958', localizadoAutor: 'Tomás López Sellés',
    descripcion: 'Túmulo circular de 18m ? y 1m de altura. Cámara reducida de dos losas paralelas y otros dos formando cámara, inclinadas bajo el peso de la losa de cubierta. Orientación E.-W. Calizas del terreno', excavacion: 'No se conoce', observaciones: 'El habitáculo tiene una aportación de piedras pequeñas tapando huecos, aprovechado por cazadores. Catálogado en MUNIBE con el nº 62-6. Suplemento nº1, año 1973', caracteristicas: null, otrosAspectos: 'Bloc 18. Pirineo roncalés y Romanzado' }
};
// Very long text (descripcion ~2,000 chars, observaciones ~2,900 chars) on a sparse entry.
const para = rows[1].descripcion;
rows[99] = { id: 99, nombre: 'ARRAKO', tipologia: 'Cromlech', tipologiaTexto: 'Cromlech', municipio: 'Burguete', ubicacion: 'Sobre la loma que domina el collado, a unos 300 m del camino.', itinerarioTexto: null, hojaCartografica: '91-1', utmX: 620100, utmY: 4764300, altitud: 1010, lat: 43.0302, lon: -1.3911, localizadoFecha: '1985-07-12', localizadoFechaTexto: null, localizadoAutor: 'M. Ezkurdia',
  descripcion: [para, para.slice(0, 700)].join('\n\n'), excavacion: null, observaciones: [rows[1].observaciones, rows[1].observaciones, rows[1].observaciones, rows[1].observaciones.slice(0, 500)].join('\n\n'), caracteristicas: 'Círculo de 12 piedras', otrosAspectos: null };

const urls = (m) => ({ osmUrl: `https://www.openstreetmap.org/?mlat=${m.lat}&mlon=${m.lon}#map=16/${m.lat}/${m.lon}`, googleUrl: `https://www.google.com/maps?q=${m.lat},${m.lon}` });

const feats = geo.features.map((f) => f.properties);
const nameOf = (id) => (feats.find((p) => p.id === id) || { nombre: 'Ficha ' + id }).nombre.toUpperCase();

function ficha(id) {
  const m = { ...(rows[id] || { ...rows[41], id, nombre: nameOf(id) }) };
  const gf = geo.features.find((f) => f.properties.id === id);
  if (gf && !rows[id]) { m.lon = gf.geometry.coordinates[0]; m.lat = gf.geometry.coordinates[1]; m.altitud = gf.properties.altitud; m.municipio = gf.properties.municipio; m.tipologia = gf.properties.tipologia; }
  const rutas = R.cercanas(id);
  const extra = rutas.length ? { rutas, acceso: null, rutasDisponibles: true } : id === 1 ? { rutasDisponibles: false } : { rutasDisponibles: true, rutas: [], acceso: { sendaDistM: 180 + id * 7, sendaTipo: 'track', sendaSac: 'hiking' } };
  const anexos = anexosOf(id);
  const total = Object.values(anexos).reduce((n, a) => n + a.length, 0);
  return { m, anexos, totalAnexos: total, ...extra, prev: id > 1 ? { id: id - 1, nombre: nameOf(id - 1) } : null, next: id < 491 ? { id: id + 1, nombre: nameOf(id + 1) } : null, ...urls(m) };
}

const tipologias = [['Dolmen', 'dolmen', 142], ['Cromlech', 'cromlech', 118], ['Túmulo', 'tumulo', 64], ['Indefinido', 'indefinido', 41], ['Sin clasificar', 'sin-clasificar', 38], ['Dolmen corto abierto', 'dolmen-corto-abierto', 22], ['Dolmen largo cerrado', 'dolmen-largo-cerrado', 18], ['Monolito', 'monolito', 16], ['Cista', 'cista', 12], ['Estación megalítica', 'estacion-megalitica', 9], ['Fondos de cabana', 'fondos-de-cabana', 11]]
  .map(([nombre, slug, count]) => ({ nombre, slug, count }));

const card = (p) => ({ id: p.id, nombre: p.nombre.toUpperCase(), tipologia: p.tipologia, municipio: p.municipio, altitud: p.altitud, thumb: thumbOf(p.id) });
const allCards = feats.map(card);

function list(query = {}) {
  const q = (query.q || '').toLowerCase();
  const tipo = query.tipo || '';
  const muni = query.municipio || '';
  const items = allCards.filter((c) => (!q || (c.nombre + ' ' + c.municipio).toLowerCase().includes(q)) && (!tipo || c.tipologia.toLowerCase().startsWith(tipo.split('-')[0])) && (!muni || c.municipio === muni));
  return { items, total: items.length, q: query.q || '', tipo, municipio: muni,
    tipologias: tipologias.map((t) => ({ nombre: t.nombre, slug: t.slug, selected: t.slug === tipo })),
    municipios: [...new Set(feats.map((p) => p.municipio))].sort().map((nombre) => ({ nombre, selected: nombre === muni })) };
}

const withImg = allCards.filter((c) => c.thumb);
const home = () => ({ stats: { total: 491, conCoordenadas: 480, totalImagenes: 1338, tipologias }, destacados: withImg.filter((c, i, a) => a.findIndex((x) => x.id === c.id) === i).slice(0, 6) });

const R = require('./routes.cjs')(geo);
const rutasList = (q) => R.list(q);
const rutaView = (id) => R.ruta(id, (mid) => allCards.find((c) => c.id === mid) || card(feats.find((p) => p.id === mid)));
module.exports = { ficha, list, home, geo, R, rutasList, rutaView };
