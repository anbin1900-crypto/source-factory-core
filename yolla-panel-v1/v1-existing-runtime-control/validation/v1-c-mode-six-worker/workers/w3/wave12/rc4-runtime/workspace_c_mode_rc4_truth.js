(function yollaRc4UiTruthOverlay() {
  "use strict";
  const api = window.yollaWorkspaceV5;
  const byId = id => document.getElementById(id);
  let registry = null;
  let workspace = null;
  let summary = null;
  let queued = false;

  function text(value) { return String(value == null ? "" : value); }
  function upper(value) { return text(value).trim().toUpperCase(); }
  function unique(values) { return Array.from(new Set((values || []).map(upper).filter(Boolean))); }
  function activity(value) {
    const source = value && value.activity || value || {};
    return {
      c_enabled: Boolean(source.c_enabled), command_enabled: Boolean(source.command_enabled),
      c_active_roles: source.c_active_roles || [], command_active_roles: source.command_active_roles || [],
      command_awaiting_roles: source.command_awaiting_roles || [], command_enabled_target_roles: source.command_enabled_target_roles || [],
      current_registry_result_roles: source.current_registry_result_roles || [], historical_registry_result_roles: source.historical_registry_result_roles || [],
      report_missing_roles: source.report_missing_roles || [], duplicate_report_roles: source.duplicate_report_roles || [],
      directive_pending_roles: source.directive_pending_roles || [], error_roles: source.error_roles || [], end_roles: source.end_roles || [],
      result_reference_by_role: source.result_reference_by_role || {}
    };
  }
  function resultReference(a, roleId) {
    const refs = a.result_reference_by_role || {};
    const value = refs[roleId] || refs[upper(roleId)] || {};
    if (value.result_comment_id) return `RESULT_COMMENT #${value.result_comment_id}`;
    if (value.display) return text(value.display);
    if (value.result_key) return `RESULT_KEY ${value.result_key}`;
    return "";
  }
  function projectRoleFromActivity(input, roleId) {
    const a = activity(input); const id = upper(roleId); const has = key => new Set(unique(a[key])).has(id); const reference = resultReference(a, id);
    if (has("error_roles")) return {tone:"error",label:"오류",state:"ERROR",reference};
    if (has("duplicate_report_roles")) return {tone:"duplicate-report",label:"중복 결과",state:"DUPLICATE_REPORT",reference};
    if (has("report_missing_roles")) return {tone:"report-missing",label:"미보고",state:"REPORT_MISSING",reference};
    if (has("directive_pending_roles")) return {tone:"directive-pending",label:"지시 대기",state:"DIRECTIVE_PENDING",reference};
    if (has("c_active_roles")) return {tone:"running",label:"C 실행",state:"C_ACTIVE",reference};
    if (has("command_active_roles")) return {tone:"command-running",label:"명령 실행",state:"REPEAT_ACTIVE",reference};
    if (has("command_awaiting_roles")) return {tone:"awaiting",label:"결과 대기",state:"AWAITING",reference};
    if (has("current_registry_result_roles")) return {tone:"registry-current",label:"현재 Registry 결과",state:"CURRENT_REGISTRY_RESULT",reference};
    if (has("historical_registry_result_roles")) return {tone:"registry-historical",label:"과거 Registry 결과",state:"HISTORICAL_REGISTRY_RESULT",reference};
    if (has("end_roles")) return {tone:"end",label:"END",state:"END",reference};
    if (has("command_enabled_target_roles")) return {tone:"idle",label:"명령 대기",state:"COMMAND_ENABLED",reference};
    return {tone:"idle",label:"쉬는 중",state:"IDLE",reference};
  }
  function truthCountsFromActivity(roles, input) {
    const a = activity(input); const counts={working:0,c:0,command:0,current:0,historical:0,awaiting:0,missing:0,duplicate:0,error:0,end:0,idle:0};
    for (const role of roles) {
      const state=projectRoleFromActivity(a, role.role_id || role).state;
      if (["C_ACTIVE","REPEAT_ACTIVE","AWAITING","ERROR"].includes(state)) counts.working++;
      if (state==="C_ACTIVE") counts.c++; if (state==="REPEAT_ACTIVE") counts.command++; if (state==="CURRENT_REGISTRY_RESULT") counts.current++;
      if (state==="HISTORICAL_REGISTRY_RESULT") counts.historical++; if (state==="AWAITING") counts.awaiting++; if (state==="REPORT_MISSING") counts.missing++;
      if (state==="DUPLICATE_REPORT") counts.duplicate++; if (state==="ERROR") counts.error++; if (state==="END") counts.end++; if (state==="IDLE") counts.idle++;
    }
    if (!a.c_enabled && !a.command_enabled) counts.working=0;
    return counts;
  }
  function setText(node,value){const next=text(value);if(node&&node.textContent!==next)node.textContent=next;}
  function ensureTruthOverview(overview,counts){
    if(!overview)return;let truth=byId("worker-truth-overview");if(!truth){truth=document.createElement("div");truth.id="worker-truth-overview";truth.className="worker-truth-overview";truth.setAttribute("aria-label","현재 C·명령·Registry 보고 상태");overview.insertAdjacentElement("afterend",truth);}
    truth.innerHTML=[["작업 중",counts.working,"working"],["C 실행",counts.c,"c"],["명령 실행",counts.command,"command"],["현재 결과",counts.current,"registry-current"],["과거 결과",counts.historical,"registry-historical"],["결과 대기",counts.awaiting,"awaiting"],["미보고",counts.missing,"report-missing"],["중복",counts.duplicate,"duplicate-report"],["오류",counts.error,"error"],["END",counts.end,"end"],["쉬는 중",counts.idle,"idle"]].map(x=>`<span class="truth-${x[2]}">${x[0]} <b>${x[1]}</b></span>`).join("");
  }
  function render(){
    if(!registry||!workspace)return;const a=activity(summary);const workers=(registry.roles||[]).filter(role=>role.enabled!==false&&!/COMMANDER/i.test(text(role.role_type)));const counts=truthCountsFromActivity(workers,a);const overview=byId("worker-overview");
    if(overview){const spans=overview.querySelectorAll(":scope > span");if(spans[0])setText(byId("worker-total-count"),workers.length);if(spans[1])setText(byId("worker-working-count"),counts.working);if(spans[2])setText(byId("worker-resting-count"),counts.idle);if(spans[3])setText(byId("worker-error-count"),counts.error);}
    ensureTruthOverview(overview,counts);
    document.querySelectorAll(".role[data-role-id]").forEach(node=>{const roleId=node.dataset.roleId;const p=projectRoleFromActivity(a,roleId);const dot=node.querySelector(".status-dot");if(dot)dot.className=`status-dot ${p.tone}`;const small=node.querySelector(".role-copy small");if(small){const profile=workspace.seat_profiles&&workspace.seat_profiles[roleId]||{};setText(small,p.label+(p.reference?` · ${p.reference}`:"")+(profile.project_url?" · 프로젝트 연결":""));}});
    const selected=workspace.selected_seat_code;if(selected){const p=projectRoleFromActivity(a,selected);setText(byId("selected-status"),p.label+(p.reference?` · ${p.reference}`:""));const dot=byId("selected-dot");if(dot)dot.className=`status-dot ${p.tone}`;}
    setText(byId("sidebar-eyebrow"),"C MODE · COMMAND · REGISTRY TRUTH");
  }
  function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;render();});}
  async function refresh(){if(!api)return;const values=await Promise.all([api.getRegistry(),api.getState(),api.getCModeState()]);registry=values[0];workspace=values[1];summary=values[2]||{};schedule();}
  function boot(){if(!api||typeof api.getCModeState!=="function")return;if(typeof api.onCModeEvent==="function")api.onCModeEvent(event=>{if(event&&event.summary)summary=event.summary;schedule();});if(typeof api.onRepeatCommandEvent==="function")api.onRepeatCommandEvent(()=>refresh().catch(()=>{}));if(typeof api.onReportWatcherEvent==="function")api.onReportWatcherEvent(event=>{if(event&&event.summary)summary=event.summary;schedule();});refresh().catch(()=>{});setInterval(()=>refresh().catch(()=>{}),5000);}

  window.yollaUiTruthV12=Object.freeze({activity,resultReference,projectRoleFromActivity,truthCountsFromActivity});
  window.addEventListener("DOMContentLoaded",boot);
}());
