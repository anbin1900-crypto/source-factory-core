(function safePanelRenderer() {
  "use strict";

  var api = window.sfSafePanel;
  var safePanelBusy = false;
  var clipboardAutoWatchEnabled = true;
  var clipboardAutoWatchRunning = false;
  var clipboardAutoWatchTimer = null;

  function $(id) { return document.getElementById(id); }

  function getSafePanelLogElement() {
    var selectors = [
      "#logPanel",
      "#sf-safe-panel-log-output",
      "#safePanelLog",
      "pre.log",
      "pre.sf4-log"
    ];

    for (var i = 0; i < selectors.length; i += 1) {
      var element = document.querySelector(selectors[i]);
      if (element) return element;
    }
    return null;
  }

  function normalizeSafePanelLogEntry(entry) {
    var input = entry && typeof entry === "object" ? entry : {};
    return {
      ts: input.ts || new Date().toISOString(),
      source: "safe_panel",
      action: input.action || "append_log",
      status: input.status || "success",
      gate_status: input.gate_status === undefined ? null : input.gate_status,
      message: input.message || "",
      output_dir: input.output_dir === undefined ? null : input.output_dir,
      report_path: input.report_path === undefined ? null : input.report_path,
      error: input.error === undefined ? null : input.error,
      details: input.details && typeof input.details === "object" ? input.details : {}
    };
  }


/* ST4_W49_OPERATOR_VISIBILITY_DISPLAY_PATCH_START */
function sfW49OperatorVisibilityFirstNonEmpty() {
  for (var index = 0; index < arguments.length; index += 1) {
    var value = arguments[index];
    if (value === 0) return '0';
    if (value === false) return 'false';
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value);
    }
  }
  return '';
}

function sfW49OperatorVisibilityIsObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sfW49OperatorVisibilityReadPath(source, pathText) {
  var current = source;
  String(pathText || '').split('.').forEach(function readPart(part) {
    if (!part || current === undefined || current === null) {
      current = undefined;
      return;
    }
    current = current[part];
  });
  return current;
}

