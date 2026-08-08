import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPlan } from "./ai_blueprint_one_command_runner_v1.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const plan = buildPlan({ root, scope: "ALL" });
assert.equal(plan.selected_stages.length, 4);
assert.equal(plan.producer_summary.bound, 0);
assert.equal(plan.producer_summary.waiting, 4);
assert.deepEqual(plan.cycle4_runner_reuse, { schema_version: "MULTIMODE_ONE_COMMAND_EXECUTION_PLAN_V1", pointer_owner_count: 4, mode_count: 5, status: "REUSED" });
assert.equal(plan.actions.every((action) => action.action === "PREPARE_AND_WAIT_FOR_EXACT_POINTER"), true);
assert.deepEqual(Object.keys(plan.work_pointers), ["CURRENT_MISSION", "CURRENT_COMMAND", "LATEST_RESULT", "NEXT_ACTION"]);
assert.equal(plan.sequential_approval_gate, false);
assert.equal(plan.next_action, "RESUME_PRODUCT_BLUEPRINT");

const resumed = buildPlan({ root, scope: "ALL", checkpoint: path.join(root, "fixtures/INTERRUPTED_CYCLE5_CHECKPOINT_V1.json") });
assert.deepEqual(resumed.completed_stages_skipped, ["PRODUCT_BLUEPRINT", "SEMANTIC_GRAPH"]);
assert.deepEqual(resumed.pending_stages, ["USER_JOURNEY_STATE_MACHINE", "REAL_ESTATE_ONTOLOGY_SITE_BINDING"]);
assert.equal(resumed.duplicate_execution_suppression_keys.length, 2);
assert.equal(resumed.actions.every((action) => action.reissue_completed_stage === false), true);

const selected = buildPlan({ root, scope: "SEMANTIC_GRAPH,REAL_ESTATE_ONTOLOGY_SITE_BINDING" });
assert.deepEqual(selected.selected_stages, ["SEMANTIC_GRAPH", "REAL_ESTATE_ONTOLOGY_SITE_BINDING"]);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "b6-cycle5-"));
fs.cpSync(root, temp, { recursive: true });
const contract = JSON.parse(fs.readFileSync(path.join(temp, "CYCLE5_PRODUCER_POINTER_CONTRACT_V1.json"), "utf8"));
for (const producer of contract.producers) {
  fs.writeFileSync(path.join(temp, producer.fixture_path), JSON.stringify({
    owner: producer.owner,
    directive_id: producer.directive_id,
    status: "TERMINAL",
    terminal: producer.expected_terminal,
    head: "a".repeat(40),
    path: `results/${producer.owner}/LATEST_POINTER.json`,
    blob: "b".repeat(40)
  }));
}
const allBound = buildPlan({ root: temp, scope: "ALL" });
assert.equal(allBound.producer_summary.bound, 4);
assert.equal(allBound.actions.every((action) => action.action === "READY_FROM_BOUND_POINTERS"), true);

const badPointerPath = path.join(temp, contract.producers[0].fixture_path);
const bad = JSON.parse(fs.readFileSync(badPointerPath, "utf8"));
bad.blob = "not-a-blob";
fs.writeFileSync(badPointerPath, JSON.stringify(bad));
assert.throws(() => buildPlan({ root: temp, scope: "ALL" }), /INVALID_EXACT_POINTER:A-2/);
assert.throws(() => buildPlan({ root, scope: "UNKNOWN" }), /UNKNOWN_STAGE:UNKNOWN/);

process.stdout.write("PASS_EMPTY_CONTEXT_EXACT_POINTER_CONTRACT_4_OF_4\n");
process.stdout.write("PASS_MISSING_PRODUCERS_NON_BLOCKING_PREBUILD\n");
process.stdout.write("PASS_CURRENT_WORK_POINTERS_4_OF_4\n");
process.stdout.write("PASS_RESUME_SKIP_COMPLETED_2_PENDING_2\n");
process.stdout.write("PASS_DUPLICATE_EXECUTION_SUPPRESSION\n");
process.stdout.write("PASS_SELECTED_SCOPE\n");
process.stdout.write("PASS_ALL_PRODUCERS_BOUND\n");
process.stdout.write("PASS_INVALID_EXACT_POINTER_REJECTED\n");
