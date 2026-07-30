"use strict";

/**
 * Stage 4 Taera resource queue model.
 *
 * This module manages DOWNLOAD_RESOURCE and FILE_BATCH candidates as
 * JSON-serializable queue records for Taera display and Panel gate workflows.
 * It never downloads, opens files, runs commands, executes installers, or
 * touches the filesystem.
 */

const MODEL_OBJECT_TYPE = "TAERA_RESOURCE_QUEUE";
const QUEUE_ITEM_OBJECT_TYPE = "TAERA_RESOURCE_QUEUE_ITEM";
const MODEL_SCHEMA_VERSION = "stage4.taera_resource_queue.v1";

const TAERA_QUEUE_STATUS = Object.freeze({
  EMPTY: "EMPTY",
  READY: "READY",
  DOWNLOAD_READY: "DOWNLOAD_READY",
  READINESS_REQUIRED: "READINESS_REQUIRED",
  VALIDATION_READY: "VALIDATION_READY",
  PANEL_COMMAND_WAITING: "PANEL_COMMAND_WAITING",
  APPROVAL_REQUIRED: "APPROVAL_REQUIRED",
  ERROR: "ERROR"
});

const TAERA_QUEUE_ITEM_STATUS = Object.freeze({
  QUEUED: "QUEUED",
  DOWNLOAD_READY: "DOWNLOAD_READY",
  READINESS_REQUIRED: "READINESS_REQUIRED",
  VALIDATION_READY: "VALIDATION_READY",
  PANEL_COMMAND_WAITING: "PANEL_COMMAND_WAITING",
  APPROVAL_REQUIRED: "APPROVAL_REQUIRED",
  INVALID: "INVALID",
  IGNORED: "IGNORED",
  ERROR: "ERROR"
});

const TAERA_QUEUE_ITEM_KIND = Object.freeze({
  DOWNLOAD_RESOURCE: "DOWNLOAD_RESOURCE",
  FILE_BATCH: "FILE_BATCH",
  PANEL_COMMAND: "PANEL_COMMAND",
  UNKNOWN: "UNKNOWN"
});

const PANEL_COMMAND_REQUIRED_STATUSES = Object.freeze([
  "PANEL_COMMAND_REQUIRED",
  "RUN_APPROVAL_REQUIRED",
  "INSTALLER_APPROVAL_REQUIRED",
  "APPROVAL_REQUIRED"
]);

const EXECUTION_LIKE_RESOURCE_TYPES = Object.freeze([
  "INSTALLER",
  "SCRIPT",
  "COMMAND"
]);

function createTaeraResourceQueue(input) {
  const source = isPlainObject(input) ? input : {};
  const createdAt = normalizeIsoString(source.created_at) || new Date().toISOString();
  const initialItems = normalizeInitialItems(source.items || source.queue_items || [], source);
  const queue = pruneUndefined({
    object_type: MODEL_OBJECT_TYPE,
    schema_version: MODEL_SCHEMA_VERSION,
    taera_queue_id: normalizeString(source.taera_queue_id || source.queue_id || source.id) || createQueueId(source, createdAt),
    project_id: normalizeString(source.project_id),
    slot_id: normalizeString(source.slot_id),
    prompt_id: normalizeString(source.prompt_id),
    taeo_output_id: normalizeString(source.taeo_output_id),
    taera_output_id: normalizeString(source.taera_output_id),
    status: TAERA_QUEUE_STATUS.EMPTY,
    status_reason: "queue_created",
    items: initialItems,
    panel_command_waiting_items: [],
    created_at: createdAt,
    updated_at: createdAt,
    actual_download_performed: false,
    actual_run_performed: false,
    actual_file_access_performed: false,
    panel_control: buildPanelControl(source),
    trace: buildTrace(source, createdAt),
    metadata: toJsonSafe(source.metadata || null),
    status_history: buildInitialStatusHistory(createdAt, source)
  });

  return refreshQueue(queue, "createTaeraResourceQueue");
}

function enqueueDownloadResources(queue, resources) {
  const next = createTaeraResourceQueue(queue);
  const list = Array.isArray(resources) ? resources : [];
  const addedAt = new Date().toISOString();

  list.forEach(function eachResource(resource, index) {
    const item = createQueueItemFromDownloadResource(resource, next, index, addedAt);
    addQueueItem(next, item);
  });

  next.updated_at = addedAt;
  next.status_history = appendStatusHistory(next.status_history, {
    status: next.status,
    previous_status: next.status,
    reason: "download_resources_enqueued",
    at: addedAt,
    actor: "stage4TaeraResourceQueue.enqueueDownloadResources",
    count: list.length
  });

  return refreshQueue(next, "enqueueDownloadResources");
}

