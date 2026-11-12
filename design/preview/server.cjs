'use strict';
// Static design-preview harness: renders src/views with express-handlebars using fixtures,
// writes HTML to design/preview/out/ and serves src/public + a few mock routes.
const path = require('path');
const fs = require('fs');
const express = require('express');
const { engine } = require('express-handlebars');
const fx = require('./fixtures.cjs');

const SRC = path.resolve(__dirname, '../../src');
const OUT = path.join(__dirname, 'out');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const helpers = {
  eq: (a, b) => a === b,
  pad4: (n) => String(n).padStart(4, '0'),
  fmtNum: (n) => Number(n).toLocaleString('es-ES'),
  nl2p: (s) => new (require('handlebars').SafeString)(String(s || '').split(/\n{1,}/).map((t) => t.trim()).filter(Boolean).map((t) => `<p>${esc(t)}</p>`).join('')),
};
const app = express();
app.engine('hbs', engine({ extname: '.hbs', defaultLayout: 'main', layoutsDir: path.join(SRC, 'views/layouts'), partialsDir: path.join(SRC, 'views/partials'), helpers }));
app.set('view engine', 'hbs');
app.set('views', path.join(SRC, 'views'));

const meta = (title, active, description) => ({ title, active, description: description || 'Inventario digital de los megalitos de Navarra: legado de Miguel Ezkurdia, publicado por SCN Gorosti.', year: 2026 });
app.use(express.static(path.join(SRC, 'public')));
const IMAGES = process.env.IMAGES_DIR || '/data/anexos';
app.get('/anexos/thumbs/:f', (req, res) => res.sendFile(path.join(IMAGES, req.params.f.replace(/\.webp$/, '.jpg')), (e) => e && res.status(404).end()));
app.get('/anexos/:f', (req, res) => res.sendFile(path.join(IMAGES, req.params.f), (e) => e && res.status(404).end()));
app.get('/api/megalitos.geojson', (_q, res) => res.json(fx.geo));

app.get('/api/rutas.geojson', (_q, res) => res.json(fx.R.all()));
app.get('/api/rutas/:id.geojson', (q, res) => { const f = fx.R.feature(+q.params.id); f ? res.json(f) : res.status(404).end(); });
app.get('/rutas', (q, res) => res.render('rutas', { ...meta('Rutas · Megalitos de Navarra', 'rutas'), ...fx.rutasList(q.query) }));
app.get('/rutas/:id', (q, res) => { const d = fx.rutaView(+q.params.id); if (!d) return res.status(404).end(); res.render('ruta', { ...meta(`${d.r.ref || d.r.nombre} · Rutas`, 'rutas'), ...d }); });
app.get('/', (_q, res) => res.render('home', { ...meta('Megalitos de Navarra', 'home'), ...fx.home() }));
app.get('/megalitos', (q, res) => res.render('list', { ...meta('Catálogo · Megalitos de Navarra', 'list'), ...fx.list(q.query) }));
app.get('/megalitos/:id', (q, res) => { const d = fx.ficha(+q.params.id); res.render('ficha', { ...meta(`${d.m.nombre} · Nº ${d.m.id}`, 'list'), ...d }); });
app.get('/mapa', (_q, res) => res.render('mapa', meta('Mapa · Megalitos de Navarra', 'mapa')));
app.get('/miguel-ezkurdia', (_q, res) => res.render('ezkurdia', meta('Miguel Ezkurdia', 'ezkurdia')));
app.get('/404', (_q, res) => res.status(404).render('404', { ...meta('No encontrada', ''), message: 'La página que buscas no existe o ha cambiado de sitio.' }));
app.get('/error', (_q, res) => res.status(500).render('error', { ...meta('Error', ''), message: 'Ha ocurrido un error inesperado. Inténtalo de nuevo en unos minutos.' }));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const render = (view, data, file) => new Promise((ok, ko) => app.render(view, data, (e, html) => {
    if (e) return ko(e);
    // render() returns the view only; wrap with the layout through express-handlebars
    ok(html);
  }));
  const pages = { 'index.html': ['home', { ...meta('Megalitos de Navarra', 'home'), ...fx.home() }], 'list.html': ['list', { ...meta('Catálogo', 'list'), ...fx.list() }], 'ficha-24.html': ['ficha', (() => { const d = fx.ficha(24); return { ...meta(d.m.nombre, 'list'), ...d }; })()], 'mapa.html': ['mapa', meta('Mapa', 'mapa')], 'ezkurdia.html': ['ezkurdia', meta('Miguel Ezkurdia', 'ezkurdia')], '404.html': ['404', { ...meta('404', ''), message: 'No encontrada.' }] };
  for (const [f, [v, d]] of Object.entries(pages)) fs.writeFileSync(path.join(OUT, f), await render(v, d));
  app.listen(8099, () => console.log('preview on :8099, static HTML in design/preview/out'));
})().catch((e) => { console.error(e); process.exit(1); });
