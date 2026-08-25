'use strict';

const DOWNLOAD_RESOURCE_STATUSES = Object.freeze({
  CANDIDATE: 'CANDIDATE',
  QUEUED: 'QUEUED',
  DISPATCH_READY: 'DISPATCH_READY',
  DOWNLOADED: 'DOWNLOADED',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED'
});

const DOWNLOAD_RESOURCE_TYPES = Object.freeze({
  URL: 'URL',
  FILE: 'FILE',
  SANDBOX: 'SANDBOX',
  UNKNOWN: 'UNKNOWN'
});

const DOWNLOAD_ROUTE_TARGETS = Object.freeze({
  TAERA_RESOURCE: 'TAERA_RESOURCE',
  COMMANDER_QUEUE: 'COMMANDER_QUEUE',
  MANUAL_REVIEW: 'MANUAL_REVIEW'
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

function normalizeStatus(status, fallback) {
  const normalized = toNonEmptyString(status, fallback || DOWNLOAD_RESOURCE_STATUSES.CANDIDATE).toUpperCase();

  if (Object.prototype.hasOwnProperty.call(DOWNLOAD_RESOURCE_STATUSES, normalized)) {
    return normalized;
  }

  return fallback || DOWNLOAD_RESOURCE_STATUSES.CANDIDATE;
}

function normalizeResourceType(type, resource) {
  const normalized = toNonEmptyString(type, '').toUpperCase();

  if (Object.prototype.hasOwnProperty.call(DOWNLOAD_RESOURCE_TYPES, normalized)) {
    return normalized;
  }

  const url = toNonEmptyString(resource && (resource.url || resource.href || resource.download_url || resource.downloadUrl), '');
  const filePath = toNonEmptyString(resource && (resource.file_path || resource.filePath || resource.path), '');

  if (/^https?:\/\//i.test(url)) {
    return DOWNLOAD_RESOURCE_TYPES.URL;
  }

  if (/^sandbox:\//i.test(url) || /^sandbox:\//i.test(filePath)) {
    return DOWNLOAD_RESOURCE_TYPES.SANDBOX;
  }

  if (filePath) {
    return DOWNLOAD_RESOURCE_TYPES.FILE;
  }

  return DOWNLOAD_RESOURCE_TYPES.UNKNOWN;
}

function createResourceId(resource, index, queueContext) {
  const seed = [
    queueContext.queue_id,
    resource.resource_id,
    resource.url,
    resource.href,
    resource.download_url,
    resource.file_path,
    resource.filename,
    resource.title,
    index
  ].join('|');

  return `download_resource_${stableHash(seed)}_${String(index + 1).padStart(3, '0')}`;
}

function createQueueId(seed) {
  return `download_queue_${stableHash(seed)}_${Date.now().toString(36)}`;
}

function createDispatchId(resource, options) {
  const seed = [
    options.dispatch_batch_id,
    resource.resource_id,
    resource.url,
    resource.file_path,
    resource.filename,
    resource.status
  ].join('|');

  return `download_dispatch_${stableHash(seed)}`;
}

function normalizeQueueContext(input) {
  const source = isPlainObject(input) ? input : {};
  const createdAt = toNonEmptyString(source.created_at || source.createdAt, nowIsoString());

  return {
    queue_id: toNonEmptyString(source.queue_id || source.queueId, createQueueId(createdAt)),
    project_id: toNonEmptyString(source.project_id || source.projectId, ''),
    panel_id: toNonEmptyString(source.panel_id || source.panelId, ''),
    prompt_package_id: toNonEmptyString(source.prompt_package_id || source.promptPackageId, ''),
    prompt_package_version: toNonEmptyString(source.prompt_package_version || source.promptPackageVersion, ''),
    target_stage: toNonEmptyString(source.target_stage || source.targetStage, 'STAGE4_CLASSIFIER_VALIDATION_PANEL_AUTOMATION'),
    source_terminal: toNonEmptyString(source.source_terminal || source.sourceTerminal, 'TAERA'),
    route_target: toNonEmptyString(source.route_target || source.routeTarget, DOWNLOAD_ROUTE_TARGETS.TAERA_RESOURCE),
    created_at: createdAt,
    updated_at: toNonEmptyString(source.updated_at || source.updatedAt, createdAt),
    metadata: isPlainObject(source.metadata) ? Object.assign({}, source.metadata) : {}
  };
}

function normalizeDownloadResource(resourceInput, index, queueContext) {
  const source = isPlainObject(resourceInput) ? resourceInput : {};
  const url = toNonEmptyString(source.url || source.href || source.download_url || source.downloadUrl, '');
  const filePath = toNonEmptyString(source.file_path || source.filePath || source.path, '');
  const status = normalizeStatus(
    source.status,
    index === 0 ? DOWNLOAD_RESOURCE_STATUSES.DISPATCH_READY : DOWNLOAD_RESOURCE_STATUSES.CANDIDATE
  );
  const resourceType = normalizeResourceType(source.resource_type || source.resourceType || source.type, source);

  return {
    resource_id: toNonEmptyString(source.resource_id || source.resourceId, createResourceId(source, index, queueContext)),
    resource_type: resourceType,
    title: toNonEmptyString(source.title || source.label, ''),
    url,
    href: toNonEmptyString(source.href, url),
    file_path: filePath,
    filename: toNonEmptyString(source.filename || source.file_name || source.fileName, ''),
    mime_type: toNonEmptyString(source.mime_type || source.mimeType, ''),
    size_bytes: Number.isFinite(Number(source.size_bytes || source.sizeBytes)) ? Number(source.size_bytes || source.sizeBytes) : null,
    source_terminal: toNonEmptyString(source.source_terminal || source.sourceTerminal, queueContext.source_terminal),
    route_target: toNonEmptyString(source.route_target || source.routeTarget, queueContext.route_target),
    status,
    priority: toNonEmptyString(source.priority, 'normal'),
    candidate_index: Number.isFinite(Number(source.candidate_index || source.candidateIndex))
      ? Number(source.candidate_index || source.candidateIndex)
      : index,
    prompt_id: toNonEmptyString(source.prompt_id || source.promptId, ''),
    output_id: toNonEmptyString(source.output_id || source.outputId, ''),
    owner_worker: toNonEmptyString(source.owner_worker || source.ownerWorker, ''),
    task_id: toNonEmptyString(source.task_id || source.taskId, ''),
    downloaded_at: source.downloaded_at || source.downloadedAt || null,
    failed_at: source.failed_at || source.failedAt || null,
    skipped_at: source.skipped_at || source.skippedAt || null,
    error: source.error || null,
    warnings: Array.isArray(source.warnings) ? source.warnings.slice() : [],
    metadata: isPlainObject(source.metadata) ? Object.assign({}, source.metadata) : {},
    created_at: toNonEmptyString(source.created_at || source.createdAt, queueContext.created_at),
    updated_at: toNonEmptyString(source.updated_at || source.updatedAt, queueContext.created_at)
  };
}

function validateDownloadResource(resource, index) {
  const errors = [];
  const warnings = [];

  if (!resource.resource_id) {
    errors.push(`resources[${index}].resource_id is required`);
  }

  if (!resource.url && !resource.file_path) {
    errors.push(`resources[${index}] requires url or file_path`);
  }

  if (!Object.prototype.hasOwnProperty.call(DOWNLOAD_RESOURCE_STATUSES, resource.status)) {
    errors.push(`resources[${index}].status is invalid: ${resource.status}`);
  }

  if (resource.resource_type === DOWNLOAD_RESOURCE_TYPES.UNKNOWN) {
    warnings.push(`resources[${index}].resource_type is UNKNOWN`);
  }

  if (resource.status === DOWNLOAD_RESOURCE_STATUSES.DOWNLOADED && !resource.downloaded_at) {
    warnings.push(`resources[${index}] is DOWNLOADED without downloaded_at`);
  }

  if (resource.status === DOWNLOAD_RESOURCE_STATUSES.FAILED && !resource.error) {
    warnings.push(`resources[${index}] is FAILED without error detail`);
  }

  return {
    errors,
    warnings
  };
}

function summarizeDownloadResourceQueue(resources) {
  const summary = {
    total: resources.length,
    by_status: {},
    by_type: {},
    candidate_count: 0,
    queued_count: 0,
    dispatch_ready_count: 0,
    downloaded_count: 0,
    failed_count: 0,
    skipped_count: 0
  };

  resources.forEach((resource) => {
    summary.by_status[resource.status] = (summary.by_status[resource.status] || 0) + 1;
    summary.by_type[resource.resource_type] = (summary.by_type[resource.resource_type] || 0) + 1;

    if (resource.status === DOWNLOAD_RESOURCE_STATUSES.CANDIDATE) {
      summary.candidate_count += 1;
    } else if (resource.status === DOWNLOAD_RESOURCE_STATUSES.QUEUED) {
      summary.queued_count += 1;
    } else if (resource.status === DOWNLOAD_RESOURCE_STATUSES.DISPATCH_READY) {
      summary.dispatch_ready_count += 1;
    } else if (resource.status === DOWNLOAD_RESOURCE_STATUSES.DOWNLOADED) {
      summary.downloaded_count += 1;
    } else if (resource.status === DOWNLOAD_RESOURCE_STATUSES.FAILED) {
      summary.failed_count += 1;
    } else if (resource.status === DOWNLOAD_RESOURCE_STATUSES.SKIPPED) {
      summary.skipped_count += 1;
    }
  });

  return summary;
}

function validateDownloadResourceList(resources) {
  const errors = [];
  const warnings = [];
  const seenResourceIds = new Set();

  resources.forEach((resource, index) => {
    const validation = validateDownloadResource(resource, index);
    errors.push(...validation.errors);
    warnings.push(...validation.warnings);

    if (seenResourceIds.has(resource.resource_id)) {
      errors.push(`resources[${index}].resource_id is duplicated: ${resource.resource_id}`);
    }

    seenResourceIds.add(resource.resource_id);
  });

  return {
    errors,
    warnings
  };
}

function getResourceInputList(input) {
  if (Array.isArray(input)) {
    return input;
  }

  if (isPlainObject(input) && Array.isArray(input.resources)) {
    return input.resources;
  }

  if (isPlainObject(input) && Array.isArray(input.items)) {
    return input.items;
  }

  if (isPlainObject(input) && Array.isArray(input.candidates)) {
    return input.candidates;
  }

  return [];
}

function createDownloadResourceQueue(input) {
  const source = isPlainObject(input) ? input : {};
  const context = normalizeQueueContext(source);
  const rawResources = getResourceInputList(source);
  const warnings = [];

  if (!Array.isArray(rawResources) || rawResources.length === 0) {
    warnings.push('no download resource candidates were provided');
  }

  const resources = rawResources.map((resource, index) => normalizeDownloadResource(resource, index, context));
  const validation = validateDownloadResourceList(resources);
  const queueWarnings = warnings.concat(validation.warnings);
  const summary = summarizeDownloadResourceQueue(resources);

  const queue = {
    queue_id: context.queue_id,
    project_id: context.project_id,
    panel_id: context.panel_id,
    prompt_package_id: context.prompt_package_id,
    prompt_package_version: context.prompt_package_version,
    target_stage: context.target_stage,
    source_terminal: context.source_terminal,
    route_target: context.route_target,
    status_set: Object.assign({}, DOWNLOAD_RESOURCE_STATUSES),
    resources,
    summary,
    errors: validation.errors,
    warnings: queueWarnings,
    created_at: context.created_at,
    updated_at: context.updated_at,
    metadata: context.metadata
  };

  return {
    ok: validation.errors.length === 0,
    queue,
    summary,
    errors: validation.errors,
    warnings: queueWarnings
  };
}

function getQueueResources(queue) {
  if (isPlainObject(queue) && Array.isArray(queue.resources)) {
    return queue.resources;
  }

  if (isPlainObject(queue) && isPlainObject(queue.queue) && Array.isArray(queue.queue.resources)) {
    return queue.queue.resources;
  }

  return [];
}

function cloneQueue(queue) {
  const source = isPlainObject(queue) ? queue : createDownloadResourceQueue({ resources: [] }).queue;
  const cloned = Object.assign({}, source);

  cloned.resources = getQueueResources(source).map((resource) => Object.assign({}, resource, {
    warnings: Array.isArray(resource.warnings) ? resource.warnings.slice() : [],
    metadata: isPlainObject(resource.metadata) ? Object.assign({}, resource.metadata) : {}
  }));
  cloned.errors = Array.isArray(source.errors) ? source.errors.slice() : [];
  cloned.warnings = Array.isArray(source.warnings) ? source.warnings.slice() : [];
  cloned.summary = isPlainObject(source.summary) ? Object.assign({}, source.summary) : summarizeDownloadResourceQueue(cloned.resources);

  return cloned;
}

function promoteNextQueuedResource(resources) {
  const hasDispatchReady = resources.some((resource) => resource.status === DOWNLOAD_RESOURCE_STATUSES.DISPATCH_READY);

  if (hasDispatchReady) {
    return resources;
  }

  const nextQueued = resources
    .filter((resource) => resource.status === DOWNLOAD_RESOURCE_STATUSES.QUEUED || resource.status === DOWNLOAD_RESOURCE_STATUSES.CANDIDATE)
    .sort((a, b) => a.candidate_index - b.candidate_index)[0];

  if (nextQueued) {
    nextQueued.status = DOWNLOAD_RESOURCE_STATUSES.DISPATCH_READY;
    nextQueued.updated_at = nowIsoString();
  }

  return resources;
}

function enqueueDownloadResource(queueInput, resourceInput) {
  const queue = cloneQueue(queueInput);
  const now = nowIsoString();
  const resources = getQueueResources(queue);
  const context = normalizeQueueContext(Object.assign({}, queue, { updated_at: now }));
  const resource = normalizeDownloadResource(
    Object.assign({}, isPlainObject(resourceInput) ? resourceInput : {}, {
      status: resourceInput && resourceInput.status ? resourceInput.status : DOWNLOAD_RESOURCE_STATUSES.QUEUED,
      candidate_index: resourceInput && Number.isFinite(Number(resourceInput.candidate_index || resourceInput.candidateIndex))
        ? Number(resourceInput.candidate_index || resourceInput.candidateIndex)
        : resources.length,
      created_at: resourceInput && (resourceInput.created_at || resourceInput.createdAt) ? resourceInput.created_at || resourceInput.createdAt : now,
      updated_at: now
    }),
    resources.length,
    context
  );

  if (resources.some((item) => item.resource_id === resource.resource_id)) {
    return {
      ok: false,
      queue,
      resource: null,
      errors: [`resource_id is duplicated: ${resource.resource_id}`],
      warnings: []
    };
  }

  resources.push(resource);
  promoteNextQueuedResource(resources);

  const validation = validateDownloadResourceList(resources);
  queue.resources = resources;
  queue.summary = summarizeDownloadResourceQueue(resources);
  queue.errors = validation.errors;
  queue.warnings = validation.warnings;
  queue.updated_at = now;

  return {
    ok: validation.errors.length === 0,
    queue,
    resource,
    errors: validation.errors,
    warnings: validation.warnings
  };
}

function applyStatusSideEffects(resource, status, patch, now) {
  if (status === DOWNLOAD_RESOURCE_STATUSES.DOWNLOADED) {
    resource.downloaded_at = resource.downloaded_at || now;
    resource.error = null;
  }

  if (status === DOWNLOAD_RESOURCE_STATUSES.FAILED) {
    resource.failed_at = resource.failed_at || now;
    resource.error = patch.error || resource.error || 'download resource marked as FAILED';
  }

  if (status === DOWNLOAD_RESOURCE_STATUSES.SKIPPED) {
    resource.skipped_at = resource.skipped_at || now;
  }
}

function markDownloadResourceStatus(queueInput, resourceId, nextStatus, patchInput) {
  const queue = cloneQueue(queueInput);
  const now = nowIsoString();
  const resources = getQueueResources(queue);
  const normalizedResourceId = toNonEmptyString(resourceId, '');
  const status = normalizeStatus(nextStatus, '');
  const patch = isPlainObject(patchInput) ? patchInput : {};
  const errors = [];
  const warnings = [];

  if (!normalizedResourceId) {
    errors.push('resourceId is required');
  }

  if (!status) {
    errors.push(`nextStatus is invalid: ${nextStatus}`);
  }

  const target = resources.find((resource) => resource.resource_id === normalizedResourceId);

  if (!target) {
    errors.push(`resource not found: ${normalizedResourceId}`);
  }

  if (errors.length > 0) {
    return {
      ok: false,
      queue,
      resource: null,
      errors,
      warnings
    };
  }

  target.status = status;
  target.updated_at = now;

  if (patch.error !== undefined) {
    target.error = patch.error;
  }

  if (patch.filename !== undefined) {
    target.filename = toNonEmptyString(patch.filename, target.filename);
  }

  if (patch.file_path !== undefined || patch.filePath !== undefined) {
    target.file_path = toNonEmptyString(patch.file_path || patch.filePath, target.file_path);
  }

  if (patch.downloaded_at !== undefined || patch.downloadedAt !== undefined) {
    target.downloaded_at = patch.downloaded_at || patch.downloadedAt;
  }

  if (isPlainObject(patch.metadata)) {
    target.metadata = Object.assign({}, target.metadata, patch.metadata);
  }

  applyStatusSideEffects(target, status, patch, now);
  promoteNextQueuedResource(resources);

  const validation = validateDownloadResourceList(resources);
  queue.resources = resources;
  queue.summary = summarizeDownloadResourceQueue(resources);
  queue.errors = validation.errors;
  queue.warnings = validation.warnings;
  queue.updated_at = now;

  return {
    ok: validation.errors.length === 0,
    queue,
    resource: Object.assign({}, target),
    errors: validation.errors,
    warnings: validation.warnings
  };
}

function normalizeDispatchOptions(optionsInput) {
  const source = isPlainObject(optionsInput) ? optionsInput : {};
  const createdAt = toNonEmptyString(source.created_at || source.createdAt, nowIsoString());

  return {
    dispatch_batch_id: toNonEmptyString(source.dispatch_batch_id || source.dispatchBatchId, `download_dispatch_batch_${stableHash(createdAt)}`),
    route_target: toNonEmptyString(source.route_target || source.routeTarget, DOWNLOAD_ROUTE_TARGETS.TAERA_RESOURCE),
    target_handler: toNonEmptyString(source.target_handler || source.targetHandler, 'PANEL_DOWNLOAD_HANDLER_PATCH_REQUIRED'),
    created_at: createdAt,
    metadata: isPlainObject(source.metadata) ? Object.assign({}, source.metadata) : {}
  };
}

function validateDownloadDispatchPayload(payload) {
  const errors = [];
  const warnings = [];

  if (!payload.dispatchId) {
    errors.push('dispatchId is required');
  }

  if (!payload.resourceId) {
    errors.push('resourceId is required');
  }

  if (!payload.url && !payload.filePath) {
    errors.push('url or filePath is required');
  }

  if (!payload.routeTarget) {
    errors.push('routeTarget is required');
  }

  if (payload.resourceStatus !== DOWNLOAD_RESOURCE_STATUSES.DISPATCH_READY) {
    warnings.push(`resourceStatus is ${payload.resourceStatus}; dispatch payload is a plan only`);
  }

  if (payload.actualDownloadPerformed !== false) {
    errors.push('actualDownloadPerformed must be false');
  }

  return {
    errors,
    warnings
  };
}

function buildDownloadDispatchPayload(resourceInput, optionsInput) {
  const options = normalizeDispatchOptions(optionsInput);
  const context = normalizeQueueContext({
    queue_id: options.dispatch_batch_id,
    route_target: options.route_target,
    created_at: options.created_at
  });
  const resource = normalizeDownloadResource(resourceInput, 0, context);

  const payload = {
    dispatchId: createDispatchId(resource, options),
    dispatchType: 'TAERA_DOWNLOAD_RESOURCE_PLAN',
    resourceId: resource.resource_id,
    resourceType: resource.resource_type,
    resourceStatus: resource.status,
    title: resource.title,
    url: resource.url,
    href: resource.href,
    filePath: resource.file_path,
    filename: resource.filename,
    mimeType: resource.mime_type,
    sizeBytes: resource.size_bytes,
    routeTarget: resource.route_target || options.route_target,
    targetHandler: options.target_handler,
    sourceTerminal: resource.source_terminal,
    promptId: resource.prompt_id,
    outputId: resource.output_id,
    ownerWorker: resource.owner_worker,
    taskId: resource.task_id,
    priority: resource.priority,
    actualDownloadPerformed: false,
    downloadExecutionAllowed: false,
    nextActionHint: 'Panel handler patch must consume this payload before any actual download execution',
    metadata: Object.assign({}, options.metadata, resource.metadata),
    createdAt: options.created_at
  };

  const validation = validateDownloadDispatchPayload(payload);

  return {
    ok: validation.errors.length === 0,
    payload,
    resource,
    errors: validation.errors,
    warnings: validation.warnings.concat(resource.warnings || [])
  };
}

module.exports = {
  DOWNLOAD_RESOURCE_STATUSES,
  DOWNLOAD_RESOURCE_TYPES,
  DOWNLOAD_ROUTE_TARGETS,
  createDownloadResourceQueue,
  enqueueDownloadResource,
  markDownloadResourceStatus,
  buildDownloadDispatchPayload
};