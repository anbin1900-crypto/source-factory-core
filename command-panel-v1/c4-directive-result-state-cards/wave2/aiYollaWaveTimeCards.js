'use strict';

const crypto = require('node:crypto');

const SERVICE_NAMES = Object.freeze([
  '욜라 부동산 전문 AI',
  '욜라 주유소 전문 AI',
  '욜라 위험물 전문 AI'
]);
const COMPONENT_NAMES = Object.freeze([
  'AI욜라 Runtime',
  'AI욜라 Data Base',
  '선택된 전문 AI 서비스'
]);
const DECISIONS = new Set(['PASS', 'BLOCKED', 'FAIL', 'NOT_RUN', 'UNKNOWN']);
const SHA40 = /^[0-9a-f]{40}$/;
const SHA64 = /^[0-9a-f]{64}$/;
const KST_MINUTE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}) KST$/;
const STATE_LABELS = Object.freeze({
  EXECUTABLE: '실행가능',
  DUPLICATE_BLOCKED: '중복 Prompt 차단',
  STALE_WAVE_BLOCKED: '구버전 Wave 차단',
  AUTHORITY_CONFLICT: '권위 충돌',
  COMPLETED: '완료'
});
const BADGES = Object.freeze({
  EXECUTABLE: 'WAVE',
  DUPLICATE_BLOCKED: 'DUPLICATE',
  STALE_WAVE_BLOCKED: 'STALE',
  AUTHORITY_CONFLICT: 'CONFLICT',
  COMPLETED: 'COMPLETED'
});

class AiYollaWaveCardError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = 'AiYollaWaveCardError';
    this.code = code;
    this.details = details;
  }
}

