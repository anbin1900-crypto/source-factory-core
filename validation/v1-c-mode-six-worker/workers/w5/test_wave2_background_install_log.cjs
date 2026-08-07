/* eslint-env node */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const root = process.argv[2];
if (!root) throw new Error("SUPPLEMENT_ROOT_REQUIRED");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8").replace(/^\uFEFF/, "");
const runtime = read("baseline-v510241/src/apply_c_mode_patch.cjs");
const installer = read("installer-v510241/install_v510241.ps1");
const rollback = read("installer-v510241/ROLLBACK_AI_YOLLA_PANEL_WORKSPACE_V5_10_2_4_1.ps1");
const assertions = [];
const check = (name, fn) => { fn(); assertions.push(name); };

check("hidden-browser", () => {
  assert.match(runtime, /show:\s*false/);
  assert.match(runtime, /skipTaskbar:\s*true/);
  assert.match(runtime, /backgroundThrottling:\s*false/);
});
check("shared-login-profile", () => {
  assert.match(runtime, /session\.fromPartition\(WORKER_BROWSER_PARTITION\)/);
  assert.match(installer, /browser_profile_deleted\s*=\s*\$false/);
  assert.match(installer, /browser_profile_overwritten\s*=\s*\$false/);
  assert.match(installer, /smoke_test_used_live_profile\s*=\s*\$false/);
});
check("document-timeout-30-seconds", () => assert.match(runtime, /cWaitForBrowserDocument\(webContents, targetUrl, 30000\)/));
check("retry-at-most-five", () => {
  assert.match(runtime, /for \(let attempt = 1; attempt <= 5; attempt \+= 1\)/);
  assert.match(runtime, /attempt >= 5/);
  assert.match(runtime, /C_MODE_DISPATCH_FAILED_AFTER_5_ATTEMPTS/);
});
check("retry-only-definitely-not-sent", () => {
  assert.match(runtime, /error\.definitely_not_sent !== true/);
  assert.match(runtime, /dispatch_uncertain/);
});
check("per-role-serialization", () => {
  assert.match(runtime, /cRoleDispatchTails/);
  assert.match(runtime, /const prior = cRoleDispatchTails\.get\(roleId\) \|\| Promise\.resolve\(\)/);
  assert.match(runtime, /prior\.then\(run, run\)/);
});
check("dispatch-proof-before-receipt", () => {
  assert.match(runtime, /prompt_sent:\s*injection\.prompt_sent === true/);
  assert.match(runtime, /dispatch_proof:\s*injection\.dispatch_proof === true/);
  assert.match(runtime, /new_user_message_observed/);
  assert.match(runtime, /writeJsonAtomic\(receiptPath, receipt\)/);
});
check("browser-release", () => {
  assert.match(runtime, /releaseCModeRoleWindow/);
  assert.match(runtime, /roleWindow\.destroy\(\)/);
  assert.match(runtime, /C_MODE_ROLE_BROWSER_RELEASED/);
});
check("runtime-and-work-control-log-preserved", () => {
  assert.match(installer, /work_control_log_preserved\s*=\s*\$true/);
  assert.match(installer, /runtime_log_preserved\s*=\s*\$true/);
  assert.match(installer, /work_control_events\.jsonl/);
  assert.match(installer, /runtime\.log/);
});
check("isolated-smoke-profile", () => {
  assert.match(installer, /AI_YOLLA_TEST_STATE_ROOT/);
  assert.match(installer, /AI_YOLLA_TEST_USER_DATA_ROOT/);
  assert.match(installer, /smoke-v510241-/);
});
check("install-failure-rollback", () => {
  assert.match(installer, /rollback_attempted\s*=\s*\$true/);
  assert.match(installer, /Restore-Launchers/);
  assert.match(installer, /Start-OldRuntimeIfAvailable/);
});
check("explicit-rollback-preserves-evidence", () => {
  assert.match(rollback, /target_release_preserved_for_evidence/);
  assert.match(rollback, /c_state_preserved/);
  assert.match(rollback, /runtime_log_preserved/);
});

console.log(JSON.stringify({status:"PASS", assertion_count: assertions.length, assertions}, null, 2));
