'use strict';

/**
 * Stage 4 sequential prompt sender pure controller.
 * Pure logic only: no file IO, no IPC, no renderer binding, no timers, no GPT input automation.
 */

const SCHEMA_VERSION = 'stage4.sequential_prompt_sender.v1';
const SENDER_POLICY_OBJECT_TYPE = 'STAGE4_SEQUENTIAL_PROMPT_SENDER_POLICY';
const SEND_DECISION_OBJECT_TYPE = 'STAGE4_SEQUENTIAL_PROMPT_SEND_DECISION';
const DELIVERY_REQUEST_OBJECT_TYPE = 'STAGE4_PROMPT_DELIVERY_REQUEST';
const SEND_DECISION_SUMMARY_OBJECT_TYPE = 'STAGE4_SEND_DECISION_SUMMARY';

const SEND_DECISION_STATUS = Object.freeze({
  SEND_READY: 'send_ready',
  WAIT_AUTOSAVE: 'wait_autosave',
  WAIT_COMPLETION: 'wait_completion',
  WAIT_DELAY: 'wait_delay',
  WAIT_PAUSED: 'wait_paused',
  WAIT_RETRY: 'wait_retry',
  WAIT_MANUAL_REVIEW: 'wait_manual_review',
  NO_NEXT_ITEM: 'no_next_item',
  RUN_COMPLETED: 'run_completed',
  RUN_FAILED: 'run_failed',
  RUN_STOPPED: 'run_stopped',
  BLOCKED: 'blocked'
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

const COMPLETION_STATUS = Object.freeze({
  UNKNOWN: 'unknown',
  INCOMPLETE: 'incomplete',
  PARTIAL: 'partial',
  COMPLETE: 'complete',
  COMPLETE_WITH_WARNINGS: 'complete_with_warnings',
  STABLE_INCOMPLETE: 'stable_incomplete'
});

const RETRY_DECISION = Object.freeze({
  RETRY: 'retry',
  DO_NOT_RETRY: 'do_not_retry',
  MANUAL_REVIEW: 'manual_review',
  GIVE_UP: 'give_up'
});

const RUN_TERMINAL_STATUSES = Object.freeze([
  RUN_STATUS.STOPPED,
  RUN_STATUS.COMPLETED,
  RUN_STATUS.FAILED,
  RUN_STATUS.ARCHIVED
]);

const QUEUE_TERMINAL_STATUSES = Object.freeze([
  QUEUE_STATUS.STOPPED,
  QUEUE_STATUS.COMPLETED,
  QUEUE_STATUS.FAILED,
  QUEUE_STATUS.ARCHIVED
]);

const SEND_TERMINAL_STATUSES = Object.freeze([
  PROMPT_SEND_STATUS.COMPLETED,
  PROMPT_SEND_STATUS.FAILED,
  PROMPT_SEND_STATUS.SKIPPED,
  PROMPT_SEND_STATUS.BLOCKED
]);

const DEFAULT_POLICY = Object.freeze({
  sender_id: 'stage4_sequential_prompt_sender',
  delivery_action: 'SEND_PACKET_TO_WORKER',
  delivery_route: 'WORKER_INBOX',
  command_queue_route: 'COMMAND_QUEUE',
  panel_record_route: 'PANEL_RECORD',
  commander_queue_route: 'COMMANDER_QUEUE',
  min_send_delay_ms: 0,
  max_send_delay_ms: 300000,
  require_autosave_before_send: true,
  require_completion_before_next: true,
  allow_send_when_completion_unknown: false,
  allow_retry_delivery_request: true,
  block_on_manual_review: true,
  block_when_panel_command_waiting: true,
  target_terminal: 'TAEO'
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

function clampNumber(value, min, max, fallback) {
  const parsed = numberOr(value, fallback);
  return Math.max(min, Math.min(max, parsed));
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

function normalizeQueueItem(item, index, queueId) {
  const source = asObject(item);
  const sequence = integerOr(source.sequence_number || source.sequenceNumber || source.order_index || source.orderIndex, index + 1);
  const queueItemId = textOr(
    source.queue_item_id || source.queueItemId || source.item_id || source.itemId,
    stableId('queue_item', [queueId, source.prompt_id || source.promptId, String(sequence)])
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
    target_role: textOr(source.target_role || source.targetRole, 'WORKER'),
    target_slot_id: textOr(source.target_slot_id || source.targetSlotId || source.target_slot || source.targetSlot || source.slot_id || source.slotId, 'AUTO_TARGET_SLOT'),
    target_worker_id: trimText(source.target_worker_id || source.targetWorkerId || source.worker_id || source.workerId),
    target_terminal: textOr(source.target_terminal || source.targetTerminal || source.terminal, DEFAULT_POLICY.target_terminal),
    send_status: enumValue(source.send_status || source.sendStatus || source.status, PROMPT_SEND_STATUS, PROMPT_SEND_STATUS.PENDING),
    attempts: Math.max(0, integerOr(source.attempts, 0)),
    max_attempts: Math.max(1, integerOr(source.max_attempts || source.maxAttempts, 1)),
    dependencies: Array.isArray(source.dependencies) ? cloneJson(source.dependencies, []) : [],
    dispatch_packet: cloneJson(source.dispatch_packet || source.dispatchPacket, null),
    payload: cloneJson(source.payload, {}),
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
  const queueId = textOr(source.queue_id || source.queueId || source.id, 'manual_prompt_queue');
  const items = sortQueueItems((Array.isArray(source.items) ? source.items : []).map((item, index) => normalizeQueueItem(item, index, queueId)));

  return {
    ...cloneJson(source, {}),
    queue_id: queueId,
    package_id: textOr(source.package_id || source.packageId, 'manual_prompt_package'),
    project_id: textOr(source.project_id || source.projectId, 'default_project'),
    status: enumValue(source.status, QUEUE_STATUS, items.length ? QUEUE_STATUS.READY : QUEUE_STATUS.DRAFT),
    current_index: Math.max(0, integerOr(source.current_index || source.currentIndex, 0)),
    current_queue_item_id: trimText(source.current_queue_item_id || source.currentQueueItemId),
    pause_requested: booleanOr(source.pause_requested || source.pauseRequested, false),
    stop_requested: booleanOr(source.stop_requested || source.stopRequested, false),
    panel_command_waiting: booleanOr(source.panel_command_waiting || source.panelCommandWaiting, false),
    items
  };
}

function normalizeRun(run, queue) {
  const source = asObject(run);
  const normalizedQueue = asObject(queue);

  return {
    ...cloneJson(source, {}),
    run_id: textOr(source.run_id || source.runId || source.id, 'manual_prompt_run'),
    package_id: textOr(source.package_id || source.packageId, normalizedQueue.package_id || 'manual_prompt_package'),
    queue_id: textOr(source.queue_id || source.queueId, normalizedQueue.queue_id || 'manual_prompt_queue'),
    project_id: textOr(source.project_id || source.projectId, normalizedQueue.project_id || 'default_project'),
    status: enumValue(source.status, RUN_STATUS, RUN_STATUS.READY),
    user_pause_requested: booleanOr(source.user_pause_requested || source.userPauseRequested, false),
    user_stop_requested: booleanOr(source.user_stop_requested || source.userStopRequested, false),
    panel_command_waiting: booleanOr(source.panel_command_waiting || source.panelCommandWaiting, false),
    current_queue_item_id: trimText(source.current_queue_item_id || source.currentQueueItemId),
    last_sent_at: trimText(source.last_sent_at || source.lastSentAt),
    metadata: cloneJson(source.metadata, {})
  };
}

function normalizeAutosave(autosave) {
  const source = asObject(autosave);
  const status = normalizeToken(source.status || source.save_status || source.saveStatus);
  const pending = booleanOr(source.pending || source.is_pending || source.isPending, false);
  const stable = booleanOr(source.stable || source.is_stable || source.isStable, !pending);

  return {
    status,
    pending,
    stable,
    last_saved_at: trimText(source.last_saved_at || source.lastSavedAt),
    error: cloneJson(source.error, null)
  };
}

function normalizeCompletionDecision(completion) {
  const source = asObject(completion);
  const status = enumValue(source.status, COMPLETION_STATUS, COMPLETION_STATUS.UNKNOWN);

  return {
    status,
    is_complete: booleanOr(source.is_complete || source.isComplete, [COMPLETION_STATUS.COMPLETE, COMPLETION_STATUS.COMPLETE_WITH_WARNINGS].includes(status)),
    should_send_next: booleanOr(source.should_send_next || source.shouldSendNext, [COMPLETION_STATUS.COMPLETE, COMPLETION_STATUS.COMPLETE_WITH_WARNINGS].includes(status)),
    confidence: clampNumber(source.confidence, 0, 1, 0),
    reasons: Array.isArray(source.reasons) ? cloneJson(source.reasons, []) : []
  };
}

function normalizeRetryDecision(retry) {
  const source = asObject(retry);
  const decision = enumValue(source.decision, RETRY_DECISION, RETRY_DECISION.DO_NOT_RETRY);

  return {
    decision,
    should_retry: booleanOr(source.should_retry || source.shouldRetry, decision === RETRY_DECISION.RETRY),
    manual_review_required: booleanOr(source.manual_review_required || source.manualReviewRequired, decision === RETRY_DECISION.MANUAL_REVIEW),
    retry_delay_ms: Math.max(0, integerOr(source.retry_delay_ms || source.retryDelayMs, 0)),
    next_retry_at: trimText(source.next_retry_at || source.nextRetryAt),
    reasons: Array.isArray(source.reasons) ? cloneJson(source.reasons, []) : []
  };
}

function createSequentialPromptSender(policy) {
  const source = asObject(policy);
  const minDelay = Math.max(0, integerOr(source.min_send_delay_ms || source.minSendDelayMs, DEFAULT_POLICY.min_send_delay_ms));
  const maxDelay = Math.max(minDelay, integerOr(source.max_send_delay_ms || source.maxSendDelayMs, DEFAULT_POLICY.max_send_delay_ms));

  return {
    object_type: SENDER_POLICY_OBJECT_TYPE,
    schema_version: SCHEMA_VERSION,
    sender_id: textOr(source.sender_id || source.id, DEFAULT_POLICY.sender_id),
    delivery_action: textOr(source.delivery_action || source.action, DEFAULT_POLICY.delivery_action),
    delivery_route: textOr(source.delivery_route, DEFAULT_POLICY.delivery_route),
    command_queue_route: textOr(source.command_queue_route, DEFAULT_POLICY.command_queue_route),
    panel_record_route: textOr(source.panel_record_route, DEFAULT_POLICY.panel_record_route),
    commander_queue_route: textOr(source.commander_queue_route, DEFAULT_POLICY.commander_queue_route),
    min_send_delay_ms: minDelay,
    max_send_delay_ms: maxDelay,
    require_autosave_before_send: booleanOr(source.require_autosave_before_send, DEFAULT_POLICY.require_autosave_before_send),
    require_completion_before_next: booleanOr(source.require_completion_before_next, DEFAULT_POLICY.require_completion_before_next),
    allow_send_when_completion_unknown: booleanOr(source.allow_send_when_completion_unknown, DEFAULT_POLICY.allow_send_when_completion_unknown),
    allow_retry_delivery_request: booleanOr(source.allow_retry_delivery_request, DEFAULT_POLICY.allow_retry_delivery_request),
    block_on_manual_review: booleanOr(source.block_on_manual_review, DEFAULT_POLICY.block_on_manual_review),
    block_when_panel_command_waiting: booleanOr(source.block_when_panel_command_waiting, DEFAULT_POLICY.block_when_panel_command_waiting),
    target_terminal: textOr(source.target_terminal || source.targetTerminal, DEFAULT_POLICY.target_terminal),
    metadata: cloneJson(source.metadata, {})
  };
}

function itemMatches(item, itemId) {
  const id = trimText(itemId);
  return Boolean(id) && [item.queue_item_id, item.item_id, item.prompt_id, item.package_prompt_id].includes(id);
}

function findItem(queue, itemId) {
  return queue.items.find((item) => itemMatches(item, itemId)) || null;
}

function dependencyReady(queue, dependency) {
  const source = asObject(dependency);
  const dependencyId = trimText(source.dependency_id || source.dependencyId || source.queue_item_id || source.queueItemId || source.item_id || source.itemId || source.prompt_id || source.promptId || dependency);
  const requiredStatus = enumValue(source.required_status || source.requiredStatus, PROMPT_SEND_STATUS, PROMPT_SEND_STATUS.COMPLETED);
  const item = findItem(queue, dependencyId);
  return Boolean(item) && item.send_status === requiredStatus;
}

function itemDependenciesReady(queue, item) {
  if (!Array.isArray(item.dependencies) || item.dependencies.length === 0) {
    return true;
  }

  return item.dependencies.every((dependency) => dependencyReady(queue, dependency));
}

function findActiveSentItem(queue) {
  return queue.items.find((item) => item.send_status === PROMPT_SEND_STATUS.SENT) || null;
}

function findNextSendableItem(queue) {
  const start = Math.max(0, Math.min(queue.current_index, Math.max(0, queue.items.length - 1)));
  const candidates = queue.items.slice(start).concat(queue.items.slice(0, start));

  return candidates.find((item) => {
    if (![PROMPT_SEND_STATUS.PENDING, PROMPT_SEND_STATUS.READY, PROMPT_SEND_STATUS.HELD].includes(item.send_status)) {
      return false;
    }
    return itemDependenciesReady(queue, item);
  }) || null;
}

function queueCounts(queue) {
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

  queue.items.forEach((item) => {
    counts.total += 1;
    counts[item.send_status] = (counts[item.send_status] || 0) + 1;
    if (SEND_TERMINAL_STATUSES.includes(item.send_status)) {
      counts.terminal += 1;
    }
  });

  return counts;
}

function parseTime(value) {
  const source = trimText(value);
  if (!source) {
    return null;
  }

  const parsed = Date.parse(source);
  return Number.isFinite(parsed) ? parsed : null;
}

function shouldWaitBeforeNextSend(context) {
  const source = asObject(context);
  const policy = createSequentialPromptSender(source.policy || source.sender_policy || source.senderPolicy);
  const run = normalizeRun(source.run, source.queue);
  const lastSentAt = parseTime(source.last_sent_at || source.lastSentAt || run.last_sent_at);
  const now = parseTime(source.now);

  if (!lastSentAt || !now || policy.min_send_delay_ms <= 0) {
    return {
      should_wait: false,
      remaining_delay_ms: 0,
      elapsed_ms: lastSentAt && now ? Math.max(0, now - lastSentAt) : null,
      required_delay_ms: policy.min_send_delay_ms,
      reason: 'delay policy not active or time context missing'
    };
  }

  const elapsed = Math.max(0, now - lastSentAt);
  const remaining = Math.max(0, policy.min_send_delay_ms - elapsed);

  return {
    should_wait: remaining > 0,
    remaining_delay_ms: remaining,
    elapsed_ms: elapsed,
    required_delay_ms: policy.min_send_delay_ms,
    reason: remaining > 0 ? 'minimum send delay has not elapsed' : 'minimum send delay satisfied'
  };
}

function makeDecision(status, parts) {
  const source = asObject(parts);
  const policy = createSequentialPromptSender(source.policy);
  const queue = normalizeQueue(source.queue);
  const run = normalizeRun(source.run, queue);
  const nextItem = source.next_item ? cloneJson(source.next_item, null) : null;
  const activeItem = source.active_item ? cloneJson(source.active_item, null) : null;

  return {
    object_type: SEND_DECISION_OBJECT_TYPE,
    schema_version: SCHEMA_VERSION,
    decision_id: stableId('send_decision', [status, queue.queue_id, run.run_id, nextItem && nextItem.queue_item_id, new Date().toISOString()]),
    status,
    should_send: status === SEND_DECISION_STATUS.SEND_READY,
    should_wait: [
      SEND_DECISION_STATUS.WAIT_AUTOSAVE,
      SEND_DECISION_STATUS.WAIT_COMPLETION,
      SEND_DECISION_STATUS.WAIT_DELAY,
      SEND_DECISION_STATUS.WAIT_PAUSED,
      SEND_DECISION_STATUS.WAIT_RETRY,
      SEND_DECISION_STATUS.WAIT_MANUAL_REVIEW
    ].includes(status),
    should_complete_run: status === SEND_DECISION_STATUS.RUN_COMPLETED,
    should_stop_run: status === SEND_DECISION_STATUS.RUN_STOPPED,
    policy,
    queue_id: queue.queue_id,
    run_id: run.run_id,
    package_id: queue.package_id || run.package_id,
    project_id: queue.project_id || run.project_id,
    active_item: activeItem,
    next_item: nextItem,
    wait_ms: Math.max(0, integerOr(source.wait_ms, 0)),
    reasons: Array.isArray(source.reasons) ? cloneJson(source.reasons, []) : [],
    required_routes: {
      delivery_route: policy.delivery_route,
      command_queue_route: policy.command_queue_route,
      panel_record_route: policy.panel_record_route,
      commander_queue_route: policy.commander_queue_route
    },
    delivery_request: null,
    metadata: cloneJson(source.metadata, {})
  };
}

function buildNextSendDecision(context) {
  const source = asObject(context);
  const policy = createSequentialPromptSender(source.policy || source.sender_policy || source.senderPolicy);
  const queue = normalizeQueue(source.queue);
  const run = normalizeRun(source.run, queue);
  const autosave = normalizeAutosave(source.autosave || source.autosave_status || source.autosaveStatus);
  const completion = normalizeCompletionDecision(source.completion || source.completion_decision || source.completionDecision);
  const retry = normalizeRetryDecision(source.retry || source.retry_decision || source.retryDecision);
  const delay = shouldWaitBeforeNextSend({ ...source, policy, run, queue });
  const activeItem = findActiveSentItem(queue);
  const nextItem = findNextSendableItem(queue);
  const counts = queueCounts(queue);
  const base = { policy, queue, run, active_item: activeItem, next_item: nextItem };

  if (RUN_TERMINAL_STATUSES.includes(run.status)) {
    const status = run.status === RUN_STATUS.COMPLETED
      ? SEND_DECISION_STATUS.RUN_COMPLETED
      : run.status === RUN_STATUS.STOPPED
        ? SEND_DECISION_STATUS.RUN_STOPPED
        : SEND_DECISION_STATUS.RUN_FAILED;
    return makeDecision(status, { ...base, reasons: [`run is terminal: ${run.status}`] });
  }

  if (QUEUE_TERMINAL_STATUSES.includes(queue.status)) {
    const status = queue.status === QUEUE_STATUS.COMPLETED
      ? SEND_DECISION_STATUS.RUN_COMPLETED
      : queue.status === QUEUE_STATUS.STOPPED
        ? SEND_DECISION_STATUS.RUN_STOPPED
        : SEND_DECISION_STATUS.RUN_FAILED;
    return makeDecision(status, { ...base, reasons: [`queue is terminal: ${queue.status}`] });
  }

  if (run.user_stop_requested || queue.stop_requested || run.status === RUN_STATUS.STOP_REQUESTED) {
    return makeDecision(SEND_DECISION_STATUS.RUN_STOPPED, { ...base, reasons: ['stop requested by run or queue state'] });
  }

  if (run.user_pause_requested || queue.pause_requested || run.status === RUN_STATUS.PAUSED || run.status === RUN_STATUS.PAUSE_REQUESTED || queue.status === QUEUE_STATUS.PAUSED) {
    return makeDecision(SEND_DECISION_STATUS.WAIT_PAUSED, { ...base, reasons: ['pause requested or queue is paused'] });
  }

  if (policy.block_when_panel_command_waiting && (run.panel_command_waiting || queue.panel_command_waiting)) {
    return makeDecision(SEND_DECISION_STATUS.WAIT_PAUSED, { ...base, reasons: ['explicit PANEL_COMMAND wait is active'] });
  }

  if (policy.require_autosave_before_send && (autosave.pending || autosave.error || autosave.stable === false)) {
    return makeDecision(SEND_DECISION_STATUS.WAIT_AUTOSAVE, { ...base, reasons: ['autosave is pending, unstable, or errored'] });
  }

  if (policy.block_on_manual_review && (retry.manual_review_required || retry.decision === RETRY_DECISION.MANUAL_REVIEW)) {
    return makeDecision(SEND_DECISION_STATUS.WAIT_MANUAL_REVIEW, { ...base, reasons: retry.reasons.length ? retry.reasons : ['retry policy requires manual review'] });
  }

  if (retry.should_retry && policy.allow_retry_delivery_request) {
    if (retry.retry_delay_ms > 0) {
      return makeDecision(SEND_DECISION_STATUS.WAIT_RETRY, { ...base, wait_ms: retry.retry_delay_ms, reasons: retry.reasons.length ? retry.reasons : ['retry delay required'] });
    }
    return makeDecision(SEND_DECISION_STATUS.SEND_READY, { ...base, next_item: activeItem || nextItem, reasons: retry.reasons.length ? retry.reasons : ['retry is ready'] });
  }

  if (activeItem && policy.require_completion_before_next) {
    if (completion.should_send_next || completion.is_complete) {
      return makeDecision(SEND_DECISION_STATUS.WAIT_COMPLETION, { ...base, reasons: ['active item is complete but queue item state has not been marked completed yet'] });
    }

    if (completion.status === COMPLETION_STATUS.UNKNOWN && policy.allow_send_when_completion_unknown) {
      return makeDecision(SEND_DECISION_STATUS.SEND_READY, { ...base, reasons: ['completion status unknown but policy allows send'] });
    }

    return makeDecision(SEND_DECISION_STATUS.WAIT_COMPLETION, { ...base, reasons: ['active sent item must complete before next send'] });
  }

  if (delay.should_wait) {
    return makeDecision(SEND_DECISION_STATUS.WAIT_DELAY, { ...base, wait_ms: delay.remaining_delay_ms, reasons: [delay.reason] });
  }

  if (!nextItem) {
    if (counts.total > 0 && counts.terminal >= counts.total) {
      return makeDecision(counts.failed > 0 ? SEND_DECISION_STATUS.RUN_FAILED : SEND_DECISION_STATUS.RUN_COMPLETED, { ...base, reasons: ['all queue items are terminal'] });
    }

    return makeDecision(SEND_DECISION_STATUS.NO_NEXT_ITEM, { ...base, reasons: ['no sendable queue item found'] });
  }

  if (!trimText(nextItem.body)) {
    return makeDecision(SEND_DECISION_STATUS.BLOCKED, { ...base, next_item: nextItem, reasons: ['next queue item body is empty'] });
  }

  if (!trimText(nextItem.target_slot_id)) {
    return makeDecision(SEND_DECISION_STATUS.BLOCKED, { ...base, next_item: nextItem, reasons: ['next queue item target_slot_id is empty'] });
  }

  return makeDecision(SEND_DECISION_STATUS.SEND_READY, { ...base, next_item: nextItem, reasons: ['next prompt queue item is ready for delivery request'] });
}

function buildPromptDeliveryRequest(decision) {
  const source = asObject(decision);
  const status = enumValue(source.status, SEND_DECISION_STATUS, SEND_DECISION_STATUS.BLOCKED);
  const item = asObject(source.next_item);
  const policy = createSequentialPromptSender(source.policy);

  if (status !== SEND_DECISION_STATUS.SEND_READY || !isPlainObject(source.next_item)) {
    return null;
  }

  const dispatchPacket = isPlainObject(item.dispatch_packet)
    ? cloneJson(item.dispatch_packet, {})
    : {
      packet_type: 'STAGE4_PROMPT_QUEUE_DISPATCH_PACKET',
      version: SCHEMA_VERSION,
      package_id: source.package_id,
      project_id: source.project_id,
      queue_id: source.queue_id,
      queue_item_id: item.queue_item_id,
      prompt_id: item.prompt_id,
      title: item.title,
      body: item.body,
      target_role: item.target_role,
      target_slot_id: item.target_slot_id,
      target_worker_id: item.target_worker_id,
      terminal: item.target_terminal || policy.target_terminal,
      source: 'PANEL',
      target: 'WORKER_INBOX',
      action: policy.delivery_action,
      route: policy.delivery_route,
      result_route: policy.panel_record_route,
      error_route: policy.commander_queue_route,
      payload: cloneJson(item.payload, {}),
      metadata: cloneJson(item.metadata, {})
    };

  return {
    object_type: DELIVERY_REQUEST_OBJECT_TYPE,
    schema_version: SCHEMA_VERSION,
    delivery_request_id: stableId('delivery_request', [source.decision_id, item.queue_item_id, item.prompt_id]),
    decision_id: source.decision_id,
    action: policy.delivery_action,
    route: policy.delivery_route,
    command_queue_route: policy.command_queue_route,
    result_route: policy.panel_record_route,
    error_route: policy.commander_queue_route,
    target_slot_id: item.target_slot_id,
    target_worker_id: item.target_worker_id,
    target_terminal: item.target_terminal || policy.target_terminal,
    queue_id: source.queue_id,
    run_id: source.run_id,
    package_id: source.package_id,
    prompt_id: item.prompt_id,
    queue_item_id: item.queue_item_id,
    body: item.body,
    dispatch_packet: dispatchPacket,
    execution_capability: 'none_direct_delivery_request_only',
    next_owner: 'WORKER_04_DELIVERY_ADAPTER'
  };
}

function summarizeSendDecision(decision) {
  const source = asObject(decision);
  const status = enumValue(source.status, SEND_DECISION_STATUS, SEND_DECISION_STATUS.BLOCKED);
  const item = asObject(source.next_item || source.active_item);

  return {
    object_type: SEND_DECISION_SUMMARY_OBJECT_TYPE,
    schema_version: SCHEMA_VERSION,
    decision_id: trimText(source.decision_id),
    status,
    should_send: status === SEND_DECISION_STATUS.SEND_READY,
    should_wait: Boolean(source.should_wait),
    should_complete_run: Boolean(source.should_complete_run),
    should_stop_run: Boolean(source.should_stop_run),
    wait_ms: Math.max(0, integerOr(source.wait_ms, 0)),
    queue_id: trimText(source.queue_id),
    run_id: trimText(source.run_id),
    queue_item_id: trimText(item.queue_item_id),
    prompt_id: trimText(item.prompt_id),
    target_slot_id: trimText(item.target_slot_id),
    reason_count: Array.isArray(source.reasons) ? source.reasons.length : 0,
    reasons: Array.isArray(source.reasons) ? cloneJson(source.reasons, []) : [],
    delivery_request_ready: status === SEND_DECISION_STATUS.SEND_READY && isPlainObject(source.next_item),
    next_owner: status === SEND_DECISION_STATUS.SEND_READY ? 'WORKER_04_DELIVERY_ADAPTER' : 'PANEL_QUEUE_CONTROLLER'
  };
}

module.exports = {
  SCHEMA_VERSION,
  SENDER_POLICY_OBJECT_TYPE,
  SEND_DECISION_OBJECT_TYPE,
  DELIVERY_REQUEST_OBJECT_TYPE,
  SEND_DECISION_SUMMARY_OBJECT_TYPE,
  SEND_DECISION_STATUS,
  QUEUE_STATUS,
  RUN_STATUS,
  PROMPT_SEND_STATUS,
  COMPLETION_STATUS,
  RETRY_DECISION,
  createSequentialPromptSender,
  buildNextSendDecision,
  buildPromptDeliveryRequest,
  shouldWaitBeforeNextSend,
  summarizeSendDecision
};