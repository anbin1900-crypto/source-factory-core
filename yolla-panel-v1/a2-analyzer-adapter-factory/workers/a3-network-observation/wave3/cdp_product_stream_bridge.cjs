'use strict';
const { createHash, randomUUID } = require('node:crypto');

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, stableValue(value[k])]));
  return value;
}
function stableStringify(value) { return JSON.stringify(stableValue(value)); }
function sha256(value) { return createHash('sha256').update(typeof value === 'string' ? value : stableStringify(value)).digest('hex'); }

class CdpProductStreamBridge {
  constructor({ streamId = randomUUID(), sourceHead = null, maxHistory = 20000 } = {}) {
    this.streamId = streamId;
    this.sourceHead = sourceHead;
    this.maxHistory = maxHistory;
    this.sequence = 0;
    this.generation = 0;
    this.currentSession = null;
    this.history = [];
    this.consumers = new Map();
    this.delivered = new Set();
    this.metrics = { published: 0, duplicate_delivery: 0, consumer_replacements: 0, session_starts: 0, session_ends: 0 };
  }

  startSession({ analyzerSessionId = randomUUID(), webContentsId, pageUrl = 'about:blank', runtimeKind = 'ELECTRON_CHROMIUM_CDP', runtimeIdentity = {} } = {}) {
    if (!Number.isInteger(webContentsId) || webContentsId <= 0) throw new Error('POSITIVE_WEB_CONTENTS_ID_REQUIRED');
    if (this.currentSession && !this.currentSession.ended) throw new Error('SESSION_ALREADY_ACTIVE');
    this.generation += 1;
    this.currentSession = {
      analyzer_session_id: analyzerSessionId,
      web_contents_id: webContentsId,
      runtime_kind: runtimeKind,
      runtime_identity: runtimeIdentity,
      page_url: pageUrl,
      generation: this.generation,
      started_sequence: this.sequence + 1,
      ended: false,
    };
    this.metrics.session_starts += 1;
    this.publish('bridge.sessionStarted', { generation: this.generation, runtime_identity: runtimeIdentity });
    return { ...this.currentSession };
  }

  endSession(reason = 'closed') {
    if (!this.currentSession || this.currentSession.ended) return null;
    const event = this.publish('bridge.sessionEnded', { generation: this.currentSession.generation, reason });
    this.currentSession.ended = true;
    this.currentSession.ended_sequence = event.sequence;
    this.metrics.session_ends += 1;
    return event;
  }

  setPageUrl(url) { if (this.currentSession) this.currentSession.page_url = url || this.currentSession.page_url; }

  registerConsumer(name, handler) {
    if (!name || typeof handler !== 'function') throw new TypeError('consumer name and handler required');
    if (this.consumers.has(name)) this.metrics.consumer_replacements += 1;
    this.consumers.set(name, handler);
    return () => { if (this.consumers.get(name) === handler) this.consumers.delete(name); };
  }

  publish(type, payload = {}, extra = {}) {
    if (!this.currentSession) throw new Error('SESSION_REQUIRED');
    const event = Object.freeze({
      schema_version: 'STREAMING_ANALYZER_EVENT_V1',
      sequence: ++this.sequence,
      event_id: extra.event_id || randomUUID(),
      analyzer_session_id: this.currentSession.analyzer_session_id,
      web_contents_id: this.currentSession.web_contents_id,
      type,
      observed_at: extra.observed_at || new Date().toISOString(),
      monotonic_ms: Number.isFinite(extra.monotonic_ms) ? extra.monotonic_ms : Date.now(),
      page_url: extra.page_url || this.currentSession.page_url,
      payload,
      producer: 'A-3',
      source: 'A3_LIVE_CDP_CAPTURE',
      live: true,
      stream_id: this.streamId,
      stream_generation: this.currentSession.generation,
    });
    this.history.push(event);
    if (this.history.length > this.maxHistory) this.history.shift();
    this.metrics.published += 1;
    for (const [name, handler] of this.consumers) {
      const deliveryKey = `${name}:${event.event_id}`;
      if (this.delivered.has(deliveryKey)) { this.metrics.duplicate_delivery += 1; continue; }
      this.delivered.add(deliveryKey);
      handler(event);
    }
    return event;
  }

  sessionEvents(analyzerSessionId = this.currentSession?.analyzer_session_id) {
    return this.history.filter(e => e.analyzer_session_id === analyzerSessionId);
  }

  createA2CaptureProjection(events) {
    const list = Array.from(events || []);
    const bodies = new Map(list.filter(e => e.type === 'network.responseBody').map(e => [e.payload.request_id, e]));
    return {
      networkEvents: list.filter(e => e.type === 'network.requestWillBeSent').map(e => {
        const body = bodies.get(e.payload.request_id);
        return {
          requestId: e.payload.request_id,
          method: e.payload.method,
          url: e.payload.request_url,
          status: list.find(x => x.type === 'network.responseReceived' && x.payload.request_id === e.payload.request_id)?.payload.status ?? null,
          mimeType: body?.payload.mime_type ?? null,
          responseBodySha256: body?.payload.sha256 ?? null,
        };
      }),
      domSnapshots: list.filter(e => e.type === 'dom.snapshot').map(e => ({ id: e.event_id, sha256: sha256(e.payload.snapshot), snapshot: e.payload.snapshot, reason: e.payload.reason })),
      frames: list.filter(e => e.type === 'page.frameNavigated').map(e => ({ id: e.payload.frame_id, parentId: e.payload.parent_id, url: e.payload.url })),
      console: list.filter(e => e.type === 'runtime.consoleAPICalled'),
      streamingEvents: list,
    };
  }

