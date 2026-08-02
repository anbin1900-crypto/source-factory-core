/* eslint-env node */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createYollaPanelRuntime, normalizeRoleId, CHANNELS } = require("./yolla_panel_main_bridge");

function fakeWindow(id, slot) {
  return {
    id,
    __sfSafeRole: "worker",
    __sfSafeSlot: slot,
    __sfSafePartition: `persist:test-worker-${slot}`,
    _destroyed: false,
    _title: `Worker ${slot}`,
    isDestroyed() { return this._destroyed; },
    focus() { this.focused = true; },
    moveTop() { this.movedTop = true; },
    setTitle(value) { this._title = value; },
    getTitle() { return this._title; }
  };
}

function makeRuntime(initialWindows = []) {
  const terminalWindows = new Map();
  initialWindows.forEach((win) => terminalWindows.set(`worker:${win.__sfSafeSlot}`, win));
  const handlers = new Map();
  let nextId = 100;
  const ipcMain = { handle(channel, fn) { handlers.set(channel, fn); } };
  const shell = { opened: [], async openExternal(url) { this.opened.push(url); } };
  const runtime = createYollaPanelRuntime({
    ipcMain,
    shell,
    terminalWindows,
    createTerminal(role, slot) {
      assert.equal(role, "worker");
      const win = fakeWindow(nextId++, slot);
      terminalWindows.set(`worker:${slot}`, win);
      return win;
    },
    getTerminalKey(role, slot) { return `${role}:${slot}`; },
    sourceFactoryRoot: "E:\\SOURCE FACTORY",
    registryPath: path.join(__dirname, "YOLLA_PANEL_ROLE_REGISTRY_V1.json")
  });
  return { runtime, terminalWindows, handlers, shell };
}

(function run() {
  assert.equal(normalizeRoleId("a-1"), "A-1");
  assert.throws(() => normalizeRoleId("bad role"), /INVALID_ROLE_ID/);

  const registry = JSON.parse(fs.readFileSync(path.join(__dirname, "YOLLA_PANEL_ROLE_REGISTRY_V1.json"), "utf8"));
  assert.equal(registry.schema_version, "YOLLA_PANEL_ROLE_REGISTRY_V1");
  assert.equal(registry.groups.length, 6);
  assert.equal(registry.roles.length, 39);
  assert.equal(new Set(registry.roles.map((role) => role.role_id)).size, 39);
  assert.ok(registry.provider_slots.includes("directive"));
  assert.ok(registry.provider_slots.includes("commandPayload"));

  const existing = fakeWindow(1, 1);
  const env = makeRuntime([existing]);
  env.runtime.register();
  assert.ok(env.handlers.has(CHANNELS.GET_REGISTRY));
  assert.ok(env.handlers.has(CHANNELS.GET_RUNTIME));
  assert.ok(env.handlers.has(CHANNELS.OPEN_WORKER));

  const a1 = env.runtime.openWorker({ role_id: "A-1", role_name: "A-1", preferred_slot: 1 });
  assert.equal(a1.action, "REUSE_UNBOUND_EXISTING_WINDOW");
  assert.equal(a1.binding.slot, 1);
  assert.equal(existing.__yollaRoleId, "A-1");
  assert.match(existing.getTitle(), /A-1/);

  const a1Again = env.runtime.openWorker({ role_id: "A-1", role_name: "A-1" });
  assert.equal(a1Again.action, "REUSE_ROLE_BINDING");
  assert.equal(env.terminalWindows.size, 1);

  const a2 = env.runtime.openWorker({ role_id: "A-2", role_name: "A-2", preferred_slot: 2 });
  assert.equal(a2.action, "CREATE_WITH_EXISTING_SAFE_PANEL_FACTORY");
  assert.equal(a2.binding.slot, 2);
  assert.notEqual(a1.binding.window_id, a2.binding.window_id);
  assert.notEqual(a1.binding.browser_session_id, a2.binding.browser_session_id);

  const snapshot = env.runtime.runtimeSnapshot();
  assert.equal(snapshot.existing_safe_panel_runtime_reused, true);
  assert.equal(snapshot.new_electron_runtime_count, 0);
  assert.equal(snapshot.new_ipc_transport_count, 0);
  assert.equal(snapshot.bindings.length, 2);

  assert.throws(() => env.runtime.focusWorker({ role_id: "B-1" }), /ROLE_NOT_BOUND/);
  assert.throws(() => env.runtime.openWorker({ role_id: "bad role" }), /INVALID_ROLE_ID/);

  const renderer = fs.readFileSync(path.join(__dirname, "yolla_panel_renderer.js"), "utf8");
  for (const contract of [
    "window.YollaPanel",
    "registerProvider",
    "yolla:role-selected",
    "yolla:worker-window-bound",
    "yolla:command-requested",
    "EXISTING_SF_API_STAGE4"
  ]) assert.ok(renderer.includes(contract), `renderer contract missing: ${contract}`);

  const installer = fs.readFileSync(path.join(__dirname, "INSTALL_YOLLA_PANEL_CONNECTION_FRONTIER.ps1"), "utf8");
  for (const marker of [
    "YOLLA_PANEL_MAIN_BRIDGE_REQUIRE_V1",
    "YOLLA_PANEL_MAIN_BRIDGE_REGISTER_V1",
    "YOLLA_PANEL_PRELOAD_BRIDGE_V1",
    "YOLLA_PANEL_SHELL_V1",
    "YOLLA_PANEL_RENDERER_SCRIPT_V1"
  ]) assert.ok(installer.includes(marker), `installer marker missing: ${marker}`);

  console.log(JSON.stringify({
    status: "PASS",
    tests: 28,
    role_count: registry.roles.length,
    group_count: registry.groups.length,
    provider_slots: registry.provider_slots,
    bindings_tested: snapshot.bindings.length,
    new_electron_runtime_count: 0,
    new_prompt_transport_count: 0
  }, null, 2));
}());
