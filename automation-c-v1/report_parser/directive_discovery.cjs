'use strict';

const DIRECTIVE_ID_RE = /\bCOMMAND_ID\s*=\s*([A-Z0-9][A-Z0-9._-]*)/g;
const STATUS_RE = /\bSTATUS\s*=\s*([A-Z0-9_]+)/g;

function numericId(item) {
  const value = Number(item?.id ?? item?.post_id);
  return Number.isFinite(value) ? value : -1;
}

function commandIds(body) {
  const ids = [];
  let m;
  const text = String(body || '');
  while ((m = DIRECTIVE_ID_RE.exec(text)) !== null) ids.push(m[1]);
  return [...new Set(ids)];
}

function statuses(body) {
  const values = [];
  let m;
  const text = String(body || '');
  while ((m = STATUS_RE.exec(text)) !== null) values.push(m[1]);
  return values;
}

function isDirective(comment) {
  const body = String(comment?.body || '');
  return commandIds(body).length > 0 && !/NO_PENDING_DIRECTIVE/.test(body) && !/\bTERMINAL\s*=/.test(body);
}

function isTerminal(comment) {
  const body = String(comment?.body || '');
  return /\bTERMINAL\s*=/.test(body) || statuses(body).some((s) => ['END', 'PASS', 'BLOCKED', 'EXACT_BLOCKER', 'BLOCKED_EXTERNAL'].includes(s));
}

function discoverPendingDirectives(comments, options = {}) {
  const sorted = [...(comments || [])].sort((a, b) => numericId(a) - numericId(b));
  const directives = new Map();
  const terminals = new Map();
  const noPendingClaims = [];

  for (const comment of sorted) {
    const ids = commandIds(comment.body);
    if (/NO_PENDING_DIRECTIVE/.test(String(comment.body || ''))) noPendingClaims.push(comment);
    for (const id of ids) {
      if (isDirective(comment)) directives.set(id, comment);
      if (isTerminal(comment)) terminals.set(id, comment);
    }
  }

  const pending = [];
  for (const [commandId, directive] of directives.entries()) {
    const terminal = terminals.get(commandId);
    if (!terminal || numericId(terminal) < numericId(directive)) {
      pending.push({ command_id: commandId, directive_post_id: numericId(directive), terminal_post_id: terminal ? numericId(terminal) : null });
    }
  }
  pending.sort((a, b) => a.directive_post_id - b.directive_post_id);

  const falseNoPending = noPendingClaims.filter((claim) => pending.some((p) => p.directive_post_id < numericId(claim)));
  const latestDirective = [...directives.entries()].sort((a, b) => numericId(b[1]) - numericId(a[1]))[0] || null;

  return {
    pending,
    pending_count: pending.length,
    latest_directive: latestDirective ? { command_id: latestDirective[0], post_id: numericId(latestDirective[1]) } : null,
    false_no_pending_claim_post_ids: falseNoPending.map(numericId),
    fail_closed: pending.length > 0 || falseNoPending.length > 0,
    c_result_schema: 'ROLE+WAVE+COMMAND_ID+STATUS',
    repeat_result_schema: 'ROLE+COMMAND_ID+DISPATCH_ID+STATUS'
  };
}

module.exports = { commandIds, isDirective, isTerminal, discoverPendingDirectives };
