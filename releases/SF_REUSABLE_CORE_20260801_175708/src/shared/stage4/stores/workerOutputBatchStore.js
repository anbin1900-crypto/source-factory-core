'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const base = require('./workerOutputBatchStore.base');
const correlation = require('../p1CommandCorrelationContract');

function safeString(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch (_error) { return String(value); }
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.assign({}, value)
    : {};
}

function safeArray(value) {
  if (Array.isArray(value)) return value.slice();
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function createRecordId(prefix) {
  const safePrefix = safeString(prefix || 'worker_output').replace(/[^a-zA-Z0-9_-]/g, '_');
  if (typeof crypto.randomUUID === 'function') {
    return `${safePrefix}_${crypto.randomUUID()}`;
  }
  return `${safePrefix}_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
}

function normalizeIsoTimestamp(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function normalizeStatus(value) {
  const status = safeString(value || 'PENDING').trim().toUpperCase();
  return base.WORKER_OUTPUT_STATUS &&
    Object.prototype.hasOwnProperty.call(base.WORKER_OUTPUT_STATUS, status)
    ? base.WORKER_OUTPUT_STATUS[status]
    : 'PENDING';
}

function normalizePanelCommandSummary(value) {
  const source = safeObject(value);
  return {
    hasPanelCommand: Boolean(source.hasPanelCommand || source.has_panel_command),
    route: safeString(source.route),
    action: safeString(source.action),
    commandId: safeString(source.commandId || source.command_id),
    summaryText: safeString(source.summaryText || source.summary_text || source.summary)
  };
}

function normalizeWorkerReport(value) {
  const source = safeObject(value);
  return {
    workerId: safeString(source.workerId || source.worker_id),
    taskId: safeString(source.taskId || source.task_id),
    workerFunctionClass: safeString(source.workerFunctionClass || source.worker_function_class),
    filesCreated: safeArray(source.filesCreated || source.files_created).map(safeString),
    filesModified: safeArray(source.filesModified || source.files_modified).map(safeString),
    patchRequestsCreated: safeArray(source.patchRequestsCreated || source.patch_requests_created).map(safeString),
    testsRun: safeArray(source.testsRun || source.tests_run).map(safeString),
    testsNotRun: safeArray(source.testsNotRun || source.tests_not_run).map(safeString),
    classContractStatus: safeString(source.classContractStatus || source.class_contract_status),
    priority0Status: safeString(source.priority0Status || source.priority_0_status),
    knownRisks: safeString(source.knownRisks || source.known_risks),
    nextNeeded: safeString(source.nextNeeded || source.next_needed)
  };
}

function normalizeSourceFileCandidate(value) {
  const source = safeObject(value);
  return {
    path: safeString(source.path),
    language: safeString(source.language),
    purpose: safeString(source.purpose),
    operation: safeString(source.operation),
    ownerWorker: safeString(source.ownerWorker || source.owner_worker),
    targetStage: safeString(source.targetStage || source.target_stage),
    contentLength: Number.isFinite(Number(source.contentLength))
      ? Number(source.contentLength)
      : safeString(source.content || source.rawContent).length,
    blockIndex: Number.isFinite(Number(source.blockIndex)) ? Number(source.blockIndex) : null
  };
}

function createWorkerOutputBatch(input) {
  return correlation.attachCorrelation(base.createWorkerOutputBatch(input), input, input && input.metadata);
}

function createWorkerOutputRecord(input) {
  const source = input && typeof input === 'object' ? input : {};
  const record = {
    recordId: safeString(source.recordId || createRecordId('worker_output')),
    eventType: base.WORKER_OUTPUT_BATCH_EVENT_TYPE.WORKER_OUTPUT_ADDED,
    batchId: safeString(source.batchId || source.batch_id),
    terminal: safeString(source.terminal || base.DEFAULT_TERMINAL),
    receivedAt: normalizeIsoTimestamp(source.receivedAt || source.createdAt),
    workerId: safeString(source.workerId || source.worker_id),
    taskId: safeString(source.taskId || source.task_id),
    promptId: safeString(source.promptId || source.prompt_id),
    outputId: safeString(source.outputId || source.output_id),
    status: normalizeStatus(source.status),
    rawText: safeString(source.rawText || source.raw_text),
    sourceFileCandidates: safeArray(source.sourceFileCandidates || source.source_file_candidates)
      .map(normalizeSourceFileCandidate),
    workerReport: normalizeWorkerReport(source.workerReport || source.worker_report),
    panelCommandSummary: normalizePanelCommandSummary(
      source.panelCommandSummary || source.panel_command_summary
    ),
    notes: safeString(source.notes)
  };
  return correlation.attachCorrelation(
    record,
    source,
    source.metadata,
    source.panelCommandSummary,
    source.panel_command_summary,
    source.workerReport,
    source.worker_report
  );
}

function appendJsonLine(filePath, record) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
  return record;
}

function addWorkerOutputToBatch(filePath, input) {
  const record = createWorkerOutputRecord(input);
  if (!record.batchId) {
    throw new Error('addWorkerOutputToBatch requires input.batchId.');
  }
  return appendJsonLine(filePath, record);
}

function readRecords(filePathOrRecords) {
  if (Array.isArray(filePathOrRecords)) return filePathOrRecords.slice();
  if (!filePathOrRecords || !fs.existsSync(filePathOrRecords)) return [];
  return fs.readFileSync(filePathOrRecords, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function summarizeWorkerOutputBatch(filePathOrRecords, batchId) {
  const records = readRecords(filePathOrRecords);
  const summary = base.summarizeWorkerOutputBatch(records, batchId);
  const matching = records.filter((record) => record && record.batchId === String(batchId || ''));
  return correlation.attachCorrelation.apply(null, [summary].concat(matching));
}

function listPendingWorkerOutputs(filePathOrRecords, batchId) {
  return base.listPendingWorkerOutputs(filePathOrRecords, batchId)
    .map((record) => correlation.attachCorrelation(record));
}

module.exports = Object.assign({}, base, {
  createWorkerOutputBatch,
  createWorkerOutputRecord,
  addWorkerOutputToBatch,
  summarizeWorkerOutputBatch,
  listPendingWorkerOutputs,
  __a4P1CorrelationRepair: {
    version: 'A4_P1_PANEL_WORKER_CORRELATION_REPAIR_V2',
    storage_layer: 'WORKER_OUTPUT_BATCH_STORE',
    new_runtime: false
  }
});
