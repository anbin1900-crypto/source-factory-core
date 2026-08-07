'use strict';

const STATUSES = Object.freeze({
  WAITING: '대기',
  WORKING: '작업중',
  RESULT_PENDING: '결과게시대기',
  COMPLETE: '완료',
  REVIEW_REQUIRED: '확인필요'
});

function assertString(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(code);
  return value.trim();
}

function normalizeNow(now) {
  const n = Number(now);
  if (!Number.isFinite(n) || n < 0) throw new Error('INVALID_NOW');
  return n;
}

function createLedger(state = {}) {
  const assignments = state.assignments && typeof state.assignments === 'object' ? state.assignments : {};
  return {
    schema_version: 'YOLLA_WORKER_LIVENESS_LEDGER_V1',
    assignments,
    refresh_receipts: state.refresh_receipts && typeof state.refresh_receipts === 'object' ? state.refresh_receipts : {},
    directive_receipts: state.directive_receipts && typeof state.directive_receipts === 'object' ? state.directive_receipts : {}
  };
}

function recordDirective(ledger, input) {
  const role = assertString(input.role, 'ROLE_REQUIRED');
  const resultKey = assertString(input.result_key, 'RESULT_KEY_REQUIRED');
  const chatUrl = assertString(input.chat_url, 'CHAT_URL_REQUIRED');
  const sentAt = normalizeNow(input.sent_at);
  const id = `${role}|${resultKey}`;
  if (ledger.directive_receipts[id]) {
    return { ledger, duplicate: true, directive_count_delta: 0, assignment: ledger.assignments[id] };
  }
  const assignment = {
    id,
    role,
    result_key: resultKey,
    chat_url: chatUrl,
    sent_at: sentAt,
    status: STATUSES.WAITING,
    last_checked_at: null,
    refreshed_at: null,
    refresh_count: 0,
    terminal_comment_id: null,
    github_result_url: null,
    baseline_response_token: input.baseline_response_token || null,
    last_response_token: input.baseline_response_token || null,
    review_reason: null
  };
  ledger.assignments[id] = assignment;
  ledger.directive_receipts[id] = { recorded_at: sentAt };
  return { ledger, duplicate: false, directive_count_delta: 1, assignment };
}

function terminalMatches(body, resultKey) {
  if (typeof body !== 'string') return false;
  const escaped = resultKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`C_RESULT\\|RESULT_KEY=${escaped}\\|ROLE=[^|\\r\\n]+\\|OUTCOME=(PASS|FAIL|BLOCKED|NO_WORK)\\|STATUS=END\\|RESULT_COMMIT=([0-9a-f]{40}|NONE)`, 'i');
  return pattern.test(body);
}

function applyGithubComments(ledger, comments, now) {
  const checkedAt = normalizeNow(now);
  const list = Array.isArray(comments) ? comments : [];
  for (const assignment of Object.values(ledger.assignments)) {
    const exact = list.find(c => terminalMatches(c && c.body, assignment.result_key));
    if (!exact) continue;
    assignment.status = STATUSES.COMPLETE;
    assignment.last_checked_at = checkedAt;
    assignment.terminal_comment_id = exact.id == null ? null : String(exact.id);
    assignment.github_result_url = exact.url || null;
    assignment.review_reason = null;
  }
  return ledger;
}

function refreshReceiptId(assignment) {
  return `${assignment.id}|${assignment.sent_at}|30m`;
}

function inspectAssignment(ledger, input) {
  const id = assertString(input.assignment_id, 'ASSIGNMENT_ID_REQUIRED');
  const assignment = ledger.assignments[id];
  if (!assignment) throw new Error('ASSIGNMENT_NOT_FOUND');
  const now = normalizeNow(input.now);
  if (assignment.status === STATUSES.COMPLETE) {
    return { action: 'NONE', status: assignment.status, refresh: false, recheck_after_ms: 0 };
  }
  const elapsed = now - assignment.sent_at;
  assignment.last_checked_at = now;
  if (elapsed < 30 * 60 * 1000) {
    assignment.status = input.generating ? STATUSES.WORKING : STATUSES.WAITING;
    return { action: 'NONE', status: assignment.status, refresh: false, recheck_after_ms: 0 };
  }
  if (input.generating) {
    assignment.status = STATUSES.WORKING;
    return { action: 'NONE', status: assignment.status, refresh: false, recheck_after_ms: 0 };
  }
  const receiptId = refreshReceiptId(assignment);
  if (!ledger.refresh_receipts[receiptId]) {
    ledger.refresh_receipts[receiptId] = { refreshed_at: now };
    assignment.refreshed_at = now;
    assignment.refresh_count += 1;
    return { action: 'REFRESH_ONCE', status: assignment.status, refresh: true, recheck_after_ms: 30000, refresh_receipt_id: receiptId };
  }
  const observed = input.observed_after_refresh || {};
  if (observed.generating) {
    assignment.status = STATUSES.WORKING;
    assignment.review_reason = null;
  } else if (observed.new_response || (observed.response_token && observed.response_token !== assignment.last_response_token)) {
    assignment.status = STATUSES.RESULT_PENDING;
    assignment.last_response_token = observed.response_token || assignment.last_response_token;
    assignment.review_reason = null;
  } else {
    assignment.status = STATUSES.REVIEW_REQUIRED;
    assignment.review_reason = observed.error ? 'CHAT_ERROR' : 'NO_ACTIVITY_AFTER_SINGLE_REFRESH';
  }
  return { action: 'CLASSIFIED', status: assignment.status, refresh: false, recheck_after_ms: 0 };
}

function toPanelRow(assignment, now) {
  const elapsedMs = Math.max(0, normalizeNow(now) - assignment.sent_at);
  return {
    ROLE: assignment.role,
    STATUS: assignment.status,
    elapsed_ms: elapsedMs,
    last_checked_at: assignment.last_checked_at,
    chat_open_url: assignment.chat_url,
    github_result_url: assignment.github_result_url
  };
}

module.exports = {
  STATUSES,
  createLedger,
  recordDirective,
  terminalMatches,
  applyGithubComments,
  inspectAssignment,
  toPanelRow
};
