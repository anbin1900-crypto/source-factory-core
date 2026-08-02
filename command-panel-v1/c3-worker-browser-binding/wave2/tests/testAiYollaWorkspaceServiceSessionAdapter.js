/* eslint-env node */
"use strict";

const assert = require("assert");
const crypto = require("crypto");
const {
  DEFAULT_SERVICES,
  calculateDuplicatePromptKey,
  createAiYollaWorkspaceServiceSessionAdapter
} = require("../aiYollaWorkspaceServiceSessionAdapter");

function makeBaseAdapter() {
  const binding = Object.freeze({
    role_id: "C-3",
    worker_window_id: "window-3",
    browser_session_id: "persist:sf4-safe-panel-worker-3",
    origin: "EXISTING_WINDOW",
    context: Object.freeze({})
  });
  let bindCount = 0;
  let activateCount = 0;
  return {
    bindRole() { bindCount += 1; return { action: "REUSE_EXISTING_ROLE_BINDING", binding }; },
    activateRole(roleId) { assert.strictEqual(roleId, "C-3"); activateCount += 1; return binding; },
    getBinding(roleId) { return roleId === "C-3" ? binding : null; },
    stats() { return { bindCount, activateCount }; }
  };
}

function makeMultiRoleBaseAdapter() {
  const bindings = new Map();
  return {
    bindRole(request) {
      const roleId = String(request.role_id);
      if (!bindings.has(roleId)) {
        const suffix = roleId.replace(/[^A-Z0-9]/gi, "").toLowerCase();
        bindings.set(roleId, Object.freeze({
          role_id: roleId,
          worker_window_id: `window-${suffix}`,
          browser_session_id: `persist:sf4-safe-panel-${suffix}`,
          origin: "EXISTING_WINDOW",
          context: Object.freeze({})
        }));
      }
      return { action: "REUSE_EXISTING_ROLE_BINDING", binding: bindings.get(roleId) };
    },
    activateRole(roleId) {
      const binding = bindings.get(String(roleId));
      if (!binding) { const error = new Error("ROLE_NOT_BOUND"); error.code = "ROLE_NOT_BOUND"; throw error; }
      return binding;
    },
    getBinding(roleId) { return bindings.get(String(roleId)) || null; }
  };
}

function buildRequest(overrides) {
  const roleId = "C-3";
  const directiveId = "C1-TO-C3-AI-YOLLA-WORKSPACE-SERVICE-SESSION-WAVE2-V1-20260802-001";
  const waveId = "WAVE_2";
  const registeredAt = "2026-08-02 18:03 KST";
  return Object.assign({
    platform_id: "AI_YOLLA",
    component_id: "AI_YOLLA_WORKSPACE",
    role_id: roleId,
    directive_id: directiveId,
    wave_id: waveId,
    directive_registered_at_kst: registeredAt,
    duplicate_prompt_key: calculateDuplicatePromptKey(roleId, directiveId, waveId, registeredAt),
    selected_service_id: "YOLLA_REAL_ESTATE_SPECIALIST_AI"
  }, overrides || {});
}

