'use strict';

const DIRECT_WRITE_OPERATIONS = new Set(['create', 'replace', 'modify']);
const CREATE_REPLACE_OPERATIONS = new Set(['create', 'replace']);
const PATCH_REQUEST_OPERATION = 'patch_request';
const REPORT_ONLY_OPERATION = 'report_only';

const STATUS_GREEN = 'GREEN_NO_CONFLICT';
const STATUS_RED = 'RED_CONFLICT';
const STATUS_YELLOW = 'YELLOW_PATCH_ORDER_REQUIRED';

function detectDuplicatePathConflicts(sourceUnits, options) {
  const opts = normalizeOptions(options);
  const units = Array.isArray(sourceUnits) ? sourceUnits : [];
  const byPath = Object.create(null);

  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index];
    const originalPath = readFirstStringField(unit, ['path', 'file_path', 'target_path']);
    const normalizedPath = normalizePath(originalPath, opts);

    if (!normalizedPath) {
      continue;
    }

    if (!byPath[normalizedPath]) {
      byPath[normalizedPath] = createPathBucket(normalizedPath);
    }

    const operation = normalizeOperation(readFirstStringField(unit, ['operation', 'op']));
    const unitRecord = {
      index,
      path: originalPath,
      normalizedPath,
      operation,
      language: readFirstStringField(unit, ['language', 'lang']),
      owner_worker: readFirstStringField(unit, ['owner_worker', 'ownerWorker', 'worker_id']),
      target_stage: readFirstStringField(unit, ['target_stage', 'targetStage']),
      purpose: readFirstStringField(unit, ['purpose']),
    };

    appendUnitRecord(byPath[normalizedPath], unitRecord);
  }

  const conflicts = [];
  const paths = Object.keys(byPath).sort();

  for (const normalizedPath of paths) {
    const bucket = byPath[normalizedPath];
    const pathConflicts = evaluatePathBucket(bucket);

    bucket.conflicts = pathConflicts;
    bucket.recommendedStatus = getRecommendedStatus(pathConflicts);
    bucket.commanderDecisionNeeded = pathConflicts.length > 0;

    for (const conflict of pathConflicts) {
      conflicts.push(conflict);
    }
  }

  return {
    conflicts,
    byPath,
    recommendedStatus: getRecommendedStatus(conflicts),
    commanderDecisionNeeded: conflicts.length > 0,
  };
}

function normalizeOptions(options) {
  const raw = options && typeof options === 'object' ? options : {};

  return {
    caseSensitivePath: raw.caseSensitivePath === true,
    keepLeadingDotSlash: raw.keepLeadingDotSlash === true,
  };
}

function createPathBucket(normalizedPath) {
  return {
    path: normalizedPath,
    normalizedPath,
    originalPaths: [],
    units: [],
    operationCounts: Object.create(null),
    directWriteCount: 0,
    createReplaceCount: 0,
    patchRequestCount: 0,
    reportOnlyCount: 0,
    unknownOperationCount: 0,
    conflicts: [],
    recommendedStatus: STATUS_GREEN,
    commanderDecisionNeeded: false,
  };
}

function appendUnitRecord(bucket, unitRecord) {
  bucket.units.push(unitRecord);

  if (unitRecord.path && bucket.originalPaths.indexOf(unitRecord.path) === -1) {
    bucket.originalPaths.push(unitRecord.path);
  }

  bucket.operationCounts[unitRecord.operation] = (bucket.operationCounts[unitRecord.operation] || 0) + 1;

  if (DIRECT_WRITE_OPERATIONS.has(unitRecord.operation)) {
    bucket.directWriteCount += 1;
  }

  if (CREATE_REPLACE_OPERATIONS.has(unitRecord.operation)) {
    bucket.createReplaceCount += 1;
  }

  if (unitRecord.operation === PATCH_REQUEST_OPERATION) {
    bucket.patchRequestCount += 1;
  }

  if (unitRecord.operation === REPORT_ONLY_OPERATION) {
    bucket.reportOnlyCount += 1;
  }

  if (unitRecord.operation === 'unknown') {
    bucket.unknownOperationCount += 1;
  }
}

