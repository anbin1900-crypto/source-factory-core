'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_TERMINAL = 'LAO';

const LAO_UNIT_TYPE = Object.freeze({
  SOURCE_FILE: 'SOURCE_FILE',
  WORKER_REPORT: 'WORKER_REPORT',
  ERROR_REPORT: 'ERROR_REPORT',
  COMMAND_TEXT: 'COMMAND_TEXT',
  UNKNOWN: 'UNKNOWN'
});

const DEFAULT_CLASSIFICATION = Object.freeze({
  status: 'UNCLASSIFIED',
  labels: [],
  confidence: null,
  reason: ''
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
  const safePrefix = toSafeString(prefix || 'lao_source_unit').replace(/[^a-zA-Z0-9_-]/g, '_');

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

function normalizeUnitType(unitType) {
  const normalized = toSafeString(unitType || LAO_UNIT_TYPE.UNKNOWN).trim().toUpperCase();

  if (Object.prototype.hasOwnProperty.call(LAO_UNIT_TYPE, normalized)) {
    return LAO_UNIT_TYPE[normalized];
  }

  return LAO_UNIT_TYPE.UNKNOWN;
}

function normalizePositiveInteger(value, fallback) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue < 0) {
    return fallback;
  }

  return Math.floor(numberValue);
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

function normalizeSourceFileMeta(value) {
  const source = toSafeObject(value, {});

  return {
    path: toSafeString(source.path),
    language: toSafeString(source.language),
    purpose: toSafeString(source.purpose),
    operation: toSafeString(source.operation),
    ownerWorker: toSafeString(source.ownerWorker || source.owner_worker),
    targetStage: toSafeString(source.targetStage || source.target_stage),
    contentLength: Number.isFinite(Number(source.contentLength))
      ? Number(source.contentLength)
      : toSafeString(source.contentText || source.content || source.rawContent).length
  };
}

function normalizeWorkerReport(value) {
  if (!value) {
    return {
      workerId: '',
      taskId: '',
      workerFunctionClass: '',
      filesCreated: [],
      filesModified: [],
      patchRequestsCreated: [],
      reportOnlyArtifacts: [],
      testsRun: [],
      testsNotRun: [],
      classContractStatus: '',
      priority0Status: '',
      knownRisks: '',
      nextNeeded: ''
    };
  }

  if (typeof value === 'string') {
    return {
      workerId: '',
      taskId: '',
      workerFunctionClass: '',
      filesCreated: [],
      filesModified: [],
      patchRequestsCreated: [],
      reportOnlyArtifacts: [],
      testsRun: [],
      testsNotRun: [],
      classContractStatus: '',
      priority0Status: '',
      knownRisks: '',
      nextNeeded: '',
      rawReportText: value
    };
  }

  const report = toSafeObject(value, {});
  return {
    workerId: toSafeString(report.workerId || report.worker_id),
    taskId: toSafeString(report.taskId || report.task_id),
    workerFunctionClass: toSafeString(report.workerFunctionClass || report.worker_function_class),
    filesCreated: toSafeArray(report.filesCreated || report.files_created).map(toSafeString),
    filesModified: toSafeArray(report.filesModified || report.files_modified).map(toSafeString),
    patchRequestsCreated: toSafeArray(report.patchRequestsCreated || report.patch_requests_created).map(toSafeString),
    reportOnlyArtifacts: toSafeArray(report.reportOnlyArtifacts || report.report_only_artifacts).map(toSafeString),
    testsRun: toSafeArray(report.testsRun || report.tests_run).map(toSafeString),
    testsNotRun: toSafeArray(report.testsNotRun || report.tests_not_run).map(toSafeString),
    classContractStatus: toSafeString(report.classContractStatus || report.class_contract_status),
    priority0Status: toSafeString(report.priority0Status || report.priority_0_status),
    knownRisks: toSafeString(report.knownRisks || report.known_risks),
    nextNeeded: toSafeString(report.nextNeeded || report.next_needed)
  };
}

function normalizeErrorReport(value) {
  if (!value) {
    return {
      errorCode: '',
      errorMessage: '',
      errorStack: '',
      sourceFile: '',
      line: null,
      column: null,
      severity: 'UNKNOWN'
    };
  }

  if (value instanceof Error) {
    return {
      errorCode: toSafeString(value.code),
      errorMessage: toSafeString(value.message),
      errorStack: toSafeString(value.stack),
      sourceFile: '',
      line: null,
      column: null,
      severity: 'ERROR'
    };
  }

  if (typeof value === 'string') {
    return {
      errorCode: '',
      errorMessage: value,
      errorStack: '',
      sourceFile: '',
      line: null,
      column: null,
      severity: 'ERROR'
    };
  }

  const report = toSafeObject(value, {});
  return {
    errorCode: toSafeString(report.errorCode || report.code),
    errorMessage: toSafeString(report.errorMessage || report.message),
    errorStack: toSafeString(report.errorStack || report.stack),
    sourceFile: toSafeString(report.sourceFile || report.filePath || report.path),
    line: Number.isFinite(Number(report.line)) ? Number(report.line) : null,
    column: Number.isFinite(Number(report.column)) ? Number(report.column) : null,
    severity: toSafeString(report.severity || 'UNKNOWN').toUpperCase()
  };
}

function createLaoSourceUnitRecord(input) {
  const source = input && typeof input === 'object' ? input : {};
  const unitType = normalizeUnitType(source.unitType || source.unit_type);
  const receivedAt = normalizeIsoTimestamp(source.receivedAt || source.received_at || source.createdAt || source.created_at);

  const sourceFileMeta = normalizeSourceFileMeta(source.sourceFile || source.source_file || source);
  const workerReport = unitType === LAO_UNIT_TYPE.WORKER_REPORT
    ? normalizeWorkerReport(source.workerReport || source.worker_report || source.report)
    : null;
  const errorReport = unitType === LAO_UNIT_TYPE.ERROR_REPORT
    ? normalizeErrorReport(source.errorReport || source.error_report || source.error)
    : null;

  return {
    recordId: toSafeString(source.recordId || source.record_id || createRecordId('lao_unit')),
    terminal: toSafeString(source.terminal || DEFAULT_TERMINAL),
    receivedAt,
    sourceWindowId: toSafeString(source.sourceWindowId || source.source_window_id),
    batchId: toSafeString(source.batchId || source.batch_id),
    promptId: toSafeString(source.promptId || source.prompt_id),
    outputId: toSafeString(source.outputId || source.output_id),
    workerId: toSafeString(source.workerId || source.worker_id || sourceFileMeta.ownerWorker || (workerReport ? workerReport.workerId : '')),
    taskId: toSafeString(source.taskId || source.task_id || (workerReport ? workerReport.taskId : '')),
    unitId: toSafeString(source.unitId || source.unit_id || createRecordId('lao_unit_item')),
    unitIndex: normalizePositiveInteger(source.unitIndex || source.unit_index, null),
    unitType,
    sourceFile: unitType === LAO_UNIT_TYPE.SOURCE_FILE ? sourceFileMeta : null,
    workerReport,
    errorReport,
    commandText: unitType === LAO_UNIT_TYPE.COMMAND_TEXT
      ? toSafeString(source.commandText || source.command_text || source.rawText || source.raw_text)
      : '',
    rawText: toSafeString(source.rawText || source.raw_text),
    contentText: toSafeString(source.contentText || source.content_text || source.content),
    classification: toSafeObject(source.classification, DEFAULT_CLASSIFICATION),
    panelCommandSummary: normalizePanelCommandSummary(source.panelCommandSummary || source.panel_command_summary),
    metadata: toSafeObject(source.metadata, {})
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

function appendLaoSourceUnitRecord(filePath, input) {
  const record = createLaoSourceUnitRecord(input);
  return appendJsonLine(filePath, record);
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
      terminal: DEFAULT_TERMINAL,
      receivedAt: new Date().toISOString(),
      unitType: LAO_UNIT_TYPE.ERROR_REPORT,
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

function summarizeLaoRecords(filePathOrRecords, options) {
  const records = Array.isArray(filePathOrRecords)
    ? filePathOrRecords.slice()
    : readJsonLineRecords(filePathOrRecords);

  const summaryOptions = options && typeof options === 'object' ? options : {};
  const batchIdFilter = toSafeString(summaryOptions.batchId || summaryOptions.batch_id);
  const workerIdFilter = toSafeString(summaryOptions.workerId || summaryOptions.worker_id);

  const filteredRecords = records.filter((record) => {
    if (!record) {
      return false;
    }

    if (batchIdFilter && record.batchId !== batchIdFilter) {
      return false;
    }

    if (workerIdFilter && record.workerId !== workerIdFilter) {
      return false;
    }

    return true;
  });

  const unitTypeCounts = filteredRecords.reduce((accumulator, record) => {
    const unitType = normalizeUnitType(record.unitType || record.unit_type);
    accumulator[unitType] = (accumulator[unitType] || 0) + 1;
    return accumulator;
  }, {});

  const sourceFileRecords = filteredRecords.filter((record) => normalizeUnitType(record.unitType) === LAO_UNIT_TYPE.SOURCE_FILE);
  const workerReportRecords = filteredRecords.filter((record) => normalizeUnitType(record.unitType) === LAO_UNIT_TYPE.WORKER_REPORT);
  const errorReportRecords = filteredRecords.filter((record) => normalizeUnitType(record.unitType) === LAO_UNIT_TYPE.ERROR_REPORT);
  const commandTextRecords = filteredRecords.filter((record) => normalizeUnitType(record.unitType) === LAO_UNIT_TYPE.COMMAND_TEXT);

  const sourcePaths = sourceFileRecords
    .map((record) => record.sourceFile && record.sourceFile.path ? record.sourceFile.path : '')
    .filter(Boolean);

  const duplicateSourcePaths = sourcePaths.filter((sourcePath, index) => sourcePaths.indexOf(sourcePath) !== index);
  const uniqueDuplicateSourcePaths = Array.from(new Set(duplicateSourcePaths));

  const workerIds = Array.from(new Set(filteredRecords.map((record) => toSafeString(record.workerId)).filter(Boolean)));
  const taskIds = Array.from(new Set(filteredRecords.map((record) => toSafeString(record.taskId)).filter(Boolean)));
  const batchIds = Array.from(new Set(filteredRecords.map((record) => toSafeString(record.batchId)).filter(Boolean)));

  return {
    recordId: createRecordId('lao_summary'),
    terminal: DEFAULT_TERMINAL,
    summarizedAt: new Date().toISOString(),
    batchIdFilter,
    workerIdFilter,
    totalRecordCount: filteredRecords.length,
    unitTypeCounts,
    sourceFileCount: sourceFileRecords.length,
    workerReportCount: workerReportRecords.length,
    errorReportCount: errorReportRecords.length,
    commandTextCount: commandTextRecords.length,
    unknownCount: unitTypeCounts[LAO_UNIT_TYPE.UNKNOWN] || 0,
    workerIds,
    taskIds,
    batchIds,
    sourcePaths,
    duplicateSourcePaths: uniqueDuplicateSourcePaths,
    hasDuplicateSourcePaths: uniqueDuplicateSourcePaths.length > 0,
    nextRecommendedAction: errorReportRecords.length > 0
      ? 'Review ERROR_REPORT records before assembly.'
      : 'Connect summarized LAO records to Worker 01 extractor output and Commander Gate intake.'
  };
}

module.exports = {
  DEFAULT_TERMINAL,
  LAO_UNIT_TYPE,
  DEFAULT_CLASSIFICATION,
  createLaoSourceUnitRecord,
  appendLaoSourceUnitRecord,
  summarizeLaoRecords
};