function sfW49OperatorVisibilityFirstPath(source, paths) {
  for (var index = 0; index < paths.length; index += 1) {
    var value = sfW49OperatorVisibilityReadPath(source, paths[index]);
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}

function sfW49OperatorVisibilityFindObject(source, paths) {
  for (var index = 0; index < paths.length; index += 1) {
    var value = sfW49OperatorVisibilityReadPath(source, paths[index]);
    if (sfW49OperatorVisibilityIsObject(value)) return value;
  }
  return null;
}

function sfW49OperatorVisibilityExtractResponse(input) {
  var source = sfW49OperatorVisibilityIsObject(input) ? input : {};
  return sfW49OperatorVisibilityFindObject(source, [
    'response',
    'details.response',
    'details.legacy_data.response',
    'details.legacy_data',
    'data.response'
  ]) || source;
}

function sfW49OperatorVisibilityExtractSelectedPrompt(source) {
  return sfW49OperatorVisibilityFindObject(source, [
    'selectedPrompt',
    'selected_prompt',
    'data.selectedPrompt',
    'data.selected_prompt',
    'payload.selectedPrompt',
    'payload.selected_prompt',
    'dispatch.selectedPrompt',
    'dispatch.selected_prompt',
    'data.dispatch.selectedPrompt',
    'data.dispatch.selected_prompt',
    'data.dispatch.payload.selectedPrompt',
    'data.dispatch.payload.selected_prompt',
    'details.response.data.dispatch.selectedPrompt',
    'details.response.data.dispatch.selected_prompt'
  ]);
}

function sfW49OperatorVisibilityExtractDispatchPayload(source) {
  return sfW49OperatorVisibilityFindObject(source, [
    'dispatch.payload',
    'data.dispatch.payload',
    'payload',
    'data.payload',
    'details.response.data.dispatch.payload',
    'details.response.payload'
  ]);
}

function sfW49OperatorVisibilityBuildLineage(source) {
  var response = sfW49OperatorVisibilityExtractResponse(source);
  var selectedPrompt = sfW49OperatorVisibilityExtractSelectedPrompt(response);
  var dispatchPayload = sfW49OperatorVisibilityExtractDispatchPayload(response);
  var candidate = selectedPrompt || dispatchPayload || response || {};

  var lineage = {
    prompt_package_id: sfW49OperatorVisibilityFirstNonEmpty(
      candidate.prompt_package_id, candidate.promptPackageId,
      sfW49OperatorVisibilityFirstPath(response, ['prompt_package_id', 'promptPackageId', 'data.prompt_package_id', 'data.promptPackageId'])
    ),
    prompt_package_version: sfW49OperatorVisibilityFirstNonEmpty(
      candidate.prompt_package_version, candidate.promptPackageVersion,
      sfW49OperatorVisibilityFirstPath(response, ['prompt_package_version', 'promptPackageVersion', 'data.prompt_package_version', 'data.promptPackageVersion'])
    ),
    prompt_id: sfW49OperatorVisibilityFirstNonEmpty(
      candidate.prompt_id, candidate.promptId,
      sfW49OperatorVisibilityFirstPath(response, ['prompt_id', 'promptId', 'data.prompt_id', 'data.promptId'])
    ),
    worker_id: sfW49OperatorVisibilityFirstNonEmpty(
      candidate.worker_id, candidate.workerId,
      sfW49OperatorVisibilityFirstPath(response, ['worker_id', 'workerId', 'data.worker_id', 'data.workerId'])
    ),
    worker_slot: sfW49OperatorVisibilityFirstNonEmpty(
      candidate.worker_slot, candidate.workerSlot,
      sfW49OperatorVisibilityFirstPath(response, ['worker_slot', 'workerSlot', 'data.worker_slot', 'data.workerSlot'])
    ),
    task_id: sfW49OperatorVisibilityFirstNonEmpty(
      candidate.task_id, candidate.taskId,
      sfW49OperatorVisibilityFirstPath(response, ['task_id', 'taskId', 'data.task_id', 'data.taskId'])
    ),
    send_order: sfW49OperatorVisibilityFirstNonEmpty(
      candidate.send_order, candidate.sendOrder,
      sfW49OperatorVisibilityFirstPath(response, ['send_order', 'sendOrder', 'data.send_order', 'data.sendOrder'])
    ),
    dedupe_key: sfW49OperatorVisibilityFirstNonEmpty(
      candidate.dedupe_key, candidate.dedupeKey,
      sfW49OperatorVisibilityFirstPath(response, ['dedupe_key', 'dedupeKey', 'data.dedupe_key', 'data.dedupeKey'])
    ),
    created_by_commander: sfW49OperatorVisibilityFirstNonEmpty(
      candidate.created_by_commander, candidate.createdByCommander,
      sfW49OperatorVisibilityFirstPath(response, ['created_by_commander', 'createdByCommander', 'data.created_by_commander', 'data.createdByCommander'])
    ),
    selectedPrompt_visible: Boolean(selectedPrompt || dispatchPayload)
  };

  lineage.lineage_loggable = Boolean(
    lineage.prompt_id || lineage.prompt_package_id || lineage.prompt_package_version || lineage.worker_id || lineage.worker_slot || lineage.task_id || lineage.dedupe_key
  );

  return lineage;
}

function sfW49OperatorVisibilityBuildGateReport(source) {
  var response = sfW49OperatorVisibilityExtractResponse(source);
  var gateHandoff = sfW49OperatorVisibilityFindObject(response, [
    'gate_handoff',
    'gateHandoff',
    'commander_gate_handoff',
    'commanderGateHandoff',
    'data.gate_handoff',
    'data.gateHandoff',
    'data.commander_gate_handoff',
    'data.commanderGateHandoff'
  ]) || {};

  var nextCommanderAction = sfW49OperatorVisibilityFindObject(response, [
    'next_commander_action',
    'nextCommanderAction',
    'data.next_commander_action',
    'data.nextCommanderAction',
    'data.gate_handoff.next_commander_action',
    'data.gate_handoff.nextCommanderAction'
  ]) || gateHandoff.next_commander_action || gateHandoff.nextCommanderAction || {};

  var out = {
    gate_status: sfW49OperatorVisibilityFirstNonEmpty(
      response.gate_status, response.gateStatus,
      sfW49OperatorVisibilityFirstPath(response, ['data.gate_status', 'data.gateStatus', 'status', 'data.status'])
    ),
    gate_recommendation: sfW49OperatorVisibilityFirstNonEmpty(
      response.gate_recommendation, response.gateRecommendation,
      gateHandoff.gate_recommendation, gateHandoff.gateRecommendation,
      sfW49OperatorVisibilityFirstPath(response, ['data.gate_recommendation', 'data.gateRecommendation'])
    ),
    next_commander_action: sfW49OperatorVisibilityFirstNonEmpty(
      nextCommanderAction.action,
      nextCommanderAction.next_action,
      nextCommanderAction.nextAction,
      nextCommanderAction.recommendation,
      response.next_commander_action,
      response.nextCommanderAction,
      sfW49OperatorVisibilityFirstPath(response, ['data.next_commander_action.action', 'data.nextCommanderAction.action'])
    ),
    report_next_action: sfW49OperatorVisibilityFirstNonEmpty(
      response.next_action, response.nextAction,
      sfW49OperatorVisibilityFirstPath(response, ['data.next_action', 'data.nextAction', 'report.next_action', 'data.report.next_action'])
    ),
    report_path: sfW49OperatorVisibilityFirstNonEmpty(
      response.report_path, response.reportPath,
      sfW49OperatorVisibilityFirstPath(response, ['data.report_path', 'data.reportPath'])
    ),
    class_contract_status: sfW49OperatorVisibilityFirstNonEmpty(
      response.class_contract_status, response.classContractStatus,
      sfW49OperatorVisibilityFirstPath(response, ['data.class_contract_status', 'data.classContractStatus'])
    ),
    overall_status: sfW49OperatorVisibilityFirstNonEmpty(
      response.overall_status, response.overallStatus,
      response.final_status, response.finalStatus,
      sfW49OperatorVisibilityFirstPath(response, ['data.overall_status', 'data.overallStatus', 'data.final_status', 'data.finalStatus'])
    )
  };

  out.gate_report_loggable = Boolean(
    out.gate_status || out.gate_recommendation || out.next_commander_action || out.report_next_action || out.report_path || out.class_contract_status || out.overall_status
  );

  return out;
}

function sfW49OperatorVisibilityEnsureSummaryElement() {
  var existing = document.getElementById('stage4-w49-operator-visibility-summary');
  if (existing) return existing;

  var root = document.getElementById('sf-safe-panel-status-summary');
  var parent = root && root.parentNode ? root.parentNode : document.body;
  var element = document.createElement('pre');
  element.id = 'stage4-w49-operator-visibility-summary';
  element.className = 'log stage4-w49-operator-visibility-summary';
  element.setAttribute('aria-live', 'polite');
  element.textContent = 'W49 Operator Visibility Summary: waiting';

  if (root && root.nextSibling) {
    parent.insertBefore(element, root.nextSibling);
  } else {
    parent.appendChild(element);
  }

  return element;
}

function sfW49RenderOperatorVisibilitySummary(input) {
  var summary = {
    object_type: 'W49_OPERATOR_VISIBILITY_SUMMARY',
    updated_at: new Date().toISOString(),
    selectedPromptLineage: sfW49OperatorVisibilityBuildLineage(input || {}),
    gateReportVisibility: sfW49OperatorVisibilityBuildGateReport(input || {}),
    source_action: input && input.action ? String(input.action) : '',
    source_status: input && input.status ? String(input.status) : ''
  };

  summary.operator_visible = Boolean(
    summary.selectedPromptLineage.lineage_loggable ||
    summary.gateReportVisibility.gate_report_loggable
  );

  window.__STAGE4_OPERATOR_VISIBILITY_SUMMARY__ = summary;
  window.__sfStage4W49OperatorVisibilitySummary = summary;
  window.__STAGE4_LAST_SELECTED_PROMPT_LINEAGE__ = summary.selectedPromptLineage;
  window.__STAGE4_LAST_GATE_REPORT_VISIBILITY__ = summary.gateReportVisibility;
  window.__STAGE4_W49_RENDER_OPERATOR_VISIBILITY_SUMMARY__ = sfW49RenderOperatorVisibilitySummary;

  if (typeof ensurePipelineStatusItem === 'function') {
    ensurePipelineStatusItem('w49_visibility', 'W49 Visibility', 'waiting');
  }
  if (typeof setPipelineStatus === 'function') {
    setPipelineStatus('w49_visibility', summary.operator_visible ? 'visible/loggable' : 'waiting', summary.operator_visible ? 'ok' : 'warn');
  }

  var target = sfW49OperatorVisibilityEnsureSummaryElement();
  if (target) {
    target.textContent = 'W49 Operator Visibility Summary\n' + JSON.stringify(summary, null, 2);
  }

  return summary;
}
/* ST4_W49_OPERATOR_VISIBILITY_DISPLAY_PATCH_END */


/* ST4_W50_SAFE_PANEL_OPERATOR_LABEL_POLISH_START */
var SF_STAGE4_W50_OPERATOR_LABEL_POLISH_MARKER = 'W50_SAFE_PANEL_OPERATOR_LABEL_POLISH_V1';

var SF_STAGE4_OPERATOR_LABELS_W50 = Object.freeze({
  w49_operator_visibility_confirm: 'W49 운영자 표시 확인',
  selected_prompt_flow: '선택 프롬프트 흐름',
  gate_report_visibility: '게이트·보고 표시',
  w49_display_status: 'W49 표시 상태',
  gate_decision: '게이트 판정',
  source_generation_ready: '소스 생성 준비',
  syntax_check: '문법 확인',
  generation_result: '생성 결과',
  collector_status: '수집 상태',
  clipboard: '클립보드',
  next_action_visibility: '다음 작업',
  selectedPromptLineage: '선택 프롬프트 계보',
  gateReportVisibility: '게이트·보고 표시',
  w49OperatorVisibilitySummary: 'W49 운영자 표시 요약',
  dispatchConfirmation: '전송 확인',
  collectorIntake: '수집소 입력',
  gateRecommendation: '게이트 추천',
  reportHandoffNextAction: '보고·인수인계 다음 조치',
  stage4Apis: 'Stage4 API',
  refreshControlState: '상태 새로고침',
  promptPackageId: '프롬프트 패키지 ID',
  promptPackageVersion: '프롬프트 패키지 버전',
  promptId: '프롬프트 ID',
  workerId: '워커 ID',
  workerSlot: '워커 슬롯',
  taskId: '작업 ID',
  dedupeKey: '중복 방지 키',
  createdByCommander: '생성 Commander'
});

function sfStage4OperatorLabelW50(key, fallback) {
  return SF_STAGE4_OPERATOR_LABELS_W50[key] || fallback || key;
}

function sfW50EnsureOperatorLabelPolishSummaryElement() {
  var existing = document.getElementById('stage4-w50-operator-label-polish-summary');
  if (existing) return existing;

  var root = document.getElementById('sf-safe-panel-status-summary');
  var parent = root && root.parentNode ? root.parentNode : document.body;
  var element = document.createElement('pre');
  element.id = 'stage4-w50-operator-label-polish-summary';
  element.className = 'log stage4-w50-operator-label-polish-summary';
  element.setAttribute('aria-live', 'polite');

  if (root && root.nextSibling) {
    parent.insertBefore(element, root.nextSibling);
  } else {
    parent.appendChild(element);
  }

  return element;
}

function sfW50RenderOperatorLabelPolishSummary(reason) {
  var labels = {
    marker: SF_STAGE4_W50_OPERATOR_LABEL_POLISH_MARKER,
    patch_request_id: 'PATCH_W50_SAFE_PANEL_OPERATOR_LABEL_POLISH_V1',
    reason: reason || 'render',
    labels: SF_STAGE4_OPERATOR_LABELS_W50,
    required_visible_labels: [
      SF_STAGE4_OPERATOR_LABELS_W50.w49_operator_visibility_confirm,
      SF_STAGE4_OPERATOR_LABELS_W50.selected_prompt_flow,
      SF_STAGE4_OPERATOR_LABELS_W50.gate_report_visibility,
      SF_STAGE4_OPERATOR_LABELS_W50.w49_display_status,
      SF_STAGE4_OPERATOR_LABELS_W50.gate_decision,
      SF_STAGE4_OPERATOR_LABELS_W50.source_generation_ready,
      SF_STAGE4_OPERATOR_LABELS_W50.syntax_check,
      SF_STAGE4_OPERATOR_LABELS_W50.generation_result,
      SF_STAGE4_OPERATOR_LABELS_W50.collector_status,
      SF_STAGE4_OPERATOR_LABELS_W50.clipboard,
      SF_STAGE4_OPERATOR_LABELS_W50.next_action_visibility
    ],
    policy: {
      production_logic_changed: false,
      api_renamed: false,
      ipc_renamed: false,
      global_object_renamed: false,
      internal_keys_renamed: false,
      package_json_modified: false,
      runtime_patch_applied: false
    },
    updated_at: new Date().toISOString()
  };

  if (typeof window !== 'undefined') {
    window.__sfStage4W50OperatorLabelPolishResult = {
      marker: SF_STAGE4_W50_OPERATOR_LABEL_POLISH_MARKER,
      status: 'READY',
      patch_request_id: 'PATCH_W50_SAFE_PANEL_OPERATOR_LABEL_POLISH_V1',
      labels_available: Object.keys(SF_STAGE4_OPERATOR_LABELS_W50),
      production_logic_changed: false,
      api_renamed: false,
      ipc_renamed: false,
      global_object_renamed: false,
      internal_keys_renamed: false
    };
    window.__sfStage4W50OperatorLabels = SF_STAGE4_OPERATOR_LABELS_W50;
    window.__sfStage4W50RenderOperatorLabelPolishSummary = sfW50RenderOperatorLabelPolishSummary;
  }

  if (typeof ensurePipelineStatusItem === 'function') {
    ensurePipelineStatusItem('w50_label_polish', 'W50 라벨', 'ready');
  }
  if (typeof setPipelineStatus === 'function') {
    setPipelineStatus('w50_label_polish', 'ready', 'ok');
  }

  var target = sfW50EnsureOperatorLabelPolishSummaryElement();
  if (target) {
    target.textContent = [
      'W50 SAFE Panel 라벨 정리',
      'W49 운영자 표시 확인',
      '선택 프롬프트 흐름',
      '게이트·보고 표시',
      'W49 표시 상태',
      '게이트 판정',
      '소스 생성 준비',
      '문법 확인',
      '생성 결과',
      '수집 상태',
      '클립보드',
      '다음 작업',
      '',
      JSON.stringify(labels, null, 2)
    ].join('\n');
  }

  return labels;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function onW50LabelPolishReady() {
      sfW50RenderOperatorLabelPolishSummary('DOMContentLoaded');
    }, { once: true });
  } else {
    setTimeout(function renderW50LabelPolishSoon() {
      sfW50RenderOperatorLabelPolishSummary('immediate');
    }, 0);
  }
}
/* ST4_W50_SAFE_PANEL_OPERATOR_LABEL_POLISH_END */

  function appendSafePanelLog(entry) {
    var logElement = getSafePanelLogElement();
    var normalized = normalizeSafePanelLogEntry(entry);
    try { sfW49RenderOperatorVisibilitySummary(normalized); } catch (w49Error) { console.warn('[W49 Operator Visibility] summary render failed:', w49Error && w49Error.message ? w49Error.message : String(w49Error)); }
    var title = "[" + normalized.status + "] " + normalized.action + " - " + normalized.message;
    var body = title + "\n" + JSON.stringify(normalized, null, 2) + "\n\n";

    if (!logElement) return normalized;

    if (typeof logElement.value === "string") {
      logElement.value += body;
      logElement.scrollTop = logElement.scrollHeight;
      return normalized;
    }

    logElement.textContent += body;
    logElement.scrollTop = logElement.scrollHeight;
    return normalized;
  }

  function clearSafePanelLog() {
    var logElement = getSafePanelLogElement();
    if (!logElement) {
      return appendSafePanelLog({
        action: "clear_log",
        status: "error",
        message: "logPanel target not found",
        error: "logPanel fallback target not found",
        details: {
          selectors: ["#logPanel", "#sf-safe-panel-log-output", "#safePanelLog", "pre.log", "pre.sf4-log"]
        }
      });
    }

    if (typeof logElement.value === "string") {
      logElement.value = "";
    } else {
      logElement.textContent = "";
    }

    return appendSafePanelLog({
      action: "clear_log",
      status: "success",
      message: "logPanel cleared",
      details: {
        target: logElement.id || logElement.className || logElement.tagName
      }
    });
  }

  function log(message, data) {
    appendSafePanelLog({
      action: "legacy_log",
      status: data && data.ok === false ? "error" : "success",
      message: message,
      details: data === undefined ? {} : { legacy_data: data }
    });
  }

  function readSafePanelResponseValue(response, camelKey, snakeKey) {
    if (!response || typeof response !== "object") return null;
    if (response[camelKey] !== undefined && response[camelKey] !== null) return response[camelKey];
    if (response[snakeKey] !== undefined && response[snakeKey] !== null) return response[snakeKey];
    return null;
  }

  function getSafePanelErrorText(error) {
    if (!error) return null;
    if (typeof error.message === "string") return error.message;
    return String(error);
  }

  function buildSafePanelLogFromResponse(action, status, message, response, extraDetails) {
    var details = Object.assign({}, extraDetails || {});
    if (response !== undefined) details.response = response;

    return {
      action: action,
      status: status,
      gate_status: readSafePanelResponseValue(response, "gateStatus", "gate_status"),
      message: message,
      output_dir: readSafePanelResponseValue(response, "outputDir", "output_dir"),
      report_path: readSafePanelResponseValue(response, "reportPath", "report_path"),
      error: response && response.error ? response.error : null,
      details: details
    };
  }

  function setStatus(id, value, cls) {
    var el = $(id);
    if (!el) return;
    el.textContent = String(value == null ? "-" : value);
    el.className = cls || "";
  }

  function setPipelineStatus(key, value, cls) {
    var root = $("sf-safe-panel-status-summary");
    if (!root) return;
    var el = root.querySelector("[data-sf-status-key='" + key + "']");
    if (!el) return;
    el.textContent = String(value == null ? "-" : value);
    el.className = cls || "";
  }

  function classForPipelineLight(value) {
    var normalized = String(value || "off").toLowerCase();
    if (normalized === "green" || normalized === "ready" || normalized === "checked") return "ok";
    if (normalized === "red" || normalized === "failed" || normalized === "fail") return "bad";
    return "warn";
  }

  function ensurePipelineStatusItem(key, label, defaultValue) {
    var root = $("sf-safe-panel-status-summary");
    if (!root) return null;
    var existing = root.querySelector("[data-sf-status-key='" + key + "']");
    if (existing) return existing;

    var wrapper = document.createElement("div");
    wrapper.className = "status";

    var span = document.createElement("span");
    span.textContent = label;

    var strong = document.createElement("strong");
    strong.setAttribute("data-sf-status-key", key);
    strong.textContent = defaultValue || "off";

    wrapper.appendChild(span);
    wrapper.appendChild(strong);
    root.appendChild(wrapper);
    return strong;
  }

  function ensurePipelineStatusSlots() {
    ensurePipelineStatusItem("intake", "Intake", "off");
    ensurePipelineStatusItem("clipboard", "Clipboard", "off");
    ensurePipelineStatusItem("gate", "Gate", "waiting");
    ensurePipelineStatusItem("materialize", "Materialize", "waiting");
    ensurePipelineStatusItem("syntax", "Syntax", "waiting");
    ensurePipelineStatusItem("generated", "Generated", "none");
  }

  function updatePipelineStatusFromResponse(action, response) {
    if (!response || typeof response !== "object") return;

    if (action === "refresh_status" && response.lights) {
      ensurePipelineStatusSlots();
      setPipelineStatus("intake", response.lights.intake || "off", classForPipelineLight(response.lights.intake));
      setPipelineStatus("clipboard", response.lights.clipboard || "off", classForPipelineLight(response.lights.clipboard));
      setPipelineStatus("gate", response.lights.gate || "off", classForPipelineLight(response.lights.gate));
      setPipelineStatus("materialize", response.lights.materialize || "off", classForPipelineLight(response.lights.materialize));
      setPipelineStatus("syntax", response.lights.syntax || "off", classForPipelineLight(response.lights.syntax));
      setPipelineStatus("generated", response.latest && response.latest.output_dir ? "ready" : "none", response.latest && response.latest.output_dir ? "ok" : "warn");
      return;
    }

    if (action === "textarea_intake") {
      setPipelineStatus("intake", response.ok === false ? "red" : "green", response.ok === false ? "bad" : "ok");
    }
    if (action === "clipboard_intake" || action === "clipboard_auto_watch") {
      setPipelineStatus("clipboard", response.ok === false ? "red" : "green", response.ok === false ? "bad" : "ok");
      if (response.ok !== false) setPipelineStatus("intake", "green", "ok");
    }
    if (action === "gate") {
      setPipelineStatus("gate", response.gate_status || response.gateStatus || "done", response.ok === false ? "bad" : "ok");
    }
    if (action === "materialize") {
      setPipelineStatus("materialize", response.output_dir || response.outputDir ? "done" : "waiting", response.ok === false ? "bad" : "ok");
      if (response.output_dir || response.outputDir) setPipelineStatus("generated", "ready", "ok");
    }
    if (action === "syntax_check") {
      var failureCount = response.failure_count != null ? response.failure_count : (response.failures && response.failures.length) || 0;
      setPipelineStatus("syntax", failureCount ? "failures: " + failureCount : "checked", failureCount ? "bad" : "ok");
    }
  }

  function toInt(id, fallback) {
    var el = $(id);
    var value = el ? parseInt(el.value, 10) : fallback;
    if (!Number.isFinite(value) || Number.isNaN(value)) return fallback;
    return Math.max(0, value);
  }

  function normalizeUrl(value) {
    var raw = String(value || "").trim();
    if (!raw) return "https://chatgpt.com/g/g-p-6a43a643a1148191ab9bc5697224e628/project";
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return raw;
    return "https://" + raw;
  }

  function getUrl() {
    var el = $("targetUrl");
    return normalizeUrl(el ? el.value : "");
  }

  function getProjectHomeUrl() {
    var el = $("projectHomeUrl");
    var value = el ? String(el.value || "").trim() : "";
    return normalizeUrl(value || getUrl());
  }

  function escapeHtml(text) {
    return String(text == null ? "" : text).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }

  function renderTerminals(items) {
    var root = $("terminalList");
    if (!root) return;
    if (!items || !items.length) {
      root.innerHTML = '<div class="empty">Panel Only 상태입니다. 열린 Worker/Commander 창이 없습니다.</div>';
      return;
    }
    root.innerHTML = items.map(function (item) {
      return [
        '<div class="terminal-item">',
        '<div class="terminal-title">', escapeHtml(item.role), ' ', escapeHtml(item.slot), ' / #', escapeHtml(item.id), '</div>',
        '<div class="terminal-meta">', escapeHtml(item.title), '</div>',
        '<div class="terminal-meta">', escapeHtml(item.url), '</div>',
        '</div>'
      ].join("");
    }).join("");
  }

  function applyConfig(config) {
    if (!config) return;
    if ($("commanderCount") && !$("commanderCount").__touched) $("commanderCount").value = config.commanderCount == null ? 1 : config.commanderCount;
    if ($("workerCount") && !$("workerCount").__touched) $("workerCount").value = config.workerCount == null ? 6 : config.workerCount;
    if ($("targetUrl") && !$("targetUrl").__touched) $("targetUrl").value = config.url || "https://chatgpt.com/g/g-p-6a43a643a1148191ab9bc5697224e628/project";
    if ($("projectHomeUrl") && !$("projectHomeUrl").__touched) $("projectHomeUrl").value = config.projectHomeUrl || config.url || "https://chatgpt.com/g/g-p-6a43a643a1148191ab9bc5697224e628/project";
  }

  async function refreshStatus() {
    if (!api) {
      setStatus("apiStatus", "NO API", "bad");
      log("API 연결 실패");
      return null;
    }
    try {
      var status = await api.getStatus();
      setStatus("apiStatus", "CONNECTED", "ok");
      setStatus("commanderOpen", status.commander_open || 0, status.commander_open ? "ok" : "warn");
      setStatus("workerOpen", status.worker_open || 0, status.worker_open ? "ok" : "warn");
      setStatus("terminalTotal", status.terminal_count || 0, status.terminal_count ? "ok" : "warn");
      applyConfig(status.config);
      renderTerminals(status.terminals || []);
      return status;
    } catch (err) {
      setStatus("apiStatus", "ERROR", "bad");
      log("상태 확인 실패", { error: String(err && err.message || err) });
      return null;
    }
  }

  function setBusy(busy) {
    safePanelBusy = !!busy;
    [
      "launchButton","panelOnlyButton","closeButton","arrangeButton","statusButton","stateFolderButton","projectFolderButton",
      "sf-textarea-intake-btn","sf-clipboard-intake-btn","sf-clipboard-auto-watch-btn","sf-run-gate-btn","sf-materialize-btn","sf-syntax-check-btn","sf-open-latest-generated-btn"
    ].forEach(function(id) {
      var el = $(id);
      if (el) el.disabled = !!busy;
    });
  }

  async function run(label, fn) {
    if (!api) {
      setStatus("apiStatus", "NO API", "bad");
      log("API 연결 실패");
      return;
    }
    setBusy(true);
    log("===== " + label + " 시작 =====");
    try {
      var result = await fn();
      log(label + " 결과", result);
      await refreshStatus();
      log("===== " + label + " 완료 =====");
    } catch (err) {
      log("===== " + label + " 실패 =====", { error: String(err && err.message || err) });
    } finally {
      setBusy(false);
    }
  }

  function getSafePanelTextareaIntakeValue() {
    var selectors = [
      "#sf-safe-panel-source-textarea",
      "#sf-source-textarea",
      "#sf-direct-source-textarea",
      "#sf-taeo-raw-output",
      "#sf-raw-output-textarea",
      "textarea[data-sf-role='source-intake']"
    ];

    for (var i = 0; i < selectors.length; i += 1) {
      var element = document.querySelector(selectors[i]);
      if (element && typeof element.value === "string") return element.value;
    }
    return "";
  }

  async function runSafePanelApiAction(action, apiName, payloadFactory, extraDetailsFactory) {
    appendSafePanelLog({
      action: action,
      status: "started",
      message: action + " started",
      details: { api: "window.sfSafePanel." + apiName }
    });

    try {
      if (!api || typeof api[apiName] !== "function") {
        throw new Error("window.sfSafePanel." + apiName + " is not available");
      }

      var payload = typeof payloadFactory === "function" ? payloadFactory() : {};
      var response = await api[apiName](payload);
      var extraDetails = typeof extraDetailsFactory === "function" ? extraDetailsFactory(response, payload) : { payload: payload };

      appendSafePanelLog(buildSafePanelLogFromResponse(action, "success", action + " success", response, extraDetails));
      updatePipelineStatusFromResponse(action, response);

      if (action !== "refresh_status") {
        refreshSafePanelPipelineStatus({ trigger: "after_action", action: action });
      }

      return response;
    } catch (error) {
      appendSafePanelLog({
        action: action,
        status: "error",
        gate_status: null,
        message: action + " failed",
        output_dir: null,
        report_path: null,
        error: getSafePanelErrorText(error),
        details: { api: "window.sfSafePanel." + apiName }
      });

      if (action !== "refresh_status") {
        refreshSafePanelPipelineStatus({ trigger: "after_action", action: action });
      }

      return null;
    }
  }

  function refreshSafePanelPipelineStatus(context) {
    if (!api || typeof api.refreshSafePanelStatus !== "function") return null;
    return runSafePanelApiAction(
      "refresh_status",
      "refreshSafePanelStatus",
      function () {
        return Object.assign({ source: "safe_panel", action: "refresh_status" }, context || {});
      },
      function (response, payload) {
        return { payload: payload, status_response: response };
      }
    );
  }

  function getSafePanelTextareaElement() {
    var selectors = [
      "#sf-safe-panel-source-textarea",
      "#sf-source-textarea",
      "#sf-direct-source-textarea",
      "#sf-taeo-raw-output",
      "#sf-raw-output-textarea",
      "textarea[data-sf-role='source-intake']"
    ];

    for (var i = 0; i < selectors.length; i += 1) {
      var element = document.querySelector(selectors[i]);
      if (element && typeof element.value === "string") return element;
    }
    return null;
  }

  function setSafePanelTextareaValue(value) {
    var element = getSafePanelTextareaElement();
    if (!element || typeof value !== "string" || !value) return false;
    element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  function syncTextareaFromClipboardResponse(response) {
    if (!response || !response.intake || typeof response.intake.rawText !== "string") return false;
    return setSafePanelTextareaValue(response.intake.rawText);
  }

  function intakeSourceFromTextarea() {
    return runSafePanelApiAction(
      "textarea_intake",
      "intakeSourceFromTextarea",
      function () {
        var rawText = getSafePanelTextareaIntakeValue();
        return {
          source: "safe_panel",
          action: "textarea_intake",
          text: rawText,
          rawText: rawText
        };
      },
      function (response, payload) {
        return {
          text_length: payload.text.length,
          rawText_length: payload.rawText.length,
          response: response
        };
      }
    );
  }

  function intakeSourceFromClipboard() {
    return runSafePanelApiAction(
      "clipboard_intake",
      "intakeSourceFromClipboard",
      function () {
        return { source: "safe_panel", action: "clipboard_intake" };
      },
      function (response, payload) {
        var textareaSynced = syncTextareaFromClipboardResponse(response);
        return {
          payload: payload,
          textarea_synced: textareaSynced,
          raw_text_length: response && response.raw_text_length,
          source_file_count: response && response.source_file_count,
          valid_source_file_count: response && response.valid_source_file_count,
          intake_id: response && response.intake && response.intake.intake_id,
          response: response
        };
      }
    );
  }

  function ensureClipboardAutoWatchButton() {
    var existing = $("sf-clipboard-auto-watch-btn");
    if (existing) return existing;
    var anchor = $("sf-clipboard-intake-btn");
    if (!anchor || !anchor.parentNode) return null;

    var button = document.createElement("button");
    button.id = "sf-clipboard-auto-watch-btn";
    button.type = "button";
    button.textContent = clipboardAutoWatchEnabled ? "Clipboard Auto: ON" : "Clipboard Auto: OFF";
    anchor.parentNode.insertBefore(button, anchor.nextSibling);
    return button;
  }

  function updateClipboardAutoWatchButton() {
    var button = ensureClipboardAutoWatchButton();
    if (!button) return;
    button.textContent = clipboardAutoWatchEnabled ? "Clipboard Auto: ON" : "Clipboard Auto: OFF";
    button.className = clipboardAutoWatchEnabled ? "ok" : "warn";
  }

  async function runClipboardAutoWatchTick() {
    if (!clipboardAutoWatchEnabled || clipboardAutoWatchRunning || safePanelBusy) return;
    if (!api || typeof api.intakeSourceFromClipboard !== "function") return;

    clipboardAutoWatchRunning = true;
    try {
      var response = await api.intakeSourceFromClipboard({
        source: "safe_panel",
        action: "clipboard_auto_watch",
        auto_watch: true,
        silent_if_no_source: true
      });

      if (!response || response.skipped || response.ignored || response.ok === false) return;

      var textareaSynced = syncTextareaFromClipboardResponse(response);
      appendSafePanelLog({
        action: "clipboard_auto_watch",
        status: "success",
        gate_status: null,
        message: "clipboard_auto_watch intake success",
        output_dir: null,
        report_path: null,
        error: null,
        details: {
          textarea_synced: textareaSynced,
          intake_id: response.intake && response.intake.intake_id,
          raw_text_length: response.raw_text_length,
          source_file_count: response.source_file_count,
          valid_source_file_count: response.valid_source_file_count
        }
      });
      updatePipelineStatusFromResponse("clipboard_auto_watch", response);
      refreshSafePanelPipelineStatus({ trigger: "clipboard_auto_watch", action: "clipboard_auto_watch" });
    } catch (error) {
      appendSafePanelLog({
        action: "clipboard_auto_watch",
        status: "error",
        message: "clipboard_auto_watch failed",
        error: getSafePanelErrorText(error),
        details: {}
      });
    } finally {
      clipboardAutoWatchRunning = false;
    }
  }

  function startClipboardAutoWatch() {
    updateClipboardAutoWatchButton();
    if (clipboardAutoWatchTimer) return;
    clipboardAutoWatchTimer = window.setInterval(runClipboardAutoWatchTick, 1500);
    window.setTimeout(runClipboardAutoWatchTick, 250);
  }

  function toggleClipboardAutoWatch() {
    clipboardAutoWatchEnabled = !clipboardAutoWatchEnabled;
    updateClipboardAutoWatchButton();
    appendSafePanelLog({
      action: "clipboard_auto_watch_toggle",
      status: "success",
      message: clipboardAutoWatchEnabled ? "Clipboard Auto Watch enabled" : "Clipboard Auto Watch disabled",
      details: { enabled: clipboardAutoWatchEnabled }
    });
  }


  function runSafePanelGate() {
    return runSafePanelApiAction(
      "gate",
      "runSafePanelGate",
      function () {
        return { source: "safe_panel", action: "gate" };
      }
    );
  }

  function materializeSafePanelSources() {
    return runSafePanelApiAction(
      "materialize",
      "materializeSafePanelSources",
      function () {
        return { source: "safe_panel", action: "materialize" };
      },
      function (response, payload) {
        return {
          payload: payload,
          selected_gate_report: readSafePanelResponseValue(response, "selectedGateReport", "selected_gate_report"),
          response: response
        };
      }
    );
  }

  function runSafePanelSyntaxCheck() {
    return runSafePanelApiAction(
      "syntax_check",
      "runSafePanelSyntaxCheck",
      function () {
        return { source: "safe_panel", action: "syntax_check" };
      },
      function (response, payload) {
        return {
          payload: payload,
          syntax_result: response,
          no_false_pass_rule: "Do not display PASS unless response contains actual syntax result."
        };
      }
    );
  }

  function openLatestSafePanelGenerated() {
    return runSafePanelApiAction(
      "open_latest_generated",
      "openLatestSafePanelGenerated",
      function () {
        return { source: "safe_panel", action: "open_latest_generated" };
      },
      function (response, payload) {
        return {
          payload: payload,
          output_dir: readSafePanelResponseValue(response, "outputDir", "output_dir"),
          response: response
        };
      }
    );
  }

  function bindSafePanelButton(selectorList, action, handler, options) {
    var config = options && typeof options === "object" ? options : {};
    var optional = config.optional === true;
    var selectors = Array.isArray(selectorList) ? selectorList : [selectorList];
    var boundCount = 0;

    for (var i = 0; i < selectors.length; i += 1) {
      var button = document.querySelector(selectors[i]);
      if (!button) continue;

      if (button.getAttribute("data-safe-panel-v0106-bound") === "1") {
        boundCount += 1;
        continue;
      }

      button.addEventListener("click", function (event) {
        event.preventDefault();
        handler();
      });

      button.setAttribute("data-safe-panel-v0106-bound", "1");
      boundCount += 1;
    }

    if (boundCount === 0 && !optional) {
      appendSafePanelLog({
        action: action,
        status: "error",
        gate_status: null,
        message: "button not found for " + action,
        output_dir: null,
        report_path: null,
        error: "button_not_found",
        details: { selectors: selectors }
      });
    }

    return boundCount;
  }

  function bindSafePanelV0106DirectIntakeControls() {
    ensurePipelineStatusSlots();
    ensureClipboardAutoWatchButton();

    bindSafePanelButton(["#sf-clear-exec-log-btn", "#safeClearLogButton"], "clear_log", clearSafePanelLog);
    bindSafePanelButton("#sf-refresh-status-btn", "refresh_status", function () {
      refreshSafePanelPipelineStatus({ trigger: "manual_button" });
    }, { optional: true });
    bindSafePanelButton("#sf-textarea-intake-btn", "textarea_intake", intakeSourceFromTextarea);
    bindSafePanelButton("#sf-clipboard-intake-btn", "clipboard_intake", intakeSourceFromClipboard);
    bindSafePanelButton("#sf-clipboard-auto-watch-btn", "clipboard_auto_watch_toggle", toggleClipboardAutoWatch, { optional: true });
    bindSafePanelButton("#sf-run-gate-btn", "gate", runSafePanelGate);
    bindSafePanelButton("#sf-materialize-btn", "materialize", materializeSafePanelSources);
    bindSafePanelButton("#sf-syntax-check-btn", "syntax_check", runSafePanelSyntaxCheck);
    bindSafePanelButton("#sf-open-latest-generated-btn", "open_latest_generated", openLatestSafePanelGenerated);

    refreshSafePanelPipelineStatus({ trigger: "panel_load" });
    startClipboardAutoWatch();
  }

  function bind() {
    ["commanderCount","workerCount","targetUrl","projectHomeUrl"].forEach(function(id){
      var el=$(id);
      if(el) el.addEventListener("input", function(){ el.__touched=true; });
    });

    $("launchButton").addEventListener("click", function() {
      run("지정 수량으로 열기 / 작업 시작", function() {
        return api.launch({
          commanderCount: toInt("commanderCount", 1),
          workerCount: toInt("workerCount", 6),
          url: getUrl(),
          projectHomeUrl: getProjectHomeUrl(),
          resetExisting: true
        });
      });
    });

    $("panelOnlyButton").addEventListener("click", function() {
      run("Panel Only", function() { return api.closeTerminals(); });
    });

    $("closeButton").addEventListener("click", function() {
      run("Worker/Commander 닫기", function() { return api.closeTerminals(); });
    });

    $("arrangeButton").addEventListener("click", function() {
      run("기본 배열 고정", function() { return api.arrange(); });
    });

    $("statusButton").addEventListener("click", function() {
      run("상태 확인", function() { return refreshStatus(); });
    });

    $("stateFolderButton").addEventListener("click", function() {
      run("설정 폴더 열기", function() { return api.openStateFolder(); });
    });

    $("projectFolderButton").addEventListener("click", function() {
      run("Project 폴더 열기", function() { return api.openProjectFolder(); });
    });

    bindSafePanelV0106DirectIntakeControls();
  }

  document.addEventListener("DOMContentLoaded", function() {
    bind();
    refreshStatus();
    setInterval(refreshStatus, 4000);
    log("SAFE Panel Only v0.10 terminal shell loaded.");
  });
}());


