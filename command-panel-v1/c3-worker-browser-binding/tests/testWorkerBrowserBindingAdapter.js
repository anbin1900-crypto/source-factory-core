/* eslint-env node */
"use strict";

const assert = require("assert");
const path = require("path");
const {
  createWorkerBrowserBindingAdapter,
  normalizeRoleId,
  sanitizeRoleContext
} = require(path.join(__dirname, "..", "src", "workerBrowserBindingAdapter"));

function makeRuntime(initialWindows) {
  const windows = (initialWindows || []).slice();
  const focused = [];
  const contexts = [];
  let createCalls = 0;
  function makeWindow(slot, id, sessionId) {
    return { id: id || `window-${slot}`, slot, sessionId: sessionId || `persist:sf4-safe-panel-worker-${slot}`, destroyed: false, isDestroyed() { return this.destroyed; } };
  }
  const runtime = {
    listWorkerWindows: () => windows.slice(),
    createWorkerWindow: ({ slot }) => {
      createCalls += 1;
      const win = makeWindow(slot, `created-${slot}`, `persist:sf4-safe-panel-worker-${slot}`);
      windows.push(win);
      return win;
    },
    getWindowId: (win) => win.id,
    getBrowserSessionId: (win) => win.sessionId,
    getWorkerSlot: (win) => win.slot,
    isWindowAlive: (win) => Boolean(win && !win.destroyed),
    focusWindow: (win) => focused.push(win.id),
    attachRoleContext: (_win, binding) => contexts.push(binding)
  };
  return { runtime, focused, contexts, getCreateCalls: () => createCalls };
}

function windowFixture(slot, sessionId) {
  return { id: `window-${slot}`, slot, sessionId: sessionId || `session-${slot}`, destroyed: false, isDestroyed() { return this.destroyed; } };
}

const cases = [];
function test(name, fn) { cases.push({ name, fn }); }

