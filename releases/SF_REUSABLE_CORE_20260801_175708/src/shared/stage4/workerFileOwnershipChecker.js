'use strict';

const PATCH_REQUEST_OPERATION = 'patch_request';
const REPORT_ONLY_OPERATION = 'report_only';
const DIRECT_WRITE_OPERATIONS = new Set(['create', 'replace', 'modify']);
const KNOWN_OPERATIONS = new Set(['create', 'replace', 'modify', PATCH_REQUEST_OPERATION, REPORT_ONLY_OPERATION]);

const SHARED_CORE_BASENAMES = new Set([
  'main.js',
  'preload.js',
  'renderer.js',
  'index.html',
  'package.json',
  'safe_panel_main.js',
  'safe_panel_preload.js',
  'safe_panel_renderer.js',
  'safe_panel.html',
]);

const RESERVED_ASSIGNMENT_KEYS = new Set([
  'byWorker',
  'workers',
  'workerAssignments',
  'byPath',
  'paths',
  'pathOwners',
  'directCoreAllowedWorkers',
  'coreTouchAllowedWorkers',
]);

function checkWorkerFileOwnership(sourceUnits, assignmentMap, options) {
  const opts = normalizeOptions(options);
  const units = Array.isArray(sourceUnits) ? sourceUnits : [];
  const assignments = normalizeAssignmentMap(assignmentMap, opts);

  const ownershipByWorker = Object.create(null);
  const ownershipByPath = Object.create(null);
  const directCoreTouches = [];
  const patchRequests = [];
  const unauthorizedTouches = [];
  const unassignedTouches = [];

  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index];
    const record = buildOwnershipRecord(unit, index, assignments, opts);

    if (!record.normalizedPath) {
      continue;
    }

    addWorkerOwnership(ownershipByWorker, record);
    addPathOwnership(ownershipByPath, record);

    if (record.isDirectCoreTouch) {
      directCoreTouches.push(toPublicTouchRecord(record));
    }

    if (record.isPatchRequest) {
      patchRequests.push(toPublicTouchRecord(record));
    }

    if (record.ownershipStatus === 'UNAUTHORIZED_OWNER') {
      unauthorizedTouches.push(toPublicTouchRecord(record));
    }

    if (record.ownershipStatus === 'NO_ASSIGNMENT_MATCH') {
      unassignedTouches.push(toPublicTouchRecord(record));
    }
  }

  return {
    ownershipByWorker,
    ownershipByPath,
    directCoreTouches,
    patchRequests,
    unauthorizedTouches,
    unassignedTouches,
    recommendedStatus: getRecommendedStatus(directCoreTouches, unauthorizedTouches, unassignedTouches),
    commanderDecisionNeeded: directCoreTouches.length > 0 || unauthorizedTouches.length > 0 || unassignedTouches.length > 0,
  };
}

function buildOwnershipRecord(unit, index, assignments, options) {
  const originalPath = readFirstStringField(unit, ['path', 'file_path', 'target_path']);
  const normalizedPath = normalizePath(originalPath, options);
  const operation = normalizeOperation(readFirstStringField(unit, ['operation', 'op']));
  const ownerWorker = normalizeWorkerId(readFirstStringField(unit, ['owner_worker', 'ownerWorker', 'worker_id', 'workerId']));
  const isSharedCorePath = isSharedCoreFilePath(normalizedPath);
  const isPatchRequest = operation === PATCH_REQUEST_OPERATION;
  const isReportOnly = operation === REPORT_ONLY_OPERATION;
  const isDirectWriteOperation = DIRECT_WRITE_OPERATIONS.has(operation) || (!isPatchRequest && !isReportOnly && operation === 'unknown');
  const isDirectCoreTouch = isSharedCorePath && isDirectWriteOperation;
  const assignedOwners = findAssignedOwnersForPath(normalizedPath, assignments);
  const workerSpec = ownerWorker ? assignments.byWorker[ownerWorker] : null;
  const directCoreAllowed = ownerWorker ? assignments.directCoreAllowedWorkers[ownerWorker] === true : false;
  const workerPathAllowed = ownerWorker ? isPathAllowedForWorker(normalizedPath, workerSpec, options) : false;
  const ownershipStatus = decideOwnershipStatus({
    ownerWorker,
    normalizedPath,
    assignedOwners,
    workerSpec,
    workerPathAllowed,
    assignments,
  });

  return {
    index,
    path: originalPath,
    normalizedPath,
    operation,
    language: readFirstStringField(unit, ['language', 'lang']),
    purpose: readFirstStringField(unit, ['purpose']),
    owner_worker: ownerWorker,
    target_stage: readFirstStringField(unit, ['target_stage', 'targetStage']),
    isSharedCorePath,
    isPatchRequest,
    isReportOnly,
    isDirectWriteOperation,
    isDirectCoreTouch,
    directCoreAllowed,
    assignedOwners,
    workerPathAllowed,
    ownershipStatus,
    commanderDecisionNeeded: ownershipStatus !== 'OWNERSHIP_OK' || isDirectCoreTouch,
    reason: buildReason({
      isSharedCorePath,
      isDirectCoreTouch,
      isPatchRequest,
      ownershipStatus,
      assignedOwners,
      ownerWorker,
      directCoreAllowed,
    }),
  };
}

