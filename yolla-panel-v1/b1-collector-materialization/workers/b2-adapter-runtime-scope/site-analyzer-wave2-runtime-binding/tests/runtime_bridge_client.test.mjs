import test from "node:test";
import assert from "node:assert/strict";
import { AnalyzerRuntimeBridgeClient } from "../src/runtime_bridge_client.js";

class FakeWindow extends EventTarget {
  constructor() {
    super();
    this.CustomEvent = class CustomEvent extends Event {
      constructor(type, options) { super(type); this.detail = options.detail; }
    };
    this.sent = [];
    this.analyzerRuntimeBridge = {
      handlers: new Map(),
      on: (topic, handler) => this.analyzerRuntimeBridge.handlers.set(topic, handler),
      emit: (topic, payload) => this.sent.push([topic, payload]),
    };
  }
}

test("preload bridge connect", () => {
  const window = new FakeWindow();
  const client = new AnalyzerRuntimeBridgeClient(window);
  client.connect();
  assert.equal(client.state.hostConnected, true);
});

test("preload receives event", () => {
  const window = new FakeWindow();
  const client = new AnalyzerRuntimeBridgeClient(window);
  let received = 0;
  client.on("analyzer:a3-event", () => received++);
  client.connect();
  window.analyzerRuntimeBridge.handlers.get("analyzer:a3-event")({ event_id: "1" }, { sequence: 1 });
  assert.equal(received, 1);
});

test("publish uses preload", () => {
  const window = new FakeWindow();
  const client = new AnalyzerRuntimeBridgeClient(window);
  client.connect();
  client.publish("analyzer:b2-test", { x: 1 });
  assert.ok(window.sent.some((entry) => entry[0] === "analyzer:b2-test"));
});

test("duplicate sequence rejected", () => {
  const window = new FakeWindow();
  const client = new AnalyzerRuntimeBridgeClient(window);
  client.connect();
  const handler = window.analyzerRuntimeBridge.handlers.get("analyzer:a3-event");
  handler({}, { sequence: 1, sessionId: "s" });
  handler({}, { sequence: 1, sessionId: "s" });
  assert.equal(client.state.duplicateCount, 1);
});

test("capabilities include workflow", () => {
  const window = new FakeWindow();
  const client = new AnalyzerRuntimeBridgeClient(window);
  assert.equal(client.capabilities().workflowEditor, true);
});
