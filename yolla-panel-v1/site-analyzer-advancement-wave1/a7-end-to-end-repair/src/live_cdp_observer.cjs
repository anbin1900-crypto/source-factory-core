'use strict';
const { EventEmitter } = require('node:events');

class LiveCdpObserver extends EventEmitter {
  constructor({ webContents, clock = () => new Date().toISOString(), maxBodyBytes = 2_000_000 } = {}) {
    super();
    if (!webContents || !webContents.debugger) throw new TypeError('webContents.debugger is required');
    this.webContents = webContents;
    this.debugger = webContents.debugger;
    this.clock = clock;
    this.maxBodyBytes = maxBodyBytes;
    this.events = [];
    this.requests = new Map();
    this.responses = new Map();
    this.actions = [];
    this.started = false;
    this._onMessage = this._onMessage.bind(this);
    this._onDetach = this._onDetach.bind(this);
  }

  async start() {
    if (this.started) return this;
    if (!this.debugger.isAttached()) this.debugger.attach('1.3');
    this.debugger.on('message', this._onMessage);
    this.debugger.on('detach', this._onDetach);
    for (const command of ['Network.enable', 'Page.enable', 'Runtime.enable']) {
      await this.debugger.sendCommand(command);
    }
    this.started = true;
    this._publish('observer.started', { attached: true });
    return this;
  }

  async stop() {
    if (!this.started) return;
    this.debugger.removeListener('message', this._onMessage);
    this.debugger.removeListener('detach', this._onDetach);
    this.started = false;
    this._publish('observer.stopped', {});
  }

  subscribe(listener) {
    this.on('analyzer-event', listener);
    return () => this.removeListener('analyzer-event', listener);
  }

  recordAction(action) {
    const normalized = {
      action_id: action.action_id || `action-${this.actions.length + 1}`,
      type: action.type || 'unknown',
      selector: action.selector || null,
      value: action.value == null ? null : String(action.value),
      frame_id: action.frame_id || null,
      at: action.at || this.clock()
    };
    this.actions.push(normalized);
    this._publish('action.recorded', normalized);
    return normalized;
  }

  async captureDomSnapshot(actionId = null) {
    const snapshot = await this.debugger.sendCommand('DOMSnapshot.captureSnapshot', {
      computedStyles: [], includeDOMRects: true, includePaintOrder: true
    });
    return this._publish('dom.snapshot', {
      action_id: actionId,
      snapshot
    });
  }

  getEventStream() { return this.events.slice(); }

  _publish(type, payload) {
    const event = {
      schema_version: 'SITE_ANALYZER_EVENT_V1',
      sequence: this.events.length + 1,
      type,
      captured_at: this.clock(),
      action_id: payload && payload.action_id || this.actions.at(-1)?.action_id || null,
      payload: payload || {}
    };
    this.events.push(event);
    this.emit('analyzer-event', event);
    return event;
  }

  async _onMessage(_event, method, params = {}, sessionId = null) {
    try {
      const actionId = this.actions.at(-1)?.action_id || null;
      if (method === 'Network.requestWillBeSent') {
        this.requests.set(params.requestId, params);
        this._publish('network.request', { action_id: actionId, session_id: sessionId, ...params });
      } else if (method === 'Network.responseReceived') {
        this.responses.set(params.requestId, params);
        this._publish('network.response', { action_id: actionId, session_id: sessionId, ...params });
      } else if (method === 'Network.loadingFinished') {
        this._publish('network.loading_finished', { action_id: actionId, session_id: sessionId, ...params });
        await this._captureResponseBody(params.requestId, actionId, sessionId);
      } else if (method === 'Page.frameNavigated') {
        this._publish('page.frame_navigated', { action_id: actionId, session_id: sessionId, ...params });
      } else if (method === 'Page.lifecycleEvent') {
        this._publish('page.lifecycle', { action_id: actionId, session_id: sessionId, ...params });
      } else if (method === 'Runtime.consoleAPICalled') {
        this._publish('runtime.console', { action_id: actionId, session_id: sessionId, ...params });
      }
    } catch (error) {
      this._publish('observer.error', { method, message: error.message, code: error.code || null });
    }
  }

  async _captureResponseBody(requestId, actionId, sessionId) {
    const response = this.responses.get(requestId);
    if (!response) return;
    try {
      const result = await this.debugger.sendCommand('Network.getResponseBody', { requestId }, sessionId);
      const raw = result.base64Encoded ? Buffer.from(result.body || '', 'base64') : Buffer.from(result.body || '', 'utf8');
      const truncated = raw.length > this.maxBodyBytes;
      const body = raw.subarray(0, this.maxBodyBytes).toString('utf8');
      this._publish('network.response_body', {
        action_id: actionId,
        request_id: requestId,
        url: response.response?.url || this.requests.get(requestId)?.request?.url || null,
        method: this.requests.get(requestId)?.request?.method || null,
        status: response.response?.status || null,
        mime_type: response.response?.mimeType || null,
        body,
        body_bytes: raw.length,
        truncated,
        session_id: sessionId
      });
    } catch (error) {
      this._publish('network.response_body_error', { action_id: actionId, request_id: requestId, message: error.message });
    }
  }

  _onDetach(_event, reason) {
    this.started = false;
    this._publish('observer.detached', { reason });
  }
}

module.exports = { LiveCdpObserver };
