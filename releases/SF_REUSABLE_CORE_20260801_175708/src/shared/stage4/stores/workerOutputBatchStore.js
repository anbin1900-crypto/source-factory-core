'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_TERMINAL = 'LAO';

const WORKER_OUTPUT_BATCH_EVENT_TYPE = Object.freeze({
  BATCH_CREATED: 'BATCH_CREATED',
  WORKER_OUTPUT_ADDED: 'WORKER_OUTPUT_ADDED',
  BATCH_SUMMARY_CREATED: 'BATCH_SUMMARY_CREATED'
});

const WORKER_OUTPUT_STATUS = Object.freeze({
  PENDING: 'PENDING',
  COLLECTED: 'COLLECTED',
  READY_FOR_GATE: 'READY_FOR_GATE',
  GREEN: 'GREEN',
  YELLOW: 'YELLOW',
  RED: 'RED',
  BLACK: 'BLACK',
  SKIPPED: 'SKIPPED'
});

function toSafeString(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch (error) {
    return String(value);
  }
}

function toSafeObject(value, fallback) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.assign({}, value);
  }

  return Object.assign({}, fallback || {});
}

function toSafeArray(value) {
  if (Array.isArray(value)) {
    return value.slice();
  }

  if (value === null || value === undefined || value === '') {
    return [];
  }

  return [value];
}

function createRecordId(prefix) {
  const safePrefix = toSafeString(prefix || 'worker_output_batch').replace(/[^a-zA-Z0-9_-]/g, '_');

  if (typeof crypto.randomUUID === 'function') {
    return `${safePrefix}_${crypto.randomUUID()}`;
  }

  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const randomHex = crypto.randomBytes(8).toString('hex');
  return `${safePrefix}_${timestamp}_${randomHex}`;
}

function normalizeIsoTimestamp(value) {
  if (!value) {
    return new Date().toISOString();
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }

  return date.toISOString();
}

function normalizeStatus(status) {
  const normalized = toSafeString(status || WORKER_OUTPUT_STATUS.PENDING).trim().toUpperCase();

  if (Object.prototype.hasOwnProperty.call(WORKER_OUTPUT_STATUS, normalized)) {
    return WORKER_OUTPUT_STATUS[normalized];
  }

  return WORKER_OUTPUT_STATUS.PENDING;
}

function normalizeSourceFileCandidate(value) {
  const candidate = toSafeObject(value, {});

  return {
    path: toSafeString(candidate.path),
    language: toSafeString(candidate.language),
    purpose: toSafeString(candidate.purpose),
    operation: toSafeString(candidate.operation),
    ownerWorker: toSafeString(candidate.ownerWorker || candidate.owner_worker),
    targetStage: toSafeString(candidate.targetStage || candidate.target_stage),
    contentLength: Number.isFinite(Number(candidate.contentLength))
      ? Number(candidate.contentLength)
      : toSafeString(candidate.content || candidate.rawContent).length,
    blockIndex: Number.isFinite(Number(candidate.blockIndex))
      ? Number(candidate.blockIndex)
      : null
  };
}

function normalizeWorkerReport(value) {
  const report = toSafeObject(value, {});

  return {
    workerId: toSafeString(report.workerId || report.worker_id),
    taskId: toSafeString(report.taskId || report.task_id),
    workerFunctionClass: toSafeString(report.workerFunctionClass || report.worker_function_class),
    filesCreated: toSafeArray(report.filesCreated || report.files_created).map(toSafeString),
    filesModified: toSafeArray(report.filesModified || report.files_modified).map(toSafeString),
    patchRequestsCreated: toSafeArray(report.patchRequestsCreated || report.patch_requests_created).map(toSafeString),
    testsRun: toSafeArray(report.testsRun || report.tests_run).map(toSafeString),
    testsNotRun: toSafeArray(report.testsNotRun || report.tests_not_run).map(toSafeString),
    classContractStatus: toSafeString(report.classContractStatus || report.class_contract_status),
    priority0Status: toSafeString(report.priority0Status || report.priority_0_status),
    knownRisks: toSafeString(report.knownRisks || report.known_risks),
    nextNeeded: toSafeString(report.nextNeeded || report.next_needed)
  };
}

function normalizePanelCommandSummary(value) {
  if (!value) {
    return {
      hasPanelCommand: false,
      route: '',
      action: '',
      commandId: '',
      summaryText: ''
    };
  }

  if (typeof value === 'string') {
    return {
      hasPanelCommand: value.trim().length > 0,
      route: '',
      action: '',
      commandId: '',
      summaryText: value
    };
  }

  const summary = toSafeObject(value, {});
  return {
    hasPanelCommand: Boolean(summary.hasPanelCommand),
    route: toSafeString(summary.route),
    action: toSafeString(summary.action),
    commandId: toSafeString(summary.commandId),
    summaryText: toSafeString(summary.summaryText || summary.summary || '')
  };
}

