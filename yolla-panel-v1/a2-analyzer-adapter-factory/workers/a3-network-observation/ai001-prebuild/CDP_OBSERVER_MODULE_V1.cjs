'use strict';

const { EventEmitter } = require('node:events');
const { createHash, randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SENSITIVE_NAME_RE = /(authorization|proxy-authorization|cookie|set-cookie|token|secret|password|passwd|api[_-]?key|session[_-]?key|credential|jwt)/i;
const SENSITIVE_QUERY_RE = /^(access_token|refresh_token|token|api_key|apikey|key|secret|password|passwd|authorization|cookie)$/i;
const TEXT_SECRET_PATTERNS = [
  /(bearer\s+)[a-z0-9._~+/=-]{8,}/ig,
  /(basic\s+)[a-z0-9+/=]{8,}/ig,
  /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|passwd|authorization|cookie)\s*[:=]\s*)[^\s,;}&]{3,}/ig,
];

function sha256(value) {
  const input = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === 'string' ? value : stableStringify(value), 'utf8');
  return createHash('sha256').update(input).digest('hex');
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}
function stableStringify(value) { return JSON.stringify(stable(value)); }
function nowIso(clock = Date.now) { return new Date(clock()).toISOString(); }

function redactHeaders(headers) {
  const output = {};
  for (const [name, value] of Object.entries(headers || {})) {
    output[name] = SENSITIVE_NAME_RE.test(name) ? '<REDACTED>' : String(value);
  }
  return output;
}

function redactUrl(rawUrl) {
  if (!rawUrl) return rawUrl;
  try {
    const url = new URL(rawUrl);
    url.username = '';
    url.password = '';
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY_RE.test(key)) url.searchParams.set(key, '<REDACTED>');
    }
    return url.toString();
  } catch {
    return String(rawUrl).replace(/([?&](?:access_token|refresh_token|token|api_key|apikey|key|secret|password|passwd|authorization|cookie)=)[^&#]*/ig, '$1<REDACTED>');
  }
}

function redactObject(value) {
  if (Array.isArray(value)) return value.map(redactObject);
  if (value && typeof value === 'object') {
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = SENSITIVE_NAME_RE.test(key) ? '<REDACTED>' : redactObject(item);
    }
    return output;
  }
  return value;
}

function redactText(text) {
  let output = String(text ?? '');
  for (const pattern of TEXT_SECRET_PATTERNS) output = output.replace(pattern, '$1<REDACTED>');
  output = output.replace(/([?&](?:access_token|refresh_token|token|api_key|apikey|key|secret|password|passwd|authorization|cookie)=)[^&#\s]*/ig, '$1<REDACTED>');
  return output;
}

function redactResponseBody(body, mimeType = '', base64Encoded = false, maxBytes = 2 * 1024 * 1024) {
  const rawBuffer = base64Encoded ? Buffer.from(String(body || ''), 'base64') : Buffer.from(String(body || ''), 'utf8');
  const rawSha256 = sha256(rawBuffer);
  const clipped = rawBuffer.subarray(0, Math.min(rawBuffer.length, maxBytes));
  let text = clipped.toString('utf8');
  let parsed = null;
  if (/json/i.test(mimeType) || /^[\s\r\n]*[\[{]/.test(text)) {
    try { parsed = JSON.parse(text); } catch {}
  }
  const redactedBody = parsed == null ? redactText(text) : JSON.stringify(redactObject(parsed));
  return {
    raw_sha256: rawSha256,
    raw_size_bytes: rawBuffer.length,
    truncated: rawBuffer.length > maxBytes,
    redacted_body: redactedBody,
    redacted_body_sha256: sha256(redactedBody),
    raw_body_retained: false,
  };
}

function selectPageTarget(targetInfos, criteria = {}) {
  const pages = (targetInfos || []).filter((target) => target && target.type === 'page');
  if (!pages.length) throw new Error('NO_PAGE_TARGET');
  if (criteria.page_id || criteria.target_id) {
    const id = criteria.page_id || criteria.target_id;
    const exact = pages.find((target) => target.targetId === id);
    if (!exact) throw new Error(`PAGE_TARGET_NOT_FOUND:${id}`);
    return exact;
  }
  if (criteria.url_contains) {
    const byUrl = pages.find((target) => String(target.url || '').includes(criteria.url_contains));
    if (byUrl) return byUrl;
  }
  if (criteria.title_contains) {
    const byTitle = pages.find((target) => String(target.title || '').includes(criteria.title_contains));
    if (byTitle) return byTitle;
  }
  const eligible = pages.filter((target) => !/^devtools:\/\//i.test(target.url || ''));
  return eligible[0] || pages[0];
}

class BrowserCdpConnection extends EventEmitter {
  constructor({ browserUrl = 'http://127.0.0.1:9222', websocketUrl = null } = {}) {
    super();
    this.browserUrl = browserUrl.replace(/\/$/, '');
    this.websocketUrl = websocketUrl;
    this.ws = null;
    this.id = 0;
    this.pending = new Map();
  }

  async connect() {
    if (!this.websocketUrl) {
      const response = await fetch(`${this.browserUrl}/json/version`);
      if (!response.ok) throw new Error(`CDP_VERSION_HTTP_${response.status}`);
      const version = await response.json();
      this.websocketUrl = version.webSocketDebuggerUrl;
    }
    if (!this.websocketUrl) throw new Error('BROWSER_WEBSOCKET_URL_MISSING');
    this.ws = new WebSocket(this.websocketUrl);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', () => reject(new Error('CDP_WEBSOCKET_CONNECT_FAILED')), { once: true });
    });
    this.ws.addEventListener('message', (message) => this.#handleMessage(message.data));
    this.ws.addEventListener('close', () => this.emit('close'));
    return this;
  }

  #handleMessage(raw) {
    let message;
    try { message = JSON.parse(String(raw)); } catch { return; }
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(Object.assign(new Error(message.error.message || 'CDP_COMMAND_ERROR'), { cdp_error: message.error }));
      else pending.resolve(message.result || {});
      return;
    }
    if (message.method) this.emit('event', message.method, message.params || {}, message.sessionId || null);
  }

  send(method, params = {}, sessionId = null) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error('CDP_NOT_CONNECTED'));
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
    });
  }

  async close() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.close();
    this.pending.clear();
  }
}