function decideOwnershipStatus(input) {
  if (!input.ownerWorker) {
    return 'MISSING_OWNER_WORKER';
  }

  if (!input.assignments.hasAnyAssignment) {
    return 'NO_ASSIGNMENT_MAP';
  }

  if (input.assignedOwners.length > 0) {
    return input.assignedOwners.indexOf(input.ownerWorker) !== -1 ? 'OWNERSHIP_OK' : 'UNAUTHORIZED_OWNER';
  }

  if (input.workerSpec && input.workerPathAllowed) {
    return 'OWNERSHIP_OK';
  }

  return 'NO_ASSIGNMENT_MATCH';
}

function buildReason(input) {
  if (input.isDirectCoreTouch && !input.directCoreAllowed) {
    return 'Shared core file is directly touched by a non-patch_request source unit; Commander should review before materialization.';
  }

  if (input.isDirectCoreTouch && input.directCoreAllowed) {
    return 'Shared core file is directly touched, but assignment map marks the worker as direct-core allowed.';
  }

  if (input.isPatchRequest) {
    return 'Unit is a patch_request and should be ordered by Commander before application.';
  }

  if (input.ownershipStatus === 'UNAUTHORIZED_OWNER') {
    return 'Path is assigned to a different worker in assignmentMap.';
  }

  if (input.ownershipStatus === 'NO_ASSIGNMENT_MATCH') {
    return 'No assignmentMap rule matched this worker/path pair.';
  }

  if (input.ownershipStatus === 'NO_ASSIGNMENT_MAP') {
    return 'No assignment map was provided; ownership is recorded without blocking judgment.';
  }

  if (input.ownershipStatus === 'MISSING_OWNER_WORKER') {
    return 'Source unit has no owner_worker metadata.';
  }

  return 'Ownership rule matched.';
}

function addWorkerOwnership(ownershipByWorker, record) {
  const workerKey = record.owner_worker || 'UNKNOWN_WORKER';

  if (!ownershipByWorker[workerKey]) {
    ownershipByWorker[workerKey] = {
      worker_id: workerKey,
      paths: [],
      units: [],
      directCoreTouches: [],
      patchRequests: [],
      unauthorizedTouches: [],
      unassignedTouches: [],
      counts: {
        total: 0,
        directCoreTouches: 0,
        patchRequests: 0,
        unauthorizedTouches: 0,
        unassignedTouches: 0,
      },
    };
  }

  const bucket = ownershipByWorker[workerKey];
  bucket.counts.total += 1;
  addUnique(bucket.paths, record.normalizedPath);
  bucket.units.push(toPublicTouchRecord(record));

  if (record.isDirectCoreTouch) {
    bucket.counts.directCoreTouches += 1;
    bucket.directCoreTouches.push(toPublicTouchRecord(record));
  }

  if (record.isPatchRequest) {
    bucket.counts.patchRequests += 1;
    bucket.patchRequests.push(toPublicTouchRecord(record));
  }

  if (record.ownershipStatus === 'UNAUTHORIZED_OWNER') {
    bucket.counts.unauthorizedTouches += 1;
    bucket.unauthorizedTouches.push(toPublicTouchRecord(record));
  }

  if (record.ownershipStatus === 'NO_ASSIGNMENT_MATCH') {
    bucket.counts.unassignedTouches += 1;
    bucket.unassignedTouches.push(toPublicTouchRecord(record));
  }
}