function ensureParentDirectory(filePath) {
  const targetDirectory = path.dirname(filePath);
  fs.mkdirSync(targetDirectory, { recursive: true });
}

function appendJsonLine(filePath, record) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('appendJsonLine requires a non-empty filePath string.');
  }

  ensureParentDirectory(filePath);
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
  return record;
}

function parseJsonLine(line) {
  const trimmed = toSafeString(line).trim();

  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    return {
      recordId: '',
      eventType: 'PARSE_ERROR',
      batchId: '',
      createdAt: new Date().toISOString(),
      parseError: error.message,
      rawLine: trimmed
    };
  }
}

function readJsonLineRecords(filePath) {
  if (!filePath || typeof filePath !== 'string' || !fs.existsSync(filePath)) {
    return [];
  }

  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map(parseJsonLine)
    .filter(Boolean);
}

function createWorkerOutputBatch(input) {
  const source = input && typeof input === 'object' ? input : {};
  const createdAt = normalizeIsoTimestamp(source.createdAt || source.receivedAt);

  return {
    recordId: toSafeString(source.recordId || createRecordId('worker_output_batch')),
    eventType: WORKER_OUTPUT_BATCH_EVENT_TYPE.BATCH_CREATED,
    batchId: toSafeString(source.batchId || createRecordId('batch')),
    terminal: toSafeString(source.terminal || DEFAULT_TERMINAL),
    createdAt,
    targetStage: toSafeString(source.targetStage || source.target_stage),
    promptPackageId: toSafeString(source.promptPackageId || source.prompt_package_id),
    promptPackageVersion: toSafeString(source.promptPackageVersion || source.prompt_package_version),
    commanderId: toSafeString(source.commanderId || source.commander_id),
    expectedWorkerIds: toSafeArray(source.expectedWorkerIds || source.expected_worker_ids).map(toSafeString),
    status: 'OPEN',
    metadata: toSafeObject(source.metadata, {})
  };
}

function createWorkerOutputRecord(input) {
  const source = input && typeof input === 'object' ? input : {};
  const receivedAt = normalizeIsoTimestamp(source.receivedAt || source.createdAt);

  return {
    recordId: toSafeString(source.recordId || createRecordId('worker_output')),
    eventType: WORKER_OUTPUT_BATCH_EVENT_TYPE.WORKER_OUTPUT_ADDED,
    batchId: toSafeString(source.batchId || source.batch_id),
    terminal: toSafeString(source.terminal || DEFAULT_TERMINAL),
    receivedAt,
    workerId: toSafeString(source.workerId || source.worker_id),
    taskId: toSafeString(source.taskId || source.task_id),
    promptId: toSafeString(source.promptId || source.prompt_id),
    outputId: toSafeString(source.outputId || source.output_id),
    status: normalizeStatus(source.status || WORKER_OUTPUT_STATUS.PENDING),
    rawText: toSafeString(source.rawText || source.raw_text),
    sourceFileCandidates: toSafeArray(source.sourceFileCandidates || source.source_file_candidates)
      .map(normalizeSourceFileCandidate),
    workerReport: normalizeWorkerReport(source.workerReport || source.worker_report),
    panelCommandSummary: normalizePanelCommandSummary(source.panelCommandSummary || source.panel_command_summary),
    notes: toSafeString(source.notes)
  };
}

function addWorkerOutputToBatch(filePath, input) {
  const record = createWorkerOutputRecord(input);

  if (!record.batchId) {
    throw new Error('addWorkerOutputToBatch requires input.batchId.');
  }

  return appendJsonLine(filePath, record);
}

