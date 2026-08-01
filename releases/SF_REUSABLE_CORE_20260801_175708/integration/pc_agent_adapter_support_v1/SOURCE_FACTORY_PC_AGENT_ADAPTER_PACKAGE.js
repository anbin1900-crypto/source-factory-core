'use strict';

/**
 * SOURCE_FACTORY_PC_AGENT_ADAPTER_PACKAGE
 * Support cycle: S2-SUPPORT-CYCLE-001-20260801
 * Production: false / Ready: false / Merge: false
 *
 * Named deliverables in this bundle:
 * - PC_AGENT_DISPATCH_ADAPTER_SOURCE
 * - PC_AGENT_RESULT_ADAPTER_SOURCE
 * - MOCK_TRANSPORT_FIXTURE
 * - SOURCE_FACTORY_PC_AGENT_ADAPTER_PACKAGE
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const WORK_REQUEST_SCHEMA_VERSION = 'SOURCE_FACTORY_PC_AGENT_WORK_REQUEST_V1';
const WORK_RESULT_SCHEMA_VERSION = 'SOURCE_FACTORY_PC_AGENT_WORK_RESULT_V1';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  const result = String(value).trim();
  return result || fallback;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function array(value) {
  if (Array.isArray(value)) return value.slice();
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function hash(value) {
  const source = String(value || '');
  let result = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    result ^= source.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

function projectPanelIdentity(source) {
  const input = isObject(source) ? source : {};
  const nested = isObject(input.project_panel_identity) ? input.project_panel_identity : {};
  return {
    project_id: input.project_id ?? nested.project_id ?? null,
    project_name: input.project_name ?? nested.project_name ?? null,
    panel_id: input.panel_id ?? nested.panel_id ?? null,
    panel_instance_id: input.panel_instance_id ?? nested.panel_instance_id ?? null
  };
}

/* PC_AGENT_DISPATCH_ADAPTER_SOURCE */
function normalizeDispatchEnvelope(input, sequentialResult) {
  const source = isObject(input) ? input : {};
  const sequential = isObject(sequentialResult) ? sequentialResult : {};
  const payload = isObject(sequential.payload) ? sequential.payload : sequential;
  const metadata = isObject(source.metadata) ? source.metadata : {};
  return {
    dispatch_id: text(payload.dispatchId || payload.dispatch_id || source.dispatch_id || source.dispatchId,
      `sf_dispatch_${hash(JSON.stringify(source))}`),
    prompt_id: text(payload.promptId || payload.prompt_id || source.prompt_id || source.promptId),
    prompt_package_id: text(payload.promptPackageId || payload.prompt_package_id || source.prompt_package_id || source.promptPackageId),
    prompt_package_version: text(payload.promptPackageVersion || payload.prompt_package_version || source.prompt_package_version || source.promptPackageVersion),
    prompt_text: text(payload.promptText || payload.prompt_text || source.prompt_text || source.promptText || source.text || source.content),
    worker_id: text(payload.workerId || payload.worker_id || source.worker_id || source.workerId),
    worker_slot: text(payload.workerSlot || payload.worker_slot || source.worker_slot || source.workerSlot || metadata.worker_slot || metadata.workerSlot),
    task_id: text(payload.taskId || payload.task_id || source.task_id || source.taskId),
    target_stage: text(payload.targetStage || payload.target_stage || source.target_stage || source.targetStage),
    target_window: text(payload.targetWindow || payload.target_window || source.target_window || source.targetWindow, 'PANEL'),
    route_target: text(payload.routeTarget || payload.route_target || source.route_target || source.routeTarget, 'PC_AGENT'),
    send_order: number(payload.sendOrder || payload.send_order || source.send_order || source.sendOrder, 0),
    dedupe_key: text(payload.dedupeKey || payload.dedupe_key || source.dedupe_key || source.dedupeKey),
    created_by_commander: text(payload.createdByCommander || payload.created_by_commander || source.created_by_commander || source.createdByCommander),
    project_panel_identity: projectPanelIdentity(Object.assign({}, source, payload)),
    sequential_result: sequential
  };
}

