'use strict';

const DEFAULT_TOTAL_PROMPTS = 70;
const ACTION_ID = Object.freeze({
  START: 'stage4_prompt_automation_start',
  PAUSE: 'stage4_prompt_automation_pause',
  RESUME: 'stage4_prompt_automation_resume',
  STOP: 'stage4_prompt_automation_stop',
  NEXT: 'stage4_prompt_automation_next'
});

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function asArray(value) {
  if (Array.isArray(value)) return clone(value);
  if (value === undefined || value === null) return [];
  return [clone(value)];
}

function text(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function pickArray(context, keys) {
  const source = isObject(context) ? context : {};
  for (const key of keys) if (Array.isArray(source[key])) return asArray(source[key]);
  return [];
}

function pickObject(context, keys) {
  const source = isObject(context) ? context : {};
  for (const key of keys) if (isObject(source[key])) return clone(source[key]);
  return {};
}

function normalizePromptItem(item, index, defaultStatus) {
  const source = isObject(item) ? item : { text: String(item) };
  return {
    prompt_id: source.prompt_id || source.id || source.run_id || `prompt_${String(index + 1).padStart(3, '0')}`,
    prompt_index: Number.isInteger(Number(source.prompt_index)) ? Number(source.prompt_index) : index,
    title: source.title || source.name || source.task_goal || null,
    worker_id: source.worker_id || source.slot_id || null,
    worker_function_class: source.worker_function_class || null,
    delivery_id: source.delivery_id || null,
    status: text(source.status || source.run_status || source.prompt_status, defaultStatus || 'unknown').toLowerCase(),
    hold_reason: source.hold_reason || source.pause_reason || source.block_reason || null,
    completed_at: source.completed_at || null,
    last_output_id: source.last_output_id || source.output_id || null
  };
}

function collectPromptItems(context) {
  const library = pickArray(context, ['prompt_library', 'prompts', 'library_prompts']);
  const queue = pickArray(context, ['prompt_queue', 'queue']);
  const runs = pickArray(context, ['prompt_runs', 'runs']);
  const byId = new Map();
  library.forEach((item, index) => byId.set(normalizePromptItem(item, index, 'ready').prompt_id, normalizePromptItem(item, index, 'ready')));
  queue.forEach((item, index) => {
    const normalized = normalizePromptItem(item, index, 'queued');
    byId.set(normalized.prompt_id, { ...(byId.get(normalized.prompt_id) || {}), ...normalized });
  });
  runs.forEach((item, index) => {
    const normalized = normalizePromptItem(item, index, 'running');
    byId.set(normalized.prompt_id, { ...(byId.get(normalized.prompt_id) || {}), ...normalized });
  });
  return Array.from(byId.values()).sort((a, b) => a.prompt_index - b.prompt_index || a.prompt_id.localeCompare(b.prompt_id));
}

function countBy(items, selector) {
  return asArray(items).reduce((acc, item) => {
    const key = text(selector(item), 'unknown');
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function buildPromptRunProgress(context) {
  const source = isObject(context) ? context : {};
  const items = collectPromptItems(source);
  const total = Math.max(Number(source.total_prompts || source.total_prompt_count || DEFAULT_TOTAL_PROMPTS), items.length);
  const byStatus = countBy(items, (item) => item.status);
  const activeStatuses = ['dispatching', 'sent', 'running', 'waiting_output'];
  const completed = byStatus.completed || 0;
  const queued = (byStatus.queued || 0) + (byStatus.ready || 0);
  const active = activeStatuses.reduce((sum, status) => sum + (byStatus[status] || 0), 0);
  const next = items.find((item) => ['queued', 'ready'].includes(item.status)) || null;
  const activePrompt = items.find((item) => activeStatuses.includes(item.status)) || null;
  const hold = source.hold_reason || (items.find((item) => item.hold_reason) || {}).hold_reason || null;
  return {
    total_prompts: total,
    known_prompt_count: items.length,
    missing_prompt_count: Math.max(total - items.length, 0),
    completed_count: completed,
    queued_count: queued,
    active_count: active,
    held_count: byStatus.held || 0,
    error_count: byStatus.error || 0,
    completed_percent: total ? Math.round((completed / total) * 1000) / 10 : 0,
    by_status: byStatus,
    current_send_target: activePrompt ? { prompt_id: activePrompt.prompt_id, worker_id: activePrompt.worker_id, delivery_id: activePrompt.delivery_id } : null,
    next_prompt_id: next ? next.prompt_id : null,
    active_prompt_id: activePrompt ? activePrompt.prompt_id : null,
    hold_reason: hold,
    pause_state: {
      paused: Boolean(source.paused || source.is_paused),
      pause_reason: source.pause_reason || null
    },
    prompt_items: items
  };
}

function createCard(card_id, title, status, primary_value, summary, metrics) {
  return {
    card_id,
    title,
    status,
    primary_value,
    summary,
    metrics: isObject(metrics) ? clone(metrics) : {},
    element_spec: {
      tag: 'section',
      attributes: { 'data-sf-stage4-card': card_id, 'data-sf-stage4-card-status': status },
      text: `${title}: ${summary}`
    }
  };
}

function buildPromptAutomationCards(context) {
  const progress = buildPromptRunProgress(context);
  const packages = pickArray(context, ['prompt_packages', 'packages']);
  const autosave = pickObject(context, ['autosave', 'autosave_state']);
  const validation = pickObject(context, ['validation_summary', 'validation']);
  return [
    createCard('prompt_library', 'Prompt Library', progress.missing_prompt_count ? 'YELLOW' : 'GREEN', `${progress.known_prompt_count}/${progress.total_prompts}`, '70개 기준 prompt library 상태', progress),
    createCard('prompt_package', 'Prompt Package', packages.length ? 'GREEN' : 'YELLOW', String(packages.length), packages.length ? 'package 준비' : 'package 대기', { package_count: packages.length }),
    createCard('prompt_queue', 'Prompt Queue', progress.queued_count ? 'GREEN' : 'YELLOW', String(progress.queued_count), progress.next_prompt_id ? `next: ${progress.next_prompt_id}` : 'next 없음', { queued_count: progress.queued_count }),
    createCard('prompt_run', 'Run State', progress.hold_reason || progress.error_count ? 'YELLOW' : 'GREEN', `${progress.completed_percent}%`, progress.hold_reason || `${progress.completed_count}/${progress.total_prompts} 완료`, { completed_count: progress.completed_count, error_count: progress.error_count }),
    createCard('autosave', 'Autosave', autosave.enabled === false ? 'YELLOW' : 'GREEN', autosave.enabled === false ? 'off' : 'on', autosave.last_saved_at || 'autosave 대기', autosave),
    createCard('validation', 'Validation', validation.status || 'UNKNOWN', String(validation.green_count || 0), validation.status || 'Gate 대기', validation)
  ];
}

function action(action_id, label, enabled, disabled_reason, commandAction, payload) {
  return {
    action_id,
    label,
    enabled: Boolean(enabled),
    disabled_reason: disabled_reason || null,
    direct_execution_allowed: false,
    panel_owned: true,
    panel_command_action: commandAction,
    payload: isObject(payload) ? clone(payload) : {},
    result_route: 'PANEL_RECORD',
    error_route: 'COMMANDER_QUEUE'
  };
}

function buildPromptAutomationActions(context) {
  const progress = buildPromptRunProgress(context);
  const running = progress.active_count > 0;
  const paused = progress.pause_state.paused;
  const completed = progress.completed_count >= progress.total_prompts;
  const hold = Boolean(progress.hold_reason);
  return {
    direct_execution_allowed: false,
    actual_prompt_send_implemented_here: false,
    expected_panel_api_calls: ['window.sfApi.stage4SaveProjectSnapshot'],
    actions: [
      action(ACTION_ID.START, 'Start', !running && !completed && !hold, hold ? 'hold_reason_exists' : running ? 'already_running' : completed ? 'completed' : null, 'DISPATCH_PROMPT_TO_WINDOW'),
      action(ACTION_ID.PAUSE, 'Pause', running, running ? null : 'not_running', 'SAVE_PANEL_RECORD'),
      action(ACTION_ID.RESUME, 'Resume', paused && !hold, !paused ? 'not_paused' : hold ? 'hold_reason_exists' : null, 'DISPATCH_PROMPT_TO_WINDOW'),
      action(ACTION_ID.STOP, 'Stop', running || paused, running || paused ? null : 'not_running_or_paused', 'SAVE_PANEL_RECORD'),
      action(ACTION_ID.NEXT, 'Next', Boolean(progress.next_prompt_id) && !hold && !completed, !progress.next_prompt_id ? 'no_next_prompt' : hold ? 'hold_reason_exists' : completed ? 'completed' : null, 'DISPATCH_PROMPT_TO_WINDOW', { next_prompt_id: progress.next_prompt_id })
    ]
  };
}

function buildPromptAutomationWarnings(context) {
  const progress = buildPromptRunProgress(context);
  const warnings = [];
  if (progress.missing_prompt_count) warnings.push({ warning_code: 'prompt_library_incomplete', level: 'YELLOW', message: `${progress.missing_prompt_count}개 prompt 누락`, next_action: '나머지 prompt 등록' });
  if (!progress.current_send_target && progress.completed_count < progress.total_prompts) warnings.push({ warning_code: 'current_send_target_missing', level: 'YELLOW', message: '현재 전송 대상 없음', next_action: '다음 prompt와 worker slot 선택' });
  if (progress.hold_reason) warnings.push({ warning_code: 'prompt_run_held', level: 'YELLOW', message: progress.hold_reason, next_action: 'hold reason 해소' });
  if (progress.error_count) warnings.push({ warning_code: 'prompt_run_errors', level: 'RED', message: `${progress.error_count}개 error`, next_action: 'COMMANDER_QUEUE로 오류 전달' });
  warnings.push({ warning_code: 'binding_not_applied_here', level: 'YELLOW', message: '이 파일은 view model만 제공한다.', next_action: 'RENDERER_BINDING_WORKER 배정' });
  return warnings;
}

function buildPromptAutomationDashboard(context) {
  const source = isObject(context) ? context : {};
  const progress = buildPromptRunProgress(source);
  const warnings = buildPromptAutomationWarnings(source);
  return {
    schema_version: text(source.schema_version, 'stage4.prompt_automation_dashboard.v1'),
    project_id: source.project_id || null,
    panel_id: source.panel_id || null,
    title: 'Prompt Automation Dashboard',
    summary: {
      total_prompts: progress.total_prompts,
      completed_count: progress.completed_count,
      completed_percent: progress.completed_percent,
      current_send_target: progress.current_send_target,
      hold_reason: progress.hold_reason,
      warning_count: warnings.length
    },
    cards: buildPromptAutomationCards(source),
    progress,
    actions: buildPromptAutomationActions(source),
    warnings,
    view_contract: {
      dom_direct_manipulation_allowed: false,
      actual_prompt_dispatch_allowed_here: false,
      worker_window_menu_minimized: true,
      panel_is_control_plane: true,
      expected_panel_api_calls: ['window.sfApi.stage4SaveProjectSnapshot'],
      required_later_integration: ['RENDERER_BINDING_WORKER', 'PRELOAD_API_WORKER', 'IPC_HANDLER_WORKER']
    }
  };
}

module.exports = {
  buildPromptAutomationDashboard,
  buildPromptAutomationCards,
  buildPromptRunProgress,
  buildPromptAutomationActions,
  buildPromptAutomationWarnings
};