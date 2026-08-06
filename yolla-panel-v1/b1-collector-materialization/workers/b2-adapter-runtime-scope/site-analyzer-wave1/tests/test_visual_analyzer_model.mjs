import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AnalyzerWorkspaceModel } from "../src/analyzer_workspace_model.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, "fixtures/analyzer_event_stream.json"), "utf8"));
function built() {
  const model = new AnalyzerWorkspaceModel();
  fixture.a3_events.forEach((event) => model.ingestA3Event(event));
  model.ingestA4Candidates(fixture.a4_candidates);
  model.ingestA5Inference(fixture.a5_inference);
  model.setSampleRecords(fixture.sample_records);
  return model;
}

test("A3 events are ingested and ordered", () => { const m=built(); assert.deepEqual(m.state.a3Events.map(x=>x.event_id), ["EVT-001","EVT-005","EVT-006"]); });
test("A3 workflow steps are produced", () => { const m=built(); assert.equal(m.state.workflow.filter(x=>x.source==="A-3").length,3); });
test("A4 repeated region candidate is present", () => { const m=built(); assert.equal(m.state.repeatedRegions[0].selector,".listing-card"); });
test("A4 field candidates are at least five", () => { const m=built(); assert.ok(m.state.fieldCandidates.length>=5); });
test("A4 locator candidates are present", () => { const m=built(); assert.equal(m.state.locatorCandidates.length,2); });
test("A4 pagination candidate is preserved", () => { const m=built(); assert.equal(m.state.paginationCandidates[0].status,"CANDIDATE_ONLY_NOT_PROMOTED"); });
test("A5 DOM mode is visible", () => { const m=built(); assert.equal(m.state.modeDecision.mode,"DOM"); });
test("A5 API mode is supported", () => { const m=built(); m.ingestA5Inference({mode_decision:"API"}); assert.equal(m.state.modeDecision.mode,"API"); });
test("A5 HYBRID mode is supported", () => { const m=built(); m.ingestA5Inference({mode_decision:"HYBRID"}); assert.equal(m.state.modeDecision.mode,"HYBRID"); });
test("unsupported mode fails closed", () => { const m=built(); assert.throws(()=>m.ingestA5Inference({mode_decision:"MAGIC"}),/A5_MODE_UNSUPPORTED/); });
test("element selection stores selector and text", () => { const m=built(); m.selectElement({selector:".listing-title",tagName:"A",text:"한강뷰"}); assert.equal(m.state.selectedElement.selector,".listing-title"); });
test("picker state toggles", () => { const m=built(); m.setPickerEnabled(true); assert.equal(m.state.pickerEnabled,true); });
test("initial preview has three rows", () => { const m=built(); assert.equal(m.state.previewRows.length,3); });
test("initial preview has six fields", () => { const m=built(); assert.equal(m.state.previewColumns.length,6); });
test("field rename updates preview column", () => { const m=built(); m.renameField("field-title","매물명"); m.applyFields(); assert.equal(m.state.previewColumns[0].name,"매물명"); });
test("duplicate field rename is rejected", () => { const m=built(); assert.throws(()=>m.renameField("field-title","price"),/FIELD_NAME_DUPLICATE/); });
test("field remove updates preview", () => { const m=built(); m.removeField("field-agency"); m.applyFields(); assert.equal(m.state.previewColumns.length,5); });
test("field restore updates preview", () => { const m=built(); m.removeField("field-agency"); m.restoreField("field-agency"); m.applyFields(); assert.equal(m.state.previewColumns.length,6); });
test("apply revision is monotonic", () => { const m=built(); const before=m.state.appliedRevision; m.applyFields(); assert.ok(m.state.appliedRevision>before); });
test("preview preserves source pointer", () => { const m=built(); assert.equal(m.state.previewRows[0].__source.record_id,"L-001"); });
test("workflow includes structure inference", () => { const m=built(); assert.ok(m.state.workflow.some(x=>x.id==="infer:structure")); });
test("workflow includes mode inference", () => { const m=built(); assert.ok(m.state.workflow.some(x=>x.id==="infer:mode")); });
test("workflow includes preview apply", () => { const m=built(); assert.ok(m.state.workflow.some(x=>x.id==="preview:apply")); });
test("fixture authority binds A3 blob", () => { assert.equal(fixture.authority_refs.a3_fixture_trace_blob,"cd29511601f27a128ff88e2e3f265c116d99e4a0"); });
test("fixture authority binds A4 blob", () => { assert.equal(fixture.authority_refs.a4_locator_pagination_handoff_blob,"ccdb978a08fe94bf61df3477b1eef71f904c7ce4"); });
test("fixture authority binds A5 blob", () => { assert.equal(fixture.authority_refs.a5_source_endpoint_handoff_blob,"0fac8fac5069a013717ea74202d6d1741adfd966"); });
test("HTML exposes Live Browser Pane", () => { const html=fs.readFileSync(path.join(ROOT,"ui/index.html"),"utf8"); assert.match(html,/Live Browser Pane/); });
test("HTML exposes Smart Inspector", () => { const html=fs.readFileSync(path.join(ROOT,"ui/index.html"),"utf8"); assert.match(html,/Smart Inspector/); });
test("HTML exposes Workflow View", () => { const html=fs.readFileSync(path.join(ROOT,"ui/index.html"),"utf8"); assert.match(html,/Workflow View/); });
test("HTML exposes Data Preview", () => { const html=fs.readFileSync(path.join(ROOT,"ui/index.html"),"utf8"); assert.match(html,/Data Preview/); });