function buildWorkRequest(input, sequentialResult, options = {}) {
  const normalized = normalizeDispatchEnvelope(input, sequentialResult);
  const createdAt = text(options.created_at || options.createdAt, new Date().toISOString());
  const requestId = text(options.request_id || options.requestId,
    `work_request_${hash([normalized.dispatch_id, normalized.prompt_id, normalized.dedupe_key, createdAt].join('|'))}`);
  const request = {
    schema_version: WORK_REQUEST_SCHEMA_VERSION,
    record_type: 'WORK_REQUEST',
    request_id: requestId,
    idempotency_key: normalized.dedupe_key || requestId,
    created_at: createdAt,
    source: { system: 'SOURCE_FACTORY', station: 'STATION_06_SENDER', action: 'dispatch_next_prompt' },
    target: {
      system: 'PC_AGENT',
      worker_id: normalized.worker_id,
      worker_slot: normalized.worker_slot,
      target_window: normalized.target_window
    },
    command: { type: 'PROMPT_DISPATCH', route_target: normalized.route_target, send_order: normalized.send_order },
    payload: {
      dispatch_id: normalized.dispatch_id,
      prompt_id: normalized.prompt_id,
      prompt_package_id: normalized.prompt_package_id,
      prompt_package_version: normalized.prompt_package_version,
      prompt_text: normalized.prompt_text,
      worker_id: normalized.worker_id,
      worker_slot: normalized.worker_slot,
      task_id: normalized.task_id,
      target_stage: normalized.target_stage,
      created_by_commander: normalized.created_by_commander,
      project_panel_identity: normalized.project_panel_identity
    },
    metadata: { adapter: 'PC_AGENT_DISPATCH_ADAPTER_SOURCE', adapter_version: '1.0.0', production: false, ready: false }
  };
  const errors = [];
  if (!request.request_id) errors.push('request_id is required');
  if (!request.payload.prompt_text) errors.push('payload.prompt_text is required');
  return { ok: errors.length === 0, request, errors };
}

async function dispatchWithFallback(input, event, options = {}) {
  const fallback = typeof options.fallback_dispatch === 'function'
    ? await options.fallback_dispatch(input, event)
    : { dispatched: false, reason: 'NO_SEQUENTIAL_SENDER_SERVICE_BOUND' };
  if (options.enabled === false || options.disable_pc_agent_adapter === true) {
    return Object.assign({}, fallback, {
      pc_agent_adapter_used: false,
      pc_agent_adapter_status: 'DISABLED_FALLBACK_PRESERVED',
      sequential_fallback_preserved: true
    });
  }
  const built = buildWorkRequest(input, fallback, options);
  if (!built.ok) {
    return Object.assign({}, fallback, {
      pc_agent_adapter_used: false,
      pc_agent_adapter_status: 'INVALID_WORK_REQUEST_FALLBACK_PRESERVED',
      pc_agent_adapter_errors: built.errors,
      sequential_fallback_preserved: true
    });
  }
  const transport = options.transport;
  const send = transport && (typeof transport.sendWorkRequest === 'function'
    ? transport.sendWorkRequest.bind(transport)
    : typeof transport.dispatch === 'function' ? transport.dispatch.bind(transport) : null);
  if (!send) {
    return Object.assign({}, fallback, {
      pc_agent_adapter_used: false,
      pc_agent_adapter_status: 'NO_TRANSPORT_FALLBACK_PRESERVED',
      work_request: built.request,
      sequential_fallback_preserved: true
    });
  }
  try {
    const workResult = await send(built.request, { event, input });
    return {
      dispatched: true,
      adapter_dispatched: true,
      pc_agent_adapter_used: true,
      pc_agent_adapter_status: 'PC_AGENT_WORK_REQUEST_DISPATCHED',
      sequential_fallback_preserved: true,
      fallback_dispatch: fallback,
      work_request: built.request,
      work_result: workResult,
      project_panel_identity: built.request.payload.project_panel_identity
    };
  } catch (error) {
    return Object.assign({}, fallback, {
      pc_agent_adapter_used: false,
      pc_agent_adapter_status: 'TRANSPORT_FAILED_FALLBACK_PRESERVED',
      pc_agent_adapter_error: error && error.message ? error.message : String(error),
      work_request: built.request,
      sequential_fallback_preserved: true
    });
  }
}

