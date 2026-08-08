/* eslint-env browser */
"use strict";

const api = window.yollaV6;
const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));
let appState = null;
let activeGroupId = null;

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function statusTone(value) {
  const status = String(value || "IDLE").toUpperCase();
  if (["RUNNING", "DISPATCHING"].includes(status)) return "running";
  if (["ERROR", "BLOCKED"].includes(status)) return "error";
  if (["RESULT_WAITING", "WAITING"].includes(status)) return "waiting";
  return "idle";
}
function footer(message, tone = "") {
  const node = $("#footer-message");
  node.textContent = message;
  node.dataset.tone = tone;
}
function workspace() { return appState && appState.workspace || { groups:{}, roles:{}, sites:{}, browser:{} }; }
function groups() { return Object.values(workspace().groups || {}).sort((a,b)=>Number(a.order||0)-Number(b.order||0)); }
function rolesFor(groupId) { return Object.values(workspace().roles || {}).filter(role=>role.group_id===groupId).sort((a,b)=>Number(a.order||0)-Number(b.order||0)); }
function selectedRole() { return workspace().selected_role_id && workspace().roles[workspace().selected_role_id] || null; }
function cProjection(groupId) {
  const value = appState && appState.c_mode || {};
  if (String(value.group_id || "") !== String(groupId)) return { tone:"idle", label:"C 모드", line:"대기", wave:0, completed:0, status:"IDLE" };
  const status = String(value.status || "IDLE").toUpperCase();
  const tone = status === "ERROR" || (value.manual_required || []).length ? "error" : value.enabled === true || !["IDLE","STOPPED","COMPLETED"].includes(status) ? "running" : "idle";
  const wave = Number(value.current_wave_index || 0);
  const completed = Number(value.completed_task_count || 0);
  return { tone, label:"C 모드", line:`Wave ${wave} · ${status}`, wave, completed, status };
}
function renderGroups() {
  const root = $("#groups");
  const state = workspace();
  root.innerHTML = groups().map(group => {
    const members = rolesFor(group.group_id);
    const selected = state.selected_group_id === group.group_id;
    const c = cProjection(group.group_id);
    return `<section class="group-card ${selected ? "selected" : ""} ${c.tone === "error" ? "error" : ""}" data-group-card="${esc(group.group_id)}" style="--group-color:${esc(group.color)}">
      <header class="group-header">
        <button type="button" class="group-toggle" data-toggle-group="${esc(group.group_id)}"><span>${group.collapsed ? "›" : "⌄"}</span><strong>${esc(group.display_name)}</strong></button>
        <div class="group-controls">
          <button type="button" class="c-mode ${esc(c.tone)}" data-c-group="${esc(group.group_id)}">${esc(c.label)}</button>
          <button type="button" data-edit-group="${esc(group.group_id)}">편집</button>
          <button type="button" data-add-role="${esc(group.group_id)}" title="워커 추가">＋</button>
          <button type="button" class="danger" data-delete-group-header="${esc(group.group_id)}" title="그룹 삭제">－</button>
        </div>
      </header>
      <div class="group-progress-row"><span>작업완료 <b>${esc(c.completed)}</b>회</span><span>Wave ${esc(c.wave)}</span><span>${esc(c.status)}</span></div>
      <div class="role-list" ${group.collapsed ? "hidden" : ""}>
        ${members.map(role => `<div class="role-row">
          <button type="button" class="role-item ${state.selected_role_id === role.role_id ? "selected" : ""}" data-role="${esc(role.role_id)}">
            <span class="dot ${statusTone(role.status)}"></span>
            <span class="role-name"><strong>${esc(role.display_name)}</strong><small>${esc(role.role_id)}</small></span>
            <span class="role-badge">${role.role_type === "GROUP_COMMANDER" ? "커맨더" : "워커"}</span>
          </button>
          <button type="button" class="role-edit" data-edit-role="${esc(role.role_id)}" title="좌석 설정">⋯</button>
        </div>`).join("") || `<div class="c-status">좌석이 없습니다.</div>`}
        <button type="button" class="add-worker-row" data-add-role="${esc(group.group_id)}">＋ 워커 추가</button>
      </div>
    </section>`;
  }).join("");
  $("#group-count").textContent = String(groups().length);
  $("#role-count").textContent = String(Object.keys(state.roles || {}).length);
}
function renderSites() {
  const values = Object.values(workspace().sites || {});
  $("#sites").innerHTML = values.length ? values.map(site => `<article class="site-item">
    <strong>${esc(site.display_name)}</strong><small>${esc(site.url)}</small>
    <footer><span>${esc(site.analyzer_provider || "UNASSIGNED")} · ${esc(site.status || "READY")}</span><button type="button" data-delete-site="${esc(site.site_id)}">삭제</button></footer>
  </article>`).join("") : `<article class="site-item"><strong>등록 사이트 없음</strong><small>사이트 분석기 주소창에서 이동한 뒤 현재 사이트를 등록하십시오.</small></article>`;
}
function renderTop() {
  const state = workspace();
  const mode = state.selected_mode || "CONTEXTS";
  $$('[data-mode]').forEach(button => button.classList.toggle("active", button.dataset.mode === mode));
  $$('[data-panel]').forEach(node => node.hidden = node.dataset.panel !== mode);
  $('[data-address="WORKER"]').hidden = mode !== "CONTEXTS";
  $('[data-address="ANALYZER"]').hidden = mode !== "ANALYZER";
  $("#context-sidebar").hidden = mode !== "CONTEXTS";
  $("#analyzer-sidebar").hidden = mode !== "ANALYZER";
  $("#sidebar-eyebrow").textContent = mode === "ANALYZER" ? "분석기 구조" : "컨텍스트 구조";
  $("#sidebar-title").textContent = mode === "ANALYZER" ? "등록 사이트" : "커맨더·워커 그룹";
  const role = selectedRole();
  $("#selected-name").textContent = mode === "ANALYZER" ? "사이트 분석기" : role ? role.display_name : "선택된 좌석 없음";
  $("#selected-meta").textContent = mode === "ANALYZER" ? "Provider 연결 준비" : role ? `${role.role_type === "GROUP_COMMANDER" ? "커맨더" : "워커"} · ${role.status}` : "대기";
  $("#selected-dot").className = `dot ${mode === "ANALYZER" ? "idle" : statusTone(role && role.status)}`;
  const browser = appState.browser || {};
  $("#worker-address").value = browser.WORKER && browser.WORKER.url || state.browser && state.browser.WORKER && state.browser.WORKER.url || "https://chatgpt.com/projects";
  $("#analyzer-address").value = browser.ANALYZER && browser.ANALYZER.url || state.browser && state.browser.ANALYZER && state.browser.ANALYZER.url || "https://www.google.com";
}
function renderAll() {
  if (!appState) return;
  renderTop(); renderGroups(); renderSites();
  $("#boot-card").hidden = true;
  requestAnimationFrame(reportLayout);
}
async function refresh() { appState = await api.getState(); renderAll(); }
function reportLayout() {
  const host = $("#browser-host").getBoundingClientRect();
  api.reportLayout({ x: host.x, y: host.y, width: host.width, height: host.height }).catch(() => {});
}
function openDrawer(title, html) {
  const show = () => {
    const bootStrong = $("#boot-card strong");
    const bootSpan = $("#boot-card span");
    if (bootStrong) bootStrong.textContent = "설정창 사용 중";
    if (bootSpan) bootSpan.textContent = "브라우저 화면은 설정을 가리지 않도록 잠시 분리됩니다.";
    $("#drawer-title").textContent = title;
    $("#drawer-body").innerHTML = html;
    $("#drawer").hidden = false;
    $("#shade").hidden = false;
  };
  api.setBrowserSuppressed(true, "DRAWER_OPEN")
    .catch(error => console.error("BROWSER_SUPPRESS_FAILED", error))
    .finally(show);
}
function closeDrawer() {
  $("#drawer").hidden = true;
  $("#shade").hidden = true;
  $("#drawer-body").innerHTML = "";
  const bootStrong = $("#boot-card strong");
  const bootSpan = $("#boot-card span");
  if (bootStrong) bootStrong.textContent = "컨텍스트 화면 준비 중";
  if (bootSpan) bootSpan.textContent = "기존 Runtime은 변경하지 않습니다.";
  api.setBrowserSuppressed(false, "DRAWER_CLOSED").catch(error => console.error("BROWSER_RESTORE_FAILED", error));
}
function targetCheckboxes(selected = []) {
  const selectedSet = new Set(selected);
  return Object.values(workspace().roles || {}).sort((a,b)=>a.group_id.localeCompare(b.group_id)||a.order-b.order).map(role => `<label><input type="checkbox" name="target" value="${esc(role.role_id)}" ${selectedSet.has(role.role_id) ? "checked" : ""}>${esc(role.display_name)} <small>${esc(role.role_id)}</small></label>`).join("");
}
function openGroupDrawer(groupId) {
  const group = workspace().groups[groupId];
  if (!group) return;
  const members = rolesFor(groupId);
  openDrawer("그룹 설정", `<form id="group-form" class="form-grid">
    <input type="hidden" name="group_id" value="${esc(groupId)}">
    <div class="field full"><label>그룹 이름</label><input name="display_name" value="${esc(group.display_name)}" required></div>
    <div class="field"><label>색상</label><input name="color" type="color" value="${esc(group.color)}"></div>
    <div class="field"><label>커맨더</label><select name="commander_id"><option value="">미지정</option>${members.map(role=>`<option value="${esc(role.role_id)}" ${group.commander_id===role.role_id?"selected":""}>${esc(role.display_name)} (${esc(role.role_id)})</option>`).join("")}</select></div>
    <div class="field full"><label>C 모드 GitHub 저장소</label><input name="authority_repository" placeholder="owner/repository" value="${esc(group.authority_repository || "")}"></div>
    <div class="field full"><label>C 모드 Control PR 번호</label><input name="authority_pr" type="number" min="1" value="${esc(group.authority_pr || "")}"></div>
    <div class="drawer-actions full"><button type="button" class="danger" data-delete-group="${esc(groupId)}">그룹 삭제</button><button type="submit" class="primary">저장</button></div>
  </form>`);
}
function openNewGroupDrawer() {
  openDrawer("그룹 추가", `<form id="new-group-form" class="form-grid"><div class="field full"><label>그룹 ID(선택)</label><input name="group_id" placeholder="GROUP-05"></div><div class="field full"><label>그룹 이름</label><input name="display_name" required></div><div class="field"><label>색상</label><input name="color" type="color" value="#64748b"></div><div class="drawer-actions full"><button type="submit" class="primary">추가</button></div></form>`);
}
function openRoleDrawer(roleId, groupId) {
  const role = roleId ? workspace().roles[roleId] : null;
  const gid = groupId || role && role.group_id || workspace().selected_group_id;
  openDrawer(role ? "좌석 설정" : "좌석 추가", `<form id="role-form" class="form-grid">
    <input type="hidden" name="existing_role_id" value="${esc(role && role.role_id || "")}">
    <input type="hidden" name="group_id" value="${esc(gid)}">
    <div class="field full"><label>좌석 ID</label><input name="role_id" value="${esc(role && role.role_id || "")}" ${role ? "readonly" : ""} placeholder="GROUP05-W01"></div>
    <div class="field full"><label>표시 이름</label><input name="display_name" value="${esc(role && role.display_name || "")}" required></div>
    <div class="field"><label>역할</label><select name="role_type"><option value="WORKER" ${role && role.role_type === "WORKER" ? "selected" : ""}>워커</option><option value="GROUP_COMMANDER" ${role && role.role_type === "GROUP_COMMANDER" ? "selected" : ""}>커맨더</option></select></div>
    <div class="field"><label>사용</label><select name="enabled"><option value="true" ${!role || role.enabled ? "selected" : ""}>사용</option><option value="false" ${role && !role.enabled ? "selected" : ""}>중지</option></select></div>
    <div class="field full"><label>대화 주소</label><input name="context_url" value="${esc(role && role.context_url || "https://chatgpt.com/")}"></div>
    <div class="field full"><label>프로젝트 주소</label><input name="project_url" value="${esc(role && role.project_url || "https://chatgpt.com/projects")}"></div>
    <div class="drawer-actions full">${role ? `<button type="button" class="danger" data-delete-role="${esc(role.role_id)}">삭제</button>` : ""}<button type="submit" class="primary">저장</button></div>
  </form>`);
}
function openWorkerAssignDrawer() {
  const state = workspace();
  const group = state.groups[state.selected_group_id];
  if (!group) throw new Error("선택된 그룹이 없습니다.");
  const commander = group.commander_id && state.roles[group.commander_id];
  if (!commander) throw new Error("먼저 그룹의 커맨더를 지정하십시오.");
  const currentUrl = appState.browser && appState.browser.WORKER && appState.browser.WORKER.url || $("#worker-address").value;
  const workerCount = rolesFor(group.group_id).filter(role => role.role_type !== "GROUP_COMMANDER").length;
  openDrawer("워커 지정", `<form id="assign-worker-form" class="form-grid">
    <input type="hidden" name="group_id" value="${esc(group.group_id)}">
    <div class="field full"><label>그룹</label><input value="${esc(group.display_name)}" readonly></div>
    <div class="field full"><label>담당 커맨더</label><input value="${esc(commander.display_name)} (${esc(commander.role_id)})" readonly></div>
    <div class="field full"><label>워커 이름</label><input name="display_name" value="워커 ${workerCount + 1}" required></div>
    <div class="field full"><label>워커 ID(선택)</label><input name="role_id" placeholder="자동 생성"></div>
    <div class="field full"><label>현재 대화 주소</label><input value="${esc(currentUrl)}" readonly></div>
    <div class="status-box full">현재 열려 있는 ChatGPT 대화 주소를 이 커맨더의 새 워커로 저장합니다. 프로젝트 화면 자체가 아니라 새 대화 화면에서 실행하십시오.</div>
    <div class="drawer-actions full"><button type="submit" class="primary">현재 주소를 워커로 지정</button></div>
  </form>`);
}
function openCModeDrawer(groupId) {
  const group = workspace().groups[groupId];
  const c = appState.c_mode || {};
  const isThis = c.group_id === groupId;
  const running = isThis && (c.enabled === true || !["IDLE","STOPPED","COMPLETED"].includes(String(c.status || "IDLE")));
  const status = isThis ? JSON.stringify({ status:c.status, wave:c.current_wave_index, completed:c.completed_task_count, reported:c.reported_count, missing:c.missing_count, error:c.last_error || c.progress_error || null }, null, 2) : "대기";
  openDrawer(`${group.display_name} · C 모드`, `<div class="status-box">${esc(status)}</div>
    <form id="c-form" class="form-grid"><input type="hidden" name="group_id" value="${esc(groupId)}">
      <div class="field full"><label>GitHub 저장소</label><input name="repository" value="${esc(group.authority_repository || "")}" placeholder="owner/repository"></div>
      <div class="field full"><label>Control PR</label><input name="control_pr" type="number" min="1" value="${esc(group.authority_pr || "")}"></div>
      <div class="drawer-actions full">${running ? `<button type="button" data-c-action="pause">일시정지</button><button type="button" data-c-action="resume">재개</button><button type="button" data-c-action="tick">지금 확인</button><button type="button" class="danger" data-c-action="stop">중지</button>` : `<button type="submit" class="primary">C 모드 시작</button>`}</div>
    </form>`);
}
function openCommandsDrawer() {
  const summary = appState.commands || { commands:{} };
  openDrawer("사용자 지정 명령", `<form id="command-form" class="form-grid">
    <div class="field full"><label>명령 내용</label><textarea name="message" required placeholder="각 컨텍스트에 보낼 명령"></textarea></div>
    <div class="field"><label>전송 조건</label><select name="trigger"><option value="INTERVAL">일정한 시간마다</option><option value="AFTER_COMPLETION">작업완료후</option></select></div>
    <div class="field"><label>간격(분)</label><input name="interval_minutes" type="number" min="1" value="20"></div>
    <div class="field full"><label>대상 컨텍스트</label><div class="target-grid">${targetCheckboxes()}</div></div>
    <div class="drawer-actions full"><button type="button" data-command-action="send-now">지금 전송</button><button type="submit" class="primary">명령 등록</button></div>
  </form>
  <div class="command-list">${Object.values(summary.commands || {}).map(command => `<article class="command-card"><header><strong>${esc(command.command_id)}</strong><span>${command.enabled ? "사용" : "중지"}</span></header><p>${esc(command.message)}</p><small>${esc(command.trigger_label || (command.trigger === "AFTER_COMPLETION" ? "작업완료후" : "일정한 시간마다"))}${command.trigger === "INTERVAL" ? ` · ${esc(command.interval_minutes)}분` : ""} · 대상 ${command.targets.length}개</small><footer><button type="button" data-command-toggle="${esc(command.command_id)}" data-enabled="${command.enabled ? "false" : "true"}">${command.enabled ? "중지" : "재개"}</button><button type="button" class="danger" data-command-delete="${esc(command.command_id)}">삭제</button></footer></article>`).join("") || `<div class="status-box">등록된 명령이 없습니다.</div>`}</div>`);
}
function openSiteDrawer() {
  const url = appState.browser && appState.browser.ANALYZER && appState.browser.ANALYZER.url || $("#analyzer-address").value;
  openDrawer("현재 사이트 등록", `<form id="site-form" class="form-grid"><div class="field full"><label>사이트 이름</label><input name="display_name" placeholder="사이트 이름"></div><div class="field full"><label>주소</label><input name="url" value="${esc(url)}"></div><div class="field full"><label>분석기 Provider</label><select name="analyzer_provider"><option value="UNASSIGNED">나중에 연결</option><option value="GENERIC">범용 분석기 자리</option></select></div><div class="drawer-actions full"><button type="submit" class="primary">등록</button></div></form>`);
}
function formData(form) { return Object.fromEntries(new FormData(form).entries()); }

