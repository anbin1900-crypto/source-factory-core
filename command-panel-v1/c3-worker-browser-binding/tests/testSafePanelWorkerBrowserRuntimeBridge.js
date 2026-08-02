/* eslint-env node */
"use strict";

const assert = require("assert");
const path = require("path");
const { createSafePanelWorkerBrowserRuntimeBridge } = require(path.join(__dirname, "..", "src", "safePanelWorkerBrowserRuntimeBridge"));
const { createWorkerBrowserBindingAdapter } = require(path.join(__dirname, "..", "src", "workerBrowserBindingAdapter"));

function makeWindow(role, slot) {
  return {
    id: `${role}-${slot}`,
    __sfSafeRole: role,
    __sfSafeSlot: slot,
    __sfSafePartition: `persist:sf4-safe-panel-${role}-${slot}`,
    destroyed: false,
    focused: 0,
    moved: 0,
    isDestroyed() { return this.destroyed; },
    focus() { this.focused += 1; },
    moveTop() { this.moved += 1; }
  };
}

const terminals = new Map();
const getTerminalKey = (role, slot) => `${role}:${slot}`;
const worker1 = makeWindow("worker", 1);
const commander1 = makeWindow("commander", 1);
terminals.set(getTerminalKey("worker", 1), worker1);
terminals.set(getTerminalKey("commander", 1), commander1);
let createCount = 0;
function createTerminal(role, slot) {
  createCount += 1;
  const win = makeWindow(role, slot);
  terminals.set(getTerminalKey(role, slot), win);
  return win;
}

const bridge = createSafePanelWorkerBrowserRuntimeBridge({ terminalWindows: terminals, createTerminal, getTerminalKey });
assert.deepStrictEqual(bridge.listWorkerWindows().map((w) => w.id), ["worker-1"]);
const adapter = createWorkerBrowserBindingAdapter(bridge, { firstDynamicSlot: 2 });
const c3 = adapter.bindRole({ role_id: "C-3", preferred_slot: 1, role_context: { label: "C-3", input: "hidden" } });
assert.strictEqual(c3.action, "REUSE_UNBOUND_EXISTING_WINDOW");
assert.strictEqual(c3.binding.browser_session_id, "persist:sf4-safe-panel-worker-1");
assert.strictEqual(worker1.__sfCommandPanelRoleBinding.role_id, "C-3");
assert.deepStrictEqual(worker1.__sfCommandPanelRoleBinding.context, { label: "C-3" });
assert.strictEqual(worker1.focused > 0, true);
assert.strictEqual(worker1.moved > 0, true);

const c4 = adapter.bindRole({ role_id: "C-4" });
assert.strictEqual(c4.action, "CREATE_WITH_EXISTING_RUNTIME_FACTORY");
assert.strictEqual(createCount, 1);
assert.strictEqual(c4.binding.browser_session_id, "persist:sf4-safe-panel-worker-2");
assert.strictEqual(adapter.switchRole("C-3", "C-4").isolation, "PASS_DISTINCT_WINDOW_AND_SESSION");
assert.deepStrictEqual(adapter.validateIsolation(), { ok: true, binding_count: 2 });

const malformed = makeWindow("worker", 8);
terminals.set("wrong-key", malformed);
assert.throws(() => bridge.listWorkerWindows(), /SAFE_PANEL_TERMINAL_KEY_MISMATCH/);
terminals.delete("wrong-key");

console.log("SUMMARY 10/10 PASS");
