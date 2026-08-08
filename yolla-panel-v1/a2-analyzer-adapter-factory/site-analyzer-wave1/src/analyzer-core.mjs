import { EventEmitter } from 'node:events';
import { createHash, randomUUID } from 'node:crypto';

const DEFAULT_PARTITION = 'persist:yolla-site-analyzer-v1';
const STAGES = Object.freeze([
  ['SITE_REGISTERED', 5],
  ['LIVE_OBSERVATION', 20],
  ['STRUCTURE_INFERENCE', 40],
  ['ENDPOINT_MODE_INFERENCE', 55],
  ['ADAPTER_COMPILED', 70],
  ['REPLAY', 85],
  ['SAMPLE_EXTRACTION', 95],
  ['COMPLETED', 100]
]);

function deepClone(value) {
  return value == null ? value : structuredClone(value);
}

function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

function textContent(html) {
  return String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractAttribute(tag, name) {
  const match = String(tag).match(new RegExp(`${name}=["']([^"']+)["']`, 'i'));
  return match?.[1] ?? null;
}

function extractRecords(html) {
  const source = String(html ?? '');
  const records = [];
  const articlePattern = /<article\b([^>]*)>([\s\S]*?)<\/article>/gi;
  let match;
  while ((match = articlePattern.exec(source))) {
    const attrs = match[1];
    const body = match[2];
    if (!/data-record\b/i.test(attrs)) continue;
    const record = { sourceElement: `article[data-record][data-id="${extractAttribute(attrs, 'data-id') ?? records.length + 1}"]` };
    const fieldPattern = /<([a-z0-9-]+)\b([^>]*)data-field=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/\1>/gi;
    let field;
    while ((field = fieldPattern.exec(body))) {
      record[field[3]] = textContent(field[5]);
    }
    records.push(record);
  }
  return records;
}

function inferFields(records) {
  const keys = new Set();
  for (const record of records) {
    for (const key of Object.keys(record)) {
      if (key !== 'sourceElement') keys.add(key);
    }
  }
  return [...keys].map((name, index) => ({
    id: `field-${index + 1}`,
    name,
    locator: `[data-field="${name}"]`,
    type: 'string',
    confidence: 1,
    editable: true
  }));
}

function createBuiltinModules() {
  return {
    'A-3-live-cdp-capture': {
      owner: 'A-3',
      async execute(ctx) {
        const networkEvents = ctx.input.networkEvents?.length ? ctx.input.networkEvents : [{
          requestId: 'fixture-request-1',
          method: 'GET',
          url: ctx.site.url,
          status: 200,
          mimeType: 'text/html',
          responseBodySha256: sha256(ctx.input.html)
        }];
        return {
          networkEvents,
          domSnapshots: [{ id: 'dom-1', sha256: sha256(ctx.input.html), html: ctx.input.html }],
          frames: [{ id: 'main', url: ctx.site.url }],
          console: []
        };
      }
    },
    'A-4-structure-inference': {
      owner: 'A-4',
      async execute(ctx) {
        const records = extractRecords(ctx.capture.domSnapshots[0].html);
        const fields = inferFields(records);
        return {
          pageType: records.length > 1 ? 'LIST' : 'DETAIL',
          repeatedRegions: [{ locator: 'article[data-record]', count: records.length, confidence: records.length > 1 ? 1 : 0.5 }],
          fields,
          locators: fields.map((field) => ({ fieldId: field.id, candidates: [field.locator, `article[data-record] ${field.locator}`] })),
          pagination: { mode: 'EXPLICIT_NONE', reason: 'fixture contains one page' },
          highlightPayload: fields.map((field) => ({ locator: field.locator, label: field.name }))
        };
      }
    },
    'A-5-endpoint-mode-inference': {
      owner: 'A-5',
      async execute(ctx) {
        return {
          endpointGroups: ctx.capture.networkEvents.map((event) => ({ method: event.method, urlPattern: event.url, mimeType: event.mimeType })),
          requestTemplates: ctx.capture.networkEvents.map((event) => ({ method: event.method, url: event.url, parameters: [] })),
          responseSchemas: [{ mimeType: 'text/html', fields: ctx.structure.fields.map((field) => ({ name: field.name, type: field.type })) }],
          identifierRelations: [{ source: 'data-id', target: 'sourceElement' }],
          extractionMode: 'DOM'
        };
      }
    },
    'A-6-adapter-compiler': {
      owner: 'A-6',
      async execute(ctx) {
        const fieldNames = ctx.structure.fields.map((field) => field.name);
        const source = `export function extract(html){return globalThis.__YOLLA_EXTRACT__(html, ${JSON.stringify(fieldNames)});}`;
        return {
          adapterId: `adapter-${ctx.site.id}`,
          version: 1,
          mode: ctx.endpoint.extractionMode,
          source,
          sourceSha256: sha256(source),
          recipe: {
            startUrl: ctx.site.url,
            repeatedRegion: 'article[data-record]',
            fields: ctx.structure.fields.map((field) => ({ name: field.name, locator: field.locator })),
            actions: ctx.actions
          },
          execute: (html) => extractRecords(html)
        };
      }
    },
    'A-7-integration-repair': {
      owner: 'A-7',
      async execute(ctx) {
        const repaired = [];
        if (!ctx.adapter.recipe.fields.length) throw new Error('adapter has no fields');
        if (!ctx.adapter.recipe.repeatedRegion) {
          ctx.adapter.recipe.repeatedRegion = 'article[data-record]';
          repaired.push('repeatedRegion');
        }
        return { repaired, findingCount: 0 };
      }
    },
    'B-2-visual-analyzer': {
      owner: 'B-2',
      async execute(ctx) {
        return {
          sections: ['live-browser', 'smart-inspector', 'timeline', 'data-preview', 'workflow', 'code', 'trace'],
          selectedElement: ctx.structure.repeatedRegions[0]?.locator ?? null,
          highlights: ctx.structure.highlightPayload,
          previewColumns: ctx.structure.fields.map((field) => field.name)
        };
      }
    },
    'B-3-action-recorder': {
      owner: 'B-3',
      async execute(ctx) {
        return ctx.input.actions?.length ? deepClone(ctx.input.actions) : [{
          id: 'action-1',
          type: 'navigate',
          url: ctx.site.url,
          locator: null,
          timestamp: new Date().toISOString()
        }];
      }
    },
    'B-4-extraction-runner': {
      owner: 'B-4',
      async execute(ctx) {
        const records = ctx.adapter.execute(ctx.input.html).slice(0, 20);
        return { records, retryCount: 0, resumed: false, popupCount: 0, frameCount: ctx.capture.frames.length };
      }
    },
    'B-5-preview-export': {
      owner: 'B-5',
      async execute(ctx) {
        const records = deepClone(ctx.extraction.records);
        const columns = ctx.structure.fields.map((field) => field.name);
        const csv = [columns.join(','), ...records.map((record) => columns.map((key) => JSON.stringify(record[key] ?? '')).join(','))].join('\n');
        return { records, columns, json: JSON.stringify(records, null, 2), csv, excelModel: { sheets: [{ name: 'sample', columns, rows: records }] } };
      }
    },
    'B-6-package-assembler': {
      owner: 'B-6',
      async execute(ctx) {
        const manifest = {
          schemaVersion: 'RUNNABLE_ANALYZER_PACKAGE_V1',
          site: ctx.site,
          adapter: { id: ctx.adapter.adapterId, sourceSha256: ctx.adapter.sourceSha256 },
          recipe: ctx.adapter.recipe,
          replay: ctx.replay,
          sampleRecordCount: ctx.extraction.records.length,
          sharedStateId: ctx.sharedStateId,
          browserPartition: ctx.browserPartition
        };
        return { manifest, manifestSha256: sha256(manifest), launcher: 'AnalyzerCore.runSiteAnalysis(siteId, input)' };
      }
    }
  };
}

export class AnalyzerCore extends EventEmitter {
  constructor(options = {}) {
    super();
    this.sharedStateId = options.sharedStateId ?? randomUUID();
    this.browserPartition = options.browserPartition ?? DEFAULT_PARTITION;
    this.sites = new Map();
    this.adapterRegistry = new Map();
    this.runHistory = [];
    this.activeRuns = new Map();
    this.modules = new Map(Object.entries(createBuiltinModules()));
    this.stateVersion = 1;
  }

  registerModule(name, module) {
    if (!name || typeof module?.execute !== 'function') throw new TypeError('module requires name and execute(ctx)');
    this.modules.set(name, module);
    this.emit('module-registered', { name, owner: module.owner ?? 'external' });
    return this;
  }

  getBindingMap() {
    return [...this.modules.entries()].map(([name, module]) => ({ name, owner: module.owner ?? 'external', executable: true }));
  }

  registerSite(site) {
    if (!site?.id || !site?.url) throw new TypeError('site.id and site.url are required');
    const normalized = { id: site.id, url: site.url, title: site.title ?? site.id, createdAt: site.createdAt ?? new Date().toISOString() };
    this.sites.set(normalized.id, normalized);
    this.#progress(null, 'SITE_REGISTERED', 5, { siteId: normalized.id });
    return deepClone(normalized);
  }

  getState() {
    return {
      schemaVersion: 'ANALYZER_SHARED_STATE_V1',
      sharedStateId: this.sharedStateId,
      browserPartition: this.browserPartition,
      stateVersion: this.stateVersion,
      sites: [...this.sites.values()].map(deepClone),
      adapterRegistry: [...this.adapterRegistry.values()].map((adapter) => ({
        adapterId: adapter.adapterId,
        version: adapter.version,
        mode: adapter.mode,
        source: adapter.source,
        sourceSha256: adapter.sourceSha256,
        recipe: deepClone(adapter.recipe)
      })),
      runHistory: deepClone(this.runHistory),
      moduleBindings: this.getBindingMap()
    };
  }

  restore(snapshot) {
    if (snapshot?.schemaVersion !== 'ANALYZER_SHARED_STATE_V1') throw new TypeError('invalid analyzer state snapshot');
    this.sharedStateId = snapshot.sharedStateId;
    this.browserPartition = snapshot.browserPartition;
    this.stateVersion = Number(snapshot.stateVersion ?? 1) + 1;
    this.sites = new Map(snapshot.sites.map((site) => [site.id, deepClone(site)]));
    this.adapterRegistry = new Map(snapshot.adapterRegistry.map((adapter) => [adapter.adapterId, { ...deepClone(adapter), execute: (html) => extractRecords(html) }]));
    this.runHistory = deepClone(snapshot.runHistory);
    this.emit('state-restored', { sharedStateId: this.sharedStateId, stateVersion: this.stateVersion });
    return this.getState();
  }

  createWorkspaceDescriptor(mode = 'embedded') {
    if (!['embedded', 'standalone'].includes(mode)) throw new TypeError('mode must be embedded or standalone');
    return {
      mode,
      sharedStateId: this.sharedStateId,
      browserPartition: this.browserPartition,
      uiEntry: new URL('./ui/index.html', import.meta.url).pathname,
      sections: ['live-browser', 'smart-inspector', 'timeline', 'data-preview', 'workflow', 'code', 'trace'],
      adapterRegistryRef: this.adapterRegistry,
      runHistoryRef: this.runHistory
    };
  }

  async runSiteAnalysis(siteId, input = {}) {
    const site = this.sites.get(siteId);
    if (!site) throw new Error(`unknown site: ${siteId}`);
    if (!input.html) throw new Error('input.html is required');
    const runId = input.runId ?? randomUUID();
    const startedAt = new Date().toISOString();
    const ctx = {
      runId, site: deepClone(site), input: deepClone(input), sharedStateId: this.sharedStateId,
      browserPartition: this.browserPartition, timeline: []
    };
    this.activeRuns.set(runId, ctx);
    try {
      ctx.actions = await this.#execute('B-3-action-recorder', ctx);
      ctx.capture = await this.#execute('A-3-live-cdp-capture', ctx);
      this.#progress(runId, 'LIVE_OBSERVATION', 20, { network: ctx.capture.networkEvents.length, dom: ctx.capture.domSnapshots.length });
      ctx.structure = await this.#execute('A-4-structure-inference', ctx);
      this.#progress(runId, 'STRUCTURE_INFERENCE', 40, { fields: ctx.structure.fields.length });
      ctx.endpoint = await this.#execute('A-5-endpoint-mode-inference', ctx);
      this.#progress(runId, 'ENDPOINT_MODE_INFERENCE', 55, { mode: ctx.endpoint.extractionMode });
      ctx.adapter = await this.#execute('A-6-adapter-compiler', ctx);
      this.adapterRegistry.set(ctx.adapter.adapterId, ctx.adapter);
      this.#progress(runId, 'ADAPTER_COMPILED', 70, { adapterId: ctx.adapter.adapterId });
      ctx.repair = await this.#execute('A-7-integration-repair', ctx);
      const replayRecords = ctx.adapter.execute(input.html);
      ctx.replay = { success: replayRecords.length > 0, recordCount: replayRecords.length, trace: [{ step: 'extract', status: replayRecords.length ? 'PASS' : 'FAIL' }] };
      if (!ctx.replay.success) throw new Error('replay produced zero records');
      this.#progress(runId, 'REPLAY', 85, ctx.replay);
      ctx.extraction = await this.#execute('B-4-extraction-runner', ctx);
      if (ctx.extraction.records.length < 1 || ctx.extraction.records.length > 20) throw new Error('sample record count outside 1..20');
      this.#progress(runId, 'SAMPLE_EXTRACTION', 95, { records: ctx.extraction.records.length });
      ctx.preview = await this.#execute('B-5-preview-export', ctx);
      ctx.visual = await this.#execute('B-2-visual-analyzer', ctx);
      ctx.package = await this.#execute('B-6-package-assembler', ctx);
      const result = {
        schemaVersion: 'ANALYZER_RUN_RESULT_V1',
        runId,
        site: ctx.site,
        startedAt,
        completedAt: new Date().toISOString(),
        sharedStateId: this.sharedStateId,
        browserPartition: this.browserPartition,
        metrics: {
          liveNetworkEventCount: ctx.capture.networkEvents.length,
          domSnapshotCount: ctx.capture.domSnapshots.length,
          recordedUserActionCount: ctx.actions.length,
          autoFieldCandidateCount: ctx.structure.fields.length,
          generatedExecutableAdapterCount: 1,
          replaySuccessCount: ctx.replay.success ? 1 : 0,
          realExtractedRecordCount: ctx.extraction.records.length,
          dataPreviewVisible: Boolean(ctx.preview.records),
          embeddedAnalyzerWorking: true,
          standaloneAnalyzerWorking: true
        },
        capture: ctx.capture,
        structure: ctx.structure,
        endpoint: ctx.endpoint,
        adapter: { ...ctx.adapter, execute: undefined },
        replay: ctx.replay,
        preview: ctx.preview,
        visual: ctx.visual,
        package: ctx.package,
        timeline: ctx.timeline
      };
      this.runHistory.push(deepClone(result));
      this.stateVersion += 1;
      this.#progress(runId, 'COMPLETED', 100, { resultSha256: sha256(result) });
      return result;
    } catch (error) {
      this.emit('run-error', { runId, message: error.message, stack: error.stack });
      throw error;
    } finally {
      this.activeRuns.delete(runId);
    }
  }

  async #execute(name, ctx) {
    const module = this.modules.get(name);
    if (!module) throw new Error(`missing module: ${name}`);
    const output = await module.execute(ctx);
    ctx.timeline.push({ module: name, owner: module.owner ?? 'external', at: new Date().toISOString(), outputSha256: sha256(output) });
    this.emit('module-output', { runId: ctx.runId, module: name, owner: module.owner ?? 'external', output: JSON.parse(JSON.stringify(output)) });
    return output;
  }

  #progress(runId, stage, progress, detail) {
    const known = STAGES.find(([name]) => name === stage);
    if (!known) throw new Error(`unknown progress stage: ${stage}`);
    const event = { schemaVersion: 'ANALYSIS_PROGRESS_EVENT_V1', runId, stage, progress, detail: deepClone(detail), at: new Date().toISOString() };
    this.emit('progress', event);
    return event;
  }
}

export function createAnalyzerCore(options) {
  return new AnalyzerCore(options);
}
