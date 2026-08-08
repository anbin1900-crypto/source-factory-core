import test from "node:test";
import assert from "node:assert/strict";
import { LiveAnalyzerWorkspaceModel } from "../src/live_analyzer_workspace_model.js";

const createModel = () => new LiveAnalyzerWorkspaceModel();

test("runtime state connects", () => {
  const model = createModel();
  model.setRuntimeState({ hostConnected: true });
  assert.equal(model.state.runtime.hostConnected, true);
});

test("records live message", () => {
  const model = createModel();
  model.recordRuntimeMessage("analyzer:a3-event", { sequence: 4 });
  assert.equal(model.state.runtime.lastSequence, 4);
});

test("A3 live event", () => {
  const model = createModel();
  model.ingestA3Event({ event_id: "E1", sequence: 1, classification: { type: "LIST" }, request: { method: "GET", resource_type: "XHR", url_pattern: "/api" } });
  assert.equal(model.state.a3Events.length, 1);
});

test("A4 candidates", () => {
  const model = createModel();
  model.ingestA4Candidates({
    repeated_regions: [{ id: "r", selector: ".card" }],
    field_candidates: [{ id: "f", name: "title", selector: ".title" }],
    locator_candidates: [{ id: "l", selector: ".card" }],
    pagination_candidates: [{ id: "p", selector: ".next" }],
  });
  assert.equal(model.state.fieldCandidates.length, 1);
});

test("A5 hybrid mode", () => {
  const model = createModel();
  model.ingestA5Inference({ mode_decision: "HYBRID" });
  assert.equal(model.state.modeDecision.mode, "HYBRID");
});

test("B3 workflow live", () => {
  const model = createModel();
  model.ingestB3Workflow({ steps: [{ id: "s1", action: "click" }, { id: "s2", action: "scroll" }] });
  assert.equal(model.state.workflow.filter((step) => step.source === "B-3").length, 2);
});

test("B3 workflow edit", () => {
  const model = createModel();
  model.ingestB3Workflow({ steps: [{ id: "s1", label: "old" }] });
  model.updateWorkflowStep("s1", { label: "new" });
  assert.equal(model.state.workflow.find((step) => step.id === "s1").label, "new");
});

test("B3 workflow reorder", () => {
  const model = createModel();
  model.ingestB3Workflow({ steps: [{ id: "s1" }, { id: "s2" }] });
  model.moveWorkflowStep("s2", "up");
  assert.equal(model.state.workflow.filter((step) => step.source === "B-3")[0].id, "s2");
});

test("B3 workflow remove", () => {
  const model = createModel();
  model.ingestB3Workflow({ steps: [{ id: "s1" }] });
  model.removeWorkflowStep("s1");
  assert.equal(model.state.workflow.length, 0);
});

test("B5 preview 10", () => {
  const model = createModel();
  model.ingestB5Preview({ columns: [{ id: "f", name: "title", source_key: "title" }], records: Array.from({ length: 10 }, (_, index) => ({ title: `T${index}` })) });
  assert.equal(model.state.previewRows.length, 10);
});

test("field rename", () => {
  const model = createModel();
  model.ingestB5Preview({ columns: [{ id: "f", name: "title", source_key: "title" }], records: [{ title: "A" }] });
  model.renameField("f", "name");
  model.applyFields();
  assert.equal(model.state.previewRows[0].name, "A");
});

test("field remove", () => {
  const model = createModel();
  model.ingestB5Preview({ columns: [{ id: "f", name: "title", source_key: "title" }], records: [{ title: "A" }] });
  model.removeField("f");
  model.applyFields();
  assert.equal(model.state.previewColumns.length, 0);
});

test("element selection", () => {
  const model = createModel();
  model.selectElement({ selector: ".title", tagName: "A", text: "A" });
  assert.equal(model.state.selectedElement.selector, ".title");
});

test("API mode", () => {
  const model = createModel();
  model.ingestA5Inference({ mode_decision: "API" });
  assert.equal(model.state.modeDecision.mode, "API");
});

test("unsupported mode rejected", () => assert.throws(() => createModel().ingestA5Inference({ mode_decision: "BAD" }), /A5_MODE_UNSUPPORTED/));
