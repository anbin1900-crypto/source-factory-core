import { AnalyzerWorkspaceModel } from "../../site-analyzer-wave1/src/analyzer_workspace_model.js";

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export class LiveAnalyzerWorkspaceModel extends AnalyzerWorkspaceModel {
  constructor(initial = {}) {
    super({ ...initial, sessionId: initial.sessionId || "B2-WAVE2-LIVE" });
    this.state.runtime = {
      transportReady: false,
      hostConnected: false,
      transportNames: [],
      inboundCount: 0,
      outboundCount: 0,
      lastTopic: null,
      lastSequence: 0,
      liveDataReceived: false,
    };
  }

  setRuntimeState(patch) {
    this.state.runtime = { ...this.state.runtime, ...clone(patch) };
    return this.snapshot();
  }

  recordRuntimeMessage(topic, envelope = {}) {
    this.state.runtime.hostConnected = true;
    this.state.runtime.liveDataReceived = true;
    this.state.runtime.inboundCount += 1;
    this.state.runtime.lastTopic = topic;
    this.state.runtime.lastSequence = Math.max(
      this.state.runtime.lastSequence,
      Number(envelope.sequence || 0),
    );
    return this.snapshot();
  }

  ingestB3Workflow(payload) {
    const steps = payload?.steps || payload?.workflow || payload?.recipe?.steps || payload?.actions;
    if (!Array.isArray(steps)) throw new TypeError("B3_WORKFLOW_STEPS_REQUIRED");
    this.state.workflow = this.state.workflow.filter((step) => step.source !== "B-3");
    steps.forEach((step, index) => this.upsertWorkflow({
      id: String(step.id || step.step_id || `b3:${index + 1}`),
      type: String(step.type || step.action || "ACTION"),
      label: String(step.label || step.name || step.action || `Step ${index + 1}`),
      status: String(step.status || "READY"),
      source: "B-3",
      editable: true,
      order: index + 1,
      enabled: step.enabled !== false,
      locator: step.locator || step.selector || null,
    }));
    return this.snapshot();
  }

  updateWorkflowStep(stepId, patch) {
    const step = this.state.workflow.find((item) => item.id === stepId);
    if (!step) throw new Error("WORKFLOW_STEP_NOT_FOUND");
    if (step.source !== "B-3") throw new Error("WORKFLOW_STEP_NOT_EDITABLE");
    Object.assign(step, clone(patch));
    return this.snapshot();
  }

  moveWorkflowStep(stepId, direction) {
    const editable = this.state.workflow.filter((step) => step.source === "B-3");
    const current = editable.findIndex((step) => step.id === stepId);
    if (current < 0) throw new Error("WORKFLOW_STEP_NOT_FOUND");
    const target = direction === "up" ? current - 1 : current + 1;
    if (target < 0 || target >= editable.length) return this.snapshot();
    const a = this.state.workflow.indexOf(editable[current]);
    const b = this.state.workflow.indexOf(editable[target]);
    [this.state.workflow[a], this.state.workflow[b]] = [this.state.workflow[b], this.state.workflow[a]];
    return this.snapshot();
  }

  removeWorkflowStep(stepId) {
    const before = this.state.workflow.length;
    this.state.workflow = this.state.workflow.filter((step) => step.id !== stepId);
    if (this.state.workflow.length === before) throw new Error("WORKFLOW_STEP_NOT_FOUND");
    return this.snapshot();
  }

  ingestB5Preview(payload) {
    const records = payload?.records || payload?.rows || payload?.preview_rows;
    if (!Array.isArray(records)) throw new TypeError("B5_PREVIEW_RECORDS_REQUIRED");
    const columns = payload?.columns || payload?.fields || payload?.preview_columns;
    if (Array.isArray(columns) && columns.length) {
      this.state.fieldCandidates = columns.map((column, index) => ({
        id: String(column.id || column.field_id || `b5-field-${index + 1}`),
        kind: "field",
        name: String(column.name || column.label || column.key || `field_${index + 1}`),
        originalName: String(column.name || column.label || column.key || `field_${index + 1}`),
        source_key: String(column.source_key || column.key || column.name || `field_${index + 1}`),
        selector: String(column.selector || ""),
        confidence: Number(column.confidence ?? 1),
        mode: String(column.mode || this.state.modeDecision.mode),
        removed: Boolean(column.removed),
        applied: false,
      }));
    }
    this.state.sampleRecords = clone(records);
    this.applyFields();
    this.upsertWorkflow({
      id: "preview:live",
      type: "LIVE_PREVIEW",
      label: `B-5 Live Preview ${this.state.previewRows.length}건`,
      status: "DONE",
      source: "B-5",
      editable: false,
    });
    return this.snapshot();
  }
}