/* STAGE4_RENDERER_BINDING_PATCH_START */
(function initStage4StationButtonBindingsWhenReady() {
  function qs(selector) { return document.querySelector(selector); }
  function logStage4(level, message, detail) {
    var target = qs("#logPanel") || qs("#sf-safe-panel-log-output") || qs("#safePanelLog") || qs("pre.log") || qs("pre.sf4-log");
    var line = "[" + new Date().toISOString() + "] [" + level + "] " + message + (detail ? " " + JSON.stringify(detail) : "");
    if (target) target.textContent = String(target.textContent || "") + "\n" + line;
    if (level === "RED" && console && console.error) console.error(line);
    else if (level === "YELLOW" && console && console.warn) console.warn(line);
    else if (console && console.log) console.log(line);
  }
  function textValue(selectors) {
    for (var i = 0; i < selectors.length; i += 1) {
      var el = qs(selectors[i]);
      if (el && typeof el.value === "string") return el.value;
      if (el && typeof el.textContent === "string") return el.textContent;
    }
    return "";
  }
  function payload(binding) {
    /* ST4_W33_RENDERER_PROMPT_QUEUE_PAYLOAD_PATCH_START */
    var createdAt = new Date().toISOString();
    var safeBinding = binding || {};
    var apiMethod = String(safeBinding.method || "");
    var isInstruction = apiMethod === "generateNextInstruction";
    var isSender = apiMethod === "dispatchNextPrompt";
    var rawText = textValue([
      "#sf-safe-panel-source-textarea",
      "#safePanelSourceTextarea",
      "#sf-source-textarea",
      "#sf-direct-source-textarea",
      "#sf-taeo-raw-output",
      "#sf-raw-output-textarea",
      "textarea[data-sf-role='source-intake']",
      "textarea"
    ]);
    var promptText = String(rawText || "").trim() || (
      isSender
        ? "Stage4 sender dispatch prompt generated from SAFE Panel button."
        : isInstruction
          ? "Stage4 instruction prompt generated from SAFE Panel button."
          : ""
    );
    var promptPackageId = "STAGE4_RUNTIME_PROMPT_PACKAGE";
    var promptPackageVersion = "20260704.1";
    var workerSlot = isSender ? "W01" : isInstruction ? "COMMANDER" : "PANEL";
    var targetTerminal = isSender ? "WORKER" : isInstruction ? "COMMANDER" : "PANEL";
    var sendOrder = isSender ? 1 : 0;
    var promptId = "stage4_" + (apiMethod || "action") + "_" + createdAt.replace(/[-:.TZ]/g, "").slice(0, 14);
    var dedupeKey = [
      promptPackageId,
      promptPackageVersion,
      promptId,
      workerSlot,
      targetTerminal,
      promptText
    ].join("::");

    return {
      run_id: "stage4_renderer_" + createdAt.replace(/[-:.TZ]/g, "").slice(0, 14),
      station_id: safeBinding.station_id,
      contract_id: safeBinding.contract_id,
      requested_at: createdAt,
      source_terminal: "PANEL",
      payload_version: "0.2.0-prompt-queue",
      raw_text: rawText,
      text: rawText,
      action: apiMethod,
      source: "renderer-stage4-button-binding",
      createdAt: createdAt,
      prompt_package_id: promptPackageId,
      prompt_package_version: promptPackageVersion,
      prompt_id: promptId,
      worker_slot: workerSlot,
      worker_id: workerSlot,
      send_order: sendOrder,
      dedupe_key: dedupeKey,
      already_sent: false,
      sent_at: null,
      target_terminal: targetTerminal,
      prompt_text: promptText,
      dispatch_status: isSender ? "READY_TO_SEND" : "QUEUED",
      options: {
        renderer_binding: true,
        button_selector: safeBinding.selector,
        api_name: safeBinding.api_name,
        prompt_queue_payload: true
      }
    };
    /* ST4_W33_RENDERER_PROMPT_QUEUE_PAYLOAD_PATCH_END */
  }
  function bindOne(binding) {
    var button = qs(binding.selector);
    if (!button) {
      logStage4("INFO", "STAGE4_BINDING_SKIP_MISSING_BUTTON", { selector: binding.selector, api_name: binding.api_name });
      return false;
    }
    if (button.getAttribute("data-sf-stage4-bound") === "1") return true;
    button.addEventListener("click", function onStage4Click(event) {
      event.preventDefault();
      var apiRoot = window.sfApi && window.sfApi.stage4;
      if (!apiRoot || typeof apiRoot[binding.method] !== "function") {
        logStage4("YELLOW", "YELLOW_BINDING_API_NOT_READY", { selector: binding.selector, api_name: binding.api_name });
        return;
      }
      apiRoot[binding.method](payload(binding)).then(function(result) {
        logStage4("INFO", "STAGE4_BINDING_REQUEST_DONE", { selector: binding.selector, api_name: binding.api_name, status: result && result.status });
      }).catch(function(error) {
        logStage4("RED", "RED_RENDERER_BINDING_API_CALL_FAILED", { selector: binding.selector, api_name: binding.api_name, message: error && error.message ? error.message : String(error) });
      });
    });
    button.setAttribute("data-sf-stage4-bound", "1");
    logStage4("INFO", "STAGE4_BINDING_READY", { selector: binding.selector, api_name: binding.api_name });
    return true;
  }
  function bindAll() {
    [
      { contract_id: "ST4-C01-CLASSIFY-PANEL-INPUT", station_id: "STATION_01_CLASSIFICATION", selector: "#sf-stage4-classification-run-btn", method: "classifyPanelInput", api_name: "window.sfApi.stage4.classifyPanelInput" },
      { contract_id: "ST4-C02-VALIDATE-SOURCE-UNITS", station_id: "STATION_02_VALIDATION", selector: "#sf-stage4-validation-run-btn", method: "validateSourceUnits", api_name: "window.sfApi.stage4.validateSourceUnits" },
      { contract_id: "ST4-C03-COLLECT-WORKER-OUTPUT", station_id: "STATION_03_COLLECTION", selector: "#sf-stage4-collection-run-btn", method: "collectWorkerOutput", api_name: "window.sfApi.stage4.collectWorkerOutput" },
      { contract_id: "ST4-C04-APPEND-STATION-RECORDS", station_id: "STATION_04_STORAGE", selector: "#sf-stage4-storage-save-btn", method: "appendStationRecords", api_name: "window.sfApi.stage4.appendStationRecords" },
      { contract_id: "ST4-C05-GENERATE-NEXT-INSTRUCTION", station_id: "STATION_05_INSTRUCTION", selector: "#sf-stage4-instruction-generate-btn", method: "generateNextInstruction", api_name: "window.sfApi.stage4.generateNextInstruction" },
      { contract_id: "ST4-C06-DISPATCH-NEXT-PROMPT", station_id: "STATION_06_SENDER", selector: "#sf-stage4-sender-dispatch-next-btn", method: "dispatchNextPrompt", api_name: "window.sfApi.stage4.dispatchNextPrompt" },
      { contract_id: "ST4-C07-RUN-EXECUTION-CHECK", station_id: "STATION_07_EXECUTION", selector: "#sf-stage4-execution-run-check-btn", method: "runExecutionCheck", api_name: "window.sfApi.stage4.runExecutionCheck" },
      { contract_id: "ST4-C08-MANAGE-DOWNLOAD-RESOURCE", station_id: "STATION_08_DOWNLOAD", selector: "#sf-stage4-download-manage-btn", method: "manageDownloadResource", api_name: "window.sfApi.stage4.manageDownloadResource" },
      { contract_id: "ST4-C09-BUILD-ASSEMBLY-PLAN", station_id: "STATION_09_ASSEMBLY", selector: "#sf-stage4-assembly-build-plan-btn", method: "buildAssemblyPlan", api_name: "window.sfApi.stage4.buildAssemblyPlan" },
      { contract_id: "ST4-C10-GENERATE-DONE-LIGHT-REPORT", station_id: "STATION_10_REPORT", selector: "#sf-stage4-report-done-light-btn", method: "generateDoneLightReport", api_name: "window.sfApi.stage4.generateDoneLightReport" },
      { contract_id: "ST4-C11-REFRESH-CONTROL-STATE", station_id: "STATION_11_CONTROL", selector: "#sf-stage4-control-refresh-btn", method: "refreshControlState", api_name: "window.sfApi.stage4.refreshControlState" }
    ].forEach(bindOne);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindAll, { once: true });
  else bindAll();
}());
/* STAGE4_RENDERER_BINDING_PATCH_END */


