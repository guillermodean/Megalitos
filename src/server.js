'use strict';

const { loadConfig } = require('./config');
const { createPool } = require('./db');
const { createRepo } = require('./lib/repo');
const { createApp } = require('./app');

let config;
try {
  config = loadConfig();
} catch (e) {
  console.error(`Configuration error: ${e.message}`);
  process.exit(1);
}

const pool = createPool(config.db);
const app = createApp({ config, repo: createRepo(pool) });
const server = app.listen(config.port, () => {
  console.log(JSON.stringify({ msg: 'listening', port: config.port }));
});
server.keepAliveTimeout = 65_000;

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(JSON.stringify({ msg: 'shutdown', signal }));
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  server.close(async () => {
    try { await pool.end(); } catch { /* ignore */ }
    process.exit(0);
  });
  server.closeIdleConnections?.();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
