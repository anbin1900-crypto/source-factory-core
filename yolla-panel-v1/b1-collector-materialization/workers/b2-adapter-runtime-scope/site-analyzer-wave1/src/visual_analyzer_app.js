import { AnalyzerWorkspaceModel } from "./analyzer_workspace_model.js";

const model = new AnalyzerWorkspaceModel({ url: "../fixtures/listing_page.html" });
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const refs = {
  frame: $("#live-browser-frame"),
  browserUrl: $("#browser-url"),
  openUrl: $("#open-url"),
  pickerToggle: $("#picker-toggle"),
  modeBadge: $("#mode-badge"),
  selectionCard: $("#selection-card"),
  candidateList: $("#candidate-list"),
  fieldEditor: $("#field-editor"),
  applyFields: $("#apply-fields"),
  workflowList: $("#workflow-list"),
  previewTable: $("#preview-table"),
  previewStatus: $("#preview-status"),
};

function cssEscape(value) {
  return globalThis.CSS?.escape ? CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function selectorFor(element) {
  if (element.id) return `#${cssEscape(element.id)}`;
  const classes = Array.from(element.classList || []).filter((name) => !name.startsWith("va-"));
  if (classes.length) return `${element.tagName.toLowerCase()}.${classes.map(cssEscape).join(".")}`;
  const parent = element.parentElement;
  if (!parent) return element.tagName.toLowerCase();
  const siblings = Array.from(parent.children).filter((item) => item.tagName === element.tagName);
  const index = siblings.indexOf(element) + 1;
  return `${selectorFor(parent)} > ${element.tagName.toLowerCase()}:nth-of-type(${index})`;
}

function attributesOf(element) {
  return Object.fromEntries(Array.from(element.attributes || []).map((attr) => [attr.name, attr.value]));
}

function installHighlightStyle(doc) {
  if (doc.getElementById("va-highlight-style")) return;
  const style = doc.createElement("style");
  style.id = "va-highlight-style";
  style.textContent = `[data-va-highlight~="repeat"]{outline:3px solid #7c3aed!important;outline-offset:2px}[data-va-highlight~="field"]{box-shadow:inset 0 0 0 2px #0ea5e9!important}[data-va-highlight~="pagination"]{outline:3px dashed #f59e0b!important;outline-offset:3px}[data-va-selected="true"]{outline:4px solid #ef4444!important;outline-offset:3px}`;
  doc.head.appendChild(style);
}

function addHighlight(element, kind) {
  const current = new Set(String(element.getAttribute("data-va-highlight") || "").split(/\s+/).filter(Boolean));
  current.add(kind);
  element.setAttribute("data-va-highlight", Array.from(current).join(" "));
}

function applyHighlights() {
  const doc = refs.frame.contentDocument;
  if (!doc) return { repeat: 0, field: 0, pagination: 0 };
  installHighlightStyle(doc);
  $$('[data-va-highlight]', doc).forEach((node) => node.removeAttribute("data-va-highlight"));
  let repeat = 0, field = 0, pagination = 0;
  for (const candidate of model.state.repeatedRegions) {
    $$(candidate.selector, doc).forEach((node) => { addHighlight(node, "repeat"); repeat += 1; });
  }
  for (const candidate of model.state.fieldCandidates.filter((item) => !item.removed)) {
    $$(candidate.selector, doc).forEach((node) => { addHighlight(node, "field"); field += 1; });
  }
  for (const candidate of model.state.paginationCandidates) {
    $$(candidate.selector, doc).forEach((node) => { addHighlight(node, "pagination"); pagination += 1; });
  }
  return { repeat, field, pagination };
}

function renderSelection(state) {
  const selected = state.selectedElement;
  if (!selected) {
    refs.selectionCard.innerHTML = '<div class="empty">Element Picker로 요소를 선택하십시오.</div>';
    return;
  }
  refs.selectionCard.innerHTML = `<strong>${selected.selector}</strong><div>${selected.tagName || "element"}</div><p>${selected.text || "(텍스트 없음)"}</p>`;
}

function renderCandidates(state) {
  refs.candidateList.innerHTML = `<div class="summary-card"><strong>Candidate Highlight</strong><div class="candidate-row"><span>반복영역</span><span>${state.repeatedRegions.length}</span></div><div class="candidate-row"><span>필드</span><span>${state.fieldCandidates.filter((x)=>!x.removed).length}</span></div><div class="candidate-row"><span>Pagination</span><span>${state.paginationCandidates.length}</span></div><div class="candidate-row"><span>Endpoint Groups</span><span>${state.endpointGroups.length}</span></div></div>`;
}

function renderFieldEditor(state) {
  refs.fieldEditor.innerHTML = `<h3>필드 편집</h3>${state.fieldCandidates.map((field) => `<div class="field-row" data-field-id="${field.id}"><input value="${field.name.replace(/"/g, "&quot;")}" ${field.removed ? "disabled" : ""}><button class="button" data-action="${field.removed ? "restore" : "remove"}">${field.removed ? "복원" : "제거"}</button></div>`).join("")}`;
  $$(".field-row", refs.fieldEditor).forEach((row) => {
    const fieldId = row.dataset.fieldId;
    const input = $("input", row);
    input?.addEventListener("change", () => { model.renameField(fieldId, input.value); render(); });
    $("button", row)?.addEventListener("click", () => {
      const action = $("button", row).dataset.action;
      if (action === "restore") model.restoreField(fieldId); else model.removeField(fieldId);
      model.applyFields();
      render();
      applyHighlights();
    });
  });
}

