'use strict';

const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { ARCHIVO_RE, THUMB_RE } = require('../lib/validate');

const IMMUTABLE = 'public, max-age=31536000, immutable';

function anexosRouter({ imagesDir, thumbsDir }) {
  const r = express.Router();
  const opts = (root) => ({ root, dotfiles: 'deny', index: false, maxAge: '1y', immutable: true, acceptRanges: false });
  const done = (next, res) => (e) => { if (e && !res.headersSent) next(e.status === 404 ? undefined : e); };
  const exists = (p) => fs.promises.access(p, fs.constants.R_OK).then(() => true, () => false);

  // Thumbs first: webp, falling back to the full jpg when missing.
  r.get('/thumbs/:archivo', async (req, res, next) => {
    try {
      const name = path.basename(req.params.archivo);
      if (name !== req.params.archivo || !THUMB_RE.test(name)) return next();
      if (await exists(path.join(thumbsDir, name))) {
        return res.sendFile(name, opts(thumbsDir), done(next, res));
      }
      const jpg = name.replace(/\.webp$/, '.jpg');
      if (await exists(path.join(imagesDir, jpg))) {
        res.set('Cache-Control', 'public, max-age=3600');
        return res.sendFile(jpg, { ...opts(imagesDir), maxAge: 0, immutable: false, cacheControl: false },
          done(next, res));
      }
      return next();
    } catch (e) { return next(e); }
  });

  r.get('/:archivo', (req, res, next) => {
    const name = path.basename(req.params.archivo);
    if (name !== req.params.archivo || !ARCHIVO_RE.test(name)) return next();
    res.set('Cache-Control', IMMUTABLE);
    return res.sendFile(name, { ...opts(imagesDir), cacheControl: false },
      done(next, res));
  });

  return r;
}

module.exports = { anexosRouter };
