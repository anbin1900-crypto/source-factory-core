'use strict';

const ASCII_DIGITS = /^[0-9]+$/;

function fail(code) { const e = new Error(code); e.code = code; throw e; }

function parseWavePointer(text) {
  const lines = String(text || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const header = lines.find(x => x.startsWith('C_MODE_WAVE_V2|'));
  if (!header) fail('MISSING_C_MODE_WAVE_V2');
  const h = Object.fromEntries(header.split('|').slice(1).map(p => p.split('=',2)));
  for (const k of ['WAVE_ID','READY','WORKER_COUNT','END_WAVE']) if (!(k in h)) fail(`MISSING_${k}`);
  if (h.READY !== 'true') fail('WAVE_NOT_READY');
  if (!ASCII_DIGITS.test(h.WORKER_COUNT)) fail('WORKER_COUNT_NOT_ASCII_DIGITS');
  if (Number(h.WORKER_COUNT) <= 0) fail('INVALID_WORKER_COUNT');
  if (!/^W[0-9]+$/.test(h.END_WAVE)) fail('INVALID_END_WAVE');

  const rows = lines.filter(x => /^W[0-9]+\|ROLE=/.test(x)).map((line) => {
    const parts = line.split('|');
    const wave = parts.shift();
    const obj = Object.fromEntries(parts.map(p => p.split('=',2)));
    for (const k of ['ROLE','PR','COMMENT','RESULT_KEY']) if (!(k in obj)) fail(`MISSING_${k}`);
    if (!ASCII_DIGITS.test(obj.PR)) fail('PR_NOT_ASCII_DIGITS');
    if (!ASCII_DIGITS.test(obj.COMMENT)) fail('COMMENT_NOT_ASCII_DIGITS');
    if (!ASCII_DIGITS.test(obj.RESULT_KEY)) fail('RESULT_KEY_NOT_ASCII_DIGITS');
    if (obj.RESULT_KEY !== `${obj.COMMENT}00`) fail('RESULT_KEY_MISMATCH');
    return { wave, role: obj.ROLE, pr: obj.PR, comment: obj.COMMENT, result_key: obj.RESULT_KEY };
  });
  if (rows.length !== Number(h.WORKER_COUNT)) fail('WORKER_COUNT_MISMATCH');
  const uniq = (key, code) => { const s = new Set(rows.map(r => r[key])); if (s.size !== rows.length) fail(code); };
  uniq('role','DUPLICATE_ROLE'); uniq('pr','DUPLICATE_PR'); uniq('comment','DUPLICATE_COMMENT'); uniq('result_key','DUPLICATE_RESULT_KEY');
  if (!rows.every(r => r.wave === h.END_WAVE)) fail('ROW_WAVE_MISMATCH');
  return { wave_id: h.WAVE_ID, ready: true, worker_count: rows.length, end_wave: h.END_WAVE, rows };
}

class PointerRelayState {
  constructor(snapshot = null) {
    this.fetched = new Map();
    this.dispatched = new Set();
    if (snapshot) this.restore(snapshot);
  }
  prefetch(pointer, fetchComment) {
    if (!pointer?.ready) fail('POINTER_NOT_READY');
    const fetched = new Map();
    for (const row of pointer.rows) {
      const body = fetchComment(row.pr, row.comment);
      if (typeof body !== 'string' || !body.length) fail('COMMENT_FETCH_FAILED');
      fetched.set(`${pointer.wave_id}:${row.role}:${row.comment}`, body);
    }
    if (fetched.size !== pointer.rows.length) fail('PREFETCH_INCOMPLETE');
    this.fetched = fetched;
    return fetched.size;
  }
  dispatchAll(pointer, send) {
    if (this.fetched.size !== pointer.rows.length) fail('PREFETCH_REQUIRED_BEFORE_DISPATCH');
    const out = [];
    for (const row of pointer.rows) {
      const key = `${pointer.wave_id}:${row.role}:${row.comment}`;
      if (this.dispatched.has(key)) continue;
      if (!this.fetched.has(key)) fail('COMMENT_NOT_PREFETCHED');
      send(row);
      this.dispatched.add(key);
      out.push(key);
    }
    return out;
  }
  snapshot() { return { fetched:[...this.fetched], dispatched:[...this.dispatched] }; }
  restore(s) {
    if (!s || !Array.isArray(s.fetched) || !Array.isArray(s.dispatched)) fail('INVALID_POINTER_SNAPSHOT');
    this.fetched = new Map(s.fetched);
    this.dispatched = new Set(s.dispatched);
  }
}

module.exports = { parseWavePointer, PointerRelayState };
