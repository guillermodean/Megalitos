'use strict';

const express = require('express');
const { parseId, parseRutaId, cleanRed, cleanQ, cleanMunicipio, cleanTipo } = require('../lib/validate');
const { buildGpx, gpxFileName } = require('../lib/gpx');

function pagesRouter({ repo }) {
  const r = express.Router();
  const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
  const year = () => new Date().getFullYear();
  const render = (res, view, active, title, description, data = {}) =>
    res.render(view, { title, description, active, year: year(), ...data });

  r.get('/', wrap(async (req, res) => {
    const [stats, destacados] = await Promise.all([repo.stats(), repo.destacados(6)]);
    render(res, 'home', 'home', 'Megalitos de Navarra',
      'Catálogo de dólmenes, túmulos, menhires y cromlechs de Navarra, con fichas, fotografías y mapa.',
      { stats, destacados });
  }));

  r.get('/megalitos', wrap(async (req, res) => {
    const [tipologias, municipios] = await Promise.all([repo.tipologias(), repo.municipios()]);
    const q = cleanQ(req.query.q);
    const tipo = cleanTipo(req.query.tipo, tipologias.map((t) => t.slug));
    const municipio = cleanMunicipio(req.query.municipio);
    const items = await repo.search({ q, tipo, municipio });
    render(res, 'list', 'list', 'Catálogo de megalitos · Megalitos de Navarra',
      'Busca y filtra los megalitos de Navarra por nombre, tipología y municipio.', {
        items, total: items.length, q, tipo, municipio,
        tipologias: tipologias.map((t) => ({ nombre: t.nombre, slug: t.slug, selected: t.slug === tipo })),
        municipios: municipios.map((nombre) => ({ nombre, selected: nombre === municipio })),
      });
  }));

  r.get('/megalitos/:id', wrap(async (req, res, next) => {
    const id = parseId(req.params.id);
    const m = id && (await repo.getMegalito(id));
    if (!m) return next();
    const [anexos, { prev, next: nxt }, rutas, acceso, rutasDisponibles] = await Promise.all([
      repo.getAnexos(id, m.nombre), repo.prevNext(id), repo.rutasCercanas(id), repo.acceso(id),
      repo.rutasDisponibles()]);
    const hasCoords = m.lat !== null && m.lon !== null;
    render(res, 'ficha', 'list', `${m.nombre} · Megalitos de Navarra`,
      `Ficha de ${m.nombre}${m.municipio ? ` (${m.municipio})` : ''}: ${m.tipologia || 'megalito'} de Navarra.`, {
        m, anexos, rutas, acceso, rutasDisponibles,
        totalAnexos: anexos.dib.length + anexos.fot.length + anexos.map.length + anexos.tex.length,
        prev, next: nxt,
        osmUrl: hasCoords ? `https://www.openstreetmap.org/?mlat=${m.lat}&mlon=${m.lon}#map=17/${m.lat}/${m.lon}` : null,
        googleUrl: hasCoords ? `https://www.google.com/maps?q=${m.lat},${m.lon}` : null,
      });
  }));

  r.get('/rutas', wrap(async (req, res) => {
    const q = cleanQ(req.query.q);
    const red = cleanRed(req.query.red);
    const [disponible, items, meta] = await Promise.all([
      repo.rutasDisponibles(), repo.listRutas({ q, red }), repo.rutasMeta()]);
    render(res, 'rutas', 'rutas', 'Rutas de senderismo · Megalitos de Navarra',
      'Rutas de senderismo señalizadas de Navarra (GR, PR, SL) que pasan cerca de megalitos, con descarga GPX.', {
        items, total: items.length, q, red, disponible,
        redes: repo.redes().map((x) => ({ ...x, selected: x.value === red })),
        meta,
      });
  }));

  // Must be registered before '/rutas/:id' (which would otherwise see "123.gpx").
  r.get('/rutas/:id.gpx', wrap(async (req, res, next) => {
    const id = parseRutaId(req.params.id);
    const ruta = id && (await repo.getRuta(id));
    if (!ruta) return next();
    const [geometry, megalitos] = await Promise.all([repo.getRutaGeometry(id), repo.megalitosDeRuta(id, 500)]);
    if (!geometry) return next();
    res.set({
      'Content-Type': 'application/gpx+xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${gpxFileName(ruta)}"`,
      'Cache-Control': 'public, max-age=86400',
    });
    return res.send(buildGpx({ ruta, geometry, megalitos }));
  }));

  r.get('/rutas/:id', wrap(async (req, res, next) => {
    const id = parseRutaId(req.params.id);
    const ruta = id && (await repo.getRuta(id));
    if (!ruta) return next();
    const [megalitos, meta] = await Promise.all([repo.megalitosDeRuta(id, 1000), repo.rutasMeta()]);
    const nombre = [ruta.ref, ruta.nombre].filter(Boolean).join(' · ') || `Ruta ${ruta.id}`;
    render(res, 'ruta', 'rutas', `${nombre} · Megalitos de Navarra`,
      `Ruta de senderismo ${nombre} (${ruta.longitudKm} km) y los megalitos que recorre.`, {
        r: ruta, megalitos,
        gpxUrl: `/rutas/${ruta.id}.gpx`,
        osmUrl: `https://www.openstreetmap.org/relation/${ruta.id}`,
        waymarkedUrl: `https://hiking.waymarkedtrails.org/#route?id=${ruta.id}`,
        meta: { actualizado: meta?.actualizado ?? null },
      });
  }));

  r.get('/mapa', (req, res) => render(res, 'mapa', 'mapa', 'Mapa · Megalitos de Navarra',
    'Mapa interactivo con la localización de los megalitos de Navarra.'));

  r.get('/miguel-ezkurdia', (req, res) => render(res, 'ezkurdia', 'ezkurdia',
    'Miguel Ezkurdia · Megalitos de Navarra',
    'Sobre Miguel Ezkurdia y el inventario de megalitos de Navarra que dejó como legado.'));

  return r;
}

module.exports = { pagesRouter };
