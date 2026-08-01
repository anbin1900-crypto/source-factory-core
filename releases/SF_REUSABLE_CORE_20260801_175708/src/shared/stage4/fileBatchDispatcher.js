'use strict';

const FILE_OPERATIONS = Object.freeze({
  CREATE: 'create',
  MODIFY: 'modify',
  REPLACE: 'replace',
  PATCH_REQUEST: 'patch_request',
  REPORT_ONLY: 'report_only'
});

const GATE_STATUSES = Object.freeze({
  GREEN: 'GREEN',
  YELLOW: 'YELLOW',
  RED: 'RED',
  BLACK: 'BLACK',
  UNKNOWN: 'UNKNOWN'
});

const DISPATCH_GROUP_NAMES = Object.freeze({
  CREATE_FILES: 'createFiles',
  MODIFY_FILES: 'modifyFiles',
  REPLACE_FILES: 'replaceFiles',
  PATCH_REQUESTS: 'patchRequests',
  REPORT_ONLY_ARTIFACTS: 'reportOnlyArtifacts',
  BLOCKED_RED_ITEMS: 'blockedRedItems',
  COMMANDER_REVIEW_YELLOW_ITEMS: 'commanderReviewYellowItems'
});

const DEFAULT_ROUTE_TARGET = 'COMMANDER_QUEUE';

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

function createBatchId(seed) {
  return `file_batch_${stableHash(seed)}_${Date.now().toString(36)}`;
}

function normalizeOperation(operation) {
  const normalized = toNonEmptyString(operation, '').toLowerCase();

  if (normalized === FILE_OPERATIONS.CREATE) {
    return FILE_OPERATIONS.CREATE;
  }

  if (normalized === FILE_OPERATIONS.MODIFY) {
    return FILE_OPERATIONS.MODIFY;
  }

  if (normalized === FILE_OPERATIONS.REPLACE) {
    return FILE_OPERATIONS.REPLACE;
  }

  if (normalized === 'patch' || normalized === FILE_OPERATIONS.PATCH_REQUEST) {
    return FILE_OPERATIONS.PATCH_REQUEST;
  }

  if (normalized === 'report' || normalized === FILE_OPERATIONS.REPORT_ONLY) {
    return FILE_OPERATIONS.REPORT_ONLY;
  }

  return '';
}

function normalizeGateStatus(item) {
  const source = isPlainObject(item) ? item : {};
  const raw = toNonEmptyString(
    source.gate_status || source.gateStatus || source.status || source.color_status || source.colorStatus,
    GATE_STATUSES.UNKNOWN
  ).toUpperCase();

  if (raw === GATE_STATUSES.GREEN) {
    return GATE_STATUSES.GREEN;
  }

  if (raw === GATE_STATUSES.YELLOW) {
    return GATE_STATUSES.YELLOW;
  }

  if (raw === GATE_STATUSES.RED) {
    return GATE_STATUSES.RED;
  }

  if (raw === GATE_STATUSES.BLACK) {
    return GATE_STATUSES.BLACK;
  }

  return GATE_STATUSES.UNKNOWN;
}

function normalizeSourceFileUnit(item, index) {
  const source = isPlainObject(item) ? item : {};
  const operation = normalizeOperation(source.operation);
  const pathValue = toNonEmptyString(source.path || source.file_path || source.filePath, '');
  const ownerWorker = toNonEmptyString(source.owner_worker || source.ownerWorker, '');
  const targetStage = toNonEmptyString(source.target_stage || source.targetStage, '');
  const gateStatus = normalizeGateStatus(source);
  const unitIdSeed = [
    pathValue,
    operation,
    ownerWorker,
    targetStage,
    source.task_id || source.taskId || '',
    index
  ].join('|');

  return {
    unit_id: toNonEmptyString(source.unit_id || source.unitId, `file_unit_${stableHash(unitIdSeed)}_${String(index + 1).padStart(3, '0')}`),
    path: pathValue,
    language: toNonEmptyString(source.language, ''),
    purpose: toNonEmptyString(source.purpose, ''),
    operation,
    owner_worker: ownerWorker,
    target_stage: targetStage,
    gate_status: gateStatus,
    task_id: toNonEmptyString(source.task_id || source.taskId, ''),
    source_file_index: Number.isFinite(Number(source.source_file_index || source.sourceFileIndex))
      ? Number(source.source_file_index || source.sourceFileIndex)
      : index,
    content: typeof source.content === 'string' ? source.content : '',
    raw: source.raw || null,
    errors: Array.isArray(source.errors) ? source.errors.slice() : [],
    warnings: Array.isArray(source.warnings) ? source.warnings.slice() : [],
    metadata: isPlainObject(source.metadata) ? Object.assign({}, source.metadata) : {}
  };
}