function enqueueFileBatch(queue, batch) {
  const next = createTaeraResourceQueue(queue);
  const addedAt = new Date().toISOString();
  const item = createQueueItemFromFileBatch(batch, next, addedAt);

  addQueueItem(next, item);
  next.updated_at = addedAt;
  next.status_history = appendStatusHistory(next.status_history, {
    status: next.status,
    previous_status: next.status,
    reason: "file_batch_enqueued",
    at: addedAt,
    actor: "stage4TaeraResourceQueue.enqueueFileBatch",
    count: 1
  });

  return refreshQueue(next, "enqueueFileBatch");
}

function markTaeraQueueItemApprovalRequired(queue, itemId, reason) {
  const next = createTaeraResourceQueue(queue);
  const targetId = normalizeString(itemId);
  const approvalReason = normalizeString(reason) || "panel_command_or_run_approval_required";
  const changedAt = new Date().toISOString();
  let matched = false;

  next.items = next.items.map(function mapItem(item) {
    if (item.queue_item_id !== targetId) {
      return item;
    }

    matched = true;
    const previousStatus = item.status;
    return Object.assign({}, item, {
      status: TAERA_QUEUE_ITEM_STATUS.APPROVAL_REQUIRED,
      status_reason: approvalReason,
      panel_command_required: true,
      panel_command_required_reason: approvalReason,
      actual_download_performed: false,
      actual_run_performed: false,
      updated_at: changedAt,
      status_history: appendStatusHistory(item.status_history, {
        status: TAERA_QUEUE_ITEM_STATUS.APPROVAL_REQUIRED,
        previous_status: previousStatus,
        reason: approvalReason,
        at: changedAt,
        actor: "stage4TaeraResourceQueue.markTaeraQueueItemApprovalRequired"
      })
    });
  });

  next.updated_at = changedAt;
  next.status_history = appendStatusHistory(next.status_history, {
    status: matched ? TAERA_QUEUE_STATUS.APPROVAL_REQUIRED : next.status,
    previous_status: next.status,
    reason: matched ? approvalReason : "queue_item_id_not_found",
    at: changedAt,
    actor: "stage4TaeraResourceQueue.markTaeraQueueItemApprovalRequired",
    queue_item_id: targetId
  });

  return refreshQueue(next, "markTaeraQueueItemApprovalRequired");
}

function summarizeTaeraQueue(queue) {
  const normalized = createTaeraResourceQueue(queue);
  const countsByStatus = {};
  const countsByKind = {};

  normalized.items.forEach(function eachItem(item) {
    const status = normalizeString(item.status) || TAERA_QUEUE_ITEM_STATUS.QUEUED;
    const kind = normalizeString(item.kind) || TAERA_QUEUE_ITEM_KIND.UNKNOWN;
    countsByStatus[status] = (countsByStatus[status] || 0) + 1;
    countsByKind[kind] = (countsByKind[kind] || 0) + 1;
  });

  return {
    object_type: "TAERA_RESOURCE_QUEUE_SUMMARY",
    schema_version: MODEL_SCHEMA_VERSION,
    taera_queue_id: normalized.taera_queue_id,
    project_id: normalized.project_id,
    slot_id: normalized.slot_id,
    status: normalized.status,
    status_reason: normalized.status_reason,
    item_count: normalized.items.length,
    download_resource_count: countsByKind[TAERA_QUEUE_ITEM_KIND.DOWNLOAD_RESOURCE] || 0,
    file_batch_count: countsByKind[TAERA_QUEUE_ITEM_KIND.FILE_BATCH] || 0,
    panel_command_waiting_count: normalized.panel_command_waiting_items.length,
    download_ready_count: countsByStatus[TAERA_QUEUE_ITEM_STATUS.DOWNLOAD_READY] || 0,
    readiness_required_count: countsByStatus[TAERA_QUEUE_ITEM_STATUS.READINESS_REQUIRED] || 0,
    validation_ready_count: countsByStatus[TAERA_QUEUE_ITEM_STATUS.VALIDATION_READY] || 0,
    approval_required_count: countsByStatus[TAERA_QUEUE_ITEM_STATUS.APPROVAL_REQUIRED] || 0,
    counts_by_status: countsByStatus,
    counts_by_kind: countsByKind,
    actual_download_performed: false,
    actual_run_performed: false,
    actual_file_access_performed: false,
    next_panel_action: chooseNextPanelAction(normalized)
  };
}

