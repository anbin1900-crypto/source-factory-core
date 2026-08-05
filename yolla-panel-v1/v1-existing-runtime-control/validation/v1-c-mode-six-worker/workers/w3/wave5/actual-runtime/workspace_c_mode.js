(function yollaCModeAndCommandUi() {
  "use strict";

  const api = window.yollaWorkspaceV5;
  const byId = id => document.getElementById(id);
  let registry = null;
  let workspace = null;
  let summary = null;
  let modal = null;
  let renderQueued = false;
  let observer = null;

  function text(value) { return String(value == null ? "" : value); }
  function escapeHtml(value) {
    return text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function upper(value) { return text(value).trim().toUpperCase(); }
  function activeGroupId() {
    const selectedRole = registry && registry.roles && registry.roles.find(role => role.role_id === (workspace && workspace.selected_seat_code));
    return workspace && (workspace.selected_group_id || selectedRole && selectedRole.group_id) || registry && registry.groups && registry.groups[0] && registry.groups[0].group_id || "";
  }
  function groupPreference(groupId) {
    return workspace && workspace.group_preferences && workspace.group_preferences[groupId] || {};
  }
  function groupLabel(groupId) {
    const group = registry && registry.groups && registry.groups.find(item => item.group_id === groupId);
    const preference = groupPreference(groupId);
    return preference.display_name || group && (group.group_name || group.group_id) || groupId;
  }
  function rolesForGroup(groupId) {
    return (registry && registry.roles || []).filter(role => role.group_id === groupId && role.enabled !== false)
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  }
  function commanderForGroup(groupId) {
    const preference = groupPreference(groupId);
    return preference.commander_id || (rolesForGroup(groupId).find(role => /COMMANDER/i.test(text(role.role_type))) || {}).role_id || "";
  }
  function workersForGroup(groupId) {
    const commander = commanderForGroup(groupId);
    return rolesForGroup(groupId).filter(role => role.role_id !== commander);
  }
  function authorityForGroup(groupId) {
    const commanderId = commanderForGroup(groupId);
    const commander = rolesForGroup(groupId).find(role => role.role_id === commanderId) || {};
    const sameActiveGroup = summary && summary.group_id === groupId;
    return {
      repository: sameActiveGroup && summary.repository || commander.authority_repository || "",
      control_pr: sameActiveGroup && summary.control_pr || commander.authority_pr || ""
    };
  }
  function repeatCommands() {
    return summary && summary.repeat && summary.repeat.commands || {};
  }
  function activity() {
    return summary && summary.activity || {
      c_enabled: Boolean(summary && summary.enabled),
      c_group_id: summary && summary.group_id || null,
      c_status: summary && summary.status || "IDLE",
      c_active_roles: [],
      command_enabled_target_roles: [],
      command_awaiting_roles: [],
      command_active_roles: [],
      background_active_roles: [],
      error_roles: [],
      report_missing_roles: [],
      directive_pending_roles: [],
      reported_pass_roles: [],
      reported_blocked_roles: [],
      end_roles: []
    };
  }
  function unique(values) { return Array.from(new Set((values || []).map(upper).filter(Boolean))); }
  function setText(node, value) { const next = text(value); if (node && node.textContent !== next) node.textContent = next; }
  function setClass(node, value) { if (node && node.className !== value) node.className = value; }

  function ensureModal() {
    if (modal && document.body.contains(modal)) return modal;
    modal = document.createElement("div");
    modal.id = "yolla-mode-modal";
    modal.className = "yolla-mode-modal";
    modal.hidden = true;
    modal.innerHTML = '<section class="yolla-mode-dialog" role="dialog" aria-modal="true" aria-labelledby="yolla-mode-title">' +
      '<header><div><small id="yolla-mode-eyebrow">YOLLA</small><h2 id="yolla-mode-title">설정</h2></div><button type="button" class="yolla-modal-close" data-yolla-modal-close aria-label="닫기">×</button></header>' +
      '<div id="yolla-mode-body" class="yolla-mode-body"></div>' +
      '<footer><span id="yolla-mode-message">대기 중</span></footer>' +
      '</section>';
    document.body.appendChild(modal);
    modal.addEventListener("click", event => {
      if (event.target === modal || event.target.closest("[data-yolla-modal-close]")) closeModal();
    });
    document.addEventListener("keydown", event => { if (event.key === "Escape" && modal && !modal.hidden) closeModal(); });
    return modal;
  }
  function modalMessage(message, error = false) {
    const node = byId("yolla-mode-message");
    if (!node) return;
    node.textContent = message || "";
    node.className = error ? "error" : "";
  }
  function openModal(eyebrow, title, body) {
    ensureModal();
    byId("yolla-mode-eyebrow").textContent = eyebrow;
    byId("yolla-mode-title").textContent = title;
    byId("yolla-mode-body").innerHTML = body;
    modal.hidden = false;
    document.body.classList.add("yolla-modal-open");
    modalMessage("대기 중");
    const first = modal.querySelector("input,select,textarea,button");
    if (first) setTimeout(() => first.focus(), 0);
  }
  function closeModal() {
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove("yolla-modal-open");
  }

  function cStatusTone(groupId) {
    if (!summary || summary.group_id !== groupId) return "idle";
    const status = upper(summary.status || "IDLE");
    if (summary.enabled && !["PAUSED", "ERROR", "MANUAL_REQUIRED"].includes(status)) return "running";
    if (status === "PAUSED") return "paused";
    if (["ERROR", "MANUAL_REQUIRED"].includes(status)) return "error";
    if (status === "COMPLETED") return "completed";
    return "idle";
  }

  function ensureGroupCButtons() {
    document.querySelectorAll(".vertical-group[data-group-id]").forEach(section => {
      const groupId = section.dataset.groupId;
      const controls = section.querySelector(".vertical-group-controls");
      if (!controls) return;
      let button = controls.querySelector("[data-c-group]");
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "group-mode-button c-button idle";
        button.dataset.cGroup = groupId;
        button.textContent = "C";
        controls.insertBefore(button, controls.firstChild);
      }
      const tone = cStatusTone(groupId);
      button.className = `group-mode-button c-button ${tone}`;
      button.setAttribute("aria-pressed", String(tone === "running"));
      button.title = tone === "running" ? "C 모드 실행 중 · 상태 열기" : tone === "paused" ? "C 모드 일시정지 · 상태 열기" : tone === "error" ? "C 모드 오류 · 상태 열기" : "C 모드 설정·시작";
      section.classList.toggle("c-mode-active-group", tone === "running");
      section.classList.toggle("c-mode-error-group", tone === "error");
      if (tone !== "error") section.classList.remove("group-error");
    });
  }

  function roleProjection(roleId) {
    const a = activity();
    const sets = {
      errors: new Set(unique(a.error_roles)),
      reportMissing: new Set(unique(a.report_missing_roles)),
      directivePending: new Set(unique(a.directive_pending_roles)),
      cActive: new Set(unique(a.c_active_roles)),
      commandActive: new Set(unique(a.command_active_roles)),
      commandAwaiting: new Set(unique(a.command_awaiting_roles)),
      commandEnabled: new Set(unique(a.command_enabled_target_roles)),
      reportedPass: new Set(unique(a.reported_pass_roles)),
      reportedBlocked: new Set(unique(a.reported_blocked_roles)),
      ended: new Set(unique(a.end_roles))
    };
    const id = upper(roleId);
    if (sets.errors.has(id)) return { tone: "error", label: "오류", state: "ERROR" };
    if (sets.reportMissing.has(id)) return { tone: "report-missing", label: "보고 누락", state: "REPORT_MISSING" };
    if (sets.directivePending.has(id)) return { tone: "directive-pending", label: "지시 대기", state: "DIRECTIVE_PENDING" };
    if (sets.cActive.has(id)) return { tone: "running", label: "C 모드 실행", state: "C_ACTIVE" };
    if (sets.commandActive.has(id)) return { tone: "command-running", label: "명령 실행", state: "REPEAT_ACTIVE" };
    if (sets.commandAwaiting.has(id)) return { tone: "awaiting", label: "완료 대기", state: "AWAITING" };
    if (sets.reportedBlocked.has(id)) return { tone: "reported-blocked", label: "보고 완료·차단", state: "REPORTED_BLOCKED" };
    if (sets.reportedPass.has(id)) return { tone: "reported-pass", label: "보고 완료", state: "REPORTED_PASS" };
    if (sets.ended.has(id)) return { tone: "end", label: "END", state: "END" };
    if (sets.commandEnabled.has(id)) return { tone: "idle", label: "명령 대기", state: "COMMAND_ENABLED" };
    return { tone: "idle", label: "쉬는 중", state: "IDLE" };
  }

  function truthCounts(workerRoles) {
    const counts = { working: 0, c: 0, command: 0, awaiting: 0, reportMissing: 0, error: 0, end: 0, idle: 0 };
    workerRoles.forEach(role => {
      const state = roleProjection(role.role_id).state;
      if (["C_ACTIVE", "REPEAT_ACTIVE", "AWAITING", "ERROR"].includes(state)) counts.working += 1;
      if (state === "C_ACTIVE") counts.c += 1;
      if (state === "REPEAT_ACTIVE") counts.command += 1;
      if (state === "AWAITING") counts.awaiting += 1;
      if (state === "REPORT_MISSING") counts.reportMissing += 1;
      if (state === "ERROR") counts.error += 1;
      if (state === "END") counts.end += 1;
      if (state === "IDLE") counts.idle += 1;
    });
    return counts;
  }

  function ensureTruthOverview(overview, counts) {
    if (!overview) return;
    let truth = byId("worker-truth-overview");
    if (!truth) {
      truth = document.createElement("div");
      truth.id = "worker-truth-overview";
      truth.className = "worker-truth-overview";
      truth.setAttribute("aria-label", "현재 C 및 명령 보고 상태");
      overview.insertAdjacentElement("afterend", truth);
    }
    truth.innerHTML = [
      ["작업 중", counts.working, "working"], ["C 실행", counts.c, "c"],
      ["명령 실행", counts.command, "command"], ["완료 대기", counts.awaiting, "awaiting"],
      ["보고 누락", counts.reportMissing, "report-missing"], ["오류", counts.error, "error"],
      ["END", counts.end, "end"], ["쉬는 중", counts.idle, "idle"]
    ].map(item => `<span class="truth-${item[2]}">${item[0]} <b>${item[1]}</b></span>`).join("");
  }

  function updateOverviewAndRoles() {
    if (!registry || !workspace) return;
    const workerRoles = (registry.roles || []).filter(role => role.enabled !== false && !/COMMANDER/i.test(text(role.role_type)));
    const counts = truthCounts(workerRoles);
    const overview = byId("worker-overview");
    if (overview) {
      const spans = overview.querySelectorAll(":scope > span");
      if (spans[0]) { if (spans[0].childNodes[0] && spans[0].childNodes[0].nodeValue !== "전체 ") spans[0].childNodes[0].nodeValue = "전체 "; setText(byId("worker-total-count"), workerRoles.length); }
      if (spans[1]) { if (spans[1].childNodes[0] && spans[1].childNodes[0].nodeValue !== "작업 중 ") spans[1].childNodes[0].nodeValue = "작업 중 "; setText(byId("worker-working-count"), counts.working); }
      if (spans[2]) { if (spans[2].childNodes[0] && spans[2].childNodes[0].nodeValue !== "쉬는 중 ") spans[2].childNodes[0].nodeValue = "쉬는 중 "; setText(byId("worker-resting-count"), counts.idle); }
      if (spans[3]) { if (spans[3].childNodes[0] && spans[3].childNodes[0].nodeValue !== "오류 ") spans[3].childNodes[0].nodeValue = "오류 "; setText(byId("worker-error-count"), counts.error); }
    }
    ensureTruthOverview(overview, counts);
    document.querySelectorAll(".role[data-role-id]").forEach(node => {
      const roleId = node.dataset.roleId;
      const projection = roleProjection(roleId);
      const dot = node.querySelector(".status-dot");
      setClass(dot, `status-dot ${projection.tone}`);
      const small = node.querySelector(".role-copy small");
      if (small) {
        const profile = workspace.seat_profiles && workspace.seat_profiles[roleId] || {};
        setText(small, projection.label + (profile.project_url ? " · 프로젝트 연결" : ""));
      }
    });
    const selectedId = workspace.selected_seat_code;
    if (selectedId && byId("selected-status") && byId("selected-dot")) {
      const projection = roleProjection(selectedId);
      setText(byId("selected-status"), projection.label);
      setClass(byId("selected-dot"), `status-dot ${projection.tone}`);
    }
    const eyebrow = byId("sidebar-eyebrow");
    setText(eyebrow, "C MODE · COMMAND · REPORT TRUTH");
    ensureGroupCButtons();
  }

  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      updateOverviewAndRoles();
      if (modal && !modal.hidden) {
        const mode = modal.dataset.mode;
        if (mode === "C") updateCDialogReadOnly();
        if (mode === "COMMAND") updateCommandDialogList();
      }
    });
  }

  // Remaining existing dialog, bridge-event and bootstrap implementation is preserved by the Wave 5 patch application process.
  // Candidate integrator applies this state projection block over the exact 5.10.2.4.1 source and retains the remainder byte-for-byte.

  window.yollaCModeTruthProjection = { activity, roleProjection, truthCounts, updateOverviewAndRoles, scheduleRender };
})();
