'use strict';

const PROMPT_QUEUE_STATUSES = Object.freeze({
  QUEUED: 'QUEUED',
  READY_TO_SEND: 'READY_TO_SEND',
  SENT: 'SENT',
  OUTPUT_WAITING: 'OUTPUT_WAITING',
  OUTPUT_RECEIVED: 'OUTPUT_RECEIVED',
  GATED: 'GATED',
  DONE: 'DONE',
  ERROR: 'ERROR'
});

const TERMINAL_TYPES = Object.freeze({
  PANEL: 'PANEL',
  COMMANDER: 'COMMANDER',
  WORKER: 'WORKER',
  UNKNOWN: 'UNKNOWN'
});

function nowIsoString() {
  return new Date().toISOString();
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toNonEmptyString(value, fallback) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return fallback;
}

function normalizeStatus(status, fallback) {
  const normalized = toNonEmptyString(status, fallback || PROMPT_QUEUE_STATUSES.QUEUED);
  if (Object.prototype.hasOwnProperty.call(PROMPT_QUEUE_STATUSES, normalized)) {
    return normalized;
  }
  return fallback || PROMPT_QUEUE_STATUSES.QUEUED;
}

function stableHash(input) {
  const text = String(input || '');
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function createQueueId(seed, index) {
  const baseSeed = String(seed || `prompt_${index}`);
  return `pq_${stableHash(baseSeed)}_${String(index + 1).padStart(3, '0')}`;
}

function clonePromptItem(item) {
  if (!isPlainObject(item)) {
    return {};
  }

  return Object.assign({}, item);
}

function normalizePromptItem(item, index, queueContext) {
  const source = clonePromptItem(item);
  const idSeed = [
    queueContext.queue_id,
    source.prompt_id,
    source.prompt_package_id,
    source.task_id,
    source.worker_id,
    source.title,
    index
  ].join('|');

  const promptId = toNonEmptyString(source.prompt_id, createQueueId(idSeed, index));
  const terminalTarget = toNonEmptyString(
    source.terminal || source.terminal_target || queueContext.default_terminal,
    TERMINAL_TYPES.PANEL
  );

  const status = normalizeStatus(
    source.status,
    index === 0 ? PROMPT_QUEUE_STATUSES.READY_TO_SEND : PROMPT_QUEUE_STATUSES.QUEUED
  );

  return {
    prompt_id: promptId,
    prompt_package_id: toNonEmptyString(source.prompt_package_id, queueContext.prompt_package_id),
    prompt_package_version: toNonEmptyString(source.prompt_package_version, queueContext.prompt_package_version),
    worker_id: toNonEmptyString(source.worker_id, ''),
    task_id: toNonEmptyString(source.task_id, ''),
    worker_function_class: toNonEmptyString(source.worker_function_class, ''),
    target_stage: toNonEmptyString(source.target_stage, queueContext.target_stage),
    title: toNonEmptyString(source.title, `Prompt ${index + 1}`),
    terminal: terminalTarget,
    route: toNonEmptyString(source.route, ''),
    command_route: toNonEmptyString(source.command_route, ''),
    panel_command_relevance: Boolean(source.panel_command_relevance),
    status,
    send_order: Number.isFinite(Number(source.send_order)) ? Number(source.send_order) : index + 1,
    retry_count: Number.isFinite(Number(source.retry_count)) ? Number(source.retry_count) : 0,
    max_retry: Number.isFinite(Number(source.max_retry)) ? Number(source.max_retry) : queueContext.default_max_retry,
    prompt_text: typeof source.prompt_text === 'string' ? source.prompt_text : '',
    payload: isPlainObject(source.payload) ? Object.assign({}, source.payload) : {},
    output_ref: source.output_ref || null,
    gate_ref: source.gate_ref || null,
    error: source.error || null,
    created_at: toNonEmptyString(source.created_at, queueContext.created_at),
    updated_at: toNonEmptyString(source.updated_at, queueContext.created_at),
    sent_at: source.sent_at || null,
    output_received_at: source.output_received_at || null,
    gated_at: source.gated_at || null,
    done_at: source.done_at || null,
    metadata: isPlainObject(source.metadata) ? Object.assign({}, source.metadata) : {}
  };
}

function normalizeQueueContext(input) {
  const source = isPlainObject(input) ? input : {};
  const createdAt = toNonEmptyString(source.created_at, nowIsoString());

  return {
    queue_id: toNonEmptyString(source.queue_id, `prompt_queue_${stableHash(createdAt)}`),
    prompt_package_id: toNonEmptyString(source.prompt_package_id, 'STAGE4_PROMPT_PACKAGE'),
    prompt_package_version: toNonEmptyString(source.prompt_package_version, 'UNVERSIONED'),
    target_stage: toNonEmptyString(source.target_stage, 'STAGE4_CLASSIFIER_VALIDATION_PANEL_AUTOMATION'),
    default_terminal: toNonEmptyString(source.default_terminal || source.terminal, TERMINAL_TYPES.PANEL),
    default_max_retry: Number.isFinite(Number(source.default_max_retry)) ? Number(source.default_max_retry) : 1,
    created_at: createdAt,
    updated_at: toNonEmptyString(source.updated_at, createdAt),
    metadata: isPlainObject(source.metadata) ? Object.assign({}, source.metadata) : {}
  };
}

function summarizeQueue(items) {
  const summary = {
    total: items.length,
    by_status: {},
    by_terminal: {},
    by_worker: {},
    ready_to_send_count: 0,
    waiting_output_count: 0,
    error_count: 0,
    done_count: 0
  };

  items.forEach((item) => {
    summary.by_status[item.status] = (summary.by_status[item.status] || 0) + 1;
    summary.by_terminal[item.terminal] = (summary.by_terminal[item.terminal] || 0) + 1;

    if (item.worker_id) {
      summary.by_worker[item.worker_id] = (summary.by_worker[item.worker_id] || 0) + 1;
    }

    if (item.status === PROMPT_QUEUE_STATUSES.READY_TO_SEND) {
      summary.ready_to_send_count += 1;
    }

    if (item.status === PROMPT_QUEUE_STATUSES.OUTPUT_WAITING) {
      summary.waiting_output_count += 1;
    }

    if (item.status === PROMPT_QUEUE_STATUSES.ERROR) {
      summary.error_count += 1;
    }

    if (item.status === PROMPT_QUEUE_STATUSES.DONE) {
      summary.done_count += 1;
    }
  });

  return summary;
}

function validatePromptItem(item, index) {
  const errors = [];

  if (!item.prompt_id) {
    errors.push(`items[${index}].prompt_id is required`);
  }

  if (!item.prompt_package_version) {
    errors.push(`items[${index}].prompt_package_version is required`);
  }

  if (!item.status) {
    errors.push(`items[${index}].status is required`);
  }

  if (!Object.prototype.hasOwnProperty.call(PROMPT_QUEUE_STATUSES, item.status)) {
    errors.push(`items[${index}].status is invalid: ${item.status}`);
  }

  if (!Number.isFinite(Number(item.send_order))) {
    errors.push(`items[${index}].send_order must be a number`);
  }

  return errors;
}

function validateQueueItems(items) {
  const errors = [];
  const seenPromptIds = new Set();

  items.forEach((item, index) => {
    errors.push(...validatePromptItem(item, index));

    if (seenPromptIds.has(item.prompt_id)) {
      errors.push(`items[${index}].prompt_id is duplicated: ${item.prompt_id}`);
    }

    seenPromptIds.add(item.prompt_id);
  });

  return errors;
}

function createPromptQueue(input) {
  const source = isPlainObject(input) ? input : {};
  const context = normalizeQueueContext(source);
  const rawItems = Array.isArray(source.items) ? source.items : [];
  const warnings = [];
  const errors = [];

  if (!Array.isArray(source.items)) {
    warnings.push('input.items was not an array; an empty queue was created');
  }

  const items = rawItems
    .map((item, index) => normalizePromptItem(item, index, context))
    .sort((a, b) => {
      if (a.send_order === b.send_order) {
        return String(a.prompt_id).localeCompare(String(b.prompt_id));
      }
      return a.send_order - b.send_order;
    });

  errors.push(...validateQueueItems(items));

  const queue = {
    queue_id: context.queue_id,
    prompt_package_id: context.prompt_package_id,
    prompt_package_version: context.prompt_package_version,
    target_stage: context.target_stage,
    default_terminal: context.default_terminal,
    status_set: Object.assign({}, PROMPT_QUEUE_STATUSES),
    items,
    summary: summarizeQueue(items),
    warnings,
    errors,
    created_at: context.created_at,
    updated_at: context.updated_at,
    metadata: context.metadata
  };

  return {
    ok: errors.length === 0,
    queue,
    summary: queue.summary,
    errors,
    warnings
  };
}

function getQueueItems(queue) {
  if (!isPlainObject(queue) || !Array.isArray(queue.items)) {
    return [];
  }

  return queue.items;
}

function cloneQueue(queue) {
  if (!isPlainObject(queue)) {
    return createPromptQueue({ items: [] }).queue;
  }

  const cloned = Object.assign({}, queue);
  cloned.items = getQueueItems(queue).map((item) => Object.assign({}, item));
  cloned.warnings = Array.isArray(queue.warnings) ? queue.warnings.slice() : [];
  cloned.errors = Array.isArray(queue.errors) ? queue.errors.slice() : [];
  cloned.summary = isPlainObject(queue.summary) ? Object.assign({}, queue.summary) : summarizeQueue(cloned.items);
  return cloned;
}

function findLastSendOrder(items) {
  return items.reduce((max, item) => {
    const order = Number(item.send_order);
    return Number.isFinite(order) && order > max ? order : max;
  }, 0);
}

function promoteNextQueuedPrompt(items) {
  const hasReadyPrompt = items.some((item) => item.status === PROMPT_QUEUE_STATUSES.READY_TO_SEND);

  if (hasReadyPrompt) {
    return items;
  }

  const nextQueued = items
    .filter((item) => item.status === PROMPT_QUEUE_STATUSES.QUEUED)
    .sort((a, b) => a.send_order - b.send_order)[0];

  if (nextQueued) {
    nextQueued.status = PROMPT_QUEUE_STATUSES.READY_TO_SEND;
    nextQueued.updated_at = nowIsoString();
  }

  return items;
}

function enqueuePrompt(queue, promptInput) {
  const nextQueue = cloneQueue(queue);
  const now = nowIsoString();
  const items = getQueueItems(nextQueue);
  const nextOrder = findLastSendOrder(items) + 1;

  const context = {
    queue_id: toNonEmptyString(nextQueue.queue_id, `prompt_queue_${stableHash(now)}`),
    prompt_package_id: toNonEmptyString(nextQueue.prompt_package_id, 'STAGE4_PROMPT_PACKAGE'),
    prompt_package_version: toNonEmptyString(nextQueue.prompt_package_version, 'UNVERSIONED'),
    target_stage: toNonEmptyString(nextQueue.target_stage, 'STAGE4_CLASSIFIER_VALIDATION_PANEL_AUTOMATION'),
    default_terminal: toNonEmptyString(nextQueue.default_terminal, TERMINAL_TYPES.PANEL),
    default_max_retry: 1,
    created_at: now
  };

  const prompt = normalizePromptItem(
    Object.assign({}, isPlainObject(promptInput) ? promptInput : {}, {
      send_order: Number.isFinite(Number(promptInput && promptInput.send_order)) ? Number(promptInput.send_order) : nextOrder,
      status: promptInput && promptInput.status ? promptInput.status : PROMPT_QUEUE_STATUSES.QUEUED,
      created_at: promptInput && promptInput.created_at ? promptInput.created_at : now,
      updated_at: now
    }),
    items.length,
    context
  );

  if (items.some((item) => item.prompt_id === prompt.prompt_id)) {
    return {
      ok: false,
      queue: nextQueue,
      prompt: null,
      errors: [`prompt_id is duplicated: ${prompt.prompt_id}`],
      warnings: []
    };
  }

  items.push(prompt);
  items.sort((a, b) => a.send_order - b.send_order);
  promoteNextQueuedPrompt(items);

  nextQueue.items = items;
  nextQueue.summary = summarizeQueue(items);
  nextQueue.updated_at = now;
  nextQueue.errors = validateQueueItems(items);

  return {
    ok: nextQueue.errors.length === 0,
    queue: nextQueue,
    prompt,
    errors: nextQueue.errors,
    warnings: []
  };
}

function dequeueNextPrompt(queue) {
  const nextQueue = cloneQueue(queue);
  const now = nowIsoString();
  const items = promoteNextQueuedPrompt(getQueueItems(nextQueue));

  const nextPrompt = items
    .filter((item) => item.status === PROMPT_QUEUE_STATUSES.READY_TO_SEND)
    .sort((a, b) => a.send_order - b.send_order)[0];

  if (!nextPrompt) {
    nextQueue.items = items;
    nextQueue.summary = summarizeQueue(items);
    nextQueue.updated_at = now;

    return {
      ok: false,
      queue: nextQueue,
      prompt: null,
      errors: [],
      warnings: ['no READY_TO_SEND prompt exists']
    };
  }

  nextPrompt.status = PROMPT_QUEUE_STATUSES.OUTPUT_WAITING;
  nextPrompt.sent_at = now;
  nextPrompt.updated_at = now;

  nextQueue.items = items;
  nextQueue.summary = summarizeQueue(items);
  nextQueue.updated_at = now;
  nextQueue.errors = validateQueueItems(items);

  return {
    ok: nextQueue.errors.length === 0,
    queue: nextQueue,
    prompt: Object.assign({}, nextPrompt),
    errors: nextQueue.errors,
    warnings: []
  };
}

function applyStatusSideEffects(item, status, patch, now) {
  if (status === PROMPT_QUEUE_STATUSES.SENT || status === PROMPT_QUEUE_STATUSES.OUTPUT_WAITING) {
    item.sent_at = item.sent_at || now;
  }

  if (status === PROMPT_QUEUE_STATUSES.OUTPUT_RECEIVED) {
    item.output_received_at = item.output_received_at || now;
    item.output_ref = patch.output_ref || item.output_ref || null;
  }

  if (status === PROMPT_QUEUE_STATUSES.GATED) {
    item.gated_at = item.gated_at || now;
    item.gate_ref = patch.gate_ref || item.gate_ref || null;
  }

  if (status === PROMPT_QUEUE_STATUSES.DONE) {
    item.done_at = item.done_at || now;
  }

  if (status === PROMPT_QUEUE_STATUSES.ERROR) {
    item.error = patch.error || item.error || 'Prompt status marked as ERROR';
  }
}

function markPromptStatus(queue, promptId, nextStatus, patchInput) {
  const nextQueue = cloneQueue(queue);
  const now = nowIsoString();
  const items = getQueueItems(nextQueue);
  const normalizedPromptId = toNonEmptyString(promptId, '');
  const status = normalizeStatus(nextStatus, '');
  const patch = isPlainObject(patchInput) ? patchInput : {};
  const warnings = [];
  const errors = [];

  if (!normalizedPromptId) {
    errors.push('promptId is required');
  }

  if (!status) {
    errors.push(`nextStatus is invalid: ${nextStatus}`);
  }

  const target = items.find((item) => item.prompt_id === normalizedPromptId);

  if (!target) {
    errors.push(`prompt not found: ${normalizedPromptId}`);
  }

  if (errors.length > 0) {
    return {
      ok: false,
      queue: nextQueue,
      prompt: null,
      errors,
      warnings
    };
  }

  target.status = status;
  target.updated_at = now;

  if (Number.isFinite(Number(patch.retry_count))) {
    target.retry_count = Number(patch.retry_count);
  }

  if (patch.output_ref !== undefined) {
    target.output_ref = patch.output_ref;
  }

  if (patch.gate_ref !== undefined) {
    target.gate_ref = patch.gate_ref;
  }

  if (patch.error !== undefined) {
    target.error = patch.error;
  }

  if (isPlainObject(patch.metadata)) {
    target.metadata = Object.assign({}, target.metadata, patch.metadata);
  }

  applyStatusSideEffects(target, status, patch, now);
  promoteNextQueuedPrompt(items);

  nextQueue.items = items;
  nextQueue.summary = summarizeQueue(items);
  nextQueue.updated_at = now;
  nextQueue.errors = validateQueueItems(items);

  return {
    ok: nextQueue.errors.length === 0,
    queue: nextQueue,
    prompt: Object.assign({}, target),
    errors: nextQueue.errors,
    warnings
  };
}

module.exports = {
  PROMPT_QUEUE_STATUSES,
  TERMINAL_TYPES,
  createPromptQueue,
  enqueuePrompt,
  dequeueNextPrompt,
  markPromptStatus
};