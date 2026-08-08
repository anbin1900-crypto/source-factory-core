/* eslint-env node */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const child = require("node:child_process");
const root = __dirname;
let assertions = 0;
function ok(value, message) { assert.ok(value, message); assertions += 1; }
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}
const files = walk(root);
for (const file of files.filter(file => /\.(?:js|cjs)$/.test(file))) {
  const result = child.spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  ok(result.status === 0, "NODE_SYNTAX:" + path.relative(root, file) + ":" + result.stderr);
}
const text = files.filter(file => /\.(?:js|cjs|json|ps1|bat|html|md)$/.test(file)).map(file => fs.readFileSync(file, "utf8")).join("\n");
const oldIpcNamespace = "mini" + "mal:";
const oldEnvironmentPattern = new RegExp("(?:^|[^A-Z_])YOLLA_" + "MINIMAL_");
ok(!text.includes(oldIpcNamespace), "OLD_IPC_NAMESPACE_FOUND");
ok(!oldEnvironmentPattern.test(text), "OLD_ENV_NAMESPACE_FOUND");
ok(!text.includes("ProcessStartInfo" + "." + "ArgumentList"), "UNSUPPORTED_PROCESS_API_FOUND");
ok(text.includes("E:\\YOLLA\\panel-v6"), "V6_ROOT_MISSING");
ok(text.includes("QUARANTINE_DO_NOT_REISSUE"), "LEGACY_QUEUE_POLICY_MISSING");
ok(text.includes("arbitrary_shell_allowed"), "EXECUTOR_SAFETY_FIELD_MISSING");
const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "yolla-v6-state-test-"));
const stateModule = require("./runtime/state_store.cjs");
const store = new stateModule.V6StateStore(path.join(stateRoot, "state.json"), null);
const state = store.load();
ok(state.schema_version === "YOLLA_V6_WORKSPACE_STATE_V1", "V6_STATE_SCHEMA");
ok(state.imported_from === null, "IMPLICIT_LEGACY_IMPORT_OCCURRED");
fs.rmSync(stateRoot, { recursive: true, force: true });
const control = child.spawnSync(process.execPath, [path.join(root, "control", "test_v6_mcp_server.cjs")], { encoding: "utf8" });
ok(control.status === 0, "CONTROL_TEST_FAILED:" + control.stdout + control.stderr);
const runtimeModules = child.spawnSync(process.execPath, [path.join(root, "test_runtime_modules.cjs")], { encoding: "utf8" });
ok(runtimeModules.status === 0 && /YOLLA_V6_RUNTIME_MODULES_PASS/.test(runtimeModules.stdout), "RUNTIME_MODULE_TEST_FAILED:" + runtimeModules.stdout + runtimeModules.stderr);
ok(text.includes("persist:yolla-v6-worker") && text.includes("persist:yolla-v6-analyzer"), "AUTH_PARTITION_CONTRACT_MISSING");
ok(text.includes("secret_export_count") && text.includes("credential_value_logged_count"), "SECRET_FREE_RECEIPT_FIELDS_MISSING");
ok(text.includes("V6ModuleHost") && text.includes("SessionRestoreManager"), "RUNTIME_BINDING_MISSING");
ok(text.includes("releases\\6.0.2"), "IMMUTABLE_RELEASE_602_MISSING");
ok(!text.includes("releases\\6.0.1"), "OLD_IMMUTABLE_RELEASE_601_TARGET_STILL_ACTIVE");
ok(text.includes('for (const kind of ["WORKER", "ANALYZER"])'), "DUAL_AUTH_PARTITION_STARTUP_PROBE_MISSING");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "RUNTIME_MANIFEST.json"), "utf8"));
for (const [relative, expected] of Object.entries(manifest.files)) {
  const body = fs.readFileSync(path.join(root, relative));
  ok(body.length === expected.size, "MANIFEST_SIZE:" + relative);
  ok(crypto.createHash("sha256").update(body).digest("hex") === expected.sha256, "MANIFEST_HASH:" + relative);
}
fs.mkdirSync(path.join(root, "test-evidence"), { recursive: true });
const receipt = { schema_version: "YOLLA_PANEL_V6_OFFLINE_TEST_RECEIPT_V1", status: "PASS", assertions, target_pc_executed: false, tunnel_connected: false, executor_round_trip_pass: false, panel_live_pass: false, production: false, ready: false, merge: false };
fs.writeFileSync(path.join(root, "test-evidence", "OFFLINE_TEST_RECEIPT.json"), JSON.stringify(receipt, null, 2) + "\n");
process.stdout.write("YOLLA_PANEL_V6_OFFLINE_TEST_PASS assertions=" + assertions + "\n");
