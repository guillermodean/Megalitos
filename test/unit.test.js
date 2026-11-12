'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { loadConfig } = require('../src/config');
const { eq, fmtNum, nl2p } = require('../src/lib/hbs-helpers');
const v = require('../src/lib/validate');
const { buildApp, fakeRepo, baseEnv } = require('./helpers');

describe('config', () => {
  test('fails fast without DB vars', () => {
    assert.throws(() => loadConfig({}), /DB_HOST, DB_USER, DB_PASSWORD/);
    assert.throws(() => loadConfig({ DB_HOST: 'h', DB_USER: 'u' }), /DB_PASSWORD/);
  });
  test('defaults and parsing', () => {
    const c = loadConfig(baseEnv);
    assert.equal(c.port, 8000);
    assert.equal(c.db.database, 'megalitos');
    assert.equal(c.imagesDir, '/data/anexos');
    assert.equal(c.trustProxy, false);
    assert.equal(loadConfig({ ...baseEnv, TRUST_PROXY: '1' }).trustProxy, 1);
  });
  test('rejects bad numbers', () => {
    assert.throws(() => loadConfig({ ...baseEnv, PORT: 'abc' }), /PORT/);
    assert.throws(() => loadConfig({ ...baseEnv, PORT: '70000' }), /PORT/);
  });
});

describe('helpers', () => {
  test('eq', () => { assert.equal(eq('a', 'a'), true); assert.equal(eq('a', 'b'), false); });
  test('fmtNum es-ES grouping', () => {
    assert.equal(fmtNum(1338), '1.338');
    assert.equal(fmtNum(491), '491');
    assert.equal(fmtNum(null), '');
  });
  test('nl2p escapes first', () => {
    const out = nl2p('<script>alert(1)</script>\n\nSegunda "línea"\nsalto & fin').toString();
    assert.ok(!out.includes('<script>'));
    assert.match(out, /&lt;script&gt;/);
    assert.equal(out, '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p><p>Segunda &quot;línea&quot;<br>salto &amp; fin</p>');
  });
  test('nl2p empty', () => {
    assert.equal(nl2p(null).toString(), '');
    assert.equal(nl2p('   ').toString(), '');
  });
});

describe('validate', () => {
  test('parseId', () => {
    assert.equal(parseId('1'), 1);
    assert.equal(parseId('9999'), 9999);
    for (const bad of ['0', '10000', 'abc', '1;DROP', '-1', '01.5', '', ' 1', undefined]) {
      assert.equal(parseId(bad), null, String(bad));
    }
  });
  test('cleanQ trims, caps at 100, strips control chars', () => {
    assert.equal(v.cleanQ('  hola \n mundo '), 'hola mundo');
    assert.equal(v.cleanQ('a'.repeat(500)).length, 100);
    assert.equal(v.cleanQ(['a', 'b']), '');
    assert.equal(v.cleanMunicipio('b'.repeat(500)).length, 120);
  });
  test('cleanTipo only accepts known slugs', () => {
    assert.equal(v.cleanTipo('dolmen', ['dolmen']), 'dolmen');
    assert.equal(v.cleanTipo("x' OR 1=1", ['dolmen']), '');
  });
  test('escapeLike', () => { assert.equal(v.escapeLike('100%_a\\'), '100\\%\\_a\\\\'); });
  test('booleanQuery strips operators and short words', () => {
    assert.equal(v.booleanQuery('+dolmen -tumulo "x" (aizko*)'), '+dolmen* +tumulo* +aizko*');
    assert.equal(v.booleanQuery('a b'), null);
    assert.equal(v.booleanQuery('<>~@'), null);
  });
  test('filename regexes', () => {
    assert.ok(v.ARCHIVO_RE.test('0001_DIB_1_2.jpg'));
    for (const bad of ['0001_DIB_1_2.png', '../0001_DIB_1_2.jpg', '001_DIB_1_2.jpg', '0001_XXX_1_2.jpg', '0001_DIB_1_2.jpg\n', '0001_DIB_1_2.jpg\0']) {
      assert.ok(!v.ARCHIVO_RE.test(bad), bad);
    }
  });
});

function parseId(s) { return v.parseId(s); }

