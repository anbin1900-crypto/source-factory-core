'use strict';

const crypto = require('node:crypto');
const path = require('node:path');

const REQUIRED_EVENT_TYPES = Object.freeze([
  'cdp.attached',
  'network.requestWillBeSent',
  'network.responseReceived',
  'network.responseBody',
  'dom.snapshot',
  'page.frameNavigated'
]);
const SENSITIVE_NAME_RE = /(authorization|cookie|token|secret|password|passwd|api[_-]?key|session[_-]?key|credential|jwt)/i;
const SECRET_VALUE_RE = /(bearer\s+[a-z0-9._~+/=-]{8,}|basic\s+[a-z0-9+/=]{8,}|(?:api[_-]?key|token|secret|password)\s*[:=]\s*(?!<redacted>)[^\s,;}]{6,})/i;

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function sha256(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : stableStringify(value), 'utf8').digest('hex');
}

function fail(code, detail, evidence = {}) {
  const error = new Error(detail);
  error.code = code;
  error.evidence = evidence;
  throw error;
}

function countTypes(events) {
  const counts = {};
  for (const event of events) counts[event.type] = (counts[event.type] || 0) + 1;
  return counts;
}

function assertNoRawSecrets(value, currentKey = '') {
  if (Array.isArray(value)) {
    value.forEach((item) => assertNoRawSecrets(item, currentKey));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (SENSITIVE_NAME_RE.test(key) && typeof item === 'string' && item !== '<REDACTED>' && item !== 'PRESENT_REDACTED' && item !== 'NOT_PRESENT') {
        fail('RAW_SECRET_VALUE_DETECTED', `Sensitive field ${key} contains a non-redacted string.`, { key });
      }
      assertNoRawSecrets(item, key);
    }
    return;
  }
  if (typeof value === 'string' && SECRET_VALUE_RE.test(value) && value !== '<REDACTED>') {
    fail('RAW_SECRET_VALUE_DETECTED', `Secret-like value detected at ${currentKey || '<root>'}.`, { key: currentKey });
  }
}

function eventRequestId(event) {
  return event && event.payload && (event.payload.request_id || event.payload.requestId) || null;
}

function resolveA4Binding(input) {
  const handoff = input.a4_live_handoff || null;
  if (handoff) {
    if (handoff.schemaVersion !== 'A4_WAVE2_LIVE_EVENT_STRUCTURE_HANDOFF_V1') {
      fail('A4_WAVE2_HANDOFF_SCHEMA_MISMATCH', 'A-4 Wave 2 handoff schema mismatch.');
    }
    return {
      structure: handoff.inference,
      evidence: {
        source: 'A4_LIVE_STRUCTURE_INFERENCE',
        actual_a3_live_fixture_bound: handoff.source && handoff.source.live === true,
        analyzer_session_id: input.capture_evidence && input.capture_evidence.analyzer_session_id,
        a4_pr: 23,
        a4_head: input.a4_structure_evidence && input.a4_structure_evidence.a4_head || null,
        result_sha256: handoff.inference && handoff.inference.resultSha256,
        a3_event_sha256: handoff.source && handoff.source.eventDigest,
        stream_id: handoff.source && handoff.source.streamId
      },
      handoff
    };
  }
  return { structure: input.a4_structure, evidence: input.a4_structure_evidence || {}, handoff: null };
}