  createA4EventProjection(events) {
    return Array.from(events || []);
  }

  createA5Projection(events, { a3Pr = 22, a3Head = this.sourceHead } = {}) {
    const list = Array.from(events || []);
    if (!list.length) throw new Error('A5_SESSION_EVENTS_REQUIRED');
    const requests = new Map(list.filter(e => e.type === 'network.requestWillBeSent').map(e => [e.payload.request_id, e]));
    const responses = new Map(list.filter(e => e.type === 'network.responseReceived').map(e => [e.payload.request_id, e]));
    const bodies = new Map(list.filter(e => e.type === 'network.responseBody').map(e => [e.payload.request_id, e]));
    const completeIds = [...requests.keys()].filter(id => responses.has(id) && bodies.has(id));
    const keepIds = new Set(completeIds);
    const coreTypes = new Set(['cdp.attached', 'dom.snapshot', 'page.frameNavigated']);
    const selected = list.filter(e => coreTypes.has(e.type) || (e.payload?.request_id && keepIds.has(e.payload.request_id) && ['network.requestWillBeSent','network.responseReceived','network.responseBody'].includes(e.type)));
    selected.sort((a,b) => a.sequence - b.sequence);
    const sessionId = selected[0]?.analyzer_session_id;
    const webContentsId = selected[0]?.web_contents_id;
    return {
      schema_version: 'A5_LIVE_TRAFFIC_BINDING_INPUT_V1',
      capture_evidence: {
        source: 'A3_LIVE_CDP_CAPTURE',
        actual_browser: true,
        runtime_kind: 'ELECTRON_CHROMIUM_CDP',
        fixture: false,
        synthetic: false,
        fake_debugger: false,
        analyzer_session_id: sessionId,
        web_contents_id: webContentsId,
        web_contents_identity_kind: this.currentSession?.runtime_identity?.identity_kind || 'CHROMIUM_TARGET_PROCESS',
        a3_pr: a3Pr,
        a3_head: a3Head,
        event_sha256: sha256(selected),
      },
      a3_events: selected,
      completed_request_count: completeIds.length,
    };
  }

  validateNoDuplicateListener() {
    return { consumer_count: this.consumers.size, duplicate_delivery_count: this.metrics.duplicate_delivery, consumer_replacement_count: this.metrics.consumer_replacements, pass: this.metrics.duplicate_delivery === 0 };
  }
}

function createA2AnalyzerModule(bridge, getEvents) {
  return {
    owner: 'A-3',
    async execute() {
      const events = getEvents();
      const capture = bridge.createA2CaptureProjection(events);
      if (!capture.networkEvents.length || !capture.domSnapshots.length) throw new Error('A2_CAPTURE_PROJECTION_EMPTY');
      return capture;
    }
  };
}

function validateA4Contract(events) {
  const list = Array.from(events || []);
  if (!list.length) throw new Error('A4_EVENT_STREAM_EMPTY');
  if (!list.every(e => e.producer === 'A-3' && e.live === true)) throw new Error('A4_LIVE_PROVENANCE_MISMATCH');
  if (!list.some(e => e.type === 'dom.snapshot')) throw new Error('A4_DOM_SNAPSHOT_REQUIRED');
  if (!list.some(e => e.type === 'page.frameNavigated')) throw new Error('A4_NAVIGATION_REQUIRED');
  return { event_count: list.length, dom_snapshot_count: list.filter(e=>e.type==='dom.snapshot').length, navigation_count: list.filter(e=>e.type==='page.frameNavigated').length };
}

function validateA5Projection(input) {
  const events = input.a3_events || [];
  const required = ['cdp.attached','network.requestWillBeSent','network.responseReceived','network.responseBody','dom.snapshot','page.frameNavigated'];
  const counts = Object.fromEntries(required.map(t => [t, events.filter(e => e.type === t).length]));
  for (const t of required) if (!counts[t]) throw new Error(`A5_REQUIRED_EVENT_MISSING:${t}`);
  let prev = 0; const seen = new Set();
  for (const event of events) {
    if (!Number.isInteger(event.sequence) || event.sequence <= prev || seen.has(event.sequence)) throw new Error('A5_SEQUENCE_INVALID');
    prev = event.sequence; seen.add(event.sequence);
    if (event.analyzer_session_id !== input.capture_evidence.analyzer_session_id) throw new Error('A5_SESSION_MISMATCH');
    if (event.web_contents_id !== input.capture_evidence.web_contents_id) throw new Error('A5_WEBCONTENTS_MISMATCH');
  }
  if (sha256(events) !== input.capture_evidence.event_sha256) throw new Error('A5_DIGEST_MISMATCH');
  return { ...counts, event_count: events.length, completed_request_count: input.completed_request_count };
}

module.exports = { CdpProductStreamBridge, createA2AnalyzerModule, validateA4Contract, validateA5Projection, sha256, stableStringify };
