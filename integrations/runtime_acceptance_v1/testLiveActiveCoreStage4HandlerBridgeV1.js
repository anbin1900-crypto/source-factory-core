#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const result = {
    activeCoreRoot: '',
    bridgeRoot: '',
    python: '',
    runId: '',
    timeoutSeconds: 60
  };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--active-core-root') result.activeCoreRoot = argv[++index] || '';
    else if (token === '--bridge-root') result.bridgeRoot = argv[++index] || '';
    else if (token === '--python') result.python = argv[++index] || '';
    else if (token === '--run-id') result.runId = argv[++index] || '';
    else if (token === '--timeout-seconds') result.timeoutSeconds = Number(argv[++index] || '60');
    else throw new Error('UNKNOWN_ARGUMENT:' + token);
  }
  if (!result.activeCoreRoot) throw new Error('ACTIVE_CORE_ROOT_REQUIRED');
  if (!result.bridgeRoot) throw new Error('BRIDGE_ROOT_REQUIRED');
  if (!result.python) throw new Error('PYTHON_REQUIRED');
  if (!result.runId) result.runId = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 17);
  if (!Number.isFinite(result.timeoutSeconds) || result.timeoutSeconds < 5 || result.timeoutSeconds > 600) {
    throw new Error('TIMEOUT_SECONDS_INVALID');
  }
  return result;
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function waitFor(predicate, timeoutSeconds, description) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await sleep(100);
  }
  throw new Error('WAIT_TIMEOUT:' + description);
}

async function main() {
  const args = parseArgs(process.argv);
  const activeCoreRoot = path.resolve(args.activeCoreRoot);
  const bridgeRoot = path.resolve(args.bridgeRoot);
  const handlerPath = path.join(activeCoreRoot, 'safe_panel_v10', 'ipc', 'stage4StationBindingHandlers.js');
  const heartbeatPath = path.join(bridgeRoot, 'runtime', 'heartbeat.json');

  if (!fs.existsSync(handlerPath)) throw new Error('TARGET_HANDLER_MISSING:' + handlerPath);
  const heartbeat = await waitFor(() => {
    if (!fs.existsSync(heartbeatPath)) return null;
    const value = readJson(heartbeatPath);
    return value && value.state === 'RUNNING' ? value : null;
  }, args.timeoutSeconds, 'RUNNING_WORKER_HEARTBEAT');

  delete require.cache[require.resolve(handlerPath)];
  const handler = require(handlerPath);
  if (typeof handler.handleStage4DispatchNextPrompt !== 'function') throw new Error('DISPATCH_EXPORT_MISSING');
  if (typeof handler.handleStage4RunCheck !== 'function') throw new Error('RUN_CHECK_EXPORT_MISSING');

  const workId = 'r11-live-' + args.runId.toLowerCase();
  const input = {
    pc_agent_enabled: true,
    work_id: workId,
    project_id: 'source-factory-r11-runtime',
    cycle_id: 'R11-ACTIVE-RUNTIME',
    worker_slot_uid: 'A1-T1-R11',
    assignment_id: 'A1-R11-ACTIVE-RUNTIME-ACCEPTANCE',
    directive_id: 'A1-SF-PCAGENT-R11-ACTIVE-RUNTIME-BOOT-RESTART-RECOVERY-V1-20260802-001',
    execution_id: 'r11-live-execution-' + args.runId,
    attempt_id: 'attempt-1',
    task_id: workId,
    idempotency_key: 'r11-live-idempotency-' + args.runId,
    source_github_ref: 'anbin1900-crypto/source-factory-core@integration/source-factory-pc-agent-api-db-v1',
    work_type: 'LOCAL_COMMAND',
    command_spec: {
      executable: args.python,
      args: [
        '-X', 'utf8', '-c',
        'import json; print("YOLLA_RESULT_JSON="+json.dumps({"runtime_live_handler":"PASS","outputs":[{"kind":"r11-live-runtime"}],"artifacts":[],"database_receipt":None,"production":False},ensure_ascii=False))'
      ],
      cwd: bridgeRoot,
      timeout_seconds: 30,
      env: {}
    },
    production: false
  };
  const deps = { pcAgentBridgeOptions: { enabled: true, bridgeRoot } };

  const dispatch = await handler.handleStage4DispatchNextPrompt(null, input, deps);
  const bridge = dispatch && dispatch.data && dispatch.data.pc_agent;
  if (!bridge || bridge.pc_agent_dispatched !== true || bridge.work_id !== workId) {
    throw new Error('LIVE_HANDLER_DISPATCH_FAILED:' + JSON.stringify(dispatch));
  }

  const resultPath = path.join(bridgeRoot, 'results', workId + '.json');
  await waitFor(() => fs.existsSync(resultPath), args.timeoutSeconds, 'LIVE_HANDLER_WORK_RESULT');

  const resultBytes = fs.readFileSync(resultPath);
  const resultObject = JSON.parse(resultBytes.toString('utf8'));
  if (resultObject.final_status !== 'PASS' || Number(resultObject.exit_code) !== 0) {
    throw new Error('LIVE_WORK_RESULT_FAILED:' + JSON.stringify(resultObject));
  }

  const collected = await handler.handleStage4RunCheck(null, { work_id: workId }, deps);
  const data = collected && collected.data ? collected.data : {};
  if (data.final_status !== 'PASS' || Number(data.exit_code) !== 0) {
    throw new Error('LIVE_HANDLER_RESULT_COLLECTION_FAILED:' + JSON.stringify(collected));
  }
  if (!data.pc_agent_storage || data.pc_agent_storage.ok !== true) {
    throw new Error('LIVE_HANDLER_STORAGE_FAILED:' + JSON.stringify(data.pc_agent_storage));
  }

  const attemptFiles = fs.existsSync(path.join(bridgeRoot, 'attempts'))
    ? fs.readdirSync(path.join(bridgeRoot, 'attempts')).filter((name) => name.startsWith(workId + '-'))
    : [];
  const processedFiles = fs.existsSync(path.join(bridgeRoot, 'processed'))
    ? fs.readdirSync(path.join(bridgeRoot, 'processed')).filter((name) => name.includes(workId))
    : [];

  process.stdout.write(JSON.stringify({
    schema_version: 'YOLLA_R11_LIVE_ACTIVE_CORE_HANDLER_RUNTIME_V1',
    status: 'PASS',
    run_id: args.runId,
    work_id: workId,
    active_core_root: activeCoreRoot,
    handler_path: handlerPath,
    target_handler_loaded: true,
    external_worker_pid: heartbeat.pid,
    dispatch_path: 'handleStage4DispatchNextPrompt',
    result_path: 'handleStage4RunCheck',
    storage_path: 'handleStage4AppendStationRecords',
    request_path: bridge.request_path,
    work_result_path: resultPath,
    work_result_sha256: sha256(resultBytes),
    attempt_file_count: attemptFiles.length,
    processed_file_count: processedFiles.length,
    pc_agent_execution: 'PASS',
    collector: 'PASS',
    storage: 'PASS',
    exit_code: 0,
    production: false,
    ready: false,
    merge: false
  }) + '\n');
}

main().catch((error) => {
  process.stderr.write(JSON.stringify({
    schema_version: 'YOLLA_R11_LIVE_ACTIVE_CORE_HANDLER_RUNTIME_V1',
    status: 'FAIL',
    message: error && error.message ? error.message : String(error),
    stack: error && error.stack ? error.stack : null,
    production: false,
    ready: false,
    merge: false
  }) + '\n');
  process.exitCode = 1;
});
