import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPlan } from "./cycle7_real_site_e2e_one_command_runner_v1.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const base = { root, targetUrl: "https://example.test/listings", siteId: "SITE-001", scenarioSet: "REPRESENTATIVE", analysisModes: "DATA,PRODUCT,WRITE" };
const plan = buildPlan(base);
assert.equal(plan.parent_bundle, "AI_BLUEPRINT_AND_LISTING_BINDING_BUNDLE_V1");
assert.deepEqual(plan.selected_steps, ["COMMON_EVIDENCE", "DATA", "PRODUCT", "WRITE"]);
assert.deepEqual(plan.branch_graph, { source: "COMMON_EVIDENCE", branches: ["DATA", "PRODUCT", "WRITE"] });
assert.equal(plan.representative_scenario_plan.length, 5);
assert.deepEqual(Object.keys(plan.producer_bindings), ["A-3", "B-4"]);
assert.equal(Object.values(plan.producer_bindings).every((entry) => entry.state === "WAITING_EXACT_POINTER"), true);
assert.deepEqual(Object.keys(plan.result_envelope), ["COMMAND_ID", "STATUS", "ATTEMPT_COUNT", "CHANGED_FILES", "ARTIFACT_POINTER", "BLOCKER", "RECOMMENDED_NEXT"]);
assert.equal(plan.actions.find((action) => action.branch === "WRITE").action, "PREPARE_ONLY_AWAIT_USER_CONFIRM");
assert.equal(plan.live_site_call, false);
assert.equal(plan.target_pc_execution, false);

const resumed = buildPlan({ ...base, checkpoint: path.join(root, "fixtures/INTERRUPTED_CYCLE7_CHECKPOINT_V1.json") });
assert.deepEqual(resumed.completed_steps_skipped, ["COMMON_EVIDENCE", "DATA"]);
assert.deepEqual(resumed.pending_steps, ["PRODUCT", "WRITE"]);
assert.equal(resumed.duplicate_execution_suppression_keys.length, 2);
assert.equal(resumed.result_envelope.ATTEMPT_COUNT, 2);
assert.equal(resumed.result_envelope.RECOMMENDED_NEXT, "RESUME_PRODUCT");

const selected = buildPlan({ ...base, analysisModes: "PRODUCT" });
assert.deepEqual(selected.selected_steps, ["COMMON_EVIDENCE", "PRODUCT"]);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "b6-cycle7-"));
fs.cpSync(root, temp, { recursive: true });
const contract = JSON.parse(fs.readFileSync(path.join(temp, "CYCLE7_A3_B4_PRODUCER_POINTER_CONTRACT_V1.json"), "utf8"));
for (const producer of contract.producers) {
  fs.writeFileSync(path.join(temp, producer.fixture_path), JSON.stringify({ owner: producer.owner, terminal: producer.expected_terminal, head: "a".repeat(40), path: `results/${producer.owner}/LATEST_POINTER.json`, blob: "b".repeat(40) }));
}
const bound = buildPlan({ ...base, root: temp });
assert.equal(Object.values(bound.producer_bindings).every((entry) => entry.state === "BOUND"), true);
assert.equal(bound.actions.filter((action) => action.branch !== "WRITE").every((action) => action.action === "READY_FOR_NEXT_LIVE_CYCLE"), true);

const badPath = path.join(temp, contract.producers[0].fixture_path);
const bad = JSON.parse(fs.readFileSync(badPath, "utf8"));
bad.blob = "invalid";
fs.writeFileSync(badPath, JSON.stringify(bad));
assert.throws(() => buildPlan({ ...base, root: temp }), /INVALID_EXACT_POINTER:A-3/);
assert.throws(() => buildPlan({ ...base, targetUrl: "file:///tmp/x" }), /INVALID_TARGET_URL_PROTOCOL/);
assert.throws(() => buildPlan({ ...base, analysisModes: "DELETE" }), /UNKNOWN_ANALYSIS_MODE:DELETE/);

process.stdout.write("PASS_PARENT_CYCLE5_EXTENSION\n");
process.stdout.write("PASS_REQUIRED_INPUTS_AND_REPRESENTATIVE_SCENARIOS\n");
process.stdout.write("PASS_COMMON_EVIDENCE_TO_THREE_BRANCHES\n");
process.stdout.write("PASS_A3_B4_NON_BLOCKING_LATE_BIND\n");
process.stdout.write("PASS_CHECKPOINT_RESUME_SKIP_COMPLETED\n");
process.stdout.write("PASS_DUPLICATE_EXECUTION_SUPPRESSION\n");
process.stdout.write("PASS_RESULT_ENVELOPE_7_OF_7\n");
process.stdout.write("PASS_ALL_PRODUCERS_BOUND\n");
process.stdout.write("PASS_INVALID_EXACT_POINTER_REJECTED\n");
process.stdout.write("PASS_NO_TARGET_PC_LIVE_SITE_TUNNEL_PRODUCTION\n");
