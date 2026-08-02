'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const helper = require('../p1CommandCorrelationContract');
const sender = require('../sequentialPromptSender');
const taeo = require('../stores/taeoRawOutputStore');
const workerStore = require('../stores/workerOutputBatchStore');
const collector = require('../collectorCommanderGateHandoffAdapter');

const correlation = Object.freeze({
  command_id: 'CMD-A4-P1-001',
  worker_slot_uid: 'WKR-004',
  cycle_id: 'A2-P1-PANEL-WORKER-COMMAND-CYCLE6-V1-20260802-001',
  wave_id: 'Wave2',
  directive_registered_at_kst: '2026-08-02T21:48:00+09:00',
  result_published_at_kst: '2026-08-02T22:40:00+09:00',
  terminal_status: 'PASS',
  duplicate_prompt_key: 'A2-CYCLE6|2026-08-02T21:48:00+09:00|Wave2|A4',
  remote_pointer: {
    repository: 'anbin1900-crypto/source-factory-core',
    branch: 'worker/a4-p1-panel-worker-correlation-repair-v2',
    path: 'reports/LATEST.json'
  }
});

function assertAllFields(record, terminal) {
  helper.CORRELATION_FIELDS.forEach((field) => {
    assert.ok(Object.prototype.hasOwnProperty.call(record, field), `missing ${field}`);
    assert.deepEqual(record[field], field === 'terminal_status' && terminal ? terminal : correlation[field]);
    assert.deepEqual(record.command_correlation[field], record[field]);
  });
}

test('helper preserves all nine correlation fields', () => {
  const record = helper.attachCorrelation({ value: 1 }, correlation);
  assertAllFields(record);
});

test('helper creates A5 canonical idempotency key', () => {
  const record = helper.attachCorrelation({}, correlation);
  assert.match(record.idempotency_key, /^a5-p1-command-[0-9a-f]{64}$/);
  assert.equal(record.idempotency_key, record.command_correlation.idempotency_key);
});

test('TAEO record preserves all fields in memory', () => {
  const record = taeo.createTaeoRawOutputRecord(Object.assign({ rawText: 'ok' }, correlation));
  assertAllFields(record);
});

test('TAEO JSONL round trip preserves all fields', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a4-taeo-'));
  const file = path.join(dir, 'taeo.jsonl');
  taeo.appendTaeoRawOutputRecord(file, Object.assign({ rawText: 'ok' }, correlation));
  const restored = JSON.parse(fs.readFileSync(file, 'utf8').trim());
  assertAllFields(restored);
});

test('worker batch header preserves all fields', () => {
  const batch = workerStore.createWorkerOutputBatch(Object.assign({ batchId: 'B-1' }, correlation));
  assertAllFields(batch);
});

test('worker output JSONL preserves all fields', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a4-worker-'));
  const file = path.join(dir, 'worker.jsonl');
  workerStore.addWorkerOutputToBatch(file, Object.assign({
    batchId: 'B-1',
    workerId: 'A-4',
    taskId: 'T-1',
    status: 'READY_FOR_GATE'
  }, correlation));
  const restored = JSON.parse(fs.readFileSync(file, 'utf8').trim());
  assertAllFields(restored);
});

test('worker batch summary restores all fields from records', () => {
  const record = workerStore.createWorkerOutputRecord(Object.assign({
    batchId: 'B-1',
    status: 'READY_FOR_GATE'
  }, correlation));
  const summary = workerStore.summarizeWorkerOutputBatch([record], 'B-1');
  assertAllFields(summary);
});

test('collector Commander handoff preserves all fields at every boundary', () => {
  const handoff = collector.normalizeCollectorResponseToGateHandoff({
    ok: true,
    data: Object.assign({ worker_slot: 'WKR-004' }, correlation)
  }, {});
  assertAllFields(handoff);
  assertAllFields(handoff.source);
  assertAllFields(handoff.gate_inputs);
  assertAllFields(handoff.collectWorkerOutput);
  assert.deepEqual(handoff.next_commander_action.command_correlation, handoff.command_correlation);
});

test('duplicate dispatch normalizes terminal without a second execution', () => {
  const item = Object.assign({
    prompt_id: 'P-2',
    dedupe_key: correlation.duplicate_prompt_key
  }, correlation);
  const sent = Object.assign({
    prompt_id: 'P-1',
    dedupe_key: correlation.duplicate_prompt_key,
    already_sent: true
  }, correlation);
  const result = sender.preventDuplicateSend(item, [sent]);
  assert.equal(result.terminal_status, 'DUPLICATE_PROMPT_SUPPRESSED');
  assert.equal(result.second_execution_performed, false);
  assert.equal(result.execution_delta, 0);
  assertAllFields(result, 'DUPLICATE_PROMPT_SUPPRESSED');
});

test('duplicate next-payload path exposes normalized terminal', () => {
  const item = Object.assign({
    prompt_id: 'P-2',
    dedupe_key: correlation.duplicate_prompt_key
  }, correlation);
  const sent = Object.assign({
    prompt_id: 'P-1',
    dedupe_key: correlation.duplicate_prompt_key,
    already_sent: true
  }, correlation);
  const result = sender.getNextDispatchPayload([item, sent], { sentItems: [sent] });
  assert.equal(result.terminal_status, 'DUPLICATE_PROMPT_SUPPRESSED');
  assert.equal(result.second_execution_performed, false);
});

test('non-duplicate path does not invent duplicate terminal', () => {
  const item = Object.assign({ prompt_id: 'P-3', dedupe_key: 'UNIQUE' }, correlation, {
    duplicate_prompt_key: 'UNIQUE'
  });
  const result = sender.preventDuplicateSend(item, []);
  assert.equal(result.ok, true);
  assert.notEqual(result.terminal_status, 'DUPLICATE_PROMPT_SUPPRESSED');
});

test('missing fields remain detectable and are not fabricated', () => {
  const record = helper.attachCorrelation({}, { command_id: 'ONLY' });
  const missing = helper.missingCorrelationFields(record);
  assert.ok(missing.includes('worker_slot_uid'));
  assert.ok(missing.includes('remote_pointer'));
});

test('remote pointer remains structured after JSON round trip', () => {
  const record = helper.attachCorrelation({}, correlation);
  const restored = JSON.parse(JSON.stringify(record));
  assert.deepEqual(restored.remote_pointer, correlation.remote_pointer);
});

test('repair metadata proves no new runtime or transport', () => {
  assert.equal(sender.__a4P1CorrelationRepair.new_runtime, false);
  assert.equal(sender.__a4P1CorrelationRepair.new_transport, false);
  assert.equal(taeo.__a4P1CorrelationRepair.new_runtime, false);
  assert.equal(workerStore.__a4P1CorrelationRepair.new_runtime, false);
  assert.equal(collector.__a4P1CorrelationRepair.new_runtime, false);
});