function createEmptyGroups() {
  return {
    createFiles: [],
    modifyFiles: [],
    replaceFiles: [],
    patchRequests: [],
    reportOnlyArtifacts: [],
    blockedRedItems: [],
    commanderReviewYellowItems: []
  };
}

function getInputItems(input) {
  if (Array.isArray(input)) {
    return input;
  }

  if (isPlainObject(input) && Array.isArray(input.items)) {
    return input.items;
  }

  if (isPlainObject(input) && Array.isArray(input.source_files)) {
    return input.source_files;
  }

  if (isPlainObject(input) && Array.isArray(input.sourceFiles)) {
    return input.sourceFiles;
  }

  if (isPlainObject(input) && Array.isArray(input.units)) {
    return input.units;
  }

  return [];
}

function validateNormalizedUnit(unit, index) {
  const errors = [];
  const warnings = [];

  if (!unit.path && unit.operation !== FILE_OPERATIONS.REPORT_ONLY) {
    errors.push(`items[${index}].path is required for operation ${unit.operation || 'unknown'}`);
  }

  if (!unit.operation) {
    errors.push(`items[${index}].operation is required`);
  }

  if (!unit.owner_worker) {
    warnings.push(`items[${index}].owner_worker is empty`);
  }

  if (unit.gate_status === GATE_STATUSES.BLACK) {
    errors.push(`items[${index}] has BLACK status and must not be dispatched`);
  }

  if (unit.gate_status === GATE_STATUSES.UNKNOWN) {
    warnings.push(`items[${index}].gate_status is UNKNOWN`);
  }

  return {
    errors,
    warnings
  };
}

function pushUnitToOperationGroup(groups, unit) {
  if (unit.operation === FILE_OPERATIONS.CREATE) {
    groups.createFiles.push(unit);
    return;
  }

  if (unit.operation === FILE_OPERATIONS.MODIFY) {
    groups.modifyFiles.push(unit);
    return;
  }

  if (unit.operation === FILE_OPERATIONS.REPLACE) {
    groups.replaceFiles.push(unit);
    return;
  }

  if (unit.operation === FILE_OPERATIONS.PATCH_REQUEST) {
    groups.patchRequests.push(unit);
    return;
  }

  if (unit.operation === FILE_OPERATIONS.REPORT_ONLY) {
    groups.reportOnlyArtifacts.push(unit);
  }
}

function summarizeGroups(groups) {
  const summary = {
    total: 0,
    createFiles: groups.createFiles.length,
    modifyFiles: groups.modifyFiles.length,
    replaceFiles: groups.replaceFiles.length,
    patchRequests: groups.patchRequests.length,
    reportOnlyArtifacts: groups.reportOnlyArtifacts.length,
    blockedRedItems: groups.blockedRedItems.length,
    commanderReviewYellowItems: groups.commanderReviewYellowItems.length,
    immediateAssemblyCandidates: 0,
    requiresCommanderReview: groups.commanderReviewYellowItems.length,
    blocked: groups.blockedRedItems.length
  };

  summary.immediateAssemblyCandidates = summary.createFiles
    + summary.modifyFiles
    + summary.replaceFiles
    + summary.patchRequests
    + summary.reportOnlyArtifacts;

  summary.total = summary.immediateAssemblyCandidates
    + summary.commanderReviewYellowItems
    + summary.blockedRedItems;

  return summary;
}