function refreshQueue(queue, actor) {
  const next = cloneJson(queue);
  next.items = Array.isArray(next.items) ? next.items.map(serializeQueueItem) : [];
  next.panel_command_waiting_items = next.items.filter(function filterWaiting(item) {
    return item.panel_command_required === true ||
      item.status === TAERA_QUEUE_ITEM_STATUS.PANEL_COMMAND_WAITING ||
      item.status === TAERA_QUEUE_ITEM_STATUS.APPROVAL_REQUIRED;
  }).map(function mapWaiting(item) {
    return {
      queue_item_id: item.queue_item_id,
      kind: item.kind,
      status: item.status,
      title: item.title,
      reference_id: item.reference_id,
      panel_command_required_reason: item.panel_command_required_reason || item.status_reason
    };
  });

  const previousStatus = normalizeString(next.status) || TAERA_QUEUE_STATUS.EMPTY;
  const computed = computeQueueStatus(next.items);
  next.status = computed.status;
  next.status_reason = computed.reason;
  next.actual_download_performed = false;
  next.actual_run_performed = false;
  next.actual_file_access_performed = false;
  next.summary = summarizeQueueWithoutRecursion(next);

  if (actor && previousStatus !== next.status) {
    next.status_history = appendStatusHistory(next.status_history, {
      status: next.status,
      previous_status: previousStatus,
      reason: next.status_reason,
      at: new Date().toISOString(),
      actor: "stage4TaeraResourceQueue." + actor
    });
  }

  return pruneUndefined(next);
}

function normalizeInitialItems(items, queueSource) {
  if (!Array.isArray(items)) {
    return [];
  }

  const result = [];
  items.forEach(function eachItem(item, index) {
    const normalized = normalizeQueueItem(item, queueSource, index);
    if (normalized.queue_item_id) {
      result.push(normalized);
    }
  });
  return dedupeItems(result);
}

function addQueueItem(queue, item) {
  if (!Array.isArray(queue.items)) {
    queue.items = [];
  }

  const dedupeKey = createItemDedupeKey(item);
  const exists = queue.items.some(function someExisting(existing) {
    return createItemDedupeKey(existing) === dedupeKey;
  });

  if (!exists) {
    queue.items.push(serializeQueueItem(item));
  }
}

function createQueueItemFromDownloadResource(resource, queue, index, addedAt) {
  const raw = isPlainObject(resource) ? resource : { url: resource };
  const referenceId = normalizeString(raw.download_resource_id || raw.resource_id || raw.id) || createReferenceId(raw, index);
  const title = normalizeString(raw.title || raw.expected_filename || raw.filename || raw.url);
  const itemStatus = chooseQueueItemStatusFromResource(raw);
  const panelCommandRequired = itemRequiresPanelCommand(raw, itemStatus);

  return serializeQueueItem({
    object_type: QUEUE_ITEM_OBJECT_TYPE,
    schema_version: MODEL_SCHEMA_VERSION,
    queue_item_id: normalizeString(raw.queue_item_id) || createQueueItemId(queue, TAERA_QUEUE_ITEM_KIND.DOWNLOAD_RESOURCE, referenceId, index),
    kind: TAERA_QUEUE_ITEM_KIND.DOWNLOAD_RESOURCE,
    reference_id: referenceId,
    download_resource_id: referenceId,
    file_batch_id: "",
    title: title,
    url: normalizeString(raw.url),
    expected_filename: normalizeString(raw.expected_filename || raw.filename),
    resource_type: normalizeString(raw.resource_type || raw.resourceType || "UNKNOWN"),
    status: itemStatus,
    status_reason: createItemStatusReason(itemStatus, raw),
    panel_command_required: panelCommandRequired,
    panel_command_required_reason: panelCommandRequired
      ? normalizeString(raw.panel_command_required_reason || raw.download_status_reason || raw.status_reason) || "download_resource_requires_panel_command"
      : "",
    validation_ready: itemStatus === TAERA_QUEUE_ITEM_STATUS.VALIDATION_READY,
    readiness_required: itemStatus === TAERA_QUEUE_ITEM_STATUS.READINESS_REQUIRED,
    download_ready: itemStatus === TAERA_QUEUE_ITEM_STATUS.DOWNLOAD_READY,
    actual_download_performed: false,
    actual_run_performed: false,
    actual_file_access_performed: false,
    created_at: addedAt,
    updated_at: addedAt,
    payload: toJsonSafe(raw),
    status_history: [{
      status: itemStatus,
      previous_status: null,
      reason: createItemStatusReason(itemStatus, raw),
      at: addedAt,
      actor: "stage4TaeraResourceQueue.createQueueItemFromDownloadResource"
    }]
  });
}

