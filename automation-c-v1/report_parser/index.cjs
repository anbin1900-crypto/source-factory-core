'use strict';

const PANEL_RE = /\bPANEL\b\s*\|\s*([^\r\n]+)/gi;
const KEY_RE = /(?:^|\|)\s*([A-Z][A-Z0-9_]*)\s*=\s*([^|\r\n]*)/g;
const ACCEPTED_STATUS = new Set(['REPORTED', 'END', 'PASS', 'BLOCKED_EXTERNAL', 'EXACT_BLOCKER']);

function normalize(value) { return String(value ?? '').trim(); }

function parsePanelReports(body, metadata = {}) {
  const text = String(body ?? '');
  const reports = [];
  let panelMatch;
  while ((panelMatch = PANEL_RE.exec(text)) !== null) {
    const fields = {};
    const fragment = `|${panelMatch[1]}`;
    let keyMatch;
    while ((keyMatch = KEY_RE.exec(fragment)) !== null) fields[keyMatch[1]] = normalize(keyMatch[2]);
    reports.push({ fields, post_id: metadata.post_id ?? metadata.id ?? null, created_at: metadata.created_at ?? null, source_index: panelMatch.index, raw: panelMatch[0].trim() });
  }
  return reports;
}

function detectSchema(fields) {
  if (fields.WAVE && fields.DISPATCH_ID) return 'INVALID_MIXED';
  if (fields.WAVE) return 'C_RESULT';
  if (fields.DISPATCH_ID) return 'REPEAT_RESULT';
  return 'UNKNOWN';
}

function validateReport(report, expected = {}, options = {}) {
  const fields = report?.fields || {};
  const reasons = [];
  for (const key of ['ROLE', 'COMMAND_ID', 'STATUS']) if (!fields[key]) reasons.push(`MISSING_${key}`);
  const schema = detectSchema(fields);
  const expectedSchema = options.schema || expected.schema || 'C_RESULT';
  if (schema === 'INVALID_MIXED') reasons.push('MIXED_SCHEMA');
  if (schema === 'UNKNOWN') reasons.push(expectedSchema === 'REPEAT_RESULT' ? 'MISSING_DISPATCH_ID' : 'MISSING_WAVE');
  if (schema !== 'UNKNOWN' && schema !== 'INVALID_MIXED' && schema !== expectedSchema) reasons.push('SCHEMA_MISMATCH');
  if (expected.role && fields.ROLE !== expected.role) reasons.push('ROLE_MISMATCH');
  if (expected.command_id && fields.COMMAND_ID !== expected.command_id) reasons.push('COMMAND_ID_MISMATCH');
  if (expectedSchema === 'C_RESULT' && expected.wave && fields.WAVE !== expected.wave) reasons.push('WAVE_MISMATCH');
  if (expectedSchema === 'REPEAT_RESULT' && expected.dispatch_id && fields.DISPATCH_ID !== expected.dispatch_id) reasons.push('DISPATCH_ID_MISMATCH');
  if (!ACCEPTED_STATUS.has(fields.STATUS)) reasons.push('STATUS_NOT_ACCEPTED');
  return { pass: reasons.length === 0, reasons, schema };
}

function correlateReports(comments, expected, options = {}) {
  const notBefore = options.not_before ? Date.parse(options.not_before) : null;
  const acceptedByKey = new Map();
  const rejected = [];
  const expectedSchema = options.schema || expected.schema || 'C_RESULT';
  for (const comment of comments || []) {
    for (const report of parsePanelReports(comment.body, comment)) {
      const validation = validateReport(report, expected, { schema: expectedSchema });
      if (!validation.pass) { rejected.push({ ...report, schema: validation.schema, reasons: validation.reasons }); continue; }
      const created = report.created_at ? Date.parse(report.created_at) : NaN;
      if (notBefore !== null && (!Number.isFinite(created) || created < notBefore)) { rejected.push({ ...report, reasons: ['STALE_REPORT'] }); continue; }
      const key = expectedSchema === 'REPEAT_RESULT' ? `${report.fields.ROLE}|${report.fields.COMMAND_ID}|${report.fields.DISPATCH_ID}` : `${report.fields.ROLE}|${report.fields.WAVE}|${report.fields.COMMAND_ID}`;
      const prev = acceptedByKey.get(key);
      if (!prev) acceptedByKey.set(key, report);
      else {
        const pt = prev.created_at ? Date.parse(prev.created_at) : -Infinity;
        const ct = report.created_at ? Date.parse(report.created_at) : -Infinity;
        const newer = ct > pt || (ct === pt && Number(report.post_id) > Number(prev.post_id));
        if (newer) { rejected.push({ ...prev, reasons: ['DUPLICATE_SUPERSEDED'] }); acceptedByKey.set(key, report); }
        else rejected.push({ ...report, reasons: ['DUPLICATE_IGNORED'] });
      }
    }
  }
  const accepted = [...acceptedByKey.values()];
  const expectedRoles = options.expected_roles || (expected.role ? [expected.role] : []);
  const reportedRoles = new Set(accepted.map((r) => r.fields.ROLE));
  const missing_roles = expectedRoles.filter((role) => !reportedRoles.has(role));
  return { accepted, rejected, missing_roles, reported_count: accepted.length, missing_count: missing_roles.length, post_ids: accepted.map((r) => r.post_id).filter((id) => id !== null) };
}

module.exports = { parsePanelReports, detectSchema, validateReport, correlateReports };
