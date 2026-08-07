/* eslint-env node */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const ui = fs.readFileSync(path.join(root, "workspace_c_mode.js"), "utf8");
const css = fs.readFileSync(path.join(root, "workspace_c_mode.css"), "utf8");

const checks = [
  ["group C trigger", ui.includes("data-c-group")],
  ["group C label", ui.includes('button.textContent = "C"')],
  ["C dialog", ui.includes("openCDialog")],
  ["C start", ui.includes("api.startCMode")],
  ["C pause", ui.includes("api.pauseCMode")],
  ["C resume", ui.includes("api.resumeCMode")],
  ["C stop", ui.includes("api.stopCMode")],
  ["command dialog", ui.includes("openCommandDialog")],
  ["command interceptor", ui.includes('[data-action="command"]')],
  ["legacy command suppression", ui.includes("stopImmediatePropagation")],
  ["C activity projection", ui.includes("c_active_roles")],
  ["command activity projection", ui.includes("command_active_roles")],
  ["command waiting projection", ui.includes("command_awaiting_roles")],
  ["error projection", ui.includes("error_roles")],
  ["idle truth", ui.includes('return { tone: "idle", label: "쉬는 중" }')],
  ["legacy profile status excluded", !ui.includes("profile.status")],
  ["C button CSS", css.includes(".group-mode-button.c-button")],
  ["legacy E hidden", css.includes(".group-mode-button.epic-button")],
  ["legacy A hidden", css.includes(".group-mode-button.automation-button")],
  ["legacy schedule hidden", css.includes("#worker-schedule-panel")]
];

const failed = checks.filter(([, passed]) => !passed);
if (failed.length) {
  throw new Error(`W3_UI_TRUTH_FAILED:${failed.map(([name]) => name).join(",")}`);
}

process.stdout.write(JSON.stringify({
  schema_version: "V1_C_MODE_W3_UI_TRUTH_TEST_V1",
  status: "PASS",
  assertions: checks.length,
  failed: 0,
  coverage: [
    "idle-truth",
    "legacy-a-e-exclusion",
    "group-c-controls",
    "top-command-popup",
    "c-command-error-counter-separation"
  ]
}, null, 2) + "\n");
