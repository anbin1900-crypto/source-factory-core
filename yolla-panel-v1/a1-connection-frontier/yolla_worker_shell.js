(function yollaWorkerWorkspace() {
  "use strict";

  const api = window.yollaWorker;
  const state = {
    registry: null,
    selectedRoleId: "A-1",
    collapsedGroups: new Set(),
    latestCycle: null
  };

  function byId(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
  function roleById(roleId) {
    return state.registry && state.registry.roles.find((role) => role.role_id === roleId);
  }
  function cycleTone(status) {
    const normalized = String(status || "").toUpperCase();
    if (normalized.includes("PASS") || normalized === "COMPLETED") return "is-pass";
    if (normalized.includes("FAIL") || normalized.includes("BLOCK")) return "is-fail";
    if (normalized === "RUNNING" || normalized.includes("DISPATCH")) return "is-running";
    return "";
  }
  function stageLabel(stage) {
    const labels = {
      COMMAND_CREATED: "커맨더가 명령 생성",
      EXISTING_STAGE4_DISPATCH_ACCEPTED: "기존 Stage4 전송소가 명령 수락",
      WORKER_RECEIVED: "워커가 명령 수신",
      WORKER_ACKNOWLEDGED: "워커가 Canary 결과 반환",
      COMMANDER_RESULT_RECEIVED: "커맨더가 결과 수신",
      CYCLE_BLOCKED: "순환 차단"
    };
    return labels[stage] || stage;
  }

  function renderGroups() {
    const root = byId("yw-role-groups");
    if (!root || !state.registry) return;
    root.innerHTML = state.registry.groups
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((group) => {
        const roles = state.registry.roles
          .filter((role) => role.group_id === group.group_id)
          .sort((a, b) => a.order - b.order || a.role_id.localeCompare(b.role_id));
        const collapsed = state.collapsedGroups.has(group.group_id);
        return [
          `<section class="yw-group" data-group="${esc(group.group_id)}">`,
          `<button type="button" class="yw-group-header" data-group-toggle="${esc(group.group_id)}" aria-expanded="${!collapsed}">`,
          `<span>${esc(group.group_name)}</span><span class="yw-group-count">${roles.length}</span></button>`,
          `<div class="yw-role-list" ${collapsed ? "hidden" : ""}>`,
          roles.map((role) => {
            const selected = role.role_id === state.selectedRoleId;
            const typeLabel = role.role_type === "WORKER" ? "W" : "C";
            return [
              `<button type="button" class="yw-role${selected ? " is-selected" : ""}" data-role-id="${esc(role.role_id)}">`,
              `<span class="yw-role-icon">${typeLabel}</span>`,
              `<span class="yw-role-copy"><strong>${esc(role.role_id)}</strong><small>${esc(role.role_name)}</small></span>`,
              `<span class="yw-role-type">${esc(role.role_type)}</span>`,
              `</button>`
            ].join("");
          }).join(""),
          "</div></section>"
        ].join("");
      }).join("");
  }

  function renderSelectedRole() {
    const role = roleById(state.selectedRoleId);
    const selected = byId("yw-selected-role");
    if (selected) selected.textContent = role ? `${role.role_id} · ${role.role_name}` : state.selectedRoleId;
  }

  function renderCycle() {
    const cycle = state.latestCycle;
    const status = byId("yw-cycle-status");
    const cycleId = byId("yw-cycle-id");
    const events = byId("yw-cycle-events");
    if (!status || !cycleId || !events) return;

    if (!cycle) {
      status.textContent = "대기";
      status.className = "";
      cycleId.textContent = "없음";
      events.innerHTML = "<li>패널에서 명령을 실행하면 여기에 순환 단계가 표시됩니다.</li>";
      return;
    }

    status.textContent = cycle.status || "RUNNING";
    status.className = cycleTone(cycle.status);
    cycleId.textContent = cycle.cycle_id || "-";
    events.innerHTML = (cycle.events || []).map((event) => {
      const tone = cycleTone(event.status);
      return `<li class="${tone}">${esc(stageLabel(event.stage))} · ${esc(event.status || "")}</li>`;
    }).join("") || "<li>순환 이벤트 대기</li>";
  }

  function render() {
    renderGroups();
    renderSelectedRole();
    renderCycle();
  }

  async function selectRole(roleId) {
    const role = roleById(roleId);
    if (!role) return;
    state.selectedRoleId = role.role_id;
    localStorage.setItem("yolla.worker.selectedRoleId", role.role_id);
    render();
    if (api && typeof api.selectRole === "function") {
      await api.selectRole({ role_id: role.role_id });
    }
  }

  function attachEvents() {
    const root = byId("yw-role-groups");
    if (!root) return;
    root.addEventListener("click", async (event) => {
      const roleButton = event.target.closest("[data-role-id]");
      if (roleButton) {
        await selectRole(roleButton.dataset.roleId);
        return;
      }
      const groupButton = event.target.closest("[data-group-toggle]");
      if (groupButton) {
        const groupId = groupButton.dataset.groupToggle;
        if (state.collapsedGroups.has(groupId)) state.collapsedGroups.delete(groupId);
        else state.collapsedGroups.add(groupId);
        renderGroups();
      }
    });
  }

  async function bootstrap() {
    if (!api) throw new Error("YOLLA_WORKER_PRELOAD_UNAVAILABLE");
    state.registry = await api.getRegistry();
    const stored = localStorage.getItem("yolla.worker.selectedRoleId");
    state.selectedRoleId = roleById(stored) ? stored : (state.registry.default_selected_role_id || "A-1");
    for (const group of state.registry.groups) {
      if (group.default_expanded === false) state.collapsedGroups.add(group.group_id);
    }
    attachEvents();
    if (typeof api.onCycleEvent === "function") {
      api.onCycleEvent((payload) => {
        state.latestCycle = payload && payload.cycle ? payload.cycle : payload;
        renderCycle();
      });
    }
    if (typeof api.onWorkspaceState === "function") {
      api.onWorkspaceState((payload) => {
        if (payload && payload.selected_role_id) {
          state.selectedRoleId = payload.selected_role_id;
          renderSelectedRole();
          renderGroups();
        }
      });
    }
    state.latestCycle = await api.getLatestCycle();
    render();
    await api.selectRole({ role_id: state.selectedRoleId });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => bootstrap().catch(console.error));
  } else {
    bootstrap().catch(console.error);
  }
}());
