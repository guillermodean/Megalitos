'use strict';

const Handlebars = require('handlebars');

const nf = new Intl.NumberFormat('es-ES', { useGrouping: 'always', maximumFractionDigits: 6 });

function eq(a, b) {
  return a === b;
}

function fmtNum(n) {
  if (n === null || n === undefined || n === '' || Number.isNaN(Number(n))) return '';
  return nf.format(Number(n));
}

// Escape FIRST, then add markup: blank line = new paragraph, single newline = <br>.
function nl2p(text) {
  if (text === null || text === undefined) return new Handlebars.SafeString('');
  const escaped = Handlebars.escapeExpression(String(text)).replace(/\r\n?/g, '\n').trim();
  if (!escaped) return new Handlebars.SafeString('');
  const html = escaped
    .split(/\n{2,}/)
    .map((p) => `<p>${p.trim().replace(/\n/g, '<br>')}</p>`)
    .join('');
  return new Handlebars.SafeString(html);
}

// Catalogue number: 24 -> "0024".
function pad4(n) {
  const v = Number.parseInt(n, 10);
  return Number.isFinite(v) ? String(v).padStart(4, '0') : '';
}

module.exports = { eq, fmtNum, nl2p, pad4 };
