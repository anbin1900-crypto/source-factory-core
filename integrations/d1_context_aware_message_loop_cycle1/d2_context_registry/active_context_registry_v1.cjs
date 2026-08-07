'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SCHEMA_VERSION = 'D2_ACTIVE_CONTEXT_REGISTRY_V1';
const WORK = Object.freeze({
  WAITING: 'WAITING',
  WORKING: 'WORKING',
  RESULT_PENDING: 'RESULT_PENDING',
  COMPLETED: 'COMPLETED',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
});

function iso(value) {
  const d = value instanceof Date ? value : new Date(value ?? Date.now());
  if (!Number.isFinite(d.getTime())) throw new Error('INVALID_TIMESTAMP');
  return d.toISOString();
}

function parseChatGptContext(url) {
  if (!url) return { context_id: null, kind: 'UNBOUND' };
  let u;
  try { u = new URL(String(url)); } catch { return { context_id: null, kind: 'INVALID_URL' }; }
  const host = u.hostname.toLowerCase();
  if (!['chatgpt.com', 'www.chatgpt.com', 'chat.openai.com'].includes(host)) {
    return { context_id: null, kind: 'NON_CHATGPT' };
  }
  const parts = u.pathname.split('/').filter(Boolean);
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (parts[i] === 'c' && parts[i + 1]) return { context_id: parts[i + 1], kind: 'CHAT' };
  }
  return { context_id: null, kind: parts.length ? 'CHATGPT_NO_CONTEXT_ID' : 'NEW_CHAT' };
}

function cleanContextName(title) {
  const s = String(title || '').trim();
  return s.replace(/\s*[|·-]\s*ChatGPT\s*$/i, '').trim() || null;
}

function normalizeWorkStatus({ viewModelCard, browserEvent } = {}) {
  const task = String(viewModelCard?.task_status?.state || '').toUpperCase();
  const worker = String(viewModelCard?.worker_state || '').toUpperCase();
  const sensor = String(browserEvent?.state || viewModelCard?.browser_state?.sensor_state || '').toUpperCase();
  const source = task || worker || sensor;
  if (source === 'COMPLETE') return WORK.COMPLETED;
  if (source === 'COMPLETE_RESULT_PENDING') return WORK.RESULT_PENDING;
  if (['GENERATING', 'DISPATCHED', 'RUNNING', 'WORKING', 'IN_PROGRESS'].includes(source)) return WORK.WORKING;
  if (source === 'IDLE') return WORK.WAITING;
  if (['BLOCKED', 'UNKNOWN', 'ERROR', 'FAILED', 'FAIL'].includes(source)) return WORK.REVIEW_REQUIRED;
  return WORK.WAITING;
}

class ActiveContextRegistryV1 {
  constructor({ state = null, clock = () => Date.now(), duplicateWindowMs = 15000 } = {}) {
    this.clock = clock;
    this.duplicateWindowMs = duplicateWindowMs;
    this.contexts = new Map();
    this.pages = new Map();
    if (state) this.restore(state);
  }

  restore(state) {
    if (!state || state.schema_version !== SCHEMA_VERSION) throw new Error('INVALID_REGISTRY_STATE');
    this.contexts = new Map((state.contexts || []).map(x => [x.context_id, { ...x }]));
    this.pages = new Map((state.pages || []).map(x => [x.page_id, { ...x }]));
  }

  exportState() {
    return {
      schema_version: SCHEMA_VERSION,
      contexts: [...this.contexts.values()].map(x => ({ ...x })),
      pages: [...this.pages.values()].map(x => ({ ...x })),
    };
  }

  bind({ roleId, contextId, pageId = null, commandId = null, contextName = null, startedAt = null }) {
    if (!roleId || !contextId) throw new Error('ROLE_AND_CONTEXT_REQUIRED');
    const prior = this.contexts.get(contextId);
    if (prior && prior.role_id !== roleId) throw new Error(`CONTEXT_ROLE_CONFLICT:${contextId}`);
    const started = prior?.started_at || iso(startedAt ?? this.clock());
    const value = {
      context_id: contextId,
      context_name: contextName || prior?.context_name || null,
      role_id: roleId,
      page_id: pageId || prior?.page_id || null,
      command_id: commandId || prior?.command_id || null,
      started_at: started,
      last_seen_at: prior?.last_seen_at || started,
    };
    this.contexts.set(contextId, value);
    return { ...value };
  }