function summarizeWorkerOutputBatch(filePathOrRecords, batchId) {
  const records = Array.isArray(filePathOrRecords)
    ? filePathOrRecords.slice()
    : readJsonLineRecords(filePathOrRecords);

  const targetBatchId = toSafeString(batchId);
  const batchRecords = records.filter((record) => record && record.batchId === targetBatchId);
  const createdRecords = batchRecords.filter((record) => record.eventType === WORKER_OUTPUT_BATCH_EVENT_TYPE.BATCH_CREATED);
  const outputRecords = batchRecords.filter((record) => record.eventType === WORKER_OUTPUT_BATCH_EVENT_TYPE.WORKER_OUTPUT_ADDED);

  const workerIds = Array.from(new Set(outputRecords.map((record) => record.workerId).filter(Boolean)));
  const taskIds = Array.from(new Set(outputRecords.map((record) => record.taskId).filter(Boolean)));

  const statusCounts = outputRecords.reduce((accumulator, record) => {
    const status = normalizeStatus(record.status);
    accumulator[status] = (accumulator[status] || 0) + 1;
    return accumulator;
  }, {});

  const sourceFileCandidateCount = outputRecords.reduce((total, record) => {
    return total + toSafeArray(record.sourceFileCandidates).length;
  }, 0);

  const pendingOutputs = outputRecords.filter((record) => {
    const status = normalizeStatus(record.status);
    return status === WORKER_OUTPUT_STATUS.PENDING || status === WORKER_OUTPUT_STATUS.COLLECTED;
  });

  const latestCreatedRecord = createdRecords[createdRecords.length - 1] || null;

  return {
    recordId: createRecordId('worker_output_batch_summary'),
    eventType: WORKER_OUTPUT_BATCH_EVENT_TYPE.BATCH_SUMMARY_CREATED,
    batchId: targetBatchId,
    summarizedAt: new Date().toISOString(),
    batchExists: Boolean(latestCreatedRecord || outputRecords.length > 0),
    targetStage: latestCreatedRecord ? toSafeString(latestCreatedRecord.targetStage) : '',
    promptPackageId: latestCreatedRecord ? toSafeString(latestCreatedRecord.promptPackageId) : '',
    promptPackageVersion: latestCreatedRecord ? toSafeString(latestCreatedRecord.promptPackageVersion) : '',
    expectedWorkerIds: latestCreatedRecord ? toSafeArray(latestCreatedRecord.expectedWorkerIds).map(toSafeString) : [],
    workerIds,
    taskIds,
    outputCount: outputRecords.length,
    sourceFileCandidateCount,
    statusCounts,
    pendingCount: pendingOutputs.length,
    readyForGateCount: statusCounts[WORKER_OUTPUT_STATUS.READY_FOR_GATE] || 0,
    redCount: statusCounts[WORKER_OUTPUT_STATUS.RED] || 0,
    yellowCount: statusCounts[WORKER_OUTPUT_STATUS.YELLOW] || 0,
    greenCount: statusCounts[WORKER_OUTPUT_STATUS.GREEN] || 0,
    blackCount: statusCounts[WORKER_OUTPUT_STATUS.BLACK] || 0,
    pendingRecordIds: pendingOutputs.map((record) => record.recordId).filter(Boolean),
    nextRecommendedAction: pendingOutputs.length > 0
      ? 'Collect or classify pending worker outputs before assembly queue.'
      : 'Send summarized batch to Worker 07 assembly queue or Commander Gate.'
  };
}

function listPendingWorkerOutputs(filePathOrRecords, batchId) {
  const records = Array.isArray(filePathOrRecords)
    ? filePathOrRecords.slice()
    : readJsonLineRecords(filePathOrRecords);

  const targetBatchId = toSafeString(batchId);

  return records.filter((record) => {
    if (!record || record.eventType !== WORKER_OUTPUT_BATCH_EVENT_TYPE.WORKER_OUTPUT_ADDED) {
      return false;
    }

    if (targetBatchId && record.batchId !== targetBatchId) {
      return false;
    }

    const status = normalizeStatus(record.status);
    return status === WORKER_OUTPUT_STATUS.PENDING || status === WORKER_OUTPUT_STATUS.COLLECTED;
  });
}

module.exports = {
  DEFAULT_TERMINAL,
  WORKER_OUTPUT_BATCH_EVENT_TYPE,
  WORKER_OUTPUT_STATUS,
  createWorkerOutputBatch,
  addWorkerOutputToBatch,
  summarizeWorkerOutputBatch,
  listPendingWorkerOutputs
};
/* SOURCE_FACTORY_W54_PROJECT_PANEL_NAMESPACE_METADATA_START */
(function sfW54InstallProjectPanelNamespaceMetadata() {
  if (typeof module === "undefined" || !module.exports) return;
  if (module.exports.__sfW54ProjectPanelNamespaceMetadataApplied_workerOutputBatchStore) return;

  var helper = null;
  try {
    helper = require("../projectPanelIdentityHelper");
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
    "createWorkerOutputBatchRecord",
    "createWorkerOutputRecord",
    "addWorkerOutputToBatch",
    "appendWorkerOutputBatch",
    "buildWorkerOutputBatchSummary"
  ];
  var wrappedExports = [];
  candidateExports.forEach(function wrapCandidate(exportName) {
    if (wrapExport(exportName)) wrappedExports.push(exportName);
  });

  Object.defineProperty(module.exports, "__sfW54ProjectPanelNamespaceMetadataApplied_workerOutputBatchStore", { value: true, enumerable: false });
  module.exports.__sfW54ProjectPanelNamespaceMetadata = Object.assign({}, module.exports.__sfW54ProjectPanelNamespaceMetadata || {}, {
    version: "W54_PROJECT_PANEL_NAMESPACE_METADATA_COMMANDER_HOTFIX_V1",
    target_key: "workerOutputBatchStore",
    scope: "worker_output_batch_new_record_envelope_only",
    helper_require: "../projectPanelIdentityHelper",
    candidate_exports: candidateExports,
    wrapped_exports: wrappedExports,
    metadata_fields: ["project_id", "project_name", "panel_id", "panel_instance_id", "project_panel_identity"],
    old_records_migration: "forbidden",
    legacy_records_without_project_id: "allowed"
  });
}());
/* SOURCE_FACTORY_W54_PROJECT_PANEL_NAMESPACE_METADATA_END */
