#!/usr/bin/env node
'use strict';

const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const adapter = require('../../src/shared/stage4/pcAgentBridgeAdapter');
const patcher = require('./applyPcAgentBridgePatch');

function pythonExecutable() {
  return process.env.PYTHON_EXE || process.env.PYTHON || (process.platform === 'win32' ? 'python.exe' : 'python3');
}

function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yolla-sf-pc-agent-e2e-'));
  const worker = path.resolve(__dirname, '..', '..', '..', '..', 'integrations', 'pc_agent_v1', 'pc_agent_bridge_worker.py');
  assert.ok(fs.existsSync(worker), 'bridge worker missing: ' + worker);

  const input = {
    pc_agent_enabled: true,
    project_id: 'project-fixture-1',
    cycle_id: 'cycle-fixture-1',
    worker_slot_uid: 'slot-fixture-1',
    assignment_id: 'assignment-fixture-1',
    directive_id: 'directive-fixture-1',
    execution_id: 'execution-fixture-1',
    attempt_id: 'attempt-1',
    task_id: 'task-fixture-1',
    source_github_ref: 'fixture@0000000',
    work_type: 'LOCAL_COMMAND',
    command_spec: {
      executable: pythonExecutable(),
      args: ['-c', 'import json; print("YOLLA_RESULT_JSON="+json.dumps({"bridge":"PASS","value":7,"outputs":[{"kind":"fixture"}],"artifacts":[],"database_receipt":{"status":"PASS","production":False},"production":False}))'],
      cwd: root,
      timeout_seconds: 30,
      env: {}
    }
  };

  const dispatched = adapter.dispatchWorkRequest(input, {
    enabled: true,
    bridgeRoot: root,
    source: 'testPcAgentBridgeE2E'
  });
  assert.strictEqual(dispatched.pc_agent_dispatched, true);
  assert.strictEqual(dispatched.dispatch_status, 'queued');
  assert.ok(fs.existsSync(dispatched.request_path));

  const duplicate = adapter.dispatchWorkRequest(input, {
    enabled: true,
    bridgeRoot: root,
    source: 'testPcAgentBridgeE2E'
  });
  assert.strictEqual(duplicate.pc_agent_dispatched, false);
  assert.strictEqual(duplicate.dispatch_status, 'duplicate');
  assert.strictEqual(duplicate.work_id, dispatched.work_id);

  const run = childProcess.spawnSync(pythonExecutable(), [
    worker,
    '--bridge-root', root,
    '--once'
  ], { encoding: 'utf8', shell: false });
  if (run.status !== 0) {
    throw new Error('BRIDGE_WORKER_FAILED:' + (run.stderr || run.stdout));
  }

  const observed = adapter.readWorkResult({ work_id: dispatched.work_id }, { bridgeRoot: root });
  assert.strictEqual(observed.available, true);
  assert.strictEqual(observed.result.final_status, 'PASS');
  assert.strictEqual(observed.result.exit_code, 0);
  assert.strictEqual(observed.result.database_receipt.status, 'PASS');
  assert.strictEqual(observed.result.structured_result.bridge, 'PASS');
  assert.ok(observed.result.stdout.includes('"bridge": "PASS"') || observed.result.stdout.includes('"bridge":"PASS"'));

  const collector = adapter.toCollectorPayload(observed.result, input);
  assert.strictEqual(collector.executed, true);
  assert.strictEqual(collector.final_status, 'PASS');
  assert.strictEqual(collector.work_id, dispatched.work_id);

  const storage = adapter.toStoragePayload(observed.result, input);
  assert.strictEqual(storage.source_terminal, 'PC_AGENT');
  assert.strictEqual(storage.collector_status, 'COLLECTED');
  assert.ok(storage.raw_text.includes(dispatched.work_id));

  const disabled = adapter.dispatchWorkRequest({ command: 'node' }, { bridgeRoot: root });
  assert.strictEqual(disabled.dispatch_status, 'skipped');

  const syntheticHandler = [
    "'use strict';",
    'function normalizePayload(payload) { return payload || {}; }',
    'async function handleStage4AppendStationRecords(event, payload, deps) { return { ok: true, data: payload }; }',
    'async function handleStage4DispatchNextPrompt(event, payload, deps) { return { ok: true, data: { dispatch: true } }; }',
    'async function handleStage4RunCheck(event, payload, deps) { return { ok: true, data: payload }; }',
    'async function handleStage4ManageResource(event, payload, deps) { return { ok: true }; }',
    'module.exports = { handleStage4DispatchNextPrompt, handleStage4RunCheck };',
    ''
  ].join('\n');
  const patched = patcher.buildPatchedSource(syntheticHandler);
  assert.strictEqual(patched.changed, true);
  assert.ok(patched.source.includes('YOLLA_PC_AGENT_STAGE4_BRIDGE_V1_START'));
  assert.ok(patched.source.includes('handleStage4DispatchNextPrompt__PC_AGENT_ORIGINAL'));
  assert.ok(patched.source.includes('handleStage4RunCheck__PC_AGENT_ORIGINAL'));
  const syntheticFile = path.join(root, 'stage4StationBindingHandlers.synthetic.js');
  fs.writeFileSync(syntheticFile, patched.source, 'utf8');
  const nodeCheck = childProcess.spawnSync(process.execPath, ['--check', syntheticFile], { encoding: 'utf8' });
  if (nodeCheck.status !== 0) throw new Error('PATCH_NODE_CHECK_FAILED:' + nodeCheck.stderr);

  const summary = {
    schema_version: adapter.SCHEMA_VERSION,
    status: 'PASS',
    work_id: dispatched.work_id,
    duplicate_suppression: 'PASS',
    worker_execution: 'PASS',
    structured_result_propagation: 'PASS',
    database_receipt_propagation: 'PASS',
    result_collection: 'PASS',
    storage_mapping: 'PASS',
    fallback_disabled: 'PASS',
    patch_generation: 'PASS',
    node_check: 'PASS',
    production: false
  };
  process.stdout.write(JSON.stringify(summary) + '\n');
  fs.rmSync(root, { recursive: true, force: true });
}

try {
  main();
} catch (error) {
  process.stderr.write(JSON.stringify({ status: 'FAIL', message: error.message, stack: error.stack }) + '\n');
  process.exitCode = 1;
}
