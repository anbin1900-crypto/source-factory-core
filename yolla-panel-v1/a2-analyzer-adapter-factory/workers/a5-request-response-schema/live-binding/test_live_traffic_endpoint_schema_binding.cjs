'use strict';
const assert = require('node:assert/strict');
const {
  bindLiveTraffic,
  sha256,
  validateLiveTrafficEnvelope,
  normalizeStreamingTraffic
} = require('./live_traffic_endpoint_schema_binding.cjs');

let assertions = 0;
const ok = (value, message) => { assert.ok(value, message); assertions += 1; };
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions += 1; };
const throwsCode = (fn, code) => {
  assert.throws(fn, (error) => { assertions += 1; return error && error.code === code; });
};

function event(sequence, type, payload = {}) {
  return {
    schema_version: 'STREAMING_ANALYZER_EVENT_V1',
    sequence,
    event_id: `evt-${sequence}`,
    analyzer_session_id: 'live-session-1',
    web_contents_id: 77,
    type,
    observed_at: `2026-08-07T03:0${Math.min(sequence, 9)}:00.000Z`,
    monotonic_ms: sequence * 10,
    page_url: 'http://127.0.0.1:8787/list',
    payload
  };
}

function makeInput() {
  const events = [
    event(1, 'cdp.attached', { protocol_version: '1.3' }),
    event(2, 'dom.snapshot', { reason: 'attach', snapshot: { documents: [], strings: [] } }),
    event(3, 'network.requestWillBeSent', { request_id: 'r1', request_url: 'http://127.0.0.1:8787/api/items?page=1&size=10', method: 'GET', resource_type: 'XHR', request_headers: { Accept: 'application/json', Authorization: '<REDACTED>' }, has_post_data: false }),
    event(4, 'network.responseReceived', { request_id: 'r1', status: 200, mime_type: 'application/json', response_headers: { 'content-type': 'application/json' } }),
    event(5, 'network.responseBody', { request_id: 'r1', status: 200, mime_type: 'application/json', inline_body: JSON.stringify({ items: [{ listingId: 'L1', regionId: 'R1', title: 'A' }, { listingId: 'L2', regionId: 'R1', title: 'B' }] }), base64_encoded: false, size_bytes: 130, sha256: 'a'.repeat(64) }),
    event(6, 'page.frameNavigated', { frame_id: 'f1', url: 'http://127.0.0.1:8787/list' }),
    event(7, 'page.lifecycleEvent', { frame_id: 'f1', name: 'load' })
  ];
  return {
    schema_version: 'A5_LIVE_TRAFFIC_BINDING_INPUT_V1',
    generated_at: '2026-08-07T03:10:00+09:00',
    capture_evidence: {
      source: 'A3_LIVE_CDP_CAPTURE', actual_browser: true, runtime_kind: 'ELECTRON_CHROMIUM_CDP', fixture: false, synthetic: false, fake_debugger: false,
      a3_pr: 22, a3_head: 'a3-live-head', analyzer_session_id: 'live-session-1', web_contents_id: 77,
      event_sha256: sha256(events)
    },
    a3_events: events,
    a4_structure_evidence: {
      source: 'A4_LIVE_STRUCTURE_INFERENCE', actual_a3_live_fixture_bound: true, analyzer_session_id: 'live-session-1', a4_pr: 23, a4_head: 'a4-live-head', result_sha256: 'b'.repeat(64)
    },
    a4_structure: {
      schemaVersion: 'A4_STRUCTURE_INFERENCE_RESULT_V1', snapshotId: 'snap-1', documentUrl: 'http://127.0.0.1:8787/list',
      pageType: { type: 'LIST', confidence: 0.99 }, repeatedRegions: [{ locator: '.card', itemCount: 2 }],
      fieldCandidates: [{ name: 'title' }, { name: 'listingId' }, { name: 'regionId' }, { name: 'price' }, { name: 'url' }],
      locatorCandidates: [{ selector: '.card' }], listDetailRelation: { detected: true },
      pagination: { type: 'PAGE_NUMBER', detected: true, explicitNone: false, confidence: 0.95 },
      highlightPayload: { version: 1, highlights: [] },
      stats: { normalizedNodeCount: 20, repeatedRegionCount: 1, autoFieldCandidateCount: 5, locatorCandidateCount: 1, navigationEventCount: 2 },
      resultSha256: 'b'.repeat(64)
    }
  };
}

const input = makeInput();
const valid = validateLiveTrafficEnvelope(input);
eq(valid.analyzerSessionId, 'live-session-1');
eq(valid.webContentsId, 77);
eq(valid.counts['network.responseBody'], 1);
const normalized = normalizeStreamingTraffic(input.a3_events, input.capture_evidence);
eq(normalized.length, 1);
eq(normalized[0].request.method, 'GET');
eq(normalized[0].response.body.items.length, 2);
ok(!JSON.stringify(normalized).includes('Bearer'));

