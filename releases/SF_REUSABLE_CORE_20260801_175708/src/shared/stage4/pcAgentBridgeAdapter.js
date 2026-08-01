'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 'YOLLA_SOURCE_FACTORY_PC_AGENT_BRIDGE_V1';
const DEFAULT_BRIDGE_ROOT = process.env.YOLLA_PC_AGENT_BRIDGE_ROOT ||
  'E:\\YOLLA\\agent\\state\\source-factory-bridge-v1';

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function value(source, names, fallback) {
  const object = isObject(source) ? source : {};
  for (const name of names) {
    if (object[name] !== undefined && object[name] !== null && object[name] !== '') {
      return object[name];
    }
  }
  return fallback;
}

function stringValue(source, names, fallback) {
  const selected = value(source, names, fallback === undefined ? '' : fallback);
  return selected === undefined || selected === null ? '' : String(selected);
}

function arrayValue(source, names) {
  const selected = value(source, names, []);
  if (Array.isArray(selected)) return selected.slice();
  if (selected === undefined || selected === null || selected === '') return [];
  return [selected];
}

function canonicalize(valueInput) {
  if (Array.isArray(valueInput)) return valueInput.map(canonicalize);
  if (!isObject(valueInput)) return valueInput;
  const output = {};
  Object.keys(valueInput).sort().forEach((key) => {
    output[key] = canonicalize(valueInput[key]);
  });
  return output;
}

function canonicalJson(valueInput) {
  return JSON.stringify(canonicalize(valueInput));
}

