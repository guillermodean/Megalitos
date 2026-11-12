'use strict';

// Runs against a real MariaDB (see test/run.sh). Skipped when DB_HOST is not set.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const request = require('supertest');
const { createPool } = require('../src/db');
const { createRepo } = require('../src/lib/repo');
const { buildApp } = require('./helpers');

const enabled = Boolean(process.env.DB_HOST);
const realViews = path.join(__dirname, '..', 'src', 'views');
const usingFixtureDb = process.env.TEST_FIXTURE_DB === '1';

describe('integration (MariaDB)', { skip: !enabled && 'DB_HOST not set' }, () => {
  let pool; let app;
  before(() => {
    const env = { DB_HOST: process.env.DB_HOST, DB_USER: process.env.DB_USER, DB_PASSWORD: process.env.DB_PASSWORD,
      DB_NAME: process.env.DB_NAME || 'megalitos', RATE_LIMIT_MAX: '100000' };
    const b = buildApp({ repo: null, env });
    pool = createPool(b.config.db);
    app = buildApp({ repo: createRepo(pool), env }).app;
  });
  after(async () => { await pool?.end(); });

  test('healthz', async () => {
    assert.equal((await request(app).get('/healthz')).text, 'ok');
  });

  test('app user is read-only', async () => {
    await assert.rejects(pool.query("INSERT INTO tipologias (id, nombre, slug) VALUES (99, 'x', 'x')"), /denied/i);
  });

  test('home', async () => {
    const res = await request(app).get('/');
    assert.equal(res.status, 200);
    assert.match(res.text, /<h1>home<\/h1>/);
  });

  test('list: no filters, text, tipo, municipio, combined', async () => {
    const all = await request(app).get('/megalitos');
    assert.equal(all.status, 200);
    const total = Number(/id="total">(\d+)</.exec(all.text)[1]);
    assert.ok(total >= 1);
    const count = async (qs) => Number(/id="total">(\d+)</.exec((await request(app).get(`/megalitos?${qs}`)).text)[1]);
    assert.equal(await count('q=zzzzqqqq'), 0);
    assert.ok(await count('tipo=dolmen') <= total);
    assert.equal(await count('tipo=bogus'), total);
    assert.ok(await count('q=%25') < total); // literal % must not match everything
    assert.equal(await count("q=%27%20OR%201%3D1%20--"), 0);
    assert.equal(await count('q=%2B%2D%3C%3E%28%29%7E%2A%22'), 0); // only operators
    assert.equal(await count(`q=${'a'.repeat(500)}`), 0);
    if (usingFixtureDb) {
      assert.equal(await count('q=dolmen'), 1);
      assert.equal(await count('q=Doz'), 0);
      assert.equal(await count('q=Dol'), 1);
      assert.equal(await count('q=Do'), 1);
      assert.equal(await count('q=aizko'), 1); // prefix
      assert.equal(await count('tipo=dolmen'), 1);
      assert.equal(await count('municipio=Eguilaz'), 2);
      assert.equal(await count('tipo=menhir&municipio=Eguilaz'), 1);
      assert.equal(await count('tipo=dolmen&municipio=Burguete'), 0);
      assert.equal(await count('q=100%25'), 1);
      assert.equal(await count('q=Alto_Rojo'), 1);
    }
  });

  test('ficha 200 and 404s', async () => {
    const id = (await pool.query('SELECT MIN(id) AS id FROM megalitos'))[0][0].id;
    const ok = await request(app).get(`/megalitos/${id}`);
    assert.equal(ok.status, 200);
    for (const bad of ['0', '99999', 'abc', '1;DROP']) {
      assert.equal((await request(app).get(`/megalitos/${bad}`)).status, 404, bad);
    }
  });

  test('geojson shape', async () => {
    const res = await request(app).get('/api/megalitos.geojson');
    assert.equal(res.status, 200);
    assert.equal(res.body.type, 'FeatureCollection');
    assert.ok(res.body.features.length > 0);
    for (const f of res.body.features) {
      assert.equal(f.type, 'Feature');
      assert.equal(f.geometry.type, 'Point');
      const [lon, lat] = f.geometry.coordinates;
      assert.equal(typeof lon, 'number');
      assert.equal(typeof lat, 'number');
      assert.ok(lat > 41 && lat < 44 && lon > -3 && lon < -0.5, `coords out of Navarra: ${lat},${lon}`);
      assert.deepEqual(Object.keys(f.properties).sort(), ['altitud', 'id', 'municipio', 'nombre', 'tipologia']);
    }
  });

  test('api ficha includes anexos', async () => {
    const id = (await pool.query('SELECT MIN(megalito_id) AS id FROM anexos WHERE existe = 1'))[0][0].id;
    if (!id) return;
    const res = await request(app).get(`/api/megalitos/${id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.id, id);
    assert.ok(Array.isArray(res.body.anexos));
    assert.ok(res.body.anexos.every((a) => /^\/anexos\//.test(a.src)));
  });

  test('fixture data: view models', { skip: !usingFixtureDb }, async () => {
    const f = await request(app).get('/megalitos/1');
    assert.match(f.text, /Dolmen de Aizkomendi/);
    assert.match(f.text, /<p>Primera linea\.<\/p><p>Segunda &lt;b&gt;parrafo&lt;\/b&gt;\.<\/p>/);
    assert.match(f.text, /id="n">2</); // FOT + DIB present; the existe=0 one is excluded
  });

  test('legacy redirects work', async () => {
    assert.equal((await request(app).get('/table/vista/5')).headers.location, '/megalitos/5');
  });
});

describe('real views render against real DB', {
  skip: (!enabled || !fs.existsSync(path.join(realViews, 'home.hbs'))) && 'DB_HOST or src/views missing',
}, () => {
  let pool; let app;
  before(() => {
    const env = { DB_HOST: process.env.DB_HOST, DB_USER: process.env.DB_USER, DB_PASSWORD: process.env.DB_PASSWORD,
      DB_NAME: process.env.DB_NAME || 'megalitos', RATE_LIMIT_MAX: '100000' };
    const { config } = buildApp({ repo: null, env });
    pool = createPool(config.db);
    const { createApp } = require('../src/app');
    app = createApp({ config, repo: createRepo(pool), log: () => {} });
  });
  after(async () => { await pool?.end(); });

  test('all pages return 200 with CSP-clean HTML', async () => {
    const id = (await pool.query('SELECT MIN(id) AS id FROM megalitos'))[0][0].id;
    for (const u of ['/', '/megalitos', `/megalitos/${id}`, '/mapa', '/miguel-ezkurdia', '/megalitos?q=dolmen&tipo=dolmen']) {
      const res = await request(app).get(u);
      assert.equal(res.status, 200, u);
      assert.doesNotMatch(res.text, /<script(?![^>]*\bsrc=)[^>]*>/i, `inline script on ${u}`);
      assert.doesNotMatch(res.text, /\sstyle="/i, `inline style on ${u}`);
      assert.doesNotMatch(res.text, /\son\w+="/i, `inline handler on ${u}`);
    }
    assert.equal((await request(app).get('/nope')).status, 404);
  });
});
