'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const {
  runObservationRequest,
  filterPageTargets,
} = require('./SUCCESSOR_CDP_OBSERVATION_RUNNER_V1.cjs');

class MockTransport {
  constructor() {
    this.targets = [
      { targetId: 'ui-1', type: 'page', title: 'DevTools', url: 'devtools://devtools/bundled/inspector.html' },
      { targetId: 'bg-1', type: 'background_page', title: 'Extension', url: 'chrome-extension://abc/background.html' },
      { targetId: 'sw-1', type: 'service_worker', title: 'Worker', url: 'https://fixture.local/sw.js' },
      { targetId: 'page-1', type: 'page', title: 'Fixture App', url: 'https://fixture.local/list?token=<REDACTED>' },
    ];
  }
  async send(method) {
    if (method === 'Target.getTargets') return { targetInfos: this.targets };
    return {};
  }
  async close() {}
}

class MockObserver extends EventEmitter {
  constructor({ transport, statePath }) {
    super();
    this.transport = transport;
    this.statePath = statePath;
    this.started = false;
  }
  async start({ target }) {
    assert.equal(target.target_id, 'page-1');
    this.started = true;
    this.emit('evidence', { schema_version:'CDP_OBSERVER_EVIDENCE_V1', type:'dom.snapshot', page_id:'page-1', request_id:null, action_id:null, timestamp:'2026-08-07T13:00:00.000Z', payload:{snapshot:{documents:[{}],strings:['fixture','authorization=raw-dom-secret']}} });
    this.emit('evidence', { schema_version:'CDP_OBSERVER_EVIDENCE_V1', type:'network.request', page_id:'page-1', request_id:'r1', action_id:null, timestamp:'2026-08-07T13:00:00.001Z', payload:{method:'GET',url:'https://fixture.local/api?q=1',headers:{Authorization:'<REDACTED>'}} });
    this.emit('evidence', { schema_version:'CDP_OBSERVER_EVIDENCE_V1', type:'network.response', page_id:'page-1', request_id:'r1', action_id:null, timestamp:'2026-08-07T13:00:00.002Z', payload:{status:200,mime_type:'application/json',headers:{'set-cookie':'<REDACTED>'}} });
    this.emit('evidence', { schema_version:'CDP_OBSERVER_EVIDENCE_V1', type:'network.responseBody', page_id:'page-1', request_id:'r1', action_id:null, timestamp:'2026-08-07T13:00:00.003Z', payload:{status:200,mime_type:'application/json',raw_sha256:'0'.repeat(64),raw_size_bytes:20,truncated:false,redacted_body:'{"token":"<REDACTED>"}',redacted_body_sha256:'1'.repeat(64),raw_body_retained:false} });
    this.emit('evidence', { schema_version:'CDP_OBSERVER_EVIDENCE_V1', type:'page.frameNavigated', page_id:'page-1', request_id:null, action_id:null, timestamp:'2026-08-07T13:00:00.004Z', payload:{frame_id:'f1',url:'https://fixture.local/detail/1'} });
    return {};
  }
  async stop() { this.started = false; return {}; }
}

async function runSmoke() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a3-cdp-cycle2-'));
  const request = {
    schema_version: 'CDP_OBSERVATION_RUN_REQUEST_V1',
    cdp_endpoint: process.env.A3_MOCK_CDP_ENDPOINT || 'MOCK_RUNTIME_ARGUMENT',
    page_selector: { title_contains: 'Fixture App' },
    observation_window_ms: 0,
    capture_flags: {
      dom_snapshot: true,
      network_metadata: true,
      response_body: true,
      frame_navigation: true,
      console: false
    }
  };
  let tick = Date.parse('2026-08-07T13:00:00.000Z');
  const options = {
    skip_default_dependencies: true,
    output_root: root,
    transportFactory: async () => new MockTransport(),
    observerFactory: (args) => new MockObserver(args),
    redactUrl: (url) => url.replace(/([?&]token=)[^&#]*/ig, '$1<REDACTED>'),
    clock: () => tick++,
    sleep: async () => {},
  };
  assert.deepEqual(filterPageTargets(new MockTransport().targets).map((t) => t.targetId), ['page-1']);
  const first = await runObservationRequest(request, options);
  const second = await runObservationRequest(request, options);
  assert.equal(first.status, 'PASS');
  assert.equal(first.page_identity.page_id, 'page-1');
  assert.equal(first.retry_count, 0);
  assert.equal(first.retry_policy, 'NO_INTERNAL_RETRY');
  assert.equal(second.idempotent_replay, true);
  assert.equal(second.run_id, first.run_id);
  assert.equal(second.request_sha256, first.request_sha256);
  const receiptText = fs.readFileSync(path.join(root, first.run_id, 'receipt.json'), 'utf8');
  assert(!receiptText.includes(request.cdp_endpoint));
  const bodyPath = path.join(root, first.run_id, first.artifacts.redacted_response_body_pointer.path);
  const bodyText = fs.readFileSync(bodyPath, 'utf8');
  assert(bodyText.includes('<REDACTED>'));
  assert(!bodyText.includes('super-secret'));
  const allArtifacts = fs.readdirSync(path.join(root, first.run_id))
    .filter((name) => name.endsWith('.json') || name.endsWith('.ndjson'))
    .map((name) => fs.readFileSync(path.join(root, first.run_id, name), 'utf8'))
    .join('\n');
  assert(!allArtifacts.includes('raw-dom-secret'));
  const result = {
    status:'PASS',
    smoke_run_count:1,
    eligible_target_filter_pass:true,
    browser_ui_background_exclusion_pass:true,
    request_contract_pass:true,
    receipt_contract_pass:true,
    output_pointer_pass:true,
    raw_endpoint_in_receipt_count:0,
    raw_secret_value_count:0,
    internal_retry_count:0,
    idempotent_replay_check:true,
    terminal:'A3_CDP_OBSERVATION_RUNNER_AND_RECEIPT_READY'
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (require.main === module) runSmoke().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
module.exports = { runSmoke };
