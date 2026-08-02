/* eslint-env node */
"use strict";

const assert = require("assert");
const crypto = require("crypto");
const {
  calculateDuplicatePromptKey,
  createAiYollaWorkspacePcContextAdapter
} = require("../aiYollaWorkspacePcContextAdapter");

const DIRECTIVE_ID = "C1-TO-C3-AI-YOLLA-PC-CONTEXT-WORKSPACE-WAVE3-V1-20260802-001";
const REGISTERED_AT = "2026-08-02 19:06 KST";
const DUPLICATE_KEY = "fbb98d3e99c71968c7caa539c9e2956ce8dfe543dfe34412fba19a50c4eb102f";
const SERVICES = [
  ["YOLLA_REAL_ESTATE_SPECIALIST_AI", "YOLLA_REAL_ESTATE"],
  ["YOLLA_GAS_STATION_SPECIALIST_AI", "YOLLA_GAS_STATION"],
  ["YOLLA_HAZARDOUS_MATERIALS_SPECIALIST_AI", "YOLLA_HAZARDOUS_MATERIALS"]
];

function makeWorkspaceAdapter(roleId = "C-3") {
  const contexts = SERVICES.map(([serviceId, domainPackId]) => Object.freeze({
    role_id: roleId,
    workspace_window_id: `window-${roleId.toLowerCase()}`,
    browser_session_id: `persist:sf4-${roleId.toLowerCase()}`,
    workspace_service_session_id: crypto.createHash("sha256").update(`${roleId}|${serviceId}`).digest("hex"),
    service_id: serviceId,
    domain_pack_id: domainPackId,
    wave_id: "WAVE_2",
    directive_id: "C1-TO-C3-AI-YOLLA-WORKSPACE-SERVICE-SESSION-WAVE2-V1-20260802-001"
  }));
  return {
    listServiceContexts(requestRole) { return requestRole === roleId ? contexts.slice() : []; },
    activateService(requestRole, serviceId) {
      const found = contexts.find((item) => item.role_id === requestRole && item.service_id === serviceId);
      if (!found) throw new Error("SERVICE_NOT_FOUND");
      return found;
    }
  };
}

function runtimeAcceptance(overrides) {
  return Object.assign({
    terminal: "A1_PC_AGENT_WINDOWS_RUNTIME_V1_TARGET_PC_ACCEPTED",
    acceptance_run: "PCAR-20260801T191841746Z-d81c8a2f6778",
    runtime_version: "1.0.0-20260802",
    manager_hotfix_version: "1.0.1-manager-status",
    machine_id: "YOLLA-A1-PC01"
  }, overrides || {});
}

function pcContext(overrides) {
  return Object.assign({
    runtime_environment_authority: "A1_PC_DEVELOPMENT_ENVIRONMENT_AUTHORITY",
    environment_status: "A1_PC_DEVELOPMENT_ENVIRONMENT_PUBLISHED",
    machine_id: "YOLLA-A1-PC01",
    context_snapshot_id: "20260802100335Z",
    context_published_at_kst: "2026-08-02T19:03:35.129045+09:00",
    environment_sha256: "b1af97e3941c87f893c0c337d08725554bb1725d45b75ba7ebd51f0a0d41c8c5",
    environment_pointer_blob: "64e8d9a6ac3d087a2a7d3d9e356850b428892096",
    source_branch: "pc-ledger/a1-resident-monitoring-v1",
    canonical_runtime_root: "E:\\SOURCE FACTORY\\.yolla\\a1-pc-agent",
    secret_values_published: false,
    project_root_summary: {
      workspace_root: "E:\\SOURCE FACTORY",
      source_root_count: 22,
      active_core_roots: 2,
      reusable_core_roots: 2,
      safe_panel_runtime_roots: 3
    },
    repository_state_summary: {
      repository_count: 2,
      clean_repository_count: 2,
      repositories: [
        { branch: "publish/reusable-core-20260801", head: "6db6667989e2c882ffdc7da416283828e6b4f619", dirty: false },
        { branch: "agent/sf-028-active-core-migration", head: "6a0984114d43d73524e4cf2bc1929ac78295939a", dirty: false }
      ]
    },
    entrypoint_summary: {
      a1_pc_agent_executable: { accepted: true, path_class: "A1_PC_AGENT_STABLE_EXECUTABLE" },
      source_factory_safe_panel: { discovered_runtime_count: 3 },
      resident_monitoring: { monitor_interval_minutes: 30, scheduled_task_count: 7 }
    },
    tool_availability_summary: {
      git: "2.54.0.windows.1",
      github_cli: "2.96.0",
      node: "24.18.0",
      npm: "11.16.0",
      docker: "29.6.2",
      rclone: "1.75.0",
      dotnet: "8.0.423",
      vscode: "1.131.0",
      java: "NOT_FOUND",
      python: "3.13.14",
      powershell_core: "7.6.4",
      windows_powershell: "5.1.26100.8875"
    },
    privacy_boundary: {
      credentials_collected: false,
      tokens_collected: false,
      browser_data_collected: false,
      ssh_private_keys_collected: false,
      general_environment_variable_values_collected: false,
      source_file_contents_collected: false
    }
  }, overrides || {});
}

