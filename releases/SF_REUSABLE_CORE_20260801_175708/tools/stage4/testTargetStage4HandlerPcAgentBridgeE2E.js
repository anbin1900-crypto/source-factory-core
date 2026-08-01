#!/usr/bin/env node
'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function parseArgs(argv) {
  const result = { activeCoreRoot: '', packageRoot: '', bridgeRoot: '', python: '' };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--active-core-root') result.activeCoreRoot = argv[++index] || '';
    else if (token === '--package-root') result.packageRoot = argv[++index] || '';
    else if (token === '--bridge-root') result.bridgeRoot = argv[++index] || '';
    else if (token === '--python') result.python = argv[++index] || '';
    else throw new Error('UNKNOWN_ARGUMENT:' + token);
  }
  if (!result.activeCoreRoot) throw new Error('ACTIVE_CORE_ROOT_REQUIRED');
  if (!result.packageRoot) throw new Error('PACKAGE_ROOT_REQUIRED');
  if (!result.bridgeRoot) result.bridgeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-target-handler-bridge-'));
  if (!result.python) result.python = process.env.PYTHON_EXE || process.env.PYTHON || (process.platform === 'win32' ? 'python.exe' : 'python3');
  return result;
}

async function main() {
  const args = parseArgs(process.argv);
  const handlerPath = path.resolve(args.activeCoreRoot, 'safe_panel_v10', 'ipc', 'stage4StationBindingHandlers.js');
  const workerPath = path.resolve(args.packageRoot, 'integrations', 'pc_agent_v1', 'pc_agent_bridge_worker.py');
  if (!fs.existsSync(handlerPath)) throw new Error('TARGET_HANDLER_MISSING:' + handlerPath);
  if (!fs.existsSync(workerPath)) throw new Error('BRIDGE_WORKER_MISSING:' + workerPath);

  const handler = require(handlerPath);
  if (typeof handler.handleStage4DispatchNextPrompt !== 'function') throw new Error('DISPATCH_EXPORT_MISSING');
  if (typeof handler.handleStage4RunCheck !== 'function') throw new Error('RUN_CHECK_EXPORT_MISSING');

  fs.mkdirSync(args.bridgeRoot, { recursive: true });
  const input = {
    pc_agent_enabled: true,
    project_id: 'source-factory-target-handler-e2e',
    cycle_id: 'S2-SUPPORT-CYCLE-001-20260801',
    worker_slot_uid: 'A1-TARGET-HANDLER',
    assignment_id: 'A1-SF-PCAGENT-TARGET-HANDLER-E2E',
    directive_id: 'A1-SOURCE-FACTORY-PC-AGENT-TARGET-HANDLER-E2E-20260801-001',
    execution_id: 'target-handler-exec-001',
    attempt_id: 'attempt-001',
    task_id: 'target-handler-task-001',
    source_github_ref: 'source-factory-core@integration/source-factory-pc-agent-api-db-v1',
    work_type: 'LOCAL_COMMAND',
    command_spec: {
      executable: args.python,
      args: ['-c', 'import json; print("YOLLA_RESULT_JSON="+json.dumps({"target_handler":"PASS","outputs":[{"kind":"target-handler"}],"artifacts":[],"database_receipt":{"status":"PASS","production":False},"production":False}))'],
      cwd: args.bridgeRoot,
      timeout_seconds: 30,
      env: {}
    }
  };
  const deps = { pcAgentBridgeOptions: { enabled: true, bridgeRoot: args.bridgeRoot } };
  const dispatch = await handler.handleStage4DispatchNextPrompt(null, input, deps);
  const bridge = dispatch && dispatch.data && dispatch.data.pc_agent;
  if (!bridge || bridge.pc_agent_dispatched !== true || !bridge.work_id) {
    throw new Error('TARGET_HANDLER_DISPATCH_FAILED:' + JSON.stringify(dispatch));
  }

  const workerRun = childProcess.spawnSync(args.python, [workerPath, '--bridge-root', args.bridgeRoot, '--once'], {
    encoding: 'utf8', shell: false
  });
  if (workerRun.status !== 0) throw new Error('TARGET_HANDLER_WORKER_FAILED:' + (workerRun.stderr || workerRun.stdout));

  const result = await handler.handleStage4RunCheck(null, { work_id: bridge.work_id }, deps);
  const data = result && result.data ? result.data : {};
  if (data.final_status !== 'PASS' || Number(data.exit_code) !== 0) {
    throw new Error('TARGET_HANDLER_RESULT_FAILED:' + JSON.stringify(result));
  }
  if (!data.pc_agent_storage || data.pc_agent_storage.ok !== true) {
    throw new Error('TARGET_HANDLER_STORAGE_FAILED:' + JSON.stringify(data.pc_agent_storage));
  }

  process.stdout.write(JSON.stringify({
    schema_version: 'YOLLA_TARGET_STAGE4_HANDLER_PC_AGENT_E2E_V1',
    status: 'PASS',
    work_id: bridge.work_id,
    target_handler_loaded: true,
    dispatch_path: 'handleStage4DispatchNextPrompt',
    result_path: 'handleStage4RunCheck',
    storage_path: 'handleStage4AppendStationRecords',
    pc_agent_execution: 'PASS',
    exit_code: 0,
    storage: 'PASS',
    production: false,
    ready: false,
    merge: false
  }) + '\n');
}

main().catch((error) => {
  process.stderr.write(JSON.stringify({ status: 'FAIL', message: error.message, stack: error.stack }) + '\n');
  process.exitCode = 1;
});
