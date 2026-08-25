'use strict';

/**
 * Source Factory Stage 4 Prompt Package Version Manager.
 *
 * This helper normalizes and validates prompt package version records.
 * It never sends prompts, writes files, applies patches, or performs IPC calls.
 */

const REQUIRED_PROMPT_PACKAGE_FIELDS = Object.freeze([
  'prompt_package_id',
  'prompt_package_version',
  'target_stage',
  'commander_function_class',
  'worker_function_class',
  'api_ipc_button_contract_id',
  'source_factory_constitution_version',
  'created_by_commander'
]);

const PROMPT_PACKAGE_VERSION_STATUS = Object.freeze({
  GREEN_VERSION_CONSISTENT: 'GREEN_VERSION_CONSISTENT',
  YELLOW_VERSION_MISMATCH: 'YELLOW_VERSION_MISMATCH',
  YELLOW_VERSION_REVIEW_REQUIRED: 'YELLOW_VERSION_REVIEW_REQUIRED',
  RED_MISSING_PROMPT_PACKAGE_FIELD: 'RED_MISSING_PROMPT_PACKAGE_FIELD'
});

const DEFAULT_TARGET_STAGE = 'STAGE4_CLASSIFIER_VALIDATION_PANEL_AUTOMATION';
const DEFAULT_CONSTITUTION_VERSION = 'v2.1.0-COMPACT';
const DEFAULT_CONTRACT_ID = 'NO_API_IPC_BUTTON_CONTRACT';

function createPromptPackageVersionRecord(input, defaults) {
  const source = isPlainObject(input) ? input : {};
  const fallback = isPlainObject(defaults) ? defaults : {};

  const record = {
    prompt_package_id: firstText([
      source.prompt_package_id,
      source.promptPackageId,
      fallback.prompt_package_id,
      fallback.promptPackageId,
      'STAGE4_PROMPT_PACKAGE'
    ]),
    prompt_package_version: firstText([
      source.prompt_package_version,
      source.promptPackageVersion,
      fallback.prompt_package_version,
      fallback.promptPackageVersion,
      'UNVERSIONED'
    ]),
    target_stage: firstText([
      source.target_stage,
      source.targetStage,
      fallback.target_stage,
      fallback.targetStage,
      DEFAULT_TARGET_STAGE
    ]),
    commander_function_class: firstText([
      source.commander_function_class,
      source.commanderFunctionClass,
      fallback.commander_function_class,
      fallback.commanderFunctionClass,
      'DISPATCH_COMMANDER'
    ]),
    worker_function_class: firstText([
      source.worker_function_class,
      source.workerFunctionClass,
      fallback.worker_function_class,
      fallback.workerFunctionClass,
      ''
    ]),
    api_ipc_button_contract_id: firstText([
      source.api_ipc_button_contract_id,
      source.apiIpcButtonContractId,
      fallback.api_ipc_button_contract_id,
      fallback.apiIpcButtonContractId,
      DEFAULT_CONTRACT_ID
    ]),
    source_factory_constitution_version: firstText([
      source.source_factory_constitution_version,
      source.sourceFactoryConstitutionVersion,
      fallback.source_factory_constitution_version,
      fallback.sourceFactoryConstitutionVersion,
      DEFAULT_CONSTITUTION_VERSION
    ]),
    created_by_commander: firstText([
      source.created_by_commander,
      source.createdByCommander,
      fallback.created_by_commander,
      fallback.createdByCommander,
      'COMMANDER'
    ]),
    batch_id: firstText([
      source.batch_id,
      source.batchId,
      fallback.batch_id,
      fallback.batchId,
      ''
    ]),
    prompt_id: firstText([
      source.prompt_id,
      source.promptId,
      fallback.prompt_id,
      fallback.promptId,
      ''
    ]),
    worker_id: normalizeWorkerId(firstText([
      source.worker_id,
      source.workerId,
      source.owner_worker,
      source.ownerWorker,
      fallback.worker_id,
      fallback.workerId,
      ''
    ])),
    task_id: firstText([
      source.task_id,
      source.taskId,
      fallback.task_id,
      fallback.taskId,
      ''
    ]),
    send_order: normalizeOptionalInteger(firstValue([
      source.send_order,
      source.sendOrder,
      fallback.send_order,
      fallback.sendOrder
    ])),
    route_target: firstText([
      source.route_target,
      source.routeTarget,
      source.route,
      fallback.route_target,
      fallback.routeTarget,
      fallback.route,
      'COMMANDER_QUEUE'
    ]),
    created_at: firstText([
      source.created_at,
      source.createdAt,
      fallback.created_at,
      fallback.createdAt,
      ''
    ]) || new Date().toISOString(),
    metadata: isPlainObject(source.metadata) ? shallowClone(source.metadata) : {}
  };

  const validation = validatePromptPackageVersionRecord(record);
  record.validation_status = validation.status;
  record.validation_errors = validation.errors.slice();
  record.validation_warnings = validation.warnings.slice();

  return record;
}

