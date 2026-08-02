(function yollaPanelConnectionFrontier() {
  "use strict";

  const api = window.yollaPanel;
  const providerRegistry = new Map();
  const state = { registry: null, runtime: null, selectedRoleId: null, collapsedGroups: new Set() };

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
  function roleById(roleId) { return state.registry && state.registry.roles.find((role) => role.role_id === roleId); }
  function selectedRole() { return roleById(state.selectedRoleId) || (state.registry && state.registry.roles[0]) || null; }
  function bindingFor(roleId) { return state.runtime && state.runtime.bindings.find((binding) => binding.role_id === roleId); }

  function registerProvider(providerId, provider) {
    if (typeof providerId !== "string" || !providerId.trim()) throw new TypeError("providerId is required");
    if (typeof provider !== "function") throw new TypeError("provider must be a function");
    providerRegistry.set(providerId, provider);
    render();
    emit("yolla:provider-registered", { provider_id: providerId });
    return true;
  }
  function providerBound(providerId) { return providerRegistry.has(providerId); }
  async function callProvider(providerId, payload) {
    const provider = providerRegistry.get(providerId);
    if (!provider) throw new Error(`PROVIDER_NOT_BOUND:${providerId}`);
    return provider(payload);
  }

  function statusTone(value) {
    if (["PASS", "BOUND", "RUNNING", "CONNECTED"].includes(value)) return "pass";
    if (["BLOCKED", "FAILED", "ERROR"].includes(value)) return "fail";
    return "open";
  }

  function connectorModel(role) {
    const binding = role ? bindingFor(role.role_id) : null;
    const pc = state.runtime && state.runtime.pc_agent;
    const transportBound = Boolean(window.sfApi && window.sfApi.stage4 && typeof window.sfApi.stage4.dispatchNextPrompt === "function");
    return [
      { id: "ROLE_REGISTRY", label: "Role Registry", state: role ? "BOUND" : "OPEN_SLOT" },
      { id: "WORKER_WINDOW", label: "Worker Window", state: binding ? "BOUND" : "OPEN_SLOT" },
      { id: "BROWSER_SESSION", label: "Browser Session", state: binding && binding.browser_session_id ? "BOUND" : "OPEN_SLOT" },
      { id: "DIRECTIVE_PROVIDER", label: "Directive Provider", state: providerBound("directive") ? "BOUND" : "OPEN_SLOT" },
      { id: "RESULT_PROVIDER", label: "Result Provider", state: providerBound("result") ? "BOUND" : "OPEN_SLOT" },
      { id: "COMMAND_PAYLOAD_PROVIDER", label: "Command Payload", state: providerBound("commandPayload") ? "BOUND" : "OPEN_SLOT" },
      { id: "STAGE4_TRANSPORT", label: "Stage4 Transport", state: transportBound ? "BOUND" : "OPEN_SLOT" },
      { id: "PC_AGENT", label: "PC Agent", state: pc && pc.connected ? "CONNECTED" : "OPEN_SLOT" }
    ];
  }

  function renderRoleMenu() {
    const root = byId("yolla-panel-role-menu");
    if (!root || !state.registry) return;
    root.innerHTML = state.registry.groups.map((group) => {
      const roles = state.registry.roles
        .filter((role) => role.group_id === group.group_id)
        .sort((a, b) => a.order - b.order || a.role_id.localeCompare(b.role_id));
      const collapsed = state.collapsedGroups.has(group.group_id);
      return [
        `<section class="yolla-role-group" data-group-id="${esc(group.group_id)}">`,
        `<button class="yolla-role-group-toggle" type="button" data-yolla-group-toggle="${esc(group.group_id)}" aria-expanded="${!collapsed}">`,
        `<span>${esc(group.group_name)}</span><span>${roles.length}</span></button>`,
        `<div class="yolla-role-list" ${collapsed ? "hidden" : ""}>`,
        roles.map((role) => {
          const selected = role.role_id === state.selectedRoleId;
          const bound = Boolean(bindingFor(role.role_id));
          return `<button type="button" class="yolla-role-item${selected ? " is-selected" : ""}" data-yolla-role-id="${esc(role.role_id)}"><span><strong>${esc(role.role_id)}</strong><small>${esc(role.role_name)}</small></span><span class="yolla-role-state ${bound ? "is-bound" : "is-open"}">${bound ? "창연결" : "연결대기"}</span></button>`;
        }).join(""),
        "</div></section>"
      ].join("");
    }).join("");
  }

  function renderSelectedRole() {
    const root = byId("yolla-panel-workspace");
    const role = selectedRole();
    if (!root || !role) return;
    const binding = bindingFor(role.role_id);
    const connectors = connectorModel(role);
    const commandReady = providerBound("directive") && providerBound("commandPayload")
      && Boolean(window.sfApi && window.sfApi.stage4 && typeof window.sfApi.stage4.dispatchNextPrompt === "function");
    const authorityUrl = `https://github.com/${role.authority_repository}/pull/${role.authority_pr}`;
    const pc = state.runtime && state.runtime.pc_agent;

    root.innerHTML = [
      '<div class="yolla-role-header">',
      `<div><span class="yolla-kicker">SELECTED ROLE</span><h2>${esc(role.role_id)} · ${esc(role.role_name)}</h2><p>${esc(role.role_type)} / ${esc(role.group_id)}</p></div>`,
      `<div class="yolla-binding-summary"><strong>${binding ? "WORKER WINDOW BOUND" : "WORKER WINDOW OPEN SLOT"}</strong><small>${binding ? esc(binding.window_id) : "다른 그룹 기능이 꽂힐 창 연결점"}</small></div>`,
      '</div>',
      '<div class="yolla-connector-grid">',
      connectors.map((item) => `<div class="yolla-connector ${statusTone(item.state)}"><span>${esc(item.label)}</span><strong>${esc(item.state)}</strong></div>`).join(""),
      '</div>',
      '<div class="yolla-action-grid">',
      `<button type="button" data-yolla-action="open-worker">${binding ? "워커창 포커스" : "워커창 만들기"}</button>`,
      '<button type="button" data-yolla-action="refresh">연결상태 새로고침</button>',
      `<button type="button" data-yolla-action="open-authority" data-url="${esc(authorityUrl)}">권위 PR 열기</button>`,
      `<button type="button" data-yolla-action="dispatch" ${commandReady ? "" : "disabled"}>지시 읽고 실행</button>`,
      '</div>',
      '<div class="yolla-card-grid">',
      `<article class="yolla-state-card"><h3>지시 연결점</h3><p>${providerBound("directive") ? "Directive Provider가 연결되었습니다." : "다른 그룹이 directive Provider를 등록하면 현재 지시가 표시됩니다."}</p><code>window.YollaPanel.registerProvider("directive", fn)</code></article>`,
      `<article class="yolla-state-card"><h3>결과 연결점</h3><p>${providerBound("result") ? "Result Provider가 연결되었습니다." : "다른 그룹이 result Provider를 등록하면 최신 결과가 표시됩니다."}</p><code>window.YollaPanel.registerProvider("result", fn)</code></article>`,
      `<article class="yolla-state-card"><h3>PC Agent</h3><p>${pc && pc.connected ? "RESIDENT_CONTEXT_REFRESH_PASS" : "PC Agent Provider 연결 대기"}</p><code>${esc(pc && pc.root || "E:\\SOURCE FACTORY\\.yolla\\a1-pc-agent")}</code></article>`,
      `<article class="yolla-state-card"><h3>명령 Transport</h3><p>${commandReady ? "기존 sfApi.stage4.dispatchNextPrompt 사용 가능" : "Provider 연결 후 기존 Stage4 전송소를 사용합니다."}</p><code>EXISTING_SF_API_STAGE4</code></article>`,
      '</div>',
      '<pre id="yolla-panel-event-log" class="yolla-event-log" aria-live="polite"></pre>'
    ].join("");
  }

  function logEvent(label, payload) {
    const log = byId("yolla-panel-event-log");
    if (!log) return;
    log.textContent = JSON.stringify({ at: new Date().toISOString(), event: label, payload }, null, 2);
  }

  function render() { renderRoleMenu(); renderSelectedRole(); }

  async function refreshRuntime() {
    if (!api || typeof api.getRuntime !== "function") {
      state.runtime = { bindings: [], pc_agent: { connected: false, status: "PRELOAD_BRIDGE_UNAVAILABLE" } };
      render();
      return state.runtime;
    }
    state.runtime = await api.getRuntime();
    render();
    emit("yolla:runtime-refreshed", state.runtime);
    return state.runtime;
  }

  async function openWorker(role) {
    const binding = bindingFor(role.role_id);
    const result = binding
      ? await api.focusWorker({ role_id: role.role_id })
      : await api.openWorker({
          role_id: role.role_id,
          role_name: role.role_name,
          preferred_slot: role.preferred_slot,
          url: state.registry.default_worker_url,
          project_home_url: state.registry.default_worker_url
        });
    await refreshRuntime();
    logEvent("WORKER_WINDOW_BINDING", result);
    emit("yolla:worker-window-bound", { role, result });
  }

  async function dispatchSelectedRole(role) {
    const directive = await callProvider("directive", { role, runtime: state.runtime });
    const payload = await callProvider("commandPayload", { role, directive, runtime: state.runtime });
    const request = {
      schema_version: "YOLLA_PANEL_DISPATCH_REQUEST_V1",
      role_id: role.role_id,
      worker_window_id: bindingFor(role.role_id) && bindingFor(role.role_id).window_id,
      browser_session_id: bindingFor(role.role_id) && bindingFor(role.role_id).browser_session_id,
      directive,
      payload,
      transport: "EXISTING_SF_API_STAGE4"
    };
    emit("yolla:command-requested", request);
    const result = await window.sfApi.stage4.dispatchNextPrompt(request);
    logEvent("STAGE4_DISPATCH_RESULT", result);
    emit("yolla:command-dispatched", { request, result });
  }

  function attachEvents() {
    const shell = byId("yolla-panel-shell");
    if (!shell) return;
    shell.addEventListener("click", async (event) => {
      const roleButton = event.target.closest("[data-yolla-role-id]");
      if (roleButton) {
        state.selectedRoleId = roleButton.dataset.yollaRoleId;
        localStorage.setItem("yolla.panel.selectedRoleId", state.selectedRoleId);
        render();
        emit("yolla:role-selected", { role: selectedRole() });
        return;
      }
      const groupButton = event.target.closest("[data-yolla-group-toggle]");
      if (groupButton) {
        const groupId = groupButton.dataset.yollaGroupToggle;
        if (state.collapsedGroups.has(groupId)) state.collapsedGroups.delete(groupId);
        else state.collapsedGroups.add(groupId);
        renderRoleMenu();
        return;
      }
      const actionButton = event.target.closest("[data-yolla-action]");
      if (!actionButton) return;
      const role = selectedRole();
      try {
        if (actionButton.dataset.yollaAction === "open-worker") await openWorker(role);
        if (actionButton.dataset.yollaAction === "refresh") await refreshRuntime();
        if (actionButton.dataset.yollaAction === "open-authority") await api.openExternal({ url: actionButton.dataset.url });
        if (actionButton.dataset.yollaAction === "dispatch") await dispatchSelectedRole(role);
      } catch (error) {
        logEvent("ACTION_FAILED", { code: error && error.code, message: error && error.message });
        emit("yolla:action-failed", { role, error: { code: error && error.code, message: error && error.message } });
      }
    });
  }

  async function bootstrap() {
    const root = byId("yolla-panel-shell");
    if (!root) return;
    if (!api || typeof api.getRegistry !== "function") throw new Error("ROLE_REGISTRY_BRIDGE_UNAVAILABLE");
    state.registry = await api.getRegistry();
    state.selectedRoleId = localStorage.getItem("yolla.panel.selectedRoleId") || state.registry.default_selected_role_id || state.registry.roles[0].role_id;
    attachEvents();
    await refreshRuntime();
    render();
    emit("yolla:panel-ready", { schema_version: state.registry.schema_version, role_count: state.registry.roles.length, provider_slots: state.registry.provider_slots });
  }

  window.YollaPanel = Object.freeze({
    registerProvider,
    hasProvider: providerBound,
    refresh: refreshRuntime,
    selectRole(roleId) {
      if (!roleById(roleId)) throw new Error(`ROLE_NOT_FOUND:${roleId}`);
      state.selectedRoleId = roleId;
      render();
      return selectedRole();
    },
    getSelectedRole: selectedRole,
    getRuntime: () => state.runtime,
    providerSlots: () => Array.from(providerRegistry.keys())
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => bootstrap().catch((error) => console.error(error)));
  else bootstrap().catch((error) => console.error(error));
}());
