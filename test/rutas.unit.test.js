'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const v = require('../src/lib/validate');
const { buildGpx, esc, slugify, gpxFileName } = require('../src/lib/gpx');
const { createRepo } = require('../src/lib/repo');
const { assertWellFormedXml, buildApp, fakeRepo } = require('./helpers');

describe('validate (rutas)', () => {
  test('parseRutaId', () => {
    assert.equal(v.parseRutaId('1'), 1);
    assert.equal(v.parseRutaId('1234567'), 1234567);
    assert.equal(v.parseRutaId('9007199254740991'), 9007199254740991);
    for (const bad of ['0', '9007199254740992', '99999999999999999999', 'abc', '123.gpx', '1;DROP', '-1', '', ' 1', '1e3', undefined]) {
      assert.equal(v.parseRutaId(bad), null, String(bad));
    }
  });
  test('cleanRed', () => {
    for (const ok of ['iwn', 'nwn', 'rwn', 'lwn']) assert.equal(v.cleanRed(ok), ok);
    for (const bad of ['IWN', "x' OR 1=1", '', ['iwn'], undefined]) assert.equal(v.cleanRed(bad), '');
  });
});

describe('gpx', () => {
  const nasty = `Camino & <Ruta> "de" 'Ñandú' ñ 日本 \u0001`;
  const ruta = { id: 42, ref: 'GR 11', nombre: nasty, desde: 'A & B', hasta: '<C>', actualizado: '2026-11-10 20:21:00' };
  const geometry = { type: 'MultiLineString', coordinates: [[[-2.3, 42.7], [-2.2, 42.8]], [[-2.1, 42.9], [-2.0, 43.0], [-1.9, 43.1]]] };
  const megalitos = [{ id: 24, nombre: `Dolmen "A" & <B> 'C'`, tipologia: 'Túmulo', lat: 42.71, lon: -2.29, distM: 100 }];
  const xml = buildGpx({ ruta, geometry, megalitos });

  test('escape', () => {
    assert.equal(esc(`& < > " '`), '&amp; &lt; &gt; &quot; &apos;');
    assert.equal(esc('a\u0000b\u000bc'), 'abc');
    assert.equal(esc(null), '');
  });
  test('well-formed, escaped, non-ASCII preserved', () => {
    assertWellFormedXml(xml);
    assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
    assert.match(xml, /Camino &amp; &lt;Ruta&gt; &quot;de&quot; &apos;Ñandú&apos; ñ 日本/);
    assert.ok(!xml.includes('\u0001'));
    assert.ok(!/<Ruta>/.test(xml));
  });
  test('structure per contract', () => {
    assert.match(xml, /<gpx version="1.1" creator="[^"]+" xmlns="http:\/\/www.topografix.com\/GPX\/1\/1"/);
    assert.match(xml, /<copyright author="OpenStreetMap contributors"><license>https:\/\/opendatacommons.org\/licenses\/odbl\/1-0\/<\/license><\/copyright>/);
    assert.match(xml, /<link href="https:\/\/www.openstreetmap.org\/relation\/42">/);
    assert.match(xml, /<time>2026-11-10T20:21:00Z<\/time>/);
    assert.equal((xml.match(/<trk>/g) || []).length, 1);
    assert.equal((xml.match(/<trkseg>/g) || []).length, 2);
    assert.equal((xml.match(/<trkpt /g) || []).length, 5);
    assert.equal((xml.match(/<wpt /g) || []).length, 1);
    assert.match(xml, /<wpt lat="42.710000" lon="-2.290000"><name>Dolmen &quot;A&quot; &amp; &lt;B&gt; &apos;C&apos;<\/name><desc>Nº 0024 · Túmulo<\/desc>/);
    assert.ok(xml.indexOf('<wpt') < xml.indexOf('<trk>'));
    assert.ok(xml.indexOf('<metadata>') < xml.indexOf('<wpt'));
    assert.match(xml, /<trkpt lat="42.700000" lon="-2.300000"\/>/); // lat/lon order
  });
  test('tolerates Feature, LineString, junk', () => {
    const one = buildGpx({ ruta, geometry: { type: 'LineString', coordinates: [[0, 40], [1, 41], ['x', 1], [200, 0]] } });
    assertWellFormedXml(one);
    assert.equal((one.match(/<trkpt /g) || []).length, 2);
    assertWellFormedXml(buildGpx({ ruta: { id: 1 }, geometry: null }));
    assertWellFormedXml(buildGpx({ ruta, geometry: { type: 'Feature', geometry }, megalitos: [{ id: 1, nombre: 'x', lat: null, lon: null }] }));
  });
  test('slug is ASCII-only', () => {
    assert.equal(slugify('GR 11 · Camino de Ñandú & "Co"'), 'gr-11-camino-de-nandu-co');
    assert.equal(slugify('日本'), 'ruta');
    assert.equal(slugify('../../etc/passwd'), 'etc-passwd');
    assert.ok(slugify('a'.repeat(300)).length <= 60);
    assert.equal(gpxFileName({ id: 7, ref: null, nombre: null }), 'ruta-7.gpx');
    assert.match(gpxFileName(ruta), /^[a-z0-9-]+\.gpx$/);
  });
});

