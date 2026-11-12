'use strict';

// Env parsing + validation. Fails fast when required DB settings are missing.

function int(env, name, def, { min = -Infinity, max = Infinity } = {}) {
  const raw = env[name];
  if (raw === undefined || raw === '') return def;
  if (!/^\d+$/.test(String(raw).trim())) throw new Error(`Invalid ${name}: expected integer`);
  const n = Number(raw);
  if (n < min || n > max) throw new Error(`Invalid ${name}: out of range`);
  return n;
}

function parseTrustProxy(raw) {
  if (raw === undefined || raw === '' || raw === '0' || raw === 'false') return false;
  if (raw === 'true') return true;
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw; // e.g. 'loopback' or a CIDR list
}

function loadConfig(env = process.env) {
  const missing = ['DB_HOST', 'DB_USER', 'DB_PASSWORD'].filter((k) => !env[k]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  return Object.freeze({
    env: env.NODE_ENV || 'development',
    port: int(env, 'PORT', 8000, { min: 1, max: 65535 }),
    db: Object.freeze({
      host: env.DB_HOST,
      port: int(env, 'DB_PORT', 3306, { min: 1, max: 65535 }),
      database: env.DB_NAME || 'megalitos',
      user: env.DB_USER,
      password: env.DB_PASSWORD,
    }),
    imagesDir: env.IMAGES_DIR || '/data/anexos',
    thumbsDir: env.THUMBS_DIR || '/data/thumbs',
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    rateLimit: Object.freeze({
      windowMs: 5 * 60 * 1000,
      max: int(env, 'RATE_LIMIT_MAX', 300, { min: 1 }),
    }),
  });
}

module.exports = { loadConfig, parseTrustProxy };
