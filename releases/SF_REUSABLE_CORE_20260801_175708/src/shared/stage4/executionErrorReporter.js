'use strict';

const EXECUTION_ERROR_REPORT_SCHEMA_VERSION = '0.1.0';

const EXECUTION_ERROR_CATEGORIES = Object.freeze({
  SYNTAX_ERROR: 'SYNTAX_ERROR',
  JSON_PARSE_ERROR: 'JSON_PARSE_ERROR',
  PYTHON_SYNTAX_ERROR: 'PYTHON_SYNTAX_ERROR',
  COMMAND_FAILED: 'COMMAND_FAILED',
  TOOL_MISSING: 'TOOL_MISSING',
  TIMEOUT: 'TIMEOUT',
  UNKNOWN_EXECUTION_ERROR: 'UNKNOWN_EXECUTION_ERROR'
});

const VALID_EXECUTION_ERROR_CATEGORIES = Object.freeze(Object.keys(EXECUTION_ERROR_CATEGORIES));

const BLOCKING_STATUSES = Object.freeze([
  'FAIL',
  'TOOL_MISSING',
  'TIMEOUT',
  'ERROR'
]);

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

function normalizeStatus(value) {
  return toSafeString(value, '').trim().toUpperCase();
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

function createErrorReportId(seed) {
  const timestamp = nowIso().replace(/[-:.TZ]/g, '');
  const suffix = simpleHash(seed || timestamp).padStart(4, '0').slice(0, 12);
  return `execution_error_${timestamp}_${suffix}`;
}

function mergeExecutionText(source) {
  return [
    source && source.errorMessage,
    source && source.stderr,
    source && source.stdout
  ]
    .map((item) => toSafeString(item, ''))
    .filter(Boolean)
    .join('\n');
}

function inferFilePath(source) {
  return toSafeString(
    source && (source.filePath || source.file || source.targetFile || source.path),
    ''
  );
}

function inferTool(source) {
  return toSafeString(
    source && (
      source.tool ||
      source.toolName ||
      source.mode ||
      source.command ||
      source.pythonCommand ||
      source.nodeCommand
    ),
    ''
  );
}

function looksLikePythonContext(source, mergedText) {
  const filePath = inferFilePath(source).toLowerCase();
  const tool = inferTool(source).toLowerCase();
  const mode = toSafeString(source && source.mode, '').toLowerCase();
  const text = toSafeString(mergedText, '').toLowerCase();

  return filePath.endsWith('.py') ||
    tool.includes('python') ||
    mode === 'compile' ||
    text.includes('py_compile') ||
    text.includes('python');
}

function categorizeExecutionError(input) {
  const source = isPlainObject(input) ? input : {};
  const status = normalizeStatus(source.status);
  const mergedText = mergeExecutionText(source);
  const lowerText = mergedText.toLowerCase();

  if (status === 'TOOL_MISSING' || source.toolMissing === true) {
    return EXECUTION_ERROR_CATEGORIES.TOOL_MISSING;
  }

  if (status === 'TIMEOUT' || source.timedOut === true || lowerText.includes('timed out')) {
    return EXECUTION_ERROR_CATEGORIES.TIMEOUT;
  }

  if (
    lowerText.includes('json.parse') ||
    lowerText.includes('unexpected token') && lowerText.includes('json') ||
    lowerText.includes('unexpected end of json input') ||
    lowerText.includes('json parse')
  ) {
    return EXECUTION_ERROR_CATEGORIES.JSON_PARSE_ERROR;
  }

  if (
    lowerText.includes('syntaxerror') &&
    looksLikePythonContext(source, mergedText)
  ) {
    return EXECUTION_ERROR_CATEGORIES.PYTHON_SYNTAX_ERROR;
  }

  if (
    lowerText.includes('syntaxerror') ||
    lowerText.includes('unexpected token') ||
    lowerText.includes('unexpected identifier') ||
    lowerText.includes('missing )') ||
    lowerText.includes('invalid or unexpected token')
  ) {
    return EXECUTION_ERROR_CATEGORIES.SYNTAX_ERROR;
  }

  if (status === 'FAIL' || status === 'NON_ZERO_EXIT' || toNumberOrNull(source.exitCode) !== 0) {
    return EXECUTION_ERROR_CATEGORIES.COMMAND_FAILED;
  }

  if (status === 'ERROR') {
    return EXECUTION_ERROR_CATEGORIES.UNKNOWN_EXECUTION_ERROR;
  }

  return EXECUTION_ERROR_CATEGORIES.UNKNOWN_EXECUTION_ERROR;
}

function isBlockingExecutionResult(input) {
  const source = isPlainObject(input) ? input : {};
  const status = normalizeStatus(source.status);

  if (BLOCKING_STATUSES.includes(status)) {
    return true;
  }

  if (source.ok === false && status !== 'NOT_RUN' && status !== 'SKIP') {
    return true;
  }

  return false;
}

function buildSummary(category, source) {
  const filePath = inferFilePath(source);
  const tool = inferTool(source);
  const exitCode = toNumberOrNull(source && source.exitCode);
  const pieces = [];

  pieces.push(`category=${category}`);

  if (tool) {
    pieces.push(`tool=${tool}`);
  }

  if (filePath) {
    pieces.push(`file=${filePath}`);
  }

  if (exitCode !== null) {
    pieces.push(`exitCode=${exitCode}`);
  }

  return pieces.join('; ');
}

function buildExecutionErrorReport(executionResult, context) {
  const source = isPlainObject(executionResult) ? executionResult : {};
  const extra = isPlainObject(context) ? context : {};
  const category = categorizeExecutionError(source);
  const createdAt = toSafeString(source.createdAt || extra.createdAt, nowIso());
  const isBlocking = isBlockingExecutionResult(source);
  const mergedText = mergeExecutionText(source);
  const reportId = toSafeString(source.errorReportId || source.reportId, '') ||
    createErrorReportId(JSON.stringify({
      category,
      status: source.status || '',
      filePath: inferFilePath(source),
      createdAt
    }));

  return {
    schemaVersion: EXECUTION_ERROR_REPORT_SCHEMA_VERSION,
    recordType: 'ERROR_REPORT',
    reportId,
    category,
    isBlocking,
    status: normalizeStatus(source.status) || 'UNKNOWN',
    sourceResultId: toSafeString(source.resultId || source.executionResultId, ''),
    sourceRecordType: toSafeString(source.recordType, ''),
    tool: inferTool(source),
    command: toSafeString(source.command, ''),
    args: toSafeArray(source.args),
    filePath: inferFilePath(source),
    cwd: toSafeString(source.cwd, ''),
    exitCode: toNumberOrNull(source.exitCode),
    stdout: toSafeString(source.stdout, ''),
    stderr: toSafeString(source.stderr, ''),
    errorMessage: toSafeString(source.errorMessage, ''),
    mergedErrorText: mergedText,
    summary: buildSummary(category, source),
    terminalTarget: toSafeString(extra.terminalTarget || source.terminalTarget, 'PANEL'),
    panelIntegrationRole: toSafeString(
      extra.panelIntegrationRole || source.panelIntegrationRole,
      '실행 오류를 RED fix 후보로 변환'
    ),
    panelControlLanguageRelevance: Boolean(
      extra.panelControlLanguageRelevance || source.panelControlLanguageRelevance
    ),
    routeTarget: toSafeString(extra.routeTarget || source.routeTarget, 'ERROR_REPORT'),
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

function buildFixText(category, report) {
  const filePath = toSafeString(report && report.filePath, '');
  const target = filePath || 'target file';

  if (category === EXECUTION_ERROR_CATEGORIES.SYNTAX_ERROR) {
    return `Check JavaScript syntax in ${target}; fix the first parser error and rerun node --check.`;
  }

  if (category === EXECUTION_ERROR_CATEGORIES.JSON_PARSE_ERROR) {
    return `Check JSON formatting or JSON.parse input near the reported position in ${target}; fix invalid JSON and rerun parse check.`;
  }

  if (category === EXECUTION_ERROR_CATEGORIES.PYTHON_SYNTAX_ERROR) {
    return `Check Python syntax in ${target}; fix the first SyntaxError and rerun py_compile.`;
  }

  if (category === EXECUTION_ERROR_CATEGORIES.COMMAND_FAILED) {
    return `Review command, arguments, cwd, and stderr for ${target}; rerun after correcting the reported failure.`;
  }

  if (category === EXECUTION_ERROR_CATEGORIES.TOOL_MISSING) {
    return 'Install or configure the missing local tool command, then rerun the same wrapper.';
  }

  if (category === EXECUTION_ERROR_CATEGORIES.TIMEOUT) {
    return 'Reduce the command scope or increase timeoutMs after confirming the command is expected to complete.';
  }

  return `Review stderr, stdout, and errorMessage for ${target}; create a minimal hotfix for the first blocking execution error.`;
}

function buildRedFixHintFromExecutionError(errorReport, context) {
  const report = isPlainObject(errorReport)
    ? errorReport
    : buildExecutionErrorReport(errorReport, context);

  const category = VALID_EXECUTION_ERROR_CATEGORIES.includes(report.category)
    ? report.category
    : EXECUTION_ERROR_CATEGORIES.UNKNOWN_EXECUTION_ERROR;

  if (report.isBlocking === false) {
    return {
      ok: true,
      status: 'NO_RED_FIX_NEEDED',
      category,
      redFixRequired: false,
      reason: 'execution result is not blocking'
    };
  }

  const causeParts = [
    category,
    report.filePath ? `file=${report.filePath}` : '',
    report.errorMessage ? `error=${report.errorMessage}` : '',
    report.exitCode !== null && report.exitCode !== undefined ? `exitCode=${report.exitCode}` : ''
  ].filter(Boolean);

  return {
    ok: true,
    status: 'RED_FIX_HINT_CREATED',
    redFixRequired: true,
    category,
    sourceReportId: toSafeString(report.reportId, ''),
    targetFile: toSafeString(report.filePath, ''),
    cause: causeParts.join('; '),
    fix: buildFixText(category, report),
    resubmitScope: report.filePath
      ? `minimal patch for ${report.filePath}`
      : 'minimal patch for the failing execution unit',
    redFixText: [
      'RED_FIX_REQUIRED',
      `cause: ${causeParts.join('; ')}`,
      `fix: ${buildFixText(category, report)}`,
      `resubmit_scope: ${report.filePath ? `minimal patch for ${report.filePath}` : 'minimal patch for the failing execution unit'}`
    ].join('\n'),
    createdAt: nowIso()
  };
}

module.exports = {
  EXECUTION_ERROR_REPORT_SCHEMA_VERSION,
  EXECUTION_ERROR_CATEGORIES,
  VALID_EXECUTION_ERROR_CATEGORIES,
  buildExecutionErrorReport,
  buildRedFixHintFromExecutionError,
  categorizeExecutionError
};