/* ST4_W39_TAEO_AUTOSAVE_PHASE1_PATCH_START */
var SF_STAGE4_TAEO_AUTOSAVE_PHASE1 = window.SF_STAGE4_TAEO_AUTOSAVE_PHASE1 || {
  initialized: false,
  debounceMs: 1200,
  timer: null,
  lastTextHash: '',
  lastSavedAt: '',
  lastPayload: null,
  lastResult: null,
  lastError: null,
  saveCount: 0,
  skipCount: 0,
  sourceSelector: '#sf-safe-panel-source-textarea'
};

window.SF_STAGE4_TAEO_AUTOSAVE_PHASE1 = SF_STAGE4_TAEO_AUTOSAVE_PHASE1;

function sfStage4TaeoAutosaveNowIso() {
  return new Date().toISOString();
}

function sfStage4TaeoAutosaveNormalizeText(text) {
  return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function sfStage4TaeoAutosaveTextHash(text) {
  var value = sfStage4TaeoAutosaveNormalizeText(text);
  var hash = 2166136261;

  for (var index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function sfStage4TaeoAutosaveReadText(payloadInput) {
  if (payloadInput && typeof payloadInput.rawText === 'string') {
    return { ok: true, text: payloadInput.rawText, reason: 'payload_rawText' };
  }

  if (payloadInput && typeof payloadInput.raw_text === 'string') {
    return { ok: true, text: payloadInput.raw_text, reason: 'payload_raw_text' };
  }

  if (payloadInput && typeof payloadInput.text === 'string') {
    return { ok: true, text: payloadInput.text, reason: 'payload_text' };
  }

  var textarea = document.querySelector(SF_STAGE4_TAEO_AUTOSAVE_PHASE1.sourceSelector);

  if (!textarea) {
    return { ok: false, text: '', reason: 'source_textarea_not_found' };
  }

  return {
    ok: true,
    text: String(textarea.value || ''),
    reason: 'source_textarea_read'
  };
}

function sfStage4TaeoAutosaveReadContext(payloadInput) {
  var textarea = document.querySelector(SF_STAGE4_TAEO_AUTOSAVE_PHASE1.sourceSelector);
  var dataset = textarea && textarea.dataset ? textarea.dataset : {};
  var payload = payloadInput && typeof payloadInput === 'object' ? payloadInput : {};
  var stage4State = window.__sfStage4PromptQueueState || window.__sfStage4State || {};
  var activePrompt = stage4State.activePrompt || stage4State.currentPrompt || {};
  var activeWorker = stage4State.activeWorker || {};

  return {
    prompt_id: payload.prompt_id || payload.promptId || dataset.promptId || activePrompt.prompt_id || activePrompt.promptId || stage4State.prompt_id || 'TAEO_AUTOSAVE_UNLINKED_PROMPT',
    prompt_package_id: payload.prompt_package_id || payload.promptPackageId || activePrompt.prompt_package_id || activePrompt.promptPackageId || stage4State.prompt_package_id || 'TAEO_AUTOSAVE_RUNTIME_PACKAGE',
    prompt_package_version: payload.prompt_package_version || payload.promptPackageVersion || activePrompt.prompt_package_version || activePrompt.promptPackageVersion || stage4State.prompt_package_version || '20260704.1',
    worker_slot: payload.worker_slot || payload.workerSlot || dataset.workerSlot || activePrompt.worker_slot || activePrompt.workerSlot || activeWorker.worker_slot || activeWorker.workerSlot || 'TAEO_AUTOSAVE',
    worker_id: payload.worker_id || payload.workerId || dataset.workerId || activePrompt.worker_id || activePrompt.workerId || activeWorker.worker_id || activeWorker.workerId || 'WORKER_TAEO_AUTOSAVE_RUNTIME',
    source_terminal: payload.source_terminal || payload.sourceTerminal || 'TAEO',
    target_terminal: payload.target_terminal || payload.targetTerminal || 'COLLECTOR'
  };
}

function sfStage4TaeoAutosaveResolveReason(reason, payloadInput) {
  var value = String(reason || (payloadInput && (payloadInput.autosave_reason || payloadInput.autosaveReason)) || '').toUpperCase();

  if (value === 'MANUAL_CAPTURE' || value === 'AUTO_INTERVAL' || value === 'PROMPT_DISPATCH_RESULT' ||
    value === 'WORKER_OUTPUT_DETECTED' || value === 'COMMANDER_OUTPUT_DETECTED' ||
    value === 'BEFORE_TERMINAL_SWITCH' || value === 'BEFORE_PANEL_REFRESH' || value === 'RECOVERY_REPLAY') {
    return value;
  }

  if (value.indexOf('DEBUG') >= 0 || value.indexOf('MANUAL') >= 0 || (payloadInput && payloadInput.force === true)) {
    return 'MANUAL_CAPTURE';
  }

  if (value.indexOf('INPUT') >= 0 || value.indexOf('CHANGE') >= 0 || value.indexOf('DEBOUNCE') >= 0) {
    return 'AUTO_INTERVAL';
  }

  return 'AUTO_INTERVAL';
}

function sfStage4TaeoAutosaveBuildPayload(rawText, reason, payloadInput) {
  var now = sfStage4TaeoAutosaveNowIso();
  var context = sfStage4TaeoAutosaveReadContext(payloadInput);
  var normalizedText = sfStage4TaeoAutosaveNormalizeText(rawText);
  var textHash = sfStage4TaeoAutosaveTextHash([
    context.prompt_package_id,
    context.prompt_package_version,
    context.prompt_id,
    context.worker_slot,
    context.worker_id,
    context.source_terminal,
    normalizedText
  ].join('::'));

  var outputId = (payloadInput && (payloadInput.output_id || payloadInput.outputId)) ||
    'OUT_' + now.replace(/[-:.TZ]/g, '') + '_' + context.worker_slot + '_' + textHash;

  return {
    output_id: outputId,
    outputId: outputId,
    prompt_id: context.prompt_id,
    promptId: context.prompt_id,
    prompt_package_id: context.prompt_package_id,
    promptPackageId: context.prompt_package_id,
    prompt_package_version: context.prompt_package_version,
    promptPackageVersion: context.prompt_package_version,
    worker_slot: context.worker_slot,
    workerSlot: context.worker_slot,
    worker_id: context.worker_id,
    workerId: context.worker_id,
    source_terminal: context.source_terminal,
    target_terminal: context.target_terminal,
    raw_text: rawText,
    rawText: rawText,
    output_text: rawText,
    text: rawText,
    content: rawText,
    text_hash: textHash,
    textHash: textHash,
    captured_at: now,
    capturedAt: now,
    autosave_at: now,
    autosaveAt: now,
    autosave_reason: sfStage4TaeoAutosaveResolveReason(reason, payloadInput),
    duplicate_skipped: false,
    collector_status: 'PENDING',
    source_selector: SF_STAGE4_TAEO_AUTOSAVE_PHASE1.sourceSelector,
    source: 'TAEO_AUTOSAVE_PHASE1_RENDERER',
    target_stage: (payloadInput && payloadInput.target_stage) || 'STAGE4_CLASSIFIER_VALIDATION_PANEL_AUTOMATION',
    run_id: payloadInput && payloadInput.run_id ? payloadInput.run_id : null
  };
}

async function sfStage4TaeoAutosaveSaveNow(payloadInput, reasonInput) {
  var readResult = sfStage4TaeoAutosaveReadText(payloadInput);

  if (!readResult.ok) {
    SF_STAGE4_TAEO_AUTOSAVE_PHASE1.skipCount += 1;
    SF_STAGE4_TAEO_AUTOSAVE_PHASE1.lastError = readResult.reason;
    return { ok: false, skipped: true, duplicate_skipped: false, reason: readResult.reason };
  }

  var rawText = String(readResult.text || '');
  var trimmedText = rawText.trim();

  if (!trimmedText) {
    SF_STAGE4_TAEO_AUTOSAVE_PHASE1.skipCount += 1;
    return { ok: true, skipped: true, duplicate_skipped: false, collector_status: 'SKIPPED_DUPLICATE', reason: 'empty_text' };
  }

  var payload = sfStage4TaeoAutosaveBuildPayload(rawText, reasonInput || readResult.reason, payloadInput);
  var scopedTextHash = payload.text_hash;

  if (scopedTextHash === SF_STAGE4_TAEO_AUTOSAVE_PHASE1.lastTextHash && !(payloadInput && payloadInput.force === true)) {
    SF_STAGE4_TAEO_AUTOSAVE_PHASE1.skipCount += 1;
    var duplicatePayload = Object.assign({}, SF_STAGE4_TAEO_AUTOSAVE_PHASE1.lastPayload || payload, {
      duplicate_skipped: true,
      collector_status: 'SKIPPED_DUPLICATE',
      autosave_reason: payload.autosave_reason
    });

    SF_STAGE4_TAEO_AUTOSAVE_PHASE1.lastPayload = duplicatePayload;

    return {
      ok: true,
      skipped: true,
      duplicate_skipped: true,
      collector_status: 'SKIPPED_DUPLICATE',
      reason: 'duplicate_text_hash',
      payload: duplicatePayload,
      text_hash: scopedTextHash,
      output_id: duplicatePayload.output_id
    };
  }

  var stage4Api = window.sfApi && window.sfApi.stage4 ? window.sfApi.stage4 : null;

  if (!stage4Api || typeof stage4Api.collectWorkerOutput !== 'function') {
    SF_STAGE4_TAEO_AUTOSAVE_PHASE1.lastError = 'collectWorkerOutput_api_missing';
    SF_STAGE4_TAEO_AUTOSAVE_PHASE1.skipCount += 1;
    return { ok: false, skipped: true, duplicate_skipped: false, reason: 'collectWorkerOutput_api_missing', payload: payload };
  }

  try {
    var collectResult = await stage4Api.collectWorkerOutput(payload);
    var appendResult = null;
    var collectOk = !(collectResult && collectResult.ok === false);

    payload.collector_status = collectOk ? 'COLLECTED' : 'FAILED';

    if (typeof stage4Api.appendStationRecords === 'function') {
      try {
        appendResult = await stage4Api.appendStationRecords({
          source: 'TAEO_AUTOSAVE_PHASE1_RENDERER',
          station: 'STATION_04_STORAGE',
          record_type: 'TAEO_AUTOSAVE_PHASE1',
          recordType: 'TAEO_AUTOSAVE_PHASE1',
          payload: payload,
          output_id: payload.output_id,
          prompt_id: payload.prompt_id,
          worker_slot: payload.worker_slot,
          worker_id: payload.worker_id,
          autosave_at: sfStage4TaeoAutosaveNowIso(),
          created_at: sfStage4TaeoAutosaveNowIso()
        });
      } catch (appendError) {
        appendResult = {
          ok: false,
          error: appendError && appendError.message ? appendError.message : String(appendError)
        };
      }
    }

    SF_STAGE4_TAEO_AUTOSAVE_PHASE1.lastTextHash = scopedTextHash;
    SF_STAGE4_TAEO_AUTOSAVE_PHASE1.lastSavedAt = payload.autosave_at;
    SF_STAGE4_TAEO_AUTOSAVE_PHASE1.lastPayload = payload;
    SF_STAGE4_TAEO_AUTOSAVE_PHASE1.lastResult = { collectResult: collectResult, appendResult: appendResult };
    SF_STAGE4_TAEO_AUTOSAVE_PHASE1.lastError = appendResult && appendResult.ok === false ? appendResult.error : null;
    SF_STAGE4_TAEO_AUTOSAVE_PHASE1.saveCount += 1;

    return {
      ok: collectOk,
      skipped: false,
      duplicate_skipped: false,
      output_id: payload.output_id,
      outputId: payload.output_id,
      prompt_id: payload.prompt_id,
      promptId: payload.prompt_id,
      worker_slot: payload.worker_slot,
      workerSlot: payload.worker_slot,
      worker_id: payload.worker_id,
      workerId: payload.worker_id,
      text_hash: payload.text_hash,
      textHash: payload.text_hash,
      captured_at: payload.captured_at,
      capturedAt: payload.captured_at,
      autosave_at: payload.autosave_at,
      autosaveAt: payload.autosave_at,
      collector_status: payload.collector_status,
      payload: payload,
      collectResult: collectResult,
      appendResult: appendResult
    };
  } catch (error) {
    var message = error && error.message ? error.message : String(error);
    SF_STAGE4_TAEO_AUTOSAVE_PHASE1.lastError = message;
    console.warn('[Stage4 Taeo Autosave] save failed:', message);
    return { ok: false, skipped: false, duplicate_skipped: false, collector_status: 'FAILED', reason: 'autosave_api_call_failed', error: message, payload: payload };
  }
}

function sfStage4TaeoAutosaveSchedule(reason) {
  if (SF_STAGE4_TAEO_AUTOSAVE_PHASE1.timer) {
    clearTimeout(SF_STAGE4_TAEO_AUTOSAVE_PHASE1.timer);
  }

  SF_STAGE4_TAEO_AUTOSAVE_PHASE1.timer = setTimeout(function runAutosaveTimer() {
    SF_STAGE4_TAEO_AUTOSAVE_PHASE1.timer = null;
    sfStage4TaeoAutosaveSaveNow({}, reason || 'AUTO_INTERVAL').catch(function catchAutosaveError(error) {
      var message = error && error.message ? error.message : String(error);
      SF_STAGE4_TAEO_AUTOSAVE_PHASE1.lastError = message;
      console.warn('[Stage4 Taeo Autosave] unexpected error:', message);
    });
  }, SF_STAGE4_TAEO_AUTOSAVE_PHASE1.debounceMs);
}

function initializeStage4TaeoAutosavePhase1() {
  if (SF_STAGE4_TAEO_AUTOSAVE_PHASE1.initialized) {
    return { ok: true, initialized: true, reason: 'already_initialized' };
  }

  var textarea = document.querySelector(SF_STAGE4_TAEO_AUTOSAVE_PHASE1.sourceSelector);

  if (!textarea) {
    SF_STAGE4_TAEO_AUTOSAVE_PHASE1.lastError = 'source_textarea_not_found';
    return { ok: false, initialized: false, reason: 'source_textarea_not_found' };
  }

  textarea.addEventListener('input', function onTaeoAutosaveInput() {
    sfStage4TaeoAutosaveSchedule('AUTO_INTERVAL');
  });

  textarea.addEventListener('change', function onTaeoAutosaveChange() {
    sfStage4TaeoAutosaveSchedule('AUTO_INTERVAL');
  });

  SF_STAGE4_TAEO_AUTOSAVE_PHASE1.initialized = true;

  window.__sfStage4TaeoAutosaveDebug = {
    saveNow: function saveNow(payloadInput) {
      return sfStage4TaeoAutosaveSaveNow(payloadInput || {}, 'MANUAL_CAPTURE');
    },
    getState: function getState() {
      return {
        initialized: SF_STAGE4_TAEO_AUTOSAVE_PHASE1.initialized,
        debounceMs: SF_STAGE4_TAEO_AUTOSAVE_PHASE1.debounceMs,
        lastTextHash: SF_STAGE4_TAEO_AUTOSAVE_PHASE1.lastTextHash,
        text_hash: SF_STAGE4_TAEO_AUTOSAVE_PHASE1.lastTextHash,
        lastSavedAt: SF_STAGE4_TAEO_AUTOSAVE_PHASE1.lastSavedAt,
        autosave_at: SF_STAGE4_TAEO_AUTOSAVE_PHASE1.lastSavedAt,
        lastPayload: SF_STAGE4_TAEO_AUTOSAVE_PHASE1.lastPayload,
        lastResult: SF_STAGE4_TAEO_AUTOSAVE_PHASE1.lastResult,
        lastError: SF_STAGE4_TAEO_AUTOSAVE_PHASE1.lastError,
        saveCount: SF_STAGE4_TAEO_AUTOSAVE_PHASE1.saveCount,
        skipCount: SF_STAGE4_TAEO_AUTOSAVE_PHASE1.skipCount,
        sourceSelector: SF_STAGE4_TAEO_AUTOSAVE_PHASE1.sourceSelector
      };
    },
    schedule: function schedule(reason) {
      sfStage4TaeoAutosaveSchedule(reason || 'AUTO_INTERVAL');
      return { ok: true, scheduled: true };
    }
  };

  return { ok: true, initialized: true, reason: 'initialized' };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeStage4TaeoAutosavePhase1);
} else {
  initializeStage4TaeoAutosavePhase1();
}
/* ST4_W39_TAEO_AUTOSAVE_PHASE1_PATCH_END */


/* W55_PROJECT_PANEL_UI_BINDING_RENDERER_START */
(function attachW55ProjectPanelIdentitySummaryRenderer() {
  "use strict";

  function toDisplayText(value) {
    if (value === null || typeof value === "undefined" || value === "") return "-";
    if (typeof value === "object") {
      try { return JSON.stringify(value); } catch (error) { return "[object]"; }
    }
    return String(value);
  }

  function readIdentity(source) {
    const base = source && typeof source === "object" ? source : {};
    const nested = base.project_panel_identity && typeof base.project_panel_identity === "object"
      ? base.project_panel_identity
      : {};
    return {
      project_id: base.project_id || nested.project_id || null,
      project_name: base.project_name || nested.project_name || null,
      panel_id: base.panel_id || nested.panel_id || null,
      panel_instance_id: base.panel_instance_id || nested.panel_instance_id || null,
      project_panel_identity: base.project_panel_identity || nested || null
    };
  }

  function findIdentitySource() {
    const candidates = [
      window.__SF_PROJECT_PANEL_IDENTITY__,
      window.__SF_PROJECT_PANEL_IDENTITY_SUMMARY__,
      window.__SF_STAGE4_PROJECT_PANEL_IDENTITY__,
      window.__SF_LAST_GATE_REPORT_SUMMARY__,
      window.__SF_LAST_COLLECTOR_COMMANDER_GATE_HANDOFF__,
      window.__SF_LAST_SELECTED_PROMPT__,
      window.selectedPrompt
    ];
    for (const candidate of candidates) {
      if (candidate && typeof candidate === "object") {
        if (candidate.project_id || candidate.project_name || candidate.panel_id || candidate.panel_instance_id || candidate.project_panel_identity) {
          return candidate;
        }
      }
    }
    return {};
  }

  function renderProjectPanelIdentitySummary(identitySource) {
    const container = document.getElementById("sf-project-panel-identity-summary");
    if (!container) return false;

    const identity = readIdentity(identitySource || findIdentitySource());
    const fields = ["project_id", "project_name", "panel_id", "panel_instance_id", "project_panel_identity"];
    for (const field of fields) {
      const node = container.querySelector("[data-project-panel-field=\"" + field + "\"]");
      if (node) node.textContent = toDisplayText(identity[field]);
    }

    container.setAttribute("data-sf-project-id", identity.project_id || "");
    container.setAttribute("data-sf-panel-id", identity.panel_id || "");
    container.setAttribute("data-sf-panel-instance-id", identity.panel_instance_id || "");
    return true;
  }

  window.__sfRenderProjectPanelIdentitySummary = renderProjectPanelIdentitySummary;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function onW55ProjectPanelIdentityReady() {
      renderProjectPanelIdentitySummary();
    });
  } else {
    renderProjectPanelIdentitySummary();
  }

  document.addEventListener("sf-project-panel-identity-updated", function onW55ProjectPanelIdentityUpdated(event) {
    renderProjectPanelIdentitySummary(event && event.detail ? event.detail : null);
  });
}());
/* W55_PROJECT_PANEL_UI_BINDING_RENDERER_END */