async function handleClick(event) {
  const mode = event.target.closest('[data-mode]');
  if (mode) { appState = await api.setMode(mode.dataset.mode); renderAll(); return; }
  const groupToggle = event.target.closest('[data-toggle-group]');
  if (groupToggle) { const group = workspace().groups[groupToggle.dataset.toggleGroup]; appState = await api.updateGroup({ group_id:group.group_id, collapsed:!group.collapsed }); renderAll(); return; }
  const cButton = event.target.closest('[data-c-group]');
  if (cButton) { openCModeDrawer(cButton.dataset.cGroup); return; }
  const editGroup = event.target.closest('[data-edit-group]');
  if (editGroup) { openGroupDrawer(editGroup.dataset.editGroup); return; }
  const deleteGroupHeader = event.target.closest('[data-delete-group-header]');
  if (deleteGroupHeader) {
    const groupId = deleteGroupHeader.dataset.deleteGroupHeader;
    const group = workspace().groups[groupId];
    const label = group ? group.display_name : groupId;
    if (confirm(`“${label}” 그룹과 포함된 모든 좌석을 삭제하시겠습니까?`)) {
      appState = await api.deleteGroup(groupId);
      renderAll();
      footer("그룹 삭제 완료");
    }
    return;
  }
  const addRole = event.target.closest('[data-add-role]');
  if (addRole) { openRoleDrawer(null, addRole.dataset.addRole); return; }
  const roleButton = event.target.closest('[data-role]');
  if (roleButton) { footer("컨텍스트 이동 중", "running"); appState = await api.selectRole(roleButton.dataset.role); renderAll(); footer("컨텍스트 선택 완료"); return; }
  const editRole = event.target.closest('[data-edit-role]');
  if (editRole) { openRoleDrawer(editRole.dataset.editRole); return; }
  const browser = event.target.closest('[data-browser-action]');
  if (browser) { const kind = browser.dataset.browser; const input = kind === "ANALYZER" ? $("#analyzer-address") : $("#worker-address"); appState = await api.browserControl({ kind, action:browser.dataset.browserAction, url:input.value }); renderAll(); return; }
  const action = event.target.closest('[data-action]');
  if (action) {
    const role = selectedRole();
    if (action.dataset.action === "project" && role) appState = await api.browserControl({ kind:"WORKER", action:"navigate", url:role.project_url });
    if (action.dataset.action === "log-analyzer") { await api.openLogAnalyzer(); footer("로그 분석기 열림"); }
    if (action.dataset.action === "context" && role) appState = await api.browserControl({ kind:"WORKER", action:"navigate", url:role.context_url });
    if (action.dataset.action === "assign-worker") openWorkerAssignDrawer();
    if (action.dataset.action === "commands") openCommandsDrawer();
    if (action.dataset.action === "register-site") openSiteDrawer();
    if (action.dataset.action === "site-provider") openDrawer("사이트 분석기", `<div class="status-box">분석기 Provider가 들어갈 독립 연결점입니다. 현재는 주소·사이트 등록 구조만 유지하며 실제 분석 엔진은 포함하지 않습니다.</div>`);
    renderAll(); return;
  }
  const cAction = event.target.closest('[data-c-action]');
  if (cAction) { const name=cAction.dataset.cAction; if(name==="pause") await api.cPause(); if(name==="resume") await api.cResume(); if(name==="stop") await api.cStop(); if(name==="tick") await api.cTick(); await refresh(); closeDrawer(); return; }
  const deleteGroup = event.target.closest('[data-delete-group]');
  if (deleteGroup) { if (confirm("그룹과 포함 좌석을 삭제하시겠습니까?")) { appState=await api.deleteGroup(deleteGroup.dataset.deleteGroup); closeDrawer(); renderAll(); } return; }
  const deleteRole = event.target.closest('[data-delete-role]');
  if (deleteRole) { if (confirm("좌석을 삭제하시겠습니까?")) { appState=await api.deleteRole(deleteRole.dataset.deleteRole); closeDrawer(); renderAll(); } return; }
  const deleteSite = event.target.closest('[data-delete-site]');
  if (deleteSite) { appState=await api.deleteSite(deleteSite.dataset.deleteSite); renderAll(); return; }
  const commandToggle = event.target.closest('[data-command-toggle]');
  if (commandToggle) { await api.enableCommand(commandToggle.dataset.commandToggle, commandToggle.dataset.enabled === "true"); await refresh(); openCommandsDrawer(); return; }
  const commandDelete = event.target.closest('[data-command-delete]');
  if (commandDelete) { await api.deleteCommand(commandDelete.dataset.commandDelete); await refresh(); openCommandsDrawer(); return; }
  const sendNow = event.target.closest('[data-command-action="send-now"]');
  if (sendNow) { const form=$("#command-form"); const data=formData(form); const targets=$$('input[name="target"]:checked').map(input=>input.value); footer("명령 즉시 전송 중", "running"); const result=await api.sendNow({message:data.message,targets}); footer(`즉시 전송 ${result.results.filter(item=>item.accepted).length}/${result.results.length}`); return; }
}
async function handleSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const data = formData(form);
  if (form.id === "assign-worker-form") { footer("현재 대화 주소를 워커로 지정 중", "running"); appState = await api.assignCurrentWorker({ group_id:data.group_id, display_name:data.display_name, role_id:data.role_id }); closeDrawer(); renderAll(); footer("워커 지정 완료"); return; }
  if (form.id === "new-group-form") { appState = await api.addGroup(data); closeDrawer(); renderAll(); return; }
  if (form.id === "group-form") { appState = await api.updateGroup({ ...data, authority_pr:Number(data.authority_pr||0)||null }); closeDrawer(); renderAll(); return; }
  if (form.id === "role-form") {
    const payload={ role_id:data.existing_role_id || data.role_id, group_id:data.group_id, display_name:data.display_name, role_type:data.role_type, context_url:data.context_url, project_url:data.project_url, enabled:data.enabled === "true" };
    appState = data.existing_role_id ? await api.updateRole(payload) : await api.addRole(payload); closeDrawer(); renderAll(); return;
  }
  if (form.id === "c-form") { footer("C 모드 시작 중", "running"); await api.cStart({ group_id:data.group_id, repository:data.repository, control_pr:Number(data.control_pr) }); await refresh(); closeDrawer(); footer("C 모드 시작 요청 완료"); return; }
  if (form.id === "command-form") { const targets=$$('input[name="target"]:checked').map(input=>input.value); await api.configureCommand({ message:data.message, trigger:data.trigger, interval_minutes:Number(data.interval_minutes), targets, enabled:true }); await refresh(); openCommandsDrawer(); footer("사용자 지정 명령 등록 완료"); return; }
  if (form.id === "site-form") { appState=await api.registerSite(data); closeDrawer(); renderAll(); footer("사이트 등록 완료"); }
}
function attachEvents() {
  document.addEventListener("click", event => handleClick(event).catch(error => { console.error(error); footer(error.message || String(error), "error"); }));
  document.addEventListener("submit", event => handleSubmit(event).catch(error => { console.error(error); footer(error.message || String(error), "error"); }));
  $("#add-group").addEventListener("click", openNewGroupDrawer);
  $("#drawer-close").addEventListener("click", closeDrawer);
  $("#shade").addEventListener("click", closeDrawer);
  $("#open-state").addEventListener("click", () => api.openStateFolder());
  $("#worker-address").addEventListener("keydown", event => { if(event.key==="Enter") api.browserControl({kind:"WORKER",action:"navigate",url:event.target.value}).then(value=>{appState=value;renderAll();}).catch(error=>footer(error.message,"error")); });
  $("#analyzer-address").addEventListener("keydown", event => { if(event.key==="Enter") api.browserControl({kind:"ANALYZER",action:"navigate",url:event.target.value}).then(value=>{appState=value;renderAll();}).catch(error=>footer(error.message,"error")); });
  window.addEventListener("resize", reportLayout);
}

(async () => {
  attachEvents();
  appState = await api.getState();
  activeGroupId = workspace().selected_group_id;
  renderAll();
  api.onState(value => { appState=value; renderAll(); });
  api.onLog(row => { if (row && /FAILED|ERROR/.test(String(row.message||""))) footer(row.message, "error"); });
  await api.reportRendered({ group_count:groups().length, role_count:Object.keys(workspace().roles||{}).length, existing_runtime_preserved:true });
  footer("독립 Runtime 준비 완료");
})().catch(error => { console.error(error); footer(error.message || String(error), "error"); });