describe('http (fake repo)', () => {
  const { app, logs } = buildApp({ repo: fakeRepo() });

  test('security headers', async () => {
    const res = await request(app).get('/');
    assert.equal(res.status, 200);
    const csp = res.headers['content-security-policy'];
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self'(;|$)/);
    assert.match(csp, /style-src 'self'(;|$)/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /https:\/\/\*\.tile\.openstreetmap\.org/);
    assert.ok(!csp.includes('unsafe-inline'));
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['x-powered-by'], undefined);
    assert.match(res.headers['cache-control'], /max-age=60/);
    assert.match(res.text, /data-active="home"/);
  });

  test('405 on non-GET, HEAD ok', async () => {
    for (const m of ['post', 'put', 'delete', 'patch']) {
      const res = await request(app)[m]('/megalitos');
      assert.equal(res.status, 405, m);
      assert.match(res.headers.allow, /GET/);
    }
    assert.equal((await request(app).head('/')).status, 200);
  });

  test('ficha: valid and invalid ids', async () => {
    assert.equal((await request(app).get('/megalitos/1')).status, 200);
    for (const bad of ['0', '99999', 'abc', '1;DROP', '2', '-1', '1%20OR%201']) {
      const res = await request(app).get(`/megalitos/${bad}`);
      assert.equal(res.status, 404, bad);
      assert.doesNotMatch(res.text, /Error:|at .*\.js/);
    }
  });

  test('ficha escapes description', async () => {
    const res = await request(app).get('/megalitos/1');
    assert.ok(!res.text.includes('<script>alert'));
    assert.match(res.text, /&lt;script&gt;/);
  });

  test('api', async () => {
    const g = await request(app).get('/api/megalitos.geojson');
    assert.equal(g.status, 200);
    assert.match(g.headers['content-type'], /json/);
    assert.equal(g.body.type, 'FeatureCollection');
    assert.equal((await request(app).get('/api/megalitos/abc')).status, 404);
    assert.equal((await request(app).get('/api/megalitos/2')).body.error !== undefined, true);
  });

  test('legacy redirects', async () => {
    const cases = [['/table', '/megalitos'], ['/table/vista/12', '/megalitos/12'], ['/table/vista/x', '/megalitos'],
      ['/maps', '/mapa'], ['/information', '/miguel-ezkurdia']];
    for (const [from, to] of cases) {
      const res = await request(app).get(from);
      assert.equal(res.status, 301, from);
      assert.equal(res.headers.location, to);
    }
  });

  test('unknown route -> 404 view', async () => {
    const res = await request(app).get('/nope');
    assert.equal(res.status, 404);
    assert.match(res.text, /<h1>404<\/h1>/);
  });

  test('anexos: served with immutable cache', async () => {
    const res = await request(app).get('/anexos/0001_FOT_1_1.jpg');
    assert.equal(res.status, 200);
    assert.match(res.headers['cache-control'], /immutable/);
    assert.equal((await request(app).get('/anexos/0009_FOT_1_1.jpg')).status, 404);
    assert.equal((await request(app).get('/anexos/')).status, 404);
    assert.equal((await request(app).get('/anexos')).status, 404);
  });

  test('anexos: path traversal and junk are rejected', async () => {
    const attempts = ['..%2fsecret.txt', '..%2f..%2fetc%2fpasswd', '%2e%2e%2fsecret.txt', '0001_FOT_1_1.jpg%00.png',
      '0001_FOT_1_1.jpg%00', '..%5csecret.txt', '%00', '0001_FOT_1_1.JPG', '0001_FOT_1_1.jpg%0a',
      'thumbs/..%2fsecret.txt', '%E0%A4%A'];
    for (const a of attempts) {
      const res = await request(app).get(`/anexos/${a}`);
      assert.ok([400, 404].includes(res.status), `${a} -> ${res.status}`);
      assert.doesNotMatch(res.text, /secret/);
    }
  });

  test('thumbs: webp, jpg fallback, missing', async () => {
    const t = await request(app).get('/anexos/thumbs/0001_FOT_1_1.webp');
    assert.equal(t.status, 200);
    assert.match(t.headers['content-type'], /webp/);
    assert.match(t.headers['cache-control'], /immutable/);
    const fb = await request(app).get('/anexos/thumbs/0001_DIB_1_1.webp');
    assert.equal(fb.status, 200);
    assert.match(fb.headers['content-type'], /jpeg/);
    assert.equal((await request(app).get('/anexos/thumbs/0005_DIB_1_1.webp')).status, 404);
    assert.equal((await request(app).get('/anexos/thumbs/..%2fsecret.txt')).status, 404);
  });

  test('healthz ok and 503 on db failure', async () => {
    assert.equal((await request(app).get('/healthz')).text, 'ok');
    const bad = buildApp({ repo: fakeRepo({ ping: async () => { throw new Error('boom'); } }) });
    const res = await request(bad.app).get('/healthz');
    assert.equal(res.status, 503);
    assert.doesNotMatch(res.text, /boom/);
  });

  test('error handler hides details and logs', async () => {
    const b = buildApp({ repo: fakeRepo({ stats: async () => { throw new Error('secret db detail'); } }) });
    const res = await request(b.app).get('/');
    assert.equal(res.status, 500);
    assert.doesNotMatch(res.text, /secret db detail/);
    assert.ok(b.logs.some((l) => l.level === 'error' && /secret db detail/.test(l.msg)));
    const api = await request(b.app).get('/api/megalitos.geojson');
    assert.equal(api.status, 200);
  });

  test('request log has no query string', async () => {
    await request(app).get('/megalitos?q=hola');
    assert.ok(logs.some((l) => l.path === '/megalitos'));
    assert.ok(!JSON.stringify(logs).includes('hola'));
  });

  test('search params are validated before reaching the repo', async () => {
    let seen;
    const b = buildApp({ repo: fakeRepo({ search: async (f) => { seen = f; return []; } }) });
    await request(b.app).get(`/megalitos?q=${'a'.repeat(300)}&tipo=evil&municipio=${'m'.repeat(300)}`);
    assert.equal(seen.q.length, 100);
    assert.equal(seen.tipo, '');
    assert.equal(seen.municipio.length, 120);
  });

  test('rate limit returns 429; CF header only trusted with TRUST_PROXY', async () => {
    const b = buildApp({ repo: fakeRepo(), env: { RATE_LIMIT_MAX: '2', TRUST_PROXY: '1' } });
    for (let i = 0; i < 2; i++) await request(b.app).get('/mapa').set('CF-Connecting-IP', '1.1.1.1');
    assert.equal((await request(b.app).get('/mapa').set('CF-Connecting-IP', '1.1.1.1')).status, 429);
    assert.equal((await request(b.app).get('/mapa').set('CF-Connecting-IP', '2.2.2.2')).status, 200);
    // without TRUST_PROXY the spoofed header is ignored
    const c = buildApp({ repo: fakeRepo(), env: { RATE_LIMIT_MAX: '2' } });
    for (let i = 0; i < 2; i++) await request(c.app).get('/mapa').set('CF-Connecting-IP', `9.9.9.${i}`);
    assert.equal((await request(c.app).get('/mapa').set('CF-Connecting-IP', '9.9.9.9')).status, 429);
  });
});