function addPathOwnership(ownershipByPath, record) {
  const pathKey = record.normalizedPath;

  if (!ownershipByPath[pathKey]) {
    ownershipByPath[pathKey] = {
      path: pathKey,
      originalPaths: [],
      ownerWorkers: [],
      assignedOwners: [],
      operations: [],
      units: [],
      isSharedCorePath: record.isSharedCorePath,
      directCoreTouchCount: 0,
      patchRequestCount: 0,
      unauthorizedTouchCount: 0,
      commanderDecisionNeeded: false,
    };
  }

  const bucket = ownershipByPath[pathKey];
  addUnique(bucket.originalPaths, record.path);
  addUnique(bucket.ownerWorkers, record.owner_worker || 'UNKNOWN_WORKER');
  addUniqueMany(bucket.assignedOwners, record.assignedOwners);
  addUnique(bucket.operations, record.operation);
  bucket.units.push(toPublicTouchRecord(record));

  if (record.isDirectCoreTouch) {
    bucket.directCoreTouchCount += 1;
  }

  if (record.isPatchRequest) {
    bucket.patchRequestCount += 1;
  }

  if (record.ownershipStatus === 'UNAUTHORIZED_OWNER') {
    bucket.unauthorizedTouchCount += 1;
  }

  if (record.commanderDecisionNeeded) {
    bucket.commanderDecisionNeeded = true;
  }
}

function toPublicTouchRecord(record) {
  return {
    index: record.index,
    path: record.path,
    normalizedPath: record.normalizedPath,
    operation: record.operation,
    language: record.language,
    owner_worker: record.owner_worker,
    target_stage: record.target_stage,
    isSharedCorePath: record.isSharedCorePath,
    isPatchRequest: record.isPatchRequest,
    isDirectCoreTouch: record.isDirectCoreTouch,
    directCoreAllowed: record.directCoreAllowed,
    assignedOwners: record.assignedOwners.slice(),
    workerPathAllowed: record.workerPathAllowed,
    ownershipStatus: record.ownershipStatus,
    commanderDecisionNeeded: record.commanderDecisionNeeded,
    reason: record.reason,
  };
}

function getRecommendedStatus(directCoreTouches, unauthorizedTouches, unassignedTouches) {
  const hardDirectCoreTouches = directCoreTouches.filter(function filterHardTouch(touch) {
    return touch.directCoreAllowed !== true;
  });

  if (hardDirectCoreTouches.length > 0 || unauthorizedTouches.length > 0) {
    return 'RED_OWNERSHIP_REVIEW_REQUIRED';
  }

  if (unassignedTouches.length > 0 || directCoreTouches.length > 0) {
    return 'YELLOW_ASSIGNMENT_REVIEW_REQUIRED';
  }

  return 'GREEN_OWNERSHIP_OK';
}

function normalizeAssignmentMap(assignmentMap, options) {
  const raw = assignmentMap && typeof assignmentMap === 'object' ? assignmentMap : null;
  const normalized = {
    byWorker: Object.create(null),
    byPath: Object.create(null),
    directCoreAllowedWorkers: Object.create(null),
    hasAnyAssignment: false,
  };

  if (!raw) {
    return normalized;
  }

  mergeWorkerAssignments(normalized, raw.byWorker, options);
  mergeWorkerAssignments(normalized, raw.workers, options);
  mergeWorkerAssignments(normalized, raw.workerAssignments, options);
  mergeRootWorkerAssignments(normalized, raw, options);

  mergePathAssignments(normalized, raw.byPath, options);
  mergePathAssignments(normalized, raw.paths, options);
  mergePathAssignments(normalized, raw.pathOwners, options);

  mergeAllowedCoreWorkers(normalized, raw.directCoreAllowedWorkers);
  mergeAllowedCoreWorkers(normalized, raw.coreTouchAllowedWorkers);

  normalized.hasAnyAssignment =
    Object.keys(normalized.byWorker).length > 0 ||
    Object.keys(normalized.byPath).length > 0 ||
    Object.keys(normalized.directCoreAllowedWorkers).length > 0;

  return normalized;
}

function mergeRootWorkerAssignments(normalized, raw, options) {
  for (const key of Object.keys(raw)) {
    if (RESERVED_ASSIGNMENT_KEYS.has(key)) {
      continue;
    }

    if (!looksLikeWorkerId(key)) {
      continue;
    }

    mergeSingleWorkerAssignment(normalized, key, raw[key], options);
  }
}

function mergeWorkerAssignments(normalized, workerAssignments, options) {
  if (!workerAssignments || typeof workerAssignments !== 'object') {
    return;
  }

  for (const workerId of Object.keys(workerAssignments)) {
    mergeSingleWorkerAssignment(normalized, workerId, workerAssignments[workerId], options);
  }
}

