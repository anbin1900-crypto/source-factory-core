'use strict';

const STATES = Object.freeze([
  'WAITING',
  'WORKING',
  'RESULT_PENDING',
  'COMPLETED',
  'REVIEW_REQUIRED'
]);
const STATE_SET = new Set(STATES);
const STATE_LABELS = Object.freeze({
  WAITING: '대기',
  WORKING: '작업 중',
  RESULT_PENDING: '결과 대기',
  COMPLETED: '완료',
  REVIEW_REQUIRED: '검토 필요'
});

function text(value) {
  return String(value == null ? '' : value).trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function parseTime(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function escapeHtml(value) {
  return text(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isCurrentResult(result, currentWaveId) {
  return Boolean(result && text(result.wave_id) === text(currentWaveId));
}

function isTerminalResult(result) {
  if (!result) return false;
  const status = upper(result.status || result.lifecycle || result.terminal_status);
  return Boolean(
    result.terminal === true ||
    result.status_end === true ||
    status === 'END' ||
    status === 'COMPLETED' ||
    status === 'PASS' ||
    status === 'FAIL' ||
    status === 'BLOCKED' ||
    status === 'NO_WORK'
  );
}

function resultReference(result) {
  if (!result) return { label: '—', url: '', type: 'NONE' };
  const commentId = Number(result.result_comment_id || result.terminal_comment_id || 0) || null;
  const resultKey = text(result.result_key);
  if (commentId) {
    return {
      label: `RESULT_COMMENT #${commentId}`,
      url: text(result.result_url || result.github_url),
      type: 'RESULT_COMMENT'
    };
  }
  if (resultKey) {
    return {
      label: `RESULT_KEY ${resultKey}`,
      url: text(result.result_url || result.github_url),
      type: 'RESULT_KEY'
    };
  }
  return { label: '—', url: '', type: 'NONE' };
}

function deriveState(role, currentResult) {
  const lifecycle = upper(role.lifecycle_state || role.runtime_state || role.status);
  const explicitReview = Boolean(
    role.review_required === true ||
    role.technical_review_required === true ||
    role.correlation_invalid === true ||
    role.duplicate_result === true ||
    role.technical_gate_failed === true ||
    role.error === true
  );
  if (explicitReview) return 'REVIEW_REQUIRED';
  if (isTerminalResult(currentResult)) return 'COMPLETED';
  if (
    role.generation_active === true ||
    role.working === true ||
    ['GENERATING', 'WORKING', 'RUNNING', 'ACTIVE'].includes(lifecycle)
  ) return 'WORKING';
  if (
    role.result_pending === true ||
    role.awaiting_result === true ||
    ['RESULT_PENDING', 'RESULT_WAITING', 'COMPLETION_WAIT', 'AWAITING_RESULT'].includes(lifecycle)
  ) return 'RESULT_PENDING';
  return 'WAITING';
}

function formatElapsed(startAt, endAt, nowAt) {
  const start = parseTime(startAt);
  if (start == null) return '—';
  const end = parseTime(endAt) ?? parseTime(nowAt) ?? Date.now();
  const elapsed = Math.max(0, end - start);
  const totalMinutes = Math.floor(elapsed / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function latestCheckAt(role, currentResult) {
  const candidates = [
    role.last_check_at,
    role.heartbeat_at,
    currentResult && (currentResult.published_at || currentResult.updated_at),
    role.directive_updated_at,
    role.directive_created_at
  ].filter(Boolean);
  if (!candidates.length) return '—';
  return candidates
    .map(value => ({ value: text(value), ms: parseTime(value) }))
    .sort((a, b) => (b.ms ?? -Infinity) - (a.ms ?? -Infinity))[0].value;
}

function buildRoleLivenessViewModel(role, context = {}) {
  const currentWaveId = text(context.current_wave_id);
  const results = Array.isArray(role.results) ? role.results : [];
  const currentResult = results.find(result => isCurrentResult(result, currentWaveId)) || null;
  const historicalResults = results
    .filter(result => !isCurrentResult(result, currentWaveId))
    .map(result => ({
      wave_id: text(result.wave_id),
      status: isTerminalResult(result) ? 'COMPLETED' : 'REVIEW_REQUIRED',
      reference: resultReference(result),
      published_at: text(result.published_at || result.updated_at)
    }));
  const state = deriveState(role, currentResult);
  if (!STATE_SET.has(state)) throw new Error(`INVALID_LIVENESS_STATE:${state}`);
  const terminalAt = currentResult && (currentResult.published_at || currentResult.updated_at);
  const startedAt = role.started_at || role.generation_started_at || role.dispatched_at;
  return {
    role_id: upper(role.role_id || role.role || role.id),
    state,
    state_label: STATE_LABELS[state],
    generating: state === 'WORKING' && Boolean(role.generation_active),
    elapsed: formatElapsed(startedAt, state === 'COMPLETED' ? terminalAt : null, context.now_at),
    last_check: latestCheckAt(role, currentResult),
    chat: {
      label: '채팅 열기',
      url: text(role.chat_url || role.project_chat_url),
      available: Boolean(text(role.chat_url || role.project_chat_url))
    },
    github_result: resultReference(currentResult),
    current_wave_id: currentWaveId,
    historical_results: historicalResults,
    source_flags: {
      missing_result_only: currentResult == null && !role.result_pending && !role.awaiting_result,
      explicit_review_required: state === 'REVIEW_REQUIRED'
    }
  };
}

function buildPanelLivenessViewModel(input = {}) {
  const roles = Array.isArray(input.roles) ? input.roles : [];
  const context = { current_wave_id: input.current_wave_id, now_at: input.now_at };
  const current = roles.map(role => buildRoleLivenessViewModel(role, context));
  const historical = current.flatMap(role => role.historical_results.map(item => ({
    role_id: role.role_id,
    ...item
  })));
  return {
    schema_version: 'PANEL_LIVENESS_ROW_VIEW_MODEL_V1',
    current_wave_id: text(input.current_wave_id),
    columns: ['ROLE', '상태', '경과시간', '마지막확인', '채팅열기', 'GitHub결과'],
    allowed_states: [...STATES],
    current,
    historical
  };
}

function linkHtml(link, cssClass) {
  if (!link || !link.url) return '<span class="liveness-empty">—</span>';
  return `<a class="${cssClass}" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)}</a>`;
}

function renderCurrentRowHtml(row) {
  const generating = row.generating ? '<span class="liveness-generating" aria-label="생성 중">생성 중</span>' : '';
  return `<tr class="worker-liveness-row state-${row.state.toLowerCase()}" data-role-id="${escapeHtml(row.role_id)}" data-liveness-state="${row.state}" data-wave-scope="current">` +
    `<th scope="row">${escapeHtml(row.role_id)}</th>` +
    `<td><span class="liveness-state">${escapeHtml(row.state_label)}</span>${generating}</td>` +
    `<td class="liveness-elapsed">${escapeHtml(row.elapsed)}</td>` +
    `<td class="liveness-last-check">${escapeHtml(row.last_check)}</td>` +
    `<td>${linkHtml(row.chat, 'liveness-chat-link')}</td>` +
    `<td>${linkHtml(row.github_result, 'liveness-result-link')}</td>` +
    `</tr>`;
}

function renderHistoricalRowHtml(row) {
  return `<tr class="worker-liveness-row historical state-${row.status.toLowerCase()}" data-role-id="${escapeHtml(row.role_id)}" data-liveness-state="${row.status}" data-wave-scope="historical" data-wave-id="${escapeHtml(row.wave_id)}">` +
    `<th scope="row">${escapeHtml(row.role_id)}</th>` +
    `<td><span class="liveness-state">${escapeHtml(STATE_LABELS[status])}</span></td>` +
    `<td class="liveness-elapsed">—</td>` +
    `<td class="liveness-last-check">${escapeHtml(row.published_at || '—')}</td>` +
    `<td><span class="liveness-empty">—</span></td>` +
    `<td>${linkHtml(row.reference, 'liveness-result-link')}</td>` +
    `</tr>`;
}

function renderPanelLivenessTable(viewModel) {
  const headers = viewModel.columns.map(column => `<th scope="col">${escapeHtml(column)}</th>`).join('');
  const currentRows = viewModel.current.map(renderCurrentRowHtml).join('');
  const historicalRows = viewModel.historical.map(renderHistoricalRowHtml).join('');
  const historySection = historicalRows
    ? `<tbody class="worker-liveness-history" data-wave-scope="historical"><tr class="liveness-section-row"><th colspan="6">과거 Wave 결과</th></tr>${historicalRows}</tbody>`
    : '';
  return `<table class="worker-liveness-table" data-current-wave-id="${escapeHtml(viewModel.current_wave_id)}">` +
    `<thead><tr>${headers}</tr></thead>` +
    `<tbody class="worker-liveness-current" data-wave-scope="current">${currentRows}</tbody>` +
    historySection +
    `</table>`;
}

function mountPanelLiveness(container, input) {
  if (!container || typeof container !== 'object' || !('innerHTML' in container)) {
    throw new Error('LIVENESS_CONTAINER_REQUIRED');
  }
  const viewModel = buildPanelLivenessViewModel(input);
  container.innerHTML = renderPanelLivenessTable(viewModel);
  return viewModel;
}

module.exports = {
  STATES,
  STATE_LABELS,
  buildRoleLivenessViewModel,
  buildPanelLivenessViewModel,
  renderCurrentRowHtml,
  renderHistoricalRowHtml,
  renderPanelLivenessTable,
  mountPanelLiveness,
  formatElapsed,
  resultReference
};
