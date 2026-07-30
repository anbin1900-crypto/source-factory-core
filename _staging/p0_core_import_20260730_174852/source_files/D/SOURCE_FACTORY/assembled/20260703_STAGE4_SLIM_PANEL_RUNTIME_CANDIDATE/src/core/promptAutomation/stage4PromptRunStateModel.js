'use strict';

/**
 * Stage 4 prompt run state model.
 * Pure model only: no file IO, no IPC, no renderer binding, no command execution.
 */

const SCHEMA_VERSION = 'stage4.prompt_run_state_model.v1';
const RUN_OBJECT_TYPE = 'STAGE4_PROMPT_RUN_STATE';
const RUN_EVENT_OBJECT_TYPE = 'STAGE4_PROMPT_RUN_EVENT';
const RUN_SUMMARY_OBJECT_TYPE = 'STAGE4_PROMPT_RUN_SUMMARY';

const PROMPT_RUN_STATUS = Object.freeze({
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

const PROMPT_RUN_REQUEST = Object.freeze({
  NONE: 'none',
  PAUSE: 'pause',
  STOP: 'stop'
});

const QUEUE_ITEM_SEND_STATUS = Object.freeze({
  PENDING: 'pending',
  READY: 'ready',
  SENT: 'sent',
  COMPLETED: 'completed',
  FAILED: 'failed',
  HELD: 'held',
  SKIPPED: 'skipped',
  BLOCKED: 'blocked'
});

const TERMINAL_RUN_STATUSES = Object.freeze([
  PROMPT_RUN_STATUS.STOPPED,
  PROMPT_RUN_STATUS.COMPLETED,
  PROMPT_RUN_STATUS.FAILED,
  PROMPT_RUN_STATUS.ARCHIVED
]);

const DEFAULTS = Object.freeze({
  project_id: 'default_project',
  package_id: 'manual_prompt_package',
  queue_id: 'manual_prompt_queue',
  run_title: 'Untitled prompt run'
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

function numberOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

function isoTimestamp(value, fallback) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  const source = trimText(value);
  if (source) {
    const parsed = new Date(source);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  if (fallback !== undefined) {
    return fallback;
  }

  return new Date().toISOString();
}

function optionalIsoTimestamp(value) {
  return isoTimestamp(value, '');
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

function enumValue(value, enumObject, fallback) {
  const source = trimText(value).toLowerCase();
  return Object.values(enumObject).includes(source) ? source : fallback;
}

function normalizeEvent(event, index) {
  const source = asObject(event);
  const at = isoTimestamp(source.at || source.created_at, new Date().toISOString());
  const eventType = textOr(source.event_type || source.type, 'note');

  return {
    object_type: RUN_EVENT_OBJECT_TYPE,
    event_id: textOr(source.event_id || source.id, stableId('run_event', [eventType, at, String(index)])),
    event_type: eventType,
    at,
    message: trimText(source.message),
    payload: cloneJson(source.payload, {})
  };
}

function appendEvent(run, eventType, payload, at) {
  const eventAt = isoTimestamp(at, new Date().toISOString());
  const existingEvents = Array.isArray(run.events) ? run.events : [];
  const event = normalizeEvent({
    event_type: eventType,
    at: eventAt,
    message: trimText(payload && payload.message),
    payload: cloneJson(payload, {})
  }, existingEvents.length);

  return existingEvents.concat(event);
}

function normalizeItemStatus(status) {
  return enumValue(status, QUEUE_ITEM_SEND_STATUS, QUEUE_ITEM_SEND_STATUS.PENDING);
}

function readQueueItems(queue) {
  const source = asObject(queue);
  const items = Array.isArray(source.items) ? source.items : [];

  return items.map((item) => asObject(item));
}

function countQueueItems(queue) {
  const counts = {
    total_count: 0,
    pending_count: 0,
    ready_count: 0,
    sent_count: 0,
    success_count: 0,
    failure_count: 0,
    hold_count: 0,
    skipped_count: 0,
    blocked_count: 0,
    terminal_count: 0,
    active_count: 0
  };

  readQueueItems(queue).forEach((item) => {
    const status = normalizeItemStatus(item.send_status || item.sendStatus || item.status);
    counts.total_count += 1;

    if (status === QUEUE_ITEM_SEND_STATUS.PENDING) {
      counts.pending_count += 1;
    } else if (status === QUEUE_ITEM_SEND_STATUS.READY) {
      counts.ready_count += 1;
    } else if (status === QUEUE_ITEM_SEND_STATUS.SENT) {
      counts.sent_count += 1;
      counts.active_count += 1;
    } else if (status === QUEUE_ITEM_SEND_STATUS.COMPLETED) {
      counts.success_count += 1;
      counts.terminal_count += 1;
    } else if (status === QUEUE_ITEM_SEND_STATUS.FAILED) {
      counts.failure_count += 1;
      counts.terminal_count += 1;
    } else if (status === QUEUE_ITEM_SEND_STATUS.HELD) {
      counts.hold_count += 1;
    } else if (status === QUEUE_ITEM_SEND_STATUS.SKIPPED) {
      counts.skipped_count += 1;
      counts.terminal_count += 1;
    } else if (status === QUEUE_ITEM_SEND_STATUS.BLOCKED) {
      counts.blocked_count += 1;
      counts.hold_count += 1;
    }
  });

  return counts;
}

function calculateProgress(counts) {
  const total = counts.total_count || 0;
  const terminal = counts.terminal_count || 0;
  const success = counts.success_count || 0;
  const failure = counts.failure_count || 0;

  return {
    progress_ratio: total > 0 ? terminal / total : 0,
    progress_percent: total > 0 ? Math.round((terminal / total) * 10000) / 100 : 0,
    success_ratio: total > 0 ? success / total : 0,
    success_percent: total > 0 ? Math.round((success / total) * 10000) / 100 : 0,
    failure_ratio: total > 0 ? failure / total : 0,
    failure_percent: total > 0 ? Math.round((failure / total) * 10000) / 100 : 0,
    remaining_count: Math.max(0, total - terminal)
  };
}

function normalizeSummary(summary) {
  const source = asObject(summary);
  const counts = {
    total_count: Math.max(0, integerOr(source.total_count, 0)),
    pending_count: Math.max(0, integerOr(source.pending_count, 0)),
    ready_count: Math.max(0, integerOr(source.ready_count, 0)),
    sent_count: Math.max(0, integerOr(source.sent_count, 0)),
    success_count: Math.max(0, integerOr(source.success_count, 0)),
    failure_count: Math.max(0, integerOr(source.failure_count, 0)),
    hold_count: Math.max(0, integerOr(source.hold_count, 0)),
    skipped_count: Math.max(0, integerOr(source.skipped_count, 0)),
    blocked_count: Math.max(0, integerOr(source.blocked_count, 0)),
    terminal_count: Math.max(0, integerOr(source.terminal_count, 0)),
    active_count: Math.max(0, integerOr(source.active_count, 0))
  };
  const calculatedProgress = calculateProgress(counts);

  const progress = {
    ...calculatedProgress,
    progress_ratio: numberOr(source.progress_ratio, calculatedProgress.progress_ratio),
    progress_percent: numberOr(source.progress_percent, calculatedProgress.progress_percent),
    success_ratio: numberOr(source.success_ratio, calculatedProgress.success_ratio),
    success_percent: numberOr(source.success_percent, calculatedProgress.success_percent),
    failure_ratio: numberOr(source.failure_ratio, calculatedProgress.failure_ratio),
    failure_percent: numberOr(source.failure_percent, calculatedProgress.failure_percent),
    remaining_count: Math.max(0, integerOr(source.remaining_count, calculatedProgress.remaining_count))
  };

  return {
    object_type: RUN_SUMMARY_OBJECT_TYPE,
    ...counts,
    ...progress,
    last_queue_item_id: trimText(source.last_queue_item_id || source.lastQueueItemId),
    last_prompt_id: trimText(source.last_prompt_id || source.lastPromptId),
    last_error: cloneJson(source.last_error || source.lastError, null),
    notes: trimText(source.notes)
  };
}

function inferStatusFromSummary(currentStatus, summary) {
  if (TERMINAL_RUN_STATUSES.includes(currentStatus)) {
    return currentStatus;
  }

  if (summary.total_count > 0 && summary.terminal_count >= summary.total_count) {
    return summary.failure_count > 0 ? PROMPT_RUN_STATUS.FAILED : PROMPT_RUN_STATUS.COMPLETED;
  }

  if (summary.sent_count > 0 || summary.active_count > 0) {
    return PROMPT_RUN_STATUS.RUNNING;
  }

  return currentStatus;
}

function createPromptRunState(input) {
  const source = asObject(input);
  const createdAt = isoTimestamp(source.created_at, new Date().toISOString());
  const packageId = textOr(source.package_id || source.packageId, DEFAULTS.package_id);
  const queueId = textOr(source.queue_id || source.queueId, DEFAULTS.queue_id);
  const runId = textOr(source.run_id || source.runId || source.id, stableId('prompt_run', [packageId, queueId, createdAt]));
  const summary = normalizeSummary(source.summary);
  const rawStatus = enumValue(source.status, PROMPT_RUN_STATUS, PROMPT_RUN_STATUS.READY);
  const status = inferStatusFromSummary(rawStatus, summary);
  const userRequest = enumValue(source.user_request || source.userRequest, PROMPT_RUN_REQUEST, PROMPT_RUN_REQUEST.NONE);

  return {
    object_type: RUN_OBJECT_TYPE,
    schema_version: SCHEMA_VERSION,
    run_id: runId,
    project_id: textOr(source.project_id || source.projectId, DEFAULTS.project_id),
    package_id: packageId,
    queue_id: queueId,
    title: textOr(source.title, DEFAULTS.run_title),
    status,
    user_request: userRequest,
    user_pause_requested: booleanOr(source.user_pause_requested || source.userPauseRequested, userRequest === PROMPT_RUN_REQUEST.PAUSE),
    user_stop_requested: booleanOr(source.user_stop_requested || source.userStopRequested, userRequest === PROMPT_RUN_REQUEST.STOP),
    created_at: createdAt,
    updated_at: isoTimestamp(source.updated_at || source.updatedAt || source.created_at, createdAt),
    started_at: optionalIsoTimestamp(source.started_at || source.startedAt),
    paused_at: optionalIsoTimestamp(source.paused_at || source.pausedAt),
    resumed_at: optionalIsoTimestamp(source.resumed_at || source.resumedAt),
    completed_at: optionalIsoTimestamp(source.completed_at || source.completedAt),
    failed_at: optionalIsoTimestamp(source.failed_at || source.failedAt),
    stop_requested_at: optionalIsoTimestamp(source.stop_requested_at || source.stopRequestedAt),
    stopped_at: optionalIsoTimestamp(source.stopped_at || source.stoppedAt),
    pause_reason: cloneJson(source.pause_reason || source.pauseReason, null),
    stop_reason: cloneJson(source.stop_reason || source.stopReason, null),
    failure_reason: cloneJson(source.failure_reason || source.failureReason, null),
    summary,
    events: Array.isArray(source.events) ? source.events.map(normalizeEvent) : [],
    metadata: cloneJson(source.metadata, {})
  };
}

function patchRun(run, patch, eventType, eventPayload, at) {
  const normalized = createPromptRunState(run);
  const updatedAt = isoTimestamp(at, new Date().toISOString());
  const patched = {
    ...normalized,
    ...patch,
    updated_at: updatedAt,
    events: eventType ? appendEvent(normalized, eventType, eventPayload, updatedAt) : normalized.events
  };

  return createPromptRunState(patched);
}

function markRunStarted(run, at) {
  const startedAt = isoTimestamp(at, new Date().toISOString());
  const normalized = createPromptRunState(run);

  return patchRun(normalized, {
    status: PROMPT_RUN_STATUS.RUNNING,
    started_at: normalized.started_at || startedAt,
    user_request: PROMPT_RUN_REQUEST.NONE,
    user_pause_requested: false,
    user_stop_requested: false,
    pause_reason: null,
    stop_reason: null
  }, 'run_started', { message: 'prompt run started' }, startedAt);
}

function markRunPaused(run, reason) {
  const pausedAt = new Date().toISOString();
  const normalized = createPromptRunState(run);

  return patchRun(normalized, {
    status: PROMPT_RUN_STATUS.PAUSED,
    paused_at: pausedAt,
    user_request: PROMPT_RUN_REQUEST.PAUSE,
    user_pause_requested: true,
    pause_reason: cloneJson(reason, String(reason || 'prompt run paused'))
  }, 'run_paused', { message: 'prompt run paused', reason: cloneJson(reason, null) }, pausedAt);
}

function markRunResumed(run, at) {
  const resumedAt = isoTimestamp(at, new Date().toISOString());
  const normalized = createPromptRunState(run);

  return patchRun(normalized, {
    status: PROMPT_RUN_STATUS.RUNNING,
    resumed_at: resumedAt,
    user_request: PROMPT_RUN_REQUEST.NONE,
    user_pause_requested: false,
    pause_reason: null
  }, 'run_resumed', { message: 'prompt run resumed' }, resumedAt);
}

function markRunCompleted(run, summary) {
  const completedAt = new Date().toISOString();
  const normalized = createPromptRunState(run);
  const mergedSummary = normalizeSummary({
    ...cloneJson(normalized.summary, {}),
    ...cloneJson(summary, {})
  });

  return patchRun(normalized, {
    status: PROMPT_RUN_STATUS.COMPLETED,
    completed_at: completedAt,
    user_request: PROMPT_RUN_REQUEST.NONE,
    user_pause_requested: false,
    user_stop_requested: false,
    summary: mergedSummary
  }, 'run_completed', { message: 'prompt run completed', summary: mergedSummary }, completedAt);
}

function markRunFailed(run, reason) {
  const failedAt = new Date().toISOString();
  const normalized = createPromptRunState(run);

  return patchRun(normalized, {
    status: PROMPT_RUN_STATUS.FAILED,
    failed_at: failedAt,
    failure_reason: cloneJson(reason, String(reason || 'prompt run failed'))
  }, 'run_failed', { message: 'prompt run failed', reason: cloneJson(reason, null) }, failedAt);
}

function requestRunPause(run, reason) {
  const requestedAt = new Date().toISOString();
  const normalized = createPromptRunState(run);

  return patchRun(normalized, {
    status: PROMPT_RUN_STATUS.PAUSE_REQUESTED,
    user_request: PROMPT_RUN_REQUEST.PAUSE,
    user_pause_requested: true,
    pause_reason: cloneJson(reason, String(reason || 'user requested pause'))
  }, 'pause_requested', { message: 'user requested pause', reason: cloneJson(reason, null) }, requestedAt);
}

function requestRunStop(run, reason) {
  const requestedAt = new Date().toISOString();
  const normalized = createPromptRunState(run);

  return patchRun(normalized, {
    status: PROMPT_RUN_STATUS.STOP_REQUESTED,
    stop_requested_at: requestedAt,
    user_request: PROMPT_RUN_REQUEST.STOP,
    user_stop_requested: true,
    stop_reason: cloneJson(reason, String(reason || 'user requested stop'))
  }, 'stop_requested', { message: 'user requested stop', reason: cloneJson(reason, null) }, requestedAt);
}

function markRunStopped(run, reason) {
  const stoppedAt = new Date().toISOString();
  const normalized = createPromptRunState(run);

  return patchRun(normalized, {
    status: PROMPT_RUN_STATUS.STOPPED,
    stopped_at: stoppedAt,
    user_request: PROMPT_RUN_REQUEST.STOP,
    user_stop_requested: true,
    stop_reason: cloneJson(reason, normalized.stop_reason || 'prompt run stopped')
  }, 'run_stopped', { message: 'prompt run stopped', reason: cloneJson(reason, null) }, stoppedAt);
}

function summarizePromptRun(run, queue) {
  const normalized = createPromptRunState(run);
  const queueCounts = countQueueItems(queue);
  const hasQueue = queueCounts.total_count > 0;
  const summary = hasQueue
    ? normalizeSummary(queueCounts)
    : normalizeSummary(normalized.summary);
  const status = inferStatusFromSummary(normalized.status, summary);

  return {
    object_type: RUN_SUMMARY_OBJECT_TYPE,
    run_id: normalized.run_id,
    project_id: normalized.project_id,
    package_id: normalized.package_id,
    queue_id: normalized.queue_id,
    status,
    user_request: normalized.user_request,
    user_pause_requested: normalized.user_pause_requested,
    user_stop_requested: normalized.user_stop_requested,
    started_at: normalized.started_at,
    paused_at: normalized.paused_at,
    completed_at: normalized.completed_at,
    ...summary,
    can_send_next: [PROMPT_RUN_STATUS.READY, PROMPT_RUN_STATUS.RUNNING].includes(status) && !normalized.user_pause_requested && !normalized.user_stop_requested,
    is_terminal: TERMINAL_RUN_STATUSES.includes(status),
    has_queue_snapshot: hasQueue
  };
}

module.exports = {
  SCHEMA_VERSION,
  RUN_OBJECT_TYPE,
  RUN_EVENT_OBJECT_TYPE,
  RUN_SUMMARY_OBJECT_TYPE,
  PROMPT_RUN_STATUS,
  PROMPT_RUN_REQUEST,
  QUEUE_ITEM_SEND_STATUS,
  createPromptRunState,
  markRunStarted,
  markRunPaused,
  markRunResumed,
  markRunCompleted,
  markRunFailed,
  requestRunPause,
  requestRunStop,
  markRunStopped,
  summarizePromptRun
};