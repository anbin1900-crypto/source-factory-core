'use strict';

const { EventEmitter } = require('node:events');
const { createHash, randomUUID } = require('node:crypto');

const DEFAULT_PROTOCOL_VERSION = '1.3';
const DEFAULT_CORRELATION_WINDOW_MS = 10_000;
const DEFAULT_MAX_INLINE_BODY_BYTES = 2 * 1024 * 1024;
const SENSITIVE_HEADER_PATTERN = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key|x-auth-token)$/i;
const SENSITIVE_QUERY_PATTERN = /^(access_token|refresh_token|token|api_key|apikey|key|secret|password|passwd|authorization|cookie)$/i;

function sha256(value) {
  const hash = createHash('sha256');
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) hash.update(value);
  else hash.update(String(value ?? ''), 'utf8');
  return hash.digest('hex');
}

function nowIso(clock) {
  return new Date(clock()).toISOString();
}

function redactHeaders(headers) {
  if (!headers || typeof headers !== 'object') return {};
  const output = {};
  for (const [key, value] of Object.entries(headers)) {
    output[key] = SENSITIVE_HEADER_PATTERN.test(key) ? '<REDACTED>' : String(value);
  }
  return output;
}

function redactUrl(rawUrl) {
  if (!rawUrl) return rawUrl;
  try {
    const url = new URL(rawUrl);
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY_PATTERN.test(key)) url.searchParams.set(key, '<REDACTED>');
    }
    url.username = '';
    url.password = '';
    return url.toString();
  } catch {
    return String(rawUrl).replace(/([?&](?:access_token|refresh_token|token|api_key|apikey|key|secret|password|passwd)=)[^&#]*/gi, '$1<REDACTED>');
  }
}

function normalizeConsoleArg(arg) {
  if (!arg || typeof arg !== 'object') return { type: typeof arg, value: String(arg) };
  const result = { type: arg.type || 'unknown' };
  if (Object.prototype.hasOwnProperty.call(arg, 'value')) result.value = arg.value;
  if (arg.description) result.description = String(arg.description).slice(0, 4096);
  if (arg.objectId) result.object_id = arg.objectId;
  return result;
}

class AnalyzerEventStream extends EventEmitter {
  constructor({ maxBufferedEvents = 5000 } = {}) {
    super();
    this.maxBufferedEvents = maxBufferedEvents;
    this.sequence = 0;
    this.buffer = [];
    this.waiters = new Set();
    this.closed = false;
  }

  publish(event) {
    if (this.closed) return null;
    const envelope = Object.freeze({
      schema_version: 'STREAMING_ANALYZER_EVENT_V1',
      sequence: ++this.sequence,
      ...event,
    });
    this.buffer.push(envelope);
    if (this.buffer.length > this.maxBufferedEvents) this.buffer.shift();
    this.emit('event', envelope);
    for (const waiter of [...this.waiters]) {
      this.waiters.delete(waiter);
      waiter.resolve({ value: envelope, done: false });
    }
    return envelope;
  }

  subscribe(listener, { replayBuffered = false } = {}) {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function');
    if (replayBuffered) for (const event of this.buffer) listener(event);
    this.on('event', listener);
    return () => this.off('event', listener);
  }

  asyncIterator({ fromSequence = 0 } = {}) {
    const stream = this;
    let replay = stream.buffer.filter((event) => event.sequence > fromSequence);
    return {
      [Symbol.asyncIterator]() { return this; },
      next() {
        if (replay.length) return Promise.resolve({ value: replay.shift(), done: false });
        if (stream.closed) return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve, reject) => stream.waiters.add({ resolve, reject }));
      },
      return() { return Promise.resolve({ value: undefined, done: true }); },
    };
  }

  close() {
    this.closed = true;
    for (const waiter of [...this.waiters]) waiter.resolve({ value: undefined, done: true });
    this.waiters.clear();
    this.removeAllListeners();
  }
}

