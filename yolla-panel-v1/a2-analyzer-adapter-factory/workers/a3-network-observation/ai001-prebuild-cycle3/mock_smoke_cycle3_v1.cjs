'use strict';
const assert = require('node:assert/strict');
const {
  WorkerCompletionObserverV1,
  parseMarkers,
  buildInjectedObserverScript,
  makeCdpRuntimeAdapter,
} = require('./WORKER_COMPLETION_OBSERVER_V1.cjs');

function snapshot({ messages = [], generating = false, stable = 0, selectorFound = true, mutation = 0 } = {}) {
  return {
    selector_found: selectorFound,
    assistant_selector_strategy: selectorFound ? 'primary' : 'none',
    generating_selector_strategy: generating ? 'primary' : 'none',
    assistant_messages: messages,
    assistant_message_count: messages.length,
    generating_ui_active: generating,
    mutation_count: mutation,
    last_mutation_ms: 1000,
    now_ms: 1000 + stable,
    dom_stable_ms: stable,
  };
}

async function runSmoke() {
  let now = Date.parse('2026-08-07T13:40:00.000Z');
  const clock = () => now++;
  const registry = {
    schema_version: 'WORKER_PAGE_REGISTRY_V1',
    entries: [
      { worker_id: 'A-3', page_id: 'page-a3' },
      { worker_id: 'A-4', page_id: 'page-a4' },
      { worker_id: 'B-5', page_id: 'page-b5' },
    ],
  };
  const observer = new WorkerCompletionObserverV1({ registry, stableMs: 1500, clock });
  const events = [];
  observer.on('state', (event) => events.push(event));

  const dispatched = observer.noteDispatch('A-3', 'CMD-001');
  assert.equal(dispatched.state, 'DISPATCHED');
  const generating = observer.observeSnapshot('A-3', snapshot({ messages: ['작업을 수행 중입니다.'], generating: true, stable: 50, mutation: 3 }));
  assert.equal(generating.state, 'GENERATING');
  const complete = observer.observeSnapshot('A-3', snapshot({
    messages: ['WORK_STATUS=COMPLETE\nCOMMAND_ID=CMD-001\nTERMINAL=A3_DONE'],
    generating: false,
    stable: 2000,
    mutation: 4,
  }));
  assert.equal(complete.state, 'COMPLETE');
  assert.equal(complete.completion_assessment, 'EXPLICIT_COMPLETE');
  assert.equal(complete.technical_pass_claimed, false);

  observer.noteDispatch('A-4', 'CMD-002');
  const blocked = observer.observeSnapshot('A-4', snapshot({
    messages: ['COMMAND_ID: CMD-002\nWORK_STATUS: BLOCKED\nBLOCKER: TARGET_UNAVAILABLE'],
    generating: false,
    stable: 1700,
  }));
  assert.equal(blocked.state, 'BLOCKED');
  assert.equal(blocked.blocker, 'TARGET_UNAVAILABLE');

  observer.noteDispatch('B-5', 'CMD-003');
  const likely = observer.observeSnapshot('B-5', snapshot({
    messages: ['작업을 완료한 것으로 보이는 일반 답변이지만 명시 Marker가 없습니다.'],
    generating: false,
    stable: 2500,
  }));
  assert.equal(likely.state, 'UNKNOWN');
  assert.equal(likely.completion_assessment, 'LIKELY_COMPLETE');

  const selectorMiss = observer.observeSnapshot('B-5', snapshot({ selectorFound: false }));
  assert.equal(selectorMiss.state, 'UNKNOWN');
  assert.equal(selectorMiss.reason_codes.includes('SELECTOR_MISS_FAIL_SAFE'), true);

  const markers = parseMarkers('WORK_STATUS=COMPLETE\nCOMMAND_ID=abc\nTERMINAL=T1\nAuthorization=Bearer raw-secret-value');
  assert.equal(markers.WORK_STATUS, 'COMPLETE');
  assert.equal(markers.COMMAND_ID, 'abc');
  assert.equal(markers.TERMINAL, 'T1');

  const script = buildInjectedObserverScript(undefined, 1500);
  assert(script.includes('MutationObserver'));
  assert(script.includes('__YOLLA_WORKER_COMPLETION_OBSERVER_V1__'));

  const calls = [];
  const cdpAdapter = makeCdpRuntimeAdapter({
    async send(method, params, sessionId) {
      calls.push({ method, params, sessionId });
      return { result: { value: { ok: true } } };
    }
  }, 'session-1');
  const evalResult = await cdpAdapter.evaluate('1+1');
  assert.equal(evalResult.ok, true);
  assert.equal(calls[0].method, 'Runtime.evaluate');
  assert.equal(calls[0].sessionId, 'session-1');

  const result = {
    status: 'PASS',
    smoke_run_count: 1,
    registry_pass: true,
    dispatched_generating_complete_sequence_pass: true,
    blocked_pass: true,
    likely_complete_not_promoted_pass: true,
    selector_miss_unknown_pass: true,
    marker_parser_pass: true,
    mutation_observer_script_pass: true,
    cdp_runtime_adapter_pass: true,
    emitted_event_count: events.length,
    explicit_complete_count: events.filter((e) => e.state === 'COMPLETE').length,
    blocked_count: events.filter((e) => e.state === 'BLOCKED').length,
    unknown_count: events.filter((e) => e.state === 'UNKNOWN').length,
    technical_pass_claim_count: events.filter((e) => e.technical_pass_claimed).length,
    raw_secret_storage_count: events.filter((e) => e.raw_secret_storage).length,
    terminal: 'A3_CHROME_WORKER_COMPLETION_OBSERVER_READY'
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (require.main === module) runSmoke().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { runSmoke };
