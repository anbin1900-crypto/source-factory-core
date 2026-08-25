'use strict';

const EXECUTION_RESULT_SCHEMA_VERSION = '0.1.0';

const EXECUTION_STATUSES = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  SKIP: 'SKIP',
  TOOL_MISSING: 'TOOL_MISSING',
  TIMEOUT: 'TIMEOUT',
  ERROR: 'ERROR',
  NOT_RUN: 'NOT_RUN'
});

const VALID_EXECUTION_STATUSES = Object.freeze(Object.keys(EXECUTION_STATUSES));

function nowIso() {
  return new Date().toISOString();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toSafeString(value, fallback) {
  if (value === undefined || value === null) {
    return fallback || '';
  }

  return String(value);
}

function toSafeArray(value) {
  if (Array.isArray(value)) {
    return value.slice();
  }

  if (value === undefined || value === null || value === '') {
    return [];
  }

  return [value];
}

function toNumberOrNull(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function toDurationMs(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

function simpleHash(input) {
  const text = toSafeString(input, '');
  let hash = 0;

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash).toString(36);
}

function createExecutionResultId(seed) {
  const timestamp = nowIso().replace(/[-:.TZ]/g, '');
  const suffix = simpleHash(seed || timestamp).padStart(4, '0').slice(0, 12);
  return `execution_result_${timestamp}_${suffix}`;
}

function normalizeStatus(rawStatus, source) {
  const statusText = toSafeString(rawStatus, '').trim().toUpperCase();

  if (VALID_EXECUTION_STATUSES.includes(statusText)) {
    return statusText;
  }

  if (statusText === 'NON_ZERO_EXIT') {
    return EXECUTION_STATUSES.FAIL;
  }

  if (statusText === 'INVALID_COMMAND' || statusText === 'SPAWN_ERROR' || statusText === 'CLI_ERROR') {
    return EXECUTION_STATUSES.ERROR;
  }

  if (statusText === 'EXECUTION_RESULT') {
    return source && source.ok === true ? EXECUTION_STATUSES.PASS : EXECUTION_STATUSES.FAIL;
  }

  if (source && source.executed === false) {
    return EXECUTION_STATUSES.NOT_RUN;
  }

  if (source && source.skipped === true) {
    return EXECUTION_STATUSES.SKIP;
  }

  if (source && source.timedOut === true) {
    return EXECUTION_STATUSES.TIMEOUT;
  }

  if (source && source.toolMissing === true) {
    return EXECUTION_STATUSES.TOOL_MISSING;
  }

  if (source && source.ok === true && source.exitCode === 0) {
    return EXECUTION_STATUSES.PASS;
  }

  if (source && source.ok === false && source.exitCode !== undefined && source.exitCode !== null) {
    return EXECUTION_STATUSES.FAIL;
  }

  if (source && source.ok === false) {
    return EXECUTION_STATUSES.ERROR;
  }

  return EXECUTION_STATUSES.NOT_RUN;
}

function inferToolName(source) {
  if (!isPlainObject(source)) {
    return '';
  }

  return toSafeString(
    source.tool ||
      source.toolName ||
      source.mode ||
      source.command ||
      source.pythonCommand ||
      source.nodeCommand ||
      '',
    ''
  );
}

function normalizeExecutionResult(input, context) {
  const source = isPlainObject(input) ? input : {};
  const extra = isPlainObject(context) ? context : {};
  const status = normalizeStatus(source.status, source);
  const createdAt = toSafeString(source.createdAt || extra.createdAt, nowIso());
  const resultSeed = JSON.stringify({
    status,
    command: source.command || '',
    filePath: source.filePath || '',
    tool: inferToolName(source),
    createdAt
  });
  const resultId = toSafeString(source.resultId || source.executionResultId, '') ||
    createExecutionResultId(resultSeed);

  return {
    schemaVersion: EXECUTION_RESULT_SCHEMA_VERSION,
    recordType: 'EXECUTION_RESULT',
    resultId,
    status,
    ok: status === EXECUTION_STATUSES.PASS,
    sourceStatus: toSafeString(source.status, ''),
    tool: inferToolName(source),
    command: toSafeString(source.command, ''),
    args: toSafeArray(source.args),
    filePath: toSafeString(source.filePath || source.file, ''),
    cwd: toSafeString(source.cwd, ''),
    exitCode: toNumberOrNull(source.exitCode),
    stdout: toSafeString(source.stdout, ''),
    stderr: toSafeString(source.stderr, ''),
    errorMessage: toSafeString(source.errorMessage, ''),
    durationMs: toDurationMs(source.durationMs),
    terminalTarget: toSafeString(extra.terminalTarget || source.terminalTarget, 'PANEL'),
    panelIntegrationRole: toSafeString(extra.panelIntegrationRole || source.panelIntegrationRole, '실행 결과 표준화'),
    panelControlLanguageRelevance: Boolean(
      extra.panelControlLanguageRelevance || source.panelControlLanguageRelevance
    ),
    routeTarget: toSafeString(extra.routeTarget || source.routeTarget, 'EXECUTION_RESULT'),
    taskId: toSafeString(extra.taskId || source.taskId, ''),
    workerId: toSafeString(extra.workerId || source.workerId, ''),
    targetStage: toSafeString(
      extra.targetStage || source.targetStage,
      'STAGE4_CLASSIFIER_VALIDATION_PANEL_AUTOMATION'
    ),
    labels: toSafeArray(extra.labels || source.labels),
    metadata: isPlainObject(source.metadata) ? { ...source.metadata } : {},
    raw: source,
    createdAt
  };
}

function collectExecutionResult(records, result, context) {
  const targetRecords = Array.isArray(records) ? records : [];
  const normalized = normalizeExecutionResult(result, context);

  targetRecords.push(normalized);

  return {
    ok: true,
    status: 'EXECUTION_RESULT_COLLECTED',
    record: normalized,
    records: targetRecords,
    summary: summarizeExecutionResults(targetRecords)
  };
}

function summarizeExecutionResults(records) {
  const list = Array.isArray(records) ? records : [];
  const byStatus = {};
  const byTool = {};
  let totalDurationMs = 0;

  VALID_EXECUTION_STATUSES.forEach((status) => {
    byStatus[status] = 0;
  });

  list.forEach((record) => {
    const normalizedRecord = isPlainObject(record) && record.recordType === 'EXECUTION_RESULT'
      ? record
      : normalizeExecutionResult(record);

    const status = normalizeStatus(normalizedRecord.status, normalizedRecord);
    const tool = toSafeString(normalizedRecord.tool, 'unknown') || 'unknown';

    byStatus[status] = (byStatus[status] || 0) + 1;
    byTool[tool] = (byTool[tool] || 0) + 1;
    totalDurationMs += toDurationMs(normalizedRecord.durationMs);
  });

  const passCount = byStatus.PASS || 0;
  const failCount = byStatus.FAIL || 0;
  const blockingCount =
    failCount +
    (byStatus.TOOL_MISSING || 0) +
    (byStatus.TIMEOUT || 0) +
    (byStatus.ERROR || 0);

  return {
    ok: blockingCount === 0,
    status: blockingCount === 0 ? 'PASS' : 'FAIL',
    schemaVersion: EXECUTION_RESULT_SCHEMA_VERSION,
    totalRecords: list.length,
    passCount,
    failCount,
    blockingCount,
    notRunCount: byStatus.NOT_RUN || 0,
    skipCount: byStatus.SKIP || 0,
    byStatus,
    byTool,
    totalDurationMs,
    summarizedAt: nowIso()
  };
}

module.exports = {
  EXECUTION_RESULT_SCHEMA_VERSION,
  EXECUTION_STATUSES,
  VALID_EXECUTION_STATUSES,
  collectExecutionResult,
  normalizeExecutionResult,
  summarizeExecutionResults
};