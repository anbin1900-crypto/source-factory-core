'use strict';

const { EventEmitter } = require('node:events');
const { createHash, randomUUID } = require('node:crypto');

const STATE = Object.freeze({
  IDLE: 'IDLE',
  DISPATCHED: 'DISPATCHED',
  GENERATING: 'GENERATING',
  COMPLETE: 'COMPLETE',
  BLOCKED: 'BLOCKED',
  UNKNOWN: 'UNKNOWN',
});

const COMPLETION = Object.freeze({
  NONE: 'NONE',
  LIKELY_COMPLETE: 'LIKELY_COMPLETE',
  EXPLICIT_COMPLETE: 'EXPLICIT_COMPLETE',
  EXPLICIT_BLOCKED: 'EXPLICIT_BLOCKED',
});

const DEFAULT_SELECTORS = Object.freeze({
  assistant: {
    primary: ['[data-message-author-role="assistant"]'],
    fallback: ['article[data-testid^="conversation-turn-"]', 'main article'],
  },
  generating: {
    primary: ['button[data-testid="stop-button"]', '[data-testid="stop-button"]'],
    fallback: ['button[aria-label*="Stop"]', 'button[title*="Stop"]', 'button[aria-label*="중지"]'],
  },
});

function sha256(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

function redactText(text) {
  return String(text ?? '')
    .replace(/(bearer\s+)[a-z0-9._~+/=-]{8,}/ig, '$1<REDACTED>')
    .replace(/(basic\s+)[a-z0-9+/=]{8,}/ig, '$1<REDACTED>')
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|passwd|authorization|cookie)\s*[:=]\s*)[^\s,;}&"']{3,}/ig, '$1<REDACTED>');
}

function parseMarkers(text) {
  const source = redactText(text);
  const markers = { WORK_STATUS: null, COMMAND_ID: null, TERMINAL: null, BLOCKER: null };
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*(WORK_STATUS|COMMAND_ID|TERMINAL|BLOCKER)\s*(?:=|:)\s*(.*?)\s*$/i);
    if (!match) continue;
    const key = match[1].toUpperCase();
    if (markers[key] == null && match[2]) markers[key] = match[2].slice(0, 512);
  }
  return markers;
}