function validatePromptPackageVersionRecord(recordInput) {
  const record = isPlainObject(recordInput) ? recordInput : {};
  const errors = [];
  const warnings = [];

  for (const field of REQUIRED_PROMPT_PACKAGE_FIELDS) {
    if (!toText(record[field]).trim()) {
      errors.push({
        code: 'MISSING_REQUIRED_PROMPT_PACKAGE_FIELD',
        field,
        message: `${field} is required for prompt package version control.`
      });
    }
  }

  if (toText(record.prompt_package_version).trim().toUpperCase() === 'UNVERSIONED') {
    warnings.push({
      code: 'PROMPT_PACKAGE_VERSION_UNVERSIONED',
      field: 'prompt_package_version',
      message: 'prompt_package_version is UNVERSIONED; Commander should assign a stable batch version before dispatch.'
    });
  }

  if (!toText(record.batch_id).trim()) {
    warnings.push({
      code: 'BATCH_ID_EMPTY',
      field: 'batch_id',
      message: 'batch_id is empty; mismatch detection will group this record under DEFAULT_BATCH.'
    });
  }

  if (!toText(record.worker_id).trim()) {
    warnings.push({
      code: 'WORKER_ID_EMPTY',
      field: 'worker_id',
      message: 'worker_id is empty; worker slot summary may be incomplete.'
    });
  }

  if (errors.length > 0) {
    return {
      ok: false,
      status: PROMPT_PACKAGE_VERSION_STATUS.RED_MISSING_PROMPT_PACKAGE_FIELD,
      errors,
      warnings,
      missingFields: errors.map(function mapField(error) { return error.field; })
    };
  }

  if (warnings.length > 0) {
    return {
      ok: true,
      status: PROMPT_PACKAGE_VERSION_STATUS.YELLOW_VERSION_REVIEW_REQUIRED,
      errors,
      warnings,
      missingFields: []
    };
  }

  return {
    ok: true,
    status: PROMPT_PACKAGE_VERSION_STATUS.GREEN_VERSION_CONSISTENT,
    errors,
    warnings,
    missingFields: []
  };
}

function detectBatchPromptVersionMismatch(recordsInput, options) {
  const optionsObject = isPlainObject(options) ? options : {};
  const records = collectRecords(recordsInput).map(function normalize(record) {
    return createPromptPackageVersionRecord(record, optionsObject.defaults || {});
  });

  const batchGroups = groupRecordsByBatch(records);
  const mismatches = [];
  const errors = [];
  const warnings = [];

  for (const record of records) {
    const validation = validatePromptPackageVersionRecord(record);
    errors.push.apply(errors, validation.errors.map(function attachRecord(error) {
      return Object.assign({}, error, {
        prompt_package_id: record.prompt_package_id,
        prompt_id: record.prompt_id,
        worker_id: record.worker_id,
        task_id: record.task_id
      });
    }));
    warnings.push.apply(warnings, validation.warnings.map(function attachRecord(warning) {
      return Object.assign({}, warning, {
        prompt_package_id: record.prompt_package_id,
        prompt_id: record.prompt_id,
        worker_id: record.worker_id,
        task_id: record.task_id
      });
    }));
  }

  for (const groupKey of Object.keys(batchGroups).sort()) {
    const group = batchGroups[groupKey];
    const versions = uniqueStrings(group.records.map(function mapVersion(record) {
      return record.prompt_package_version;
    }));

    if (versions.length > 1) {
      mismatches.push({
        code: 'BATCH_PROMPT_PACKAGE_VERSION_MISMATCH',
        status: PROMPT_PACKAGE_VERSION_STATUS.YELLOW_VERSION_MISMATCH,
        batch_key: groupKey,
        prompt_package_id: group.prompt_package_id,
        target_stage: group.target_stage,
        versions,
        record_count: group.records.length,
        worker_ids: uniqueStrings(group.records.map(function mapWorker(record) { return record.worker_id; })),
        task_ids: uniqueStrings(group.records.map(function mapTask(record) { return record.task_id; })),
        reason: 'same batch and prompt_package_id contain multiple prompt_package_version values',
        commanderDecisionNeeded: true
      });
    }
  }

  const status = selectBatchStatus(errors, mismatches, warnings);

  return {
    ok: status !== PROMPT_PACKAGE_VERSION_STATUS.RED_MISSING_PROMPT_PACKAGE_FIELD,
    status,
    records,
    batchGroups,
    mismatches,
    errors,
    warnings,
    summary: summarizePromptPackageVersions(records),
    nextRecommendedAction: selectNextRecommendedAction(status)
  };
}

