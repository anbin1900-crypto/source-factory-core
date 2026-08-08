'use strict';
const { EventEmitter } = require('node:events');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CdpObserverModuleV1, selectPageTarget } = require('./CDP_OBSERVER_MODULE_V1.cjs');

class MockTransport extends EventEmitter {
  constructor() { super(); this.calls = []; this.targets = [{ targetId: 'page-1', type: 'page', title: 'Fixture', url: 'http://fixture.local/list' }]; }
  async send(method, params = {}, sessionId = null) {
    this.calls.push({ method, params, sessionId });
    if (method === 'Target.getTargets') return { targetInfos: this.targets };
    if (method === 'Target.attachToTarget') return { sessionId: 'session-1' };
    if (method === 'DOMSnapshot.captureSnapshot') return { documents: [{ nodes: {} }], strings: ['fixture'] };
    if (method === 'Network.getResponseBody') return { body: JSON.stringify({ id: 1, name: 'record', token: 'super-secret-token', nested: { password: 'pw123456' } }), base64Encoded: false };
    return {};
  }
  push(method, params, sessionId = 'session-1') { this.emit('event', method, params, sessionId); }
}

async function runSmoke() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'a3-cdp-observer-'));
  const statePath = path.join(temp, 'state.json');
  const transport = new MockTransport();
  const observer = new CdpObserverModuleV1({ transport, statePath });
  const events = [];
  observer.on('evidence', (event) => events.push(event));
  await observer.start({ target: { url_contains: 'fixture.local' } });
  const action = observer.recordAction({ action_type: 'click', locator: '#load-more' });
  transport.push('Network.requestWillBeSent', { requestId: 'req-1', documentURL: 'http://fixture.local/list', type: 'Fetch', frameId: 'f1', loaderId: 'l1', request: { method: 'GET', url: 'http://fixture.local/api/items?token=abc123456789', headers: { Authorization: 'Bearer raw-secret', Accept: 'application/json' } } });
  transport.push('Network.responseReceived', { requestId: 'req-1', type: 'Fetch', frameId: 'f1', response: { status: 200, mimeType: 'application/json', url: 'http://fixture.local/api/items', headers: { 'set-cookie': 'sid=raw', 'content-type': 'application/json' } } });
  transport.push('Runtime.consoleAPICalled', { type: 'log', executionContextId: 1, args: [{ type: 'string', value: 'hello' }] });
  transport.push('Page.frameNavigated', { frame: { id: 'f1', url: 'http://fixture.local/detail/1', mimeType: 'text/html' } });
  transport.push('Network.loadingFinished', { requestId: 'req-1', encodedDataLength: 128 });
  await new Promise((resolve) => setTimeout(resolve, 25));
  await observer.captureDomSnapshot('mock-after-mutation');
  await observer.persistState();

  assert.equal(observer.state.page_id, 'page-1');
  assert.equal(action.action_id.length > 10, true);
  const req = events.find((e) => e.type === 'network.request');
  const res = events.find((e) => e.type === 'network.response');
  const body = events.find((e) => e.type === 'network.responseBody');
  assert(req && res && body);
  assert.equal(req.payload.headers.Authorization, '<REDACTED>');
  assert(req.payload.url.includes('%3CREDACTED%3E') || req.payload.url.includes('<REDACTED>'));
  assert.equal(res.payload.headers['set-cookie'], '<REDACTED>');
  assert(!body.payload.redacted_body.includes('super-secret-token'));
  assert(!body.payload.redacted_body.includes('pw123456'));
  assert.equal(body.payload.raw_body_retained, false);
  assert.equal(req.page_id, 'page-1');
  assert.equal(req.request_id, 'req-1');
  assert.equal(req.action_id, action.action_id);
  assert(fs.existsSync(statePath));
  const restored = new CdpObserverModuleV1({ transport: new MockTransport(), statePath });
  assert.equal(restored.loadStateFromFile(), true);
  assert.equal(restored.state.page_id, 'page-1');
  assert(selectPageTarget(transport.targets, { title_contains: 'Fixture' }).targetId === 'page-1');
  const bodyCall = transport.calls.find((call) => call.method === 'Network.getResponseBody');
  assert(bodyCall && bodyCall.params.requestId === 'req-1');
  const summary = {
    status: 'PASS',
    evidence_count: events.length,
    request_count: events.filter((e) => e.type === 'network.request').length,
    response_count: events.filter((e) => e.type === 'network.response').length,
    response_body_count: events.filter((e) => e.type === 'network.responseBody').length,
    dom_snapshot_count: events.filter((e) => e.type === 'dom.snapshot').length,
    frame_navigation_count: events.filter((e) => e.type === 'page.frameNavigated').length,
    console_count: events.filter((e) => e.type === 'runtime.console').length,
    state_restore_pass: true,
    redaction_pass: true,
    get_response_body_binding_pass: true,
    page_target_selection_pass: true,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

module.exports = { runSmoke };
if (require.main === module) runSmoke().catch((error) => { console.error(error); process.exitCode = 1; });
