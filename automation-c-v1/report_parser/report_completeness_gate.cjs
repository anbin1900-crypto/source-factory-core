'use strict';

function n(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : -Infinity;
}

function evaluateReportCompleteness(entry) {
  const directive = entry.directive || null;
  const result = entry.result || null;
  const terminal = entry.terminal || null;
  const reasons = [];

  if (!directive) reasons.push('DIRECTIVE_MISSING');
  if (!result && terminal) return { status: 'REPORT_INCOMPLETE', reasons: ['RESULT_COMMIT_MISSING'] };
  if (result && !terminal) return { status: 'REPORT_MISSING', reasons: ['TERMINAL_MISSING'] };
  if (!result && !terminal) return { status: 'REPORT_MISSING', reasons: ['RESULT_AND_TERMINAL_MISSING'] };

  if (terminal.command_id !== directive.command_id) reasons.push('COMMAND_ID_MISMATCH');
  if (terminal.role !== directive.role) reasons.push('ROLE_MISMATCH');
  if (terminal.result_commit !== result.commit) reasons.push('RESULT_COMMIT_MISMATCH');
  if (n(terminal.post_id) <= n(directive.post_id)) reasons.push('TERMINAL_NOT_NEWER_THAN_DIRECTIVE');
  if (n(result.order) <= n(directive.order)) reasons.push('RESULT_NOT_AFTER_DIRECTIVE');
  if (n(terminal.order) <= n(result.order)) reasons.push('TERMINAL_NOT_AFTER_RESULT');

  return reasons.length ? { status: 'REPORT_INCOMPLETE', reasons } : { status: 'REPORTED', reasons: [] };
}

function buildLedger(entries) {
  let consecutiveMissing = 0;
  return entries.slice().sort((a, b) => n(a.directive?.order) - n(b.directive?.order)).map((entry) => {
    const verdict = evaluateReportCompleteness(entry);
    consecutiveMissing = verdict.status === 'REPORTED' ? 0 : consecutiveMissing + 1;
    return {
      role: entry.directive?.role || entry.role || null,
      wave: entry.directive?.wave || null,
      command_id: entry.directive?.command_id || null,
      directive_post_id: entry.directive?.post_id || null,
      result_commit: entry.result?.commit || null,
      terminal_post_id: entry.terminal?.post_id || null,
      directive_order: entry.directive?.order || null,
      result_order: entry.result?.order || null,
      terminal_order: entry.terminal?.order || null,
      status: verdict.status,
      reasons: verdict.reasons,
      consecutive_missing_count: consecutiveMissing,
    };
  });
}

function discoverPending(entries) {
  return buildLedger(entries).filter((row) => row.status !== 'REPORTED');
}

module.exports = { evaluateReportCompleteness, buildLedger, discoverPending };