function summarizePromptPackageVersions(recordsInput) {
  const records = collectRecords(recordsInput).map(function normalize(record) {
    return createPromptPackageVersionRecord(record);
  });

  const byPromptPackageId = {};
  const byVersion = {};
  const byWorker = {};
  const byTargetStage = {};
  const missingFieldRecords = [];
  const unversionedRecords = [];

  for (const record of records) {
    incrementCount(byPromptPackageId, record.prompt_package_id || 'UNKNOWN_PACKAGE');
    incrementCount(byVersion, record.prompt_package_version || 'UNKNOWN_VERSION');
    incrementCount(byWorker, record.worker_id || 'UNKNOWN_WORKER');
    incrementCount(byTargetStage, record.target_stage || 'UNKNOWN_STAGE');

    const validation = validatePromptPackageVersionRecord(record);
    if (validation.status === PROMPT_PACKAGE_VERSION_STATUS.RED_MISSING_PROMPT_PACKAGE_FIELD) {
      missingFieldRecords.push({
        prompt_id: record.prompt_id,
        worker_id: record.worker_id,
        task_id: record.task_id,
        missingFields: validation.missingFields
      });
    }

    if (record.prompt_package_version === 'UNVERSIONED') {
      unversionedRecords.push({
        prompt_id: record.prompt_id,
        worker_id: record.worker_id,
        task_id: record.task_id
      });
    }
  }

  return {
    totalRecords: records.length,
    byPromptPackageId,
    byVersion,
    byWorker,
    byTargetStage,
    missingFieldRecordCount: missingFieldRecords.length,
    unversionedRecordCount: unversionedRecords.length,
    missingFieldRecords,
    unversionedRecords
  };
}

function selectBatchStatus(errors, mismatches, warnings) {
  if (errors.length > 0) {
    return PROMPT_PACKAGE_VERSION_STATUS.RED_MISSING_PROMPT_PACKAGE_FIELD;
  }

  if (mismatches.length > 0) {
    return PROMPT_PACKAGE_VERSION_STATUS.YELLOW_VERSION_MISMATCH;
  }

  if (warnings.length > 0) {
    return PROMPT_PACKAGE_VERSION_STATUS.YELLOW_VERSION_REVIEW_REQUIRED;
  }

  return PROMPT_PACKAGE_VERSION_STATUS.GREEN_VERSION_CONSISTENT;
}

function selectNextRecommendedAction(status) {
  if (status === PROMPT_PACKAGE_VERSION_STATUS.RED_MISSING_PROMPT_PACKAGE_FIELD) {
    return 'Commander sends a small RED hotfix for missing prompt package fields.';
  }

  if (status === PROMPT_PACKAGE_VERSION_STATUS.YELLOW_VERSION_MISMATCH) {
    return 'Commander selects one prompt_package_version for the batch before dispatch.';
  }

  if (status === PROMPT_PACKAGE_VERSION_STATUS.YELLOW_VERSION_REVIEW_REQUIRED) {
    return 'Commander performs fast version review before sequential sending.';
  }

  return 'Commander can use these prompt package version records for queue and sequential sender assembly.';
}