test("normalizes valid role ids", () => assert.strictEqual(normalizeRoleId(" c-3 "), "C-3"));
test("rejects invalid role ids", () => assert.throws(() => normalizeRoleId("bad role"), /INVALID_ROLE_ID/));
test("sanitizes cross-role payload fields", () => assert.deepStrictEqual(sanitizeRoleContext({ label: "C-3", input: "secret", result: "hidden", token: "x" }), { label: "C-3" }));
test("reuses an unbound preferred window", () => {
  const ctx = makeRuntime([windowFixture(1), windowFixture(2)]);
  const result = createWorkerBrowserBindingAdapter(ctx.runtime).bindRole({ role_id: "C-3", preferred_slot: 2 });
  assert.strictEqual(result.action, "REUSE_UNBOUND_EXISTING_WINDOW");
  assert.strictEqual(result.binding.worker_window_id, "window-2");
  assert.strictEqual(ctx.getCreateCalls(), 0);
});
test("reuses the exact existing role binding", () => {
  const ctx = makeRuntime([windowFixture(1)]);
  const adapter = createWorkerBrowserBindingAdapter(ctx.runtime);
  const first = adapter.bindRole({ role_id: "C-3" });
  const second = adapter.bindRole({ role_id: "C-3" });
  assert.strictEqual(first.binding, second.binding);
  assert.strictEqual(second.action, "REUSE_EXISTING_ROLE_BINDING");
});
test("calls the existing runtime factory when no window exists", () => {
  const ctx = makeRuntime([]);
  const result = createWorkerBrowserBindingAdapter(ctx.runtime, { firstDynamicSlot: 7 }).bindRole({ role_id: "C-3" });
  assert.strictEqual(result.action, "CREATE_WITH_EXISTING_RUNTIME_FACTORY");
  assert.strictEqual(result.binding.worker_window_id, "created-7");
  assert.strictEqual(ctx.getCreateCalls(), 1);
});
test("creates another window instead of leaking a bound session", () => {
  const ctx = makeRuntime([windowFixture(1)]);
  const adapter = createWorkerBrowserBindingAdapter(ctx.runtime, { firstDynamicSlot: 2 });
  const c3 = adapter.bindRole({ role_id: "C-3" });
  const c4 = adapter.bindRole({ role_id: "C-4" });
  assert.notStrictEqual(c3.binding.worker_window_id, c4.binding.worker_window_id);
  assert.notStrictEqual(c3.binding.browser_session_id, c4.binding.browser_session_id);
});
test("switches roles by activating the target isolated window", () => {
  const ctx = makeRuntime([windowFixture(1), windowFixture(2)]);
  const adapter = createWorkerBrowserBindingAdapter(ctx.runtime);
  adapter.bindRole({ role_id: "C-3", preferred_slot: 1 });
  adapter.bindRole({ role_id: "C-4", preferred_slot: 2 });
  assert.strictEqual(adapter.switchRole("C-3", "C-4").isolation, "PASS_DISTINCT_WINDOW_AND_SESSION");
  assert.strictEqual(ctx.focused.at(-1), "window-2");
});
test("does not expose input or result data in attached role context", () => {
  const ctx = makeRuntime([windowFixture(1)]);
  createWorkerBrowserBindingAdapter(ctx.runtime).bindRole({ role_id: "C-3", role_context: { display_name: "C-3", input: "private", results: [1] } });
  assert.deepStrictEqual(ctx.contexts[0].context, { display_name: "C-3" });
});
test("fails closed on a duplicate session returned by the runtime", () => {
  const ctx = makeRuntime([windowFixture(1, "same"), windowFixture(2, "same")]);
  const adapter = createWorkerBrowserBindingAdapter(ctx.runtime);
  assert.throws(() => adapter.bindRole({ role_id: "C-3", preferred_slot: 1 }), /RUNTIME_DUPLICATE_BROWSER_SESSION_ID/);
});
test("drops a destroyed binding and creates a fresh window", () => {
  const win = windowFixture(1);
  const ctx = makeRuntime([win]);
  const adapter = createWorkerBrowserBindingAdapter(ctx.runtime, { firstDynamicSlot: 2 });
  adapter.bindRole({ role_id: "C-3" });
  win.destroyed = true;
  const result = adapter.bindRole({ role_id: "C-3" });
  assert.strictEqual(result.binding.worker_window_id, "created-2");
});
test("validates a collision-free binding registry", () => {
  const ctx = makeRuntime([windowFixture(1), windowFixture(2), windowFixture(3)]);
  const adapter = createWorkerBrowserBindingAdapter(ctx.runtime);
  adapter.bindRole({ role_id: "A-2", preferred_slot: 1 });
  adapter.bindRole({ role_id: "B-1", preferred_slot: 2 });
  adapter.bindRole({ role_id: "C-3", preferred_slot: 3 });
  assert.deepStrictEqual(adapter.validateIsolation(), { ok: true, binding_count: 3 });
});
test("unbinds a role and makes its window reusable", () => {
  const ctx = makeRuntime([windowFixture(1)]);
  const adapter = createWorkerBrowserBindingAdapter(ctx.runtime);
  adapter.bindRole({ role_id: "C-3" });
  adapter.unbindRole("C-3");
  assert.strictEqual(adapter.bindRole({ role_id: "C-4" }).binding.worker_window_id, "window-1");
});
test("fails when activating an unbound role", () => assert.throws(() => createWorkerBrowserBindingAdapter(makeRuntime([]).runtime).activateRole("C-3"), /ROLE_NOT_BOUND/));
test("binding object is immutable", () => {
  const binding = createWorkerBrowserBindingAdapter(makeRuntime([windowFixture(1)]).runtime).bindRole({ role_id: "C-3" }).binding;
  assert(Object.isFrozen(binding));
  assert(Object.isFrozen(binding.context));
});

let passed = 0;
for (const item of cases) {
  try { item.fn(); passed += 1; process.stdout.write(`PASS ${item.name}\n`); }
  catch (error) { process.stderr.write(`FAIL ${item.name}: ${error.stack || error}\n`); process.exitCode = 1; }
}
process.stdout.write(`SUMMARY ${passed}/${cases.length} PASS\n`);
if (passed !== cases.length) process.exitCode = 1;