function requireCondition(condition, code, details = {}) {
  if (!condition) throw new AiYollaWaveCardError(code, details);
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

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function parseKstMinute(value, field) {
  const match = KST_MINUTE.exec(value || '');
  requireCondition(Boolean(match), 'INVALID_KST_MINUTE', { field, value });
  const [, year, month, day, hour, minute] = match;
  const iso = `${year}-${month}-${day}T${hour}:${minute}:00+09:00`;
  const epoch = Date.parse(iso);
  requireCondition(Number.isFinite(epoch), 'INVALID_KST_MINUTE', { field, value });
  return epoch;
}

function waveNumber(waveId) {
  const match = /^WAVE_([1-9][0-9]*)$/.exec(waveId || '');
  requireCondition(Boolean(match), 'INVALID_WAVE_ID', { wave_id: waveId });
  return Number(match[1]);
}

function validateDirective(directive) {
  requireCondition(directive && typeof directive === 'object', 'DIRECTIVE_REQUIRED');
  for (const field of [
    'directive_id', 'wave_id', 'registered_at_kst', 'duplicate_prompt_key',
    'selected_service_name', 'ai_yolla_component_name'
  ]) {
    requireCondition(typeof directive[field] === 'string' && directive[field].length > 0, 'DIRECTIVE_FIELD_REQUIRED', { field });
  }
  parseKstMinute(directive.registered_at_kst, 'registered_at_kst');
  requireCondition(SHA64.test(directive.duplicate_prompt_key), 'INVALID_DUPLICATE_PROMPT_KEY');
  requireCondition(SERVICE_NAMES.includes(directive.selected_service_name), 'UNSUPPORTED_SERVICE_NAME');
  requireCondition(COMPONENT_NAMES.includes(directive.ai_yolla_component_name), 'UNSUPPORTED_COMPONENT_NAME');
  waveNumber(directive.wave_id);
  if (directive.supersedes_directive_id !== null && directive.supersedes_directive_id !== undefined) {
    requireCondition(typeof directive.supersedes_directive_id === 'string' && directive.supersedes_directive_id.length > 0, 'INVALID_SUPERSESSION');
  }
  return directive;
}

function validateLedger(ledger) {
  requireCondition(ledger && typeof ledger === 'object', 'LEDGER_REQUIRED');
  requireCondition(Number.isInteger(ledger.current_wave_number) && ledger.current_wave_number > 0, 'INVALID_CURRENT_WAVE');
  requireCondition(Array.isArray(ledger.processed_prompt_keys), 'PROCESSED_KEYS_REQUIRED');
  requireCondition(ledger.processed_prompt_keys.every((key) => SHA64.test(key)), 'INVALID_PROCESSED_KEY');
  requireCondition(Array.isArray(ledger.authoritative_directives), 'AUTHORITATIVE_DIRECTIVES_REQUIRED');
  for (const entry of ledger.authoritative_directives) validateDirective(entry);
  return ledger;
}

function hasSupportedPassEvidence(result) {
  return result
    && result.decision === 'PASS'
    && typeof result.terminal === 'string' && result.terminal.length > 0
    && SHA40.test(result.remote_head || '')
    && Number.isInteger(result.result_comment_id) && result.result_comment_id > 0
    && typeof result.published_at_kst === 'string'
    && Number.isFinite(parseKstMinute(result.published_at_kst, 'published_at_kst'));
}

function normalizeResult(result) {
  if (result === null || result === undefined) {
    return {
      decision: 'NOT_RUN',
      display_decision: 'NOT_RUN',
      published_at_kst: null,
      unsupported_pass_suppressed: false,
      supported_completion: false
    };
  }
  requireCondition(DECISIONS.has(result.decision), 'INVALID_RESULT_DECISION');
  if (result.published_at_kst !== null && result.published_at_kst !== undefined) {
    parseKstMinute(result.published_at_kst, 'published_at_kst');
  }
  const supportedPass = result.decision !== 'PASS' || hasSupportedPassEvidence(result);
  return {
    decision: result.decision,
    display_decision: result.decision === 'PASS' && !supportedPass ? 'UNVERIFIED' : result.decision,
    published_at_kst: result.published_at_kst ?? null,
    unsupported_pass_suppressed: result.decision === 'PASS' && !supportedPass,
    supported_completion: result.decision === 'PASS' && supportedPass,
    terminal: result.terminal ?? null,
    remote_head: SHA40.test(result.remote_head || '') ? result.remote_head : null,
    result_comment_id: Number.isInteger(result.result_comment_id) ? result.result_comment_id : null
  };
}

function hasExplicitSupersession(candidate, authoritativeEntries) {
  if (!candidate.supersedes_directive_id) return false;
  return authoritativeEntries.some((entry) => entry.directive_id === candidate.supersedes_directive_id);
}

function classifyWaveDirective(directive, ledger, result = null) {
  validateDirective(directive);
  validateLedger(ledger);
  const normalizedResult = normalizeResult(result);
  const candidateWave = waveNumber(directive.wave_id);

  if (normalizedResult.supported_completion) {
    return { state_code: 'COMPLETED', state_label: STATE_LABELS.COMPLETED, badge: BADGES.COMPLETED, normalizedResult };
  }
  if (ledger.processed_prompt_keys.includes(directive.duplicate_prompt_key)) {
    return { state_code: 'DUPLICATE_BLOCKED', state_label: STATE_LABELS.DUPLICATE_BLOCKED, badge: BADGES.DUPLICATE_BLOCKED, normalizedResult };
  }
  if (candidateWave < ledger.current_wave_number) {
    return { state_code: 'STALE_WAVE_BLOCKED', state_label: STATE_LABELS.STALE_WAVE_BLOCKED, badge: BADGES.STALE_WAVE_BLOCKED, normalizedResult };
  }
  if (candidateWave === ledger.current_wave_number) {
    const sameWaveEntries = ledger.authoritative_directives.filter((entry) => waveNumber(entry.wave_id) === candidateWave);
    const newerWithoutSupersession = sameWaveEntries.some((entry) => (
      directive.directive_id !== entry.directive_id
      && parseKstMinute(directive.registered_at_kst, 'registered_at_kst') > parseKstMinute(entry.registered_at_kst, 'registered_at_kst')
    )) && !hasExplicitSupersession(directive, sameWaveEntries);
    if (newerWithoutSupersession) {
      return { state_code: 'AUTHORITY_CONFLICT', state_label: STATE_LABELS.AUTHORITY_CONFLICT, badge: BADGES.AUTHORITY_CONFLICT, normalizedResult };
    }
  }
  return { state_code: 'EXECUTABLE', state_label: STATE_LABELS.EXECUTABLE, badge: BADGES.EXECUTABLE, normalizedResult };
}

function buildWaveTimeCard({ directive, ledger, result = null }) {
  const classification = classifyWaveDirective(directive, ledger, result);
  return {
    schema_version: 'AI_YOLLA_WAVE_TIME_CARD_V1',
    wave_id: directive.wave_id,
    wave_number: waveNumber(directive.wave_id),
    directive_registered_at_kst: directive.registered_at_kst,
    result_published_at_kst: classification.normalizedResult.published_at_kst,
    directive_id: directive.directive_id,
    duplicate_prompt_key_prefix: directive.duplicate_prompt_key.slice(0, 12),
    state_code: classification.state_code,
    state_label: classification.state_label,
    selected_service_name: directive.selected_service_name,
    ai_yolla_component_name: directive.ai_yolla_component_name,
    service_catalog: [...SERVICE_NAMES],
    decision_display: classification.normalizedResult.display_decision,
    unsupported_pass_suppressed: classification.normalizedResult.unsupported_pass_suppressed,
    badge: classification.badge,
    source_digest: sha256({ directive, result })
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
  return `<div class="card-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value ?? '미게시')}</dd></div>`;
}

function renderServiceSelector(selectedServiceName) {
  return `<label>선택 서비스명<select data-ai-yolla-service>${SERVICE_NAMES.map((service) => (
    `<option value="${escapeHtml(service)}"${service === selectedServiceName ? ' selected' : ''}>${escapeHtml(service)}</option>`
  )).join('')}</select></label>`;
}

function renderWaveTimeCardHtml(card) {
  return [
    `<article class="state-card ai-yolla-wave-card" data-wave-id="${escapeHtml(card.wave_id)}" data-state="${escapeHtml(card.state_code)}">`,
    `<header><span class="badge badge-${escapeHtml(card.badge.toLowerCase())}">${escapeHtml(card.wave_id)}</span><strong>${escapeHtml(card.state_label)}</strong></header>`,
    '<dl>',
    row('Wave 번호', card.wave_number),
    row('지시 등록시간 KST', card.directive_registered_at_kst),
    row('결과 게시시간 KST', card.result_published_at_kst),
    row('Directive ID', card.directive_id),
    row('Duplicate Prompt Key', card.duplicate_prompt_key_prefix),
    row('현재 상태', card.state_label),
    row('AI욜라 구성요소명', card.ai_yolla_component_name),
    row('결과 판정', card.decision_display),
    '</dl>',
    renderServiceSelector(card.selected_service_name),
    '<p class="runtime-label">AI욜라 Runtime 상태</p>',
    '</article>'
  ].join('');
}

function buildAndRenderWaveTimeCard(input) {
  const card = buildWaveTimeCard(input);
  return {
    card,
    html: renderWaveTimeCardHtml(card),
    unsupported_pass_display_count: Number(card.unsupported_pass_suppressed)
  };
}

module.exports = {
  SERVICE_NAMES,
  COMPONENT_NAMES,
  STATE_LABELS,
  AiYollaWaveCardError,
  parseKstMinute,
  waveNumber,
  validateDirective,
  validateLedger,
  normalizeResult,
  classifyWaveDirective,
  buildWaveTimeCard,
  renderWaveTimeCardHtml,
  buildAndRenderWaveTimeCard,
  sha256
};