function expectCode(fn, code) {
  assert.throws(fn, (error) => error && error.code === code, `expected ${code}`);
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("directive duplicate key matches published key", () => {
  assert.strictEqual(buildRequest().duplicate_prompt_key, "a92b435cd3caddb23df1e1fce281ab7906056386be86ee4443e431d035f7f422");
});

test("exact three service registry", () => {
  const adapter = createAiYollaWorkspaceServiceSessionAdapter({ workerBrowserBindingAdapter: makeBaseAdapter() });
  assert.deepStrictEqual(adapter.getServiceRegistry().map((item) => item.service_name), ["욜라 부동산 전문 AI", "욜라 주유소 전문 AI", "욜라 위험물 전문 AI"]);
});

test("configures all services on one existing workspace", () => {
  const base = makeBaseAdapter();
  const adapter = createAiYollaWorkspaceServiceSessionAdapter({ workerBrowserBindingAdapter: base });
  const result = adapter.configureWorkspaceServices(buildRequest());
  assert.strictEqual(result.service_count, 3);
  assert.strictEqual(result.binding.worker_window_id, "window-3");
  assert.strictEqual(result.binding.browser_session_id, "persist:sf4-safe-panel-worker-3");
  assert.strictEqual(base.stats().bindCount, 1);
});

test("all contexts include canonical platform component and directive", () => {
  const adapter = createAiYollaWorkspaceServiceSessionAdapter({ workerBrowserBindingAdapter: makeBaseAdapter() });
  adapter.configureWorkspaceServices(buildRequest());
  for (const context of adapter.listServiceContexts("C-3")) {
    assert.strictEqual(context.platform_id, "AI_YOLLA");
    assert.strictEqual(context.component_id, "AI_YOLLA_WORKSPACE");
    assert.strictEqual(context.wave_id, "WAVE_2");
    assert.ok(context.directive_id.includes("WORKSPACE-SERVICE-SESSION-WAVE2"));
  }
});

test("logical service sessions are unique while electron session is reused", () => {
  const adapter = createAiYollaWorkspaceServiceSessionAdapter({ workerBrowserBindingAdapter: makeBaseAdapter() });
  adapter.configureWorkspaceServices(buildRequest());
  const contexts = adapter.listServiceContexts("C-3");
  assert.strictEqual(new Set(contexts.map((item) => item.browser_session_id)).size, 1);
  assert.strictEqual(new Set(contexts.map((item) => item.workspace_service_session_id)).size, 3);
});

test("switch service reuses window but isolates logical session and domain", () => {
  const attached = [];
  const cleared = [];
  const adapter = createAiYollaWorkspaceServiceSessionAdapter({
    workerBrowserBindingAdapter: makeBaseAdapter(),
    attachWorkspaceContext(_binding, context) { attached.push(context); },
    clearWorkspaceContext(_binding, context) { cleared.push(context); }
  });
  adapter.configureWorkspaceServices(buildRequest());
  const result = adapter.switchService("C-3", "YOLLA_REAL_ESTATE_SPECIALIST_AI", "YOLLA_GAS_STATION_SPECIALIST_AI");
  assert.strictEqual(result.workspace_window_reused, true);
  assert.strictEqual(result.electron_browser_session_reused, true);
  assert.strictEqual(result.logical_service_session_isolated, true);
  assert.strictEqual(result.domain_context_isolated, true);
  assert.strictEqual(cleared.length, 1);
  assert.ok(attached.length >= 2);
});

test("cross domain result lookup does not leak", () => {
  const adapter = createAiYollaWorkspaceServiceSessionAdapter({ workerBrowserBindingAdapter: makeBaseAdapter() });
  adapter.configureWorkspaceServices(buildRequest());
  const hash = crypto.createHash("sha256").update("real-estate-result").digest("hex");
  adapter.recordResultReceipt({ role_id: "C-3", service_id: "YOLLA_REAL_ESTATE_SPECIALIST_AI", domain_pack_id: "YOLLA_REAL_ESTATE", result_hash: hash });
  assert.strictEqual(adapter.getResultReceipt("C-3", "YOLLA_GAS_STATION_SPECIALIST_AI", "YOLLA_GAS_STATION"), null);
  assert.strictEqual(adapter.getResultReceipt("C-3", "YOLLA_REAL_ESTATE_SPECIALIST_AI", "YOLLA_REAL_ESTATE").result_hash, hash);
});

test("result receipt rejects mismatched domain", () => {
  const adapter = createAiYollaWorkspaceServiceSessionAdapter({ workerBrowserBindingAdapter: makeBaseAdapter() });
  adapter.configureWorkspaceServices(buildRequest());
  expectCode(() => adapter.recordResultReceipt({ role_id: "C-3", service_id: "YOLLA_REAL_ESTATE_SPECIALIST_AI", domain_pack_id: "YOLLA_GAS_STATION", result_hash: "a".repeat(64) }), "RESULT_RECEIPT_CONTEXT_MISMATCH");
});

test("duplicate prompt is rejected", () => {
  const adapter = createAiYollaWorkspaceServiceSessionAdapter({ workerBrowserBindingAdapter: makeBaseAdapter() });
  const request = buildRequest();
  adapter.configureWorkspaceServices(request);
  expectCode(() => adapter.configureWorkspaceServices(request), "REJECT_DUPLICATE");
});

test("stale wave is rejected after wave two", () => {
  const adapter = createAiYollaWorkspaceServiceSessionAdapter({ workerBrowserBindingAdapter: makeBaseAdapter() });
  adapter.configureWorkspaceServices(buildRequest());
  const directiveId = "C1-TO-C3-OLDER-WAVE-V1-20260802-001";
  const registeredAt = "2026-08-02 18:04 KST";
  const stale = buildRequest({
    directive_id: directiveId,
    wave_id: "WAVE_1",
    directive_registered_at_kst: registeredAt,
    duplicate_prompt_key: calculateDuplicatePromptKey("C-3", directiveId, "WAVE_1", registeredAt)
  });
  expectCode(() => adapter.configureWorkspaceServices(stale), "REJECT_STALE_WAVE");
});

test("missing wave fails closed", () => {
  const adapter = createAiYollaWorkspaceServiceSessionAdapter({ workerBrowserBindingAdapter: makeBaseAdapter() });
  expectCode(() => adapter.configureWorkspaceServices(buildRequest({ wave_id: "" })), "WAVE_ID_MISSING_OR_INVALID");
});

test("missing registration time fails closed", () => {
  const adapter = createAiYollaWorkspaceServiceSessionAdapter({ workerBrowserBindingAdapter: makeBaseAdapter() });
  expectCode(() => adapter.configureWorkspaceServices(buildRequest({ directive_registered_at_kst: "" })), "DIRECTIVE_REGISTERED_AT_KST_MISSING_OR_INVALID");
});

test("mismatched duplicate hash fails closed", () => {
  const adapter = createAiYollaWorkspaceServiceSessionAdapter({ workerBrowserBindingAdapter: makeBaseAdapter() });
  expectCode(() => adapter.configureWorkspaceServices(buildRequest({ duplicate_prompt_key: "0".repeat(64) })), "DUPLICATE_PROMPT_KEY_MISMATCH");
});

test("unknown service fails closed", () => {
  const adapter = createAiYollaWorkspaceServiceSessionAdapter({ workerBrowserBindingAdapter: makeBaseAdapter() });
  expectCode(() => adapter.configureWorkspaceServices(buildRequest({ selected_service_id: "UNKNOWN_SERVICE" })), "SERVICE_NOT_CONFIGURED_FOR_ROLE");
});

test("payload keys are rejected from directive envelope", () => {
  const adapter = createAiYollaWorkspaceServiceSessionAdapter({ workerBrowserBindingAdapter: makeBaseAdapter() });
  expectCode(() => adapter.configureWorkspaceServices(buildRequest({ prompt: "do not store" })), "WORKSPACE_PAYLOAD_LEAK_FORBIDDEN");
});

test("payload keys are rejected from result receipt", () => {
  const adapter = createAiYollaWorkspaceServiceSessionAdapter({ workerBrowserBindingAdapter: makeBaseAdapter() });
  adapter.configureWorkspaceServices(buildRequest());
  expectCode(() => adapter.recordResultReceipt({ role_id: "C-3", service_id: "YOLLA_REAL_ESTATE_SPECIALIST_AI", domain_pack_id: "YOLLA_REAL_ESTATE", result_hash: "a".repeat(64), result: "secret" }), "WORKSPACE_PAYLOAD_LEAK_FORBIDDEN");
});

test("runtime request targets AI YOLLA runtime without authorizing execution", () => {
  const adapter = createAiYollaWorkspaceServiceSessionAdapter({ workerBrowserBindingAdapter: makeBaseAdapter() });
  adapter.configureWorkspaceServices(buildRequest());
  const request = adapter.buildRuntimeRequest("C-3", "YOLLA_HAZARDOUS_MATERIALS_SPECIALIST_AI", "ANALYZE_SITE");
  assert.strictEqual(request.target_component_id, "AI_YOLLA_RUNTIME");
  assert.strictEqual(request.execution_authorized, false);
  assert.strictEqual(request.domain_pack_id, "YOLLA_HAZARDOUS_MATERIALS");
  assert.ok(!Object.prototype.hasOwnProperty.call(request, "prompt"));
  assert.ok(!Object.prototype.hasOwnProperty.call(request, "result"));
});

test("exactly three services required", () => {
  expectCode(() => createAiYollaWorkspaceServiceSessionAdapter({ workerBrowserBindingAdapter: makeBaseAdapter() }, { services: DEFAULT_SERVICES.slice(0, 2) }), "EXACTLY_THREE_SERVICES_REQUIRED");
});

test("duplicate service id rejected", () => {
  expectCode(() => createAiYollaWorkspaceServiceSessionAdapter({ workerBrowserBindingAdapter: makeBaseAdapter() }, { services: [DEFAULT_SERVICES[0], DEFAULT_SERVICES[0], DEFAULT_SERVICES[2]] }), "DUPLICATE_SERVICE_ID");
});

test("active context changes only for selected role", () => {
  const adapter = createAiYollaWorkspaceServiceSessionAdapter({ workerBrowserBindingAdapter: makeBaseAdapter() });
  adapter.configureWorkspaceServices(buildRequest());
  adapter.activateService("C-3", "YOLLA_GAS_STATION_SPECIALIST_AI");
  assert.strictEqual(adapter.getActiveContext("C-3").service_id, "YOLLA_GAS_STATION_SPECIALIST_AI");
});

test("role sessions remain isolated across two roles", () => {
  const adapter = createAiYollaWorkspaceServiceSessionAdapter({ workerBrowserBindingAdapter: makeMultiRoleBaseAdapter() });
  adapter.configureWorkspaceServices(buildRequest());
  const role2 = "C-4";
  const directive2 = "C1-TO-C4-AI-YOLLA-WORKSPACE-SESSION-WAVE2-V1-20260802-001";
  const registered2 = "2026-08-02 18:05 KST";
  adapter.configureWorkspaceServices(buildRequest({
    role_id: role2,
    directive_id: directive2,
    directive_registered_at_kst: registered2,
    duplicate_prompt_key: calculateDuplicatePromptKey(role2, directive2, "WAVE_2", registered2)
  }));
  const c3 = adapter.getActiveContext("C-3");
  const c4 = adapter.getActiveContext("C-4");
  assert.notStrictEqual(c3.workspace_window_id, c4.workspace_window_id);
  assert.notStrictEqual(c3.browser_session_id, c4.browser_session_id);
  assert.notStrictEqual(c3.workspace_service_session_id, c4.workspace_service_session_id);
});

test("newer wave replaces latest wave authority", () => {
  const adapter = createAiYollaWorkspaceServiceSessionAdapter({ workerBrowserBindingAdapter: makeBaseAdapter() });
  adapter.configureWorkspaceServices(buildRequest());
  const directive3 = "C1-TO-C3-AI-YOLLA-WORKSPACE-SESSION-WAVE3-V1-20260802-001";
  const registered3 = "2026-08-02 18:06 KST";
  const result = adapter.configureWorkspaceServices(buildRequest({
    directive_id: directive3,
    wave_id: "WAVE_3",
    directive_registered_at_kst: registered3,
    duplicate_prompt_key: calculateDuplicatePromptKey("C-3", directive3, "WAVE_3", registered3)
  }));
  assert.strictEqual(result.active_context.wave_id, "WAVE_3");
});

let passed = 0;
for (const item of tests) {
  try {
    item.fn();
    passed += 1;
    process.stdout.write(`PASS ${item.name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${item.name}: ${error && error.stack || error}\n`);
    process.exitCode = 1;
  }
}
process.stdout.write(`RESULT ${passed}/${tests.length} PASS\n`);
if (passed !== tests.length) process.exitCode = 1;