function groupRecordsByBatch(records) {
  const groups = {};

  for (const record of records) {
    const key = [
      record.batch_id || 'DEFAULT_BATCH',
      record.prompt_package_id || 'UNKNOWN_PACKAGE',
      record.target_stage || 'UNKNOWN_STAGE'
    ].join('::');

    if (!groups[key]) {
      groups[key] = {
        batch_key: key,
        batch_id: record.batch_id || 'DEFAULT_BATCH',
        prompt_package_id: record.prompt_package_id || 'UNKNOWN_PACKAGE',
        target_stage: record.target_stage || 'UNKNOWN_STAGE',
        records: []
      };
    }

    groups[key].records.push(record);
  }

  return groups;
}

function collectRecords(input) {
  if (!input) {
    return [];
  }

  if (Array.isArray(input)) {
    return input;
  }

  if (!isPlainObject(input)) {
    return [];
  }

  const arrayKeys = ['records', 'items', 'prompts', 'queueItems', 'queue_items', 'packages'];
  for (const key of arrayKeys) {
    if (Array.isArray(input[key])) {
      return input[key];
    }
  }

  return [input];
}

function normalizeWorkerId(value) {
  const text = toText(value).trim().toUpperCase();

  if (!text) {
    return '';
  }

  if (/^\d+$/.test(text)) {
    return `WORKER_${text.padStart(2, '0')}`;
  }

  if (/^WORKER[-_]?\d+$/i.test(text)) {
    const numberPart = text.replace(/^WORKER[-_]?/i, '');
    return `WORKER_${numberPart.padStart(2, '0')}`;
  }

  return text;
}

function normalizeOptionalInteger(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return null;
  }

  return Math.floor(numberValue);
}

function firstText(values) {
  const value = firstValue(values);
  return toText(value).trim();
}

function firstValue(values) {
  for (const value of values) {
    if (value === 0) {
      return value;
    }

    if (value !== null && value !== undefined && toText(value).trim() !== '') {
      return value;
    }
  }

  return '';
}

function incrementCount(target, key) {
  const safeKey = toText(key).trim() || 'UNKNOWN';
  target[safeKey] = (target[safeKey] || 0) + 1;
}

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const text = toText(value).trim();
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    result.push(text);
  }

  return result;
}

function shallowClone(value) {
  const output = {};
  for (const key of Object.keys(value || {})) {
    output[key] = value[key];
  }
  return output;
}

