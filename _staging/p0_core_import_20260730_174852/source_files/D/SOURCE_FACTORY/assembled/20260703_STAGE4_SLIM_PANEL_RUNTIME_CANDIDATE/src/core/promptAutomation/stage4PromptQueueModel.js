'use strict';

/**
 * Stage 4 prompt queue model.
 * Pure model only: no file IO, no IPC, no renderer binding, no command execution.
 */

const SCHEMA_VERSION = 'stage4.prompt_queue_model.v1';
const QUEUE_OBJECT_TYPE = 'STAGE4_PROMPT_QUEUE';
const QUEUE_ITEM_OBJECT_TYPE = 'STAGE4_PROMPT_QUEUE_ITEM';
const DISPATCH_PACKET_TYPE = 'STAGE4_PROMPT_QUEUE_DISPATCH_PACKET';

const PROMPT_QUEUE_STATUS = Object.freeze({
  DRAFT: 'draft',
  READY: 'ready',
  RUNNING: 'running',
  PAUSED: 'paused',
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

const QUEUE_FAILURE_STRATEGY = Object.freeze({
  STOP_ON_FAILURE: 'stop_on_failure',
  CONTINUE_ON_FAILURE: 'continue_on_failure'
});

const DEFAULTS = Object.freeze({
  project_id: 'default_project',
  package_id: 'manual_prompt_package',
  target_role: 'WORKER',
  target_slot_id: 'AUTO_TARGET_SLOT',
  command_queue_route: 'COMMAND_QUEUE',
  worker_inbox_route: 'WORKER_INBOX',
  panel_record_route: 'PANEL_RECORD',
  commander_queue_route: 'COMMANDER_QUEUE',
  dispatch_action: 'SEND_PACKET_TO_WORKER'
});

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function obj(value) {
  return isObject(value) ? value : {};
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function textOr(value, fallback) {
  return text(value) || fallback;
}

function integerOr(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
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

function isoOrNow(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  const source = text(value);
  if (source) {
    const parsed = new Date(source);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
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

function enumValue(value, enumObject, fallback) {
  const source = text(value).toLowerCase();
  return Object.values(enumObject).includes(source) ? source : fallback;
}

function firstText(source, keys, fallback) {
  const data = obj(source);

  for (let index = 0; index < keys.length; index += 1) {
    const value = text(data[keys[index]]);
    if (value) {
      return value;
    }
  }

  return fallback;
}

function uniqueTextList(value) {
  const input = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[#,]/g)
      : [];
  const seen = new Set();
  const result = [];

  input.forEach((entry) => {
    const normalized = text(entry);
    const key = normalized.toLowerCase();
    if (normalized && !seen.has(key)) {
      seen.add(key);
      result.push(normalized);
    }
  });

  return result;
}

function commandQueueOptions(value, fallback) {
  const source = obj(value);
  const base = obj(fallback);

  return {
    enabled: source.enabled !== undefined ? source.enabled === true : base.enabled === true,
    route: textOr(source.route, base.route || DEFAULTS.command_queue_route),
    worker_inbox_route: textOr(source.worker_inbox_route, base.worker_inbox_route || DEFAULTS.worker_inbox_route),
    dispatch_action: textOr(source.dispatch_action || source.action, base.dispatch_action || DEFAULTS.dispatch_action),
    result_route: textOr(source.result_route, base.result_route || DEFAULTS.panel_record_route),
    error_route: textOr(source.error_route, base.error_route || DEFAULTS.commander_queue_route),
    payload_defaults: {
      ...cloneJson(base.payload_defaults, {}),
      ...cloneJson(source.payload_defaults, {})
    },
    metadata: {
      ...cloneJson(base.metadata, {}),
      ...cloneJson(source.metadata, {})
    }
  };
}

function sourceItems(promptPackage) {
  const pkg = obj(promptPackage);
  const candidates = [pkg.run_order, pkg.runOrder, pkg.queue_items, pkg.queueItems, pkg.prompts, pkg.items];
  const found = candidates.find((candidate) => Array.isArray(candidate));
  return found || [];
}

function dependencies(value) {
  if (!Array.isArray(value)) {
    return uniqueTextList(value).map((dependencyId) => ({
      dependency_id: dependencyId,
      required_status: PROMPT_SEND_STATUS.COMPLETED
    }));
  }

  return value
    .map((entry) => {
      if (isObject(entry)) {
        return {
          dependency_id: firstText(entry, ['dependency_id', 'dependencyId', 'queue_item_id', 'queueItemId', 'item_id', 'itemId', 'prompt_id', 'promptId'], ''),
          required_status: enumValue(entry.required_status || entry.requiredStatus, PROMPT_SEND_STATUS, PROMPT_SEND_STATUS.COMPLETED)
        };
      }

      return {
        dependency_id: text(entry),
        required_status: PROMPT_SEND_STATUS.COMPLETED
      };
    })
    .filter((entry) => entry.dependency_id);
}

function makeDispatchPacket(source, item, commandQueue) {
  const packet = cloneJson(source.dispatch_packet || source.dispatchPacket, null);

  if (isObject(packet)) {
    return {
      ...packet,
      queue_id: packet.queue_id || item.queue_id,
      queue_item_id: packet.queue_item_id || item.queue_item_id,
      prompt_id: packet.prompt_id || item.prompt_id,
      target_slot_id: packet.target_slot_id || packet.target_slot || item.target_slot_id,
      route: packet.route || commandQueue.worker_inbox_route,
      result_route: packet.result_route || commandQueue.result_route,
      error_route: packet.error_route || commandQueue.error_route
    };
  }

  return {
    packet_type: DISPATCH_PACKET_TYPE,
    version: SCHEMA_VERSION,
    package_id: item.package_id,
    project_id: item.project_id,
    queue_id: item.queue_id,
    queue_item_id: item.queue_item_id,
    prompt_id: item.prompt_id,
    title: item.title,
    body: item.body,
    target_role: item.target_role,
    target_slot_id: item.target_slot_id,
    target_worker_id: item.target_worker_id,
    source: 'PANEL',
    target: 'WORKER_INBOX',
    action: commandQueue.dispatch_action,
    route: commandQueue.worker_inbox_route,
    result_route: commandQueue.result_route,
    error_route: commandQueue.error_route,
    payload: {
      ...cloneJson(commandQueue.payload_defaults, {}),
      ...cloneJson(item.payload, {})
    },
    metadata: cloneJson(item.metadata, {})
  };
}

function queueItem(sourceValue, index, context) {
  const source = isObject(sourceValue) ? sourceValue : { body: String(sourceValue || '') };
  const promptId = firstText(source, ['prompt_id', 'promptId', 'id'], stableId('prompt', [context.queue_id, index + 1, source.title, source.body]));
  const sequenceNumber = integerOr(source.sequence_number || source.sequenceNumber || source.order_index || source.orderIndex, index + 1);
  const itemId = firstText(source, ['queue_item_id', 'queueItemId', 'item_id', 'itemId'], `${context.queue_id}:${String(sequenceNumber).padStart(4, '0')}:${promptId}`);
  const commandQueue = commandQueueOptions(source.command_queue || source.commandQueue, context.command_queue);
  const item = {
    object_type: QUEUE_ITEM_OBJECT_TYPE,
    schema_version: SCHEMA_VERSION,
    queue_item_id: itemId,
    item_id: itemId,
    queue_id: context.queue_id,
    package_id: context.package_id,
    project_id: context.project_id,
    package_prompt_id: firstText(source, ['package_prompt_id', 'packagePromptId'], ''),
    prompt_id: promptId,
    title: textOr(source.title, `Prompt ${index + 1}`),
    body: typeof source.body === 'string' ? source.body : '',
    sequence_number: sequenceNumber,
    order_index: integerOr(source.order_index || source.orderIndex, sequenceNumber),
    target_role: firstText(source, ['target_role', 'targetRole'], DEFAULTS.target_role),
    target_slot_id: firstText(source, ['target_slot_id', 'targetSlotId', 'target_slot', 'targetSlot', 'slot_id', 'slotId'], DEFAULTS.target_slot_id),
    target_worker_id: firstText(source, ['target_worker_id', 'targetWorkerId', 'worker_id', 'workerId'], ''),
    send_status: enumValue(source.send_status || source.sendStatus || source.status, PROMPT_SEND_STATUS, PROMPT_SEND_STATUS.PENDING),
    dependencies: dependencies(source.dependencies),
    attempts: Math.max(0, integerOr(source.attempts, 0)),
    max_attempts: Math.max(1, integerOr(source.max_attempts || source.maxAttempts, context.max_attempts)),
    command_queue: commandQueue,
    route: textOr(source.route, commandQueue.route),
    result_route: textOr(source.result_route, commandQueue.result_route),
    error_route: textOr(source.error_route, commandQueue.error_route),
    payload: cloneJson(source.payload, {}),
    result: cloneJson(source.result, null),
    failure_reason: cloneJson(source.failure_reason || source.failureReason, null),
    hold_reason: cloneJson(source.hold_reason || source.holdReason, null),
    created_at: isoOrNow(source.created_at || context.created_at),
    updated_at: isoOrNow(source.updated_at || source.updatedAt || source.created_at || context.created_at),
    sent_at: text(source.sent_at || source.sentAt),
    completed_at: text(source.completed_at || source.completedAt),
    failed_at: text(source.failed_at || source.failedAt),
    held_at: text(source.held_at || source.heldAt),
    metadata: cloneJson(source.metadata, {})
  };

  return {
    ...item,
    dispatch_packet: makeDispatchPacket(source, item, commandQueue)
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

function matchesItem(item, itemId) {
  const id = text(itemId);
  return Boolean(id) && [item.queue_item_id, item.item_id, item.prompt_id, item.package_prompt_id].includes(id);
}

function findItem(queue, itemId) {
  return queue.items.find((item) => matchesItem(item, itemId)) || null;
}

function dependenciesReady(queue, item) {
  return item.dependencies.every((dependency) => {
    const dependencyItem = findItem(queue, dependency.dependency_id);
    return Boolean(dependencyItem) && dependencyItem.send_status === dependency.required_status;
  });
}

function canSend(queue, item) {
  if (![PROMPT_SEND_STATUS.PENDING, PROMPT_SEND_STATUS.READY].includes(item.send_status)) {
    return false;
  }

  if ([PROMPT_QUEUE_STATUS.PAUSED, PROMPT_QUEUE_STATUS.COMPLETED, PROMPT_QUEUE_STATUS.FAILED, PROMPT_QUEUE_STATUS.ARCHIVED].includes(queue.status)) {
    return false;
  }

  if (queue.failure_strategy === QUEUE_FAILURE_STRATEGY.STOP_ON_FAILURE) {
    const failedEarlier = queue.items.some((candidate) => candidate.sequence_number < item.sequence_number && candidate.send_status === PROMPT_SEND_STATUS.FAILED);
    if (failedEarlier) {
      return false;
    }
  }

  return dependenciesReady(queue, item);
}

function nextIndex(queue) {
  if (!queue.items.length) {
    return -1;
  }

  const start = Math.max(0, Math.min(integerOr(queue.current_index, 0), queue.items.length - 1));

  for (let index = start; index < queue.items.length; index += 1) {
    if (canSend(queue, queue.items[index])) {
      return index;
    }
  }

  for (let index = 0; index < start; index += 1) {
    if (canSend(queue, queue.items[index])) {
      return index;
    }
  }

  return -1;
}

function summary(items) {
  return items.reduce((result, item) => {
    result.total += 1;
    result[item.send_status] = (result[item.send_status] || 0) + 1;
    return result;
  }, { total: 0 });
}

function calculatedStatus(queue, preferredStatus) {
  const preferred = enumValue(preferredStatus, PROMPT_QUEUE_STATUS, queue.status || PROMPT_QUEUE_STATUS.READY);

  if (preferred === PROMPT_QUEUE_STATUS.ARCHIVED || preferred === PROMPT_QUEUE_STATUS.PAUSED) {
    return preferred;
  }

  if (!queue.items.length) {
    return PROMPT_QUEUE_STATUS.DRAFT;
  }

  const hasFailed = queue.items.some((item) => item.send_status === PROMPT_SEND_STATUS.FAILED);
  const hasSent = queue.items.some((item) => item.send_status === PROMPT_SEND_STATUS.SENT);
  const hasHold = queue.items.some((item) => item.send_status === PROMPT_SEND_STATUS.HELD || item.send_status === PROMPT_SEND_STATUS.BLOCKED);
  const allTerminal = queue.items.every((item) => [PROMPT_SEND_STATUS.COMPLETED, PROMPT_SEND_STATUS.FAILED, PROMPT_SEND_STATUS.SKIPPED].includes(item.send_status));

  if (hasFailed && queue.failure_strategy === QUEUE_FAILURE_STRATEGY.STOP_ON_FAILURE) {
    return PROMPT_QUEUE_STATUS.FAILED;
  }

  if (allTerminal) {
    return hasFailed ? PROMPT_QUEUE_STATUS.FAILED : PROMPT_QUEUE_STATUS.COMPLETED;
  }

  if (hasSent) {
    return PROMPT_QUEUE_STATUS.RUNNING;
  }

  if (hasHold && nextIndex({ ...queue, status: PROMPT_QUEUE_STATUS.READY }) === -1) {
    return PROMPT_QUEUE_STATUS.PAUSED;
  }

  return PROMPT_QUEUE_STATUS.READY;
}

function refreshQueue(queue, preferredStatus) {
  const index = nextIndex(queue);
  const refreshed = {
    ...queue,
    current_index: index === -1 ? Math.min(queue.current_index, Math.max(0, queue.items.length - 1)) : index
  };
  refreshed.status = calculatedStatus(refreshed, preferredStatus);
  refreshed.summary = summary(refreshed.items);
  return refreshed;
}

function normalizeQueue(queue) {
  const source = obj(queue);
  const createdAt = isoOrNow(source.created_at);
  const queueId = textOr(source.queue_id || source.queueId || source.id, stableId('prompt_queue', [source.package_id, createdAt]));
  const commandQueue = commandQueueOptions(source.command_queue || source.commandQueue);
  const context = {
    queue_id: queueId,
    package_id: textOr(source.package_id || source.packageId, DEFAULTS.package_id),
    project_id: textOr(source.project_id || source.projectId, DEFAULTS.project_id),
    created_at: createdAt,
    command_queue: commandQueue,
    max_attempts: Math.max(1, integerOr(source.max_attempts || source.maxAttempts, 1))
  };
  const items = sortQueueItems((Array.isArray(source.items) ? source.items : []).map((item, index) => queueItem(item, index, context)));
  const normalized = {
    object_type: QUEUE_OBJECT_TYPE,
    schema_version: SCHEMA_VERSION,
    queue_id: queueId,
    package_id: context.package_id,
    project_id: context.project_id,
    title: textOr(source.title, 'Untitled prompt queue'),
    items,
    current_index: Math.max(0, integerOr(source.current_index || source.currentIndex, 0)),
    status: enumValue(source.status, PROMPT_QUEUE_STATUS, items.length ? PROMPT_QUEUE_STATUS.READY : PROMPT_QUEUE_STATUS.DRAFT),
    created_at: createdAt,
    updated_at: isoOrNow(source.updated_at || source.updatedAt || source.created_at),
    command_queue: commandQueue,
    failure_strategy: enumValue(source.failure_strategy || source.failureStrategy, QUEUE_FAILURE_STRATEGY, QUEUE_FAILURE_STRATEGY.STOP_ON_FAILURE),
    metadata: cloneJson(source.metadata, {})
  };

  return refreshQueue(normalized, normalized.status);
}

function createPromptQueue(promptPackage, options) {
  const pkg = obj(promptPackage);
  const opt = obj(options);
  const createdAt = isoOrNow(opt.created_at || pkg.created_at);
  const packageId = textOr(pkg.package_id || pkg.packageId || opt.package_id, DEFAULTS.package_id);
  const projectId = textOr(pkg.project_id || pkg.projectId || opt.project_id, DEFAULTS.project_id);
  const queueId = textOr(opt.queue_id || opt.queueId, stableId('prompt_queue', [packageId, projectId, createdAt]));
  const commandQueue = commandQueueOptions(opt.command_queue || opt.commandQueue || pkg.command_queue || pkg.commandQueue);
  const context = {
    queue_id: queueId,
    package_id: packageId,
    project_id: projectId,
    created_at: createdAt,
    command_queue: commandQueue,
    max_attempts: Math.max(1, integerOr(opt.max_attempts || opt.maxAttempts, 1))
  };
  const items = sortQueueItems(sourceItems(pkg).map((item, index) => queueItem(item, index, context)));
  const queue = {
    object_type: QUEUE_OBJECT_TYPE,
    schema_version: SCHEMA_VERSION,
    queue_id: queueId,
    package_id: packageId,
    project_id: projectId,
    title: textOr(opt.title || pkg.title, 'Untitled prompt queue'),
    items,
    current_index: Math.max(0, integerOr(opt.current_index || opt.currentIndex, 0)),
    status: enumValue(opt.status, PROMPT_QUEUE_STATUS, items.length ? PROMPT_QUEUE_STATUS.READY : PROMPT_QUEUE_STATUS.DRAFT),
    created_at: createdAt,
    updated_at: isoOrNow(opt.updated_at || opt.updatedAt || createdAt),
    command_queue: commandQueue,
    failure_strategy: enumValue(opt.failure_strategy || opt.failureStrategy, QUEUE_FAILURE_STRATEGY, QUEUE_FAILURE_STRATEGY.STOP_ON_FAILURE),
    metadata: {
      package_status: text(pkg.status),
      package_order_policy_type: text(pkg.order_policy && pkg.order_policy.type),
      ...cloneJson(opt.metadata, {})
    }
  };

  return refreshQueue(queue, queue.status);
}

function getNextPromptQueueItem(queue) {
  const normalized = normalizeQueue(queue);
  const index = nextIndex(normalized);
  return index === -1 ? null : cloneJson(normalized.items[index], null);
}

function updateItem(queue, itemId, patchFactory) {
  const normalized = normalizeQueue(queue);
  const index = normalized.items.findIndex((item) => matchesItem(item, itemId));
  const updatedAt = new Date().toISOString();

  if (index === -1) {
    return {
      ...normalized,
      updated_at: updatedAt,
      metadata: {
        ...cloneJson(normalized.metadata, {}),
        last_transition_error: `queue item not found: ${text(itemId)}`
      }
    };
  }

  const items = normalized.items.slice();
  items[index] = {
    ...items[index],
    ...patchFactory(items[index], updatedAt),
    updated_at: updatedAt
  };

  return refreshQueue({
    ...normalized,
    items,
    current_index: index,
    updated_at: updatedAt,
    metadata: {
      ...cloneJson(normalized.metadata, {}),
      last_transition_error: ''
    }
  }, normalized.status === PROMPT_QUEUE_STATUS.PAUSED ? PROMPT_QUEUE_STATUS.READY : normalized.status);
}

function markPromptItemSent(queue, itemId, at) {
  const sentAt = isoOrNow(at);

  return updateItem(queue, itemId, (item) => ({
    send_status: PROMPT_SEND_STATUS.SENT,
    attempts: item.attempts + 1,
    sent_at: sentAt,
    failure_reason: null,
    hold_reason: null
  }));
}

function markPromptItemCompleted(queue, itemId, result) {
  return updateItem(queue, itemId, () => ({
    send_status: PROMPT_SEND_STATUS.COMPLETED,
    completed_at: new Date().toISOString(),
    result: cloneJson(result, null),
    failure_reason: null,
    hold_reason: null
  }));
}

function markPromptItemFailed(queue, itemId, reason) {
  return updateItem(queue, itemId, () => ({
    send_status: PROMPT_SEND_STATUS.FAILED,
    failed_at: new Date().toISOString(),
    failure_reason: cloneJson(reason, String(reason || 'prompt item failed')),
    hold_reason: null
  }));
}

function markPromptItemHeld(queue, itemId, reason) {
  return updateItem(queue, itemId, () => ({
    send_status: PROMPT_SEND_STATUS.HELD,
    held_at: new Date().toISOString(),
    hold_reason: cloneJson(reason, String(reason || 'prompt item held'))
  }));
}

function releasePromptItemHold(queue, itemId) {
  return updateItem(queue, itemId, () => ({
    send_status: PROMPT_SEND_STATUS.PENDING,
    held_at: '',
    hold_reason: null
  }));
}

module.exports = {
  SCHEMA_VERSION,
  QUEUE_OBJECT_TYPE,
  QUEUE_ITEM_OBJECT_TYPE,
  DISPATCH_PACKET_TYPE,
  PROMPT_QUEUE_STATUS,
  PROMPT_SEND_STATUS,
  QUEUE_FAILURE_STRATEGY,
  createPromptQueue,
  getNextPromptQueueItem,
  markPromptItemSent,
  markPromptItemCompleted,
  markPromptItemFailed,
  markPromptItemHeld,
  releasePromptItemHold
};