import { LiveAnalyzerWorkspaceModel } from "./live_analyzer_workspace_model.js";
import { AnalyzerRuntimeBridgeClient } from "./runtime_bridge_client.js";

const params = new URLSearchParams(location.search);
const model = new LiveAnalyzerWorkspaceModel({ url: "about:blank" });
const runtime = new AnalyzerRuntimeBridgeClient(window, {
  channelName: params.get("runtimeChannel") || "yolla-analyzer-runtime-v2",
});
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const refs = {
  frame: $("#live-browser-frame"), browserUrl: $("#browser-url"), openUrl: $("#open-url"),
  picker: $("#picker-toggle"), runtime: $("#runtime-status"), mode: $("#mode-badge"),
  highlight: $("#highlight-status"), selection: $("#selection-card"),
  candidates: $("#candidate-list"), fields: $("#field-editor"), apply: $("#apply-fields"),
  workflow: $("#workflow-list"), preview: $("#preview-table"), previewStatus: $("#preview-status"),
};

function escapeCss(value) {
  return globalThis.CSS?.escape ? CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}
function selectorFor(element) {
  if (element.id) return `#${escapeCss(element.id)}`;
  const classes = Array.from(element.classList || []).filter((name) => !name.startsWith("va-"));
  if (classes.length) return `${element.tagName.toLowerCase()}.${classes.map(escapeCss).join(".")}`;
  return element.tagName.toLowerCase();
}
function addStyle(doc) {
  if (doc.getElementById("va-live-style")) return;
  const style = doc.createElement("style");
  style.id = "va-live-style";
  style.textContent = `[data-va-highlight~="repeat"]{outline:3px solid #7c3aed!important}[data-va-highlight~="field"]{box-shadow:inset 0 0 0 2px #0ea5e9!important}[data-va-highlight~="pagination"]{outline:3px dashed #f59e0b!important}[data-va-selected="true"]{outline:4px solid #ef4444!important}`;
  doc.head.appendChild(style);
}
function mark(element, kind) {
  const values = new Set(String(element.getAttribute("data-va-highlight") || "").split(/\s+/).filter(Boolean));
  values.add(kind);
  element.setAttribute("data-va-highlight", Array.from(values).join(" "));
}
function publishRemoteHighlights() {
  runtime.publish("analyzer:b2-highlight-request", {
    repeated_regions: model.state.repeatedRegions,
    field_candidates: model.state.fieldCandidates.filter((item) => !item.removed),
    pagination_candidates: model.state.paginationCandidates,
  });
  return model.state.runtime.lastHighlight || { repeat: 0, field: 0, pagination: 0 };
}
function applyHighlights() {
  let doc;
  try { doc = refs.frame.contentDocument; } catch { return publishRemoteHighlights(); }
  if (!doc) return publishRemoteHighlights();
  addStyle(doc);
  $$('[data-va-highlight]', doc).forEach((node) => node.removeAttribute("data-va-highlight"));
  let repeat = 0, field = 0, pagination = 0;
  for (const candidate of model.state.repeatedRegions) {
    try { $$(candidate.selector, doc).forEach((node) => { mark(node, "repeat"); repeat += 1; }); } catch { /* invalid selector */ }
  }
  for (const candidate of model.state.fieldCandidates.filter((item) => !item.removed)) {
    try { $$(candidate.selector, doc).forEach((node) => { mark(node, "field"); field += 1; }); } catch { /* invalid selector */ }
  }
  for (const candidate of model.state.paginationCandidates) {
    try { $$(candidate.selector, doc).forEach((node) => { mark(node, "pagination"); pagination += 1; }); } catch { /* invalid selector */ }
  }
  const counts = { repeat, field, pagination };
  model.setRuntimeState({ lastHighlight: counts });
  refs.highlight.textContent = `R ${repeat} · F ${field} · P ${pagination}`;
  return counts;
}
function publishWorkflow() {
  runtime.publish("analyzer:b2-workflow-updated", { steps: model.state.workflow.filter((step) => step.source === "B-3") });
}
function publishPreview() {
  runtime.publish("analyzer:b2-preview-applied", {
    columns: model.state.previewColumns,
    rows: model.state.previewRows,
    appliedRevision: model.state.appliedRevision,
  });
}

