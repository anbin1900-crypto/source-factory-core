'use strict';

/**
 * Stage 4 prompt pause/resume controller.
 * Pure controller/model only: no file IO, no IPC, no renderer binding, no timers, no command execution.
 */

const SCHEMA_VERSION = 'stage4.prompt_pause_resume_controller.v1';
const PAUSE_REQUEST_OBJECT_TYPE = 'STAGE4_PROMPT_PAUSE_REQUEST';
const PAUSE_RESUME_RESULT_OBJECT_TYPE = 'STAGE4_PROMPT_PAUSE_RESUME_RESULT';
const PAUSE_RESUME_VIEW_STATE_OBJECT_TYPE = 'STAGE4_PROMPT_PAUSE_RESUME_VIEW_STATE';

const PAUSE_REASON = Object.freeze({
  USER_REQUEST: 'user_request',
  PANEL_COMMAND_WAIT: 'panel_command_wait',
  CURRENT_PROMPT_HOLD: 'current_prompt_hold',
  MANUAL_REVIEW: 'manual_review',
  RETRY_BACKOFF: 'retry_backoff',
  ERROR_HOLD: 'error_hold',
  STOP_REQUESTED: 'stop_requested',
  UNKNOWN: 'unknown'
});

const CONTROL_ACTION = Object.freeze({
  PAUSE: 'pause',
  RESUME: 'resume',
  STOP: 'stop'
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

const PROMPT_SEND_STATUS = Object.freeze({
  PENDING: 'pending',
  READY: 'ready',
  SENT: 'sent',
  COMPLETED: 'completed',
  FAILED: 'failed',
  HELD: 'held',
  SKIPPED: 'skipped',
  BLOCKED: 'blocked'
});

const RUN_TERMINAL_STATUSES = Object.freeze([
  RUN_STATUS.STOPPED,
  RUN_STATUS.COMPLETED,
  RUN_STATUS.FAILED,
  RUN_STATUS.ARCHIVED
]);

const SEND_TERMINAL_STATUSES = Object.freeze([
  PROMPT_SEND_STATUS.COMPLETED,
  PROMPT_SEND_STATUS.FAILED,
  PROMPT_SEND_STATUS.SKIPPED,
  PROMPT_SEND_STATUS.BLOCKED
]);

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

function optionalIso(value) {
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

function normalizeToken(value) {
  return String(value || '').trim().toLowerCase();
}

function enumValue(value, enumObject, fallback) {
  const source = normalizeToken(value);
  return Object.values(enumObject).includes(source) ? source : fallback;
}

function normalizeAction(value) {
  return enumValue(value, CONTROL_ACTION, CONTROL_ACTION.PAUSE);
}

function normalizeReason(value, fallback) {
  return enumValue(value, PAUSE_REASON, fallback || PAUSE_REASON.USER_REQUEST);
}

function createEvent(eventType, payload, at, index) {
  const eventAt = isoTimestamp(at, new Date().toISOString());
  const safePayload = cloneJson(payload, {});

  return {
    event_id: stableId('pause_event', [eventType, eventAt, String(index || 0)]),
    event_type: textOr(eventType, 'pause_resume_event'),
    at: eventAt,
    message: trimText(safePayload.message),
    payload: safePayload
  };
}

function appendEvent(run, eventType, payload, at) {
  const events = Array.isArray(run.events) ? run.events.slice() : [];
  events.push(createEvent(eventType, payload, at, events.length));
  return events;
}

function createPauseRequest(input) {
  const source = asObject(input);
  const action = normalizeAction(source.action || source.request_type || source.requestType);
  const reason = normalizeReason(source.reason, action === CONTROL_ACTION.STOP ? PAUSE_REASON.STOP_REQUESTED : PAUSE_REASON.USER_REQUEST);
  const requestedAt = isoTimestamp(source.requested_at || source.requestedAt || source.at, new Date().toISOString());
  const panelCommand = cloneJson(source.panel_command || source.panelCommand, null);
  const explicitPanelCommandWait = booleanOr(
    source.explicit_panel_command_wait || source.explicitPanelCommandWait,
    reason === PAUSE_REASON.PANEL_COMMAND_WAIT || Boolean(panelCommand)
  );

  return {
    object_type: PAUSE_REQUEST_OBJECT_TYPE,
    schema_version: SCHEMA_VERSION,
    request_id: textOr(source.request_id || source.id, stableId('pause_request', [action, reason, requestedAt])),
    action,
    reason,
    requested_by: textOr(source.requested_by || source.requestedBy, 'USER'),
    requested_at: requestedAt,
    message: trimText(source.message),
    target_run_id: trimText(source.target_run_id || source.targetRunId || source.run_id || source.runId),
    target_queue_id: trimText(source.target_queue_id || source.targetQueueId || source.queue_id || source.queueId),
    target_queue_item_id: trimText(source.target_queue_item_id || source.targetQueueItemId || source.queue_item_id || source.queueItemId),
    explicit_panel_command_wait: explicitPanelCommandWait,
    panel_command: panelCommand,
    queue: cloneJson(source.queue || source.queue_state || source.queueState, null),
    metadata: cloneJson(source.metadata, {})
  };
}

function normalizeRun(run) {
  const source = asObject(run);
  const createdAt = isoTimestamp(source.created_at, new Date().toISOString());
  const runId = textOr(source.run_id || source.runId || source.id, stableId('prompt_run', [source.package_id, source.queue_id, createdAt]));

  return {
    ...cloneJson(source, {}),
    run_id: runId,
    package_id: trimText(source.package_id || source.packageId),
    queue_id: trimText(source.queue_id || source.queueId),
    status: enumValue(source.status, RUN_STATUS, RUN_STATUS.READY),
    user_request: trimText(source.user_request || source.userRequest),
    user_pause_requested: booleanOr(source.user_pause_requested || source.userPauseRequested, false),
    user_stop_requested: booleanOr(source.user_stop_requested || source.userStopRequested, false),
    panel_command_waiting: booleanOr(source.panel_command_waiting || source.panelCommandWaiting, false),
    current_queue_item_id: trimText(source.current_queue_item_id || source.currentQueueItemId),
    created_at: createdAt,
    updated_at: isoTimestamp(source.updated_at || source.updatedAt || source.created_at, createdAt),
    paused_at: optionalIso(source.paused_at || source.pausedAt),
    resumed_at: optionalIso(source.resumed_at || source.resumedAt),
    stopped_at: optionalIso(source.stopped_at || source.stoppedAt),
    pause_reason: cloneJson(source.pause_reason || source.pauseReason, null),
    stop_reason: cloneJson(source.stop_reason || source.stopReason, null),
    active_hold_mode: trimText(source.active_hold_mode || source.activeHoldMode),
    events: Array.isArray(source.events) ? cloneJson(source.events, []) : [],
    metadata: cloneJson(source.metadata, {})
  };
}

function normalizeQueueItem(item, index) {
  const source = asObject(item);
  const itemId = textOr(
    source.queue_item_id || source.queueItemId || source.item_id || source.itemId,
    stableId('queue_item', [source.prompt_id, String(index + 1)])
  );

  return {
    ...cloneJson(source, {}),
    queue_item_id: itemId,
    item_id: textOr(source.item_id || source.itemId, itemId),
    prompt_id: trimText(source.prompt_id || source.promptId),
    target_slot_id: trimText(source.target_slot_id || source.targetSlotId || source.target_slot || source.targetSlot),
    send_status: enumValue(source.send_status || source.sendStatus || source.status, PROMPT_SEND_STATUS, PROMPT_SEND_STATUS.PENDING),
    sequence_number: integerOr(source.sequence_number || source.sequenceNumber || source.order_index || source.orderIndex, index + 1),
    order_index: integerOr(source.order_index || source.orderIndex, index + 1),
    hold_requested: booleanOr(source.hold_requested || source.holdRequested, false),
    hold_after_completion: booleanOr(source.hold_after_completion || source.holdAfterCompletion, false),
    stop_requested: booleanOr(source.stop_requested || source.stopRequested, false),
    updated_at: isoTimestamp(source.updated_at || source.updatedAt || source.created_at, new Date().toISOString()),
    hold_reason: cloneJson(source.hold_reason || source.holdReason, null)
  };
}

function sortItems(items) {
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
  if (!isPlainObject(queue)) {
    return null;
  }

  const source = asObject(queue);
  const items = sortItems((Array.isArray(source.items) ? source.items : []).map(normalizeQueueItem));
  const queueId = textOr(source.queue_id || source.queueId || source.id, stableId('prompt_queue', [items.length, source.package_id]));

  return {
    ...cloneJson(source, {}),
    queue_id: queueId,
    package_id: trimText(source.package_id || source.packageId),
    status: enumValue(source.status, QUEUE_STATUS, items.length ? QUEUE_STATUS.READY : QUEUE_STATUS.DRAFT),
    current_index: Math.max(0, integerOr(source.current_index || source.currentIndex, 0)),
    current_queue_item_id: trimText(source.current_queue_item_id || source.currentQueueItemId),
    pause_requested: booleanOr(source.pause_requested || source.pauseRequested, false),
    stop_requested: booleanOr(source.stop_requested || source.stopRequested, false),
    panel_command_waiting: booleanOr(source.panel_command_waiting || source.panelCommandWaiting, false),
    updated_at: isoTimestamp(source.updated_at || source.updatedAt || source.created_at, new Date().toISOString()),
    items
  };
}

function matchesItem(item, itemId) {
  const id = trimText(itemId);
  return Boolean(id) && [item.queue_item_id, item.item_id, item.prompt_id].includes(id);
}

function findActiveQueueItem(queue, request) {
  if (!queue || !Array.isArray(queue.items) || queue.items.length === 0) {
    return null;
  }

  const requestedItemId = trimText(request.target_queue_item_id);
  if (requestedItemId) {
    const byRequest = queue.items.find((item) => matchesItem(item, requestedItemId));
    if (byRequest) {
      return byRequest;
    }
  }

  const byQueueCurrentId = trimText(queue.current_queue_item_id);
  if (byQueueCurrentId) {
    const current = queue.items.find((item) => matchesItem(item, byQueueCurrentId));
    if (current) {
      return current;
    }
  }

  const sent = queue.items.find((item) => item.send_status === PROMPT_SEND_STATUS.SENT);
  if (sent) {
    return sent;
  }

  const currentIndex = Math.max(0, Math.min(queue.current_index || 0, queue.items.length - 1));
  return queue.items[currentIndex] || null;
}

function updateQueueItem(queue, targetItem, updater) {
  if (!queue || !targetItem) {
    return queue;
  }

  return {
    ...queue,
    items: queue.items.map((item) => (item.queue_item_id === targetItem.queue_item_id ? updater(item) : item))
  };
}

function holdActiveQueueItem(queue, request, at) {
  const activeItem = findActiveQueueItem(queue, request);
  if (!activeItem) {
    return queue;
  }

  return updateQueueItem(queue, activeItem, (item) => {
    if (item.send_status === PROMPT_SEND_STATUS.SENT) {
      return {
        ...item,
        hold_requested: true,
        hold_after_completion: true,
        hold_reason: {
          reason: request.reason,
          message: request.message,
          safe_hold_mode: 'after_current_prompt'
        },
        updated_at: at
      };
    }

    if ([PROMPT_SEND_STATUS.PENDING, PROMPT_SEND_STATUS.READY, PROMPT_SEND_STATUS.HELD].includes(item.send_status)) {
      return {
        ...item,
        send_status: PROMPT_SEND_STATUS.HELD,
        hold_requested: true,
        hold_after_completion: false,
        hold_reason: {
          reason: request.reason,
          message: request.message,
          safe_hold_mode: 'before_next_send'
        },
        updated_at: at
      };
    }

    return {
      ...item,
      hold_requested: true,
      hold_reason: {
        reason: request.reason,
        message: request.message,
        safe_hold_mode: 'terminal_item_not_changed'
      },
      updated_at: at
    };
  });
}

function releaseHeldQueueItems(queue, request, at) {
  if (!queue) {
    return queue;
  }

  const targetItemId = trimText(request.target_queue_item_id);
  const items = queue.items.map((item) => {
    const targeted = !targetItemId || matchesItem(item, targetItemId);
    if (!targeted) {
      return item;
    }

    if (item.send_status === PROMPT_SEND_STATUS.HELD) {
      return {
        ...item,
        send_status: PROMPT_SEND_STATUS.PENDING,
        hold_requested: false,
        hold_after_completion: false,
        hold_reason: null,
        updated_at: at
      };
    }

    if (item.hold_requested || item.hold_after_completion) {
      return {
        ...item,
        hold_requested: false,
        hold_after_completion: false,
        hold_reason: null,
        updated_at: at
      };
    }

    return item;
  });

  return {
    ...queue,
    items
  };
}

function stopQueueItems(queue, request, at) {
  if (!queue) {
    return queue;
  }

  const targetItemId = trimText(request.target_queue_item_id);
  const hasTarget = Boolean(targetItemId);

  return {
    ...queue,
    items: queue.items.map((item) => {
      const targeted = hasTarget ? matchesItem(item, targetItemId) : true;
      if (!targeted || SEND_TERMINAL_STATUSES.includes(item.send_status)) {
        return item;
      }

      if (item.send_status === PROMPT_SEND_STATUS.SENT) {
        return {
          ...item,
          stop_requested: true,
          hold_requested: true,
          hold_after_completion: true,
          hold_reason: {
            reason: request.reason,
            message: request.message,
            safe_hold_mode: 'stop_after_current_prompt'
          },
          updated_at: at
        };
      }

      return {
        ...item,
        send_status: PROMPT_SEND_STATUS.SKIPPED,
        stop_requested: true,
        hold_requested: false,
        hold_after_completion: false,
        hold_reason: {
          reason: request.reason,
          message: request.message,
          safe_hold_mode: 'skipped_by_stop_request'
        },
        updated_at: at
      };
    })
  };
}

function countQueue(queue) {
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
    terminal: 0
  };

  if (!queue || !Array.isArray(queue.items)) {
    return counts;
  }

  queue.items.forEach((item) => {
    counts.total += 1;
    counts[item.send_status] = (counts[item.send_status] || 0) + 1;
    if (SEND_TERMINAL_STATUSES.includes(item.send_status)) {
      counts.terminal += 1;
    }
  });

  return counts;
}

function buildResult(run, queue, request, action, at) {
  const viewState = buildPauseResumeViewState(run, queue);

  return {
    object_type: PAUSE_RESUME_RESULT_OBJECT_TYPE,
    schema_version: SCHEMA_VERSION,
    action,
    at,
    run,
    queue,
    request,
    view_state: viewState
  };
}

function applyPauseToRun(run, requestInput) {
  const request = createPauseRequest({ ...asObject(requestInput), action: CONTROL_ACTION.PAUSE });
  const at = request.requested_at;
  const normalizedRun = normalizeRun(run);
  const queueSource = request.queue || normalizedRun.queue || normalizedRun.queue_state || normalizedRun.queueState;
  const normalizedQueue = normalizeQueue(queueSource);
  const pausedQueue = holdActiveQueueItem(normalizedQueue, request, at);
  const activeItem = pausedQueue ? findActiveQueueItem(pausedQueue, request) : null;
  const runPatch = {
    ...normalizedRun,
    status: request.explicit_panel_command_wait ? RUN_STATUS.PAUSE_REQUESTED : RUN_STATUS.PAUSED,
    user_request: CONTROL_ACTION.PAUSE,
    user_pause_requested: true,
    user_stop_requested: false,
    panel_command_waiting: request.explicit_panel_command_wait,
    current_queue_item_id: activeItem ? activeItem.queue_item_id : normalizedRun.current_queue_item_id,
    paused_at: at,
    pause_reason: {
      reason: request.reason,
      message: request.message,
      explicit_panel_command_wait: request.explicit_panel_command_wait,
      panel_command: request.panel_command
    },
    active_hold_mode: activeItem && activeItem.send_status === PROMPT_SEND_STATUS.SENT ? 'after_current_prompt' : 'before_next_send',
    updated_at: at
  };
  runPatch.events = appendEvent(normalizedRun, 'run_pause_applied', runPatch.pause_reason, at);

  const queuePatch = pausedQueue
    ? {
      ...pausedQueue,
      status: QUEUE_STATUS.PAUSED,
      pause_requested: true,
      stop_requested: false,
      panel_command_waiting: request.explicit_panel_command_wait,
      current_queue_item_id: activeItem ? activeItem.queue_item_id : pausedQueue.current_queue_item_id,
      updated_at: at
    }
    : null;

  return buildResult(runPatch, queuePatch, request, CONTROL_ACTION.PAUSE, at);
}

function applyResumeToRun(run, requestInput) {
  const request = createPauseRequest({ ...asObject(requestInput), action: CONTROL_ACTION.RESUME });
  const at = request.requested_at;
  const normalizedRun = normalizeRun(run);
  const queueSource = request.queue || normalizedRun.queue || normalizedRun.queue_state || normalizedRun.queueState;
  const normalizedQueue = normalizeQueue(queueSource);
  const resumedQueue = releaseHeldQueueItems(normalizedQueue, request, at);
  const counts = countQueue(resumedQueue);
  const queueStatus = resumedQueue
    ? counts.sent > 0
      ? QUEUE_STATUS.RUNNING
      : QUEUE_STATUS.READY
    : null;
  const runStatus = RUN_TERMINAL_STATUSES.includes(normalizedRun.status)
    ? normalizedRun.status
    : counts.sent > 0
      ? RUN_STATUS.RUNNING
      : RUN_STATUS.READY;
  const runPatch = {
    ...normalizedRun,
    status: runStatus,
    user_request: '',
    user_pause_requested: false,
    panel_command_waiting: false,
    resumed_at: at,
    pause_reason: null,
    active_hold_mode: '',
    updated_at: at
  };
  runPatch.events = appendEvent(normalizedRun, 'run_resume_applied', { reason: request.reason, message: request.message }, at);

  const queuePatch = resumedQueue
    ? {
      ...resumedQueue,
      status: queueStatus,
      pause_requested: false,
      panel_command_waiting: false,
      updated_at: at
    }
    : null;

  return buildResult(runPatch, queuePatch, request, CONTROL_ACTION.RESUME, at);
}

function applyStopToRun(run, requestInput) {
  const request = createPauseRequest({
    ...asObject(requestInput),
    action: CONTROL_ACTION.STOP,
    reason: asObject(requestInput).reason || PAUSE_REASON.STOP_REQUESTED
  });
  const at = request.requested_at;
  const normalizedRun = normalizeRun(run);
  const queueSource = request.queue || normalizedRun.queue || normalizedRun.queue_state || normalizedRun.queueState;
  const normalizedQueue = normalizeQueue(queueSource);
  const stoppedQueue = stopQueueItems(normalizedQueue, request, at);
  const activeItem = stoppedQueue ? findActiveQueueItem(stoppedQueue, request) : null;
  const runPatch = {
    ...normalizedRun,
    status: RUN_STATUS.STOPPED,
    user_request: CONTROL_ACTION.STOP,
    user_pause_requested: false,
    user_stop_requested: true,
    panel_command_waiting: false,
    current_queue_item_id: activeItem ? activeItem.queue_item_id : normalizedRun.current_queue_item_id,
    stopped_at: at,
    stop_reason: {
      reason: request.reason,
      message: request.message
    },
    active_hold_mode: activeItem && activeItem.send_status === PROMPT_SEND_STATUS.SENT ? 'stop_after_current_prompt' : 'stopped_before_next_send',
    updated_at: at
  };
  runPatch.events = appendEvent(normalizedRun, 'run_stop_applied', runPatch.stop_reason, at);

  const queuePatch = stoppedQueue
    ? {
      ...stoppedQueue,
      status: QUEUE_STATUS.STOPPED,
      pause_requested: false,
      stop_requested: true,
      panel_command_waiting: false,
      current_queue_item_id: activeItem ? activeItem.queue_item_id : stoppedQueue.current_queue_item_id,
      updated_at: at
    }
    : null;

  return buildResult(runPatch, queuePatch, request, CONTROL_ACTION.STOP, at);
}

function buildPauseResumeViewState(run, queue) {
  const normalizedRun = normalizeRun(run);
  const normalizedQueue = normalizeQueue(queue);
  const counts = countQueue(normalizedQueue);
  const activeItem = normalizedQueue ? findActiveQueueItem(normalizedQueue, {
    target_queue_item_id: normalizedRun.current_queue_item_id
  }) : null;
  const isTerminal = RUN_TERMINAL_STATUSES.includes(normalizedRun.status);
  const isPaused = normalizedRun.status === RUN_STATUS.PAUSED || normalizedRun.status === RUN_STATUS.PAUSE_REQUESTED;
  const isRunning = normalizedRun.status === RUN_STATUS.RUNNING;
  const canPause = !isTerminal && !isPaused;
  const canResume = !isTerminal && isPaused && !normalizedRun.user_stop_requested;
  const canStop = !isTerminal;
  const progressPercent = counts.total > 0 ? Math.round((counts.terminal / counts.total) * 10000) / 100 : 0;

  return {
    object_type: PAUSE_RESUME_VIEW_STATE_OBJECT_TYPE,
    schema_version: SCHEMA_VERSION,
    run_id: normalizedRun.run_id,
    queue_id: normalizedQueue ? normalizedQueue.queue_id : normalizedRun.queue_id,
    run_status: normalizedRun.status,
    queue_status: normalizedQueue ? normalizedQueue.status : '',
    is_running: isRunning,
    is_paused: isPaused,
    is_stopped: normalizedRun.status === RUN_STATUS.STOPPED,
    is_terminal: isTerminal,
    can_pause: canPause,
    can_resume: canResume,
    can_stop: canStop,
    user_pause_requested: normalizedRun.user_pause_requested,
    user_stop_requested: normalizedRun.user_stop_requested,
    waiting_for_panel_command: normalizedRun.panel_command_waiting || Boolean(normalizedQueue && normalizedQueue.panel_command_waiting),
    should_hold_current_prompt: Boolean(activeItem && (activeItem.hold_requested || activeItem.hold_after_completion)),
    active_hold_mode: normalizedRun.active_hold_mode,
    active_queue_item: activeItem ? cloneJson(activeItem, null) : null,
    counts,
    progress_percent: progressPercent,
    primary_status_text: isTerminal
      ? normalizedRun.status
      : isPaused
        ? 'paused'
        : isRunning
          ? 'running'
          : 'ready',
    next_panel_action: canResume
      ? CONTROL_ACTION.RESUME
      : canPause
        ? CONTROL_ACTION.PAUSE
        : canStop
          ? CONTROL_ACTION.STOP
          : '',
    pause_reason: cloneJson(normalizedRun.pause_reason, null),
    stop_reason: cloneJson(normalizedRun.stop_reason, null)
  };
}

module.exports = {
  SCHEMA_VERSION,
  PAUSE_REQUEST_OBJECT_TYPE,
  PAUSE_RESUME_RESULT_OBJECT_TYPE,
  PAUSE_RESUME_VIEW_STATE_OBJECT_TYPE,
  PAUSE_REASON,
  CONTROL_ACTION,
  RUN_STATUS,
  QUEUE_STATUS,
  PROMPT_SEND_STATUS,
  createPauseRequest,
  applyPauseToRun,
  applyResumeToRun,
  applyStopToRun,
  buildPauseResumeViewState
};