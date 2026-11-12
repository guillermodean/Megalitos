'use strict';

const path = require('node:path');
const net = require('node:net');

// Peers allowed to act as reverse proxy (cloudflared reaches us through Docker networking).
const PROXY_PEERS = new net.BlockList();
PROXY_PEERS.addSubnet('172.16.0.0', 12, 'ipv4');
PROXY_PEERS.addSubnet('127.0.0.0', 8, 'ipv4');
PROXY_PEERS.addAddress('::1', 'ipv6');
function isProxyPeer(addr) {
  if (!addr) return false;
  const a = addr.startsWith('::ffff:') ? addr.slice(7) : addr;
  return PROXY_PEERS.check(a, net.isIPv6(a) ? 'ipv6' : 'ipv4');
}
const express = require('express');
const helmet = require('helmet');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { engine } = require('express-handlebars');

const helpers = require('./lib/hbs-helpers');
const { pagesRouter } = require('./routes/pages');
const { apiRouter } = require('./routes/api');
const { anexosRouter } = require('./routes/anexos');
const { legacyRouter } = require('./routes/legacy');

const CSP = {
  useDefaults: false,
  directives: {
    'default-src': ["'self'"],
    'img-src': [
      "'self'", 'data:',
      'https://tile.openstreetmap.org', 'https://*.tile.openstreetmap.org',
      'https://tile.opentopomap.org', 'https://*.tile.opentopomap.org',
      'https://www.ign.es', 'https://tms-mapa-raster.ign.es', 'https://tms-ign-base.ign.es',
    ],
    'script-src': ["'self'"],
    'style-src': ["'self'"],
    'connect-src': ["'self'"],
    'font-src': ["'self'"],
    'frame-ancestors': ["'none'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
  },
};

const MESSAGES = {
  400: 'La petición no es válida.',
  404: 'No hemos encontrado lo que buscas.',
  405: 'Método no permitido.',
  429: 'Demasiadas peticiones. Inténtalo de nuevo en unos minutos.',
  500: 'Ha ocurrido un error inesperado. Inténtalo de nuevo más tarde.',
};

/**
 * App factory. Dependencies are injected so tests can swap them.
 * deps: { config, repo, viewsDir?, publicDir?, log? }
 */
function createApp({ config, repo, viewsDir, publicDir, log = defaultLog }) {
  const views = viewsDir || path.join(__dirname, 'views');
  const pub = publicDir || path.join(__dirname, 'public');
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.set('etag', 'strong');
  // Cache-busting token for CSS/JS URLs: changes on every deploy/restart (Cloudflare caches static files).
  app.locals.assetV = process.env.ASSET_VERSION || Date.now().toString(36);

  app.engine('hbs', engine({
    extname: '.hbs',
    defaultLayout: 'main',
    layoutsDir: path.join(views, 'layouts'),
    partialsDir: path.join(views, 'partials'),
    helpers,
  }));
  app.set('view engine', 'hbs');
  app.set('views', views);

  app.use(helmet({
    contentSecurityPolicy: CSP,
    crossOriginEmbedderPolicy: false, // map tiles come from other origins
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }));

  // Helmet has no Permissions-Policy: deny powerful features the site never uses.
  app.use((req, res, next) => {
    res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
    next();
  });

  // Request log: method, path (no query string), status, duration.
  app.use((req, res, next) => {
    const t0 = process.hrtime.bigint();
    res.on('finish', () => {
      if (req.path === '/healthz') return;
      log({ t: new Date().toISOString(), method: req.method, path: req.path, status: res.statusCode,
        ms: Math.round(Number(process.hrtime.bigint() - t0) / 1e6) });
    });
    next();
  });

  // GET/HEAD only.
  app.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    res.set('Allow', 'GET, HEAD');
    return fail(req, res, 405);
  });

  app.get('/healthz', async (req, res) => {
    res.set('Cache-Control', 'no-store').type('text/plain');
    try {
      await repo.ping();
      res.send('ok');
    } catch (e) {
      log({ level: 'error', msg: 'healthz db ping failed', err: e.message });
      res.status(503).send('db unavailable');
    }
  });

  // Static assets: vendor + fonts immutable (versioned by path), rest short-lived.
  const staticOpts = { dotfiles: 'ignore', index: false, fallthrough: true };
  const immutable = (res) => res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  app.use('/vendor', express.static(path.join(pub, 'vendor'), { ...staticOpts, setHeaders: immutable }));
  app.use('/fonts', express.static(path.join(pub, 'fonts'), { ...staticOpts, setHeaders: immutable }));
  app.use(express.static(pub, { ...staticOpts, maxAge: '1h' }));

  app.use('/anexos', anexosRouter({ imagesDir: config.imagesDir, thumbsDir: config.thumbsDir }));

  // Rate limit pages + api. Only trust CF-Connecting-IP when behind a configured proxy.
  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    limit: config.rateLimit.max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => {
      // Honour CF-Connecting-IP only when the TCP peer is the tunnel side (Docker bridge / loopback),
      // so a LAN client hitting :8050 directly cannot spoof its rate-limit key (S-02).
      const cf = config.trustProxy && isProxyPeer(req.socket.remoteAddress) ? req.get('cf-connecting-ip') : null;
      return ipKeyGenerator(cf || req.ip || '');
    },
    handler: (req, res) => fail(req, res, 429),
  });
  app.use(limiter);

  // HTML pages: short cache.
  app.use((req, res, next) => {
    if (!res.get('Cache-Control')) res.set('Cache-Control', 'public, max-age=60');
    next();
  });

  app.use('/api', apiRouter({ repo }));
  app.use(legacyRouter());
  app.use(pagesRouter({ repo }));

  app.use((req, res) => fail(req, res, 404));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status >= 400 && err.status < 500 ? err.status : 500;
    if (status === 500) log({ level: 'error', msg: err.message, stack: err.stack, path: req.path });
    if (res.headersSent) return res.destroy();
    return fail(req, res, status);
  });

  function fail(req, res, status) {
    const message = MESSAGES[status] || MESSAGES[500];
    res.status(status).set('Cache-Control', 'no-store');
    if (req.path.startsWith('/api/')) return res.json({ error: message });
    const view = status === 404 ? '404' : 'error';
    return res.render(view, {
      title: status === 404 ? 'No encontrado · Megalitos de Navarra' : 'Error · Megalitos de Navarra',
      description: message, active: '', year: new Date().getFullYear(), message,
    }, (renderErr, html) => {
      if (renderErr) {
        log({ level: 'error', msg: 'error view failed', err: renderErr.message });
        return res.type('text/plain').send(message);
      }
      return res.send(html);
    });
  }

  return app;
}

function defaultLog(entry) {
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}

module.exports = { createApp, CSP, MESSAGES };