function render() {
  const state = model.snapshot();
  refs.runtime.textContent = state.runtime.hostConnected ? `LIVE ${state.runtime.inboundCount}` : (state.runtime.transportReady ? "WAITING" : "OFFLINE");
  refs.mode.textContent = state.modeDecision.mode;
  refs.picker.classList.toggle("active", state.pickerEnabled);
  refs.selection.innerHTML = state.selectedElement
    ? `<strong>${state.selectedElement.selector}</strong><p>${state.selectedElement.text || ""}</p>`
    : '<div class="empty">Runtime Element Event 대기 중</div>';
  refs.candidates.innerHTML = `<div class="summary-card"><strong>Live Candidates</strong><div class="candidate-row"><span>반복영역</span><span>${state.repeatedRegions.length}</span></div><div class="candidate-row"><span>필드</span><span>${state.fieldCandidates.filter((item) => !item.removed).length}</span></div><div class="candidate-row"><span>Pagination</span><span>${state.paginationCandidates.length}</span></div><div class="candidate-row"><span>Endpoint</span><span>${state.endpointGroups.length}</span></div></div>`;
  refs.fields.innerHTML = state.fieldCandidates.map((field) => `<div class="field-row" data-id="${field.id}"><input value="${field.name.replace(/"/g, "&quot;")}" ${field.removed ? "disabled" : ""}><button class="button" data-act="${field.removed ? "restore" : "remove"}">${field.removed ? "복원" : "제거"}</button></div>`).join("");
  $$(".field-row", refs.fields).forEach((row) => {
    const id = row.dataset.id;
    $("input", row)?.addEventListener("change", () => { model.renameField(id, $("input", row).value); render(); });
    $("button", row)?.addEventListener("click", () => {
      $("button", row).dataset.act === "restore" ? model.restoreField(id) : model.removeField(id);
      model.applyFields(); publishPreview(); render(); applyHighlights();
    });
  });
  refs.workflow.innerHTML = state.workflow.map((step) => `<div class="workflow-step" data-id="${step.id}"><input value="${String(step.label).replace(/"/g, "&quot;")}" ${step.source !== "B-3" ? "disabled" : ""}><span class="source">${step.source}</span>${step.source === "B-3" ? '<div class="workflow-actions"><button data-act="up">↑</button><button data-act="down">↓</button><button data-act="remove">×</button></div>' : ""}</div>`).join("") || '<div class="empty">Live Workflow 대기 중</div>';
  $$(".workflow-step", refs.workflow).forEach((row) => {
    const id = row.dataset.id;
    const input = $("input", row);
    if (!input.disabled) input.addEventListener("change", () => { model.updateWorkflowStep(id, { label: input.value }); publishWorkflow(); render(); });
    $$("button", row).forEach((button) => button.addEventListener("click", () => {
      button.dataset.act === "remove" ? model.removeWorkflowStep(id) : model.moveWorkflowStep(id, button.dataset.act);
      publishWorkflow(); render();
    }));
  });
  refs.previewStatus.textContent = `${state.previewRows.length} rows · ${state.previewColumns.length} fields · rev ${state.appliedRevision}`;
  refs.preview.innerHTML = state.previewColumns.length
    ? `<table class="preview-table"><thead><tr><th>#</th>${state.previewColumns.map((column) => `<th>${column.name}</th>`).join("")}</tr></thead><tbody>${state.previewRows.map((row) => `<tr><td>${row.__row}</td>${state.previewColumns.map((column) => `<td>${row[column.name] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody></table>`
    : '<div class="empty">Live Preview 대기 중</div>';
}

function attachFrame() {
  let doc;
  try { doc = refs.frame.contentDocument; } catch { return; }
  if (!doc || doc.documentElement.dataset.vaLiveBound) return;
  doc.documentElement.dataset.vaLiveBound = "true";
  addStyle(doc);
  doc.addEventListener("click", (event) => {
    if (!model.state.pickerEnabled) return;
    event.preventDefault(); event.stopPropagation();
    $$('[data-va-selected="true"]', doc).forEach((node) => node.removeAttribute("data-va-selected"));
    const target = event.target;
    target.setAttribute("data-va-selected", "true");
    model.selectElement({
      selector: selectorFor(target), tagName: target.tagName, text: target.textContent,
      attributes: Object.fromEntries(Array.from(target.attributes || []).map((attr) => [attr.name, attr.value])),
    });
    runtime.publish("analyzer:b2-element-selected", model.state.selectedElement);
    render();
  }, true);
  applyHighlights();
}
function bind(topic, handler) {
  runtime.on(topic, (payload, envelope) => {
    model.recordRuntimeMessage(topic, envelope);
    handler(payload);
    model.setRuntimeState(runtime.snapshot());
    render();
  });
}
bind("analyzer:runtime-hello", (payload) => model.setRuntimeState({ hostName: payload.name || "runtime" }));
bind("analyzer:browser-state", (payload) => {
  model.setBrowserState(payload);
  if (payload.html) {
    refs.frame.srcdoc = String(payload.html);
    refs.browserUrl.value = payload.url || "runtime://document";
  } else if (payload.url) {
    refs.frame.src = payload.url;
    refs.browserUrl.value = payload.url;
  }
});
bind("analyzer:a3-event", (payload) => model.ingestA3Event(payload));
bind("analyzer:a4-candidates", (payload) => { model.ingestA4Candidates(payload); applyHighlights(); });
bind("analyzer:a4-highlight", (payload) => model.setRuntimeState({ lastHighlight: payload.counts || payload }));
bind("analyzer:a5-inference", (payload) => model.ingestA5Inference(payload));
bind("analyzer:b3-workflow", (payload) => model.ingestB3Workflow(payload));
bind("analyzer:b5-preview", (payload) => model.ingestB5Preview(payload));
bind("analyzer:element-selected", (payload) => model.selectElement(payload));

refs.frame.addEventListener("load", () => { attachFrame(); render(); });
refs.openUrl.addEventListener("click", () => { refs.frame.src = refs.browserUrl.value; runtime.publish("analyzer:b2-browser-navigate", { url: refs.browserUrl.value }); });
refs.picker.addEventListener("click", () => { model.setPickerEnabled(!model.state.pickerEnabled); runtime.publish("analyzer:b2-picker-toggle", { enabled: model.state.pickerEnabled }); render(); });
refs.apply.addEventListener("click", () => { model.applyFields(); publishPreview(); render(); applyHighlights(); });
$$(".tab").forEach((tab) => tab.addEventListener("click", () => {
  $$(".tab").forEach((item) => item.classList.remove("active"));
  $$(".tab-pane").forEach((item) => item.classList.remove("active"));
  tab.classList.add("active");
  $(`#tab-${tab.dataset.tab}`).classList.add("active");
}));

window.siteAnalyzerWave2 = {
  ready: false, model, runtime, getState: () => model.snapshot(), applyHighlights,
  setPickerEnabled: (enabled) => { model.setPickerEnabled(enabled); render(); return model.snapshot(); },
  selectElementBySelector: (selector) => {
    const target = refs.frame.contentDocument?.querySelector(selector);
    if (!target) throw new Error("SELECTOR_NOT_FOUND");
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: refs.frame.contentWindow }));
    return model.snapshot();
  },
  renameField: (id, name) => { model.renameField(id, name); render(); return model.snapshot(); },
  applyFields: () => { model.applyFields(); publishPreview(); render(); return model.snapshot(); },
};
runtime.connect();
model.setRuntimeState(runtime.snapshot());
render();
window.siteAnalyzerWave2.ready = true;
document.documentElement.dataset.analyzerReady = "true";