/* W57_RENDERER_HYDRATION_BINDING_START */
(function sfW57ProjectPanelIdentityHydrationBinding() {
  "use strict";

  var BINDING_ID = "W57_RENDERER_HYDRATION_BINDING_V1";
  var state = window.__sfW57ProjectPanelIdentityHydrationState || {
    binding_id: BINDING_ID,
    bound: false,
    last_response: null,
    last_result: null,
    warnings: []
  };

  window.__sfW57ProjectPanelIdentityHydrationState = state;

  function pushWarning(message, details) {
    var warning = {
      binding_id: BINDING_ID,
      message: String(message || "unknown warning"),
      details: details || null,
      at: new Date().toISOString()
    };
    state.warnings.push(warning);

    try {
      var container = document.getElementById("sf-project-panel-identity-summary");
      if (container) {
        container.setAttribute("data-w57-hydration-status", "warning");
        container.setAttribute("data-w57-hydration-warning", warning.message);
      }
    } catch (_domError) {}

    try {
      if (window.console && typeof window.console.warn === "function") {
        window.console.warn("[W57 Project Panel Identity Hydration]", warning.message, warning.details || "");
      }
    } catch (_consoleError) {}

    return warning;
  }

  function safeJson(value) {
    try {
      return JSON.stringify(value || {});
    } catch (_jsonError) {
      return "{}";
    }
  }

  function normalizeText(value) {
    if (value === null || value === undefined || value === "") {
      return "-";
    }
    if (typeof value === "object") {
      return safeJson(value);
    }
    return String(value);
  }

  function normalizeIdentityPayload(response) {
    var projectPanelIdentity =
      response && typeof response.project_panel_identity === "object" && response.project_panel_identity !== null
        ? response.project_panel_identity
        : {};

    return {
      project_id: response && response.project_id !== undefined ? response.project_id : projectPanelIdentity.project_id,
      project_name: response && response.project_name !== undefined ? response.project_name : projectPanelIdentity.project_name,
      panel_id: response && response.panel_id !== undefined ? response.panel_id : projectPanelIdentity.panel_id,
      panel_instance_id:
        response && response.panel_instance_id !== undefined
          ? response.panel_instance_id
          : projectPanelIdentity.panel_instance_id,
      project_panel_identity: projectPanelIdentity,
      source: response && response.source ? response.source : "window.sfApi.stage4.getProjectPanelIdentity"
    };
  }

  function updateField(fieldName, value) {
    var selector = '[data-project-panel-field="' + fieldName + '"]';
    var nodes = document.querySelectorAll(selector);
    for (var index = 0; index < nodes.length; index += 1) {
      nodes[index].textContent = normalizeText(value);
      nodes[index].setAttribute("data-w57-hydrated", "true");
    }
  }

  function fallbackRenderProjectPanelIdentity(payload) {
    updateField("project_id", payload.project_id);
    updateField("project_name", payload.project_name);
    updateField("panel_id", payload.panel_id);
    updateField("panel_instance_id", payload.panel_instance_id);
    updateField("project_panel_identity", payload.project_panel_identity);
  }

  function renderProjectPanelIdentity(response) {
    var payload = normalizeIdentityPayload(response);

    if (typeof window.__sfRenderProjectPanelIdentitySummary === "function") {
      try {
        window.__sfRenderProjectPanelIdentitySummary(payload);
        state.last_result = {
          ok: true,
          renderer: "__sfRenderProjectPanelIdentitySummary",
          payload: payload,
          at: new Date().toISOString()
        };
        return;
      } catch (renderFunctionError) {
        pushWarning("Existing Project Panel Identity render function failed; fallback DOM rendering was used.", {
          error: renderFunctionError && renderFunctionError.message ? renderFunctionError.message : String(renderFunctionError)
        });
      }
    }

    fallbackRenderProjectPanelIdentity(payload);
    state.last_result = {
      ok: true,
      renderer: "data-project-panel-field",
      payload: payload,
      at: new Date().toISOString()
    };
  }

  function getProjectPanelIdentityGetter() {
    if (
      window.sfApi &&
      window.sfApi.stage4 &&
      typeof window.sfApi.stage4.getProjectPanelIdentity === "function"
    ) {
      return window.sfApi.stage4.getProjectPanelIdentity;
    }
    return null;
  }

  function hydrateProjectPanelIdentity() {
    var getter = getProjectPanelIdentityGetter();

    if (!getter) {
      pushWarning("window.sfApi.stage4.getProjectPanelIdentity is not available yet. Existing fallback values are preserved.", {
        expected_getter: "window.sfApi.stage4.getProjectPanelIdentity"
      });
      return Promise.resolve({ ok: false, reason: "getter_unavailable" });
    }

    return Promise.resolve()
      .then(function invokeGetter() {
        return getter({
          request_source: "safe_panel_renderer",
          binding_id: BINDING_ID
        });
      })
      .then(function handleResponse(response) {
        state.last_response = response || null;
        if (response && response.ok === true) {
          renderProjectPanelIdentity(response);
          return response;
        }
        pushWarning("Project Panel Identity getter returned non-ok response. Existing fallback values are preserved.", {
          response: response || null
        });
        return response || { ok: false, reason: "empty_response" };
      })
      .catch(function handleHydrationError(error) {
        pushWarning("Project Panel Identity hydration failed. Existing fallback values are preserved.", {
          error: error && error.message ? error.message : String(error)
        });
        return { ok: false, reason: "hydration_exception" };
      });
  }

  function scheduleHydration() {
    if (typeof window.queueMicrotask === "function") {
      window.queueMicrotask(function runHydrationMicrotask() {
        hydrateProjectPanelIdentity();
      });
      return;
    }
    Promise.resolve().then(function runHydrationPromiseTask() {
      hydrateProjectPanelIdentity();
    });
  }

  if (!state.bound) {
    state.bound = true;
    state.hydrate = hydrateProjectPanelIdentity;
    window.__sfHydrateProjectPanelIdentityFromW57Bridge = hydrateProjectPanelIdentity;

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", scheduleHydration, { once: true });
    } else {
      scheduleHydration();
    }

    window.addEventListener("sf:stage4-project-panel-identity-refresh", function onProjectPanelIdentityRefresh() {
      hydrateProjectPanelIdentity();
    }, false);
  }
}());
/* W57_RENDERER_HYDRATION_BINDING_END */