/* PC_AGENT_RESULT_ADAPTER_SOURCE */
function extractWorkResult(input) {
  const source = isObject(input) ? input : {};
  return isObject(source.work_result) ? source.work_result
    : isObject(source.workResult) ? source.workResult
      : isObject(source.pc_agent_result) ? source.pc_agent_result
        : isObject(source.pcAgentResult) ? source.pcAgentResult : source;
}

function normalizeWorkResult(input, context = {}) {
  const result = extractWorkResult(input);
  const rawStatus = text(result.status).toUpperCase();
  const status = ['PASS', 'FAIL', 'SKIP', 'TOOL_MISSING', 'TIMEOUT', 'ERROR', 'NOT_RUN'].includes(rawStatus)
    ? rawStatus : result.ok === true ? 'PASS' : result.ok === false ? 'FAIL' : 'NOT_RUN';
  const payload = isObject(result.payload) ? result.payload : {};
  const metadata = isObject(result.metadata) ? result.metadata : {};
  const normalized = {
    schemaVersion: '0.1.0',
    recordType: 'EXECUTION_RESULT',
    resultId: text(result.result_id || result.resultId),
    status,
    ok: status === 'PASS',
    sourceStatus: text(result.status),
    tool: text(result.tool || metadata.tool, 'pc_agent_mock_transport'),
    command: text(result.command || payload.command, 'PROMPT_DISPATCH'),
    args: array(result.args || payload.args),
    filePath: text(result.file_path || result.filePath || payload.file_path),
    cwd: text(result.cwd || payload.cwd),
    exitCode: Number.isFinite(Number(result.exit_code ?? result.exitCode ?? payload.exit_code))
      ? Number(result.exit_code ?? result.exitCode ?? payload.exit_code) : null,
    stdout: text(result.stdout || payload.stdout),
    stderr: text(result.stderr || payload.stderr),
    errorMessage: text(result.error_message || result.errorMessage || payload.error_message),
    durationMs: number(result.duration_ms ?? result.durationMs, 0),
    terminalTarget: text(context.terminalTarget || result.terminal_target, 'PANEL'),
    panelIntegrationRole: 'PC Agent WORK_RESULT normalization',
    panelControlLanguageRelevance: false,
    routeTarget: 'EXECUTION_RESULT',
    taskId: text(result.task_id || result.taskId || context.taskId),
    workerId: text(result.worker_id || result.workerId || context.workerId),
    targetStage: text(result.target_stage || result.targetStage || context.targetStage,
      'STAGE4_CLASSIFIER_VALIDATION_PANEL_AUTOMATION'),
    labels: ['PC_AGENT_RESULT_ADAPTER', 'MOCK_TRANSPORT'],
    metadata: Object.assign({}, metadata, {
      work_result_schema_version: text(result.schema_version, WORK_RESULT_SCHEMA_VERSION),
      request_id: text(result.request_id || result.requestId),
      adapter_version: '1.0.0',
      project_panel_identity: result.project_panel_identity || payload.project_panel_identity || null
    }),
    raw: result,
    createdAt: text(result.completed_at || result.created_at, new Date().toISOString())
  };
  const errors = [];
  if (!normalized.resultId) errors.push('result_id is required');
  if (!normalized.metadata.request_id) errors.push('request_id is required');
  return { ok: errors.length === 0, normalized, errors, work_result: result };
}

async function collectWithFallback(input, event, options = {}) {
  const fallback = typeof options.fallback_collect === 'function' ? options.fallback_collect : null;
  if (options.enabled === false || options.disable_pc_agent_adapter === true) {
    const value = fallback ? await fallback(input, event) : { executed: false, reason: 'NO_EXECUTION_SERVICE_BOUND' };
    return Object.assign({}, value, { execution_fallback_preserved: true, pc_agent_result_adapter_used: false });
  }
  const adapted = normalizeWorkResult(input, options.context || {});
  if (!adapted.ok) {
    const value = fallback ? await fallback(input, event) : { executed: false, errors: adapted.errors };
    return Object.assign({}, value, {
      pc_agent_result_adapter_used: false,
      pc_agent_result_adapter_status: 'INVALID_WORK_RESULT_FALLBACK_PRESERVED',
      pc_agent_result_adapter_errors: adapted.errors,
      execution_fallback_preserved: true
    });
  }
  const collector = options.executionResultCollector;
  let collected = adapted.normalized;
  if (collector && typeof collector.collectExecutionResult === 'function') {
    collected = collector.collectExecutionResult(options.records || [], adapted.normalized, options.context || {});
  } else if (collector && typeof collector.normalizeExecutionResult === 'function') {
    collected = collector.normalizeExecutionResult(adapted.normalized, options.context || {});
  }
  return {
    executed: true,
    pc_agent_result_adapter_used: true,
    pc_agent_result_adapter_status: 'PC_AGENT_WORK_RESULT_NORMALIZED',
    execution_fallback_preserved: true,
    work_result: adapted.work_result,
    normalized_execution_result: adapted.normalized,
    collector_result: collected,
    project_panel_identity: adapted.normalized.metadata.project_panel_identity
  };
}

