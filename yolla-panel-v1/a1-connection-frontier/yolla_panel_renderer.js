(function yollaPanelCommandCycle() {
  "use strict";

  const api = window.yollaPanel;
  const providerRegistry = new Map();
  const AUTO_CYCLE_KEY = "yolla.panel.commandCycleV2.autoRunCompleted";
  const state = { registry: null, runtime: null, latestCycle: null, autoCycleRunning: false };

  function byId(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
  function emit(name, detail) { window.dispatchEvent(new CustomEvent(name, { detail })); }
  function registerProvider(providerId, provider) {
    if (typeof providerId !== "string" || !providerId.trim()) throw new TypeError("providerId is required");
    if (typeof provider !== "function") throw new TypeError("provider must be a function");
    providerRegistry.set(providerId, provider);
    emit("yolla:provider-registered", { provider_id: providerId });
    return true;
  }
  function cycleTone(status) {
    const value = String(status || "").toUpperCase();
    if (value.includes("PASS")) return "pass";
    if (value.includes("BLOCK") || value.includes("FAIL")) return "fail";
    return "open";
  }
  function stageLabel(stage) {
    return ({
      COMMAND_CREATED: "1. 커맨더 명령 생성",
      EXISTING_STAGE4_DISPATCH_ACCEPTED: "2. 기존 Stage4 전송 수락",
      WORKER_RECEIVED: "3. 워커 명령 수신",
      WORKER_ACKNOWLEDGED: "4. 워커 Canary 결과 반환",
      COMMANDER_RESULT_RECEIVED: "5. 커맨더 결과 수신",
      CYCLE_BLOCKED: "순환 차단"
    })[stage] || stage;
  }
  function commanders() { return state.registry.roles.filter((role) => String(role.role_type).includes("COMMANDER")); }
  function workers() { return state.registry.roles.filter((role) => role.role_type === "WORKER"); }
  function optionList(items, selectedId) {
    return items.map((role) => `<option value="${esc(role.role_id)}" ${role.role_id === selectedId ? "selected" : ""}>${esc(role.role_id)} · ${esc(role.role_name)}</option>`).join("");
  }

  function renderSidebar() {
    const root = byId("yolla-panel-role-menu");
    if (!root || !state.registry) return;
    const workspace = state.runtime && state.runtime.workspace;
    const stage4 = state.runtime && state.runtime.existing_stage4_transport_bound;
    const pc = state.runtime && state.runtime.pc_agent;
    root.innerHTML = [
      '<div class="yolla-panel-status-stack">',
      `<div class="yolla-connector ${workspace ? "pass" : "open"}"><span>워크스페이스</span><strong>${workspace ? "OPEN" : "CLOSED"}</strong></div>`,
      `<div class="yolla-connector ${stage4 ? "pass" : "fail"}"><span>Stage4 전송소</span><strong>${stage4 ? "BOUND" : "UNAVAILABLE"}</strong></div>`,
      `<div class="yolla-connector ${pc && pc.connected ? "pass" : "open"}"><span>PC Agent</span><strong>${pc && pc.connected ? "CONNECTED" : "WAITING"}</strong></div>`,
      `<div class="yolla-connector pass"><span>역할 Registry</span><strong>${state.registry.roles.length} ROLES</strong></div>`,
      '</div>',
      '<button type="button" class="yolla-primary-action" data-yolla-action="open-workspace">커맨더·워커 워크스페이스 열기</button>',
      '<p class="yolla-panel-note">역할별 창을 패널에서 배정하지 않습니다. 한 워커창 안에 전체 커맨더·워커 그룹을 표시합니다.</p>'
    ].join("");
  }

  function renderCycleTimeline() {
    const cycle = state.latestCycle;
    if (!cycle) return '<ol class="yolla-cycle-timeline"><li>아직 실행된 순환이 없습니다.</li></ol>';
    return `<ol class="yolla-cycle-timeline">${(cycle.events || []).map((event) => `<li class="${cycleTone(event.status)}"><strong>${esc(stageLabel(event.stage))}</strong><span>${esc(event.status)}</span></li>`).join("")}</ol>`;
  }

  function renderWorkspace() {
    const root = byId("yolla-panel-workspace");
    if (!root || !state.registry) return;
    const cycle = state.latestCycle;
    root.innerHTML = [
      '<div class="yolla-role-header">',
      '<div><span class="yolla-kicker">MINIMUM VERTICAL CYCLE</span><h2>커맨더 → 워커 → 커맨더 1회 순환</h2><p>업무 기능은 실행하지 않고 연결과 결과 회신만 검증합니다.</p></div>',
      `<div class="yolla-binding-summary"><strong class="${cycleTone(cycle && cycle.status)}">${esc(cycle ? cycle.status : "WAITING")}</strong><small>${esc(cycle ? cycle.cycle_id : "Canary cycle not started")}</small></div>`,
      '</div>',
      '<div class="yolla-cycle-form">',
      `<label>커맨더<select id="yolla-cycle-commander">${optionList(commanders(), "A-1")}</select></label>`,
      `<label>대상 워커<select id="yolla-cycle-worker">${optionList(workers(), "A-3")}</select></label>`,
      '<label class="wide">명령<textarea id="yolla-cycle-command" rows="4">최신 지시를 읽고 작업을 수행하라.</textarea></label>',
      '</div>',
      '<div class="yolla-action-grid yolla-cycle-actions">',
      '<button type="button" data-yolla-action="open-workspace">워크스페이스 열기·포커스</button>',
      '<button type="button" data-yolla-action="run-cycle">1회 명령 순환 실행</button>',
      '<button type="button" data-yolla-action="refresh">상태 새로고침</button>',
      '</div>',
      '<section class="yolla-cycle-result"><h3>순환 상태</h3>',
      renderCycleTimeline(),
      cycle ? `<pre>${esc(JSON.stringify({ status: cycle.status, commander: cycle.commander_role_id, worker: cycle.worker_role_id, canary_result: cycle.canary_result || null, business_execution_performed: cycle.business_execution_performed }, null, 2))}</pre>` : '',
      '</section>',
      '<div class="yolla-card-grid">',
      '<article class="yolla-state-card"><h3>이번 단계가 증명하는 것</h3><p>패널, 단일 그룹 워커창, 역할 Registry, 기존 Stage4 명령 수락, 워커 수신, 커맨더 결과 회신.</p></article>',
      '<article class="yolla-state-card"><h3>이번 단계에서 하지 않는 것</h3><p>GPT 자동입력, 실제 업무 판단, 다중 워커 병렬화, Production 실행.</p></article>',
      '</div>',
      '<pre id="yolla-panel-event-log" class="yolla-event-log" aria-live="polite"></pre>'
    ].join("");
  }

  function render() { renderSidebar(); renderWorkspace(); }
  function logEvent(label, payload) {
    const log = byId("yolla-panel-event-log");
    if (log) log.textContent = JSON.stringify({ at: new Date().toISOString(), event: label, payload }, null, 2);
  }
  async function refresh() {
    state.runtime = await api.getRuntime();
    state.latestCycle = await api.getLatestCycle();
    render();
    emit("yolla:runtime-refreshed", state.runtime);
  }
  async function openWorkspace() {
    const existing = state.runtime && state.runtime.workspace;
    const result = existing && typeof api.focusWorkspace === "function"
      ? await api.focusWorkspace()
      : await api.openWorkspace({ url: state.registry.default_worker_url, project_home_url: state.registry.default_worker_url });
    await refresh();
    logEvent("YOLLA_WORKSPACE_OPEN", result);
    emit("yolla:worker-window-bound", result);
    return result;
  }
  async function runCycle(payload) {
    await openWorkspace();
    const commanderElement = byId("yolla-cycle-commander");
    const workerElement = byId("yolla-cycle-worker");
    const commandElement = byId("yolla-cycle-command");
    const request = payload || {
      commander_role_id: commanderElement.value,
      worker_role_id: workerElement.value,
      command_text: commandElement.value.trim()
    };
    emit("yolla:command-requested", request);
    const cycle = await api.runCycleOnce(request);
    state.latestCycle = cycle;
    await refresh();
    logEvent("YOLLA_COMMAND_CYCLE_RESULT", cycle);
    emit("yolla:command-dispatched", cycle);
    return cycle;
  }
  async function autoRunInitialCycle() {
    if (state.autoCycleRunning) return null;
    if (localStorage.getItem(AUTO_CYCLE_KEY) === "PASS") return state.latestCycle;
    state.autoCycleRunning = true;
    try {
      const cycle = await runCycle({
        commander_role_id: "A-1",
        worker_role_id: "A-3",
        command_text: "최신 지시를 읽고 작업을 수행하라."
      });
      if (cycle && cycle.status === "PASS") localStorage.setItem(AUTO_CYCLE_KEY, "PASS");
      return cycle;
    } catch (error) {
      logEvent("AUTO_CYCLE_FAILED", { code: error && error.code, message: error && error.message });
      return null;
    } finally {
      state.autoCycleRunning = false;
    }
  }
  function attachEvents() {
    const shell = byId("yolla-panel-shell");
    if (!shell) return;
    shell.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-yolla-action]");
      if (!button) return;
      button.disabled = true;
      try {
        if (button.dataset.yollaAction === "open-workspace") await openWorkspace();
        if (button.dataset.yollaAction === "run-cycle") await runCycle();
        if (button.dataset.yollaAction === "refresh") await refresh();
      } catch (error) {
        logEvent("ACTION_FAILED", { code: error && error.code, message: error && error.message });
        emit("yolla:action-failed", { code: error && error.code, message: error && error.message });
      } finally {
        button.disabled = false;
      }
    });
  }
  async function bootstrap() {
    if (!api || typeof api.getRegistry !== "function") throw new Error("YOLLA_PANEL_PRELOAD_UNAVAILABLE");
    state.registry = await api.getRegistry();
    attachEvents();
    await refresh();
    emit("yolla:panel-ready", { role_count: state.registry.roles.length, group_count: state.registry.groups.length });
    window.setTimeout(() => autoRunInitialCycle(), 800);
  }

  window.YollaPanel = Object.freeze({
    registerProvider,
    hasProvider: (id) => providerRegistry.has(id),
    refresh,
    openWorkspace,
    runCycleOnce: (payload) => api.runCycleOnce(payload),
    autoRunInitialCycle,
    getRuntime: () => state.runtime,
    getLatestCycle: () => state.latestCycle
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => bootstrap().catch(console.error));
  else bootstrap().catch(console.error);
}());
