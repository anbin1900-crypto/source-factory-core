"use strict";
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(process.argv[2] || process.cwd());
const jsPath = path.join(root, "workspace_c_mode.js");
const cssPath = path.join(root, "workspace_c_mode.css");
let js = fs.readFileSync(jsPath, "utf8");
let css = fs.readFileSync(cssPath, "utf8");
if (!js.includes("report_missing_roles")) {
  js = js.replace("      error_roles: []\n", "      error_roles: [],\n      report_missing_roles: [],\n      directive_pending_roles: [],\n      reported_pass_roles: [],\n      reported_blocked_roles: [],\n      end_roles: []\n");
  const start = js.indexOf("  function roleProjection(roleId) {");
  const end = js.indexOf("\n  function updateOverviewAndRoles()", start);
  if (start < 0 || end < 0) throw new Error("UI_PROJECTION_ANCHOR_NOT_FOUND");
  const block = `  function roleProjection(roleId) {\n    const a = activity();\n    const id = upper(roleId);\n    const has = key => new Set(unique(a[key])).has(id);\n    if (has("error_roles")) return { tone: "error", label: "오류", state: "ERROR" };\n    if (has("report_missing_roles")) return { tone: "report-missing", label: "보고 누락", state: "REPORT_MISSING" };\n    if (has("directive_pending_roles")) return { tone: "directive-pending", label: "지시 대기", state: "DIRECTIVE_PENDING" };\n    if (has("c_active_roles")) return { tone: "running", label: "C 모드 실행", state: "C_ACTIVE" };\n    if (has("command_active_roles")) return { tone: "command-running", label: "명령 실행", state: "REPEAT_ACTIVE" };\n    if (has("command_awaiting_roles")) return { tone: "awaiting", label: "완료 대기", state: "AWAITING" };\n    if (has("reported_blocked_roles")) return { tone: "reported-blocked", label: "보고 완료·차단", state: "REPORTED_BLOCKED" };\n    if (has("reported_pass_roles")) return { tone: "reported-pass", label: "보고 완료", state: "REPORTED_PASS" };\n    if (has("end_roles")) return { tone: "end", label: "END", state: "END" };\n    return { tone: "idle", label: "쉬는 중", state: "IDLE" };\n  }\n\n  function truthCounts(workerRoles) {\n    const counts = { working: 0, c: 0, command: 0, awaiting: 0, reportMissing: 0, error: 0, end: 0, idle: 0 };\n    workerRoles.forEach(role => {\n      const state = roleProjection(role.role_id).state;\n      if (["C_ACTIVE", "REPEAT_ACTIVE", "AWAITING", "ERROR"].includes(state)) counts.working += 1;\n      if (state === "C_ACTIVE") counts.c += 1;\n      if (state === "REPEAT_ACTIVE") counts.command += 1;\n      if (state === "AWAITING") counts.awaiting += 1;\n      if (state === "REPORT_MISSING") counts.reportMissing += 1;\n      if (state === "ERROR") counts.error += 1;\n      if (state === "END") counts.end += 1;\n      if (state === "IDLE") counts.idle += 1;\n    });\n    return counts;\n  }\n`;
  js = js.slice(0, start) + block + js.slice(end);
  js = js.replace("    const a = activity();\n    const workerRoles", "    const workerRoles");
  js = js.replace(/    const cActive = unique\([\s\S]*?const errors = unique\([\s\S]*?;\n/, "    const counts = truthCounts(workerRoles);\n");
  js = js.replace(/setText\(byId\("worker-working-count"\),[^;]+;/, 'setText(byId("worker-working-count"), counts.working);');
  js = js.replace(/setText\(byId\("worker-resting-count"\),[^;]+;/, 'setText(byId("worker-resting-count"), counts.idle);');
  js = js.replace(/setText\(byId\("worker-error-count"\),[^;]+;/, 'setText(byId("worker-error-count"), counts.error);');
}
if (!css.includes("truth-report-missing")) css += `\n.worker-truth-overview{display:flex;flex-wrap:wrap;gap:6px}.status-dot.report-missing{background:#f59e0b!important}.status-dot.directive-pending{background:#7c3aed!important}.status-dot.command-running{background:#2563eb!important}.status-dot.awaiting{background:#0891b2!important}.status-dot.reported-pass{background:#16a34a!important}.status-dot.reported-blocked{background:#ca8a04!important}.status-dot.end{background:#64748b!important}.truth-report-missing{border-color:#f59e0b!important;background:#fffbeb!important}.truth-awaiting{border-color:#06b6d4!important;background:#ecfeff!important}\n`;
fs.writeFileSync(jsPath, js);
fs.writeFileSync(cssPath, css);
console.log(JSON.stringify({status:"PASS", js:jsPath, css:cssPath}));