function request(overrides) {
  return Object.assign({
    role_id: "C-3",
    directive_id: DIRECTIVE_ID,
    wave_id: "WAVE_3",
    directive_registered_at_kst: REGISTERED_AT,
    duplicate_prompt_key: DUPLICATE_KEY,
    runtime_acceptance: runtimeAcceptance(),
    pc_context: pcContext()
  }, overrides || {});
}

function expectCode(fn, code) {
  assert.throws(fn, (error) => error && error.code === code, `expected ${code}`);
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("published duplicate key matches canonical input", () => {
  assert.strictEqual(calculateDuplicatePromptKey("C-3", DIRECTIVE_ID, "WAVE_3", REGISTERED_AT), DUPLICATE_KEY);
});

test("binds one A1 snapshot to all three service sessions", () => {
  const adapter = createAiYollaWorkspacePcContextAdapter({ workspaceServiceSessionAdapter: makeWorkspaceAdapter() });
  const result = adapter.bindPcContext(request());
  assert.strictEqual(result.service_count, 3);
  assert.strictEqual(new Set(result.bindings.map((item) => item.context_snapshot_id)).size, 1);
});

test("context is fresh at directive registration", () => {
  const adapter = createAiYollaWorkspacePcContextAdapter({ workspaceServiceSessionAdapter: makeWorkspaceAdapter() });
  const result = adapter.bindPcContext(request());
  assert.strictEqual(result.context_freshness, "FRESH");
  assert.ok(result.bindings[0].context_age_seconds_at_directive >= 140);
  assert.ok(result.bindings[0].context_age_seconds_at_directive <= 150);
});

test("read-only summaries are attached", () => {
  const adapter = createAiYollaWorkspacePcContextAdapter({ workspaceServiceSessionAdapter: makeWorkspaceAdapter() });
  adapter.bindPcContext(request());
  const binding = adapter.getBinding("C-3", SERVICES[0][0]);
  assert.strictEqual(binding.project_root_summary.source_root_count, 22);
  assert.strictEqual(binding.repository_state_summary.clean_repository_count, 2);
  assert.strictEqual(binding.entrypoint_summary.resident_monitoring.monitor_interval_minutes, 30);
  assert.strictEqual(binding.tool_availability_summary.python, "3.13.14");
  assert.strictEqual(binding.context_read_only, true);
});

test("runtime acceptance terminal is required", () => {
  const adapter = createAiYollaWorkspacePcContextAdapter({ workspaceServiceSessionAdapter: makeWorkspaceAdapter() });
  expectCode(() => adapter.bindPcContext(request({ runtime_acceptance: runtimeAcceptance({ terminal: "NOT_ACCEPTED" }) })), "MISSING_RUNTIME_ACCEPTANCE_REJECT");
});

test("runtime acceptance run is required", () => {
  const adapter = createAiYollaWorkspacePcContextAdapter({ workspaceServiceSessionAdapter: makeWorkspaceAdapter() });
  expectCode(() => adapter.bindPcContext(request({ runtime_acceptance: runtimeAcceptance({ acceptance_run: "" }) })), "RUNTIME_ACCEPTANCE_RUN_MISSING");
});

test("runtime version is required", () => {
  const adapter = createAiYollaWorkspacePcContextAdapter({ workspaceServiceSessionAdapter: makeWorkspaceAdapter() });
  expectCode(() => adapter.bindPcContext(request({ runtime_acceptance: runtimeAcceptance({ runtime_version: "" }) })), "RUNTIME_VERSION_MISSING");
});

test("runtime and snapshot machine must match", () => {
  const adapter = createAiYollaWorkspacePcContextAdapter({ workspaceServiceSessionAdapter: makeWorkspaceAdapter() });
  expectCode(() => adapter.bindPcContext(request({ pc_context: pcContext({ machine_id: "OTHER-PC" }) })), "RUNTIME_AND_CONTEXT_MACHINE_MISMATCH");
});

test("unpublished context is rejected", () => {
  const adapter = createAiYollaWorkspacePcContextAdapter({ workspaceServiceSessionAdapter: makeWorkspaceAdapter() });
  expectCode(() => adapter.bindPcContext(request({ pc_context: pcContext({ environment_status: "LOCAL_ONLY" }) })), "PC_CONTEXT_NOT_PUBLISHED");
});

test("secret publication flag is rejected", () => {
  const adapter = createAiYollaWorkspacePcContextAdapter({ workspaceServiceSessionAdapter: makeWorkspaceAdapter() });
  expectCode(() => adapter.bindPcContext(request({ pc_context: pcContext({ secret_values_published: true }) })), "SENSITIVE_VALUE_REJECT");
});

test("credential value is rejected", () => {
  const adapter = createAiYollaWorkspacePcContextAdapter({ workspaceServiceSessionAdapter: makeWorkspaceAdapter() });
  expectCode(() => adapter.bindPcContext(request({ pc_context: pcContext({ credential: "value" }) })), "SENSITIVE_VALUE_REJECT");
});

test("environment variable values are rejected", () => {
  const adapter = createAiYollaWorkspacePcContextAdapter({ workspaceServiceSessionAdapter: makeWorkspaceAdapter() });
  expectCode(() => adapter.bindPcContext(request({ pc_context: pcContext({ environment_variable_values: { PATH: "x" } }) })), "SENSITIVE_VALUE_REJECT");
});

test("browser data is rejected", () => {
  const adapter = createAiYollaWorkspacePcContextAdapter({ workspaceServiceSessionAdapter: makeWorkspaceAdapter() });
  expectCode(() => adapter.bindPcContext(request({ pc_context: pcContext({ browser_data: ["cookie"] }) })), "SENSITIVE_VALUE_REJECT");
});

test("stale context older than thirty minutes is rejected", () => {
  const adapter = createAiYollaWorkspacePcContextAdapter({ workspaceServiceSessionAdapter: makeWorkspaceAdapter() });
  expectCode(() => adapter.bindPcContext(request({ pc_context: pcContext({ context_published_at_kst: "2026-08-02T18:00:00+09:00" }) })), "STALE_CONTEXT_REJECT");
});

test("future context beyond clock skew is rejected", () => {
  const adapter = createAiYollaWorkspacePcContextAdapter({ workspaceServiceSessionAdapter: makeWorkspaceAdapter() });
  expectCode(() => adapter.bindPcContext(request({ pc_context: pcContext({ context_published_at_kst: "2026-08-02T19:20:00+09:00" }) })), "FUTURE_CONTEXT_REJECT");
});

test("missing context time is rejected", () => {
  const adapter = createAiYollaWorkspacePcContextAdapter({ workspaceServiceSessionAdapter: makeWorkspaceAdapter() });
  expectCode(() => adapter.bindPcContext(request({ pc_context: pcContext({ context_published_at_kst: "" }) })), "CONTEXT_PUBLISHED_AT_KST_MISSING");
});

test("duplicate prompt is rejected", () => {
  const adapter = createAiYollaWorkspacePcContextAdapter({ workspaceServiceSessionAdapter: makeWorkspaceAdapter() });
  const req = request();
  adapter.bindPcContext(req);
  expectCode(() => adapter.bindPcContext(req), "REJECT_DUPLICATE");
});

test("duplicate key mismatch is rejected", () => {
  const adapter = createAiYollaWorkspacePcContextAdapter({ workspaceServiceSessionAdapter: makeWorkspaceAdapter() });
  expectCode(() => adapter.bindPcContext(request({ duplicate_prompt_key: "0".repeat(64) })), "DUPLICATE_PROMPT_KEY_MISMATCH");
});

test("same wave cannot mix another snapshot", () => {
  const adapter = createAiYollaWorkspacePcContextAdapter({ workspaceServiceSessionAdapter: makeWorkspaceAdapter() });
  adapter.bindPcContext(request());
  const directive = "C1-TO-C3-AI-YOLLA-PC-CONTEXT-WORKSPACE-WAVE3-REFRESH-V1";
  const registered = "2026-08-02 19:07 KST";
  expectCode(() => adapter.bindPcContext(request({
    directive_id: directive,
    directive_registered_at_kst: registered,
    duplicate_prompt_key: calculateDuplicatePromptKey("C-3", directive, "WAVE_3", registered),
    pc_context: pcContext({ context_snapshot_id: "20260802100435Z", environment_sha256: "a".repeat(64) })
  })), "CROSS_CONTEXT_SNAPSHOT_MISMATCH");
});

test("older wave is rejected after Wave 3", () => {
  const adapter = createAiYollaWorkspacePcContextAdapter({ workspaceServiceSessionAdapter: makeWorkspaceAdapter() });
  adapter.bindPcContext(request());
  const directive = "C1-TO-C3-OLDER-WAVE-V2";
  const registered = "2026-08-02 19:08 KST";
  expectCode(() => adapter.bindPcContext(request({
    directive_id: directive,
    wave_id: "WAVE_2",
    directive_registered_at_kst: registered,
    duplicate_prompt_key: calculateDuplicatePromptKey("C-3", directive, "WAVE_2", registered)
  })), "REJECT_STALE_WAVE");
});

test("newer wave may bind a newer snapshot", () => {
  const adapter = createAiYollaWorkspacePcContextAdapter({ workspaceServiceSessionAdapter: makeWorkspaceAdapter() }, { max_context_age_ms: 60 * 60 * 1000 });
  adapter.bindPcContext(request());
  const directive = "C1-TO-C3-AI-YOLLA-PC-CONTEXT-WORKSPACE-WAVE4-V1";
  const registered = "2026-08-02 19:10 KST";
  const result = adapter.bindPcContext(request({
    directive_id: directive,
    wave_id: "WAVE_4",
    directive_registered_at_kst: registered,
    duplicate_prompt_key: calculateDuplicatePromptKey("C-3", directive, "WAVE_4", registered),
    pc_context: pcContext({ context_snapshot_id: "20260802100835Z", context_published_at_kst: "2026-08-02T19:08:35+09:00", environment_sha256: "a".repeat(64) })
  }));
  assert.strictEqual(result.bindings[0].wave_id, "WAVE_4");
});

test("cross-role contexts remain isolated", () => {
  const c3 = makeWorkspaceAdapter("C-3");
  const c4 = makeWorkspaceAdapter("C-4");
  const combined = {
    listServiceContexts(role) { return role === "C-3" ? c3.listServiceContexts(role) : c4.listServiceContexts(role); },
    activateService(role, service) { return role === "C-3" ? c3.activateService(role, service) : c4.activateService(role, service); }
  };
  const adapter = createAiYollaWorkspacePcContextAdapter({ workspaceServiceSessionAdapter: combined });
  adapter.bindPcContext(request());
  const directive = "C1-TO-C4-AI-YOLLA-PC-CONTEXT-WORKSPACE-WAVE3-V1";
  const registered = REGISTERED_AT;
  adapter.bindPcContext(request({
    role_id: "C-4",
    directive_id: directive,
    duplicate_prompt_key: calculateDuplicatePromptKey("C-4", directive, "WAVE_3", registered)
  }));
  const a = adapter.getBinding("C-3", SERVICES[0][0]);
  const b = adapter.getBinding("C-4", SERVICES[0][0]);
  assert.notStrictEqual(a.workspace_window_id, b.workspace_window_id);
  assert.notStrictEqual(a.browser_session_id, b.browser_session_id);
  assert.strictEqual(adapter.validateIsolation().ok, true);
});

test("result receipt rejects another context snapshot", () => {
  const adapter = createAiYollaWorkspacePcContextAdapter({ workspaceServiceSessionAdapter: makeWorkspaceAdapter() });
  adapter.bindPcContext(request());
  expectCode(() => adapter.recordResultReceipt({
    role_id: "C-3", service_id: SERVICES[0][0], context_snapshot_id: "OTHER", result_hash: "a".repeat(64)
  }), "CROSS_CONTEXT_RESULT_REJECT");
});

test("result receipts do not leak across services", () => {
  const adapter = createAiYollaWorkspacePcContextAdapter({ workspaceServiceSessionAdapter: makeWorkspaceAdapter() });
  adapter.bindPcContext(request());
  adapter.recordResultReceipt({ role_id: "C-3", service_id: SERVICES[0][0], context_snapshot_id: "20260802100335Z", result_hash: "a".repeat(64) });
  assert.strictEqual(adapter.getResultReceipt("C-3", SERVICES[1][0], "20260802100335Z"), null);
});

test("runtime boundary request is read only and non executing", () => {
  const adapter = createAiYollaWorkspacePcContextAdapter({ workspaceServiceSessionAdapter: makeWorkspaceAdapter() });
  adapter.bindPcContext(request());
  const output = adapter.buildRuntimeBoundaryRequest("C-3", SERVICES[2][0], "ANALYZE_SITE");
  assert.strictEqual(output.target_component_id, "AI_YOLLA_RUNTIME");
  assert.strictEqual(output.execution_authorized, false);
  assert.strictEqual(output.context_read_only, true);
  assert.strictEqual(output.context_snapshot_id, "20260802100335Z");
});

test("workspace output contains summaries but no sensitive payload values", () => {
  const adapter = createAiYollaWorkspacePcContextAdapter({ workspaceServiceSessionAdapter: makeWorkspaceAdapter() });
  const output = adapter.bindPcContext(request());
  const serialized = JSON.stringify(output);
  assert.ok(serialized.includes("source_root_count"));
  assert.ok(!serialized.includes("credential"));
  assert.ok(!serialized.includes("cookie"));
  assert.ok(!serialized.includes("USERPROFILE"));
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