function renderWorkflow(state) {
  refs.workflowList.innerHTML = state.workflow.map((step) => `<div class="workflow-step"><div><strong>${step.label}</strong><div class="status-line">${step.type} · ${step.status}</div></div><span class="source">${step.source}</span></div>`).join("") || '<div class="empty">Workflow 이벤트 대기 중</div>';
}

function renderPreview(state) {
  const columns = state.previewColumns;
  const rows = state.previewRows;
  refs.previewStatus.textContent = `${rows.length} rows · ${columns.length} fields · rev ${state.appliedRevision}`;
  if (!columns.length) {
    refs.previewTable.innerHTML = '<div class="empty">적용된 필드가 없습니다.</div>';
    return;
  }
  refs.previewTable.innerHTML = `<table class="preview-table"><thead><tr><th>#</th>${columns.map((column) => `<th>${column.name}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr><td>${row.__row}</td>${columns.map((column) => `<td>${row[column.name] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function render() {
  const state = model.snapshot();
  refs.modeBadge.textContent = state.modeDecision.mode;
  refs.pickerToggle.classList.toggle("active", state.pickerEnabled);
  refs.pickerToggle.textContent = state.pickerEnabled ? "Picker ON" : "Element Picker";
  renderSelection(state);
  renderCandidates(state);
  renderFieldEditor(state);
  renderWorkflow(state);
  renderPreview(state);
}

function attachFrameEvents() {
  const doc = refs.frame.contentDocument;
  if (!doc || doc.documentElement.dataset.vaBound === "true") return;
  doc.documentElement.dataset.vaBound = "true";
  installHighlightStyle(doc);
  doc.addEventListener("click", (event) => {
    if (!model.state.pickerEnabled) return;
    event.preventDefault();
    event.stopPropagation();
    $$('[data-va-selected="true"]', doc).forEach((node) => node.removeAttribute("data-va-selected"));
    const target = event.target;
    target.setAttribute("data-va-selected", "true");
    const selector = selectorFor(target);
    const candidate = model.state.fieldCandidates.find((field) => {
      try { return target.matches(field.selector); } catch { return false; }
    });
    model.selectElement({ selector, tagName: target.tagName, text: target.textContent, attributes: attributesOf(target), candidateId: candidate?.id || null });
    window.analyzerBridge?.emit?.("analyzer:b2-element-selected", model.state.selectedElement);
    render();
  }, true);
  applyHighlights();
}

async function loadFixture() {
  const fixture = await fetch("../fixtures/analyzer_event_stream.json").then((response) => {
    if (!response.ok) throw new Error(`FIXTURE_LOAD_FAILED:${response.status}`);
    return response.json();
  });
  for (const event of fixture.a3_events || []) model.ingestA3Event(event);
  model.ingestA4Candidates(fixture.a4_candidates || {});
  model.ingestA5Inference(fixture.a5_inference || {});
  model.setSampleRecords(fixture.sample_records || []);
  render();
  applyHighlights();
  return fixture;
}

function connectBridge(bridge) {
  if (!bridge) return false;
  const bind = (method, topic, handler) => {
    if (typeof bridge[method] === "function") { bridge[method](handler); return true; }
    if (typeof bridge.on === "function") { bridge.on(topic, handler); return true; }
    return false;
  };
  const bindings = [
    bind("onA3Event", "analyzer:a3-event", (event) => { model.ingestA3Event(event); render(); }),
    bind("onA4Candidates", "analyzer:a4-candidates", (payload) => { model.ingestA4Candidates(payload); render(); applyHighlights(); }),
    bind("onA5Inference", "analyzer:a5-inference", (payload) => { model.ingestA5Inference(payload); render(); }),
    bind("onSampleRecords", "analyzer:sample-records", (records) => { model.setSampleRecords(records); render(); }),
  ];
  return bindings.some(Boolean);
}

refs.frame.addEventListener("load", () => { model.setBrowserState({ url: refs.frame.src, title: refs.frame.contentDocument?.title || "", loading: false, connected: true }); attachFrameEvents(); render(); });
refs.openUrl.addEventListener("click", () => { model.setBrowserState({ loading: true }); refs.frame.src = refs.browserUrl.value; render(); });
refs.pickerToggle.addEventListener("click", () => { model.setPickerEnabled(!model.state.pickerEnabled); render(); });
refs.applyFields.addEventListener("click", () => { model.applyFields(); render(); applyHighlights(); });
$$(".tab").forEach((tab) => tab.addEventListener("click", () => { $$(".tab").forEach((item)=>item.classList.remove("active")); $$(".tab-pane").forEach((item)=>item.classList.remove("active")); tab.classList.add("active"); $(`#tab-${tab.dataset.tab}`).classList.add("active"); }));

window.siteAnalyzerWave1 = {
  ready: false,
  model,
  ingestA3Event: (event) => { const out = model.ingestA3Event(event); render(); return out; },
  ingestA4Candidates: (payload) => { const out = model.ingestA4Candidates(payload); render(); applyHighlights(); return out; },
  ingestA5Inference: (payload) => { const out = model.ingestA5Inference(payload); render(); return out; },
  setPickerEnabled: (enabled) => { const out = model.setPickerEnabled(enabled); render(); return out; },
  selectElementBySelector: (selector) => {
    const doc = refs.frame.contentDocument;
    const target = doc?.querySelector(selector);
    if (!target) throw new Error("SELECTOR_NOT_FOUND");
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: refs.frame.contentWindow }));
    return model.snapshot();
  },
  renameField: (id, name) => { const out = model.renameField(id, name); render(); return out; },
  removeField: (id) => { const out = model.removeField(id); model.applyFields(); render(); applyHighlights(); return out; },
  applyFields: () => { const out = model.applyFields(); render(); applyHighlights(); return out; },
  applyHighlights,
  getState: () => model.snapshot(),
  loadFixture,
};

await loadFixture();
connectBridge(window.analyzerBridge);
window.siteAnalyzerWave1.ready = true;
document.documentElement.dataset.analyzerReady = "true";