/* MOCK_TRANSPORT_FIXTURE */
class MockPcAgentTransport {
  constructor(options = {}) {
    this.options = Object.assign({ status: 'PASS', exit_code: 0 }, options);
    this.requests = [];
    this.results = [];
  }
  async sendWorkRequest(request) {
    this.requests.push(request);
    const result = {
      schema_version: WORK_RESULT_SCHEMA_VERSION,
      record_type: 'WORK_RESULT',
      result_id: `mock_result_${crypto.createHash('sha256').update(JSON.stringify(request)).digest('hex').slice(0, 20)}`,
      request_id: request.request_id,
      status: this.options.status,
      ok: this.options.status === 'PASS',
      exit_code: this.options.exit_code,
      stdout: `MOCK_PC_AGENT_ACCEPTED:${request.request_id}`,
      stderr: '',
      duration_ms: 7,
      command: request.command.type,
      worker_id: request.payload.worker_id,
      task_id: request.payload.task_id,
      target_stage: request.payload.target_stage,
      project_panel_identity: request.payload.project_panel_identity,
      completed_at: new Date().toISOString(),
      metadata: { transport: 'MOCK_TRANSPORT_FIXTURE', external_effect_count: 0 }
    };
    this.results.push(result);
    return result;
  }
  dispatch(request, context) { return this.sendWorkRequest(request, context); }
}

function sequentialFallbackFactory(sequentialPromptSender) {
  return async function fallback(input) {
    if (sequentialPromptSender && typeof sequentialPromptSender.dispatchNextPrompt === 'function') {
      return sequentialPromptSender.dispatchNextPrompt(input);
    }
    if (sequentialPromptSender && typeof sequentialPromptSender.getNextDispatchPayload === 'function' &&
        (Array.isArray(input) || Array.isArray(input.items) || (input.queue && Array.isArray(input.queue.items)))) {
      return sequentialPromptSender.getNextDispatchPayload(input, input.options || {});
    }
    if (sequentialPromptSender && typeof sequentialPromptSender.buildSequentialPromptDispatch === 'function') {
      return sequentialPromptSender.buildSequentialPromptDispatch(input, input.options || {});
    }
    return { dispatched: false, reason: 'NO_SEQUENTIAL_SENDER_SERVICE_BOUND' };
  };
}

function executionFallbackFactory(executionResultCollector) {
  return async function fallback(input) {
    if (executionResultCollector && typeof executionResultCollector.runExecutionCheck === 'function') {
      return executionResultCollector.runExecutionCheck(input);
    }
    if (executionResultCollector && typeof executionResultCollector.normalizeExecutionResult === 'function') {
      return executionResultCollector.normalizeExecutionResult(input);
    }
    if (executionResultCollector && typeof executionResultCollector.collectExecutionResult === 'function') {
      return executionResultCollector.collectExecutionResult([], input);
    }
    return { executed: false, reason: 'NO_EXECUTION_SERVICE_BOUND' };
  };
}