/* W58_OPERATOR_UNAVAILABLE_MARKER_V58_1_4_START */
(function sfW58InstallOperatorUnavailableMarker() {
  'use strict';

  var MARKER_VERSION = 'W58_OPERATOR_UNAVAILABLE_MARKER_V58_1_4';
  var WARNING_TEXT = 'Project Panel Identity 값 소스 없음(source:not_found). 브리지는 정상입니다.';

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function hasValue(value) {
    return value !== undefined && value !== null && String(value).trim() !== '' && String(value).trim() !== '-' && String(value).trim() !== '{}';
  }

  function hasIdentityValue(response) {
    if (!isObject(response)) return false;
    if (hasValue(response.project_id) || hasValue(response.project_name) || hasValue(response.panel_id) || hasValue(response.panel_instance_id)) {
      return true;
    }
    if (isObject(response.project_panel_identity) && Object.keys(response.project_panel_identity).length > 0) {
      return true;
    }
    return false;
  }

  function isUnavailable(response) {
    if (!isObject(response)) return false;
    if (response.source_found === false || response.sourceFound === false) return true;
    if (response.unavailable === true || response.status === 'unavailable') return true;
    if (response.source === 'not_found') return true;
    if (response.ok === false && !hasIdentityValue(response)) return true;
    return false;
  }

  function findContainer() {
    return document.getElementById('sf-project-panel-identity-summary') ||
      document.querySelector('[data-project-panel-identity]') ||
      document.querySelector('[data-sf-project-panel-identity]') ||
      document.querySelector('[data-w55-project-panel-identity]') ||
      document.querySelector('[data-w57-project-panel-identity]');
  }

  function ensureWarningNode(container) {
    if (!container || typeof container.querySelector !== 'function') return null;
    var node = container.querySelector('[data-project-panel-warning]');
    if (!node) {
      node = document.createElement('div');
      node.setAttribute('data-project-panel-warning', '');
      node.setAttribute('data-w58-operator-unavailable-state', 'visible');
      node.setAttribute('role', 'status');
      node.setAttribute('aria-live', 'polite');
      node.className = 'sf-project-panel-identity-warning';
      container.appendChild(node);
    }
    return node;
  }

  function renderWarning(response) {
    var container = findContainer();
    if (!container) return false;
    var node = ensureWarningNode(container);
    if (!node) return false;

    if (isUnavailable(response)) {
      container.setAttribute('data-project-panel-source-state', 'not_found');
      container.setAttribute('data-w58-operator-unavailable-state', 'visible');
      node.setAttribute('data-project-panel-warning', 'source:not_found');
      node.setAttribute('data-project-panel-source-state', 'not_found');
      node.textContent = WARNING_TEXT;
      return true;
    }

    container.setAttribute('data-project-panel-source-state', 'available');
    node.setAttribute('data-project-panel-warning', '');
    node.setAttribute('data-project-panel-source-state', 'available');
    node.textContent = '';
    return true;
  }

  function getGetter() {
    try {
      return window && window.sfApi && window.sfApi.stage4 && typeof window.sfApi.stage4.getProjectPanelIdentity === 'function'
        ? window.sfApi.stage4.getProjectPanelIdentity
        : null;
    } catch (_e) {
      return null;
    }
  }

  function hydrateWarningOnce() {
    var getter = getGetter();
    if (!getter) return false;
    try {
      Promise.resolve(getter.call(window.sfApi.stage4)).then(function onIdentityResponse(response) {
        renderWarning(response);
      }).catch(function onIdentityError(error) {
        renderWarning({ ok: false, source: 'not_found', warnings: [String(error && error.message ? error.message : error)] });
      });
      return true;
    } catch (error) {
      renderWarning({ ok: false, source: 'not_found', warnings: [String(error && error.message ? error.message : error)] });
      return true;
    }
  }

  function scheduleHydration() {
    var attempts = 0;
    var maxAttempts = 30;
    function tick() {
      attempts += 1;
      if (hydrateWarningOnce()) return;
      if (attempts < maxAttempts) {
        setTimeout(tick, 500);
      }
    }
    tick();
  }

  try {
    window.__SF_W58_RENDER_PROJECT_PANEL_IDENTITY_UNAVAILABLE_WARNING__ = renderWarning;
    window.__SF_W58_OPERATOR_UNAVAILABLE_MARKER_VERSION__ = MARKER_VERSION;
  } catch (_e) {}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleHydration, { once: true });
  } else {
    scheduleHydration();
  }
})();
/* W58_OPERATOR_UNAVAILABLE_MARKER_V58_1_4_END */

