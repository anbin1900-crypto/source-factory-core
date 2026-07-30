'use strict';

/**
 * Stage 4 prompt queue view model.
 * Pure renderer-facing view model only: no DOM access, no IPC calls, no preload/main patching.
 */

const SCHEMA_VERSION = 'stage4.prompt_queue_view_model.v1';
const VIEW_MODEL_OBJECT_TYPE = 'STAGE4_PROMPT_QUEUE_VIEW_MODEL';
const ACTION_MODEL_OBJECT_TYPE = 'STAGE4_PROMPT_QUEUE_ACTION_MODEL';
const TABLE_ROW_OBJECT_TYPE = 'STAGE4_PROMPT_QUEUE_TABLE_ROW';
const PROGRESS_OBJECT_TYPE = 'STAGE4_PROMPT_QUEUE_PROGRESS';
const WARNING_OBJECT_TYPE = 'STAGE4_PROMPT_QUEUE_WARNING';

const PANEL_SELECTOR = '#sf-stage4-run-prompt-queue';
const EXPECTED_PANEL_API = 'window.sfApi.stage4RunPromptQueue';
const EXPECTED_IPC_CHANNEL = 'sf:stage4-run-prompt-queue';

const QUEUE_STATUS = Object.freeze({
  DRAFT: 'draft',
  READY: 'ready',
  RUNNING: 'running',
  PAUSED: 'paused',
  STOPPED: 'stopped',
  COMPLETED: 'completed',
  FAILED: 'failed',
  ARCHIVED: 'archived'
});

const RUN_STATUS = Object.freeze({
  DRAFT: 'draft',
  READY: 'ready',
  RUNNING: 'running',
  PAUSED: 'paused',
  PAUSE_REQUESTED: 'pause_requested',
  STOP_REQUESTED: 'stop_requested',
  STOPPED: 'stopped',
  COMPLETED: 'completed',
  FAILED: 'failed',
  ARCHIVED: 'archived'
});

const SEND_STATUS = Object.freeze({
  PENDING: 'pending',
  READY: 'ready',
  SENT: 'sent',
  COMPLETED: 'completed',
  FAILED: 'failed',
  HELD: 'held',
  SKIPPED: 'skipped',
  BLOCKED: 'blocked'
});

const PROMPT_QUEUE_ACTION = Object.freeze({
  START: 'start',
  PAUSE: 'pause',
  RESUME: 'resume',
  STOP: 'stop',
  SEND_NEXT: 'send_next',
  RETRY_FAILED: 'retry_failed',
  OPEN_MANUAL_REVIEW: 'open_manual_review'
});

const TERMINAL_QUEUE_STATUSES = Object.freeze([
  QUEUE_STATUS.STOPPED,
  QUEUE_STATUS.COMPLETED,
  QUEUE_STATUS.FAILED,
  QUEUE_STATUS.ARCHIVED
]);

const TERMINAL_RUN_STATUSES = Object.freeze([
  RUN_STATUS.STOPPED,
  RUN_STATUS.COMPLETED,
  RUN_STATUS.FAILED,
  RUN_STATUS.ARCHIVED
]);

const TERMINAL_SEND_STATUSES = Object.freeze([
  SEND_STATUS.COMPLETED,
  SEND_STATUS.FAILED,
  SEND_STATUS.SKIPPED,
  SEND_STATUS.BLOCKED
]);

