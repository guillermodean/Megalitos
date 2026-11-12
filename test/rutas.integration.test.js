'use strict';

// Real MariaDB (see test/run.sh): rutas schema + fixture, and a second DB without rutas tables.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const request = require('supertest');
const { createApp } = require('../src/app');
const { createPool } = require('../src/db');
const { createRepo } = require('../src/lib/repo');
const { assertWellFormedXml, buildApp } = require('./helpers');

const enabled = Boolean(process.env.DB_HOST);
const realViews = path.join(__dirname, '..', 'src', 'views');
const hasRealRutasViews = fs.existsSync(path.join(realViews, 'rutas.hbs')) && fs.existsSync(path.join(realViews, 'ruta.hbs'));

function mkEnv(db) {
  return { DB_HOST: process.env.DB_HOST, DB_USER: process.env.DB_USER, DB_PASSWORD: process.env.DB_PASSWORD,
    DB_NAME: db, RATE_LIMIT_MAX: '100000' };
}

describe('integration rutas (MariaDB + fixture routes)', { skip: !enabled && 'DB_HOST not set' }, () => {
  let pool; let app; let a; let b;
  before(async () => {
    const env = mkEnv(process.env.DB_NAME || 'megalitos');
    const { config } = buildApp({ repo: null, env });
    pool = createPool(config.db);
    app = buildApp({ repo: createRepo(pool), env }).app;
    const [rows] = await pool.query('SELECT id FROM megalitos ORDER BY id LIMIT 2');
    [a, b] = rows.map((r) => r.id);
  });
  after(async () => { await pool?.end(); });

  const rows = (html) => [...html.matchAll(/class="ruta" href="\/rutas\/(\d+)">([^<]*)</g)].map((m) => [Number(m[1]), m[2]]);

  test('/rutas lists, orders by n_megalitos desc', async () => {
    const res = await request(app).get('/rutas');
    assert.equal(res.status, 200);
    assert.match(res.text, /id="disp">true</);
    const list = rows(res.text);
    assert.ok(list.length >= 3);
    assert.equal(list[0][0], 1001);
    assert.match(res.text, /Camino &amp; &lt;Ruta&gt; &quot;de&quot; &#x27;Ñandú&#x27;|Camino &amp; &lt;Ruta&gt; &quot;de&quot; &#39;Ñandú&#39;/);
    assert.match(res.text, /id="act">2026-11-10</);
  });

  test('/rutas filters', async () => {
    const ids = async (qs) => rows((await request(app).get(`/rutas?${qs}`)).text).map((r) => r[0]);
    assert.deepEqual(await ids('red=rwn'), [1002]);
    assert.deepEqual(await ids('red=nwn'), [1001]);
    assert.deepEqual(await ids('q=eguilaz'), [1002]);
    assert.deepEqual(await ids('q=GR%2011'), [1001]);
    assert.deepEqual(await ids('q=nandu'), [1001]); // accent-insensitive collation
    assert.deepEqual(await ids('q=zzzzqq'), []);
    assert.deepEqual(await ids('q=%25'), []); // literal %
    assert.deepEqual(await ids("q=%27%20OR%201%3D1%20--"), []);
    assert.deepEqual(await ids('red=evil'), (await ids('')));
    assert.deepEqual(await ids('red=rwn&q=GR'), []);
    assert.equal((await request(app).get(`/rutas?q=${'a'.repeat(500)}`)).status, 200);
  });

  test('/rutas/:id 200 / 404', async () => {
    const ok = await request(app).get('/rutas/1001');
    assert.equal(ok.status, 200);
    assert.match(ok.text, /id="ref">GR 11</);
    assert.match(ok.text, /id="km">12,4</);
    // megalitos <= 1000 m, nearest first: a (120 m) then b (800 m)
    assert.deepEqual([...ok.text.matchAll(/class="m" href="\/megalitos\/(\d+)">(\d+)</g)].map((m) => [Number(m[1]), Number(m[2])]),
      [[a, 120], [b, 800]]);
    assert.ok(!(await request(app).get('/rutas/1002')).text.includes('class="m"')); // 1400 m > 1000 m
    for (const bad of ['0', 'abc', '99999999999999999999', '1;DROP', '5555', '1001.gpx.gpx']) {
      assert.equal((await request(app).get(`/rutas/${bad}`)).status, 404, bad);
    }
  });

  test('GPX', async () => {
    const res = await request(app).get('/rutas/1001.gpx');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /^application\/gpx\+xml/);
    assert.equal(res.headers['content-disposition'], 'attachment; filename="gr-11-camino-ruta-de-nandu.gpx"');
    assert.match(res.headers['cache-control'], /max-age=86400/);
    assertWellFormedXml(res.text);
    assert.match(res.text, /Camino &amp; &lt;Ruta&gt; &quot;de&quot; &apos;Ñandú&apos;/);
    assert.equal((res.text.match(/<trkseg>/g) || []).length, 2);
    assert.equal((res.text.match(/<trkpt /g) || []).length, 5);
    // only megalito `a` is within 500 m
    const [m] = (await pool.query('SELECT lat, lon FROM megalitos WHERE id = ?', [a]))[0];
    assert.equal((res.text.match(/<wpt /g) || []).length, m.lat === null ? 0 : 1);
    assert.match(res.text, /<license>https:\/\/opendatacommons.org\/licenses\/odbl\/1-0\/<\/license>/);
    for (const bad of ['0', '5555', 'abc', '99999999999999999999']) {
      assert.equal((await request(app).get(`/rutas/${bad}.gpx`)).status, 404, bad);
    }
  });

  test('geojson shapes', async () => {
    const all = await request(app).get('/api/rutas.geojson');
    assert.equal(all.status, 200);
    assert.match(all.headers['cache-control'], /max-age=86400/);
    assert.equal(all.body.type, 'FeatureCollection');
    assert.ok(all.body.features.length >= 3);
    for (const f of all.body.features) {
      assert.equal(f.geometry.type, 'MultiLineString');
      assert.deepEqual(Object.keys(f.properties).sort(), ['id', 'n_megalitos', 'nombre', 'red', 'ref']);
    }
    const f1 = all.body.features.find((f) => f.properties.id === 1001);
    assert.equal(f1.geometry.coordinates[0].length, 2); // lite geometry
    const one = await request(app).get('/api/rutas/1001.geojson');
    assert.equal(one.status, 200);
    assert.equal(one.body.type, 'Feature');
    assert.equal(one.body.geometry.coordinates[0].length, 3); // detail geometry
    assert.equal(one.body.properties.redNombre, 'Nacional (GR)');
    assert.equal(one.body.properties.longitud_m, 12400);
    assert.equal((await request(app).get('/api/rutas/5555.geojson')).status, 404);
    assert.equal((await request(app).get('/api/rutas/abc.geojson')).status, 404);
  });

  test('megalito rutas api + ficha data', async () => {
    const res = await request(app).get(`/api/megalitos/${a}/rutas`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.rutas.map((r) => [r.id, r.distM]), [[1001, 120], [1002, 1400]]);
    assert.equal(res.body.rutas[0].redNombre, 'Nacional (GR)');
    assert.equal(res.body.rutas[0].longitudKm, '12,4');
    assert.equal(res.body.rutas[0].accesoLat, 42.701);
    assert.deepEqual(res.body.acceso, { sendaDistM: 35, sendaTipo: 'track', sendaSac: null });
    const rb = await request(app).get(`/api/megalitos/${b}/rutas`);
    assert.deepEqual(rb.body.rutas.map((r) => r.id), [1003, 1001]);
    assert.equal(rb.body.acceso, null); // senda_dist_m NULL
    const ficha = await request(app).get(`/megalitos/${a}`);
    assert.equal(ficha.status, 200);
    assert.match(ficha.text, /id="nr">2</);
    assert.match(ficha.text, /id="ac">35</);
    assert.equal((await request(app).get('/api/megalitos/9999/rutas')).status, 404);
  });

  test('security headers on rutas pages', async () => {
    for (const u of ['/rutas', '/rutas/1001', '/rutas/1001.gpx', '/api/rutas.geojson']) {
      const res = await request(app).get(u);
      assert.match(res.headers['content-security-policy'], /script-src 'self'(;|$)/, u);
      assert.equal(res.headers['x-content-type-options'], 'nosniff', u);
    }
  });

  test('app user stays read-only on rutas tables', async () => {
    await assert.rejects(pool.query('DELETE FROM rutas'), /denied/i);
  });
});