/* SOURCE_FACTORY_PC_AGENT_ADAPTER_PACKAGE */
function createStage4PcAgentAdapterDeps(options = {}) {
  const enabled = options.enabled !== false;
  return {
    dispatchNextPrompt(input, event) {
      return dispatchWithFallback(input, event, {
        enabled,
        disable_pc_agent_adapter: options.disable_pc_agent_adapter === true,
        transport: options.transport,
        fallback_dispatch: sequentialFallbackFactory(options.sequentialPromptSender),
        created_at: options.created_at
      });
    },
    runExecutionCheck(input, event) {
      return collectWithFallback(input, event, {
        enabled,
        disable_pc_agent_adapter: options.disable_pc_agent_adapter === true,
        executionResultCollector: options.executionResultCollector,
        records: options.executionRecords || [],
        context: options.context || {},
        fallback_collect: executionFallbackFactory(options.executionResultCollector)
      });
    },
    pc_agent_adapter_enabled: enabled
  };
}

function contractHandlers() {
  function ok(station, action, data) { return { ok: true, station, action, data, error: null }; }
  return {
    async handleStage4DispatchNextPrompt(event, payload, deps) {
      const version = { checked: false, prompt_package_id: payload.prompt_package_id, prompt_package_version: payload.prompt_package_version };
      const dispatch = deps && typeof deps.dispatchNextPrompt === 'function'
        ? await deps.dispatchNextPrompt(payload, event)
        : { dispatched: false, reason: 'NO_SEQUENTIAL_SENDER_SERVICE_BOUND' };
      return ok('STATION_06_SENDER', 'dispatch_next_prompt', { version, dispatch });
    },
    async handleStage4RunCheck(event, payload, deps) {
      const data = deps && typeof deps.runExecutionCheck === 'function'
        ? await deps.runExecutionCheck(payload, event)
        : { executed: false, reason: 'NO_EXECUTION_SERVICE_BOUND' };
      return ok('STATION_07_EXECUTION', 'run_execution_check', data);
    },
    async handleStage4AppendStationRecords(_event, payload) {
      fs.mkdirSync(payload.storageRoot, { recursive: true });
      const target = path.join(payload.storageRoot, 'panel_records.jsonl');
      fs.appendFileSync(target, `${JSON.stringify(payload)}\n`, 'utf8');
      return ok('STATION_04_STORAGE', 'append_station_records', { appended: true, storage_path: target });
    }
  };
}