/* W59_PROJECT_PANEL_IDENTITY_OPERATOR_VISIBILITY_POLISH_START */
(function installW59ProjectPanelIdentityOperatorVisibilityPolish() {
  'use strict';

  if (typeof document === 'undefined') return;

  var SHORT_WARNING_TEXT = "Project Panel Identity 값 소스 없음(source:not_found). 브리지는 정상입니다.";
  var DETAIL_WARNING_TEXT = "현재 프로젝트 메타데이터 값만 아직 확인되지 않았습니다.";
  var WARNING_ATTR = 'data-project-panel-warning';
  var SOURCE_STATE_ATTR = 'data-project-panel-source-state';
  var W59_ATTR = 'data-w59-operator-visibility-polish';
  var normalizing = false;
  var scheduled = false;

  function toArray(value) {
    return Array.prototype.slice.call(value || []);
  }

  function textOf(node) {
    return String(node && node.textContent ? node.textContent : '').replace(/\s+/g, ' ').trim();
  }

  function isNotFoundText(value) {
    return /source\s*:\s*not_found|source:not_found|not_found|값 소스 없음/i.test(String(value || ''));
  }

  function findContainer() {
    return document.getElementById('sf-project-panel-identity-summary') ||
      document.querySelector('[data-project-panel-identity]') ||
      document.querySelector('[data-project-panel-identity-container]') ||
      document.querySelector('[data-stage4-project-panel-identity]') ||
      document.querySelector('#project-panel-identity') ||
      null;
  }

  function findWarningNodes(container) {
    if (!container) return [];
    var out = [];
    if (container.hasAttribute && container.hasAttribute(WARNING_ATTR)) out.push(container);
    toArray(container.querySelectorAll('[' + WARNING_ATTR + ']')).forEach(function (node) {
      if (out.indexOf(node) === -1) out.push(node);
    });
    return out;
  }

  function readSourceState(container, warningNodes) {
    if (!container) return '';
    var direct = container.getAttribute(SOURCE_STATE_ATTR) || container.getAttribute('data-project-panel-identity-source-state') || '';
    if (direct) return direct;
    for (var i = 0; i < warningNodes.length; i += 1) {
      var node = warningNodes[i];
      var value = node.getAttribute(SOURCE_STATE_ATTR) || node.getAttribute('data-project-panel-identity-source-state') || node.getAttribute(WARNING_ATTR) || textOf(node);
      if (value) return value;
    }
    return '';
  }

  function ensureWarningNode(container, warningNodes) {
    if (!container) return null;
    if (warningNodes.length > 0) return warningNodes[0];
    var node = document.createElement('div');
    node.setAttribute(WARNING_ATTR, 'source:not_found');
    node.setAttribute(SOURCE_STATE_ATTR, 'not_found');
    node.setAttribute(W59_ATTR, 'true');
    container.appendChild(node);
    return node;
  }

  function writeWarning(node) {
    if (!node) return;
    while (node.firstChild) node.removeChild(node.firstChild);
    node.setAttribute(WARNING_ATTR, 'source:not_found');
    node.setAttribute(SOURCE_STATE_ATTR, 'not_found');
    node.setAttribute(W59_ATTR, 'true');
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
    node.removeAttribute('aria-hidden');
    node.hidden = false;

    var main = document.createElement('span');
    main.setAttribute('data-project-panel-warning-main', 'w59');
    main.textContent = SHORT_WARNING_TEXT;
    node.appendChild(main);

    node.appendChild(document.createElement('br'));

    var detail = document.createElement('span');
    detail.setAttribute('data-project-panel-warning-detail', 'w59');
    detail.textContent = DETAIL_WARNING_TEXT;
    node.appendChild(detail);
  }

  function clearWarning(node) {
    if (!node) return;
    node.hidden = true;
    node.setAttribute('aria-hidden', 'true');
    node.setAttribute(W59_ATTR, 'true');
  }

  function normalize() {
    if (normalizing) return;
    normalizing = true;
    try {
      var container = findContainer();
      if (!container) return;
      var warningNodes = findWarningNodes(container);
      var sourceState = readSourceState(container, warningNodes);
      var shouldShow = isNotFoundText(sourceState) || warningNodes.some(function (node) { return isNotFoundText(textOf(node)); });

      if (shouldShow) {
        container.setAttribute(SOURCE_STATE_ATTR, 'not_found');
        writeWarning(ensureWarningNode(container, warningNodes));
        return;
      }

      warningNodes.forEach(clearWarning);
    } finally {
      normalizing = false;
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    var run = function () {
      scheduled = false;
      normalize();
    };
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(run);
    else setTimeout(run, 0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once: true });
  else schedule();

  if (typeof MutationObserver !== 'undefined' && document.body) {
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
  }
}());
/* W59_PROJECT_PANEL_IDENTITY_OPERATOR_VISIBILITY_POLISH_END */

// W60_R13F_H_LIFECYCLE_EVENT_PRODUCER_START
(function __w60R13fInstallProjectPanelLifecycleEventProducer() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__w60R13fProjectPanelLifecycleEventProducerInstalled === true) return;
  window.__w60R13fProjectPanelLifecycleEventProducerInstalled = true;

  function __w60R13fStringOrNull(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, 256) : null;
  }

  function __w60R13fFindProjectPanelNode(target) {
    if (!target || typeof target.closest !== 'function') return null;
    return target.closest([
      '#sf-project-panel-identity-summary',
      '[data-project-panel-identity]',
      '[data-project-panel-identity-container]',
      '[data-stage4-project-panel-identity]',
      '[data-stage4-project-panel-identity-container]',
      '[data-project-panel-id]',
      '[data-panel-id]',
      '[data-project-id]',
      '[data-project-name]',
      '[data-role="project-panel"]',
      '.sf-project-panel-identity-summary',
      '.project-panel-identity',
      '.project-panel'
    ].join(','));
  }

  function __w60R13fPayloadFromNode(node, eventType) {
    if (!node) return null;
    const dataset = node.dataset || {};
    return {
      __w60_r13f_project_panel_lifecycle: true,
      lifecycle_event: {
        event_type: eventType,
        panel_id: __w60R13fStringOrNull(dataset.projectPanelId || dataset.panelId || node.getAttribute('data-project-panel-id') || node.getAttribute('data-panel-id')),
        project_id: __w60R13fStringOrNull(dataset.projectId || node.getAttribute('data-project-id')),
        project_name: __w60R13fStringOrNull(dataset.projectName || node.getAttribute('data-project-name')),
        occurred_at: new Date().toISOString()
      }
    };
  }

  function __w60R13fSendLifecyclePayload(payload) {
    const stage4Api = window.sfApi && window.sfApi.stage4;
    const getter = stage4Api && stage4Api.getProjectPanelIdentity;
    if (typeof getter !== 'function' || !payload) return;
    Promise.resolve(getter(payload)).catch(function () {});
  }

  document.addEventListener('click', function (event) {
    const node = __w60R13fFindProjectPanelNode(event.target);
    if (!node) return;
    __w60R13fSendLifecyclePayload(__w60R13fPayloadFromNode(node, 'renderer_project_panel_click'));
  }, true);

  document.addEventListener('focusin', function (event) {
    const node = __w60R13fFindProjectPanelNode(event.target);
    if (!node) return;
    __w60R13fSendLifecyclePayload(__w60R13fPayloadFromNode(node, 'renderer_project_panel_focus'));
  }, true);

  document.addEventListener('w60-r13f-project-panel-lifecycle', function (event) {
    const detail = event && event.detail && typeof event.detail === 'object' ? event.detail : null;
    if (!detail) return;
    __w60R13fSendLifecyclePayload({
      __w60_r13f_project_panel_lifecycle: true,
      lifecycle_event: {
        event_type: __w60R13fStringOrNull(detail.event_type) || 'renderer_project_panel_lifecycle',
        panel_id: __w60R13fStringOrNull(detail.panel_id),
        project_id: __w60R13fStringOrNull(detail.project_id),
        project_name: __w60R13fStringOrNull(detail.project_name),
        occurred_at: new Date().toISOString()
      }
    });
  }, true);
}());
// W60_R13F_H_LIFECYCLE_EVENT_PRODUCER_END