class LiveCdpCaptureEngine {
  constructor({
    webContents,
    analyzerSessionId = randomUUID(),
    stream = new AnalyzerEventStream(),
    bodyStore = null,
    protocolVersion = DEFAULT_PROTOCOL_VERSION,
    correlationWindowMs = DEFAULT_CORRELATION_WINDOW_MS,
    maxInlineBodyBytes = DEFAULT_MAX_INLINE_BODY_BYTES,
    clock = Date.now,
    logger = console,
  }) {
    if (!webContents || !webContents.debugger) throw new TypeError('Electron webContents.debugger is required');
    for (const method of ['attach', 'detach', 'sendCommand', 'on', 'removeListener']) {
      if (typeof webContents.debugger[method] !== 'function') throw new TypeError(`webContents.debugger.${method} is required`);
    }
    this.webContents = webContents;
    this.debugger = webContents.debugger;
    this.analyzerSessionId = analyzerSessionId;
    this.stream = stream;
    this.bodyStore = bodyStore;
    this.protocolVersion = protocolVersion;
    this.correlationWindowMs = correlationWindowMs;
    this.maxInlineBodyBytes = maxInlineBodyBytes;
    this.clock = clock;
    this.logger = logger;
    this.attached = false;
    this.ownsDebuggerAttachment = false;
    this.closed = false;
    this.pendingRequests = new Map();
    this.frames = new Map();
    this.actions = [];
    this.snapshotInFlight = null;
    this.boundMessage = this.#handleDebuggerMessage.bind(this);
    this.boundDetach = this.#handleDebuggerDetach.bind(this);
  }

