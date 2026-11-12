'use strict';

const express = require('express');
const { parseId, parseRutaId } = require('../lib/validate');

function apiRouter({ repo }) {
  const r = express.Router();

  r.get('/megalitos.geojson', async (req, res, next) => {
    try {
      res.set('Cache-Control', 'public, max-age=3600');
      res.type('application/geo+json').send(JSON.stringify(await repo.geojson()));
    } catch (e) { next(e); }
  });

  r.get('/megalitos/:id', async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      const m = id && (await repo.getMegalito(id));
      if (!m) return res.status(404).json({ error: 'not_found' });
      const a = await repo.getAnexos(id, m.nombre);
      res.set('Cache-Control', 'public, max-age=300');
      res.json({ ...m, anexos: [...a.dib, ...a.fot, ...a.map, ...a.tex] });
    } catch (e) { next(e); }
  });

  const DAY = 'public, max-age=86400';

  r.get('/rutas.geojson', async (req, res, next) => {
    try {
      res.set('Cache-Control', DAY);
      res.type('application/geo+json').send(await repo.rutasLiteJson());
    } catch (e) { next(e); }
  });

  r.get('/rutas/:id.geojson', async (req, res, next) => {
    try {
      const id = parseRutaId(req.params.id);
      const f = id && (await repo.rutaFeature(id));
      if (!f) return res.status(404).json({ error: 'not_found' });
      res.set('Cache-Control', DAY);
      return res.type('application/geo+json').send(JSON.stringify(f));
    } catch (e) { return next(e); }
  });

  r.get('/megalitos/:id/rutas', async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      if (!id || !(await repo.getMegalito(id))) return res.status(404).json({ error: 'not_found' });
      const [rutas, acceso] = await Promise.all([repo.rutasCercanas(id), repo.acceso(id)]);
      res.set('Cache-Control', 'public, max-age=3600');
      return res.json({ rutas, acceso });
    } catch (e) { return next(e); }
  });

  return r;
}

module.exports = { apiRouter };
