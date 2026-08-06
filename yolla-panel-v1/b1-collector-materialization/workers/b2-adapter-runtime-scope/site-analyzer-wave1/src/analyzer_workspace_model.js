export const SUPPORTED_MODES = Object.freeze(["DOM", "API", "HYBRID"]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeCandidate(candidate, kind) {
  if (!candidate || typeof candidate !== "object") {
    throw new TypeError(`${kind.toUpperCase()}_CANDIDATE_INVALID`);
  }
  const id = String(candidate.id || candidate.candidate_id || "").trim();
  if (!id) throw new Error(`${kind.toUpperCase()}_CANDIDATE_ID_REQUIRED`);
  return {
    ...clone(candidate),
    id,
    kind,
    confidence: Number.isFinite(Number(candidate.confidence))
      ? Number(candidate.confidence)
      : 0,
  };
}

export class AnalyzerWorkspaceModel {
  constructor(initial = {}) {
    this.state = {
      sessionId: initial.sessionId || "B2-WAVE1-LOCAL-SESSION",
      browser: {
        url: initial.url || "about:blank",
        title: "",
        loading: false,
        connected: false,
      },
      pickerEnabled: false,
      selectedElement: null,
      a3Events: [],
      repeatedRegions: [],
      fieldCandidates: [],
      locatorCandidates: [],
      paginationCandidates: [],
      endpointGroups: [],
      schemaCandidates: [],
      modeDecision: {
        mode: "DOM",
        confidence: 0,
        reason: "NO_INFERENCE_RECEIVED",
      },
      workflow: [],
      sampleRecords: [],
      previewColumns: [],
      previewRows: [],
      appliedRevision: 0,
      lastError: null,
    };
  }

  setBrowserState(patch) {
    this.state.browser = { ...this.state.browser, ...clone(patch) };
    return this.snapshot();
  }

  setPickerEnabled(enabled) {
    this.state.pickerEnabled = Boolean(enabled);
    return this.snapshot();
  }

  ingestA3Event(event) {
    if (!event || typeof event !== "object") throw new TypeError("A3_EVENT_INVALID");
    const normalized = {
      event_id: String(event.event_id || event.id || `A3-${this.state.a3Events.length + 1}`),
      sequence: Number(event.sequence || this.state.a3Events.length + 1),
      type: String(event.classification?.type || event.event_type || event.type || "UNKNOWN"),
      confidence: Number(event.classification?.confidence ?? event.confidence ?? 0),
      method: String(event.request?.method || event.method || "UNKNOWN"),
      resource_type: String(event.request?.resource_type || event.resource_type || "UNKNOWN"),
      url_pattern: String(event.request?.url_pattern || event.url || ""),
      status: event.response?.status ?? event.status ?? null,
      content_type: String(event.response?.content_type || event.content_type || ""),
      response_size_bytes: Number(event.response?.size_bytes ?? event.response_size_bytes ?? 0),
      source: "A-3",
      raw: clone(event),
    };
    const existing = this.state.a3Events.findIndex((item) => item.event_id === normalized.event_id);
    if (existing >= 0) this.state.a3Events[existing] = normalized;
    else this.state.a3Events.push(normalized);
    this.state.a3Events.sort((a, b) => a.sequence - b.sequence);
    this.upsertWorkflow({
      id: `observe:${normalized.event_id}`,
      type: "OBSERVE",
      label: `${normalized.type} ${normalized.method} ${normalized.resource_type}`,
      status: "DONE",
      source: "A-3",
    });
    return this.snapshot();
  }

  ingestA4Candidates(payload) {
    if (!payload || typeof payload !== "object") throw new TypeError("A4_CANDIDATE_PAYLOAD_INVALID");
    this.state.repeatedRegions = (payload.repeated_regions || payload.repeatedRegions || [])
      .map((item) => normalizeCandidate(item, "repeat"));
    this.state.fieldCandidates = (payload.field_candidates || payload.fieldCandidates || [])
      .map((item) => ({
        ...normalizeCandidate(item, "field"),
        name: String(item.name || item.field_name || item.id || "field"),
        originalName: String(item.name || item.field_name || item.id || "field"),
        removed: Boolean(item.removed),
        applied: false,
      }));
    this.state.locatorCandidates = (payload.locator_candidates || payload.locatorCandidates || [])
      .map((item) => normalizeCandidate(item, "locator"));
    this.state.paginationCandidates = (payload.pagination_candidates || payload.paginationCandidates || [])
      .map((item) => normalizeCandidate(item, "pagination"));
    this.upsertWorkflow({
      id: "infer:structure",
      type: "INFER_STRUCTURE",
      label: `반복영역 ${this.state.repeatedRegions.length} · 필드 ${this.state.fieldCandidates.length} · Pagination ${this.state.paginationCandidates.length}`,
      status: "DONE",
      source: "A-4",
    });
    this.applyFields();
    return this.snapshot();
  }

  ingestA5Inference(payload) {
    if (!payload || typeof payload !== "object") throw new TypeError("A5_INFERENCE_PAYLOAD_INVALID");
    const mode = String(payload.mode_decision || payload.extraction_mode || payload.mode || "DOM").toUpperCase();
    if (!SUPPORTED_MODES.includes(mode)) throw new Error("A5_MODE_UNSUPPORTED");
    this.state.modeDecision = {
      mode,
      confidence: Number(payload.confidence ?? payload.mode_confidence ?? 0),
      reason: String(payload.reason || payload.decision_reason || "A5_INFERENCE"),
      evidence: clone(payload.evidence || {}),
      source: "A-5",
    };
    this.state.endpointGroups = clone(payload.endpoint_groups || payload.endpointGroups || []);
    this.state.schemaCandidates = clone(payload.schema_candidates || payload.schemaCandidates || []);
    this.upsertWorkflow({
      id: "infer:mode",
      type: "INFER_MODE",
      label: `${mode} 추출 모드`,
      status: "DONE",
      source: "A-5",
    });
    return this.snapshot();
  }

  setSampleRecords(records) {
    if (!Array.isArray(records)) throw new TypeError("SAMPLE_RECORDS_MUST_BE_ARRAY");
    this.state.sampleRecords = clone(records);
    this.applyFields();
    return this.snapshot();
  }

  selectElement(element) {
    if (!element || typeof element !== "object") throw new TypeError("ELEMENT_SELECTION_INVALID");
    const selector = String(element.selector || "").trim();
    if (!selector) throw new Error("ELEMENT_SELECTOR_REQUIRED");
    this.state.selectedElement = {
      selector,
      tagName: String(element.tagName || element.tag_name || "").toLowerCase(),
      text: String(element.text || element.textContent || "").trim().slice(0, 500),
      attributes: clone(element.attributes || {}),
      candidateId: element.candidateId || null,
      selectedAt: element.selectedAt || new Date().toISOString(),
    };
    this.upsertWorkflow({
      id: "select:element",
      type: "ELEMENT_SELECTION",
      label: selector,
      status: "DONE",
      source: "B-2",
    });
    return this.snapshot();
  }

  renameField(fieldId, nextName) {
    const field = this.state.fieldCandidates.find((item) => item.id === fieldId);
    if (!field) throw new Error("FIELD_NOT_FOUND");
    const normalized = String(nextName || "").trim();
    if (!normalized) throw new Error("FIELD_NAME_REQUIRED");
    if (this.state.fieldCandidates.some((item) => item.id !== fieldId && !item.removed && item.name === normalized)) {
      throw new Error("FIELD_NAME_DUPLICATE");
    }
    field.name = normalized;
    field.applied = false;
    return this.snapshot();
  }

  removeField(fieldId) {
    const field = this.state.fieldCandidates.find((item) => item.id === fieldId);
    if (!field) throw new Error("FIELD_NOT_FOUND");
    field.removed = true;
    field.applied = false;
    return this.snapshot();
  }

  restoreField(fieldId) {
    const field = this.state.fieldCandidates.find((item) => item.id === fieldId);
    if (!field) throw new Error("FIELD_NOT_FOUND");
    field.removed = false;
    field.applied = false;
    return this.snapshot();
  }

  applyFields() {
    const activeFields = this.state.fieldCandidates.filter((field) => !field.removed);
    for (const field of this.state.fieldCandidates) field.applied = !field.removed;
    this.state.previewColumns = activeFields.map((field) => ({
      id: field.id,
      name: field.name,
      sourceKey: field.source_key || field.sourceKey || field.originalName,
      selector: field.selector || "",
      mode: field.mode || this.state.modeDecision.mode,
    }));
    this.state.previewRows = this.state.sampleRecords.map((record, rowIndex) => {
      const shaped = { __row: rowIndex + 1, __source: record.__source || null };
      for (const column of this.state.previewColumns) {
        shaped[column.name] = record[column.sourceKey] ?? record[column.id] ?? null;
      }
      return shaped;
    });
    this.state.appliedRevision += 1;
    this.upsertWorkflow({
      id: "preview:apply",
      type: "APPLY_FIELDS",
      label: `필드 ${activeFields.length}개 적용 · 레코드 ${this.state.previewRows.length}개`,
      status: "DONE",
      source: "B-2",
    });
    return this.snapshot();
  }

  upsertWorkflow(step) {
    const index = this.state.workflow.findIndex((item) => item.id === step.id);
    if (index >= 0) this.state.workflow[index] = { ...this.state.workflow[index], ...clone(step) };
    else this.state.workflow.push(clone(step));
  }

  snapshot() {
    return clone(this.state);
  }
}
