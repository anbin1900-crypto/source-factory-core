'use strict';

const DISPATCH_SEND_MODES = Object.freeze({
  MANUAL_PASTE_PLAN: 'MANUAL_PASTE_PLAN',
  WORKER_INBOX_PLAN: 'WORKER_INBOX_PLAN',
  PANEL_COMMAND_PLAN: 'PANEL_COMMAND_PLAN'
});

const ROUTE_TARGETS = Object.freeze({
  WORKER_INBOX: 'WORKER_INBOX',
  PANEL_COMMAND: 'PANEL_COMMAND',
  MANUAL_PANEL: 'MANUAL_PANEL'
});

const DISPATCH_STATUSES = Object.freeze({
  READY: 'READY',
  BLOCKED: 'BLOCKED'
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

function stableHash(input) {
  const text = String(input || '');
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function createDispatchId(queueItem, options) {
  const seed = [
    options.dispatch_batch_id,
    queueItem.prompt_id,
    queueItem.worker_id,
    queueItem.task_id,
    queueItem.send_order,
    queueItem.prompt_package_version
  ].join('|');

  return `dispatch_${stableHash(seed)}_${String(queueItem.send_order || 0).padStart(3, '0')}`;
}

function normalizeQueueItem(queueItem) {
  const source = isPlainObject(queueItem) ? queueItem : {};
  
  const metadataInput = source && source.metadata && typeof source.metadata === 'object' ? source.metadata : {};
const metadata = isPlainObject(source.metadata) ? Object.assign({}, source.metadata) : {};

  const workerSlot = toNonEmptyString(
    source.worker_slot ||
      source.workerSlot ||
      metadataInput.worker_slot ||
      metadataInput.workerSlot ||
      metadataInput.worker_id ||
      metadataInput.workerId ||
      source.slot ||
      source.worker_id ||
      source.workerId,
    ''
  );
const sendOrder = Number.isFinite(Number(source.send_order || source.sendOrder))
    ? Number(source.send_order || source.sendOrder)
    : 0;

  const promptText = typeof source.prompt_text === 'string'
    ? source.prompt_text
    : typeof source.promptText === 'string'
      ? source.promptText
      : '';

  const dedupeKey = toNonEmptyString(
    source.dedupe_key || source.dedupeKey,
    [
      toNonEmptyString(source.prompt_package_id || source.promptPackageId, ''),
      toNonEmptyString(source.prompt_package_version || source.promptPackageVersion, ''),
      workerSlot,
      toNonEmptyString(source.worker_id || source.workerId, ''),
      toNonEmptyString(source.task_id || source.taskId, ''),
      String(sendOrder),
      stableHash(promptText)
    ].join('::')
  );

  const alreadySent = source.already_sent === true ||
    source.alreadySent === true ||
    Boolean(source.sent_at || source.sentAt);

  return {
    prompt_id: toNonEmptyString(source.prompt_id || source.promptId, ''),
    prompt_package_id: toNonEmptyString(source.prompt_package_id || source.promptPackageId, ''),
    prompt_package_version: toNonEmptyString(source.prompt_package_version || source.promptPackageVersion, ''),
    worker_slot: workerSlot,
        workerSlot: workerSlot,
    created_by_commander: toNonEmptyString(
    source.created_by_commander ||
      source.createdByCommander ||
      metadataInput.created_by_commander ||
      metadataInput.createdByCommander,
    ''
  ),
createdByCommander: toNonEmptyString(
    source.created_by_commander ||
      source.createdByCommander ||
      metadataInput.created_by_commander ||
      metadataInput.createdByCommander,
    ''
  ),
worker_id: toNonEmptyString(source.worker_id || source.workerId, ''),
    task_id: toNonEmptyString(source.task_id || source.taskId, ''),
    worker_function_class: toNonEmptyString(source.worker_function_class || source.workerFunctionClass, ''),
    target_stage: toNonEmptyString(source.target_stage || source.targetStage, ''),
    terminal: toNonEmptyString(source.terminal || source.terminal_target || source.terminalTarget, 'PANEL'),
    target_window: toNonEmptyString(source.target_window || source.targetWindow || source.worker_window_id || source.workerWindowId, ''),
    title: toNonEmptyString(source.title, ''),
    route: toNonEmptyString(source.route, ''),
    command_route: toNonEmptyString(source.command_route || source.commandRoute, ''),
    route_target: toNonEmptyString(source.route_target || source.routeTarget, ''),
    panel_command_relevance: Boolean(source.panel_command_relevance || source.panelCommandRelevance),
    status: toNonEmptyString(source.status, ''),
    send_order: sendOrder,
    dedupe_key: dedupeKey,
    already_sent: alreadySent,
    retry_count: Number.isFinite(Number(source.retry_count || source.retryCount)) ? Number(source.retry_count || source.retryCount) : 0,
    prompt_text: promptText,
    payload: isPlainObject(source.payload) ? Object.assign({}, source.payload) : {},
    metadata
  };
}

function normalizeOptions(optionsInput) {
  const source = isPlainObject(optionsInput) ? optionsInput : {};
  const createdAt = toNonEmptyString(source.created_at || source.createdAt, nowIsoString());

  return {
    dispatch_batch_id: toNonEmptyString(source.dispatch_batch_id || source.dispatchBatchId, `dispatch_batch_${stableHash(createdAt)}`),
    default_send_mode: toNonEmptyString(source.default_send_mode || source.defaultSendMode, DISPATCH_SEND_MODES.MANUAL_PASTE_PLAN),
    default_route_target: toNonEmptyString(source.default_route_target || source.defaultRouteTarget, ROUTE_TARGETS.MANUAL_PANEL),
    default_target_window: toNonEmptyString(source.default_target_window || source.defaultTargetWindow, ''),
    created_at: createdAt,
    dry_run: source.dry_run !== false
  };
}

function resolveTargetWindow(queueItem, options) {
  if (queueItem.target_window) {
    return queueItem.target_window;
  }

  if (options.default_target_window) {
    return options.default_target_window;
  }

  if (queueItem.worker_id) {
    return `WORKER_WINDOW_${queueItem.worker_id}`;
  }

  return 'PANEL';
}

function resolveRouteTarget(queueItem, options) {
  if (queueItem.route_target) {
    return queueItem.route_target;
  }

  if (queueItem.command_route || queueItem.panel_command_relevance) {
    return ROUTE_TARGETS.WORKER_INBOX;
  }

  if (queueItem.route) {
    return queueItem.route;
  }

  return options.default_route_target;
}

function resolveSendMode(queueItem, options) {
  if (queueItem.command_route || queueItem.panel_command_relevance) {
    return DISPATCH_SEND_MODES.WORKER_INBOX_PLAN;
  }

  if (queueItem.route_target === ROUTE_TARGETS.PANEL_COMMAND) {
    return DISPATCH_SEND_MODES.PANEL_COMMAND_PLAN;
  }

  return options.default_send_mode;
}

function validateDispatchPayload(payload) {
  const errors = [];

  if (!payload.dispatchId) {
    errors.push('dispatchId is required');
  }

  if (!payload.promptId) {
    errors.push('promptId is required');
  }

  if (!payload.targetWindow) {
    errors.push('targetWindow is required');
  }

  if (!payload.promptText) {
    errors.push('promptText is required');
  }

  if (!payload.sendMode) {
    errors.push('sendMode is required');
  }

  if (!payload.routeTarget) {
    errors.push('routeTarget is required');
  }

  return errors;
}


/* ST4_W33_SEQUENTIAL_PROMPT_SENDER_PATCH_START */
function isPromptAlreadySentForDispatch(item) {
  const source = isPlainObject(item) ? item : {};
  return source.already_sent === true ||
    source.alreadySent === true ||
    Boolean(source.sent_at || source.sentAt) ||
    source.status === 'SENT' ||
    source.status === 'OUTPUT_WAITING' ||
    source.status === 'OUTPUT_RECEIVED' ||
    source.status === 'GATED' ||
    source.status === 'DONE';
}

function preventDuplicateSend(candidate, sentItems) {
  const nextPrompt = normalizeQueueItem(candidate);
  const list = Array.isArray(sentItems) ? sentItems.map(normalizeQueueItem) : [];
  const dedupeKey = toNonEmptyString(nextPrompt.dedupe_key, '');

  if (isPromptAlreadySentForDispatch(nextPrompt)) {
    return {
      ok: false,
      blocked: true,
      reason: 'candidate_already_sent',
      dedupe_key: dedupeKey,
      prompt_id: nextPrompt.prompt_id
    };
  }

  if (!dedupeKey) {
    return { ok: true, blocked: false, reason: 'dedupe_key_empty' };
  }

  const duplicate = list.find(function findDuplicate(item) {
    return item.dedupe_key === dedupeKey && isPromptAlreadySentForDispatch(item);
  });

  if (!duplicate) {
    return { ok: true, blocked: false, reason: 'no_duplicate_sent_item' };
  }

  return {
    ok: false,
    blocked: true,
    reason: 'duplicate_dedupe_key_already_sent',
    dedupe_key: dedupeKey,
    duplicate_prompt_id: duplicate.prompt_id
  };
}

function selectNextPrompt(queueInput, optionsInput) {
  const items = getQueueItems(queueInput).map(normalizeQueueItem);
  const options = isPlainObject(optionsInput) ? optionsInput : {};
  const sentItems = Array.isArray(options.sentItems) ? options.sentItems : items;

  const candidates = items
    .filter(function filterDispatchable(item) {
      return item.status === 'READY_TO_SEND' || item.status === 'QUEUED';
    })
    .filter(function filterNotSent(item) {
      return !isPromptAlreadySentForDispatch(item);
    })
    .sort(function sortBySendOrder(left, right) {
      if (left.send_order === right.send_order) {
        return String(left.prompt_id).localeCompare(String(right.prompt_id));
      }
      return left.send_order - right.send_order;
    });

  for (const candidate of candidates) {
    const duplicateCheck = preventDuplicateSend(candidate, sentItems);
    if (duplicateCheck.ok) {
      return {
        ok: true,
        prompt: candidate,
        reason: 'next_prompt_selected_by_send_order'
      };
    }
  }

  return {
    ok: false,
    prompt: null,
    reason: candidates.length > 0 ? 'all_candidates_blocked_by_duplicate_send' : 'no_unsent_dispatchable_prompt'
  };
}

function markPromptSent(queueItem, patchInput) {
  const item = normalizeQueueItem(queueItem);
  const patch = isPlainObject(patchInput) ? patchInput : {};
  const now = toNonEmptyString(patch.sent_at || patch.sentAt, nowIsoString());

  return Object.assign({}, item, {
    status: toNonEmptyString(patch.status, 'OUTPUT_WAITING'),
    already_sent: true,
    sent_at: now,
    updated_at: now,
    dispatch_ref: patch.dispatch_ref || patch.dispatchRef || item.dispatch_ref || null
  });
}
/* ST4_W33_SEQUENTIAL_PROMPT_SENDER_PATCH_END */


function buildSequentialPromptDispatch(queueItemInput, optionsInput) {
  const queueItem = normalizeQueueItem(queueItemInput);
  
  const queueMetadata = queueItem.metadata && typeof queueItem.metadata === 'object' ? queueItem.metadata : {};
const options = normalizeOptions(optionsInput);
  const warnings = [];
  const createdAt = nowIsoString();

  if (!queueItem.worker_id) {
    warnings.push('worker_id is empty; targetWindow fallback may be PANEL');
  }

  if (!queueItem.task_id) {
    warnings.push('task_id is empty');
  }

  if (!queueItem.prompt_text) {
    warnings.push('prompt_text is empty; dispatch payload will be blocked');
  }

  const payload = {
    dispatchId: createDispatchId(queueItem, options),
    promptId: queueItem.prompt_id,
    workerId: queueItem.worker_id,
    taskId: queueItem.task_id,
    targetWindow: resolveTargetWindow(queueItem, options),
    promptText: queueItem.prompt_text,
    sendMode: resolveSendMode(queueItem, options),
    routeTarget: resolveRouteTarget(queueItem, options),
    dispatchStatus: DISPATCH_STATUSES.READY,
    dryRun: true,
    actualSendPerformed: false,
    promptPackageId: queueItem.prompt_package_id,
    promptPackageVersion: queueItem.prompt_package_version,
    workerSlot: queueItem.worker_slot,
          worker_slot: queueItem.worker_slot || queueItem.workerSlot || queueMetadata.worker_slot || queueMetadata.workerSlot || queueItem.worker_id || queueItem.workerId || '',
      workerSlot: queueItem.worker_slot || queueItem.workerSlot || queueMetadata.worker_slot || queueMetadata.workerSlot || queueItem.worker_id || queueItem.workerId || '',
created_by_commander: queueItem.created_by_commander || queueItem.createdByCommander || queueMetadata.created_by_commander || queueMetadata.createdByCommander || '',
      createdByCommander: queueItem.created_by_commander || queueItem.createdByCommander || queueMetadata.created_by_commander || queueMetadata.createdByCommander || '',
createdByCommander: queueItem.created_by_commander || queueItem.createdByCommander || '',
dedupeKey: queueItem.dedupe_key,
    alreadySent: queueItem.already_sent,
    workerFunctionClass: queueItem.worker_function_class,
    targetStage: queueItem.target_stage,
    terminal: queueItem.terminal,
    sendOrder: queueItem.send_order,
    retryCount: queueItem.retry_count,
    title: queueItem.title,
    sourceStatus: queueItem.status,
    route: queueItem.route,
    commandRoute: queueItem.command_route,
    payload: Object.assign({}, queueItem.payload),
    metadata: Object.assign({}, queueItem.metadata),
    createdAt
  };

  const errors = validateDispatchPayload(payload);
  const duplicateCheck = preventDuplicateSend(queueItem, options.sentItems || options.sent_items || []);

  if (!duplicateCheck.ok) {
    errors.push(duplicateCheck.reason + ': ' + (duplicateCheck.dedupe_key || queueItem.prompt_id));
  }

  if (errors.length > 0) {
    payload.dispatchStatus = DISPATCH_STATUSES.BLOCKED;
  }

  return {
    ok: errors.length === 0,
    payload,
    errors,
    warnings
  };
}

function getQueueItems(queueInput) {
  if (Array.isArray(queueInput)) {
    return queueInput;
  }

  if (isPlainObject(queueInput) && Array.isArray(queueInput.items)) {
    return queueInput.items;
  }

  if (isPlainObject(queueInput) && isPlainObject(queueInput.queue) && Array.isArray(queueInput.queue.items)) {
    return queueInput.queue.items;
  }

  return [];
}

function isDispatchableStatus(status) {
  return status === 'READY_TO_SEND' || status === 'QUEUED';
}

function getNextDispatchCandidate(items) {
  const selected = selectNextPrompt(items, { sentItems: items });
  if (!selected.ok) {
    return null;
  }
  return selected.prompt;
}


/* ST4_W48_SELECTED_PROMPT_FIELD_MAPPING_PATCH_START */
function normalizeW48SelectedPromptFieldMapping(selectedPrompt, payload) {
  const prompt = selectedPrompt && typeof selectedPrompt === 'object' ? Object.assign({}, selectedPrompt) : {};
  const sourcePayload = payload && typeof payload === 'object' ? payload : {};
  const promptMetadata = prompt.metadata && typeof prompt.metadata === 'object' ? prompt.metadata : {};
  const payloadMetadata = sourcePayload.metadata && typeof sourcePayload.metadata === 'object' ? sourcePayload.metadata : {};
  function firstNonEmpty() {
    for (let index = 0; index < arguments.length; index += 1) {
      const value = arguments[index];
      if (value === 0) return '0';
      if (value === false) return 'false';
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return String(value);
      }
    }
    return '';
  }
  const workerSlot = firstNonEmpty(
    prompt.worker_slot,
    prompt.workerSlot,
    promptMetadata.worker_slot,
    promptMetadata.workerSlot,
    sourcePayload.worker_slot,
    sourcePayload.workerSlot,
    payloadMetadata.worker_slot,
    payloadMetadata.workerSlot,
    prompt.worker_id,
    prompt.workerId,
    sourcePayload.worker_id,
    sourcePayload.workerId
  );
  const createdByCommander = firstNonEmpty(
    prompt.created_by_commander,
    prompt.createdByCommander,
    promptMetadata.created_by_commander,
    promptMetadata.createdByCommander,
    sourcePayload.created_by_commander,
    sourcePayload.createdByCommander,
    payloadMetadata.created_by_commander,
    payloadMetadata.createdByCommander
  );
  return Object.assign({}, prompt, {
    worker_slot: workerSlot,
    workerSlot: workerSlot,
    created_by_commander: createdByCommander,
    createdByCommander: createdByCommander
  });
}
/* ST4_W48_SELECTED_PROMPT_FIELD_MAPPING_PATCH_END */

function getNextDispatchPayload(queueInput, optionsInput) {
  const items = getQueueItems(queueInput);
  const warnings = [];

  if (items.length === 0) {
    return {
      ok: false,
      payload: null,
      selectedPrompt: null,
      errors: [],
      warnings: ['queue has no items']
    };
  }

  const selected = selectNextPrompt(items, { sentItems: items });
  const selectedPrompt = selected.prompt;

  if (!selected.ok || !selectedPrompt) {
    return {
      ok: false,
      payload: null,
      selectedPrompt: null,
      errors: [],
      warnings: [selected.reason || 'no READY_TO_SEND or QUEUED prompt item exists']
    };
  }

  if (selectedPrompt.status === 'QUEUED') {
    warnings.push('selected prompt was QUEUED; sender helper treated it as next dispatch candidate without mutating queue');
  }

  const dispatch = buildSequentialPromptDispatch(selectedPrompt, Object.assign({}, optionsInput || {}, {
    sentItems: items
  }));

  return {
    ok: dispatch.ok,
    payload: dispatch.payload,
    selectedPrompt: normalizeW48SelectedPromptFieldMapping(selectedPrompt, dispatch && dispatch.payload ? dispatch.payload : optionsInput),
    errors: dispatch.errors,
    warnings: warnings.concat(dispatch.warnings)
  };
}

module.exports = {
  DISPATCH_SEND_MODES,
  ROUTE_TARGETS,
  DISPATCH_STATUSES,
  buildSequentialPromptDispatch,
  getNextDispatchPayload,
  selectNextPrompt,
  markPromptSent,
  preventDuplicateSend
};
/* SOURCE_FACTORY_W54_PROJECT_PANEL_NAMESPACE_METADATA_START */
(function sfW54InstallProjectPanelNamespaceMetadata() {
  if (typeof module === "undefined" || !module.exports) return;
  if (module.exports.__sfW54ProjectPanelNamespaceMetadataApplied_sequentialPromptSender) return;

  var helper = null;
  try {
    helper = require("./projectPanelIdentityHelper");
  } catch (error) {
    helper = null;
  }

  function hasOwn(objectValue, key) {
    return Object.prototype.hasOwnProperty.call(objectValue, key);
  }

  function pickIdentitySource(record, args) {
    if (record && typeof record === "object" && !Array.isArray(record)) {
      if (record.project_panel_identity || record.project_id || record.panel_id || record.panel_instance_id) return record.project_panel_identity || record;
    }
    if (Array.isArray(args)) {
      for (var index = 0; index < args.length; index += 1) {
        var candidate = args[index];
        if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
          if (candidate.project_panel_identity || candidate.project_id || candidate.panel_id || candidate.panel_instance_id) {
            return candidate.project_panel_identity || candidate;
          }
        }
      }
    }
    return null;
  }

  function buildNullIdentity(identitySource) {
    var source = identitySource && typeof identitySource === "object" && !Array.isArray(identitySource) ? identitySource : {};
    return {
      project_id: hasOwn(source, "project_id") ? source.project_id : null,
      project_name: hasOwn(source, "project_name") ? source.project_name : null,
      panel_id: hasOwn(source, "panel_id") ? source.panel_id : null,
      panel_instance_id: hasOwn(source, "panel_instance_id") ? source.panel_instance_id : null
    };
  }

  function safeAttachProjectPanelIdentityToRecord(record, identitySource) {
    try {
      if (!record || typeof record !== "object" || Array.isArray(record)) return record;
      var preserved = {};
      ["project_id", "project_name", "panel_id", "panel_instance_id", "project_panel_identity"].forEach(function preserve(key) {
        if (hasOwn(record, key)) preserved[key] = record[key];
      });

      var identity = buildNullIdentity(identitySource || record.project_panel_identity || record);
      var output = Object.assign({}, record);

      if (helper && typeof helper.attachProjectPanelIdentityToPayload === "function" && identitySource) {
        output = helper.attachProjectPanelIdentityToPayload(output, identitySource);
      }

      if (!hasOwn(output, "project_id")) output.project_id = identity.project_id;
      if (!hasOwn(output, "project_name")) output.project_name = identity.project_name;
      if (!hasOwn(output, "panel_id")) output.panel_id = identity.panel_id;
      if (!hasOwn(output, "panel_instance_id")) output.panel_instance_id = identity.panel_instance_id;
      if (!hasOwn(output, "project_panel_identity")) output.project_panel_identity = identity;

      Object.keys(preserved).forEach(function restore(key) {
        output[key] = preserved[key];
      });

      return output;
    } catch (error) {
      return record;
    }
  }

  function attachEnvelope(value, args) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    var identitySource = pickIdentitySource(value, args);
    var output = safeAttachProjectPanelIdentityToRecord(value, identitySource);
    ["selectedPrompt", "dispatch", "payload", "record", "batch", "summary", "handoff", "gate_handoff", "report"].forEach(function attachNested(key) {
      if (output && output[key] && typeof output[key] === "object" && !Array.isArray(output[key])) {
        var next = Object.assign({}, output);
        next[key] = safeAttachProjectPanelIdentityToRecord(output[key], identitySource || output);
        output = next;
      }
    });
    return output;
  }

  function wrapExport(exportName) {
    if (!module.exports || typeof module.exports[exportName] !== "function") return false;
    if (module.exports[exportName].__sfW54ProjectPanelNamespaceMetadataWrapped) return true;
    var original = module.exports[exportName];
    function wrappedW54ProjectPanelNamespaceMetadataFunction() {
      var args = Array.prototype.slice.call(arguments);
      var value = original.apply(this, args);
      return attachEnvelope(value, args);
    }
    Object.keys(original).forEach(function copyProp(key) {
      try { wrappedW54ProjectPanelNamespaceMetadataFunction[key] = original[key]; } catch (error) {}
    });
    Object.defineProperty(wrappedW54ProjectPanelNamespaceMetadataFunction, "__sfW54ProjectPanelNamespaceMetadataWrapped", { value: true, enumerable: false });
    module.exports[exportName] = wrappedW54ProjectPanelNamespaceMetadataFunction;
    return true;
  }

  var candidateExports = [
    "normalizeQueueItem",
    "buildSequentialPromptDispatch",
    "dispatchNextPrompt",
    "normalizeW48SelectedPromptFieldMapping",
    "selectNextPrompt"
  ];
  var wrappedExports = [];
  candidateExports.forEach(function wrapCandidate(exportName) {
    if (wrapExport(exportName)) wrappedExports.push(exportName);
  });

  Object.defineProperty(module.exports, "__sfW54ProjectPanelNamespaceMetadataApplied_sequentialPromptSender", { value: true, enumerable: false });
  module.exports.__sfW54ProjectPanelNamespaceMetadata = Object.assign({}, module.exports.__sfW54ProjectPanelNamespaceMetadata || {}, {
    version: "W54_PROJECT_PANEL_NAMESPACE_METADATA_COMMANDER_HOTFIX_V1",
    target_key: "sequentialPromptSender",
    scope: "selectedPrompt_or_dispatch_payload_record_envelope_only",
    helper_require: "./projectPanelIdentityHelper",
    candidate_exports: candidateExports,
    wrapped_exports: wrappedExports,
    metadata_fields: ["project_id", "project_name", "panel_id", "panel_instance_id", "project_panel_identity"],
    old_records_migration: "forbidden",
    legacy_records_without_project_id: "allowed"
  });
}());
/* SOURCE_FACTORY_W54_PROJECT_PANEL_NAMESPACE_METADATA_END */
