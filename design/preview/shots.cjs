'use strict';
const puppeteer = require('puppeteer-core');
const OUT = process.argv[2] || '/shots';
require('fs').mkdirSync(OUT, { recursive: true });
const FASE2 = process.env.FASE2 === '1';
const pages = FASE2 ? [['rutas', '/rutas'], ['rutas-vacio', '/rutas?empty=1'], ['ruta-gr282', '/rutas/4275896'], ['ruta-pr82', '/rutas/8657756'], ['ruta-sl', '/rutas/3340192'], ['ficha-312-rutas', '/megalitos/312'], ['ficha-333-rutas', '/megalitos/333'], ['ficha-24-sin-rutas', '/megalitos/24'], ['ficha-1-sin-datos', '/megalitos/1'], ['mapa-rutas', '/mapa#10/42.96/-1.75', 'rutas']] : [['home', '/'], ['list', '/megalitos'], ['ficha-24', '/megalitos/24'], ['ficha-99', '/megalitos/99'], ['ficha-1', '/megalitos/1'], ['mapa', '/mapa'], ['ezkurdia', '/miguel-ezkurdia'], ['404', '/404']];
const sizes = [['desktop', 1440, 900], ['mobile', 390, 844]];
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium-browser', args: ['--no-sandbox', '--disable-gpu'], headless: 'new' });
  for (const scheme of (process.env.SCHEMES || 'light').split(',')) {
    for (const [sn, w, h] of sizes) {
      const p = await b.newPage();
      await p.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
      await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
      p.on('response', (r) => { if (r.status() >= 400) console.log('HTTP', r.status(), r.url()); });
      p.on('pageerror', (e) => console.log('pageerror', e.message));
      for (const [name, url, act] of pages) {
        await p.goto('http://localhost:8099' + url, { waitUntil: 'networkidle2', timeout: 60000 }).catch((e) => console.log('goto', e.message));
        if (act === 'rutas') { await p.click('#mapa-rutas').catch((e) => console.log('click', e.message)); await new Promise((r) => setTimeout(r, 1500)); }
        await new Promise((r) => setTimeout(r, name.startsWith('mapa') || name.startsWith('ruta-') || name.includes('ficha-3') ? 3500 : 500));
        if (name === 'list') await p.evaluate(() => window.scrollTo(0, 0)); await p.screenshot({ path: `${OUT}/${name}-${sn}${scheme === 'dark' ? '-dark' : ''}.png`, fullPage: !(name.startsWith('mapa') || name === 'list') });
      }
      await p.close();
    }
  }
  await b.close();
})();
