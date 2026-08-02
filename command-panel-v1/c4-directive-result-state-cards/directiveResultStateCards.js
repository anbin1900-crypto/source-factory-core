'use strict';

const crypto = require('node:crypto');

const DECISIONS = new Set(['PASS', 'BLOCKED', 'FAIL', 'NOT_RUN', 'UNKNOWN']);
const SHA40 = /^[0-9a-f]{40}$/;
const SHA64 = /^[0-9a-f]{64}$/;
const REPOSITORY = /^[^/\s]+\/[^/\s]+$/;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((out, key) => {
      out[key] = stable(value[key]);
      return out;
    }, {});
  }
  return value;
}

function sha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function requireValue(condition, message) {
  if (!condition) throw new TypeError(message);
}

function badgeFor(source) {
  return source && source.fixture === true ? 'FIXTURE' : 'LIVE';
}

function postUrl(repository, prNumber, commentId) {
  requireValue(REPOSITORY.test(repository), 'repository must be owner/name');
  requireValue(Number.isInteger(prNumber) && prNumber > 0, 'pr_number must be positive integer');
  requireValue(Number.isInteger(commentId) && commentId > 0, 'comment_id must be positive integer');
  return `https://github.com/${repository}/pull/${prNumber}#issuecomment-${commentId}`;
}

function validateIso(value, field) {
  requireValue(typeof value === 'string' && Number.isFinite(Date.parse(value)), `${field} must be ISO date-time`);
}

function buildDirectiveCard(source) {
  requireValue(source && typeof source === 'object', 'directive package is required');
  const required = [
    'role_id', 'repository', 'pr_number', 'comment_id', 'directive_id',
    'cycle_id', 'assignment_id', 'status', 'source_time', 'selection_reason'
  ];
  for (const field of required) requireValue(source[field] !== undefined && source[field] !== '', `${field} is required`);
  validateIso(source.source_time, 'source_time');

  return {
    schema_version: 'EXACT_DIRECTIVE_CARD_V1',
    card_type: 'DIRECTIVE',
    badge: badgeFor(source),
    role_id: source.role_id,
    repository: source.repository,
    pr_number: source.pr_number,
    comment_id: source.comment_id,
    directive_id: source.directive_id,
    cycle_id: source.cycle_id,
    assignment_id: source.assignment_id,
    status: source.status,
    reason: source.reason ?? null,
    source_time: source.source_time,
    selection_reason: source.selection_reason,
    source_package_sha256: sha256(source),
    open_post_label: '게시물 열기',
    open_post_url: postUrl(source.repository, source.pr_number, source.comment_id)
  };
}

function hasSupportedPassEvidence(source) {
  return SHA40.test(source.remote_head || '')
    && Number.isInteger(source.result_comment_id) && source.result_comment_id > 0
    && typeof source.output_pointer === 'string' && source.output_pointer.length > 0
    && typeof source.terminal === 'string' && source.terminal.length > 0
    && typeof source.completed_at === 'string' && Number.isFinite(Date.parse(source.completed_at))
    && (source.blocker === null || source.blocker === undefined || source.blocker === '');
}

