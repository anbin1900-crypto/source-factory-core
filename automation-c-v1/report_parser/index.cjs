'use strict';

const PANEL_RE = /\bPANEL\b\s*\|\s*([^\r\n]+)/gi;
const KEY_RE = /(?:^|\|)\s*([A-Z][A-Z0-9_]*)\s*=\s*([^|\r\n]*)/g;

function normalize(value) {
  return String(value ?? '').trim();
}

function parsePanelReports(body, metadata = {}) {
  const text = String(body ?? '');
  const reports = [];
  let panelMatch;
  while ((panelMatch = PANEL_RE.exec(text)) !== null) {
    const fields = {};
    const fragment = `|${panelMatch[1]}`;
    let keyMatch;
    while ((keyMatch = KEY_RE.exec(fragment)) !== null) {
      fields[keyMatch[1]] = normalize(keyMatch[2]);
    }
    reports.push({
      fields,
      post_id: metadata.post_id ?? metadata.id ?? null,
      created_at: metadata.created_at ?? null,
      source_index: panelMatch.index,
      raw: panelMatch[0].trim(),
    });
  }
  return reports;
}

function validateCorrelation(report, expected) {
  const fields = report?.fields || {};
  const reasons = [];
  for (const key of ['ROLE', 'WAVE', 'COMMAND_ID']) {
    if (!fields[key]) reasons.push(`MISSING_${key}`);
  }
  if (expected.role && fields.ROLE !== expected.role) reasons.push('ROLE_MISMATCH');
  if (expected.wave && fields.WAVE !== expected.wave) reasons.push('WAVE_MISMATCH');
  if (expected.command_id && fields.COMMAND_ID !== expected.command_id) reasons.push('COMMAND_ID_MISMATCH');
  if (!fields.STATUS) reasons.push('MISSING_STATUS');
  return { pass: reasons.length === 0, reasons };
}

function correlateReports(comments, expected, options = {}) {
  const statuses = new Set(options.accepted_statuses || ['REPORTED', 'END']);
  const notBefore = options.not_before ? Date.parse(options.not_before) : null;
  const acceptedByRole = new Map();
  const rejected = [];

  for (const comment of comments || []) {
    for (const report of parsePanelReports(comment.body, comment)) {
      const validation = validateCorrelation(report, expected);
      if (!validation.pass) {
        rejected.push({ ...report, reasons: validation.reasons });
        continue;
      }
      if (!statuses.has(report.fields.STATUS)) {
        rejected.push({ ...report, reasons: ['STATUS_NOT_ACCEPTED'] });
        continue;
      }
      const created = report.created_at ? Date.parse(report.created_at) : NaN;
      if (notBefore !== null && (!Number.isFinite(created) || created < notBefore)) {
        rejected.push({ ...report, reasons: ['STALE_REPORT'] });
        continue;
      }
      const role = report.fields.ROLE;
      const previous = acceptedByRole.get(role);
      if (!previous) {
        acceptedByRole.set(role, report);
      } else {
        const previousTime = previous.created_at ? Date.parse(previous.created_at) : -Infinity;
        const currentTime = report.created_at ? Date.parse(report.created_at) : -Infinity;
        if (currentTime > previousTime || (currentTime === previousTime && Number(report.post_id) > Number(previous.post_id))) {
          rejected.push({ ...previous, reasons: ['DUPLICATE_ROLE_SUPERSEDED'] });
          acceptedByRole.set(role, report);
        } else {
          rejected.push({ ...report, reasons: ['DUPLICATE_ROLE_IGNORED'] });
        }
      }
    }
  }

  const accepted = [...acceptedByRole.values()];
  const expectedRoles = options.expected_roles || (expected.role ? [expected.role] : []);
  const reportedRoles = new Set(accepted.map((r) => r.fields.ROLE));
  const missing_roles = expectedRoles.filter((role) => !reportedRoles.has(role));
  return {
    accepted,
    rejected,
    missing_roles,
    reported_count: accepted.length,
    missing_count: missing_roles.length,
    post_ids: accepted.map((r) => r.post_id).filter((id) => id !== null),
  };
}

module.exports = { parsePanelReports, validateCorrelation, correlateReports };