function normalizeStatus(value) {
  return String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function explicitStateFromMarkers(markers) {
  const status = normalizeStatus(markers.WORK_STATUS);
  const blocker = String(markers.BLOCKER || '').trim();
  const terminal = String(markers.TERMINAL || '').trim();
  if (blocker || ['BLOCKED', 'ERROR', 'FAILED', 'FAIL'].includes(status)) {
    return { state: STATE.BLOCKED, completion_assessment: COMPLETION.EXPLICIT_BLOCKED, reason: blocker ? 'EXPLICIT_BLOCKER_MARKER' : 'EXPLICIT_WORK_STATUS_BLOCKED' };
  }
  if (['COMPLETE', 'COMPLETED', 'DONE'].includes(status) || terminal) {
    return { state: STATE.COMPLETE, completion_assessment: COMPLETION.EXPLICIT_COMPLETE, reason: terminal ? 'EXPLICIT_TERMINAL_MARKER' : 'EXPLICIT_WORK_STATUS_COMPLETE' };
  }
  if (['GENERATING', 'RUNNING', 'WORKING', 'IN_PROGRESS'].includes(status)) {
    return { state: STATE.GENERATING, completion_assessment: COMPLETION.NONE, reason: 'EXPLICIT_WORK_STATUS_GENERATING' };
  }
  if (['DISPATCHED', 'QUEUED', 'STARTED'].includes(status) || markers.COMMAND_ID) {
    return { state: STATE.DISPATCHED, completion_assessment: COMPLETION.NONE, reason: markers.COMMAND_ID ? 'EXPLICIT_COMMAND_ID_MARKER' : 'EXPLICIT_WORK_STATUS_DISPATCHED' };
  }
  return null;
}

function validateRegistry(registry) {
  if (!registry || registry.schema_version !== 'WORKER_PAGE_REGISTRY_V1' || !Array.isArray(registry.entries)) throw new Error('INVALID_WORKER_PAGE_REGISTRY');
  const workers = new Set();
  const pages = new Set();
  for (const entry of registry.entries) {
    if (!entry || typeof entry.worker_id !== 'string' || typeof entry.page_id !== 'string') throw new Error('INVALID_WORKER_PAGE_REGISTRY_ENTRY');
    if (workers.has(entry.worker_id)) throw new Error(`DUPLICATE_WORKER_ID:${entry.worker_id}`);
    if (pages.has(entry.page_id)) throw new Error(`DUPLICATE_PAGE_ID:${entry.page_id}`);
    workers.add(entry.worker_id); pages.add(entry.page_id);
  }
  return true;
}

function registryMaps(registry) {
  validateRegistry(registry);
  return {
    workerToPage: new Map(registry.entries.map((e) => [e.worker_id, e.page_id])),
    pageToWorker: new Map(registry.entries.map((e) => [e.page_id, e.worker_id])),
  };
}

function buildInjectedObserverScript(selectors = DEFAULT_SELECTORS, stableMs = 2000) {
  const safeSelectors = JSON.stringify(selectors);
  const stable = Math.max(250, Math.floor(Number(stableMs) || 2000));
  return `(() => {
    const KEY='__YOLLA_WORKER_COMPLETION_OBSERVER_V1__';
    if (window[KEY]?.version === 1) return {installed:true,reused:true};
    const selectors=${safeSelectors};
    const pick=(groups)=>{
      for (const strategy of ['primary','fallback']) {
        for (const selector of (groups[strategy]||[])) {
          try { const nodes=[...document.querySelectorAll(selector)]; if(nodes.length) return {strategy,selector,nodes}; } catch {}
        }
      }
      return {strategy:'none',selector:null,nodes:[]};
    };
    const state={version:1,mutation_count:0,last_mutation_ms:Date.now(),installed_at_ms:Date.now(),stable_ms:${stable},selectors};
    const read=()=>{
      const assistants=pick(selectors.assistant);
      const generating=pick(selectors.generating);
      const messages=assistants.nodes.map(n=>(n.innerText||n.textContent||'').trim()).filter(Boolean);
      return {
        selector_found:assistants.nodes.length>0 || generating.nodes.length>0,
        assistant_selector_strategy:assistants.strategy,
        assistant_selector:assistants.selector,
        generating_selector_strategy:generating.strategy,
        generating_selector:generating.selector,
        assistant_messages:messages,
        assistant_message_count:messages.length,
        generating_ui_active:generating.nodes.length>0,
        mutation_count:state.mutation_count,
        last_mutation_ms:state.last_mutation_ms,
        now_ms:Date.now(),
        dom_stable_ms:Math.max(0,Date.now()-state.last_mutation_ms),
      };
    };
    const mo=new MutationObserver(()=>{state.mutation_count+=1;state.last_mutation_ms=Date.now();});
    mo.observe(document.documentElement||document,{subtree:true,childList:true,characterData:true,attributes:true});
    state.read=read; state.disconnect=()=>mo.disconnect(); window[KEY]=state;
    return {installed:true,reused:false};
  })()`;
}

function buildInjectedReadScript() {
  return `(() => { const x=window.__YOLLA_WORKER_COMPLETION_OBSERVER_V1__; return x?.read ? x.read() : null; })()`;
}

function makeCdpRuntimeAdapter(transport, sessionId) {
  if (!transport || typeof transport.send !== 'function') throw new TypeError('CDP transport required');
  return {
    kind: 'CDP_RUNTIME_EVALUATE',
    async evaluate(expression) {
      const result = await transport.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId || null);
      if (result?.exceptionDetails) throw new Error('RUNTIME_EVALUATE_EXCEPTION');
      return result?.result?.value;
    },
  };
}

function makePlaywrightPageAdapter(page) {
  if (!page || typeof page.evaluate !== 'function') throw new TypeError('Playwright page required');
  return { kind: 'PLAYWRIGHT_PAGE_EVALUATE', evaluate: (expression) => page.evaluate((source) => (0, eval)(source), expression) };
}

class WorkerCompletionObserverV1 extends EventEmitter {
  constructor({ registry, stableMs = 2000, clock = Date.now, selectors = DEFAULT_SELECTORS } = {}) {
    super();
    this.maps = registryMaps(registry);
    this.registry = registry;
    this.stableMs = Math.max(250, Number(stableMs) || 2000);
    this.clock = clock;
    this.selectors = selectors;
    this.workerState = new Map();
    this.sequence = 0;
  }

  pageIdFor(workerId) { return this.maps.workerToPage.get(workerId) || null; }

  noteDispatch(workerId, commandId = null, atMs = this.clock()) {
    const pageId = this.pageIdFor(workerId);
    if (!pageId) throw new Error(`WORKER_NOT_REGISTERED:${workerId}`);
    const prev = this.workerState.get(workerId) || {};
    this.workerState.set(workerId, { ...prev, dispatched: true, command_id: commandId || prev.command_id || null, dispatched_at_ms: atMs });
    return this.#emit(workerId, pageId, STATE.DISPATCHED, COMPLETION.NONE, ['DISPATCH_NOTED'], {}, null);
  }