describe('repo: rutas tables absent / caching (fake pool)', () => {
  const missing = () => Object.assign(new Error("Table 'x.rutas' doesn't exist"), { code: 'ER_NO_SUCH_TABLE', errno: 1146 });
  function poolWith(handler) {
    const calls = [];
    return { calls, execute: async (sql, p) => { calls.push(sql); return [await handler(sql, p)]; }, query: async () => [[]] };
  }

  test('missing tables degrade gracefully', async () => {
    const pool = poolWith(() => { throw missing(); });
    const repo = createRepo(pool);
    assert.equal(await repo.rutasDisponibles(), false);
    assert.deepEqual(await repo.listRutas({}), []);
    assert.equal(await repo.getRuta(1), null);
    assert.equal(await repo.rutaFeature(1), null);
    assert.deepEqual(await repo.megalitosDeRuta(1), []);
    assert.deepEqual(await repo.rutasCercanas(1), []);
    assert.equal(await repo.acceso(1), null);
    assert.equal(await repo.rutasMeta(), null);
    assert.deepEqual(JSON.parse(await repo.rutasLiteJson()), { type: 'FeatureCollection', features: [] });
    assert.equal(pool.calls.length, 1, 'detected once, not re-probed on every call');
  });

  test('other DB errors propagate', async () => {
    const repo = createRepo(poolWith(() => { throw new Error('ECONNRESET'); }));
    await assert.rejects(repo.listRutas({}), /ECONNRESET/);
  });

  test('empty rutas table = not available', async () => {
    const repo = createRepo(poolWith(() => [{ n: 0 }]));
    assert.equal(await repo.rutasDisponibles(), false);
  });

  test('lite collection parsed once and cached 1 h', async () => {
    let liteCalls = 0;
    const pool = poolWith((sql) => {
      if (/COUNT\(\*\)/.test(sql)) return [{ n: 2 }];
      liteCalls += 1;
      return [
        { id: 1, ref: 'GR 1', nombre: 'a', red: 'nwn', n_megalitos: 3, geojson_lite: '{"type":"MultiLineString","coordinates":[[[0,40],[1,41]]]}' },
        { id: 2, ref: null, nombre: 'b', red: null, n_megalitos: 0, geojson_lite: 'not json' },
      ];
    });
    const repo = createRepo(pool);
    const a = JSON.parse(await repo.rutasLiteJson());
    assert.equal(a.features.length, 1); // unparsable geometry skipped
    assert.deepEqual(a.features[0].properties, { id: 1, ref: 'GR 1', nombre: 'a', red: 'nwn', n_megalitos: 3 });
    assert.equal(a.features[0].geometry.type, 'MultiLineString');
    await repo.rutasLiteJson();
    assert.equal(liteCalls, 1);
    const realNow = Date.now;
    try {
      Date.now = () => realNow() + 61 * 60 * 1000;
      await repo.rutasLiteJson();
      assert.equal(liteCalls, 2);
    } finally { Date.now = realNow; }
  });

  test('queries are parameterised', async () => {
    const pool = poolWith((sql) => (/COUNT\(\*\)/.test(sql) ? [{ n: 1 }] : []));
    const repo = createRepo(pool);
    const evil = "x' OR 1=1 --";
    const seen = [];
    pool.execute = async (sql, p) => { seen.push([sql, p]); return [/COUNT\(\*\)/.test(sql) ? [{ n: 1 }] : []]; };
    await repo.listRutas({ q: evil, red: 'nwn' });
    const [sql, params] = seen.find(([s]) => /FROM rutas r/.test(s));
    assert.ok(!sql.includes('OR 1=1'));
    assert.deepEqual(params, [`%${evil}%`, `%${evil}%`, 'nwn']);
  });
});

