'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { AnalyzerEventStream, LiveCdpCaptureEngine } = require('./live_cdp_capture_engine.cjs');

class FakeDebugger extends EventEmitter {
  constructor() {
    super();
    this.attached = false;
    this.commands = [];
  }
  isAttached() { return this.attached; }
  attach(version) { this.attached = true; this.version = version; }
  detach() { this.attached = false; this.emit('detach', {}, 'target closed'); }
  async sendCommand(method, params = {}) {
    this.commands.push({ method, params });
    if (method === 'Network.getResponseBody') {
      return { body: JSON.stringify({ ok: true, records: [{ id: 1, name: 'sample' }] }), base64Encoded: false };
    }
    if (method === 'DOMSnapshot.captureSnapshot') {
      return {
        documents: [{ nodes: { nodeName: [0], parentIndex: [-1] }, layout: { nodeIndex: [0] } }],
        strings: ['HTML'],
      };
    }
    return {};
  }
}

async function main() {
  let tick = 1_000;
  const fakeDebugger = new FakeDebugger();
  const webContents = {
    id: 77,
    debugger: fakeDebugger,
    getURL: () => 'https://example.test/list?token=super-secret',
  };
  const stream = new AnalyzerEventStream();
  const events = [];
  stream.subscribe((event) => events.push(event));
  const stored = [];
  const engine = new LiveCdpCaptureEngine({
    webContents,
    stream,
    clock: () => ++tick,
    bodyStore: {
      async put(item) {
        stored.push(item);
        return `memory://response/${item.sha256}`;
      },
    },
    logger: { error() {} },
  });

  await engine.attach();
  const action = engine.recordAction({ action_type: 'CLICK', locator: '#next-page', user_step_id: 'step-1' });

  fakeDebugger.emit('message', {}, 'Network.requestWillBeSent', {
    requestId: 'r1',
    frameId: 'f1',
    loaderId: 'l1',
    documentURL: 'https://example.test/list?page=2',
    type: 'XHR',
    request: {
      url: 'https://example.test/api/items?page=2&api_key=secret-value',
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: 'Bearer abc' },
    },
  });
  fakeDebugger.emit('message', {}, 'Network.responseReceived', {
    requestId: 'r1',
    type: 'XHR',
    response: {
      url: 'https://example.test/api/items?page=2',
      status: 200,
      statusText: 'OK',
      mimeType: 'application/json',
      protocol: 'h2',
      headers: { 'content-type': 'application/json', 'set-cookie': 'session=secret' },
      encodedDataLength: 64,
    },
  });
  fakeDebugger.emit('message', {}, 'Page.frameNavigated', {
    frame: { id: 'f1', loaderId: 'l1', url: 'https://example.test/list?page=2', mimeType: 'text/html' },
  });
  fakeDebugger.emit('message', {}, 'Page.lifecycleEvent', {
    frameId: 'f1', loaderId: 'l1', name: 'load', timestamp: 12.4,
  });
  fakeDebugger.emit('message', {}, 'Runtime.consoleAPICalled', {
    type: 'log', executionContextId: 1, timestamp: 13.0, args: [{ type: 'string', value: 'loaded' }],
  });
  fakeDebugger.emit('message', {}, 'Network.loadingFinished', {
    requestId: 'r1', timestamp: 14.0, encodedDataLength: 64,
  });

  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  const count = (type) => events.filter((event) => event.type === type).length;
  assert.ok(count('network.requestWillBeSent') > 0);
  assert.ok(count('network.responseReceived') > 0);
  assert.ok(count('network.loadingFinished') > 0);
  assert.ok(count('network.responseBody') > 0);
  assert.ok(count('dom.snapshot') > 0);
  assert.ok(count('page.frameNavigated') > 0);
  assert.ok(count('page.lifecycleEvent') > 0);
  assert.ok(count('runtime.consoleAPICalled') > 0);
  assert.equal(stored.length, 1);

  const requestEvent = events.find((event) => event.type === 'network.requestWillBeSent');
  assert.match(requestEvent.payload.request_url, /api_key=%3CREDACTED%3E/);
  assert.equal(requestEvent.payload.request_headers.Authorization, '<REDACTED>');
  assert.equal(requestEvent.payload.correlation.action_id, action.action_id);

  const responseEvent = events.find((event) => event.type === 'network.responseReceived');
  assert.equal(responseEvent.payload.response_headers['set-cookie'], '<REDACTED>');

  const bodyEvent = events.find((event) => event.type === 'network.responseBody');
  assert.ok(bodyEvent.payload.size_bytes > 0);
  assert.match(bodyEvent.payload.sha256, /^[a-f0-9]{64}$/);
  assert.match(bodyEvent.payload.storage_pointer, /^memory:\/\/response\//);
  assert.equal(bodyEvent.payload.correlation.action_id, action.action_id);

  const methods = fakeDebugger.commands.map((entry) => entry.method);
  for (const required of [
    'Network.enable',
    'Page.enable',
    'Runtime.enable',
    'Page.setLifecycleEventsEnabled',
    'Network.getResponseBody',
    'DOMSnapshot.captureSnapshot',
  ]) assert.ok(methods.includes(required), `missing ${required}`);

  await engine.close();
  assert.equal(engine.attached, false);

  const receipt = {
    schema_version: 'A3_SITE_ANALYZER_WAVE1_CDP_TEST_RECEIPT_V1',
    status: 'PASS',
    event_count: events.length,
    live_protocol_path_implemented: true,
    deterministic_fake_debugger_execution: true,
    event_counts: Object.fromEntries([...new Set(events.map((event) => event.type))].map((type) => [type, count(type)])),
    response_body_count: count('network.responseBody'),
    dom_snapshot_count: count('dom.snapshot'),
    navigation_event_count: count('page.frameNavigated') + count('page.lifecycleEvent'),
    action_correlation_count: events.filter((event) => event.payload?.correlation?.action_id === action.action_id).length,
    response_body_storage_count: stored.length,
    raw_secret_finding_count: JSON.stringify(events).includes('secret-value') || JSON.stringify(events).includes('Bearer abc') ? 1 : 0,
  };
  assert.equal(receipt.raw_secret_finding_count, 0);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