function createQueueItemFromFileBatch(batch, queue, addedAt) {
  const raw = isPlainObject(batch) ? batch : {};
  const referenceId = normalizeString(raw.file_batch_id || raw.id) || createReferenceId(raw, 0);
  const title = normalizeString(raw.title || raw.display_name || "FILE_BATCH " + referenceId);
  const itemStatus = chooseQueueItemStatusFromFileBatch(raw);
  const panelCommandRequired = itemRequiresPanelCommand(raw, itemStatus);

  return serializeQueueItem({
    object_type: QUEUE_ITEM_OBJECT_TYPE,
    schema_version: MODEL_SCHEMA_VERSION,
    queue_item_id: normalizeString(raw.queue_item_id) || createQueueItemId(queue, TAERA_QUEUE_ITEM_KIND.FILE_BATCH, referenceId, 0),
    kind: TAERA_QUEUE_ITEM_KIND.FILE_BATCH,
    reference_id: referenceId,
    download_resource_id: "",
    file_batch_id: referenceId,
    title: title,
    url: "",
    expected_filename: "",
    resource_type: "FILE_BATCH",
    status: itemStatus,
    status_reason: createItemStatusReason(itemStatus, raw),
    panel_command_required: panelCommandRequired,
    panel_command_required_reason: panelCommandRequired
      ? normalizeString(raw.panel_command_required_reason || raw.status_reason) || "file_batch_requires_panel_command"
      : "",
    validation_ready: itemStatus === TAERA_QUEUE_ITEM_STATUS.VALIDATION_READY,
    readiness_required: itemStatus === TAERA_QUEUE_ITEM_STATUS.READINESS_REQUIRED,
    download_ready: itemStatus === TAERA_QUEUE_ITEM_STATUS.DOWNLOAD_READY,
    actual_download_performed: false,
    actual_run_performed: false,
    actual_file_access_performed: false,
    created_at: addedAt,
    updated_at: addedAt,
    payload: toJsonSafe(raw),
    status_history: [{
      status: itemStatus,
      previous_status: null,
      reason: createItemStatusReason(itemStatus, raw),
      at: addedAt,
      actor: "stage4TaeraResourceQueue.createQueueItemFromFileBatch"
    }]
  });
}

function normalizeQueueItem(item, queueSource, index) {
  const raw = isPlainObject(item) ? item : {};
  const kind = normalizeItemKind(raw.kind || raw.item_kind || raw.object_type);
  const referenceId = normalizeString(raw.reference_id || raw.download_resource_id || raw.file_batch_id || raw.id) || createReferenceId(raw, index);
  const createdAt = normalizeIsoString(raw.created_at) || normalizeIsoString(queueSource && queueSource.created_at) || new Date().toISOString();
  const status = normalizeItemStatus(raw.status) || TAERA_QUEUE_ITEM_STATUS.QUEUED;
  const panelCommandRequired = raw.panel_command_required === true || itemRequiresPanelCommand(raw, status);

  return serializeQueueItem({
    object_type: QUEUE_ITEM_OBJECT_TYPE,
    schema_version: MODEL_SCHEMA_VERSION,
    queue_item_id: normalizeString(raw.queue_item_id) || createQueueItemId(queueSource, kind, referenceId, index),
    kind: kind,
    reference_id: referenceId,
    download_resource_id: normalizeString(raw.download_resource_id),
    file_batch_id: normalizeString(raw.file_batch_id),
    title: normalizeString(raw.title || raw.display_name),
    url: normalizeString(raw.url),
    expected_filename: normalizeString(raw.expected_filename || raw.filename),
    resource_type: normalizeString(raw.resource_type || raw.resourceType || "UNKNOWN"),
    status: status,
    status_reason: normalizeString(raw.status_reason || raw.reason) || createItemStatusReason(status, raw),
    panel_command_required: panelCommandRequired,
    panel_command_required_reason: panelCommandRequired
      ? normalizeString(raw.panel_command_required_reason || raw.status_reason) || "queue_item_requires_panel_command"
      : "",
    validation_ready: raw.validation_ready === true || status === TAERA_QUEUE_ITEM_STATUS.VALIDATION_READY,
    readiness_required: raw.readiness_required === true || status === TAERA_QUEUE_ITEM_STATUS.READINESS_REQUIRED,
    download_ready: raw.download_ready === true || status === TAERA_QUEUE_ITEM_STATUS.DOWNLOAD_READY,
    actual_download_performed: false,
    actual_run_performed: false,
    actual_file_access_performed: false,
    created_at: createdAt,
    updated_at: normalizeIsoString(raw.updated_at) || createdAt,
    payload: toJsonSafe(raw.payload || raw),
    status_history: Array.isArray(raw.status_history) ? toJsonSafe(raw.status_history) : [{
      status: status,
      previous_status: null,
      reason: createItemStatusReason(status, raw),
      at: createdAt,
      actor: "stage4TaeraResourceQueue.normalizeQueueItem"
    }]
  });
}

