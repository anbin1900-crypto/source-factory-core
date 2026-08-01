'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PANEL_RECORD_TYPE = Object.freeze({
  PANEL_RECORD: 'PANEL_RECORD',
  EXECUTION_RESULT: 'EXECUTION_RESULT',
  ERROR_REPORT: 'ERROR_REPORT',
  COMMAND_QUEUE_EVENT: 'COMMAND_QUEUE_EVENT',
  WORKER_INBOX_EVENT: 'WORKER_INBOX_EVENT'
});

const EXECUTION_STATUS = Object.freeze({
  NOT_RUN: 'NOT_RUN',
  RUNNING: 'RUNNING',
  PASS: 'PASS',
  FAIL: 'FAIL',
  ERROR: 'ERROR',
  SKIPPED: 'SKIPPED',
  UNKNOWN: 'UNKNOWN'
});

const DEFAULT_TERMINAL = 'ALL';

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
  const safePrefix = toSafeString(prefix || 'panel_record').replace(/[^a-zA-Z0-9_-]/g, '_');

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

function normalizeRecordType(recordType) {
  const normalized = toSafeString(recordType || PANEL_RECORD_TYPE.PANEL_RECORD).trim().toUpperCase();

  if (Object.prototype.hasOwnProperty.call(PANEL_RECORD_TYPE, normalized)) {
    return PANEL_RECORD_TYPE[normalized];
  }

  return PANEL_RECORD_TYPE.PANEL_RECORD;
}

function normalizeExecutionStatus(status, hasExecutionEvidence) {
  const normalized = toSafeString(status || '').trim().toUpperCase();

  if (!normalized) {
    return hasExecutionEvidence ? EXECUTION_STATUS.UNKNOWN : EXECUTION_STATUS.NOT_RUN;
  }

  if (!Object.prototype.hasOwnProperty.call(EXECUTION_STATUS, normalized)) {
    return hasExecutionEvidence ? EXECUTION_STATUS.UNKNOWN : EXECUTION_STATUS.NOT_RUN;
  }

  if (EXECUTION_STATUS[normalized] === EXECUTION_STATUS.PASS && !hasExecutionEvidence) {
    return EXECUTION_STATUS.NOT_RUN;
  }

  return EXECUTION_STATUS[normalized];
}

function normalizeExitCode(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return null;
  }

  return numberValue;
}

function hasExecutionEvidence(source) {
  if (!source || typeof source !== 'object') {
    return false;
  }

  if (source.executed === true || source.didRun === true || source.did_run === true) {
    return true;
  }

  if (normalizeExitCode(source.exitCode || source.exit_code) !== null) {
    return true;
  }

  if (source.startedAt || source.started_at || source.finishedAt || source.finished_at) {
    return true;
  }

  return false;
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

function createPanelRecord(input) {
  const source = input && typeof input === 'object' ? input : {};
  const recordType = normalizeRecordType(source.recordType || source.record_type);
  const createdAt = normalizeIsoTimestamp(source.createdAt || source.created_at || source.receivedAt || source.received_at);

  return {
    recordId: toSafeString(source.recordId || source.record_id || createRecordId(recordType.toLowerCase())),
    recordType,
    terminal: toSafeString(source.terminal || DEFAULT_TERMINAL),
    createdAt,
    batchId: toSafeString(source.batchId || source.batch_id),
    commandId: toSafeString(source.commandId || source.command_id),
    promptId: toSafeString(source.promptId || source.prompt_id),
    outputId: toSafeString(source.outputId || source.output_id),
    sourceWindowId: toSafeString(source.sourceWindowId || source.source_window_id),
    routeTarget: toSafeString(source.routeTarget || source.route_target),
    eventName: toSafeString(source.eventName || source.event_name),
    status: toSafeString(source.status),
    title: toSafeString(source.title),
    message: toSafeString(source.message),
    payload: toSafeObject(source.payload, {}),
    panelCommandSummary: normalizePanelCommandSummary(source.panelCommandSummary || source.panel_command_summary),
    errorReport: recordType === PANEL_RECORD_TYPE.ERROR_REPORT
      ? normalizeErrorReport(source.errorReport || source.error_report || source.error)
      : null,
    metadata: toSafeObject(source.metadata, {})
  };
}

function createExecutionResultRecord(input) {
  const source = input && typeof input === 'object' ? input : {};
  const createdAt = normalizeIsoTimestamp(source.createdAt || source.created_at || source.receivedAt || source.received_at);
  const startedAt = source.startedAt || source.started_at
    ? normalizeIsoTimestamp(source.startedAt || source.started_at)
    : '';
  const finishedAt = source.finishedAt || source.finished_at
    ? normalizeIsoTimestamp(source.finishedAt || source.finished_at)
    : '';
  const exitCode = normalizeExitCode(source.exitCode || source.exit_code);
  const evidence = hasExecutionEvidence(source);
  const status = normalizeExecutionStatus(source.status || source.resultStatus || source.result_status, evidence);

  return {
    recordId: toSafeString(source.recordId || source.record_id || createRecordId('execution_result')),
    recordType: PANEL_RECORD_TYPE.EXECUTION_RESULT,
    terminal: toSafeString(source.terminal || DEFAULT_TERMINAL),
    createdAt,
    batchId: toSafeString(source.batchId || source.batch_id),
    commandId: toSafeString(source.commandId || source.command_id),
    promptId: toSafeString(source.promptId || source.prompt_id),
    outputId: toSafeString(source.outputId || source.output_id),
    workerId: toSafeString(source.workerId || source.worker_id),
    taskId: toSafeString(source.taskId || source.task_id),
    executionId: toSafeString(source.executionId || source.execution_id || createRecordId('exec')),
    executionKind: toSafeString(source.executionKind || source.execution_kind),
    commandText: toSafeString(source.commandText || source.command_text || source.command),
    cwd: toSafeString(source.cwd || source.workingDirectory || source.working_directory),
    startedAt,
    finishedAt,
    executed: evidence,
    status,
    exitCode,
    stdout: toSafeString(source.stdout),
    stderr: toSafeString(source.stderr),
    outputText: toSafeString(source.outputText || source.output_text),
    errorReport: status === EXECUTION_STATUS.ERROR || status === EXECUTION_STATUS.FAIL
      ? normalizeErrorReport(source.errorReport || source.error_report || source.error)
      : null,
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

function appendPanelRecord(filePath, input) {
  const source = input && typeof input === 'object' ? input : {};
  const recordType = normalizeRecordType(source.recordType || source.record_type);

  if (recordType === PANEL_RECORD_TYPE.EXECUTION_RESULT) {
    return appendJsonLine(filePath, createExecutionResultRecord(source));
  }

  return appendJsonLine(filePath, createPanelRecord(source));
}

module.exports = {
  PANEL_RECORD_TYPE,
  EXECUTION_STATUS,
  DEFAULT_TERMINAL,
  createPanelRecord,
  createExecutionResultRecord,
  appendPanelRecord
};