'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fixture = require('../fixtures/mock_live_session.json');
const { AnalyzerCore } = require('../src/index.cjs');

class MockDebugger extends EventEmitter {
  constructor() { super(); this.attached = false; this.commands = []; }
  isAttached() { return this.attached; }
  attach() { this.attached = true; }
  async sendCommand(method, params) {
    this.commands.push({ method, params });
    if (method === 'Network.getResponseBody') return { body: JSON.stringify(fixture.body), base64Encoded: false };
    if (method === 'DOMSnapshot.captureSnapshot') return fixture.snapshot;
    return {};
  }
  async push(method, params) { await this.emitAsync('message', {}, method, params, null); }
  async emitAsync(name, ...args) { for (const listener of this.listeners(name)) await listener(...args); }
}

test('Wave1 live CDP to executable adapter E2E', async () => {
  const debuggerApi = new MockDebugger();
  const core = new AnalyzerCore({ sessionKey: 'wave1-e2e' });
  core.registerSite(fixture.site);
  const observer = await core.attachBrowser({ debugger: debuggerApi });
  observer.recordAction(fixture.action);
  await debuggerApi.push('Network.requestWillBeSent', fixture.request);
  await debuggerApi.push('Network.responseReceived', fixture.response);
  await debuggerApi.push('Page.frameNavigated', { frame: { id: 'main', url: fixture.site.url } });
  await debuggerApi.push('Page.lifecycleEvent', { frameId: 'main', name: 'load' });
  await debuggerApi.push('Runtime.consoleAPICalled', { type: 'log', args: [{ value: 'ready' }] });
  await debuggerApi.push('Network.loadingFinished', { requestId: 'r1', encodedDataLength: 500 });
  await observer.captureDomSnapshot('action-1');
  const run = await core.analyze({ siteId: fixture.site.siteId });

  const stream = observer.getEventStream();
  assert.ok(stream.filter(e => e.type === 'network.request').length > 0);
  assert.ok(stream.filter(e => e.type === 'network.response_body').length > 0);
  assert.ok(stream.filter(e => e.type === 'dom.snapshot').length > 0);
  assert.ok(stream.filter(e => e.type === 'page.frame_navigated').length > 0);
  assert.ok(run.structure.field_candidates.length >= 5);
  assert.equal(run.structure.pagination.decision, 'PAGINATION_DETECTED');
  assert.ok(['API','HYBRID'].includes(run.endpoint_inference.extraction_mode));
  assert.match(run.adapter_package.source, /async extract/);
  assert.equal(run.replay.success, true);
  assert.equal(run.replay.deterministic, true);
  assert.ok(run.replay.record_count >= 1 && run.replay.record_count <= 20);
  assert.equal(run.status, 'PASS');
});

test('embedded and standalone workspaces share state and registry', async () => {
  const a = new AnalyzerCore({ sessionKey: 'shared-session' });
  const b = new AnalyzerCore({ sessionKey: 'shared-session' });
  a.registerSite({ siteId: 'shared', url: 'https://example.test' });
  assert.equal(a.createEmbeddedWorkspace().state, b.createStandaloneWorkspace().state);
  assert.equal(b.getStateSnapshot().site_count, 1);
});

test('missing live data fails replay instead of false pass', async () => {
  const core = new AnalyzerCore({ sessionKey: 'empty-session' });
  core.registerSite({ siteId: 'empty', url: 'https://empty.test' });
  const run = await core.analyze({ siteId: 'empty', events: [], snapshot: { records: [] } });
  assert.equal(run.replay.success, false);
  assert.equal(run.status, 'FAILED');
});

test('Electron bridge creates real standalone binding and prevents duplicate IPC handlers', async () => {
  const { registerAnalyzerIpc, createStandaloneAnalyzerWindow, bindEmbeddedAnalyzer } = require('../src/index.cjs');
  const handlers = new Map();
  const ipcMain = { handle: (name, fn) => { if (handlers.has(name)) throw new Error('duplicate'); handlers.set(name, fn); }, removeHandler: name => handlers.delete(name) };
  class FakeWindow extends EventEmitter {
    constructor(options) { super(); this.options = options; this.loaded = null; this.visible = false; }
    loadFile(path) { this.loaded = path; }
    show() { this.visible = true; }
  }
  const core = new AnalyzerCore({ sessionKey: 'electron-shared' });
  const first = registerAnalyzerIpc({ ipcMain, core });
  const second = registerAnalyzerIpc({ ipcMain, core });
  assert.equal(first, second);
  assert.equal(handlers.size, 3);
  const win = createStandaloneAnalyzerWindow({ BrowserWindow: FakeWindow, core, html: 'analyzer.html' });
  win.emit('ready-to-show');
  assert.equal(win.loaded, 'analyzer.html');
  assert.equal(win.visible, true);
  assert.equal(win.options.webPreferences.partition, 'persist:yolla-site-analyzer-electron-shared');
  const embedded = new EventEmitter(); embedded.sent = []; embedded.send = (name, event) => embedded.sent.push({name,event});
  const binding = bindEmbeddedAnalyzer({ webContents: embedded, core });
  core.emit('analyzer-event', { type: 'probe' });
  assert.equal(embedded.sent.length, 1);
  binding.dispose(); first.dispose();
  assert.equal(handlers.size, 0);
});