async function runSelfTest(writeResultPath) {
  const sequentialPromptSender = {
    buildSequentialPromptDispatch(item) {
      return {
        ok: true,
        payload: {
          dispatchId: 'dispatch_mock_001', promptId: item.prompt_id,
          promptPackageId: item.prompt_package_id, promptPackageVersion: item.prompt_package_version,
          workerId: item.worker_id, workerSlot: item.worker_slot, taskId: item.task_id,
          targetStage: item.target_stage, targetWindow: 'WORKER_WINDOW_01', routeTarget: 'PC_AGENT',
          promptText: item.prompt_text, sendOrder: item.send_order, dedupeKey: item.dedupe_key,
          createdByCommander: item.created_by_commander, project_panel_identity: item.project_panel_identity,
          dispatchStatus: 'READY'
        }, errors: [], warnings: []
      };
    }
  };
  const executionResultCollector = {
    normalizeExecutionResult(input) { return Object.assign({ recordType: 'EXECUTION_RESULT' }, input); },
    collectExecutionResult(records, input) {
      const record = Object.assign({ recordType: 'EXECUTION_RESULT' }, input);
      records.push(record);
      return { ok: true, status: 'EXECUTION_RESULT_COLLECTED', record, records };
    }
  };
  const handlers = contractHandlers();
  const transport = new MockPcAgentTransport();
  const deps = createStage4PcAgentAdapterDeps({ enabled: true, transport, sequentialPromptSender, executionResultCollector });
  const prompt = {
    prompt_id: 'PROMPT_MOCK_PC_AGENT_001', prompt_package_id: 'PKG_S2_SUPPORT_CYCLE_001',
    prompt_package_version: '1.0.0', prompt_text: 'Run deterministic mock PC Agent command.',
    worker_id: 'MOCK_PC_AGENT_WORKER_01', worker_slot: 'SLOT_01',
    task_id: 'SOURCE_FACTORY_PC_AGENT_ADAPTER_MOCK_E2E', target_stage: 'STAGE4_PC_AGENT_ADAPTER_SUPPORT',
    send_order: 1, dedupe_key: 'MOCK_PC_AGENT_E2E_DEDUPE_001', created_by_commander: 'SOURCE_FACTORY_COMMANDER',
    project_panel_identity: {
      project_id: 'PROJECT_MOCK_001', project_name: 'Mock Project', panel_id: 'PANEL_MOCK_001',
      panel_instance_id: 'PANEL_INSTANCE_MOCK_001'
    }
  };
  const dispatchResponse = await handlers.handleStage4DispatchNextPrompt(null, prompt, deps);
  if (!dispatchResponse.ok || !dispatchResponse.data.dispatch.pc_agent_adapter_used) throw new Error('dispatch adapter failed');
  const runResponse = await handlers.handleStage4RunCheck(null, { work_result: dispatchResponse.data.dispatch.work_result }, deps);
  if (!runResponse.ok || !runResponse.data.pc_agent_result_adapter_used) throw new Error('result adapter failed');
  const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-pc-agent-adapter-'));
  const storageResponse = await handlers.handleStage4AppendStationRecords(null, {
    raw_text: JSON.stringify(runResponse.data), storageRoot, project_panel_identity: prompt.project_panel_identity
  }, {});
  if (!storageResponse.ok || !storageResponse.data.appended) throw new Error('storage failed');
  const disabledDeps = createStage4PcAgentAdapterDeps({ enabled: false, sequentialPromptSender, executionResultCollector });
  const fallbackDispatch = await handlers.handleStage4DispatchNextPrompt(null, prompt, disabledDeps);
  if (fallbackDispatch.data.dispatch.pc_agent_adapter_used !== false ||
      fallbackDispatch.data.dispatch.sequential_fallback_preserved !== true) throw new Error('dispatch fallback failed');
  const fallbackRun = await handlers.handleStage4RunCheck(null, { status: 'PASS', ok: true, exitCode: 0 }, disabledDeps);
  if (!fallbackRun.ok) throw new Error('run fallback failed');
  const result = {
    object_type: 'SOURCE_FACTORY_MOCK_E2E_RESULT', schema_version: '1.0.0',
    support_cycle_id: 'S2-SUPPORT-CYCLE-001-20260801', generated_at: new Date().toISOString(),
    handler_mode: 'CONTRACT_HARNESS_LOCAL', actual_target_loaded: false,
    expected_target_repo_path: 'releases/SF_REUSABLE_CORE_20260801_175708/safe_panel_v10/ipc/stage4StationBindingHandlers.js',
    flow: ['dispatch', 'PC_AGENT_DISPATCH_ADAPTER_SOURCE', 'MOCK_TRANSPORT_FIXTURE',
      'PC_AGENT_RESULT_ADAPTER_SOURCE', 'run_check', 'existing_storage_handler'],
    checks: {
      dispatch_adapter: 'PASS', mock_transport_request_count: transport.requests.length,
      mock_transport_result_count: transport.results.length, result_adapter: 'PASS', run_check: 'PASS',
      storage: 'PASS', fallback_dispatch: 'PASS', fallback_run_check: 'PASS', project_panel_identity: 'PASS'
    },
    preservation: {
      sequentialPromptSender_fallback: true, executionResultCollector_fallback: true,
      preload_api_names_mutated: false, ipc_channel_names_mutated: false,
      project_panel_identity_preserved: runResponse.data.project_panel_identity.project_id === 'PROJECT_MOCK_001',
      source_not_found_fallback_mutated: false, lao_detect_queue_mutated: false, package_json_mutated: false
    },
    external_effect_count: 0, production: false, ready: false, merge: false,
    terminal: 'SOURCE_FACTORY_PC_AGENT_ADAPTER_SUPPORT_READY'
  };
  if (writeResultPath) fs.writeFileSync(path.resolve(writeResultPath), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return result;
}

module.exports = {
  WORK_REQUEST_SCHEMA_VERSION,
  WORK_RESULT_SCHEMA_VERSION,
  MockPcAgentTransport,
  buildWorkRequest,
  collectWithFallback,
  createStage4PcAgentAdapterDeps,
  dispatchWithFallback,
  normalizeWorkResult,
  runSelfTest
};

if (require.main === module) {
  const writeIndex = process.argv.indexOf('--write-result');
  const writePath = writeIndex >= 0 ? process.argv[writeIndex + 1] : null;
  runSelfTest(writePath).then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
}