function validateLiveTrafficEnvelope(input) {
  if (!input || input.schema_version !== 'A5_LIVE_TRAFFIC_BINDING_INPUT_V1') {
    fail('INVALID_BINDING_SCHEMA', 'schema_version must be A5_LIVE_TRAFFIC_BINDING_INPUT_V1.');
  }
  const evidence = input.capture_evidence || {};
  if (evidence.source !== 'A3_LIVE_CDP_CAPTURE' || evidence.actual_browser !== true || evidence.runtime_kind !== 'ELECTRON_CHROMIUM_CDP') {
    fail('LIVE_CAPTURE_PROVENANCE_REQUIRED', 'Actual Electron/Chromium CDP capture evidence is required.', { evidence });
  }
  if (evidence.fixture === true || evidence.synthetic === true || evidence.fake_debugger === true) {
    fail('FIXTURE_LIVE_MISCLASSIFICATION_REJECTED', 'Fixture, synthetic, or FakeDebugger traffic cannot satisfy Live Traffic binding.');
  }
  const events = input.a3_events;
  if (!Array.isArray(events) || events.length === 0) fail('A3_LIVE_EVENT_ZERO', 'A-3 live event array is empty.');
  assertNoRawSecrets(events);

  const sessions = new Set();
  const webContentsIds = new Set();
  const sequences = new Set();
  let previousSequence = 0;
  for (const event of events) {
    if (!event || event.schema_version !== 'STREAMING_ANALYZER_EVENT_V1') fail('A3_EVENT_SCHEMA_MISMATCH', 'All events must use STREAMING_ANALYZER_EVENT_V1.');
    if (!Number.isInteger(event.sequence) || event.sequence <= previousSequence || sequences.has(event.sequence)) {
      fail('A3_EVENT_SEQUENCE_INVALID', 'Event sequence must be strictly increasing and unique.', { sequence: event.sequence, previousSequence });
    }
    previousSequence = event.sequence;
    sequences.add(event.sequence);
    sessions.add(event.analyzer_session_id);
    if (!Number.isInteger(event.web_contents_id) || event.web_contents_id <= 0) fail('A3_REAL_WEB_CONTENTS_ID_REQUIRED', 'A real positive Electron web_contents_id is required.');
    webContentsIds.add(event.web_contents_id);
  }
  if (sessions.size !== 1 || !sessions.has(evidence.analyzer_session_id)) fail('A3_SESSION_BINDING_MISMATCH', 'All events must bind to capture_evidence.analyzer_session_id.');
  if (webContentsIds.size !== 1 || !webContentsIds.has(evidence.web_contents_id)) fail('A3_WEB_CONTENTS_BINDING_MISMATCH', 'All events must bind to capture_evidence.web_contents_id.');

  const eventDigest = sha256(events);
  if (evidence.event_sha256 !== eventDigest) fail('A3_EVENT_DIGEST_MISMATCH', 'A-3 event digest does not match capture evidence.', { expected: evidence.event_sha256, actual: eventDigest });
  const counts = countTypes(events);
  for (const type of REQUIRED_EVENT_TYPES) if (!counts[type]) fail('A3_REQUIRED_LIVE_EVENT_MISSING', `Required live event ${type} is missing.`, { counts });

  const requests = new Set(events.filter((event) => event.type === 'network.requestWillBeSent').map(eventRequestId).filter(Boolean));
  const responses = new Set(events.filter((event) => event.type === 'network.responseReceived').map(eventRequestId).filter(Boolean));
  const bodies = new Set(events.filter((event) => event.type === 'network.responseBody').map(eventRequestId).filter(Boolean));
  if (!requests.size) fail('A3_LIVE_REQUEST_ZERO', 'No requestId-bearing live network request exists.');
  for (const requestId of requests) {
    if (!responses.has(requestId)) fail('A3_REQUEST_RESPONSE_ORPHAN', `Missing response for request_id=${requestId}.`);
    if (!bodies.has(requestId)) fail('A3_REQUEST_BODY_ORPHAN', `Missing response body for request_id=${requestId}.`);
  }

  const a4Binding = resolveA4Binding(input);
  const a4Evidence = a4Binding.evidence;
  const a4 = a4Binding.structure;
  if (a4Evidence.source !== 'A4_LIVE_STRUCTURE_INFERENCE' || a4Evidence.actual_a3_live_fixture_bound !== true) {
    fail('A4_LIVE_STRUCTURE_BINDING_REQUIRED', 'A-4 structure must be explicitly bound to the same A-3 live capture.');
  }
  if (!a4 || a4.schemaVersion !== 'A4_STRUCTURE_INFERENCE_RESULT_V1') fail('A4_STRUCTURE_SCHEMA_MISMATCH', 'A-4 structure schema mismatch.');
  if (a4Evidence.analyzer_session_id !== evidence.analyzer_session_id) fail('A4_A3_SESSION_MISMATCH', 'A-4 structure and A-3 traffic use different analyzer sessions.');
  if (a4Evidence.result_sha256 !== a4.resultSha256) fail('A4_RESULT_DIGEST_MISMATCH', 'A-4 structure result digest mismatch.');
  if (a4Binding.handoff && a4Evidence.a3_event_sha256 !== eventDigest) fail('A4_A3_EVENT_DIGEST_MISMATCH', 'A-4 Wave 2 handoff was not produced from the exact A-3 event stream.');
  if (!a4.stats || a4.stats.navigationEventCount < 1) fail('A4_LIVE_NAVIGATION_EVIDENCE_ZERO', 'A-4 structure has no live navigation evidence.');
  return { counts, eventDigest, analyzerSessionId: [...sessions][0], webContentsId: [...webContentsIds][0] };
}

function parseBody(bodyEvent) {
  const payload = bodyEvent && bodyEvent.payload || {};
  if (typeof payload.inline_body !== 'string') return undefined;
  let text = payload.inline_body;
  if (payload.base64_encoded) {
    try { text = Buffer.from(text, 'base64').toString('utf8'); } catch { return undefined; }
  }
  try { return JSON.parse(text); } catch { return text; }
}