describe('integration without rutas tables (phase-1 DB)', { skip: !enabled && 'DB_HOST not set' }, () => {
  let pool; let app;
  before(() => {
    const env = mkEnv('megalitos_norutas');
    const { config } = buildApp({ repo: null, env });
    pool = createPool(config.db);
    app = buildApp({ repo: createRepo(pool), env }).app;
  });
  after(async () => { await pool?.end(); });

  test('phase-1 pages keep working', async () => {
    const id = (await pool.query('SELECT MIN(id) AS id FROM megalitos'))[0][0].id;
    for (const u of ['/', '/megalitos', `/megalitos/${id}`, '/mapa']) {
      assert.equal((await request(app).get(u)).status, 200, u);
    }
    const ficha = await request(app).get(`/megalitos/${id}`);
    assert.match(ficha.text, /id="rd">false</);
    assert.match(ficha.text, /id="nr">0</);
  });

  test('/rutas says unavailable (200), detail/gpx 404, api empty', async () => {
    const res = await request(app).get('/rutas');
    assert.equal(res.status, 200);
    assert.match(res.text, /id="disp">false</);
    assert.match(res.text, /id="total">0</);
    assert.equal((await request(app).get('/rutas/1001')).status, 404);
    assert.equal((await request(app).get('/rutas/1001.gpx')).status, 404);
    const geo = await request(app).get('/api/rutas.geojson');
    assert.equal(geo.status, 200);
    assert.deepEqual(geo.body, { type: 'FeatureCollection', features: [] });
    assert.equal((await request(app).get('/api/rutas/1001.geojson')).status, 404);
    const id = (await pool.query('SELECT MIN(id) AS id FROM megalitos'))[0][0].id;
    assert.deepEqual((await request(app).get(`/api/megalitos/${id}/rutas`)).body, { rutas: [], acceso: null });
  });
});