  #baseEvent(type, payload = {}) {
    return {
      event_id: randomUUID(),
      analyzer_session_id: this.analyzerSessionId,
      web_contents_id: this.webContents.id ?? null,
      type,
      observed_at: nowIso(this.clock),
      monotonic_ms: this.clock(),
      page_url: redactUrl(typeof this.webContents.getURL === 'function' ? this.webContents.getURL() : null),
      payload,
    };
  }

  #publish(type, payload = {}) {
    return this.stream.publish(this.#baseEvent(type, payload));
  }

  #findNearestAction(timestampMs) {
    const minimum = timestampMs - this.correlationWindowMs;
    this.actions = this.actions.filter((item) => item.recorded_at_ms >= minimum);
    let nearest = null;
    for (const action of this.actions) {
      const delta = Math.abs(timestampMs - action.recorded_at_ms);
      if (!nearest || delta < nearest.delta_ms) nearest = { ...action, delta_ms: delta };
    }
    return nearest;
  }

  recordAction(action = {}) {
    const recordedAtMs = this.clock();
    const entry = {
      action_id: action.action_id || randomUUID(),
      action_type: action.action_type || action.type || 'UNKNOWN',
      locator: action.locator || null,
      frame_id: action.frame_id || null,
      user_step_id: action.user_step_id || null,
      metadata: action.metadata || {},
      recorded_at_ms: recordedAtMs,
      recorded_at: new Date(recordedAtMs).toISOString(),
    };
    this.actions.push(entry);
    this.#publish('analyzer.action', { action: entry });
    return entry;
  }

  async attach() {
    if (this.closed) throw new Error('capture engine is closed');
    if (this.attached) return this;
    if (typeof this.debugger.isAttached === 'function') {
      if (!this.debugger.isAttached()) {
        this.debugger.attach(this.protocolVersion);
        this.ownsDebuggerAttachment = true;
      }
    } else {
      this.debugger.attach(this.protocolVersion);
      this.ownsDebuggerAttachment = true;
    }
    this.debugger.on('message', this.boundMessage);
    this.debugger.on('detach', this.boundDetach);
    try {
      await Promise.all([
        this.debugger.sendCommand('Network.enable', {
          maxTotalBufferSize: 100 * 1024 * 1024,
          maxResourceBufferSize: 20 * 1024 * 1024,
          maxPostDataSize: 2 * 1024 * 1024,
        }),
        this.debugger.sendCommand('Page.enable'),
        this.debugger.sendCommand('Runtime.enable'),
        this.debugger.sendCommand('Page.setLifecycleEventsEnabled', { enabled: true }),
      ]);
      this.attached = true;
      this.#publish('cdp.attached', { protocol_version: this.protocolVersion });
      await this.captureDomSnapshot('attach');
      return this;
    } catch (error) {
      this.debugger.removeListener('message', this.boundMessage);
      this.debugger.removeListener('detach', this.boundDetach);
      try {
        if (this.ownsDebuggerAttachment && (typeof this.debugger.isAttached !== 'function' || this.debugger.isAttached())) this.debugger.detach();
      } catch {}
      throw error;
    }
  }

  async captureDomSnapshot(reason = 'manual') {
    if (this.snapshotInFlight) return this.snapshotInFlight;
    const correlation = this.#findNearestAction(this.clock());
    this.snapshotInFlight = this.debugger.sendCommand('DOMSnapshot.captureSnapshot', {
      computedStyles: ['display', 'visibility', 'position', 'overflow', 'cursor'],
      includePaintOrder: true,
      includeDOMRects: true,
      includeBlendedBackgroundColors: false,
      includeTextColorOpacities: false,
    }).then((snapshot) => {
      const documentCount = Array.isArray(snapshot?.documents) ? snapshot.documents.length : 0;
      const stringCount = Array.isArray(snapshot?.strings) ? snapshot.strings.length : 0;
      return this.#publish('dom.snapshot', {
        reason,
        correlation,
        document_count: documentCount,
        string_count: stringCount,
        snapshot,
      });
    }).catch((error) => {
      this.#publish('cdp.error', { stage: 'DOMSnapshot.captureSnapshot', message: error.message, reason });
      return null;
    }).finally(() => {
      this.snapshotInFlight = null;
    });
    return this.snapshotInFlight;
  }

  async #captureResponseBody(requestId, metadata) {
    try {
      const result = await this.debugger.sendCommand('Network.getResponseBody', { requestId }, metadata?.session_id || undefined);
      const source = result?.body ?? '';
      const rawBuffer = result?.base64Encoded ? Buffer.from(source, 'base64') : Buffer.from(source, 'utf8');
      const sha = sha256(rawBuffer);
      const sizeBytes = rawBuffer.byteLength;
      const truncated = sizeBytes > this.maxInlineBodyBytes;
      const inlineBuffer = truncated ? rawBuffer.subarray(0, this.maxInlineBodyBytes) : rawBuffer;
      let storagePointer = null;
      if (this.bodyStore && typeof this.bodyStore.put === 'function') {
        storagePointer = await this.bodyStore.put({
          analyzer_session_id: this.analyzerSessionId,
          request_id: requestId,
          mime_type: metadata?.mime_type || null,
          sha256: sha,
          size_bytes: sizeBytes,
          base64_encoded: Boolean(result?.base64Encoded),
          body: rawBuffer,
        });
      }
      this.#publish('network.responseBody', {
        request_id: requestId,
        correlation: metadata?.correlation || null,
        mime_type: metadata?.mime_type || null,
        status: metadata?.status || null,
        sha256: sha,
        size_bytes: sizeBytes,
        base64_encoded: Boolean(result?.base64Encoded),
        truncated,
        storage_pointer: storagePointer,
        inline_body: result?.base64Encoded
          ? inlineBuffer.toString('base64')
          : inlineBuffer.toString('utf8'),
      });
    } catch (error) {
      this.#publish('network.responseBodyUnavailable', {
        request_id: requestId,
        correlation: metadata?.correlation || null,
        message: error.message,
      });
    }
  }

  async #handleDebuggerMessage(_event, method, params = {}, sessionId = null) {
    const timestampMs = this.clock();
    const correlation = this.#findNearestAction(timestampMs);
    try {
      switch (method) {
        case 'Network.requestWillBeSent': {
          const requestId = params.requestId;
          const request = params.request || {};
          const state = {
            request_id: requestId,
            frame_id: params.frameId || null,
            loader_id: params.loaderId || null,
            document_url: redactUrl(params.documentURL),
            request_url: redactUrl(request.url),
            method: request.method || null,
            resource_type: params.type || null,
            request_headers: redactHeaders(request.headers),
            has_post_data: Boolean(request.hasPostData),
            initiator: params.initiator || null,
            wall_time: params.wallTime || null,
            timestamp: params.timestamp || null,
            session_id: sessionId,
            correlation,
          };
          this.pendingRequests.set(requestId, state);
          this.#publish('network.requestWillBeSent', state);
          break;
        }
        case 'Network.responseReceived': {
          const response = params.response || {};
          const state = this.pendingRequests.get(params.requestId) || { request_id: params.requestId };
          Object.assign(state, {
            response_url: redactUrl(response.url),
            status: response.status ?? null,
            status_text: response.statusText || null,
            mime_type: response.mimeType || null,
            protocol: response.protocol || null,
            remote_ip_address: response.remoteIPAddress || null,
            response_headers: redactHeaders(response.headers),
            encoded_data_length: response.encodedDataLength ?? null,
            from_disk_cache: Boolean(response.fromDiskCache),
            from_service_worker: Boolean(response.fromServiceWorker),
            resource_type: params.type || state.resource_type || null,
            correlation: state.correlation || correlation,
          });
          this.pendingRequests.set(params.requestId, state);
          this.#publish('network.responseReceived', state);
          break;
        }
        case 'Network.loadingFinished': {
          const state = this.pendingRequests.get(params.requestId) || { request_id: params.requestId, correlation };
          Object.assign(state, {
            loading_finished_at: params.timestamp || null,
            encoded_data_length: params.encodedDataLength ?? state.encoded_data_length ?? null,
          });
          this.#publish('network.loadingFinished', state);
          await this.#captureResponseBody(params.requestId, state);
          this.pendingRequests.delete(params.requestId);
          break;
        }
        case 'Network.loadingFailed': {
          const state = this.pendingRequests.get(params.requestId) || { request_id: params.requestId, correlation };
          this.#publish('network.loadingFailed', {
            ...state,
            error_text: params.errorText || null,
            canceled: Boolean(params.canceled),
            blocked_reason: params.blockedReason || null,
          });
          this.pendingRequests.delete(params.requestId);
          break;
        }
        case 'Page.frameNavigated': {
          const frame = params.frame || {};
          const frameState = {
            frame_id: frame.id || null,
            parent_id: frame.parentId || null,
            loader_id: frame.loaderId || null,
            url: redactUrl(frame.url),
            name: frame.name || null,
            mime_type: frame.mimeType || null,
            security_origin: frame.securityOrigin || null,
            correlation,
          };
          if (frameState.frame_id) this.frames.set(frameState.frame_id, frameState);
          this.#publish('page.frameNavigated', frameState);
          await this.captureDomSnapshot('frameNavigated');
          break;
        }
        case 'Page.lifecycleEvent': {
          const lifecycle = {
            frame_id: params.frameId || null,
            loader_id: params.loaderId || null,
            name: params.name || null,
            timestamp: params.timestamp || null,
            correlation,
          };
          this.#publish('page.lifecycleEvent', lifecycle);
          if (['DOMContentLoaded', 'load', 'networkIdle'].includes(params.name)) {
            await this.captureDomSnapshot(`lifecycle:${params.name}`);
          }
          break;
        }
        case 'Runtime.consoleAPICalled': {
          this.#publish('runtime.consoleAPICalled', {
            console_type: params.type || null,
            execution_context_id: params.executionContextId ?? null,
            timestamp: params.timestamp ?? null,
            stack_trace: params.stackTrace || null,
            args: Array.isArray(params.args) ? params.args.map(normalizeConsoleArg) : [],
            correlation,
          });
          break;
        }
        default:
          break;
      }
    } catch (error) {
      this.#publish('cdp.error', { stage: method, message: error.message });
      this.logger?.error?.('[LiveCdpCaptureEngine]', method, error);
    }
  }

  #handleDebuggerDetach(_event, reason) {
    this.attached = false;
    this.#publish('cdp.detached', { reason: reason || 'unknown' });
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    this.debugger.removeListener('message', this.boundMessage);
    this.debugger.removeListener('detach', this.boundDetach);
    try {
      if (this.ownsDebuggerAttachment && (typeof this.debugger.isAttached !== 'function' || this.debugger.isAttached())) this.debugger.detach();
    } catch (error) {
      this.#publish('cdp.error', { stage: 'detach', message: error.message });
    }
    this.attached = false;
    this.pendingRequests.clear();
    this.frames.clear();
    this.#publish('cdp.closed', {});
  }
}

async function attachLiveCdpCapture(webContents, options = {}) {
  const engine = new LiveCdpCaptureEngine({ webContents, ...options });
  await engine.attach();
  return engine;
}

module.exports = {
  AnalyzerEventStream,
  LiveCdpCaptureEngine,
  attachLiveCdpCapture,
  redactHeaders,
  redactUrl,
  sha256,
};