function sha256(valueInput) {
  const buffer = Buffer.isBuffer(valueInput) ? valueInput : Buffer.from(String(valueInput), 'utf8');
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function bridgePaths(rootInput) {
  const root = path.resolve(rootInput || DEFAULT_BRIDGE_ROOT);
  return {
    root,
    requests: path.join(root, 'requests'),
    processing: path.join(root, 'processing'),
    processed: path.join(root, 'processed'),
    results: path.join(root, 'results'),
    failed: path.join(root, 'failed'),
    attempts: path.join(root, 'attempts')
  };
}

function ensureBridgeLayout(rootInput) {
  const paths = bridgePaths(rootInput);
  Object.keys(paths).forEach((key) => {
    if (key !== 'root') ensureDirectory(paths[key]);
  });
  return paths;
}

function writeJsonAtomic(filePath, payload, options) {
  const settings = isObject(options) ? options : {};
  ensureDirectory(path.dirname(filePath));
  const temporary = filePath + '.tmp-' + process.pid + '-' + crypto.randomBytes(6).toString('hex');
  const bytes = Buffer.from(JSON.stringify(payload, null, 2) + '\n', 'utf8');
  const descriptor = fs.openSync(temporary, settings.exclusive === true ? 'wx' : 'w');
  try {
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  if (settings.exclusive === true && fs.existsSync(filePath)) {
    fs.unlinkSync(temporary);
    const error = new Error('TARGET_ALREADY_EXISTS');
    error.code = 'TARGET_ALREADY_EXISTS';
    throw error;
  }
  fs.renameSync(temporary, filePath);
  return {
    path: filePath,
    sha256: sha256(bytes),
    size_bytes: bytes.length
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function isEnabled(input, options) {
  const source = isObject(input) ? input : {};
  const settings = isObject(options) ? options : {};
  if (settings.enabled === true) return true;
  if (source.pc_agent_enabled === true || source.pcAgentEnabled === true) return true;
  return String(process.env.YOLLA_PC_AGENT_BRIDGE_ENABLED || '').trim() === '1';
}

function hasWorkIdentity(input) {
  const source = isObject(input) ? input : {};
  return Boolean(
    stringValue(source, ['work_id', 'workId', 'pc_agent_task_id', 'pcAgentTaskId', 'task_id', 'taskId'], '')
  );
}

function normalizeCommandSpec(input) {
  const source = isObject(input) ? input : {};
  const nested = isObject(source.command_spec) ? source.command_spec :
    (isObject(source.commandSpec) ? source.commandSpec : {});
  const executable = stringValue(nested, ['executable', 'command'], '') ||
    stringValue(source, ['command', 'executable'], '');
  const args = arrayValue(nested, ['args', 'arguments']).length > 0
    ? arrayValue(nested, ['args', 'arguments'])
    : arrayValue(source, ['args', 'arguments']);
  const cwd = stringValue(nested, ['cwd', 'working_directory', 'workingDirectory'], '') ||
    stringValue(source, ['cwd', 'working_directory', 'workingDirectory'], '');
  const timeoutSecondsRaw = value(nested, ['timeout_seconds', 'timeoutSeconds'],
    value(source, ['timeout_seconds', 'timeoutSeconds'], 300));
  const timeoutSeconds = Math.max(1, Math.min(3600, Number(timeoutSecondsRaw) || 300));
  const env = isObject(nested.env) ? nested.env : (isObject(source.env) ? source.env : {});
  return {
    executable,
    args: args.map((item) => String(item)),
    cwd,
    timeout_seconds: timeoutSeconds,
    env
  };
}

function normalizeWorkRequest(input, options) {
  const source = isObject(input) ? input : {};
  const nested = isObject(source.payload) ? source.payload : {};
  const merged = Object.assign({}, nested, source);
  const settings = isObject(options) ? options : {};
  const now = new Date().toISOString();
  const explicitWorkId = stringValue(merged, ['work_id', 'workId', 'pc_agent_task_id', 'pcAgentTaskId'], '');
  const identity = {
    project_id: stringValue(merged, ['project_id', 'projectId'], 'source-factory'),
    cycle_id: stringValue(merged, ['cycle_id', 'cycleId'], 'source-factory-cycle'),
    worker_slot_uid: stringValue(merged, ['worker_slot_uid', 'workerSlotUid', 'worker_slot', 'workerSlot'], 'source-factory-stage4'),
    assignment_id: stringValue(merged, ['assignment_id', 'assignmentId'], 'source-factory-pc-agent-binding-v1'),
    directive_id: stringValue(merged, ['directive_id', 'directiveId'], stringValue(merged, ['prompt_id', 'promptId'], 'source-factory-dispatch')),
    execution_id: stringValue(merged, ['execution_id', 'executionId'], ''),
    attempt_id: stringValue(merged, ['attempt_id', 'attemptId'], 'attempt-1'),
    task_id: stringValue(merged, ['task_id', 'taskId'], '')
  };
  const commandSpec = normalizeCommandSpec(merged);
  const idempotencyKey = stringValue(merged, ['idempotency_key', 'idempotencyKey', 'dedupe_key', 'dedupeKey'], '') ||
    sha256(canonicalJson({ identity, command_spec: commandSpec })).slice(0, 40);
  const workId = explicitWorkId || ('work-' + idempotencyKey.slice(0, 24));
  return {
    schema_version: SCHEMA_VERSION,
    object_type: 'WORK_REQUEST',
    work_id: workId,
    project_id: identity.project_id,
    cycle_id: identity.cycle_id,
    worker_slot_uid: identity.worker_slot_uid,
    assignment_id: identity.assignment_id,
    directive_id: identity.directive_id,
    execution_id: identity.execution_id || ('exec-' + idempotencyKey.slice(0, 16)),
    attempt_id: identity.attempt_id,
    source_github_ref: stringValue(merged, ['source_github_ref', 'sourceGithubRef'], settings.sourceGithubRef || ''),
    idempotency_key: idempotencyKey,
    work_type: stringValue(merged, ['work_type', 'workType', 'execution_kind', 'executionKind'], 'LOCAL_COMMAND'),
    command_spec: commandSpec,
    input_artifacts: arrayValue(merged, ['input_artifacts', 'inputArtifacts', 'artifacts']),
    retry_policy: isObject(merged.retry_policy) ? merged.retry_policy : {
      max_attempts: Number(value(merged, ['max_attempts', 'maxAttempts'], 1)) || 1,
      retry_on_exit_codes: arrayValue(merged, ['retry_on_exit_codes', 'retryOnExitCodes'])
    },
    result_callback: {
      transport: 'FILE_QUEUE_V1',
      result_file: workId + '.json'
    },
    source_factory: {
      source: settings.source || 'handleStage4DispatchNextPrompt',
      prompt_package_id: stringValue(merged, ['prompt_package_id', 'promptPackageId'], ''),
      prompt_package_version: stringValue(merged, ['prompt_package_version', 'promptPackageVersion'], ''),
      target_window: stringValue(merged, ['target_window', 'targetWindow', 'target_window_selector', 'targetWindowSelector'], ''),
      original_task_id: identity.task_id
    },
    production: false,
    created_at: stringValue(merged, ['created_at', 'createdAt'], now)
  };
}

function validateWorkRequest(request) {
  const findings = [];
  if (!isObject(request)) findings.push('REQUEST_NOT_OBJECT');
  if (request.object_type !== 'WORK_REQUEST') findings.push('OBJECT_TYPE_INVALID');
  if (request.schema_version !== SCHEMA_VERSION) findings.push('SCHEMA_VERSION_INVALID');
  ['work_id', 'project_id', 'cycle_id', 'worker_slot_uid', 'assignment_id', 'directive_id', 'execution_id', 'attempt_id'].forEach((field) => {
    if (!String(request[field] || '').trim()) findings.push('MISSING_' + field.toUpperCase());
  });
  if (!isObject(request.command_spec)) findings.push('COMMAND_SPEC_MISSING');
  if (!String(request.command_spec && request.command_spec.executable || '').trim()) findings.push('EXECUTABLE_MISSING');
  if (request.production !== false) findings.push('PRODUCTION_MUST_BE_FALSE');
  return findings;
}

function dispatchWorkRequest(input, options) {
  const settings = isObject(options) ? options : {};
  if (!isEnabled(input, settings)) {
    return {
      pc_agent_dispatched: false,
      dispatch_status: 'skipped',
      reason: 'PC_AGENT_BRIDGE_DISABLED'
    };
  }
  const paths = ensureBridgeLayout(settings.bridgeRoot);
  const request = normalizeWorkRequest(input, settings);
  const findings = validateWorkRequest(request);
  if (findings.length > 0) {
    const error = new Error('WORK_REQUEST_INVALID:' + findings.join(','));
    error.code = 'WORK_REQUEST_INVALID';
    error.findings = findings;
    throw error;
  }
  const requestPath = path.join(paths.requests, request.work_id + '.json');
  const resultPath = path.join(paths.results, request.work_id + '.json');
  if (fs.existsSync(requestPath) || fs.existsSync(resultPath)) {
    return {
      pc_agent_dispatched: false,
      pc_agent_task_id: request.work_id,
      work_id: request.work_id,
      attempt_id: request.attempt_id,
      dispatch_status: 'duplicate',
      reason: 'IDEMPOTENCY_KEY_ALREADY_PRESENT',
      request_path: requestPath,
      result_path: resultPath,
      request
    };
  }
  const receipt = writeJsonAtomic(requestPath, request, { exclusive: true });
  return {
    pc_agent_dispatched: true,
    pc_agent_task_id: request.work_id,
    work_id: request.work_id,
    attempt_id: request.attempt_id,
    dispatch_status: 'queued',
    reason: null,
    request_path: requestPath,
    result_path: resultPath,
    request_sha256: receipt.sha256,
    request_size_bytes: receipt.size_bytes,
    request
  };
}

function resolveWorkId(input) {
  const source = isObject(input) ? input : {};
  return stringValue(source, ['work_id', 'workId', 'pc_agent_task_id', 'pcAgentTaskId', 'task_id', 'taskId'], '');
}

function validateWorkResult(result, expectedWorkId) {
  const findings = [];
  if (!isObject(result)) findings.push('RESULT_NOT_OBJECT');
  if (result.object_type !== 'WORK_RESULT') findings.push('OBJECT_TYPE_INVALID');
  if (result.schema_version !== SCHEMA_VERSION) findings.push('SCHEMA_VERSION_INVALID');
  if (String(result.work_id || '') !== String(expectedWorkId || '')) findings.push('WORK_ID_MISMATCH');
  if (!['PASS', 'FAIL', 'BLOCKED'].includes(String(result.final_status || ''))) findings.push('FINAL_STATUS_INVALID');
  if (!Number.isInteger(Number(result.exit_code))) findings.push('EXIT_CODE_INVALID');
  return findings;
}

function readWorkResult(input, options) {
  const settings = isObject(options) ? options : {};
  const paths = ensureBridgeLayout(settings.bridgeRoot);
  const workId = resolveWorkId(input);
  if (!workId) {
    return { available: false, status: 'missing_identity', reason: 'WORK_ID_MISSING' };
  }
  const resultPath = path.join(paths.results, workId + '.json');
  if (!fs.existsSync(resultPath)) {
    return {
      available: false,
      status: 'pending',
      reason: 'RESULT_NOT_AVAILABLE',
      work_id: workId,
      result_path: resultPath
    };
  }
  const result = readJson(resultPath);
  const findings = validateWorkResult(result, workId);
  if (findings.length > 0) {
    return {
      available: false,
      status: 'invalid',
      reason: 'WORK_RESULT_INVALID',
      findings,
      work_id: workId,
      result_path: resultPath
    };
  }
  return {
    available: true,
    status: 'complete',
    work_id: workId,
    result_path: resultPath,
    result_sha256: sha256(fs.readFileSync(resultPath)),
    result
  };
}

function toCollectorPayload(result, input) {
  const source = isObject(input) ? input : {};
  const workResult = isObject(result) ? result : {};
  return Object.assign({}, source, {
    pc_agent_result: workResult,
    pc_agent_task_id: workResult.work_id || resolveWorkId(source),
    work_id: workResult.work_id || resolveWorkId(source),
    executed: true,
    status: workResult.final_status === 'PASS' ? 'success' : 'failed',
    final_status: workResult.final_status,
    exit_code: Number(workResult.exit_code),
    stdout: String(workResult.stdout || ''),
    stderr: String(workResult.stderr || ''),
    outputs: Array.isArray(workResult.outputs) ? workResult.outputs : [],
    artifacts: Array.isArray(workResult.artifacts) ? workResult.artifacts : [],
    database_receipt: workResult.database_receipt || null,
    github_commit: workResult.github_commit || null,
    github_comment: workResult.github_comment || null,
    external_blocker: workResult.external_blocker || null,
    started_at: workResult.started_at || null,
    completed_at: workResult.completed_at || null,
    collector_status: 'PC_AGENT_RESULT_READY'
  });
}

function toStoragePayload(result, input) {
  const collector = toCollectorPayload(result, input);
  return {
    source_terminal: 'PC_AGENT',
    target_terminal: 'COLLECTOR',
    worker_id: collector.worker_id || collector.workerId || collector.worker_slot_uid || 'PC_AGENT',
    worker_slot: collector.worker_slot || collector.workerSlot || collector.worker_slot_uid || 'PC_AGENT',
    prompt_id: collector.prompt_id || collector.promptId || collector.directive_id || collector.work_id,
    prompt_package_id: collector.prompt_package_id || collector.promptPackageId || 'SOURCE_FACTORY_PC_AGENT_BRIDGE_V1',
    prompt_package_version: collector.prompt_package_version || collector.promptPackageVersion || '1.0.0',
    output_id: 'pc-agent-output-' + collector.work_id,
    raw_text: JSON.stringify({
      work_id: collector.work_id,
      final_status: collector.final_status,
      exit_code: collector.exit_code,
      stdout: collector.stdout,
      stderr: collector.stderr,
      outputs: collector.outputs,
      artifacts: collector.artifacts,
      database_receipt: collector.database_receipt,
      github_commit: collector.github_commit,
      github_comment: collector.github_comment,
      external_blocker: collector.external_blocker
    }),
    output_text: collector.stdout || collector.stderr || collector.final_status,
    autosave_reason: 'PC_AGENT_WORK_RESULT',
    collector_status: 'COLLECTED',
    work_id: collector.work_id,
    attempt_id: collector.attempt_id || ''
  };
}

function enhanceDispatchResponse(originalResponse, bridgeResult) {
  const original = isObject(originalResponse) ? originalResponse : {};
  const data = Object.assign({}, isObject(original.data) ? original.data : {}, {
    pc_agent: bridgeResult
  });
  return Object.assign({}, original, { data });
}

function enhancePendingResultResponse(originalResponse, pendingResult) {
  const original = isObject(originalResponse) ? originalResponse : {};
  const data = Object.assign({}, isObject(original.data) ? original.data : {}, {
    pc_agent: pendingResult,
    collector_status: 'PC_AGENT_RESULT_PENDING'
  });
  return Object.assign({}, original, { data });
}

function enhanceResultResponse(originalResponse, result, storageResponse) {
  const original = isObject(originalResponse) ? originalResponse : {};
  const data = Object.assign({}, isObject(original.data) ? original.data : {}, toCollectorPayload(result, {}), {
    collector_status: 'PC_AGENT_RESULT_COLLECTED',
    pc_agent_result: result,
    pc_agent_storage: storageResponse || null
  });
  return Object.assign({}, original, { data });
}

module.exports = {
  SCHEMA_VERSION,
  DEFAULT_BRIDGE_ROOT,
  bridgePaths,
  ensureBridgeLayout,
  isEnabled,
  hasWorkIdentity,
  normalizeWorkRequest,
  validateWorkRequest,
  dispatchWorkRequest,
  resolveWorkId,
  validateWorkResult,
  readWorkResult,
  toCollectorPayload,
  toStoragePayload,
  enhanceDispatchResponse,
  enhancePendingResultResponse,
  enhanceResultResponse,
  canonicalJson,
  sha256,
  writeJsonAtomic
};
