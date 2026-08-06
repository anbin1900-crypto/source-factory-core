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

test("A2 analyzerAPI progress bridge binds", async () => {
  const window = new FakeWindow();
  delete window.analyzerRuntimeBridge;
  let progressHandler;
  window.analyzerAPI = {
    onProgress: (handler) => { progressHandler = handler; },
    getState: async () => ({ schemaVersion: "ANALYZER_SHARED_STATE_V1", runHistory: [] }),
  };
  const client = new AnalyzerRuntimeBridgeClient(window);
  let received = 0;
  client.on("analyzer:core-progress", () => received++);
  client.connect();
  progressHandler({ stage: "LIVE_OBSERVATION", progress: 20 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(client.state.transportNames.includes("ANALYZER_API"), true);
  assert.equal(received, 1);
});

test("A2 analyzer state synthesizes live module topics", async () => {
  const window = new FakeWindow();
  delete window.analyzerRuntimeBridge;
  window.analyzerAPI = {
    onProgress: () => {},
    getState: async () => ({
      runHistory: [{
        site: { url: "runtime://site", title: "Site" },
        capture: {
          networkEvents: [{ requestId: "r1", method: "GET", url: "/api", status: 200, mimeType: "application/json" }],
          domSnapshots: [{ html: "<article data-record><b data-field=\"title\">A</b></article>" }],
        },
        structure: {
          repeatedRegions: [{ locator: "article[data-record]", count: 1 }],
          fields: [{ id: "f1", name: "title", locator: "[data-field=title]" }],
          locators: [],
          pagination: { mode: "EXPLICIT_NONE" },
        },
        endpoint: { extractionMode: "HYBRID", endpointGroups: [{ id: "api" }], responseSchemas: [] },
        adapter: { recipe: { actions: [{ id: "s1", type: "click" }] } },
        preview: { columns: ["title"], records: [{ title: "A" }] },
      }],
    }),
  };
  const client = new AnalyzerRuntimeBridgeClient(window);
  const topics = [];
  client.on("*", (topic) => topics.push(topic));
  client.connect();
  await new Promise((resolve) => setTimeout(resolve, 5));
  for (const topic of ["analyzer:a3-event", "analyzer:a4-candidates", "analyzer:a5-inference", "analyzer:b3-workflow", "analyzer:b5-preview"]) {
    assert.equal(topics.includes(topic), true, topic);
  }
});
