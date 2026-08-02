/* eslint-env node */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createYollaPanelRuntime, normalizeRoleId, CHANNELS } = require("./yolla_panel_main_bridge.cjs");

function fakeWindow(id, slot) {
  return {
    id,
    __sfSafeRole: "worker",
    __sfSafeSlot: slot,
    __sfSafePartition: `persist:test-worker-${slot}`,
    __yollaWorkspaceWindow: slot === 1,
    _destroyed: false,
    _title: `Worker ${slot}`,
    sent: [],
    webContents: { send(channel, payload) { this.owner.sent.push({ channel, payload }); } },
    isDestroyed() { return this._destroyed; },
    focus() { this.focused = true; },
    moveTop() { this.movedTop = true; },
    setTitle(value) { this._title = value; },
    getTitle() { return this._title; }
  };
}

function makeRuntime(options = {}) {
  const terminalWindows = new Map();
  const existing = options.existingWindow || null;
  if (existing) {
    existing.webContents.owner = existing;
    terminalWindows.set(`worker:${existing.__sfSafeSlot}`, existing);
  }
  const handlers = new Map();
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "yolla-cycle-test-"));
  let nextId = 100;
  const ipcMain = { handle(channel, fn) { handlers.set(channel, fn); } };
  const shell = { opened: [], async openExternal(url) { this.opened.push(url); } };
  const dispatches = [];
  const runtime = createYollaPanelRuntime({
    ipcMain,
    shell,
    terminalWindows,
    createTerminal(role, slot) {
      assert.equal(role, "worker");
      const win = fakeWindow(nextId++, slot);
      win.webContents.owner = win;
      terminalWindows.set(`worker:${slot}`, win);
      return win;
    },
    getTerminalKey(role, slot) { return `${role}:${slot}`; },
    dispatchNextPrompt(payload) {
      dispatches.push(payload);
      return options.dispatchResult || { ok: true, payload: { dispatchStatus: "READY", targetWindow: "YOLLA_WORKSPACE" } };
    },
    sourceFactoryRoot: "E:\\SOURCE FACTORY",
    registryPath: path.join(__dirname, "YOLLA_PANEL_ROLE_REGISTRY_V1.json"),
    runtimeRoot
  });
  return { runtime, terminalWindows, handlers, shell, dispatches, runtimeRoot };
}

