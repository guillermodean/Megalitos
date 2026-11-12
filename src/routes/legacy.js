'use strict';

const express = require('express');
const { parseId } = require('../lib/validate');

// Permanent redirects from the old app's URLs.
function legacyRouter() {
  const r = express.Router();
  r.get('/table', (req, res) => res.redirect(301, '/megalitos'));
  r.get('/table/vista/:id', (req, res) => {
    const id = parseId(req.params.id);
    res.redirect(301, id ? `/megalitos/${id}` : '/megalitos');
  });
  r.get('/maps', (req, res) => res.redirect(301, '/mapa'));
  r.get('/information', (req, res) => res.redirect(301, '/miguel-ezkurdia'));
  return r;
}

module.exports = { legacyRouter };