const stubGenerator = (payload) => ({
  endpoint_groups: [{ endpoint_group_id: 'EG-LIVE00000001' }],
  response_schemas: [{ endpoint_group_id: 'EG-LIVE00000001' }],
  extraction_mode: { mode: 'HYBRID' },
  repairs: { fail_closed: false },
  counters: { endpoint_group_count: 1, response_schema_count: 1, raw_secret_value_count: 0 },
  source_bindings: payload.source_bindings
});
const result = bindLiveTraffic(input, { buildGeneratorInput: stubGenerator, generated_at: input.generated_at });
eq(result.binding_status, 'LIVE_TRAFFIC_BOUND');
eq(result.a6_handoff.status, 'READY');
eq(result.a6_handoff.adapter_mode, 'HYBRID');
eq(result.live_evidence.normalized_request_count, 1);
ok(/^[a-f0-9]{64}$/.test(result.output_sha256));
eq(result.generator_input.source_bindings.binding_kind, 'ACTUAL_LIVE_TRAFFIC_AND_STRUCTURE');

const fake = makeInput(); fake.capture_evidence.fake_debugger = true;
throwsCode(() => validateLiveTrafficEnvelope(fake), 'FIXTURE_LIVE_MISCLASSIFICATION_REJECTED');
const zero = makeInput(); zero.a3_events = [];
throwsCode(() => validateLiveTrafficEnvelope(zero), 'A3_LIVE_EVENT_ZERO');
const noBody = makeInput(); noBody.a3_events = noBody.a3_events.filter((item) => item.type !== 'network.responseBody'); noBody.capture_evidence.event_sha256 = sha256(noBody.a3_events);
throwsCode(() => validateLiveTrafficEnvelope(noBody), 'A3_REQUIRED_LIVE_EVENT_MISSING');
const badDigest = makeInput(); badDigest.capture_evidence.event_sha256 = '0'.repeat(64);
throwsCode(() => validateLiveTrafficEnvelope(badDigest), 'A3_EVENT_DIGEST_MISMATCH');
const badA4 = makeInput(); badA4.a4_structure_evidence.actual_a3_live_fixture_bound = false;
throwsCode(() => validateLiveTrafficEnvelope(badA4), 'A4_LIVE_STRUCTURE_BINDING_REQUIRED');
const badSession = makeInput(); badSession.a4_structure_evidence.analyzer_session_id = 'other';
throwsCode(() => validateLiveTrafficEnvelope(badSession), 'A4_A3_SESSION_MISMATCH');
const rawSecret = makeInput(); rawSecret.a3_events[2].payload.request_headers.Authorization = 'Bearer abcdefghijklmnop'; rawSecret.capture_evidence.event_sha256 = sha256(rawSecret.a3_events);
throwsCode(() => validateLiveTrafficEnvelope(rawSecret), 'RAW_SECRET_VALUE_DETECTED');
const duplicateSequence = makeInput(); duplicateSequence.a3_events[1].sequence = 1; duplicateSequence.capture_evidence.event_sha256 = sha256(duplicateSequence.a3_events);
throwsCode(() => validateLiveTrafficEnvelope(duplicateSequence), 'A3_EVENT_SEQUENCE_INVALID');

const handoffInput = makeInput();
handoffInput.a4_live_handoff = {
  schemaVersion: 'A4_WAVE2_LIVE_EVENT_STRUCTURE_HANDOFF_V1',
  source: { live: true, eventDigest: handoffInput.capture_evidence.event_sha256, streamId: 'live-session-1' },
  inference: handoffInput.a4_structure,
  terminalReady: true
};
delete handoffInput.a4_structure;
const handoffResult = bindLiveTraffic(handoffInput, { buildGeneratorInput: stubGenerator, generated_at: input.generated_at });
eq(handoffResult.binding_status, 'LIVE_TRAFFIC_BOUND');
eq(handoffResult.live_evidence.a4_result_sha256, 'b'.repeat(64));
const mismatchedHandoff = makeInput();
mismatchedHandoff.a4_live_handoff = {
  schemaVersion: 'A4_WAVE2_LIVE_EVENT_STRUCTURE_HANDOFF_V1',
  source: { live: true, eventDigest: '0'.repeat(64), streamId: 'live-session-1' },
  inference: mismatchedHandoff.a4_structure,
  terminalReady: true
};
delete mismatchedHandoff.a4_structure;
throwsCode(() => validateLiveTrafficEnvelope(mismatchedHandoff), 'A4_A3_EVENT_DIGEST_MISMATCH');

const rerun = bindLiveTraffic(makeInput(), { buildGeneratorInput: stubGenerator, generated_at: input.generated_at });
eq(JSON.stringify(rerun), JSON.stringify(result));
process.stdout.write(JSON.stringify({ status: 'PASS', assertions, mode: result.a6_handoff.adapter_mode, binding_status: result.binding_status }) + '\n');