function mergeSingleWorkerAssignment(normalized, workerId, spec, options) {
  const normalizedWorkerId = normalizeWorkerId(workerId);

  if (!normalizedWorkerId) {
    return;
  }

  const current = normalized.byWorker[normalizedWorkerId] || createEmptyWorkerSpec(normalizedWorkerId);
  const parsed = parseWorkerSpec(normalizedWorkerId, spec, options);

  addUniqueMany(current.paths, parsed.paths);
  addUniqueMany(current.globs, parsed.globs);
  current.directCoreAllowed = current.directCoreAllowed || parsed.directCoreAllowed;

  if (current.directCoreAllowed) {
    normalized.directCoreAllowedWorkers[normalizedWorkerId] = true;
  }

  normalized.byWorker[normalizedWorkerId] = current;
}

function createEmptyWorkerSpec(workerId) {
  return {
    worker_id: workerId,
    paths: [],
    globs: [],
    directCoreAllowed: false,
  };
}

function parseWorkerSpec(workerId, spec, options) {
  const parsed = createEmptyWorkerSpec(workerId);

  if (Array.isArray(spec)) {
    parsed.paths = spec.map(function mapPath(pathValue) {
      return normalizePath(pathValue, options);
    }).filter(Boolean);
    return parsed;
  }

  if (typeof spec === 'string') {
    const normalizedPath = normalizePath(spec, options);
    if (normalizedPath) {
      parsed.paths.push(normalizedPath);
    }
    return parsed;
  }

  if (!spec || typeof spec !== 'object') {
    return parsed;
  }

  const pathFields = ['paths', 'ownedPaths', 'allowedPaths', 'targetPaths', 'files', 'newFiles'];
  const globFields = ['globs', 'ownedGlobs', 'allowedGlobs', 'targetGlobs'];

  for (const fieldName of pathFields) {
    addNormalizedValues(parsed.paths, spec[fieldName], options);
  }

  for (const fieldName of globFields) {
    addNormalizedValues(parsed.globs, spec[fieldName], options);
  }

  parsed.directCoreAllowed =
    spec.directCoreAllowed === true ||
    spec.allowDirectCoreTouch === true ||
    spec.coreTouchAllowed === true;

  return parsed;
}

function mergePathAssignments(normalized, pathAssignments, options) {
  if (!pathAssignments || typeof pathAssignments !== 'object') {
    return;
  }

  for (const pathValue of Object.keys(pathAssignments)) {
    const normalizedPath = normalizePath(pathValue, options);
    const owners = normalizeOwnerList(pathAssignments[pathValue]);

    if (!normalizedPath || owners.length === 0) {
      continue;
    }

    if (!normalized.byPath[normalizedPath]) {
      normalized.byPath[normalizedPath] = [];
    }

    addUniqueMany(normalized.byPath[normalizedPath], owners);
  }
}

function mergeAllowedCoreWorkers(normalized, value) {
  const workers = normalizeOwnerList(value);

  for (const workerId of workers) {
    normalized.directCoreAllowedWorkers[workerId] = true;

    if (!normalized.byWorker[workerId]) {
      normalized.byWorker[workerId] = createEmptyWorkerSpec(workerId);
    }

    normalized.byWorker[workerId].directCoreAllowed = true;
  }
}

function findAssignedOwnersForPath(normalizedPath, assignments) {
  if (!normalizedPath) {
    return [];
  }

  if (assignments.byPath[normalizedPath]) {
    return assignments.byPath[normalizedPath].slice();
  }

  const owners = [];

  for (const workerId of Object.keys(assignments.byWorker)) {
    const workerSpec = assignments.byWorker[workerId];

    if (isPathAllowedForWorker(normalizedPath, workerSpec, { caseSensitivePath: false, keepLeadingDotSlash: false })) {
      addUnique(owners, workerId);
    }
  }

  return owners;
}

function isPathAllowedForWorker(normalizedPath, workerSpec, options) {
  if (!normalizedPath || !workerSpec) {
    return false;
  }

  if (workerSpec.paths.indexOf(normalizedPath) !== -1) {
    return true;
  }

  for (const glob of workerSpec.globs) {
    if (doesGlobMatchPath(glob, normalizedPath, options)) {
      return true;
    }
  }

  return false;
}

function doesGlobMatchPath(glob, normalizedPath, options) {
  const normalizedGlob = normalizePath(glob, options);

  if (!normalizedGlob) {
    return false;
  }

  const regex = globToRegExp(normalizedGlob);
  return regex.test(normalizedPath);
}