function evaluatePathBucket(bucket) {
  const conflicts = [];
  const directWriteUnits = bucket.units.filter(function filterDirectWrite(unit) {
    return DIRECT_WRITE_OPERATIONS.has(unit.operation);
  });
  const createReplaceUnits = bucket.units.filter(function filterCreateReplace(unit) {
    return CREATE_REPLACE_OPERATIONS.has(unit.operation);
  });
  const patchRequestUnits = bucket.units.filter(function filterPatchRequest(unit) {
    return unit.operation === PATCH_REQUEST_OPERATION;
  });

  if (createReplaceUnits.length > 1) {
    conflicts.push(createConflictRecord({
      status: STATUS_RED,
      code: 'MULTIPLE_CREATE_OR_REPLACE_FOR_SAME_PATH',
      bucket,
      affectedUnits: createReplaceUnits,
      reason: 'Same normalized path has multiple create/replace operations.',
      recommendation: 'Commander must select one materialization source or request a minimal RED hotfix before queue/materialize.',
    }));
  } else if (directWriteUnits.length > 1) {
    conflicts.push(createConflictRecord({
      status: STATUS_RED,
      code: 'MULTIPLE_DIRECT_WRITES_FOR_SAME_PATH',
      bucket,
      affectedUnits: directWriteUnits,
      reason: 'Same normalized path has multiple direct write operations.',
      recommendation: 'Commander must decide the single direct write order or request a minimal RED hotfix.',
    }));
  }

  if (patchRequestUnits.length > 1) {
    conflicts.push(createConflictRecord({
      status: STATUS_YELLOW,
      code: 'MULTIPLE_PATCH_REQUESTS_FOR_SAME_PATH',
      bucket,
      affectedUnits: patchRequestUnits,
      reason: 'Same normalized path has multiple patch_request units.',
      recommendation: 'Commander must define patch order before Worker 07 queue or materialization.',
    }));
  }

  if (directWriteUnits.length > 0 && patchRequestUnits.length > 0) {
    conflicts.push(createConflictRecord({
      status: STATUS_YELLOW,
      code: 'DIRECT_WRITE_AND_PATCH_REQUEST_FOR_SAME_PATH',
      bucket,
      affectedUnits: directWriteUnits.concat(patchRequestUnits),
      reason: 'Same normalized path has both direct write and patch_request units.',
      recommendation: 'Commander must apply direct write first, then order patch_request units, or split the queue.',
    }));
  }

  return conflicts;
}

function createConflictRecord(input) {
  return {
    status: input.status,
    code: input.code,
    path: input.bucket.path,
    normalizedPath: input.bucket.normalizedPath,
    originalPaths: input.bucket.originalPaths.slice(),
    unitIndexes: input.affectedUnits.map(function mapIndex(unit) {
      return unit.index;
    }),
    operations: unique(input.affectedUnits.map(function mapOperation(unit) {
      return unit.operation;
    })),
    ownerWorkers: unique(input.affectedUnits.map(function mapOwner(unit) {
      return unit.owner_worker;
    })),
    reason: input.reason,
    recommendation: input.recommendation,
    commanderDecisionNeeded: true,
  };
}

function getRecommendedStatus(conflicts) {
  if (!Array.isArray(conflicts) || conflicts.length === 0) {
    return STATUS_GREEN;
  }

  for (const conflict of conflicts) {
    if (conflict && conflict.status === STATUS_RED) {
      return STATUS_RED;
    }
  }

  return STATUS_YELLOW;
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

  if (
    text === 'create' ||
    text === 'replace' ||
    text === 'modify' ||
    text === PATCH_REQUEST_OPERATION ||
    text === REPORT_ONLY_OPERATION
  ) {
    return text;
  }

  return 'unknown';
}

function normalizePath(pathValue, options) {
  let text = toCleanString(pathValue);

  if (!text) {
    return '';
  }

  text = text.replace(/\\/g, '/');
  text = text.replace(/\/{2,}/g, '/');

  if (!options.keepLeadingDotSlash) {
    text = text.replace(/^\.\//, '');
  }

  text = text.trim();

  if (!options.caseSensitivePath) {
    text = text.toLowerCase();
  }

  return text;
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

function toCleanString(value) {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).replace(/\0/g, '').trim();
}

function unique(values) {
  const seen = Object.create(null);
  const output = [];

  for (const value of values) {
    const key = toCleanString(value);

    if (!key || seen[key]) {
      continue;
    }

    seen[key] = true;
    output.push(key);
  }

  return output;
}

module.exports = {
  detectDuplicatePathConflicts,
};