function serializeQueueItem(item) {
  const raw = isPlainObject(item) ? item : {};
  const status = normalizeItemStatus(raw.status) || TAERA_QUEUE_ITEM_STATUS.QUEUED;
  const kind = normalizeItemKind(raw.kind || raw.item_kind);

  return pruneUndefined({
    object_type: QUEUE_ITEM_OBJECT_TYPE,
    schema_version: MODEL_SCHEMA_VERSION,
    queue_item_id: normalizeString(raw.queue_item_id),
    kind: kind,
    reference_id: normalizeString(raw.reference_id),
    download_resource_id: normalizeString(raw.download_resource_id),
    file_batch_id: normalizeString(raw.file_batch_id),
    title: normalizeString(raw.title),
    url: normalizeString(raw.url),
    expected_filename: normalizeString(raw.expected_filename),
    resource_type: normalizeString(raw.resource_type || "UNKNOWN"),
    status: status,
    status_reason: normalizeString(raw.status_reason || raw.reason) || createItemStatusReason(status, raw),
    panel_command_required: raw.panel_command_required === true || itemRequiresPanelCommand(raw, status),
    panel_command_required_reason: normalizeString(raw.panel_command_required_reason),
    validation_ready: raw.validation_ready === true || status === TAERA_QUEUE_ITEM_STATUS.VALIDATION_READY,
    readiness_required: raw.readiness_required === true || status === TAERA_QUEUE_ITEM_STATUS.READINESS_REQUIRED,
    download_ready: raw.download_ready === true || status === TAERA_QUEUE_ITEM_STATUS.DOWNLOAD_READY,
    actual_download_performed: false,
    actual_run_performed: false,
    actual_file_access_performed: false,
    created_at: normalizeIsoString(raw.created_at) || new Date().toISOString(),
    updated_at: normalizeIsoString(raw.updated_at) || normalizeIsoString(raw.created_at) || new Date().toISOString(),
    payload: toJsonSafe(raw.payload || null),
    status_history: Array.isArray(raw.status_history) ? toJsonSafe(raw.status_history) : []
  });
}

function chooseQueueItemStatusFromResource(resource) {
  const status = normalizeString(resource.download_status || resource.status).toUpperCase().replace(/[\s-]+/g, "_");

  if (PANEL_COMMAND_REQUIRED_STATUSES.indexOf(status) !== -1) {
    return status.indexOf("APPROVAL") !== -1
      ? TAERA_QUEUE_ITEM_STATUS.APPROVAL_REQUIRED
      : TAERA_QUEUE_ITEM_STATUS.PANEL_COMMAND_WAITING;
  }
  if (status === "DOWNLOAD_READY") {
    return TAERA_QUEUE_ITEM_STATUS.DOWNLOAD_READY;
  }
  if (!normalizeString(resource.url)) {
    return TAERA_QUEUE_ITEM_STATUS.READINESS_REQUIRED;
  }
  if (normalizeString(resource.hash) && resource.hash_verified !== true) {
    return TAERA_QUEUE_ITEM_STATUS.VALIDATION_READY;
  }
  return TAERA_QUEUE_ITEM_STATUS.QUEUED;
}