function globToRegExp(glob) {
  let pattern = '^';

  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    const next = glob[index + 1];

    if (char === '*' && next === '*') {
      pattern += '.*';
      index += 1;
      continue;
    }

    if (char === '*') {
      pattern += '[^/]*';
      continue;
    }

    pattern += escapeRegExp(char);
  }

  pattern += '$';
  return new RegExp(pattern);
}

function normalizeOperation(operation) {
  const text = toCleanString(operation)
    .toLowerCase()
    .replace(/-/g, '_')
    .replace(/\s+/g, '_');

  if (!text) {
    return 'unknown';
  }

  if (text === 'patchrequest') {
    return PATCH_REQUEST_OPERATION;
  }

  if (text === 'reportonly') {
    return REPORT_ONLY_OPERATION;
  }

  if (KNOWN_OPERATIONS.has(text)) {
    return text;
  }

  return 'unknown';
}

function normalizePath(pathValue, options) {
  const opts = options || normalizeOptions(null);
  let text = toCleanString(pathValue);

  if (!text) {
    return '';
  }

  text = text.replace(/\\/g, '/');
  text = text.replace(/\/{2,}/g, '/');

  if (!opts.keepLeadingDotSlash) {
    text = text.replace(/^\.\//, '');
  }

  text = text.trim();

  if (!opts.caseSensitivePath) {
    text = text.toLowerCase();
  }

  return text;
}

function isSharedCoreFilePath(normalizedPath) {
  if (!normalizedPath) {
    return false;
  }

  const parts = normalizedPath.split('/');
  const basename = parts[parts.length - 1];
  return SHARED_CORE_BASENAMES.has(basename);
}

function normalizeOptions(options) {
  const raw = options && typeof options === 'object' ? options : {};

  return {
    caseSensitivePath: raw.caseSensitivePath === true,
    keepLeadingDotSlash: raw.keepLeadingDotSlash === true,
  };
}

function readFirstStringField(unit, fieldNames) {
  if (!unit || typeof unit !== 'object') {
    return '';
  }

  for (const fieldName of fieldNames) {
    const value = readField(unit, fieldName);

    if (value !== undefined && value !== null && toCleanString(value) !== '') {
      return toCleanString(value);
    }
  }

  return '';
}

function readField(unit, fieldName) {
  if (!unit || typeof unit !== 'object') {
    return undefined;
  }

  if (Object.prototype.hasOwnProperty.call(unit, fieldName)) {
    return unit[fieldName];
  }

  const nestedContainers = ['metadata', 'sourceFile', 'source_file', 'header'];

  for (const containerName of nestedContainers) {
    const container = unit[containerName];

    if (
      container &&
      typeof container === 'object' &&
      Object.prototype.hasOwnProperty.call(container, fieldName)
    ) {
      return container[fieldName];
    }
  }

  return undefined;
}

function addNormalizedValues(target, values, options) {
  if (Array.isArray(values)) {
    for (const value of values) {
      addUnique(target, normalizePath(value, options));
    }
    return;
  }

  if (typeof values === 'string') {
    addUnique(target, normalizePath(values, options));
  }
}

function normalizeOwnerList(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeWorkerId).filter(Boolean);
  }

  if (typeof value === 'string') {
    const cleaned = normalizeWorkerId(value);
    return cleaned ? [cleaned] : [];
  }

  if (value && typeof value === 'object') {
    if (Array.isArray(value.ownerWorkers)) {
      return normalizeOwnerList(value.ownerWorkers);
    }

    if (Array.isArray(value.owners)) {
      return normalizeOwnerList(value.owners);
    }

    if (typeof value.owner_worker === 'string') {
      return normalizeOwnerList(value.owner_worker);
    }

    if (typeof value.worker_id === 'string') {
      return normalizeOwnerList(value.worker_id);
    }
  }

  return [];
}

function normalizeWorkerId(value) {
  return toCleanString(value).toUpperCase();
}

function looksLikeWorkerId(value) {
  const text = normalizeWorkerId(value);
  return /^WORKER[_-]?\d+/.test(text) || /^CLASSIFICATION[_-]?WORKER[_-]?\d+/.test(text);
}

function toCleanString(value) {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).replace(/\0/g, '').trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function addUnique(target, value) {
  const cleaned = toCleanString(value);

  if (!cleaned || target.indexOf(cleaned) !== -1) {
    return;
  }

  target.push(cleaned);
}

function addUniqueMany(target, values) {
  if (!Array.isArray(values)) {
    return;
  }

  for (const value of values) {
    addUnique(target, value);
  }
}

module.exports = {
  checkWorkerFileOwnership,
};