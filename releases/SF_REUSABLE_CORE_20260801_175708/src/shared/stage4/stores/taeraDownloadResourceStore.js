'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_TERMINAL = 'TAERA';

const TAERA_RESOURCE_STATUS = Object.freeze({
  CANDIDATE: 'CANDIDATE',
  QUEUED: 'QUEUED',
  DOWNLOADED: 'DOWNLOADED',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED'
});

const DEFAULT_RESOURCE_CLASSIFICATION = Object.freeze({
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
  const safePrefix = toSafeString(prefix || 'taera_resource').replace(/[^a-zA-Z0-9_-]/g, '_');

  if (typeof crypto.randomUUID === 'function') {
    return `${safePrefix}_${crypto.randomUUID()}`;
  }

  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const randomHex = crypto.randomBytes(8).toString('hex');
  return `${safePrefix}_${timestamp}_${randomHex}`;
}

function normalizeStatus(status) {
  const normalized = toSafeString(status || TAERA_RESOURCE_STATUS.CANDIDATE).trim().toUpperCase();

  if (Object.prototype.hasOwnProperty.call(TAERA_RESOURCE_STATUS, normalized)) {
    return TAERA_RESOURCE_STATUS[normalized];
  }

  return TAERA_RESOURCE_STATUS.CANDIDATE;
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

function normalizeResourceCandidate(value) {
  if (!value) {
    return {
      resourceType: 'UNKNOWN',
      url: '',
      fileName: '',
      mimeType: '',
      label: '',
      sourceText: ''
    };
  }

  if (typeof value === 'string') {
    return {
      resourceType: 'URL',
      url: value,
      fileName: '',
      mimeType: '',
      label: '',
      sourceText: value
    };
  }

  const candidate = toSafeObject(value, {});
  return {
    resourceType: toSafeString(candidate.resourceType || candidate.type || 'UNKNOWN').toUpperCase(),
    url: toSafeString(candidate.url || candidate.href || candidate.link),
    fileName: toSafeString(candidate.fileName || candidate.filename || candidate.name),
    mimeType: toSafeString(candidate.mimeType || candidate.contentType),
    label: toSafeString(candidate.label || candidate.title),
    sourceText: toSafeString(candidate.sourceText || candidate.text || candidate.rawText)
  };
}

function createTaeraResourceRecord(input) {
  const source = input && typeof input === 'object' ? input : {};

  const receivedAt = source.receivedAt
    ? new Date(source.receivedAt).toISOString()
    : new Date().toISOString();

  const resource = normalizeResourceCandidate(source.resource || source.candidate || source.url || source.fileName);

  return {
    recordId: toSafeString(source.recordId || createRecordId('taera_resource')),
    terminal: toSafeString(source.terminal || DEFAULT_TERMINAL),
    receivedAt,
    sourceWindowId: toSafeString(source.sourceWindowId),
    promptId: toSafeString(source.promptId),
    outputId: toSafeString(source.outputId),
    status: normalizeStatus(source.status),
    resource,
    tags: toSafeArray(source.tags).map(toSafeString),
    classification: toSafeObject(source.classification, DEFAULT_RESOURCE_CLASSIFICATION),
    panelCommandSummary: normalizePanelCommandSummary(source.panelCommandSummary),
    statusHistory: [
      {
        status: normalizeStatus(source.status),
        changedAt: receivedAt,
        reason: toSafeString(source.statusReason || 'initial resource record')
      }
    ],
    notes: toSafeString(source.notes)
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

function appendTaeraResourceRecord(filePath, input) {
  const record = createTaeraResourceRecord(input);
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
      status: TAERA_RESOURCE_STATUS.FAILED,
      parseError: error.message,
      rawLine: trimmed
    };
  }
}

function readJsonLineRecords(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map(parseJsonLine)
    .filter(Boolean);
}

function writeJsonLineRecords(filePath, records) {
  ensureParentDirectory(filePath);
  const content = records.map((record) => JSON.stringify(record)).join('\n');
  fs.writeFileSync(filePath, content ? `${content}\n` : '', 'utf8');
  return records;
}

function updateTaeraResourceStatus(filePath, recordId, nextStatus, options) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('updateTaeraResourceStatus requires a non-empty filePath string.');
  }

  if (!recordId || typeof recordId !== 'string') {
    throw new Error('updateTaeraResourceStatus requires a non-empty recordId string.');
  }

  const status = normalizeStatus(nextStatus);
  const changeOptions = options && typeof options === 'object' ? options : {};
  const changedAt = changeOptions.changedAt
    ? new Date(changeOptions.changedAt).toISOString()
    : new Date().toISOString();

  const records = readJsonLineRecords(filePath);
  let updatedRecord = null;

  const updatedRecords = records.map((record) => {
    if (!record || record.recordId !== recordId) {
      return record;
    }

    const statusHistory = Array.isArray(record.statusHistory)
      ? record.statusHistory.slice()
      : [];

    statusHistory.push({
      status,
      changedAt,
      reason: toSafeString(changeOptions.reason),
      managerId: toSafeString(changeOptions.managerId),
      outputPath: toSafeString(changeOptions.outputPath),
      errorMessage: toSafeString(changeOptions.errorMessage)
    });

    updatedRecord = Object.assign({}, record, {
      status,
      updatedAt: changedAt,
      statusReason: toSafeString(changeOptions.reason),
      statusHistory
    });

    return updatedRecord;
  });

  if (!updatedRecord) {
    return {
      updated: false,
      recordId,
      status,
      reason: 'record_not_found'
    };
  }

  writeJsonLineRecords(filePath, updatedRecords);

  return {
    updated: true,
    recordId,
    status,
    record: updatedRecord
  };
}

module.exports = {
  DEFAULT_TERMINAL,
  TAERA_RESOURCE_STATUS,
  DEFAULT_RESOURCE_CLASSIFICATION,
  createTaeraResourceRecord,
  appendTaeraResourceRecord,
  updateTaeraResourceStatus
};