(async function run() {
  let tests = 0;
  function check(condition, message) { assert.ok(condition, message); tests += 1; }
  function equal(actual, expected, message) { assert.equal(actual, expected, message); tests += 1; }

  equal(normalizeRoleId("a-1"), "A-1");
  assert.throws(() => normalizeRoleId("bad role"), (error) => error.code === "INVALID_ROLE_ID"); tests += 1;

  const registry = JSON.parse(fs.readFileSync(path.join(__dirname, "YOLLA_PANEL_ROLE_REGISTRY_V1.json"), "utf8"));
  equal(registry.schema_version, "YOLLA_PANEL_ROLE_REGISTRY_V1");
  equal(registry.groups.length, 6);
  equal(registry.roles.length, 39);
  equal(new Set(registry.roles.map((role) => role.role_id)).size, 39);
  check(registry.roles.some((role) => role.role_id === "A-1" && String(role.role_type).includes("COMMANDER")));
  check(registry.roles.some((role) => role.role_id === "A-3" && role.role_type === "WORKER"));

  const existing = fakeWindow(1, 1);
  const env = makeRuntime({ existingWindow: existing });
  env.runtime.register();
  for (const channel of [
    CHANNELS.GET_REGISTRY,
    CHANNELS.GET_RUNTIME,
    CHANNELS.OPEN_WORKSPACE,
    CHANNELS.SELECT_ROLE,
    CHANNELS.RUN_CYCLE_ONCE,
    CHANNELS.GET_LATEST_CYCLE
  ]) check(env.handlers.has(channel), `handler missing: ${channel}`);

  const workspace = env.runtime.ensureWorkspace({});
  equal(workspace.action, "REUSE_YOLLA_WORKSPACE");
  equal(env.terminalWindows.size, 1);
  equal(workspace.workspace.slot, 1);
  check(existing.__yollaWorkspaceWindow === true);
  check(existing.getTitle().includes("YOLLA Command Workspace"));

  const selected = env.runtime.selectRole({ role_id: "A-3" });
  equal(selected.selected_role_id, "A-3");
  equal(env.runtime.runtimeSnapshot().selected_role_id, "A-3");

  const cycle = await env.runtime.runCycleOnce({
    commander_role_id: "A-1",
    worker_role_id: "A-3",
    command_text: "최신 지시를 읽고 작업을 수행하라."
  });
  equal(cycle.status, "PASS");
  equal(cycle.commander_role_id, "A-1");
  equal(cycle.worker_role_id, "A-3");
  equal(cycle.events.length, 5);
  equal(cycle.events[0].stage, "COMMAND_CREATED");
  equal(cycle.events[1].stage, "EXISTING_STAGE4_DISPATCH_ACCEPTED");
  equal(cycle.events[2].stage, "WORKER_RECEIVED");
  equal(cycle.events[3].stage, "WORKER_ACKNOWLEDGED");
  equal(cycle.events[4].stage, "COMMANDER_RESULT_RECEIVED");
  equal(cycle.canary_result.status, "CANARY_ACK_PASS");
  equal(cycle.business_execution_performed, false);
  equal(cycle.worker_ai_execution_performed, false);
  equal(env.dispatches.length, 1);
  equal(env.dispatches[0].items[0].prompt_text, "최신 지시를 읽고 작업을 수행하라.");
  equal(env.dispatches[0].items[0].worker_id, "A-3");
  check(fs.existsSync(path.join(env.runtimeRoot, "cycles", "LATEST_YOLLA_COMMAND_CYCLE.json")));
  check(existing.sent.some((item) => item.channel === "yolla-worker-cycle-event"));

  const blockedEnv = makeRuntime({ dispatchResult: { ok: false, payload: { dispatchStatus: "BLOCKED" } } });
  const blocked = await blockedEnv.runtime.runCycleOnce({ commander_role_id: "A-1", worker_role_id: "A-3", command_text: "canary" });
  equal(blocked.status, "BLOCKED");
  equal(blocked.events[blocked.events.length - 1].stage, "CYCLE_BLOCKED");

  assert.throws(() => env.runtime.selectRole({ role_id: "UNKNOWN" }), (error) => error.code === "ROLE_NOT_FOUND"); tests += 1;
  await assert.rejects(() => env.runtime.runCycleOnce({ commander_role_id: "A-3", worker_role_id: "A-4", command_text: "x" }), (error) => error.code === "COMMANDER_ROLE_REQUIRED"); tests += 1;
  await assert.rejects(() => env.runtime.runCycleOnce({ commander_role_id: "A-1", worker_role_id: "A-2", command_text: "x" }), (error) => error.code === "WORKER_ROLE_REQUIRED"); tests += 1;

  const renderer = fs.readFileSync(path.join(__dirname, "yolla_panel_renderer.js"), "utf8");
  for (const contract of ["커맨더 → 워커 → 커맨더 1회 순환", "openWorkspace", "runCycleOnce", "1회 명령 순환 실행", "window.YollaPanel"]) {
    check(renderer.includes(contract), `panel renderer contract missing: ${contract}`);
  }
  const workerShell = fs.readFileSync(path.join(__dirname, "yolla_worker_shell.js"), "utf8");
  for (const contract of ["COMMAND_CREATED", "WORKER_RECEIVED", "COMMANDER_RESULT_RECEIVED", "data-group-toggle", "data-role-id"]) {
    check(workerShell.includes(contract), `worker shell contract missing: ${contract}`);
  }
  const preload = fs.readFileSync(path.join(__dirname, "yolla_worker_preload.js"), "utf8");
  for (const contract of ["yollaWorker", "yolla-panel:select-role", "yolla-panel:run-cycle-once", "yolla-worker-cycle-event"]) {
    check(preload.includes(contract), `worker preload contract missing: ${contract}`);
  }
  const installer = fs.readFileSync(path.join(__dirname, "INSTALL_YOLLA_COMMAND_CYCLE_V2.ps1"), "utf8");
  for (const marker of ["YOLLA_PANEL_MAIN_BRIDGE_REGISTER_V2", "YOLLA_WORKSPACE_CONSTANTS_V2", "YOLLA_WORKSPACE_BOUNDS_V2", "YOLLA_WORKSPACE_TERMINAL_V2", "YOLLA_PANEL_PRELOAD_BRIDGE_V2"]) {
    check(installer.includes(marker), `installer marker missing: ${marker}`);
  }

  console.log(JSON.stringify({
    status: "PASS",
    tests,
    role_count: registry.roles.length,
    group_count: registry.groups.length,
    workspace_window_count: env.terminalWindows.size,
    cycle_status: cycle.status,
    cycle_event_count: cycle.events.length,
    existing_stage4_dispatch_calls: env.dispatches.length,
    canary_only: true,
    business_execution_performed: false,
    new_electron_runtime_count: 0,
    new_browser_runtime_count: 0,
    new_prompt_transport_count: 0
  }, null, 2));
}()).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