class PlaywrightCdpTransport extends EventEmitter {
  constructor(cdpSession) {
    super();
    if (!cdpSession || typeof cdpSession.send !== 'function' || typeof cdpSession.on !== 'function') throw new TypeError('Playwright CDPSession required');
    this.session = cdpSession;
    this.handlers = new Map();
  }
  send(method, params = {}) { return this.session.send(method, params); }
  subscribe(methods) {
    for (const method of methods) {
      if (this.handlers.has(method)) continue;
      const handler = (params) => this.emit('event', method, params || {}, null);
      this.handlers.set(method, handler);
      this.session.on(method, handler);
    }
  }
  async close() {
    for (const [method, handler] of this.handlers) this.session.off?.(method, handler);
    this.handlers.clear();
    if (typeof this.session.detach === 'function') await this.session.detach();
  }
}

class CdpObserverModuleV1 extends EventEmitter {
  constructor({ transport, statePath = null, clock = Date.now, responseBodyMaxBytes = 2 * 1024 * 1024, actionWindowMs = 10_000 } = {}) {
    super();
    if (!transport || typeof transport.send !== 'function' || typeof transport.on !== 'function') throw new TypeError('transport with send/on required');
    this.transport = transport;
    this.statePath = statePath;
    this.clock = clock;
    this.responseBodyMaxBytes = responseBodyMaxBytes;
    this.actionWindowMs = actionWindowMs;
    this.state = {
      schema_version: 'CDP_OBSERVER_STATE_V1',
      observer_id: randomUUID(),
      page_id: null,
      session_id: null,
      selected_target: null,
      sequence: 0,
      started_at: null,
      stopped_at: null,
      counters: {},
      pending_responses: {},
      recent_actions: [],
      last_event_digest: null,
    };
    this.boundEvent = (method, params, sessionId) => this.#onProtocolEvent(method, params, sessionId).catch((error) => this.#publish('observer.error', { payload: { stage: method, message: error.message } }));
    this.started = false;
  }

  static async discoverPageTargets(transport) {
    try { await transport.send('Target.setDiscoverTargets', { discover: true }); } catch {}
    const result = await transport.send('Target.getTargets', {});
    return (result.targetInfos || []).filter((target) => target.type === 'page');
  }

  async selectAndAttach(criteria = {}) {
    const targets = await CdpObserverModuleV1.discoverPageTargets(this.transport);
    const target = selectPageTarget(targets, criteria);
    const attached = await this.transport.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    this.state.page_id = target.targetId;
    this.state.session_id = attached.sessionId;
    this.state.selected_target = { targetId: target.targetId, type: target.type, title: target.title || '', url: redactUrl(target.url || '') };
    return { page_id: target.targetId, session_id: attached.sessionId, target: this.state.selected_target };
  }

