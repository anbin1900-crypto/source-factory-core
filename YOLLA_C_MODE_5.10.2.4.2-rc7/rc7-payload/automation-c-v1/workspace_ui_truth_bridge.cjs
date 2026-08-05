"use strict";

function text(value) { return String(value == null ? "" : value); }
function upper(value) { return text(value).trim().toUpperCase(); }
function unique(values) { return [...new Set((values || []).map(upper).filter(Boolean))]; }
function push(output, key, roleId) { if (roleId) output[key].push(roleId); }

function normalizeUiTruth(watcherState = {}) {
  const reports = watcherState.reports_by_role || watcherState.report_truth_by_role || watcherState.registry_by_role || {};
  const repeat = watcherState.repeat_by_role || watcherState.repeat_state_by_role || {};
  const explicitRoles = [
    ...(watcherState.c_active_roles || []), ...(watcherState.error_roles || []), ...(watcherState.end_roles || [])
  ];
  const output = {
    c_enabled: Boolean(watcherState.c_enabled),
    command_enabled: Boolean(watcherState.command_enabled),
    c_active_roles: [], command_active_roles: [], command_awaiting_roles: [], command_enabled_target_roles: [],
    current_registry_result_roles: [], historical_registry_result_roles: [], report_missing_roles: [],
    duplicate_report_roles: [], directive_pending_roles: [], error_roles: [], end_roles: [],
    result_reference_by_role: {}
  };
  const roles = new Set([...Object.keys(reports), ...Object.keys(repeat), ...explicitRoles]);
  const cActive = new Set(unique(watcherState.c_active_roles));
  const errors = new Set(unique(watcherState.error_roles));
  const ended = new Set(unique(watcherState.end_roles));
  for (const rawRole of roles) {
    const roleId = upper(rawRole);
    const report = reports[rawRole] || reports[roleId] || {};
    const command = repeat[rawRole] || repeat[roleId] || {};
    const resultCommentId = Number(report.result_comment_id || report.terminal_post_id || 0) || null;
    const resultKey = text(report.result_key || "");
    const relation = upper(report.registry_relation || report.relation);
    const verdict = upper(report.verdict || report.status || report.report_status);
    const commandState = upper(command.state || command.status);
    const resultCommit = text(report.result_commit || report.commit_id || "");
    output.result_reference_by_role[roleId] = {
      result_comment_id: resultCommentId,
      result_key: resultKey,
      display: resultCommentId ? `RESULT_COMMENT #${resultCommentId}` : (resultKey ? `RESULT_KEY ${resultKey}` : "")
    };
    if (errors.has(roleId) || report.error || ["ERROR","FAILED","RETRY_EXHAUSTED"].includes(commandState)) push(output,"error_roles",roleId);
    else if (report.duplicate_report || report.duplicate_result || verdict === "DUPLICATE_REPORT") push(output,"duplicate_report_roles",roleId);
    else if (report.report_missing || verdict === "REPORT_MISSING" || (resultCommit && !resultCommentId)) push(output,"report_missing_roles",roleId);
    else if (verdict === "DIRECTIVE_PENDING") push(output,"directive_pending_roles",roleId);
    else if (cActive.has(roleId)) push(output,"c_active_roles",roleId);
    else if (["RUNNING","ACTIVE","DISPATCHED"].includes(commandState)) push(output,"command_active_roles",roleId);
    else if (["AWAITING","RESULT_WAITING","COMPLETION_WAIT"].includes(commandState) || report.awaiting_result) push(output,"command_awaiting_roles",roleId);
    else if (relation === "CURRENT" && resultCommentId) push(output,"current_registry_result_roles",roleId);
    else if (relation === "HISTORICAL" && resultCommentId) push(output,"historical_registry_result_roles",roleId);
    else if (ended.has(roleId) || verdict === "END" || commandState === "END") push(output,"end_roles",roleId);
    if (command.enabled === true) push(output,"command_enabled_target_roles",roleId);
  }
  for (const key of Object.keys(output)) if (Array.isArray(output[key])) output[key] = unique(output[key]);
  return output;
}

function applyToSummary(summary = {}, watcherState = {}) {
  return { ...summary, activity: { ...(summary.activity || {}), ...normalizeUiTruth(watcherState) } };
}

module.exports = { normalizeUiTruth, applyToSummary };