function buildResultCard(source) {
  requireValue(source && typeof source === 'object', 'result package is required');
  requireValue(REPOSITORY.test(source.repository || ''), 'repository must be owner/name');
  requireValue(Number.isInteger(source.pr_number) && source.pr_number > 0, 'pr_number is required');
  requireValue(typeof source.result_for_directive_id === 'string' && source.result_for_directive_id.length > 0, 'result_for_directive_id is required');
  requireValue(typeof source.terminal === 'string' && source.terminal.length > 0, 'terminal is required');
  requireValue(DECISIONS.has(source.decision), 'decision is unsupported');

  const supportedPass = source.decision !== 'PASS' || hasSupportedPassEvidence(source);
  const contradictory = source.decision === 'PASS' && source.blocker;
  const evidenceStatus = contradictory ? 'CONTRADICTORY' : (supportedPass ? 'SUPPORTED' : 'INCOMPLETE');
  const displayDecision = source.decision === 'PASS' && !supportedPass ? 'UNVERIFIED' : source.decision;
  const commentId = Number.isInteger(source.result_comment_id) && source.result_comment_id > 0
    ? source.result_comment_id
    : null;

  return {
    schema_version: 'EXACT_RESULT_CARD_V1',
    card_type: 'RESULT',
    badge: badgeFor(source),
    repository: source.repository,
    pr_number: source.pr_number,
    result_for_directive_id: source.result_for_directive_id,
    terminal: source.terminal,
    decision: source.decision,
    display_decision: displayDecision,
    remote_head: SHA40.test(source.remote_head || '') ? source.remote_head : null,
    result_comment_id: commentId,
    output_pointer: typeof source.output_pointer === 'string' && source.output_pointer.length > 0 ? source.output_pointer : null,
    blocker: source.blocker ?? null,
    completed_at: typeof source.completed_at === 'string' && Number.isFinite(Date.parse(source.completed_at)) ? source.completed_at : null,
    evidence_status: evidenceStatus,
    unsupported_pass_suppressed: source.decision === 'PASS' && !supportedPass,
    source_package_sha256: sha256(source),
    open_result_post_label: '결과 게시물 열기',
    open_result_post_url: commentId ? postUrl(source.repository, source.pr_number, commentId) : null
  };
}

function hasSupportedBackupEvidence(receipt) {
  return receipt
    && typeof receipt.drive_file_id === 'string' && receipt.drive_file_id.length > 0
    && SHA64.test(receipt.sha256 || '')
    && Number.isInteger(receipt.size_bytes) && receipt.size_bytes >= 0
    && typeof receipt.mime === 'string' && receipt.mime.length > 0
    && typeof receipt.version === 'string' && receipt.version.length > 0
    && receipt.readback_status === 'PASS'
    && typeof receipt.completed_at === 'string' && Number.isFinite(Date.parse(receipt.completed_at));
}