describe('real views: rutas pages', {
  skip: (!enabled || !hasRealRutasViews) && 'DB_HOST or src/views/rutas.hbs|ruta.hbs missing',
}, () => {
  let pool; let app;
  before(() => {
    const { config } = buildApp({ repo: null, env: mkEnv(process.env.DB_NAME || 'megalitos') });
    pool = createPool(config.db);
    app = createApp({ config, repo: createRepo(pool), log: () => {} });
  });
  after(async () => { await pool?.end(); });

  test('rutas, ruta, ficha render CSP-clean', async () => {
    const id = (await pool.query('SELECT MIN(id) AS id FROM megalitos'))[0][0].id;
    for (const u of ['/rutas', '/rutas?red=nwn&q=GR', '/rutas/1001', '/rutas/1003', `/megalitos/${id}`]) {
      const res = await request(app).get(u);
      assert.equal(res.status, 200, u);
      assert.doesNotMatch(res.text, /<script(?![^>]*\bsrc=)[^>]*>/i, `inline script on ${u}`);
      assert.doesNotMatch(res.text, /\sstyle="/i, `inline style on ${u}`);
      assert.doesNotMatch(res.text, /\son\w+="/i, `inline handler on ${u}`);
    }
    assert.match((await request(app).get('/rutas')).text, /nav-active|aria-current|rutas/i);
  });
});

// Ingestion agent's real routes (tools/routes/fixture-rutas.sql) in DB megalitos_real; skipped on the tiny fixture seed.
describe('integration with real ingested routes', { skip: !enabled && 'DB_HOST not set' }, () => {
  let pool; let app; let present = false;
  before(async () => {
    const env = mkEnv('megalitos_real');
    const { config } = buildApp({ repo: null, env });
    pool = createPool(config.db);
    app = buildApp({ repo: createRepo(pool), env }).app;
    try { present = (await pool.query('SELECT COUNT(*) AS n FROM rutas'))[0][0].n > 0; } catch { present = false; }
  });
  after(async () => { await pool?.end(); });

  test('list, detail, gpx, geojson, ficha', async (t) => {
    if (!present) return t.skip('megalitos_real not provisioned');
    const list = await request(app).get('/rutas');
    assert.equal(list.status, 200);
    const ids = [...list.text.matchAll(/class="ruta" href="\/rutas\/(\d+)"/g)].map((m) => Number(m[1]));
    assert.equal(ids.length, 3);
    for (const id of ids) {
      assert.equal((await request(app).get(`/rutas/${id}`)).status, 200);
      const gpx = await request(app).get(`/rutas/${id}.gpx`);
      assert.equal(gpx.status, 200);
      assertWellFormedXml(gpx.text);
      assert.match(gpx.headers['content-disposition'], /^attachment; filename="[a-z0-9-]+\.gpx"$/);
      assert.ok((gpx.text.match(/<trkpt /g) || []).length >= 2);
      const f = await request(app).get(`/api/rutas/${id}.geojson`);
      assert.equal(f.body.geometry.type, 'MultiLineString');
    }
    const all = await request(app).get('/api/rutas.geojson');
    assert.equal(all.body.features.length, 3);
    const [[mr]] = await pool.query('SELECT megalito_id FROM megalito_ruta ORDER BY dist_m LIMIT 1');
    const api = await request(app).get(`/api/megalitos/${mr.megalito_id}/rutas`);
    assert.ok(api.body.rutas.length >= 1 && api.body.rutas.length <= 8);
    assert.ok(api.body.rutas.every((r, i, a) => i === 0 || a[i - 1].distM <= r.distM));
  });
});