function chooseQueueItemStatusFromFileBatch(batch) {
  const status = normalizeString(batch.status).toUpperCase().replace(/[\s-]+/g, "_");

  if (PANEL_COMMAND_REQUIRED_STATUSES.indexOf(status) !== -1) {
    return status.indexOf("APPROVAL") !== -1
      ? TAERA_QUEUE_ITEM_STATUS.APPROVAL_REQUIRED
      : TAERA_QUEUE_ITEM_STATUS.PANEL_COMMAND_WAITING;
  }
  if (status === "DOWNLOAD_READY") {
    return TAERA_QUEUE_ITEM_STATUS.DOWNLOAD_READY;
  }
  if (status === "VALIDATION_READY") {
    return TAERA_QUEUE_ITEM_STATUS.VALIDATION_READY;
  }
  if (!Array.isArray(batch.files) && !Array.isArray(batch.resource_ids)) {
    return TAERA_QUEUE_ITEM_STATUS.READINESS_REQUIRED;
  }
  return TAERA_QUEUE_ITEM_STATUS.QUEUED;
}

function itemRequiresPanelCommand(item, status) {
  const normalizedStatus = normalizeString(status || item.status || item.download_status).toUpperCase().replace(/[\s-]+/g, "_");
  const resourceType = normalizeString(item.resource_type || item.resourceType).toUpperCase().replace(/[\s-]+/g, "_");

  return item.panel_command_required === true ||
    PANEL_COMMAND_REQUIRED_STATUSES.indexOf(normalizedStatus) !== -1 ||
    EXECUTION_LIKE_RESOURCE_TYPES.indexOf(resourceType) !== -1;
}

function computeQueueStatus(items) {
  if (!items.length) {
    return { status: TAERA_QUEUE_STATUS.EMPTY, reason: "queue_has_no_items" };
  }
  if (items.some(function someItem(item) { return item.status === TAERA_QUEUE_ITEM_STATUS.ERROR; })) {
    return { status: TAERA_QUEUE_STATUS.ERROR, reason: "one_or_more_items_have_error" };
  }
  if (items.some(function someItem(item) { return item.status === TAERA_QUEUE_ITEM_STATUS.APPROVAL_REQUIRED; })) {
    return { status: TAERA_QUEUE_STATUS.APPROVAL_REQUIRED, reason: "one_or_more_items_require_approval" };
  }
  if (items.some(function someItem(item) { return item.status === TAERA_QUEUE_ITEM_STATUS.PANEL_COMMAND_WAITING || item.panel_command_required === true; })) {
    return { status: TAERA_QUEUE_STATUS.PANEL_COMMAND_WAITING, reason: "one_or_more_items_wait_for_panel_command" };
  }
  if (items.some(function someItem(item) { return item.status === TAERA_QUEUE_ITEM_STATUS.READINESS_REQUIRED; })) {
    return { status: TAERA_QUEUE_STATUS.READINESS_REQUIRED, reason: "one_or_more_items_need_readiness_data" };
  }
  if (items.some(function someItem(item) { return item.status === TAERA_QUEUE_ITEM_STATUS.VALIDATION_READY; })) {
    return { status: TAERA_QUEUE_STATUS.VALIDATION_READY, reason: "one_or_more_items_are_ready_for_validation" };
  }
  if (items.some(function someItem(item) { return item.status === TAERA_QUEUE_ITEM_STATUS.DOWNLOAD_READY; })) {
    return { status: TAERA_QUEUE_STATUS.DOWNLOAD_READY, reason: "one_or_more_items_are_download_ready" };
  }
  return { status: TAERA_QUEUE_STATUS.READY, reason: "queue_items_ready_for_panel_gate" };
}

function summarizeQueueWithoutRecursion(queue) {
  const items = Array.isArray(queue.items) ? queue.items : [];
  const countsByStatus = {};
  const countsByKind = {};

  items.forEach(function eachItem(item) {
    const status = normalizeString(item.status) || TAERA_QUEUE_ITEM_STATUS.QUEUED;
    const kind = normalizeString(item.kind) || TAERA_QUEUE_ITEM_KIND.UNKNOWN;
    countsByStatus[status] = (countsByStatus[status] || 0) + 1;
    countsByKind[kind] = (countsByKind[kind] || 0) + 1;
  });

  return {
    item_count: items.length,
    panel_command_waiting_count: Array.isArray(queue.panel_command_waiting_items) ? queue.panel_command_waiting_items.length : 0,
    counts_by_status: countsByStatus,
    counts_by_kind: countsByKind,
    next_panel_action: chooseNextPanelAction(queue)
  };
}

