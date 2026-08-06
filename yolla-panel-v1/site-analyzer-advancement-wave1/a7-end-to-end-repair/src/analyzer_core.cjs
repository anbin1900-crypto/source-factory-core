'use strict';
const { EventEmitter } = require('node:events');
const { LiveCdpObserver } = require('./live_cdp_observer.cjs');
const { inferStructure } = require('./structure_inference.cjs');
const { inferEndpoints } = require('./schema_inference.cjs');
const { compileAdapter, replayPackage } = require('./adapter_compiler.cjs');

const sharedStores = new Map();
function storeFor(sessionKey) {
  if (!sharedStores.has(sessionKey)) sharedStores.set(sessionKey, { sites: new Map(), events: [], adapters: new Map(), runs: [], previews: [] });
  return sharedStores.get(sessionKey);
}

class AnalyzerCore extends EventEmitter {
  constructor({ sessionKey = 'default', maxRecords = 20 } = {}) {
    super(); this.sessionKey = sessionKey; this.maxRecords = maxRecords; this.state = storeFor(sessionKey); this.observer = null;
  }
  registerSite({ siteId, url, name = siteId }) {
    if (!siteId || !url) throw new Error('SITE_ID_AND_URL_REQUIRED');
    const site = { site_id: siteId, url, name, registered_at: new Date().toISOString() };
    this.state.sites.set(siteId, site); return site;
  }
  createEmbeddedWorkspace() { return { mode: 'EMBEDDED', session_key: this.sessionKey, state: this.state }; }
  createStandaloneWorkspace() { return { mode: 'STANDALONE', session_key: this.sessionKey, browser_window: { width: 1440, height: 960, webPreferences: { contextIsolation: true, sandbox: true } }, state: this.state }; }
  async attachBrowser(webContents) {
    this.observer = new LiveCdpObserver({ webContents });
    this.observer.subscribe(event => { this.state.events.push(event); this.emit('analyzer-event', event); });
    await this.observer.start(); return this.observer;
  }
  async analyze({ siteId, snapshot = null, events = null } = {}) {
    const site = this.state.sites.get(siteId); if (!site) throw new Error(`UNKNOWN_SITE:${siteId}`);
    const stream = events || this.observer?.getEventStream() || [];
    const domEvent = [...stream].reverse().find(e => e.type === 'dom.snapshot');
    const structure = inferStructure({ snapshot: snapshot || domEvent?.payload?.snapshot, url: site.url, networkEvents: stream });
    const endpointInference = inferEndpoints(stream, structure);
    const adapterPackage = compileAdapter({ structure, endpointInference, adapterId: `${siteId}-adapter-v1` });
    const apiBodies = stream.filter(e => e.type === 'network.response_body').map(e => e.payload.body);
    const replay = await replayPackage(adapterPackage, { apiBodies, domRecords: structure.records });
    const run = { run_id: `run-${this.state.runs.length + 1}`, site_id: siteId, structure, endpoint_inference: endpointInference, adapter_package: adapterPackage, replay, status: replay.success ? 'PASS' : 'FAILED', completed_at: new Date().toISOString() };
    this.state.adapters.set(adapterPackage.adapter_id, adapterPackage); this.state.runs.push(run);
    this.state.previews.push({ run_id: run.run_id, columns: structure.field_candidates.map(f => f.name), rows: replay.records.slice(0, this.maxRecords) });
    return run;
  }
  getStateSnapshot() { return { site_count: this.state.sites.size, event_count: this.state.events.length, adapter_count: this.state.adapters.size, run_count: this.state.runs.length, preview_count: this.state.previews.length }; }
}

module.exports = { AnalyzerCore, storeFor };
