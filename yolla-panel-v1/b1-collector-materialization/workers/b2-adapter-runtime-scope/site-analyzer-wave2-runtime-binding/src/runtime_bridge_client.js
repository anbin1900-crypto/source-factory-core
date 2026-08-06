const DEFAULT_TOPICS = Object.freeze([
  "analyzer:runtime-hello",
  "analyzer:browser-state",
  "analyzer:a3-event",
  "analyzer:a4-candidates",
  "analyzer:a4-highlight",
  "analyzer:a5-inference",
  "analyzer:b3-workflow",
  "analyzer:b5-preview",
  "analyzer:element-selected",
]);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export class AnalyzerRuntimeBridgeClient {
  constructor(targetWindow = globalThis.window, options = {}) {
    if (!targetWindow) throw new Error("RUNTIME_WINDOW_REQUIRED");
    this.window = targetWindow;
    this.channelName = options.channelName || "yolla-analyzer-runtime-v2";
    this.sessionId = options.sessionId || `B2-${Date.now()}`;
    this.handlers = new Map();
    this.transports = [];
    this.sentKeys = new Set();
    this.receivedKeys = new Set();
    this.sequence = 0;
    this.state = {
      transportReady: false,
      hostConnected: false,
      transportNames: [],
      inboundCount: 0,
      outboundCount: 0,
      duplicateCount: 0,
      lastTopic: null,
      lastSequence: 0,
      sessionId: this.sessionId,
    };
    this._windowMessageHandler = (event) => this._handleWindowMessage(event);
    this._customEventHandler = (event) => this._receive(event.detail, "CUSTOM_EVENT");
  }

  on(topic, handler) {
    if (typeof handler !== "function") throw new TypeError("RUNTIME_HANDLER_REQUIRED");
    const list = this.handlers.get(topic) || new Set();
    list.add(handler);
    this.handlers.set(topic, list);
    return () => list.delete(handler);
  }

  _dispatch(topic, payload, envelope) {
    for (const handler of this.handlers.get(topic) || []) handler(clone(payload), clone(envelope));
    for (const handler of this.handlers.get("*") || []) handler(topic, clone(payload), clone(envelope));
  }

  _normalize(message) {
    if (!message || typeof message !== "object") return null;
    if (message.type === "YOLLA_ANALYZER_RUNTIME_PORT") return null;
    const topic = String(message.topic || message.channel || message.event || "").trim();
    if (!topic.startsWith("analyzer:")) return null;
    return {
      topic,
      payload: clone(message.payload ?? message.data ?? {}),
      sequence: Number(message.sequence || message.seq || 0),
      sessionId: String(message.sessionId || message.session_id || "runtime"),
      source: String(message.source || "RUNTIME"),
      timestamp: message.timestamp || new Date().toISOString(),
    };
  }

  _receive(message, transport) {
    const envelope = this._normalize(message);
    if (!envelope) return false;
    const key = `${envelope.sessionId}:${envelope.sequence}:${envelope.topic}`;
    if (envelope.sequence > 0 && this.receivedKeys.has(key)) {
      this.state.duplicateCount += 1;
      return false;
    }
    if (envelope.sequence > 0) this.receivedKeys.add(key);
    this.state.hostConnected = true;
    this.state.inboundCount += 1;
    this.state.lastTopic = envelope.topic;
    this.state.lastSequence = Math.max(this.state.lastSequence, envelope.sequence || 0);
    this.state.lastTransport = transport;
    this._dispatch(envelope.topic, envelope.payload, envelope);
    return true;
  }

  _registerTransport(name, send) {
    if (this.transports.some((item) => item.name === name)) return;
    this.transports.push({ name, send });
    this.state.transportReady = true;
    this.state.transportNames = this.transports.map((item) => item.name);
  }

  _bindPreloadBridge(bridge, name) {
    if (!bridge || typeof bridge !== "object") return false;
    let bound = false;
    if (typeof bridge.on === "function") {
      for (const topic of DEFAULT_TOPICS) {
        bridge.on(topic, (payload, envelope) => this._receive({ topic, payload, ...(envelope || {}) }, name));
      }
      bound = true;
    }
    const specialized = [
      ["onA3Event", "analyzer:a3-event"],
      ["onA4Candidates", "analyzer:a4-candidates"],
      ["onA4Highlight", "analyzer:a4-highlight"],
      ["onA5Inference", "analyzer:a5-inference"],
      ["onB3Workflow", "analyzer:b3-workflow"],
      ["onB5Preview", "analyzer:b5-preview"],
      ["onBrowserState", "analyzer:browser-state"],
      ["onElementSelected", "analyzer:element-selected"],
    ];
    for (const [method, topic] of specialized) {
      if (typeof bridge[method] === "function") {
        bridge[method]((payload, envelope) => this._receive({ topic, payload, ...(envelope || {}) }, name));
        bound = true;
      }
    }
    const send = (message) => {
      if (typeof bridge.emit === "function") bridge.emit(message.topic, message.payload, message);
      else if (typeof bridge.publish === "function") bridge.publish(message.topic, message.payload, message);
      else if (typeof bridge.send === "function") bridge.send(message);
      else return false;
      return true;
    };
    if (bound || ["emit", "publish", "send"].some((method) => typeof bridge[method] === "function")) {
      this._registerTransport(name, send);
      this.state.hostConnected = true;
      return true;
    }
    return false;
  }

  _emitSynthesized(topic, payload, source = "ANALYZER_CORE") {
    return this._receive({
      topic,
      payload,
      sequence: ++this.syntheticSequence,
      sessionId: `${this.sessionId}:core`,
      source,
      timestamp: new Date().toISOString(),
    }, "ANALYZER_API");
  }

  _consumeAnalyzerState(state) {
    if (!state || typeof state !== "object") return false;
    this._emitSynthesized("analyzer:core-state", state);
    const result = Array.isArray(state.runHistory) ? state.runHistory.at(-1) : null;
    if (!result) return true;
    this._emitSynthesized("analyzer:browser-state", {
      url: result.site?.url || "about:blank",
      title: result.site?.title || result.site?.id || "Analyzer Runtime",
      html: result.capture?.domSnapshots?.[0]?.html,
      connected: true,
    });
    for (const [index, event] of (result.capture?.networkEvents || []).entries()) {
      this._emitSynthesized("analyzer:a3-event", {
        event_id: event.requestId || `CORE-NET-${index + 1}`,
        sequence: index + 1,
        classification: { type: event.classification || event.type || "NETWORK", confidence: 1 },
        request: {
          method: event.method || "GET",
          resource_type: event.resourceType || event.resource_type || "NETWORK",
          url_pattern: event.url || "",
        },
        response: {
          status: event.status ?? null,
          content_type: event.mimeType || event.content_type || "",
          size_bytes: event.encodedDataLength || event.size_bytes || 0,
        },
        source: "A-2_ANALYZER_CORE",
      });
    }
    const structure = result.structure || {};
    this._emitSynthesized("analyzer:a4-candidates", {
      repeated_regions: (structure.repeatedRegions || []).map((item, index) => ({
        id: item.id || `core-repeat-${index + 1}`,
        selector: item.selector || item.locator,
        confidence: item.confidence ?? 1,
        count: item.count,
      })).filter((item) => item.selector),
      field_candidates: (structure.fields || []).map((item, index) => ({
        id: item.id || `core-field-${index + 1}`,
        name: item.name,
        source_key: item.name,
        selector: item.selector || item.locator,
        confidence: item.confidence ?? 1,
      })).filter((item) => item.selector),
      locator_candidates: (structure.locators || []).flatMap((item, index) =>
        (item.candidates || [item.locator]).filter(Boolean).map((selector, candidateIndex) => ({
          id: `${item.fieldId || `core-locator-${index + 1}`}-${candidateIndex + 1}`,
          selector,
          confidence: 1,
        }))),
      pagination_candidates: structure.pagination && structure.pagination.mode !== "EXPLICIT_NONE"
        ? [{ id: "core-pagination", ...structure.pagination }]
        : [],
      highlight_payload: structure.highlightPayload || [],
    });
    const endpoint = result.endpoint || {};
    this._emitSynthesized("analyzer:a5-inference", {
      mode_decision: endpoint.extractionMode || endpoint.mode || "DOM",
      confidence: 1,
      endpoint_groups: endpoint.endpointGroups || [],
      schema_candidates: endpoint.responseSchemas || [],
      identifier_relations: endpoint.identifierRelations || [],
    });
    const steps = result.adapter?.recipe?.actions || result.recipe?.steps || [];
    if (Array.isArray(steps)) this._emitSynthesized("analyzer:b3-workflow", { steps });
    const preview = result.preview || {};
    if (Array.isArray(preview.records)) {
      const columns = (preview.columns || Object.keys(preview.records[0] || {}))
        .filter((name) => name !== "sourceElement")
        .map((name, index) => ({ id: `core-preview-${index + 1}`, name, source_key: name }));
      this._emitSynthesized("analyzer:b5-preview", { columns, records: preview.records });
    }
    return true;
  }

  _bindAnalyzerApi(api) {
    if (!api || typeof api !== "object") return false;
    let bound = false;
    this.syntheticSequence = this.syntheticSequence || 0;
    if (typeof api.onProgress === "function") {
      api.onProgress((progress) => {
        this._emitSynthesized("analyzer:core-progress", progress);
        if (progress?.stage === "COMPLETED" && typeof api.getState === "function") {
          Promise.resolve(api.getState()).then((state) => this._consumeAnalyzerState(state)).catch(() => {});
        }
      });
      bound = true;
    }
    if (typeof api.getState === "function") {
      Promise.resolve(api.getState()).then((state) => this._consumeAnalyzerState(state)).catch(() => {});
      bound = true;
    }
    if (bound) {
      this._registerTransport("ANALYZER_API", () => false);
      this.state.hostConnected = true;
    }
    return bound;
  }

  _bindPort(port) {
    if (!port) return false;
    port.onmessage = (event) => this._receive(event.data, "MESSAGE_PORT");
    port.start?.();
    this._registerTransport("MESSAGE_PORT", (message) => { port.postMessage(message); return true; });
    this.state.hostConnected = true;
    return true;
  }

  _handleWindowMessage(event) {
    if (event?.data?.type === "YOLLA_ANALYZER_RUNTIME_PORT" && event.ports?.[0]) {
      this._bindPort(event.ports[0]);
      this.publish("analyzer:b2-runtime-ready", this.capabilities());
      return;
    }
    this._receive(event?.data, "WINDOW_MESSAGE");
  }

  connect() {
    this._bindAnalyzerApi(this.window.analyzerAPI);
    this._bindPreloadBridge(this.window.analyzerRuntimeBridge, "ELECTRON_RUNTIME_BRIDGE");
    if (this.window.analyzerBridge !== this.window.analyzerRuntimeBridge) {
      this._bindPreloadBridge(this.window.analyzerBridge, "LEGACY_ANALYZER_BRIDGE");
    }
    this.window.addEventListener("message", this._windowMessageHandler);
    this.window.addEventListener("yolla-analyzer-runtime", this._customEventHandler);
    if (typeof this.window.BroadcastChannel === "function") {
      const channel = new this.window.BroadcastChannel(this.channelName);
      channel.onmessage = (event) => this._receive(event.data, "BROADCAST_CHANNEL");
      this._registerTransport("BROADCAST_CHANNEL", (message) => { channel.postMessage(message); return true; });
      this.broadcastChannel = channel;
    }
    this._registerTransport("CUSTOM_EVENT", (message) => {
      this.window.dispatchEvent(new this.window.CustomEvent("yolla-analyzer-ui-outbound", { detail: message }));
      return true;
    });
    this.publish("analyzer:b2-runtime-ready", this.capabilities());
    return this.snapshot();
  }

  publish(topic, payload = {}) {
    if (!String(topic).startsWith("analyzer:")) throw new Error("RUNTIME_TOPIC_INVALID");
    const message = {
      topic,
      payload: clone(payload),
      sequence: ++this.sequence,
      sessionId: this.sessionId,
      source: "B-2",
      timestamp: new Date().toISOString(),
    };
    let sent = 0;
    for (const transport of this.transports) {
      try { if (transport.send(message) !== false) sent += 1; } catch { /* next transport */ }
    }
    this.state.outboundCount += 1;
    this.state.lastOutboundTopic = topic;
    return { ...clone(message), transportCount: sent };
  }

  capabilities() {
    return {
      worker: "B-2",
      version: "WAVE2_RUNTIME_BINDING_V1",
      topics: DEFAULT_TOPICS,
      elementPicker: true,
      candidateHighlight: true,
      workflowEditor: true,
      livePreview: true,
    };
  }

  snapshot() { return clone(this.state); }

  close() {
    this.window.removeEventListener("message", this._windowMessageHandler);
    this.window.removeEventListener("yolla-analyzer-runtime", this._customEventHandler);
    this.broadcastChannel?.close?.();
  }
}