function chooseNextPanelAction(queue) {
  if (queue.status === TAERA_QUEUE_STATUS.EMPTY) {
    return "WAIT_FOR_TAERA_RESOURCE_EXTRACTION";
  }
  if (queue.status === TAERA_QUEUE_STATUS.APPROVAL_REQUIRED) {
    return "REQUEST_PANEL_APPROVAL";
  }
  if (queue.status === TAERA_QUEUE_STATUS.PANEL_COMMAND_WAITING) {
    return "ROUTE_WAITING_ITEMS_TO_COMMAND_QUEUE";
  }
  if (queue.status === TAERA_QUEUE_STATUS.READINESS_REQUIRED) {
    return "COMPLETE_RESOURCE_READINESS_FIELDS";
  }
  if (queue.status === TAERA_QUEUE_STATUS.VALIDATION_READY) {
    return "RUN_EFFICIENCY_GATE_VALIDATION";
  }
  if (queue.status === TAERA_QUEUE_STATUS.DOWNLOAD_READY) {
    return "CREATE_DOWNLOAD_FILE_PANEL_COMMAND";
  }
  if (queue.status === TAERA_QUEUE_STATUS.ERROR) {
    return "REPORT_QUEUE_ERROR_TO_COMMANDER";
  }
  return "DISPLAY_QUEUE_IN_TAERA_AND_PANEL_GATE";
}

function createItemStatusReason(status, source) {
  const explicit = normalizeString(source.status_reason || source.download_status_reason || source.reason);
  if (explicit) {
    return explicit;
  }
  if (status === TAERA_QUEUE_ITEM_STATUS.DOWNLOAD_READY) {
    return "item_is_ready_for_panel_download_command";
  }
  if (status === TAERA_QUEUE_ITEM_STATUS.READINESS_REQUIRED) {
    return "item_requires_url_or_batch_readiness_data";
  }
  if (status === TAERA_QUEUE_ITEM_STATUS.VALIDATION_READY) {
    return "item_ready_for_gate_validation";
  }
  if (status === TAERA_QUEUE_ITEM_STATUS.PANEL_COMMAND_WAITING) {
    return "item_waiting_for_explicit_panel_command";
  }
  if (status === TAERA_QUEUE_ITEM_STATUS.APPROVAL_REQUIRED) {
    return "item_requires_panel_approval";
  }
  return "queue_item_created";
}

function buildPanelControl(source) {
  const actions = Array.isArray(source.panel_command_actions)
    ? source.panel_command_actions.map(normalizeString).filter(Boolean)
    : [
      "ROUTE_RESOURCE_TO_TAERA",
      "DOWNLOAD_FILE",
      "RUN_CMD",
      "RUN_PYTHON",
      "COLLECT_RESULT",
      "REPORT_ERROR",
      "SAVE_PANEL_RECORD"
    ];

  return {
    route: normalizeString(source.route) || "TAERA_RESOURCE",
    result_route: normalizeString(source.result_route) || "PANEL_RECORD",
    error_route: normalizeString(source.error_route) || "COMMANDER_QUEUE",
    command_queue_target: normalizeString(source.command_queue_target) || "TAERA_RESOURCE_AND_COMMAND_QUEUE",
    panel_command_actions: actions,
    direct_download_executed_by_model: false,
    direct_run_executed_by_model: false,
    direct_file_access_executed_by_model: false
  };
}

function buildTrace(source, createdAt) {
  return pruneUndefined({
    source: normalizeString(source.source) || "TAERA_RESOURCE",
    terminal: normalizeString(source.terminal) || "TAERA",
    project_id: normalizeString(source.project_id),
    slot_id: normalizeString(source.slot_id),
    prompt_id: normalizeString(source.prompt_id),
    taeo_output_id: normalizeString(source.taeo_output_id),
    taera_output_id: normalizeString(source.taera_output_id),
    panel_command_id: normalizeString(source.panel_command_id),
    created_at: createdAt,
    raw_trace: toJsonSafe(source.trace || source.trace_metadata || source.raw_trace || null)
  });
}

function buildInitialStatusHistory(createdAt, source) {
  if (Array.isArray(source.status_history)) {
    return toJsonSafe(source.status_history);
  }

  return [{
    status: TAERA_QUEUE_STATUS.EMPTY,
    previous_status: null,
    reason: "queue_created",
    at: createdAt,
    actor: "stage4TaeraResourceQueue.createTaeraResourceQueue"
  }];
}

function appendStatusHistory(history, entry) {
  const base = Array.isArray(history) ? history.slice() : [];
  base.push(pruneUndefined(entry));
  return base;
}