function buildPcAgentBackupStatusCard(snapshot, receipt) {
  requireValue(snapshot && typeof snapshot === 'object', 'PC state snapshot is required');
  requireValue(receipt && typeof receipt === 'object', 'backup receipt is required');
  requireValue(typeof snapshot.pc_id === 'string' && snapshot.pc_id.length > 0, 'pc_id is required');
  requireValue(typeof snapshot.agent_status === 'string' && snapshot.agent_status.length > 0, 'agent_status is required');
  validateIso(snapshot.observed_at, 'observed_at');
  requireValue(SHA40.test(snapshot.github_commit || ''), 'github_commit must be 40 lowercase hex');
  requireValue(Number.isInteger(snapshot.retry_count) && snapshot.retry_count >= 0, 'retry_count must be non-negative integer');

  const supported = hasSupportedBackupEvidence(receipt);
  const contradictory = receipt.readback_status === 'PASS' && !supported;

  return {
    schema_version: 'PC_AGENT_BACKUP_STATUS_CARD_V1',
    card_type: 'PC_AGENT_BACKUP_STATUS',
    badge: snapshot.fixture === true || receipt.fixture === true ? 'FIXTURE' : 'LIVE',
    pc_id: snapshot.pc_id,
    agent_status: snapshot.agent_status,
    observed_at: snapshot.observed_at,
    github_commit: snapshot.github_commit,
    retry_count: snapshot.retry_count,
    backup_receipt: {
      drive_file_id: receipt.drive_file_id ?? null,
      sha256: SHA64.test(receipt.sha256 || '') ? receipt.sha256 : null,
      size_bytes: Number.isInteger(receipt.size_bytes) && receipt.size_bytes >= 0 ? receipt.size_bytes : null,
      mime: receipt.mime ?? null,
      version: receipt.version ?? null,
      readback_status: receipt.readback_status || 'UNKNOWN',
      completed_at: typeof receipt.completed_at === 'string' && Number.isFinite(Date.parse(receipt.completed_at)) ? receipt.completed_at : null
    },
    backup_evidence_status: contradictory ? 'CONTRADICTORY' : (supported ? 'SUPPORTED' : 'INCOMPLETE'),
    unsupported_pass_suppressed: receipt.readback_status === 'PASS' && !supported
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function row(label, value) {
  return `<div class="card-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function renderDirectiveCardHtml(card) {
  return [
    `<article class="state-card directive-card" data-card-type="DIRECTIVE">`,
    `<header><span class="badge badge-${card.badge.toLowerCase()}">${escapeHtml(card.badge)}</span><h3>현재 지시</h3></header>`,
    '<dl>',
    row('Role ID', card.role_id), row('Repository', card.repository), row('PR Number', card.pr_number),
    row('Comment ID', card.comment_id), row('Directive ID', card.directive_id), row('Cycle ID', card.cycle_id),
    row('Assignment ID', card.assignment_id), row('Status', card.status), row('Reason', card.reason),
    row('Source Time', card.source_time), row('Selection Reason', card.selection_reason),
    '</dl>',
    `<a data-action="open-post" href="${escapeHtml(card.open_post_url)}">[${escapeHtml(card.open_post_label)}]</a>`,
    '</article>'
  ].join('');
}

function renderResultCardHtml(card) {
  return [
    `<article class="state-card result-card" data-card-type="RESULT">`,
    `<header><span class="badge badge-${card.badge.toLowerCase()}">${escapeHtml(card.badge)}</span><h3>최신 결과</h3></header>`,
    '<dl>',
    row('Directive ID', card.result_for_directive_id), row('Terminal', card.terminal),
    row('Decision', card.display_decision), row('Remote Head', card.remote_head),
    row('Result Comment ID', card.result_comment_id), row('Output Pointer', card.output_pointer),
    row('Blocker', card.blocker), row('Completed At', card.completed_at), row('Evidence', card.evidence_status),
    '</dl>',
    card.open_result_post_url
      ? `<a data-action="open-result-post" href="${escapeHtml(card.open_result_post_url)}">[${escapeHtml(card.open_result_post_label)}]</a>`
      : '<span data-action="open-result-post-unavailable">[결과 게시물 없음]</span>',
    '</article>'
  ].join('');
}

function renderPcAgentBackupStatusCardHtml(card) {
  return [
    `<article class="state-card pc-agent-card" data-card-type="PC_AGENT_BACKUP_STATUS">`,
    `<header><span class="badge badge-${card.badge.toLowerCase()}">${escapeHtml(card.badge)}</span><h3>PC Agent·백업 상태</h3></header>`,
    '<dl>',
    row('PC ID', card.pc_id), row('Agent Status', card.agent_status), row('Observed At', card.observed_at),
    row('GitHub Commit', card.github_commit), row('Retry Count', card.retry_count),
    row('Drive File ID', card.backup_receipt.drive_file_id), row('Backup SHA-256', card.backup_receipt.sha256),
    row('Backup Size', card.backup_receipt.size_bytes), row('Backup MIME', card.backup_receipt.mime),
    row('Backup Version', card.backup_receipt.version), row('Readback', card.backup_receipt.readback_status),
    row('Backup Completed At', card.backup_receipt.completed_at), row('Backup Evidence', card.backup_evidence_status),
    '</dl>',
    '</article>'
  ].join('');
}

function renderDirectiveResultStateCards({ directive, result, pcState, backupReceipt }) {
  const directiveCard = buildDirectiveCard(clone(directive));
  const resultCard = buildResultCard(clone(result));
  const pcAgentCard = buildPcAgentBackupStatusCard(clone(pcState), clone(backupReceipt));
  return {
    models: { directiveCard, resultCard, pcAgentCard },
    html: [
      '<section class="directive-result-state-cards">',
      renderDirectiveCardHtml(directiveCard),
      renderResultCardHtml(resultCard),
      renderPcAgentBackupStatusCardHtml(pcAgentCard),
      '</section>'
    ].join(''),
    unsupported_pass_display_count: Number(resultCard.unsupported_pass_suppressed) + Number(pcAgentCard.unsupported_pass_suppressed)
  };
}

module.exports = {
  buildDirectiveCard,
  buildResultCard,
  buildPcAgentBackupStatusCard,
  renderDirectiveCardHtml,
  renderResultCardHtml,
  renderPcAgentBackupStatusCardHtml,
  renderDirectiveResultStateCards,
  postUrl,
  sha256
};