function splitFileBatchByOperation(input) {
  const rawItems = getInputItems(input);
  const groups = createEmptyGroups();
  const errors = [];
  const warnings = [];
  const seenPathsByOperation = new Set();

  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    warnings.push('no SOURCE_FILE units were provided');
  }

  rawItems.forEach((item, index) => {
    const unit = normalizeSourceFileUnit(item, index);
    const validation = validateNormalizedUnit(unit, index);

    errors.push(...validation.errors);
    warnings.push(...validation.warnings);

    if (unit.gate_status === GATE_STATUSES.BLACK || unit.gate_status === GATE_STATUSES.RED) {
      groups.blockedRedItems.push(unit);
      return;
    }

    if (unit.gate_status === GATE_STATUSES.YELLOW) {
      groups.commanderReviewYellowItems.push(unit);
      return;
    }

    const collisionKey = `${unit.operation}::${unit.path}`;
    if (unit.path && seenPathsByOperation.has(collisionKey)) {
      warnings.push(`duplicate path for operation ${unit.operation}: ${unit.path}`);
    }
    seenPathsByOperation.add(collisionKey);

    pushUnitToOperationGroup(groups, unit);
  });

  return {
    ok: errors.length === 0,
    groups,
    summary: summarizeGroups(groups),
    errors,
    warnings
  };
}

function normalizeDispatchInput(input) {
  const source = isPlainObject(input) ? input : {};
  const createdAt = toNonEmptyString(source.created_at || source.createdAt, nowIsoString());

  return {
    project_id: toNonEmptyString(source.project_id || source.projectId, ''),
    panel_id: toNonEmptyString(source.panel_id || source.panelId, ''),
    batch_id: toNonEmptyString(source.batch_id || source.batchId, ''),
    prompt_package_id: toNonEmptyString(source.prompt_package_id || source.promptPackageId, ''),
    prompt_package_version: toNonEmptyString(source.prompt_package_version || source.promptPackageVersion, ''),
    target_stage: toNonEmptyString(source.target_stage || source.targetStage, 'STAGE4_CLASSIFIER_VALIDATION_PANEL_AUTOMATION'),
    route_target: toNonEmptyString(source.route_target || source.routeTarget, DEFAULT_ROUTE_TARGET),
    source_terminal: toNonEmptyString(source.source_terminal || source.sourceTerminal, 'PANEL'),
    created_at: createdAt,
    metadata: isPlainObject(source.metadata) ? Object.assign({}, source.metadata) : {}
  };
}

function buildFileBatchDispatch(input) {
  const context = normalizeDispatchInput(input);
  const splitResult = splitFileBatchByOperation(input);
  const dispatchSeed = [
    context.project_id,
    context.panel_id,
    context.batch_id,
    context.prompt_package_version,
    context.created_at,
    splitResult.summary.total
  ].join('|');

  const dispatch = {
    dispatchId: toNonEmptyString(context.batch_id, createBatchId(dispatchSeed)),
    dispatchType: 'FILE_BATCH_DISPATCH_PLAN',
    routeTarget: context.route_target,
    actualWritePerformed: false,
    writeExecutionAllowed: false,
    projectId: context.project_id,
    panelId: context.panel_id,
    promptPackageId: context.prompt_package_id,
    promptPackageVersion: context.prompt_package_version,
    targetStage: context.target_stage,
    sourceTerminal: context.source_terminal,
    groups: splitResult.groups,
    summary: splitResult.summary,
    nextActionHint: splitResult.summary.blocked > 0
      ? 'blockedRedItems require RED hotfix or exclusion before assembly'
      : splitResult.summary.requiresCommanderReview > 0
        ? 'commanderReviewYellowItems require fast Commander review before assembly'
        : 'ready for Commander assembly planning',
    metadata: context.metadata,
    createdAt: context.created_at
  };

  return {
    ok: splitResult.ok,
    dispatch,
    groups: splitResult.groups,
    summary: splitResult.summary,
    errors: splitResult.errors,
    warnings: splitResult.warnings
  };
}

module.exports = {
  FILE_OPERATIONS,
  GATE_STATUSES,
  DISPATCH_GROUP_NAMES,
  buildFileBatchDispatch,
  splitFileBatchByOperation
};