describe('http rutas (fake repo)', () => {
  const { app } = buildApp({ repo: fakeRepo() });

  test('/rutas 200 + filters validated', async () => {
    const res = await request(app).get('/rutas');
    assert.equal(res.status, 200);
    assert.match(res.text, /data-active="rutas"/);
    assert.match(res.text, /GR 11\|Camino &amp; &lt;x&gt;\|Nacional \(GR\)\|12,4\|1/);
    let seen;
    const b = buildApp({ repo: fakeRepo({ listRutas: async (f) => { seen = f; return []; } }) });
    await request(b.app).get(`/rutas?q=${'a'.repeat(300)}&red=evil`);
    assert.equal(seen.q.length, 100);
    assert.equal(seen.red, '');
    await request(b.app).get('/rutas?red=rwn');
    assert.equal(seen.red, 'rwn');
    const sel = await request(b.app).get('/rutas?red=lwn');
    assert.match(sel.text, /value="lwn" selected/);
  });

  test('/rutas when unavailable still 200', async () => {
    const b = buildApp({ repo: fakeRepo({ rutasDisponibles: async () => false, listRutas: async () => [], rutasMeta: async () => null }) });
    const res = await request(b.app).get('/rutas');
    assert.equal(res.status, 200);
    assert.match(res.text, /id="disp">false</);
  });

  test('/rutas/:id 200 and 404s', async () => {
    const ok = await request(app).get('/rutas/123');
    assert.equal(ok.status, 200);
    assert.match(ok.text, /id="gpx">\/rutas\/123.gpx</);
    assert.match(ok.text, /relation\/123/);
    assert.match(ok.text, /waymarkedtrails.org\/#route\?id(=|&#x3D;)123/);
    for (const bad of ['0', '124', 'abc', '99999999999999999999', '1;DROP', '123.gpx.gpx', '-1', 'abc.gpx', '0.gpx', '1%20OR%201']) {
      const res = await request(app).get(`/rutas/${bad}`);
      assert.equal(res.status, 404, bad);
      assert.doesNotMatch(res.text, /Error:|at .*\.js/);
    }
  });

  test('/rutas/:id.gpx routes to the GPX handler, not :id', async () => {
    const res = await request(app).get('/rutas/123.gpx');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /^application\/gpx\+xml/);
    assert.equal(res.headers['content-disposition'], 'attachment; filename="gr-11-camino-x.gpx"');
    assert.match(res.headers['cache-control'], /max-age=86400/);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.match(res.headers['content-security-policy'], /default-src 'self'/);
    assertWellFormedXml(res.text);
    assert.match(res.text, /Camino &amp; &lt;x&gt;/);
    assert.equal((await request(app).head('/rutas/123.gpx')).status, 200);
    for (const bad of ['0', '124', 'abc', '99999999999999999999']) {
      assert.equal((await request(app).get(`/rutas/${bad}.gpx`)).status, 404, bad);
    }
  });

  test('gpx is covered by the rate limiter', async () => {
    const b = buildApp({ repo: fakeRepo(), env: { RATE_LIMIT_MAX: '2' } });
    await request(b.app).get('/rutas/123.gpx');
    await request(b.app).get('/rutas/123.gpx');
    assert.equal((await request(b.app).get('/rutas/123.gpx')).status, 429);
  });

  test('api geojson', async () => {
    const all = await request(app).get('/api/rutas.geojson');
    assert.equal(all.status, 200);
    assert.match(all.headers['content-type'], /geo\+json/);
    assert.match(all.headers['cache-control'], /public, max-age=86400/);
    assert.equal(all.body.type, 'FeatureCollection');
    const one = await request(app).get('/api/rutas/123.geojson');
    assert.equal(one.status, 200);
    assert.equal(one.body.type, 'Feature');
    assert.match(one.headers['cache-control'], /max-age=86400/);
    for (const bad of ['0', '124', 'abc', '99999999999999999999', '1;DROP']) {
      const res = await request(app).get(`/api/rutas/${bad}.geojson`);
      assert.equal(res.status, 404, bad);
      assert.equal(res.body.error !== undefined, true);
    }
  });

  test('api megalito rutas', async () => {
    const res = await request(app).get('/api/megalitos/1/rutas');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { rutas: [], acceso: null });
    assert.equal((await request(app).get('/api/megalitos/2/rutas')).status, 404);
    assert.equal((await request(app).get('/api/megalitos/abc/rutas')).status, 404);
  });

  test('ficha receives rutas and acceso', async () => {
    const rutas = [{ id: 123, ref: 'GR 11', nombre: 'n', red: 'nwn', redNombre: 'Nacional (GR)', distM: 240, longitudKm: '1,0', accesoLat: 1, accesoLon: 2 }];
    const b = buildApp({ repo: fakeRepo({ rutasCercanas: async () => rutas, acceso: async () => ({ sendaDistM: 35, sendaTipo: 'track', sendaSac: null }) }) });
    const res = await request(b.app).get('/megalitos/1');
    assert.equal(res.status, 200);
    assert.match(res.text, /id="nr">1</);
    assert.match(res.text, /class="r" href="\/rutas\/123">240</);
    assert.match(res.text, /id="ac">35</);
    assert.match(res.text, /id="rd">true</);
  });

  test('db failure on rutas -> 500 without details', async () => {
    const b = buildApp({ repo: fakeRepo({ listRutas: async () => { throw new Error('secret'); } }) });
    const res = await request(b.app).get('/rutas');
    assert.equal(res.status, 500);
    assert.doesNotMatch(res.text, /secret/);
  });
});