function toText(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

module.exports = {
  REQUIRED_PROMPT_PACKAGE_FIELDS,
  PROMPT_PACKAGE_VERSION_STATUS,
  createPromptPackageVersionRecord,
  validatePromptPackageVersionRecord,
  detectBatchPromptVersionMismatch,
  summarizePromptPackageVersions
};


/* ST4_W45_PROMPT_PACKAGE_VERSION_BINDING_START */
const VERSION_BINDING_STATUS = Object.freeze({
  GREEN_VERSION_FIELDS_BOUND: 'GREEN_VERSION_FIELDS_BOUND',
  YELLOW_VERSION_FIELD_MISSING: 'YELLOW_VERSION_FIELD_MISSING',
  YELLOW_OLD_PROMPT_REUSE_CANDIDATE: 'YELLOW_OLD_PROMPT_REUSE_CANDIDATE',
  RED_VERSION_MISMATCH_CANDIDATE: 'RED_VERSION_MISMATCH_CANDIDATE',
  RED_OLD_PROMPT_REUSE_CANDIDATE: 'RED_OLD_PROMPT_REUSE_CANDIDATE'
});

function normalizePromptPackageVersionFields(input) {
  const source = input && typeof input === 'object' ? input : {};

  return {
    prompt_package_id: String(source.prompt_package_id || source.promptPackageId || '').trim(),
    prompt_package_version: String(source.prompt_package_version || source.promptPackageVersion || '').trim(),
    target_stage: String(source.target_stage || source.targetStage || '').trim(),
    commander_function_class: String(source.commander_function_class || source.commanderFunctionClass || '').trim(),
    worker_function_class: String(source.worker_function_class || source.workerFunctionClass || '').trim(),
    api_ipc_button_contract_id: String(source.api_ipc_button_contract_id || source.apiIpcButtonContractId || '').trim(),
    source_factory_constitution_version: String(source.source_factory_constitution_version || source.sourceFactoryConstitutionVersion || '').trim(),
    prompt_id: String(source.prompt_id || source.promptId || '').trim(),
    task_id: String(source.task_id || source.taskId || '').trim(),
    worker_id: String(source.worker_id || source.workerId || '').trim(),
    worker_slot: String(source.worker_slot || source.workerSlot || '').trim(),
    send_order: source.send_order !== undefined ? source.send_order : source.sendOrder,
    dedupe_key: String(source.dedupe_key || source.dedupeKey || '').trim(),
    batchId: String(source.batchId || source.batch_id || '').trim(),
    batch_record_id: String(source.batch_record_id || source.batchRecordId || source.recordId || '').trim(),
    old_prompt_reuse_candidate: Boolean(source.old_prompt_reuse_candidate || source.oldPromptReuseCandidate || source.already_sent || source.alreadySent)
  };
}

function detectPromptPackageVersionBindingIssues(input, expected) {
  const actualFields = normalizePromptPackageVersionFields(input);
  const expectedFields = normalizePromptPackageVersionFields(expected || {});
  const issues = [];

  ['prompt_package_id', 'prompt_package_version'].forEach(function checkRequired(field) {
    if (!actualFields[field]) {
      issues.push({
        status: VERSION_BINDING_STATUS.YELLOW_VERSION_FIELD_MISSING,
        field,
        reason: field + ' is missing; do not create a default value'
      });
    }
  });

  ['prompt_package_id', 'prompt_package_version'].forEach(function checkMismatch(field) {
    if (expectedFields[field] && actualFields[field] && expectedFields[field] !== actualFields[field]) {
      issues.push({
        status: VERSION_BINDING_STATUS.RED_VERSION_MISMATCH_CANDIDATE,
        field,
        expected: expectedFields[field],
        actual: actualFields[field],
        reason: field + ' mismatch'
      });
    }
  });

  if (actualFields.old_prompt_reuse_candidate) {
    issues.push({
      status: expectedFields.prompt_package_version && actualFields.prompt_package_version && expectedFields.prompt_package_version !== actualFields.prompt_package_version
        ? VERSION_BINDING_STATUS.RED_OLD_PROMPT_REUSE_CANDIDATE
        : VERSION_BINDING_STATUS.YELLOW_OLD_PROMPT_REUSE_CANDIDATE,
      field: 'prompt_id',
      prompt_id: actualFields.prompt_id,
      reason: 'old prompt reuse candidate detected'
    });
  }

  const hasRed = issues.some(function hasRedIssue(issue) {
    return String(issue.status).indexOf('RED_') === 0;
  });

  const hasYellow = issues.some(function hasYellowIssue(issue) {
    return String(issue.status).indexOf('YELLOW_') === 0;
  });

  return {
    ok: !hasRed,
    status: hasRed
      ? VERSION_BINDING_STATUS.RED_VERSION_MISMATCH_CANDIDATE
      : hasYellow
        ? VERSION_BINDING_STATUS.YELLOW_VERSION_FIELD_MISSING
        : VERSION_BINDING_STATUS.GREEN_VERSION_FIELDS_BOUND,
    fields: actualFields,
    expected: expectedFields,
    issues,
    issue_count: issues.length
  };
}

function buildPromptPackageVersionBindingMetadata(input, expected) {
  const result = detectPromptPackageVersionBindingIssues(input, expected);

  return Object.assign({}, result.fields, {
    version_binding_status: result.status,
    version_binding_issues: result.issues,
    version_binding_issue_count: result.issue_count
  });
}

module.exports.VERSION_BINDING_STATUS = VERSION_BINDING_STATUS;
module.exports.normalizePromptPackageVersionFields = normalizePromptPackageVersionFields;
module.exports.detectPromptPackageVersionBindingIssues = detectPromptPackageVersionBindingIssues;
module.exports.buildPromptPackageVersionBindingMetadata = buildPromptPackageVersionBindingMetadata;
/* ST4_W45_PROMPT_PACKAGE_VERSION_BINDING_END */