const DEFAULTS = Object.freeze({
  project_id: 'default_project',
  package_id: 'manual_prompt_package',
  queue_id: 'manual_prompt_queue',
  run_id: 'manual_prompt_run',
  target_slot_id: 'AUTO_TARGET_SLOT',
  visible_row_limit: 70
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asObject(value) {
  return isPlainObject(value) ? value : {};
}

function trimText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function textOr(value, fallback) {
  const text = trimText(value);
  return text || fallback;
}

function integerOr(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function booleanOr(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function cloneJson(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  try {
    const cloned = JSON.parse(JSON.stringify(value));
    return cloned === undefined ? fallback : cloned;
  } catch (error) {
    return fallback;
  }
}

function normalizeToken(value) {
  return String(value || '').trim().toLowerCase();
}

function enumValue(value, enumObject, fallback) {
  const source = normalizeToken(value);
  return Object.values(enumObject).includes(source) ? source : fallback;
}

function stableHash(value) {
  const source = String(value || '');
  let hash = 0;

  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36).padStart(6, '0');
}

function stableId(prefix, parts) {
  const source = Array.isArray(parts) ? parts.filter(Boolean).join('|') : String(parts || '');
  return `${prefix}_${stableHash(source || prefix)}`;
}

function clipText(value, maxLength) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  const limit = Math.max(0, integerOr(maxLength, 120));
  if (!limit || text.length <= limit) {
    return text;
  }
  return `${text.slice(0, Math.max(0, limit - 1))}…`;
}

function normalizeQueueItem(item, index) {
  const source = asObject(item);
  const sequence = integerOr(source.sequence_number || source.sequenceNumber || source.order_index || source.orderIndex, index + 1);
  const queueItemId = textOr(
    source.queue_item_id || source.queueItemId || source.item_id || source.itemId,
    stableId('queue_item', [source.prompt_id || source.promptId, String(sequence)])
  );

  return {
    ...cloneJson(source, {}),
    queue_item_id: queueItemId,
    item_id: textOr(source.item_id || source.itemId, queueItemId),
    package_prompt_id: trimText(source.package_prompt_id || source.packagePromptId),
    prompt_id: textOr(source.prompt_id || source.promptId || source.id, stableId('prompt', [queueItemId, String(sequence)])),
    title: textOr(source.title, `Prompt ${sequence}`),
    body: typeof source.body === 'string' ? source.body : '',
    sequence_number: sequence,
    order_index: integerOr(source.order_index || source.orderIndex, sequence),
    target_slot_id: textOr(source.target_slot_id || source.targetSlotId || source.target_slot || source.targetSlot || source.slot_id || source.slotId, DEFAULTS.target_slot_id),
    target_worker_id: trimText(source.target_worker_id || source.targetWorkerId || source.worker_id || source.workerId),
    send_status: enumValue(source.send_status || source.sendStatus || source.status, SEND_STATUS, SEND_STATUS.PENDING),
    attempts: Math.max(0, integerOr(source.attempts, 0)),
    max_attempts: Math.max(1, integerOr(source.max_attempts || source.maxAttempts, 1)),
    dependencies: Array.isArray(source.dependencies) ? cloneJson(source.dependencies, []) : [],
    result: cloneJson(source.result, null),
    failure_reason: cloneJson(source.failure_reason || source.failureReason, null),
    hold_reason: cloneJson(source.hold_reason || source.holdReason, null),
    retry_exhausted: booleanOr(source.retry_exhausted || source.retryExhausted, false),
    manual_review_required: booleanOr(source.manual_review_required || source.manualReviewRequired, false),
    metadata: cloneJson(source.metadata, {})
  };
}

function sortQueueItems(items) {
  return items.slice().sort((left, right) => {
    if (left.sequence_number !== right.sequence_number) {
      return left.sequence_number - right.sequence_number;
    }
    if (left.order_index !== right.order_index) {
      return left.order_index - right.order_index;
    }
    return left.queue_item_id.localeCompare(right.queue_item_id);
  });
}

function normalizeQueue(queue) {
  const source = asObject(queue);
  const items = sortQueueItems((Array.isArray(source.items) ? source.items : []).map(normalizeQueueItem));
  const queueId = textOr(source.queue_id || source.queueId || source.id, DEFAULTS.queue_id);

  return {
    ...cloneJson(source, {}),
    queue_id: queueId,
    project_id: textOr(source.project_id || source.projectId, DEFAULTS.project_id),
    package_id: textOr(source.package_id || source.packageId, DEFAULTS.package_id),
    title: textOr(source.title, 'Prompt Queue'),
    status: enumValue(source.status, QUEUE_STATUS, items.length ? QUEUE_STATUS.READY : QUEUE_STATUS.DRAFT),
    current_index: Math.max(0, integerOr(source.current_index || source.currentIndex, 0)),
    current_queue_item_id: trimText(source.current_queue_item_id || source.currentQueueItemId),
    pause_requested: booleanOr(source.pause_requested || source.pauseRequested, false),
    stop_requested: booleanOr(source.stop_requested || source.stopRequested, false),
    panel_command_waiting: booleanOr(source.panel_command_waiting || source.panelCommandWaiting, false),
    items,
    summary: cloneJson(source.summary, {})
  };
}

function normalizeRun(run) {
  const source = asObject(run);

  return {
    ...cloneJson(source, {}),
    run_id: textOr(source.run_id || source.runId || source.id, DEFAULTS.run_id),
    project_id: textOr(source.project_id || source.projectId, DEFAULTS.project_id),
    package_id: textOr(source.package_id || source.packageId, DEFAULTS.package_id),
    queue_id: textOr(source.queue_id || source.queueId, DEFAULTS.queue_id),
    title: textOr(source.title, 'Prompt Queue Run'),
    status: enumValue(source.status, RUN_STATUS, RUN_STATUS.READY),
    user_pause_requested: booleanOr(source.user_pause_requested || source.userPauseRequested, false),
    user_stop_requested: booleanOr(source.user_stop_requested || source.userStopRequested, false),
    panel_command_waiting: booleanOr(source.panel_command_waiting || source.panelCommandWaiting, false),
    current_queue_item_id: trimText(source.current_queue_item_id || source.currentQueueItemId),
    pause_reason: cloneJson(source.pause_reason || source.pauseReason, null),
    stop_reason: cloneJson(source.stop_reason || source.stopReason, null),
    summary: cloneJson(source.summary, {})
  };
}

function countQueueItems(queue) {
  const counts = {
    total: 0,
    pending: 0,
    ready: 0,
    sent: 0,
    completed: 0,
    failed: 0,
    held: 0,
    skipped: 0,
    blocked: 0,
    terminal: 0,
    remaining: 0
  };

  queue.items.forEach((item) => {
    counts.total += 1;
    counts[item.send_status] = (counts[item.send_status] || 0) + 1;
    if (TERMINAL_SEND_STATUSES.includes(item.send_status)) {
      counts.terminal += 1;
    }
  });

  counts.remaining = Math.max(0, counts.total - counts.terminal);
  return counts;
}

function itemMatches(item, itemId) {
  const id = trimText(itemId);
  return Boolean(id) && [item.queue_item_id, item.item_id, item.prompt_id, item.package_prompt_id].includes(id);
}

function findCurrentItem(queue, run) {
  const runCurrentId = trimText(run.current_queue_item_id);
  const queueCurrentId = trimText(queue.current_queue_item_id);
  const requestedId = runCurrentId || queueCurrentId;

  if (requestedId) {
    const byId = queue.items.find((item) => itemMatches(item, requestedId));
    if (byId) {
      return byId;
    }
  }

  const sent = queue.items.find((item) => item.send_status === SEND_STATUS.SENT);
  if (sent) {
    return sent;
  }

  const currentIndex = Math.max(0, Math.min(queue.current_index, Math.max(0, queue.items.length - 1)));
  return queue.items[currentIndex] || null;
}

function findNextSendableItem(queue) {
  return queue.items.find((item) => [SEND_STATUS.PENDING, SEND_STATUS.READY, SEND_STATUS.HELD].includes(item.send_status)) || null;
}

function formatPercent(value) {
  const numeric = Number.isFinite(Number(value)) ? Number(value) : 0;
  return `${Math.round(numeric * 100) / 100}%`;
}

function formatPromptQueueProgress(queueInput) {
  const queue = normalizeQueue(queueInput);
  const counts = countQueueItems(queue);
  const progressPercent = counts.total > 0 ? Math.round((counts.terminal / counts.total) * 10000) / 100 : 0;
  const successPercent = counts.total > 0 ? Math.round((counts.completed / counts.total) * 10000) / 100 : 0;
  const failurePercent = counts.total > 0 ? Math.round((counts.failed / counts.total) * 10000) / 100 : 0;

  return {
    object_type: PROGRESS_OBJECT_TYPE,
    schema_version: SCHEMA_VERSION,
    queue_id: queue.queue_id,
    status: queue.status,
    counts,
    total_count: counts.total,
    completed_count: counts.completed,
    failed_count: counts.failed,
    held_count: counts.held + counts.blocked,
    remaining_count: counts.remaining,
    progress_percent: progressPercent,
    success_percent: successPercent,
    failure_percent: failurePercent,
    progress_label: `${counts.terminal}/${counts.total} (${formatPercent(progressPercent)})`,
    success_label: `${counts.completed} success`,
    failure_label: `${counts.failed} failed`,
    held_label: `${counts.held + counts.blocked} held`,
    is_large_batch: counts.total >= 70,
    large_batch_label: counts.total >= 70 ? `${counts.total} prompt batch` : ''
  };
}

function statusLabel(status) {
  const labels = {
    pending: '대기',
    ready: '준비',
    sent: '전송 중',
    completed: '완료',
    failed: '실패',
    held: '보류',
    skipped: '건너뜀',
    blocked: '차단'
  };
  return labels[status] || status;
}

function buildPromptQueueTableRows(queueInput) {
  const queue = normalizeQueue(queueInput);
  const currentItem = findCurrentItem(queue, normalizeRun({ queue_id: queue.queue_id }));

  return queue.items.map((item) => ({
    object_type: TABLE_ROW_OBJECT_TYPE,
    schema_version: SCHEMA_VERSION,
    row_id: `prompt_queue_row_${item.queue_item_id}`,
    queue_item_id: item.queue_item_id,
    prompt_id: item.prompt_id,
    sequence_number: item.sequence_number,
    title: item.title,
    short_body: clipText(item.body, 140),
    target_slot_id: item.target_slot_id,
    target_worker_id: item.target_worker_id,
    send_status: item.send_status,
    status_label: statusLabel(item.send_status),
    is_current: Boolean(currentItem && currentItem.queue_item_id === item.queue_item_id),
    is_remaining: !TERMINAL_SEND_STATUSES.includes(item.send_status),
    is_failed: item.send_status === SEND_STATUS.FAILED,
    is_held: [SEND_STATUS.HELD, SEND_STATUS.BLOCKED].includes(item.send_status),
    requires_manual_review: item.manual_review_required || item.retry_exhausted,
    dependency_count: Array.isArray(item.dependencies) ? item.dependencies.length : 0,
    attempt_label: `${item.attempts}/${item.max_attempts}`,
    failure_summary: clipText(item.failure_reason && (item.failure_reason.message || item.failure_reason.reason || item.failure_reason), 100),
    hold_summary: clipText(item.hold_reason && (item.hold_reason.message || item.hold_reason.reason || item.hold_reason), 100)
  }));
}

function warning(code, message, severity, details) {
  return {
    object_type: WARNING_OBJECT_TYPE,
    schema_version: SCHEMA_VERSION,
    code,
    message,
    severity: severity || 'info',
    details: cloneJson(details, {})
  };
}

function listPromptQueueWarnings(context) {
  const source = asObject(context);
  const queue = normalizeQueue(source.queue);
  const run = normalizeRun(source.run);
  const progress = formatPromptQueueProgress(queue);
  const rows = buildPromptQueueTableRows(queue);
  const warnings = [];

  if (progress.total_count === 0) {
    warnings.push(warning('QUEUE_EMPTY', '프롬프트 큐 항목이 없습니다.', 'warn'));
  }

  if (progress.is_large_batch) {
    warnings.push(warning('LARGE_BATCH', '대량 프롬프트 큐입니다. 진행률 요약과 보류/실패 항목을 우선 표시해야 합니다.', 'info', {
      total_count: progress.total_count
    }));
  }

  if (progress.failed_count > 0) {
    warnings.push(warning('FAILED_ITEMS', '실패한 프롬프트 항목이 있습니다.', 'warn', {
      failed_count: progress.failed_count
    }));
  }

  if (progress.held_count > 0) {
    warnings.push(warning('HELD_ITEMS', '보류 또는 차단 상태의 프롬프트 항목이 있습니다.', 'warn', {
      held_count: progress.held_count
    }));
  }

  if (run.user_pause_requested || queue.pause_requested || run.status === RUN_STATUS.PAUSED) {
    warnings.push(warning('PAUSE_ACTIVE', '사용자 일시정지 요청 또는 일시정지 상태입니다.', 'info'));
  }

  if (run.user_stop_requested || queue.stop_requested || run.status === RUN_STATUS.STOP_REQUESTED) {
    warnings.push(warning('STOP_REQUESTED', '사용자 중지 요청이 있습니다.', 'warn'));
  }

  if (run.panel_command_waiting || queue.panel_command_waiting) {
    warnings.push(warning('PANEL_COMMAND_WAIT', '명시 PANEL_COMMAND 대기 상태입니다.', 'info'));
  }

  const missingTargetRows = rows.filter((row) => !trimText(row.target_slot_id) || row.target_slot_id === DEFAULTS.target_slot_id);
  if (missingTargetRows.length > 0) {
    warnings.push(warning('TARGET_SLOT_AUTO', '자동 target_slot_id 항목이 있습니다. Worker 슬롯 연결 전 확인이 필요합니다.', 'info', {
      count: missingTargetRows.length
    }));
  }

  const manualReviewRows = rows.filter((row) => row.requires_manual_review);
  if (manualReviewRows.length > 0) {
    warnings.push(warning('MANUAL_REVIEW_ITEMS', '수동 검토가 필요한 항목이 있습니다.', 'warn', {
      count: manualReviewRows.length
    }));
  }

  if (!source.api_available && source.api_available !== undefined) {
    warnings.push(warning('PANEL_API_UNAVAILABLE', `${EXPECTED_PANEL_API} 연결이 아직 확인되지 않았습니다.`, 'warn'));
  }

  return warnings;
}

function commandPayload(action, viewModel) {
  return {
    action,
    queue_id: viewModel.queue_id,
    run_id: viewModel.run_id,
    package_id: viewModel.package_id,
    current_queue_item_id: viewModel.current_prompt ? viewModel.current_prompt.queue_item_id : '',
    target_slot_id: viewModel.current_prompt ? viewModel.current_prompt.target_slot_id : ''
  };
}

function actionDescriptor(action, label, enabled, reason, viewModel) {
  return {
    object_type: ACTION_MODEL_OBJECT_TYPE,
    schema_version: SCHEMA_VERSION,
    action,
    label,
    enabled: Boolean(enabled),
    disabled_reason: enabled ? '' : textOr(reason, 'action not available'),
    api_name: EXPECTED_PANEL_API,
    ipc_channel: EXPECTED_IPC_CHANNEL,
    panel_command_action: 'ENQUEUE_PANEL_COMMAND',
    payload: commandPayload(action, viewModel)
  };
}

function buildPromptQueueActionModel(viewModelInput) {
  const viewModel = asObject(viewModelInput);
  const runStatus = enumValue(viewModel.run_status, RUN_STATUS, RUN_STATUS.READY);
  const queueStatus = enumValue(viewModel.queue_status, QUEUE_STATUS, QUEUE_STATUS.READY);
  const terminal = TERMINAL_RUN_STATUSES.includes(runStatus) || TERMINAL_QUEUE_STATUSES.includes(queueStatus);
  const paused = runStatus === RUN_STATUS.PAUSED || runStatus === RUN_STATUS.PAUSE_REQUESTED || queueStatus === QUEUE_STATUS.PAUSED;
  const running = runStatus === RUN_STATUS.RUNNING || queueStatus === QUEUE_STATUS.RUNNING;
  const hasNext = Boolean(viewModel.next_prompt);
  const hasFailed = (viewModel.progress && viewModel.progress.failed_count > 0) || false;
  const hasWarnings = Array.isArray(viewModel.warnings) && viewModel.warnings.length > 0;

  return {
    start: actionDescriptor(PROMPT_QUEUE_ACTION.START, '시작', !terminal && !running && !paused && hasNext, hasNext ? '' : 'next prompt not available', viewModel),
    pause: actionDescriptor(PROMPT_QUEUE_ACTION.PAUSE, '일시정지', !terminal && running, running ? '' : 'queue is not running', viewModel),
    resume: actionDescriptor(PROMPT_QUEUE_ACTION.RESUME, '재개', !terminal && paused, paused ? '' : 'queue is not paused', viewModel),
    stop: actionDescriptor(PROMPT_QUEUE_ACTION.STOP, '중지', !terminal && (running || paused || hasNext), terminal ? 'queue is terminal' : '', viewModel),
    send_next: actionDescriptor(PROMPT_QUEUE_ACTION.SEND_NEXT, '다음만 전송', !terminal && !paused && hasNext, hasNext ? '' : 'next prompt not available', viewModel),
    retry_failed: actionDescriptor(PROMPT_QUEUE_ACTION.RETRY_FAILED, '실패 재시도', !terminal && hasFailed, hasFailed ? '' : 'failed item not available', viewModel),
    open_manual_review: actionDescriptor(PROMPT_QUEUE_ACTION.OPEN_MANUAL_REVIEW, '수동 검토', hasWarnings, hasWarnings ? '' : 'warning not available', viewModel)
  };
}

function buildPromptSummary(item) {
  if (!item) {
    return null;
  }

  return {
    queue_item_id: item.queue_item_id,
    prompt_id: item.prompt_id,
    title: item.title,
    short_body: clipText(item.body, 180),
    target_slot_id: item.target_slot_id,
    target_worker_id: item.target_worker_id,
    send_status: item.send_status,
    status_label: statusLabel(item.send_status),
    attempts: item.attempts,
    max_attempts: item.max_attempts
  };
}

function buildPromptQueueViewModel(context) {
  const source = asObject(context);
  const queue = normalizeQueue(source.queue);
  const run = normalizeRun(source.run || { queue_id: queue.queue_id, package_id: queue.package_id, project_id: queue.project_id });
  const progress = formatPromptQueueProgress(queue);
  const tableRows = buildPromptQueueTableRows(queue);
  const currentItem = findCurrentItem(queue, run);
  const nextItem = findNextSendableItem(queue);
  const failedItems = queue.items.filter((item) => item.send_status === SEND_STATUS.FAILED);
  const heldItems = queue.items.filter((item) => [SEND_STATUS.HELD, SEND_STATUS.BLOCKED].includes(item.send_status));
  const visibleRowLimit = Math.max(1, integerOr(source.visible_row_limit || source.visibleRowLimit, DEFAULTS.visible_row_limit));
  const viewModelBase = {
    object_type: VIEW_MODEL_OBJECT_TYPE,
    schema_version: SCHEMA_VERSION,
    selector: PANEL_SELECTOR,
    project_id: queue.project_id || run.project_id,
    package_id: queue.package_id || run.package_id,
    queue_id: queue.queue_id,
    run_id: run.run_id,
    title: textOr(source.title, queue.title || run.title),
    queue_status: queue.status,
    run_status: run.status,
    worker_window_menu_policy: 'REMOVE prompt controls from worker window; panel owns send/pause/resume/stop/send-next',
    taeo_lao_taera_role: 'Panel sends prompts into each Worker Taeo tab; Lao/Taera are input terminals for parsed source/resource records',
    expected_panel_api: EXPECTED_PANEL_API,
    expected_ipc_channel: EXPECTED_IPC_CHANNEL,
    expected_panel_selector: PANEL_SELECTOR,
    progress,
    current_prompt: buildPromptSummary(currentItem),
    next_prompt: buildPromptSummary(nextItem),
    remaining_prompt_count: progress.remaining_count,
    failed_items: failedItems.map(buildPromptSummary),
    held_items: heldItems.map(buildPromptSummary),
    table_rows: tableRows,
    visible_rows: tableRows.slice(0, visibleRowLimit),
    hidden_row_count: Math.max(0, tableRows.length - visibleRowLimit),
    large_batch_summary: progress.is_large_batch
      ? {
        total_count: progress.total_count,
        completed_count: progress.completed_count,
        remaining_count: progress.remaining_count,
        failed_count: progress.failed_count,
        held_count: progress.held_count,
        progress_label: progress.progress_label
      }
      : null,
    warnings: [],
    metadata: {
      no_dom_direct_access: true,
      no_direct_terminal_operation: true,
      binding_required_later: 'YES_AS_PANEL_BINDING_CONTRACT_LATER',
      mounted_by: 'WORKER_07 Dashboard or Commander-assigned renderer binding'
    }
  };

  viewModelBase.warnings = listPromptQueueWarnings({ ...source, queue, run });
  viewModelBase.actions = buildPromptQueueActionModel(viewModelBase);
  return viewModelBase;
}

module.exports = {
  SCHEMA_VERSION,
  VIEW_MODEL_OBJECT_TYPE,
  ACTION_MODEL_OBJECT_TYPE,
  TABLE_ROW_OBJECT_TYPE,
  PROGRESS_OBJECT_TYPE,
  WARNING_OBJECT_TYPE,
  PANEL_SELECTOR,
  EXPECTED_PANEL_API,
  EXPECTED_IPC_CHANNEL,
  QUEUE_STATUS,
  RUN_STATUS,
  SEND_STATUS,
  PROMPT_QUEUE_ACTION,
  buildPromptQueueViewModel,
  buildPromptQueueActionModel,
  formatPromptQueueProgress,
  listPromptQueueWarnings,
  buildPromptQueueTableRows
};