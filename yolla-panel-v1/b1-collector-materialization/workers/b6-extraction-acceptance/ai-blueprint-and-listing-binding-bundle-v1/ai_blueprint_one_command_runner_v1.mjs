#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPlan as buildCycle4Plan } from "../multimode-site-analysis-one-command-bundle-v1/multimode_one_command_runner_v1.mjs";

export const STAGES = ["PRODUCT_BLUEPRINT", "SEMANTIC_GRAPH", "USER_JOURNEY_STATE_MACHINE", "REAL_ESTATE_ONTOLOGY_SITE_BINDING"];
const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }

function parseArgs(argv) {
  const args = { root: process.cwd(), scope: "ALL", checkpoint: null, output: null };
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--root") args.root = value;
    else if (key === "--scope") args.scope = value;
    else if (key === "--checkpoint") args.checkpoint = value;
    else if (key === "--output") args.output = value;
    else throw new Error(`UNKNOWN_ARGUMENT:${key}`);
  }
  return args;
}

function selectStages(scope) {
  if (scope === "ALL") return [...STAGES];
  const selected = [...new Set(scope.split(",").map((value) => value.trim().toUpperCase()).filter(Boolean))];
  const unknown = selected.filter((stage) => !STAGES.includes(stage));
  if (unknown.length) throw new Error(`UNKNOWN_STAGE:${unknown.join(",")}`);
  return STAGES.filter((stage) => selected.includes(stage));
}

function pointerState(contract, root) {
  const pointer = readJson(path.resolve(root, contract.fixture_path));
  if (pointer.owner !== contract.owner || pointer.directive_id !== contract.directive_id) {
    throw new Error(`INVALID_POINTER_IDENTITY:${contract.owner}`);
  }
  const arrived = Boolean(pointer.terminal || pointer.head || pointer.path || pointer.blob);
  if (!arrived) return { owner: contract.owner, state: "WAITING_EXACT_POINTER", pointer };
  const exact = pointer.terminal === contract.expected_terminal &&
    /^[0-9a-f]{40}$/.test(pointer.head || "") &&
    typeof pointer.path === "string" && pointer.path.length > 0 &&
    /^[0-9a-f]{40}$/.test(pointer.blob || "");
  if (!exact) throw new Error(`INVALID_EXACT_POINTER:${contract.owner}`);
  return { owner: contract.owner, state: "BOUND", pointer };
}

export function buildPlan({ root, scope = "ALL", checkpoint = null }) {
  const cycle4Root = path.resolve(MODULE_ROOT, "../multimode-site-analysis-one-command-bundle-v1");
  const cycle4Bootstrap = buildCycle4Plan({ root: cycle4Root, scope: "ALL" });
  const contracts = readJson(path.join(root, "CYCLE5_PRODUCER_POINTER_CONTRACT_V1.json"));
  const workPointers = readJson(path.join(root, "CURRENT_WORK_POINTER_SET_V1.json"));
  const producers = contracts.producers.map((contract) => pointerState(contract, root));
  const state = checkpoint ? readJson(checkpoint) : { completed_stages: [], stage_results: {} };
  const completed = new Set(state.completed_stages || []);
  const selected = selectStages(scope);
  const skipped = selected.filter((stage) => completed.has(stage));
  const pending = selected.filter((stage) => !completed.has(stage));
  const boundProducers = producers.filter((producer) => producer.state === "BOUND");
  const waitingProducers = producers.filter((producer) => producer.state !== "BOUND");
  const duplicateKeys = skipped.map((stage) => `${contracts.schema_version}:${stage}:${state.stage_results?.[stage]?.result_pointer_blob || "COMPLETED"}`);

  return {
    schema_version: "AI_BLUEPRINT_AND_LISTING_BINDING_EXECUTION_PLAN_V1",
    cycle_id: "A0-AB-AI-BLUEPRINT-SEMANTIC-BINDING-CYCLE5-20260808-001",
    command_mode: "PREBUILD_AND_LATE_BIND_READY",
    selected_stages: selected,
    completed_stages_skipped: skipped,
    pending_stages: pending,
    actions: pending.map((stage) => ({
      stage,
      action: waitingProducers.length ? "PREPARE_AND_WAIT_FOR_EXACT_POINTER" : "READY_FROM_BOUND_POINTERS",
      reissue_completed_stage: false
    })),
    producer_bindings: Object.fromEntries(producers.map(({ owner, state: bindingState, pointer }) => [owner, { state: bindingState, head: pointer.head, path: pointer.path, blob: pointer.blob }])),
    producer_summary: { bound: boundProducers.length, waiting: waitingProducers.length },
    cycle4_runner_reuse: {
      schema_version: cycle4Bootstrap.schema_version,
      pointer_owner_count: Object.keys(cycle4Bootstrap.pointer_bootstrap).length,
      mode_count: cycle4Bootstrap.selected_modes.length,
      status: "REUSED"
    },
    work_pointers: workPointers.pointers,
    duplicate_execution_suppression_keys: duplicateKeys,
    next_action: pending.length ? `RESUME_${pending[0]}` : "CYCLE5_STAGE_SET_COMPLETE",
    sequential_approval_gate: false,
    target_pc_execution: false,
    live_site_call: false,
    production: false
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv);
    const plan = buildPlan(args);
    const body = `${JSON.stringify(plan, null, 2)}\n`;
    if (args.output) fs.writeFileSync(args.output, body);
    process.stdout.write(body);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
