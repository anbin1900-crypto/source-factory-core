"use strict";
function upper(value) { return String(value == null ? "" : value).trim().toUpperCase(); }
function unique(values) { return [...new Set((values || []).map(upper).filter(Boolean))]; }
function normalizeReportTruth(input = {}) {
  const reports = input.reports_by_role || input.report_truth_by_role || {};
  const repeat = input.repeat_by_role || input.repeat_state_by_role || {};
  const output = {
    c_active_roles: [], command_active_roles: [], command_awaiting_roles: [],
    command_enabled_target_roles: [], error_roles: [], report_missing_roles: [],
    directive_pending_roles: [], reported_pass_roles: [], reported_blocked_roles: [], end_roles: []
  };
  const roles = new Set([
    ...Object.keys(reports), ...Object.keys(repeat),
    ...(input.c_active_roles || []), ...(input.error_roles || [])
  ]);
  for (const rawRole of roles) {
    const roleId = upper(rawRole);
    const report = reports[rawRole] || reports[roleId] || {};
    const command = repeat[rawRole] || repeat[roleId] || {};
    const verdict = upper(report.verdict || report.status || report.report_status);
    const commandState = upper(command.state || command.status);
    if ((input.error_roles || []).map(upper).includes(roleId) || ["ERROR", "FAILED", "RETRY_EXHAUSTED"].includes(commandState)) output.error_roles.push(roleId);
    else if (verdict === "REPORT_MISSING" || (report.result_commit && !report.terminal_post_id)) output.report_missing_roles.push(roleId);
    else if (verdict === "DIRECTIVE_PENDING") output.directive_pending_roles.push(roleId);
    else if ((input.c_active_roles || []).map(upper).includes(roleId)) output.c_active_roles.push(roleId);
    else if (["RUNNING", "ACTIVE", "DISPATCHED"].includes(commandState)) output.command_active_roles.push(roleId);
    else if (["AWAITING", "RESULT_WAITING", "COMPLETION_WAIT"].includes(commandState)) output.command_awaiting_roles.push(roleId);
    else if (verdict === "REPORTED_BLOCKED") output.reported_blocked_roles.push(roleId);
    else if (verdict === "REPORTED_PASS") output.reported_pass_roles.push(roleId);
    else if (verdict === "END" || commandState === "END") output.end_roles.push(roleId);
  }
  for (const key of Object.keys(output)) output[key] = unique(output[key]);
  return output;
}
function applyToSummary(summary = {}, watcherState = {}) {
  return { ...summary, activity: { ...(summary.activity || {}), ...normalizeReportTruth(watcherState) } };
}
module.exports = { normalizeReportTruth, applyToSummary };