  async start({ target = {}, alreadyAttachedSessionId = null, pageId = null } = {}) {
    if (this.started) return this.getState();
    this.transport.on('event', this.boundEvent);
    if (typeof this.transport.subscribe === 'function') {
      this.transport.subscribe([
        'Page.frameNavigated', 'Page.lifecycleEvent', 'Runtime.consoleAPICalled',
        'Network.requestWillBeSent', 'Network.responseReceived', 'Network.loadingFinished', 'Network.loadingFailed'
      ]);
    }
    if (alreadyAttachedSessionId !== null || pageId !== null) {
      this.state.session_id = alreadyAttachedSessionId;
      this.state.page_id = pageId || 'playwright-page';
      this.state.selected_target = { targetId: this.state.page_id, type: 'page', title: '', url: '' };
    } else {
      await this.selectAndAttach(target);
    }
    const sid = this.state.session_id;
    await Promise.all([
      this.transport.send('Network.enable', { maxTotalBufferSize: 100 * 1024 * 1024, maxResourceBufferSize: 20 * 1024 * 1024, maxPostDataSize: 2 * 1024 * 1024 }, sid),
      this.transport.send('Page.enable', {}, sid),
      this.transport.send('Runtime.enable', {}, sid),
    ]);
    this.state.started_at = nowIso(this.clock);
    this.started = true;
    this.#publish('observer.started', { payload: { page_id: this.state.page_id, session_id: sid, target: this.state.selected_target } });
    await this.captureDomSnapshot('start');
    await this.persistState();
    return this.getState();
  }

  recordAction(action = {}) {
    const entry = {
      action_id: action.action_id || randomUUID(),
      action_type: action.action_type || action.type || 'UNKNOWN',
      locator: action.locator || null,
      timestamp: action.timestamp || nowIso(this.clock),
      timestamp_ms: this.clock(),
    };
    this.state.recent_actions.push(entry);
    this.state.recent_actions = this.state.recent_actions.filter((item) => item.timestamp_ms >= this.clock() - this.actionWindowMs);
    this.#publish('action.recorded', { payload: { action: entry }, action: entry });
    return entry;
  }

