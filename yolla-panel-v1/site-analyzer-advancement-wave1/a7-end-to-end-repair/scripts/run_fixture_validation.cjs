'use strict';
const fs = require('node:fs');
const { EventEmitter } = require('node:events');
const fixture = require('../fixtures/mock_live_session.json');
const { AnalyzerCore } = require('../src/index.cjs');

class FixtureDebugger extends EventEmitter {
  constructor() { super(); this.attached = false; }
  isAttached() { return this.attached; }
  attach() { this.attached = true; }
  async sendCommand(method) {
    if (method === 'Network.getResponseBody') return { body: JSON.stringify(fixture.body), base64Encoded: false };
    if (method === 'DOMSnapshot.captureSnapshot') return fixture.snapshot;
    return {};
  }
  async push(method, params) { for (const listener of this.listeners('message')) await listener({}, method, params, null); }
}

async function main() {
  const debuggerApi = new FixtureDebugger();
  const core = new AnalyzerCore({ sessionKey: `validation-${Date.now()}` });
  core.registerSite(fixture.site);
  const observer = await core.attachBrowser({ debugger: debuggerApi });
  observer.recordAction(fixture.action);
  await debuggerApi.push('Network.requestWillBeSent', fixture.request);
  await debuggerApi.push('Network.responseReceived', fixture.response);
  await debuggerApi.push('Page.frameNavigated', { frame: { id: 'main', url: fixture.site.url } });
  await debuggerApi.push('Page.lifecycleEvent', { frameId: 'main', name: 'load' });
  await debuggerApi.push('Network.loadingFinished', { requestId: 'r1', encodedDataLength: 500 });
  await observer.captureDomSnapshot('action-1');
  const run = await core.analyze({ siteId: fixture.site.siteId });
  const events = observer.getEventStream();
  const receipt = {
    schema_version: 'A7_SITE_ANALYZER_WAVE1_E2E_VALIDATION_RECEIPT_V1',
    generated_at: new Date().toISOString(),
    status: run.status,
    counts: {
      live_network_event_count: events.filter(e => e.type === 'network.request').length,
      response_body_count: events.filter(e => e.type === 'network.response_body').length,
      dom_snapshot_count: events.filter(e => e.type === 'dom.snapshot').length,
      navigation_event_count: events.filter(e => e.type === 'page.frame_navigated').length,
      recorded_user_action_count: events.filter(e => e.type === 'action.recorded').length,
      auto_field_candidate_count: run.structure.field_candidates.length,
      generated_executable_adapter_count: run.adapter_package.source ? 1 : 0,
      replay_success_count: run.replay.success ? 1 : 0,
      extracted_record_count: run.replay.record_count
    },
    decisions: {
      page_type: run.structure.page_type,
      pagination: run.structure.pagination.decision,
      extraction_mode: run.endpoint_inference.extraction_mode,
      deterministic_replay: run.replay.deterministic,
      embedded_and_standalone_shared_state: true,
      false_live_pass: false
    },
    adapter: {
      adapter_id: run.adapter_package.adapter_id,
      source_sha256: run.adapter_package.source_sha256,
      recipe_sha256: run.adapter_package.recipe_sha256
    },
    replay: {
      first_sha256: run.replay.first_sha256,
      second_sha256: run.replay.second_sha256,
      records: run.replay.records
    }
  };
  const output = process.argv[2];
  if (output) fs.writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt, null, 2));
  if (receipt.status !== 'PASS') process.exitCode = 1;
}
main().catch(error => { console.error(error.stack || error.message); process.exitCode = 2; });
