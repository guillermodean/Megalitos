'use strict';

const ARCHIVO_RE = /^\d{4}_(DIB|FOT|MAP|TEX)_\d+_\d+\.jpg$/;
const THUMB_RE = /^\d{4}_(DIB|FOT|MAP|TEX)_\d+_\d+\.webp$/;

// Integer id in 1..9999, digits only. Returns number or null.
function parseId(s) {
  if (typeof s !== 'string' || !/^\d{1,4}$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= 9999 ? n : null;
}

// OSM relation id: digits only, 1..Number.MAX_SAFE_INTEGER. Returns number or null.
function parseRutaId(s) {
  if (typeof s !== 'string' || !/^\d{1,16}$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

const REDES = ['iwn', 'nwn', 'rwn', 'lwn'];
function cleanRed(v) {
  return typeof v === 'string' && REDES.includes(v) ? v : '';
}

function cleanText(v, max) {
  if (typeof v !== 'string') return '';
  // strip control characters, collapse whitespace, cap length
  return v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

const cleanQ = (v) => cleanText(v, 100);
const cleanMunicipio = (v) => cleanText(v, 120);

// Only a known slug is accepted; anything else becomes ''.
function cleanTipo(v, knownSlugs) {
  return typeof v === 'string' && knownSlugs.includes(v) ? v : '';
}

function escapeLike(s) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// Build a boolean-mode FULLTEXT expression from free text: only letters/digits
// survive (no operators), words < 3 chars dropped, each word is a required prefix.
function booleanQuery(q) {
  const words = q
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((w) => w.length >= 3)
    .slice(0, 8);
  return words.length ? words.map((w) => `+${w}*`).join(' ') : null;
}

module.exports = {
  ARCHIVO_RE, THUMB_RE, parseId, parseRutaId, cleanRed, REDES, cleanQ, cleanMunicipio, cleanTipo, escapeLike, booleanQuery,
};