  #nearestAction() {
    const now = this.clock();
    let nearest = null;
    for (const action of this.state.recent_actions) {
      const delta = Math.abs(now - action.timestamp_ms);
      if (!nearest || delta < nearest.delta_ms) nearest = { ...action, delta_ms: delta };
    }
    return nearest && nearest.delta_ms <= this.actionWindowMs ? nearest : null;
  }

  #envelope(type, { requestId = null, payload = {}, action = null } = {}) {
    const event = {
      schema_version: 'CDP_OBSERVER_EVIDENCE_V1',
      observer_id: this.state.observer_id,
      sequence: ++this.state.sequence,
      event_id: randomUUID(),
      type,
      page_id: this.state.page_id,
      request_id: requestId,
      action_id: action?.action_id || null,
      timestamp: nowIso(this.clock),
      timestamp_ms: this.clock(),
      payload,
    };
    event.evidence_sha256 = sha256(event);
    return event;
  }

  #publish(type, options = {}) {
    const action = options.action || this.#nearestAction();
    const event = this.#envelope(type, { ...options, action });
    this.state.counters[type] = (this.state.counters[type] || 0) + 1;
    this.state.last_event_digest = event.evidence_sha256;
    this.emit('evidence', event);
    return event;
  }

  async captureDomSnapshot(reason = 'manual') {
    const snapshot = await this.transport.send('DOMSnapshot.captureSnapshot', {
      computedStyles: ['display', 'visibility', 'position', 'overflow', 'cursor'],
      includePaintOrder: true,
      includeDOMRects: true,
    }, this.state.session_id);
    return this.#publish('dom.snapshot', {
      payload: {
        reason,
        document_count: Array.isArray(snapshot.documents) ? snapshot.documents.length : 0,
        string_count: Array.isArray(snapshot.strings) ? snapshot.strings.length : 0,
        snapshot,
      }
    });
  }

  async #captureResponseBody(requestId, responseMeta) {
    try {
      const result = await this.transport.send('Network.getResponseBody', { requestId }, this.state.session_id);
      const redacted = redactResponseBody(result.body || '', responseMeta.mime_type || '', Boolean(result.base64Encoded), this.responseBodyMaxBytes);
      this.#publish('network.responseBody', {
        requestId,
        payload: {
          status: responseMeta.status,
          mime_type: responseMeta.mime_type,
          base64_encoded: Boolean(result.base64Encoded),
          ...redacted,
        }
      });
    } catch (error) {
      this.#publish('network.responseBodyUnavailable', { requestId, payload: { message: error.message } });
    } finally {
      delete this.state.pending_responses[requestId];
    }
  }

  async #onProtocolEvent(method, params = {}, eventSessionId = null) {
    if (this.state.session_id && eventSessionId && eventSessionId !== this.state.session_id) return;
    switch (method) {
      case 'Network.requestWillBeSent': {
        const request = params.request || {};
        const resourceType = params.type || null;
        this.#publish('network.request', {
          requestId: params.requestId,
          payload: {
            method: request.method || null,
            url: redactUrl(request.url || ''),
            document_url: redactUrl(params.documentURL || ''),
            headers: redactHeaders(request.headers),
            resource_type: resourceType,
            xhr_or_fetch: resourceType === 'XHR' || resourceType === 'Fetch',
            frame_id: params.frameId || null,
            loader_id: params.loaderId || null,
          }
        });
        break;
      }
      case 'Network.responseReceived': {
        const response = params.response || {};
        const meta = {
          status: response.status ?? null,
          mime_type: response.mimeType || null,
          url: redactUrl(response.url || ''),
          headers: redactHeaders(response.headers),
          resource_type: params.type || null,
          frame_id: params.frameId || null,
          body_state: 'PENDING_LOADING_FINISHED',
        };
        this.state.pending_responses[params.requestId] = meta;
        this.#publish('network.response', { requestId: params.requestId, payload: meta });
        break;
      }
      case 'Network.loadingFinished': {
        const meta = this.state.pending_responses[params.requestId];
        this.#publish('network.loadingFinished', { requestId: params.requestId, payload: { encoded_data_length: params.encodedDataLength ?? null } });
        if (meta) await this.#captureResponseBody(params.requestId, meta);
        break;
      }
      case 'Network.loadingFailed': {
        delete this.state.pending_responses[params.requestId];
        this.#publish('network.loadingFailed', { requestId: params.requestId, payload: { error_text: params.errorText || null, canceled: Boolean(params.canceled), blocked_reason: params.blockedReason || null } });
        break;
      }
      case 'Page.frameNavigated': {
        const frame = params.frame || {};
        this.#publish('page.frameNavigated', { payload: { frame_id: frame.id || null, parent_id: frame.parentId || null, url: redactUrl(frame.url || ''), name: frame.name || null, mime_type: frame.mimeType || null } });
        break;
      }
      case 'Page.lifecycleEvent':
        this.#publish('page.lifecycleEvent', { payload: { frame_id: params.frameId || null, loader_id: params.loaderId || null, name: params.name || null, cdp_timestamp: params.timestamp ?? null } });
        break;
      case 'Runtime.consoleAPICalled':
        this.#publish('runtime.console', { payload: { level: params.type || null, execution_context_id: params.executionContextId || null, args: (params.args || []).map((arg) => ({ type: arg.type || null, value: SENSITIVE_NAME_RE.test(String(arg.value || '')) ? '<REDACTED>' : arg.value ?? null, description: arg.description ? redactText(arg.description).slice(0, 4096) : null })) } });
        break;
      default:
        break;
    }
    await this.persistState();
  }

  getState() { return JSON.parse(JSON.stringify(this.state)); }
  restoreState(snapshot) {
    if (!snapshot || snapshot.schema_version !== 'CDP_OBSERVER_STATE_V1') throw new Error('INVALID_CDP_OBSERVER_STATE');
    this.state = JSON.parse(JSON.stringify(snapshot));
    return this.getState();
  }
  async persistState() {
    if (!this.statePath) return false;
    const dir = path.dirname(this.statePath);
    fs.mkdirSync(dir, { recursive: true });
    const temp = `${this.statePath}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify(this.state, null, 2)}\n`, 'utf8');
    fs.renameSync(temp, this.statePath);
    return true;
  }
  loadStateFromFile(file = this.statePath) {
    if (!file || !fs.existsSync(file)) return false;
    this.restoreState(JSON.parse(fs.readFileSync(file, 'utf8')));
    return true;
  }

  async stop(reason = 'normal') {
    if (!this.started) return this.getState();
    this.transport.off?.('event', this.boundEvent);
    if (this.state.session_id) {
      try { await this.transport.send('Target.detachFromTarget', { sessionId: this.state.session_id }); } catch {}
    }
    this.state.stopped_at = nowIso(this.clock);
    this.started = false;
    this.#publish('observer.stopped', { payload: { reason } });
    await this.persistState();
    return this.getState();
  }
}

module.exports = {
  BrowserCdpConnection,
  PlaywrightCdpTransport,
  CdpObserverModuleV1,
  selectPageTarget,
  redactHeaders,
  redactUrl,
  redactObject,
  redactText,
  redactResponseBody,
  sha256,
  stableStringify,
};
