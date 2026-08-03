/* eslint-env node */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createYollaPanelRuntime, CHANNELS } = require("./yolla_panel_main_bridge.cjs");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "yolla-chrome-tabs-"));
const registryPath = path.join(root, "registry.json");
const runtimeRoot = path.join(root, "runtime");
fs.writeFileSync(registryPath, JSON.stringify({
  schema_version: "YOLLA_PANEL_ROLE_REGISTRY_V1",
  default_selected_role_id: "A-1",
  default_worker_url: "https://chatgpt.com/",
  groups: [
    { group_id: "A_GROUP", group_name: "A그룹", order: 10, default_expanded: true },
    { group_id: "B_GROUP", group_name: "B그룹", order: 20, default_expanded: true }
  ],
  roles: [
    { role_id: "A-1", role_name: "A 커맨더", group_id: "A_GROUP", role_type: "GROUP_COMMANDER", commander_id: null, preferred_slot: 1, order: 10 },
    { role_id: "A-2", role_name: "기본 워커", group_id: "A_GROUP", role_type: "WORKER", commander_id: "A-1", preferred_slot: 2, order: 20 },
    { role_id: "B-1", role_name: "B 커맨더", group_id: "B_GROUP", role_type: "GROUP_COMMANDER", commander_id: null, preferred_slot: 3, order: 10 }
  ]
}, null, 2));

const handlers = new Map();
const sent = [];
const win = {
  id: 1, __sfSafeRole: "worker", __sfSafeSlot: 1, __sfSafePartition: "persist:test", __yollaWorkspaceWindow: true,
  webContents: { send(channel, payload) { sent.push({ channel, payload }); } },
  isDestroyed() { return false; }, focus() {}, moveTop() {}, setTitle() {}, getTitle() { return "YOLLA"; }
};
const runtime = createYollaPanelRuntime({
  ipcMain: { handle(channel, fn) { handlers.set(channel, fn); } },
  shell: { async openExternal() {} },
  terminalWindows: new Map([["worker:1", win]]),
  createTerminal() { return win; },
  getTerminalKey(role, slot) { return `${role}:${slot}`; },
  dispatchNextPrompt() { return { ok: true, payload: { dispatchStatus: "READY" } }; },
  registryPath,
  runtimeRoot,
  sourceFactoryRoot: root
});
runtime.register();

let tests = 0;
function equal(actual, expected, message) { assert.equal(actual, expected, message); tests += 1; }
function ok(value, message) { assert.ok(value, message); tests += 1; }
function throws(fn, code) { assert.throws(fn, (error) => error && error.code === code); tests += 1; }

let registry = runtime.getRegistry();
equal(registry.schema_version, "YOLLA_PANEL_ROLE_REGISTRY_V2");
equal(registry.source_schema_version, "YOLLA_PANEL_ROLE_REGISTRY_V1");
equal(registry.dynamic_worker_count, 0);
equal(registry.groups.find((group) => group.group_id === "A_GROUP").color, "#ef4444");

const groupResult = runtime.updateGroup({ group_id: "A_GROUP", group_name: "자동화팀", color: "#123abc" });
equal(groupResult.group.group_name, "자동화팀");
equal(groupResult.group.color, "#123abc");
ok(fs.existsSync(path.join(runtimeRoot, "YOLLA_PANEL_USER_CUSTOMIZATION_V1.json")));

const added = runtime.addWorker({ group_id: "A_GROUP", role_name: "추가 워커", project_url: "https://chatgpt.com/g/test" });
equal(added.role.role_id, "A-3");
equal(added.role.role_type, "WORKER");
equal(added.role.commander_id, "A-1");
equal(added.role.user_defined, true);
equal(added.registry.dynamic_worker_count, 1);
throws(() => runtime.addWorker({ group_id: "A_GROUP", role_id: "A-3", role_name: "중복" }), "ROLE_ID_EXISTS");

const updated = runtime.updateRole({ role_id: "A-3", role_name: "법률자료 워커", context_url: "https://chatgpt.com/c/test" });
equal(updated.role.role_name, "법률자료 워커");
equal(updated.role.context_url, "https://chatgpt.com/c/test");
throws(() => runtime.deleteWorker({ role_id: "A-2" }), "ONLY_USER_DEFINED_WORKER_CAN_BE_DELETED");
const deleted = runtime.deleteWorker({ role_id: "A-3" });
equal(deleted.deleted_role_id, "A-3");
equal(deleted.registry.dynamic_worker_count, 0);

for (const channel of [CHANNELS.UPDATE_GROUP, CHANNELS.ADD_WORKER, CHANNELS.UPDATE_ROLE, CHANNELS.DELETE_WORKER]) {
  ok(handlers.has(channel), `missing handler ${channel}`);
}
ok(sent.some((item) => item.channel === "yolla-worker-registry-updated"));

const shell = fs.readFileSync(path.join(__dirname, "yolla_worker_shell.js"), "utf8");
for (const marker of ["yw-group-tabs", "updateGroup", "addWorker", "deleteWorker", "selectedGroupId"]) ok(shell.includes(marker), marker);
const html = fs.readFileSync(path.join(__dirname, "yolla_worker_shell.html"), "utf8");
for (const marker of ["yw-group-dialog", "yw-worker-dialog", "yw-add-worker", "role=\"tablist\""]) ok(html.includes(marker), marker);
const css = fs.readFileSync(path.join(__dirname, "yolla_worker_shell.css"), "utf8");
for (const marker of [".yw-group-tab", "border-radius: 10px 10px 0 0", "--active-group", ".yw-role-new"]) ok(css.includes(marker), marker);
const preload = fs.readFileSync(path.join(__dirname, "yolla_worker_preload.js"), "utf8");
for (const marker of ["yolla-panel:update-group", "yolla-panel:add-worker", "yolla-panel:delete-worker", "onRegistryUpdated"]) ok(preload.includes(marker), marker);

console.log(JSON.stringify({ status: "PASS", tests, chrome_group_tabs: true, group_rename: true, group_color: true, dynamic_worker_add: true, persistence: true }, null, 2));
