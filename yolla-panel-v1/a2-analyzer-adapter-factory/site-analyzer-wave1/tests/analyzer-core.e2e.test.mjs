import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AnalyzerCore } from '../src/analyzer-core.mjs';
import { createAnalyzerWindowFactory, installAnalyzerIpc } from '../src/electron-integration.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixture = `<main><article data-record data-id="1"><h3 data-field="title">Alpha</h3><span data-field="price">100</span><span data-field="address">Seoul</span><span data-field="category">Office</span><span data-field="updatedAt">2026-08-07</span></article><article data-record data-id="2"><h3 data-field="title">Beta</h3><span data-field="price">200</span><span data-field="address">Busan</span><span data-field="category">Retail</span><span data-field="updatedAt">2026-08-07</span></article></main>`;

test('AnalyzerCore completes embedded and standalone shared-state E2E', async () => {
  const core = new AnalyzerCore({ sharedStateId: 'shared-test', browserPartition: 'persist:test-analyzer' });
  const progress = [];
  core.on('progress', (event) => progress.push(event));
  assert.equal(core.getBindingMap().length, 10);
  assert.deepEqual(new Set(core.getBindingMap().map((m) => m.owner)), new Set(['A-3','A-4','A-5','A-6','A-7','B-2','B-3','B-4','B-5','B-6']));
  const site = core.registerSite({ id: 'fixture-catalog', url: 'fixture://catalog', title: 'Fixture Catalog' });
  assert.equal(site.id, 'fixture-catalog');
  const result = await core.runSiteAnalysis(site.id, {
    html: fixture,
    actions: [{ id: 'click-1', type: 'click', locator: 'article[data-record]:first-child' }]
  });
  assert.equal(result.metrics.liveNetworkEventCount, 1);
  assert.equal(result.metrics.domSnapshotCount, 1);
  assert.equal(result.metrics.recordedUserActionCount, 1);
  assert.ok(result.metrics.autoFieldCandidateCount >= 5);
  assert.equal(result.metrics.generatedExecutableAdapterCount, 1);
  assert.equal(result.metrics.replaySuccessCount, 1);
  assert.equal(result.metrics.realExtractedRecordCount, 2);
  assert.equal(result.metrics.dataPreviewVisible, true);
  assert.equal(result.metrics.embeddedAnalyzerWorking, true);
  assert.equal(result.metrics.standaloneAnalyzerWorking, true);
  assert.equal(result.endpoint.extractionMode, 'DOM');
  assert.equal(result.structure.repeatedRegions[0].count, 2);
  assert.equal(result.structure.pagination.mode, 'EXPLICIT_NONE');
  assert.equal(result.preview.records[0].title, 'Alpha');
  assert.equal(result.preview.records[1].address, 'Busan');
  assert.match(result.preview.csv, /Alpha/);
  assert.equal(result.adapter.recipe.fields.length, 5);
  assert.ok(result.adapter.sourceSha256.length === 64);
  assert.equal(result.package.manifest.sampleRecordCount, 2);
  assert.equal(result.package.manifest.sharedStateId, 'shared-test');
  assert.equal(result.package.manifest.browserPartition, 'persist:test-analyzer');
  assert.equal(result.timeline.length, 10);
  assert.equal(progress.at(-1).progress, 100);
  assert.ok(progress.every((event, i) => i === 0 || event.progress >= progress[i - 1].progress));
  const embedded = core.createWorkspaceDescriptor('embedded');
  const standalone = core.createWorkspaceDescriptor('standalone');
  assert.equal(embedded.sharedStateId, standalone.sharedStateId);
  assert.equal(embedded.browserPartition, standalone.browserPartition);
  assert.strictEqual(embedded.adapterRegistryRef, standalone.adapterRegistryRef);
  assert.strictEqual(embedded.runHistoryRef, standalone.runHistoryRef);
  const snapshot = core.getState();
  assert.equal(snapshot.adapterRegistry.length, 1);
  assert.equal(snapshot.runHistory.length, 1);
  const restored = new AnalyzerCore();
  restored.restore(snapshot);
  assert.equal(restored.sharedStateId, 'shared-test');
  assert.equal(restored.browserPartition, 'persist:test-analyzer');
  assert.equal(restored.getState().adapterRegistry.length, 1);
  assert.equal(restored.getState().runHistory.length, 1);

  const ipcHandlers = new Map();
  const windows = [];
  class FakeBrowserWindow {
    constructor(options) { this.options = options; this.loads = []; windows.push(this); }
    loadFile(file, options) { this.loads.push({ file, options }); return Promise.resolve(); }
  }
  const fakeElectron = {
    BrowserWindow: FakeBrowserWindow,
    session: { fromPartition: (partition) => ({ partition }) },
    ipcMain: { removeHandler: (channel) => ipcHandlers.delete(channel), handle: (channel, handler) => ipcHandlers.set(channel, handler) }
  };
  const ipc = installAnalyzerIpc(fakeElectron, core);
  assert.equal(ipc.channels.length, 5);
  assert.equal((await ipcHandlers.get('analyzer:get-state')()).sharedStateId, 'shared-test');
  const factory = createAnalyzerWindowFactory(fakeElectron, core);
  assert.equal(factory.partition, 'persist:test-analyzer');
  const view = factory.createEmbeddedViewDescriptor();
  assert.equal(view.mode, 'embedded');
  assert.equal(view.webPreferences.partition, 'persist:test-analyzer');
  const win = factory.createStandaloneWindow();
  assert.equal(windows.length, 1);
  assert.equal(win.options.webPreferences.partition, 'persist:test-analyzer');
  assert.equal(win.options.webPreferences.session.partition, 'persist:test-analyzer');
  assert.equal(win.loads.length, 1);
  assert.equal(win.loads[0].options.query.mode, 'standalone');
  const html = await fs.readFile(path.join(root, 'src/ui/index.html'), 'utf8');
  for (const section of ['live-browser','smart-inspector','timeline','data-preview','workflow','code','trace']) {
    assert.match(html, new RegExp(`data-section="${section}"`));
  }
});