function normalizeStreamingTraffic(events, binding) {
  const responseByRequest = new Map();
  const bodyByRequest = new Map();
  for (const event of events) {
    const requestId = eventRequestId(event);
    if (!requestId) continue;
    if (event.type === 'network.responseReceived') responseByRequest.set(requestId, event);
    if (event.type === 'network.responseBody') bodyByRequest.set(requestId, event);
  }
  const observations = [];
  for (const requestEvent of events.filter((event) => event.type === 'network.requestWillBeSent')) {
    const requestId = eventRequestId(requestEvent);
    const responseEvent = responseByRequest.get(requestId);
    const bodyEvent = bodyByRequest.get(requestId);
    const request = requestEvent.payload || {};
    const response = responseEvent.payload || {};
    const bodyPayload = bodyEvent.payload || {};
    const body = parseBody(bodyEvent);
    const mimeType = response.mime_type || bodyPayload.mime_type || '';
    observations.push({
      event_id: requestEvent.event_id,
      observation_id: requestEvent.event_id,
      request: {
        method: request.method || 'GET',
        url: request.request_url,
        resource_type: request.resource_type || 'FETCH',
        headers: request.request_headers || {},
        body_format: request.has_post_data ? 'UNKNOWN' : 'NONE'
      },
      response: {
        status: response.status ?? bodyPayload.status ?? null,
        content_type: mimeType,
        body_format: /json/i.test(mimeType) || (body && typeof body === 'object') ? 'JSON' : /html/i.test(mimeType) ? 'HTML' : 'UNKNOWN',
        body,
        size_bytes: bodyPayload.size_bytes ?? null
      },
      evidence_pointer: `github://a3/${binding.a3_head}/${requestEvent.event_id}/${requestId}`
    });
  }
  return observations;
}

function normalizeA4Structure(a4) {
  return {
    repeated_regions: a4.repeatedRegions || [],
    fields: a4.fieldCandidates || [],
    locators: a4.locatorCandidates || [],
    pagination: a4.pagination || null,
    page_types: a4.pageType ? [a4.pageType] : [],
    list_detail_relation: a4.listDetailRelation || null,
    highlight_payload: a4.highlightPayload || null
  };
}

function resolveGenerator(options = {}) {
  if (typeof options.buildGeneratorInput === 'function') return options.buildGeneratorInput;
  const modulePath = options.generatorModule || path.join(__dirname, '..', 'live-inference', 'endpoint_schema_mode_inference.cjs');
  return require(modulePath).buildGeneratorInput;
}

function bindLiveTraffic(input, options = {}) {
  const live = validateLiveTrafficEnvelope(input);
  const observations = normalizeStreamingTraffic(input.a3_events, input.capture_evidence);
  const a4Binding = resolveA4Binding(input);
  const dom = normalizeA4Structure(a4Binding.structure);
  const buildGeneratorInput = resolveGenerator(options);
  const generatorInput = buildGeneratorInput({
    generated_at: options.generated_at || input.generated_at,
    source_bindings: {
      a3_pr: input.capture_evidence.a3_pr,
      a3_head: input.capture_evidence.a3_head,
      a3_event_sha256: live.eventDigest,
      a3_analyzer_session_id: live.analyzerSessionId,
      a3_web_contents_id: live.webContentsId,
      a4_pr: a4Binding.evidence.a4_pr,
      a4_head: a4Binding.evidence.a4_head,
      a4_result_sha256: a4Binding.structure.resultSha256,
      binding_kind: 'ACTUAL_LIVE_TRAFFIC_AND_STRUCTURE'
    },
    network_observations: observations,
    dom_candidates: dom,
    pagination: dom.pagination,
    previous_schemas: input.previous_generator_input && input.previous_generator_input.response_schemas || []
  }, { generated_at: options.generated_at || input.generated_at });

  const result = {
    schema_version: 'A5_LIVE_TRAFFIC_GENERATOR_INPUT_V1',
    binding_status: 'LIVE_TRAFFIC_BOUND',
    live_evidence: {
      analyzer_session_id: live.analyzerSessionId,
      web_contents_id: live.webContentsId,
      event_sha256: live.eventDigest,
      event_counts: live.counts,
      normalized_request_count: observations.length,
      a3_head: input.capture_evidence.a3_head,
      a4_head: a4Binding.evidence.a4_head,
      a4_result_sha256: a4Binding.structure.resultSha256
    },
    generator_input: generatorInput,
    a6_handoff: {
      status: generatorInput.repairs && generatorInput.repairs.fail_closed ? 'BLOCKED_BREAKING_SCHEMA_DRIFT' : 'READY',
      adapter_mode: generatorInput.extraction_mode && generatorInput.extraction_mode.mode,
      endpoint_group_count: generatorInput.counters && generatorInput.counters.endpoint_group_count,
      response_schema_count: generatorInput.counters && generatorInput.counters.response_schema_count,
      raw_secret_value_count: 0
    }
  };
  assertNoRawSecrets(result);
  result.output_sha256 = sha256(result);
  return result;
}

module.exports = {
  REQUIRED_EVENT_TYPES,
  assertNoRawSecrets,
  bindLiveTraffic,
  countTypes,
  normalizeA4Structure,
  resolveA4Binding,
  normalizeStreamingTraffic,
  sha256,
  stableStringify,
  validateLiveTrafficEnvelope
};

if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { raw += chunk; });
  process.stdin.on('end', () => {
    try {
      const output = bindLiveTraffic(JSON.parse(raw || '{}'));
      process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    } catch (error) {
      process.stderr.write(`${JSON.stringify({ status: 'BLOCKED', code: error.code || 'UNEXPECTED_ERROR', message: error.message, evidence: error.evidence || null }, null, 2)}\n`);
      process.exitCode = 2;
    }
  });
}
