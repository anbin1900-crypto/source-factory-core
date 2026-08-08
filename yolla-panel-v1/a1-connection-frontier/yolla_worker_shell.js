(function yollaWorkerWorkspace() {
  "use strict";

  const api = window.yollaWorker;
  const DEFAULT_COLORS = Object.freeze({
    MASTER: "#8b5cf6", A_GROUP: "#ef4444", B_GROUP: "#64748b",
    C_GROUP: "#3b82f6", D_GROUP: "#f59e0b", API_GROUP: "#10b981"
  });
  const state = {
    registry: null,
    selectedRoleId: "A-1",
    selectedGroupId: "A_GROUP",
    latestCycle: null,
    toastTimer: null
  };

  function byId(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }
  function roleById(roleId) { return state.registry && state.registry.roles.find((role) => role.role_id === roleId); }
  function groupById(groupId) { return state.registry && state.registry.groups.find((group) => group.group_id === groupId); }
  function rolesForGroup(groupId) {
    return state.registry.roles.filter((role) => role.group_id === groupId)
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || a.role_id.localeCompare(b.role_id));
  }
  function groupColor(group) { return (group && group.color) || DEFAULT_COLORS[group && group.group_id] || "#64748b"; }
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
      WORKER_ACKNOWLEDGED: "워커가 결과 반환",
      COMMANDER_RESULT_RECEIVED: "커맨더가 결과 수신",
      CYCLE_BLOCKED: "순환 차단"
    };
    return labels[stage] || stage;
  }
  function showToast(message, error = false) {
    const toast = byId("yw-toast");
    if (!toast) return;
    toast.textContent = String(message || "완료");
    toast.className = `yw-toast is-visible${error ? " is-error" : ""}`;
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => { toast.className = "yw-toast"; }, 2600);
  }
  function errorMessage(error) {
    return error && (error.message || error.code) ? String(error.message || error.code) : "처리하지 못했습니다.";
  }

  function normalizeSelection() {
    if (!state.registry) return;
    const storedGroup = localStorage.getItem("yolla.worker.selectedGroupId");
    const selectedRole = roleById(state.selectedRoleId);
    const preferredGroup = groupById(storedGroup) || groupById(selectedRole && selectedRole.group_id) || state.registry.groups[0];
    state.selectedGroupId = preferredGroup ? preferredGroup.group_id : "A_GROUP";
    if (!selectedRole || selectedRole.group_id !== state.selectedGroupId) {
      const first = rolesForGroup(state.selectedGroupId)[0];
      if (first) state.selectedRoleId = first.role_id;
    }
  }

  function renderGroupTabs() {
    const root = byId("yw-group-tabs");
    if (!root || !state.registry) return;
    root.innerHTML = state.registry.groups.slice().sort((a, b) => Number(a.order || 0) - Number(b.order || 0)).map((group) => {
      const count = rolesForGroup(group.group_id).length;
      const active = group.group_id === state.selectedGroupId;
      const color = groupColor(group);
      return `<button type="button" class="yw-group-tab" role="tab" aria-selected="${active}" data-group-id="${esc(group.group_id)}" style="--tab-color:${esc(color)}" title="${esc(group.group_name)}">
        <span class="yw-group-tab-color"></span><span class="yw-group-tab-name">${esc(group.group_name)}</span><span class="yw-group-tab-count">${count}</span>
      </button>`;
    }).join("");
  }

  function renderActiveGroup() {
    const group = groupById(state.selectedGroupId);
    if (!group) return;
    const roles = rolesForGroup(group.group_id);
    const color = groupColor(group);
    document.documentElement.style.setProperty("--active-group", color);
    byId("yw-active-group-color").style.background = color;
    byId("yw-active-group-title").textContent = group.group_name;
    byId("yw-active-group-count").textContent = `${roles.length}명`;
  }

  function renderRoles() {
    const root = byId("yw-role-groups");
    if (!root || !state.registry) return;
    const roles = rolesForGroup(state.selectedGroupId);
    if (!roles.length) {
      root.innerHTML = '<div class="yw-empty-group">이 그룹에는 워커가 없습니다.<br>위의 <strong>+ 워커</strong> 버튼으로 추가하세요.</div>';
      return;
    }
    root.innerHTML = `<div class="yw-role-list">${roles.map((role) => {
      const selected = role.role_id === state.selectedRoleId;
      const typeLabel = role.role_type === "WORKER" ? "W" : "C";
      const subtitle = role.project_url || role.context_url || role.role_name;
      return `<div class="yw-role-row"><button type="button" class="yw-role${selected ? " is-selected" : ""}" data-role-id="${esc(role.role_id)}">
        <span class="yw-role-icon">${typeLabel}</span>
        <span class="yw-role-copy"><strong>${esc(role.role_id)} · ${esc(role.role_name)}</strong><small>${esc(subtitle)}</small></span>
        <span class="yw-role-meta"><span class="yw-role-type">${esc(role.role_type)}</span>${role.user_defined ? '<span class="yw-role-new">추가</span>' : ""}</span>
      </button>${role.user_defined ? `<button type="button" class="yw-role-delete" data-delete-role-id="${esc(role.role_id)}" title="추가한 워커 삭제" aria-label="${esc(role.role_id)} 삭제">×</button>` : ""}</div>`;
    }).join("")}</div>`;
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
      status.textContent = "대기"; status.className = ""; cycleId.textContent = "없음";
      events.innerHTML = "<li>패널에서 명령을 실행하면 여기에 순환 단계가 표시됩니다.</li>";
      return;
    }
    status.textContent = cycle.status || "RUNNING";
    status.className = cycleTone(cycle.status);
    cycleId.textContent = cycle.cycle_id || "-";
    events.innerHTML = (cycle.events || []).map((event) => `<li class="${cycleTone(event.status)}">${esc(stageLabel(event.stage))} · ${esc(event.status || "")}</li>`).join("") || "<li>순환 이벤트 대기</li>";
  }

  function render() { renderGroupTabs(); renderActiveGroup(); renderRoles(); renderSelectedRole(); renderCycle(); }

  async function refreshRegistry(registry) {
    state.registry = registry || await api.getRegistry();
    normalizeSelection();
    render();
  }

  async function selectRole(roleId) {
    const role = roleById(roleId);
    if (!role) return;
    state.selectedRoleId = role.role_id;
    state.selectedGroupId = role.group_id;
    localStorage.setItem("yolla.worker.selectedRoleId", role.role_id);
    localStorage.setItem("yolla.worker.selectedGroupId", role.group_id);
    render();
    await api.selectRole({ role_id: role.role_id });
  }

  async function selectGroup(groupId) {
    const group = groupById(groupId);
    if (!group) return;
    state.selectedGroupId = group.group_id;
    localStorage.setItem("yolla.worker.selectedGroupId", group.group_id);
    const selected = roleById(state.selectedRoleId);
    if (!selected || selected.group_id !== group.group_id) {
      const first = rolesForGroup(group.group_id)[0];
      if (first) await selectRole(first.role_id);
      else render();
    } else render();
  }

  function openDialog(id) {
    const dialog = byId(id);
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }
  function closeDialog(id) {
    const dialog = byId(id);
    if (!dialog) return;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function openGroupEditor() {
    const group = groupById(state.selectedGroupId);
    if (!group) return;
    const color = groupColor(group);
    byId("yw-group-name").value = group.group_name;
    byId("yw-group-color").value = color;
    byId("yw-group-color-text").value = color;
    openDialog("yw-group-dialog");
  }
  function openWorkerEditor() {
    byId("yw-worker-form").reset();
    openDialog("yw-worker-dialog");
    setTimeout(() => byId("yw-worker-name").focus(), 0);
  }

  function attachEvents() {
    byId("yw-group-tabs").addEventListener("click", (event) => {
      const tab = event.target.closest("[data-group-id]");
      if (tab) selectGroup(tab.dataset.groupId).catch((error) => showToast(errorMessage(error), true));
    });
    byId("yw-role-groups").addEventListener("click", (event) => {
      const deleteButton = event.target.closest("[data-delete-role-id]");
      if (deleteButton) {
        event.stopPropagation();
        const roleId = deleteButton.dataset.deleteRoleId;
        if (!window.confirm(`${roleId} 워커를 삭제하시겠습니까?`)) return;
        api.deleteWorker({ role_id: roleId }).then((result) => {
          state.registry = result.registry;
          normalizeSelection();
          render();
          return api.selectRole({ role_id: state.selectedRoleId });
        }).then(() => showToast(`${roleId} 삭제 완료`)).catch((error) => showToast(errorMessage(error), true));
        return;
      }
      const roleButton = event.target.closest("[data-role-id]");
      if (roleButton) selectRole(roleButton.dataset.roleId).catch((error) => showToast(errorMessage(error), true));
    });
    byId("yw-edit-group").addEventListener("click", openGroupEditor);
    byId("yw-add-worker").addEventListener("click", openWorkerEditor);
    document.addEventListener("click", (event) => {
      const close = event.target.closest("[data-dialog-close]");
      if (close) closeDialog(close.dataset.dialogClose);
    });
    byId("yw-group-color").addEventListener("input", (event) => { byId("yw-group-color-text").value = event.target.value; });
    byId("yw-group-color-text").addEventListener("input", (event) => {
      if (/^#[0-9a-f]{6}$/i.test(event.target.value)) byId("yw-group-color").value = event.target.value;
    });
    byId("yw-group-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const result = await api.updateGroup({ group_id: state.selectedGroupId, group_name: byId("yw-group-name").value, color: byId("yw-group-color-text").value });
        state.registry = result.registry; closeDialog("yw-group-dialog"); render(); showToast("그룹 설정을 저장했습니다.");
      } catch (error) { showToast(errorMessage(error), true); }
    });
    byId("yw-worker-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const result = await api.addWorker({
          group_id: state.selectedGroupId,
          role_name: byId("yw-worker-name").value,
          role_id: byId("yw-worker-id").value,
          project_url: byId("yw-worker-project-url").value,
          context_url: byId("yw-worker-context-url").value
        });
        state.registry = result.registry; closeDialog("yw-worker-dialog"); await selectRole(result.role.role_id); showToast(`${result.role.role_id} 워커를 추가했습니다.`);
      } catch (error) { showToast(errorMessage(error), true); }
    });
  }

  async function bootstrap() {
    if (!api) throw new Error("YOLLA_WORKER_PRELOAD_UNAVAILABLE");
    state.registry = await api.getRegistry();
    const storedRole = localStorage.getItem("yolla.worker.selectedRoleId");
    state.selectedRoleId = roleById(storedRole) ? storedRole : (state.registry.default_selected_role_id || "A-1");
    normalizeSelection();
    attachEvents();
    if (typeof api.onCycleEvent === "function") api.onCycleEvent((payload) => { state.latestCycle = payload && payload.cycle ? payload.cycle : payload; renderCycle(); });
    if (typeof api.onWorkspaceState === "function") api.onWorkspaceState((payload) => {
      if (payload && payload.selected_role_id && roleById(payload.selected_role_id)) {
        state.selectedRoleId = payload.selected_role_id;
        const role = roleById(state.selectedRoleId);
        if (role) state.selectedGroupId = role.group_id;
        render();
      }
    });
    if (typeof api.onRegistryUpdated === "function") api.onRegistryUpdated((payload) => refreshRegistry(payload && payload.registry).catch(console.error));
    state.latestCycle = await api.getLatestCycle();
    render();
    await api.selectRole({ role_id: state.selectedRoleId });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => bootstrap().catch((error) => showToast(errorMessage(error), true)));
  else bootstrap().catch((error) => showToast(errorMessage(error), true));
}());
