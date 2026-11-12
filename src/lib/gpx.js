'use strict';

// GPX 1.1 generator for a hiking route (+ nearby megalitos as waypoints).

const ODBL_URL = 'https://opendatacommons.org/licenses/odbl/1-0/';

// Escape text for XML and drop characters that are illegal in XML 1.0.
function esc(v) {
  return String(v ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ASCII-only, lowercase file name stem (no extension).
function slugify(s, fallback = 'ruta') {
  const out = String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return out || fallback;
}

const pad4 = (n) => String(Number.parseInt(n, 10) || 0).padStart(4, '0');
const coord = (n) => Number(n).toFixed(6);
const okPt = (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) &&
  Math.abs(p[1]) <= 90 && Math.abs(p[0]) <= 180;

// Accepts a geometry object (LineString / MultiLineString / GeometryCollection) or a Feature.
function lineStrings(g) {
  if (!g || typeof g !== 'object') return [];
  if (g.type === 'Feature') return lineStrings(g.geometry);
  if (g.type === 'LineString') return [g.coordinates];
  if (g.type === 'MultiLineString') return g.coordinates || [];
  if (g.type === 'GeometryCollection') return (g.geometries || []).flatMap(lineStrings);
  return [];
}

function isoTime(s) {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(String(s ?? ''));
  return m ? `${m[1]}T${m[2]}Z` : null;
}

function gpxFileName(ruta) {
  return `${slugify([ruta.ref, ruta.nombre].filter(Boolean).join(' '), `ruta-${ruta.id}`)}.gpx`;
}

/**
 * ruta: { id, ref, nombre, desde, hasta, actualizado }
 * geometry: parsed GeoJSON geometry
 * megalitos: [{ id, nombre, tipologia, lat, lon, distM }]
 */
function buildGpx({ ruta, geometry, megalitos = [] }) {
  const title = [ruta.ref, ruta.nombre].filter(Boolean).join(' · ') || `Ruta OSM ${ruta.id}`;
  const osm = `https://www.openstreetmap.org/relation/${ruta.id}`;
  const desc = [ruta.desde && ruta.hasta ? `${ruta.desde} → ${ruta.hasta}` : '',
    'Trazado orientativo procedente de OpenStreetMap; comprueba el estado del camino antes de salir.']
    .filter(Boolean).join(' ');
  const t = isoTime(ruta.actualizado);
  const out = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push('<gpx version="1.1" creator="Megalitos de Navarra (megalitosnavarra.guillermodean.com)" ' +
    'xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
    'xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">');
  out.push('<metadata>');
  out.push(`<name>${esc(title)}</name>`);
  out.push(`<desc>${esc(desc)}</desc>`);
  out.push(`<copyright author="OpenStreetMap contributors"><license>${ODBL_URL}</license></copyright>`);
  out.push(`<link href="${esc(osm)}"><text>OpenStreetMap</text></link>`);
  if (t) out.push(`<time>${t}</time>`);
  out.push('</metadata>');
  for (const m of megalitos) {
    if (!Number.isFinite(Number(m.lat)) || !Number.isFinite(Number(m.lon))) continue;
    out.push(`<wpt lat="${coord(m.lat)}" lon="${coord(m.lon)}">` +
      `<name>${esc(m.nombre)}</name>` +
      `<desc>${esc(`Nº ${pad4(m.id)}${m.tipologia ? ` · ${m.tipologia}` : ''}`)}</desc>` +
      `<link href="https://megalitosnavarra.guillermodean.com/megalitos/${Number(m.id)}"><text>Ficha</text></link>` +
      '<type>Megalito</type></wpt>');
  }
  out.push('<trk>');
  out.push(`<name>${esc(title)}</name>`);
  out.push(`<link href="${esc(osm)}"><text>OpenStreetMap</text></link>`);
  for (const line of lineStrings(geometry)) {
    const pts = (line || []).filter(okPt);
    if (pts.length < 2) continue;
    out.push(`<trkseg>${pts.map((p) => `<trkpt lat="${coord(p[1])}" lon="${coord(p[0])}"/>`).join('')}</trkseg>`);
  }
  out.push('</trk>');
  out.push('</gpx>');
  return `${out.join('\n')}\n`;
}

module.exports = { buildGpx, esc, slugify, gpxFileName, lineStrings, ODBL_URL };