function normalizeItemKind(value) {
  const normalized = normalizeString(value).toUpperCase().replace(/[\s-]+/g, "_");
  if (normalized.indexOf("FILE_BATCH") !== -1) {
    return TAERA_QUEUE_ITEM_KIND.FILE_BATCH;
  }
  if (normalized.indexOf("PANEL_COMMAND") !== -1) {
    return TAERA_QUEUE_ITEM_KIND.PANEL_COMMAND;
  }
  if (normalized.indexOf("DOWNLOAD_RESOURCE") !== -1 || normalized.indexOf("RESOURCE") !== -1) {
    return TAERA_QUEUE_ITEM_KIND.DOWNLOAD_RESOURCE;
  }
  return TAERA_QUEUE_ITEM_KIND.UNKNOWN;
}

function normalizeItemStatus(value) {
  const normalized = normalizeString(value).toUpperCase().replace(/[\s-]+/g, "_");
  const values = Object.keys(TAERA_QUEUE_ITEM_STATUS).map(function mapKey(key) {
    return TAERA_QUEUE_ITEM_STATUS[key];
  });
  return values.indexOf(normalized) !== -1 ? normalized : "";
}

function dedupeItems(items) {
  const seen = new Set();
  const result = [];

  items.forEach(function eachItem(item) {
    const key = createItemDedupeKey(item);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push(item);
  });

  return result;
}

function createItemDedupeKey(item) {
  return [
    item.kind,
    item.reference_id,
    item.download_resource_id,
    item.file_batch_id,
    item.url,
    item.expected_filename
  ].map(function mapPart(part) {
    return normalizeString(part).toLowerCase().replace(/\\/g, "/");
  }).join("|");
}

function createQueueId(source, createdAt) {
  const base = [
    source.project_id,
    source.slot_id,
    source.prompt_id,
    source.taeo_output_id,
    createdAt
  ].map(normalizeString).join("|");

  return "taera_queue_" + stableStringHash(base);
}

function createQueueItemId(queue, kind, referenceId, index) {
  const base = [
    queue && queue.taera_queue_id,
    queue && queue.queue_id,
    queue && queue.project_id,
    kind,
    referenceId,
    String(index)
  ].map(normalizeString).join("|");

  return "taera_queue_item_" + stableStringHash(base);
}

function createReferenceId(source, index) {
  const base = [
    source.download_resource_id,
    source.file_batch_id,
    source.url,
    source.title,
    source.expected_filename,
    String(index)
  ].map(normalizeString).join("|");

  return "taera_ref_" + stableStringHash(base);
}

function stableStringHash(value) {
  let hash = 2166136261;
  const text = normalizeString(value);

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function normalizeIsoString(value) {
  const text = normalizeString(value);
  if (!text) {
    return "";
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString();
}

function normalizeString(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function cloneJson(value) {
  return toJsonSafe(value || {});
}

function toJsonSafe(value, seen) {
  if (value === null || value === undefined) {
    return value === undefined ? undefined : null;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
    return undefined;
  }

  const activeSeen = seen || new WeakSet();
  if (typeof value === "object") {
    if (activeSeen.has(value)) {
      return "[Circular]";
    }
    activeSeen.add(value);
  }

  if (Array.isArray(value)) {
    return value.map(function mapItem(item) {
      return toJsonSafe(item, activeSeen);
    }).filter(function keepDefined(item) {
      return item !== undefined;
    });
  }

  if (isPlainObject(value)) {
    const result = {};
    Object.keys(value).forEach(function eachKey(key) {
      const safeValue = toJsonSafe(value[key], activeSeen);
      if (safeValue !== undefined) {
        result[key] = safeValue;
      }
    });
    return result;
  }

  return normalizeString(value);
}

function pruneUndefined(value) {
  if (!isPlainObject(value)) {
    return value;
  }
  const result = {};
  Object.keys(value).forEach(function eachKey(key) {
    if (value[key] !== undefined) {
      result[key] = value[key];
    }
  });
  return result;
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

module.exports = {
  TAERA_QUEUE_STATUS: TAERA_QUEUE_STATUS,
  createTaeraResourceQueue: createTaeraResourceQueue,
  enqueueDownloadResources: enqueueDownloadResources,
  enqueueFileBatch: enqueueFileBatch,
  markTaeraQueueItemApprovalRequired: markTaeraQueueItemApprovalRequired,
  summarizeTaeraQueue: summarizeTaeraQueue
};