  observeSnapshot(workerId, snapshot) {
    const pageId = this.pageIdFor(workerId);
    if (!pageId) throw new Error(`WORKER_NOT_REGISTERED:${workerId}`);
    const prev = this.workerState.get(workerId) || { dispatched: false, command_id: null, state: STATE.IDLE };
    if (!snapshot || snapshot.selector_found === false) {
      return this.#emit(workerId, pageId, STATE.UNKNOWN, COMPLETION.NONE, ['SELECTOR_MISS_FAIL_SAFE'], snapshot || {}, null);
    }

    const messages = Array.isArray(snapshot.assistant_messages) ? snapshot.assistant_messages : [];
    const last = messages.length ? messages[messages.length - 1] : '';
    const markers = parseMarkers(last);
    const explicit = explicitStateFromMarkers(markers);
    const messageDigest = sha256(last);
    const messageChanged = prev.assistant_digest && prev.assistant_digest !== messageDigest;
    const generating = Boolean(snapshot.generating_ui_active);
    const domStableMs = Number.isFinite(snapshot.dom_stable_ms) ? snapshot.dom_stable_ms : Math.max(0, Number(snapshot.now_ms || this.clock()) - Number(snapshot.last_mutation_ms || this.clock()));

    if (explicit) {
      return this.#emit(workerId, pageId, explicit.state, explicit.completion_assessment, [explicit.reason], snapshot, markers, messageDigest);
    }
    if (generating || (prev.dispatched && messageChanged && domStableMs < this.stableMs)) {
      return this.#emit(workerId, pageId, STATE.GENERATING, COMPLETION.NONE, [generating ? 'GENERATING_UI_ACTIVE' : 'ASSISTANT_DOM_MUTATING_AFTER_DISPATCH'], snapshot, markers, messageDigest);
    }
    if (prev.dispatched && messages.length > 0 && !generating && domStableMs >= this.stableMs) {
      return this.#emit(workerId, pageId, STATE.UNKNOWN, COMPLETION.LIKELY_COMPLETE, ['DOM_STABLE_AND_GENERATING_UI_ENDED_WITHOUT_EXPLICIT_MARKER'], snapshot, markers, messageDigest);
    }
    if (prev.dispatched) {
      return this.#emit(workerId, pageId, STATE.DISPATCHED, COMPLETION.NONE, ['AWAITING_ASSISTANT_GENERATION'], snapshot, markers, messageDigest);
    }
    return this.#emit(workerId, pageId, STATE.IDLE, COMPLETION.NONE, ['NO_DISPATCH_OR_GENERATION_SIGNAL'], snapshot, markers, messageDigest);
  }

  async install(adapter) {
    return adapter.evaluate(buildInjectedObserverScript(this.selectors, this.stableMs));
  }

  async readAndObserve(workerId, adapter) {
    const snapshot = await adapter.evaluate(buildInjectedReadScript());
    if (!snapshot) return this.observeSnapshot(workerId, { selector_found: false });
    return this.observeSnapshot(workerId, snapshot);
  }

  #emit(workerId, pageId, state, completionAssessment, reasonCodes, snapshot = {}, markers = null, digest = null) {
    const prev = this.workerState.get(workerId) || {};
    const effectiveMarkers = markers || { WORK_STATUS: null, COMMAND_ID: null, TERMINAL: null, BLOCKER: null };
    const commandId = effectiveMarkers.COMMAND_ID || prev.command_id || null;
    const event = Object.freeze({
      schema_version: 'WORKER_BROWSER_STATE_EVENT_V1',
      event_id: randomUUID(),
      sequence: ++this.sequence,
      observed_at: new Date(this.clock()).toISOString(),
      worker_id: workerId,
      page_id: pageId,
      previous_state: prev.state || null,
      state,
      completion_assessment: completionAssessment,
      command_id: commandId,
      work_status: effectiveMarkers.WORK_STATUS,
      terminal: effectiveMarkers.TERMINAL,
      blocker: effectiveMarkers.BLOCKER,
      assistant_message_count: Number(snapshot.assistant_message_count || snapshot.assistant_messages?.length || 0),
      assistant_digest_sha256: digest || prev.assistant_digest || null,
      generating_ui_active: Boolean(snapshot.generating_ui_active),
      dom_stable_ms: Number(snapshot.dom_stable_ms || 0),
      selector_strategy: {
        assistant: snapshot.assistant_selector_strategy || 'unknown',
        generating: snapshot.generating_selector_strategy || 'unknown',
      },
      selector_match: snapshot.selector_found !== false,
      reason_codes: reasonCodes,
      technical_pass_claimed: false,
      raw_secret_storage: false,
    });
    this.workerState.set(workerId, {
      ...prev,
      state,
      completion_assessment: completionAssessment,
      command_id: commandId,
      assistant_digest: digest || prev.assistant_digest || null,
      last_event: event,
      dispatched: prev.dispatched || [STATE.DISPATCHED, STATE.GENERATING, STATE.COMPLETE, STATE.BLOCKED].includes(state),
    });
    this.emit('state', event);
    return event;
  }
}

module.exports = {
  STATE,
  COMPLETION,
  DEFAULT_SELECTORS,
  WorkerCompletionObserverV1,
  parseMarkers,
  explicitStateFromMarkers,
  validateRegistry,
  registryMaps,
  buildInjectedObserverScript,
  buildInjectedReadScript,
  makeCdpRuntimeAdapter,
  makePlaywrightPageAdapter,
  redactText,
  sha256,
};
