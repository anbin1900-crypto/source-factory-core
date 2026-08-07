import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPlan } from "./multimode_one_command_runner_v1.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));

const emptyContext = buildPlan({ root, scope: "ALL" });
assert.deepEqual(emptyContext.selected_modes, ["DATA", "PRODUCT", "WRITE", "MY_LISTING", "EDIT"]);
assert.deepEqual(emptyContext.completed_modes_skipped, []);
assert.equal(emptyContext.pending_modes.length, 5);
assert.equal(emptyContext.pointer_bootstrap["A-2"], "fixtures/latest-pointers/A2_LATEST_POINTER.json");
assert.equal(emptyContext.pointer_bootstrap["B-5"], "fixtures/latest-pointers/B5_LATEST_POINTER.json");

const resumed = buildPlan({
  root,
  scope: "ALL",
  checkpoint: path.join(root, "fixtures/INTERRUPTED_CHECKPOINT_V1.json")
});
assert.deepEqual(resumed.completed_modes_skipped, ["DATA", "PRODUCT"]);
assert.deepEqual(resumed.pending_modes, ["WRITE", "MY_LISTING", "EDIT"]);
assert.equal(resumed.actions.every((item) => item.action === "PREPARE_ONLY_AWAIT_USER_CONFIRM"), true);
assert.equal(resumed.actions.every((item) => !item.automatic_submit && !item.automatic_delete && !item.automatic_expire), true);

const selected = buildPlan({ root, scope: "PRODUCT,EDIT" });
assert.deepEqual(selected.selected_modes, ["PRODUCT", "EDIT"]);
assert.deepEqual(selected.pending_modes, ["PRODUCT", "EDIT"]);

process.stdout.write("PASS_EMPTY_CONTEXT_5_MODES\nPASS_RESUME_SKIPS_COMPLETED_2_RESUMES_3\nPASS_USER_CONFIRM_REQUIRED_NO_SIDE_EFFECTS\nPASS_SELECTED_SCOPE\n");