  closePage(pageId) {
    const p = this.pages.get(pageId);
    if (p) this.pages.set(pageId, { ...p, closed_at: iso(this.clock()) });
  }

  observe(snapshot) {
    if (!snapshot || !snapshot.page_id) throw new Error('PAGE_ID_REQUIRED');
    const observedAt = iso(snapshot.observed_at ?? this.clock());
    const parsed = parseChatGptContext(snapshot.url);
    const contextId = parsed.context_id;
    const contextName = snapshot.context_name || cleanContextName(snapshot.title);
    const previousPage = this.pages.get(snapshot.page_id) || null;

    const contextChanged = Boolean(previousPage?.context_id && previousPage.context_id !== contextId);
    const page = {
      page_id: snapshot.page_id,
      context_id: contextId,
      context_name: contextName,
      url: snapshot.url || null,
      first_seen_at: previousPage?.first_seen_at || observedAt,
      last_seen_at: observedAt,
      navigation_count: (previousPage?.navigation_count || 0) + (contextChanged ? 1 : 0),
      closed_at: null,
    };
    this.pages.set(snapshot.page_id, page);

    if (snapshot.explicit_role_id && contextId) {
      this.bind({
        roleId: snapshot.explicit_role_id,
        contextId,
        pageId: snapshot.page_id,
        commandId: snapshot.command_id,
        contextName,
        startedAt: snapshot.started_at || observedAt,
      });
    }

    const binding = contextId ? this.contexts.get(contextId) : null;
    let roleId = binding?.role_id || null;
    let bindingState = roleId ? 'BOUND' : (contextId ? 'CONTEXT_UNBOUND' : 'CONTEXT_ID_PENDING');

    if (binding && contextName && binding.context_name !== contextName) binding.context_name = contextName;
    if (binding) {
      binding.last_seen_at = observedAt;
      binding.page_id = snapshot.page_id;
      if (snapshot.command_id) binding.command_id = snapshot.command_id;
    }

    if (contextId) {
      const nowMs = Date.parse(observedAt);
      const livePages = [...this.pages.values()].filter(p =>
        p.context_id === contextId && !p.closed_at && (nowMs - Date.parse(p.last_seen_at)) <= this.duplicateWindowMs
      );
      if (livePages.length > 1) {
        roleId = null;
        bindingState = 'AMBIGUOUS_DUPLICATE_CONTEXT_PAGE';
      }
    }

    const commandId = snapshot.command_id || binding?.command_id || snapshot.view_model_card?.command_id || snapshot.browser_event?.command_id || null;
    let workStatus = normalizeWorkStatus({ viewModelCard: snapshot.view_model_card, browserEvent: snapshot.browser_event });
    if (bindingState === 'AMBIGUOUS_DUPLICATE_CONTEXT_PAGE') workStatus = WORK.REVIEW_REQUIRED;

    return {
      ROLE_ID: roleId,
      CONTEXT_ID: contextId,
      CONTEXT_NAME: contextName,
      PAGE_ID: snapshot.page_id,
      COMMAND_ID: commandId,
      WORK_STATUS: workStatus,
      STARTED_AT: binding?.started_at || snapshot.started_at || page.first_seen_at,
      LAST_SEEN_AT: observedAt,
      BINDING_STATE: bindingState,
      CONTEXT_KIND: parsed.kind,
    };
  }
}

function saveStateAtomic(filePath, registry) {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const temp = `${resolved}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, JSON.stringify(registry.exportState(), null, 2) + '\n', { flag: 'wx' });
  fs.renameSync(temp, resolved);
}

function loadStateFile(filePath, options = {}) {
  if (!fs.existsSync(filePath)) return new ActiveContextRegistryV1(options);
  return new ActiveContextRegistryV1({ ...options, state: JSON.parse(fs.readFileSync(filePath, 'utf8')) });
}

module.exports = { SCHEMA_VERSION, WORK, parseChatGptContext, cleanContextName, normalizeWorkStatus, ActiveContextRegistryV1, saveStateAtomic, loadStateFile };
