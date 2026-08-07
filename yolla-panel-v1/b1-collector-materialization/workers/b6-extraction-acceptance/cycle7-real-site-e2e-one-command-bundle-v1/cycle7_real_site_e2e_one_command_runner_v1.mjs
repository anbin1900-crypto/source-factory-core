#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ANALYSIS_MODES = ["DATA", "PRODUCT", "WRITE"];
const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const CYCLE_ID = "A0-AB-MULTIMODE-COMPOSITE-RECONSTRUCTION-CYCLE6-20260808-001";

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }

function parseArgs(argv) {
  const args = { root: MODULE_ROOT, targetUrl: null, siteId: null, scenarioSet: null, analysisModes: null, checkpoint: null, commandId: null, output: null };
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!value) throw new Error(`MISSING_ARGUMENT_VALUE:${key}`);
    if (key === "--root") args.root = value;
    else if (key === "--target-url") args.targetUrl = value;
    else if (key === "--site-id") args.siteId = value;
    else if (key === "--scenario-set") args.scenarioSet = value;
    else if (key === "--analysis-modes") args.analysisModes = value;
    else if (key === "--checkpoint") args.checkpoint = value;
    else if (key === "--command-id") args.commandId = value;
    else if (key === "--output") args.output = value;
    else throw new Error(`UNKNOWN_ARGUMENT:${key}`);
  }
  return args;
}

function validateInputs({ targetUrl, siteId, scenarioSet, analysisModes }) {
  if (!targetUrl || !siteId || !scenarioSet || !analysisModes) throw new Error("REQUIRED_INPUT_MISSING:target_url,site_id,scenario_set,analysis_modes");
  let parsed;
  try { parsed = new URL(targetUrl); } catch { throw new Error("INVALID_TARGET_URL"); }
  if (!new Set(["http:", "https:"]).has(parsed.protocol)) throw new Error("INVALID_TARGET_URL_PROTOCOL");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(siteId)) throw new Error("INVALID_SITE_ID");
}

function selectModes(raw) {
  const selected = [...new Set(raw.split(",").map((value) => value.trim().toUpperCase()).filter(Boolean))];
  const unknown = selected.filter((mode) => !ANALYSIS_MODES.includes(mode));
  if (unknown.length) throw new Error(`UNKNOWN_ANALYSIS_MODE:${unknown.join(",")}`);
  if (!selected.length) throw new Error("EMPTY_ANALYSIS_MODES");
  return ANALYSIS_MODES.filter((mode) => selected.includes(mode));
}

function pointerState(contract, root) {
  const pointer = readJson(path.resolve(root, contract.fixture_path));
  if (pointer.owner !== contract.owner) throw new Error(`INVALID_POINTER_OWNER:${contract.owner}`);
  const values = [pointer.terminal, pointer.head, pointer.path, pointer.blob];
  if (values.every((value) => value == null || value === "")) return { owner: contract.owner, state: "WAITING_EXACT_POINTER", pointer };
  const exact = pointer.terminal === contract.expected_terminal && /^[0-9a-f]{40}$/.test(pointer.head || "") && typeof pointer.path === "string" && pointer.path.length > 0 && /^[0-9a-f]{40}$/.test(pointer.blob || "");
  if (!exact) throw new Error(`INVALID_EXACT_POINTER:${contract.owner}`);
  return { owner: contract.owner, state: "BOUND", pointer };
}

function stableCommandId(siteId, scenarioSet) {
  return `CYCLE7-${siteId}-${scenarioSet}`.toUpperCase().replace(/[^A-Z0-9._-]+/g, "-");
}

export function buildPlan({ root = MODULE_ROOT, targetUrl, siteId, scenarioSet, analysisModes, checkpoint = null, commandId = null }) {
  validateInputs({ targetUrl, siteId, scenarioSet, analysisModes });
  const cycle5 = readJson(path.resolve(MODULE_ROOT, "../ai-blueprint-and-listing-binding-bundle-v1/AI_BLUEPRINT_AND_LISTING_BINDING_BUNDLE_V1.json"));
  if (cycle5.schema_version !== "AI_BLUEPRINT_AND_LISTING_BINDING_BUNDLE_V1") throw new Error("INVALID_CYCLE5_PARENT_BUNDLE");
  const scenarios = readJson(path.join(root, "REPRESENTATIVE_SCENARIO_PLAN_V1.json"));
  const selectedScenario = scenarios.scenario_sets[scenarioSet];
  if (!selectedScenario) throw new Error(`UNKNOWN_SCENARIO_SET:${scenarioSet}`);
  const modes = selectModes(analysisModes);
  const steps = ["COMMON_EVIDENCE", ...modes];
  const pointerContract = readJson(path.join(root, "CYCLE7_A3_B4_PRODUCER_POINTER_CONTRACT_V1.json"));
  const producers = pointerContract.producers.map((contract) => pointerState(contract, root));
  const state = checkpoint ? readJson(checkpoint) : { attempt_count: 0, completed_steps: [], step_results: {} };
  const completed = new Set(state.completed_steps || []);
  const skipped = steps.filter((step) => completed.has(step));
  const pending = steps.filter((step) => !completed.has(step));
  const resolvedCommandId = commandId || state.command_id || stableCommandId(siteId, scenarioSet);
  const pointerBlobs = producers.map(({ pointer }) => pointer.blob || "PENDING").join(":");
  const duplicateKeys = skipped.map((step) => `${CYCLE_ID}:${resolvedCommandId}:${siteId}:${scenarioSet}:${step}:${pointerBlobs}`);
  const artifactPointer = `results/${resolvedCommandId}/LATEST_RESULT_POINTER.json`;
  const actions = pending.map((branch) => ({
    branch,
    action: branch === "WRITE" ? "PREPARE_ONLY_AWAIT_USER_CONFIRM" : producers.some((producer) => producer.state !== "BOUND") ? "PREPARE_AND_LATE_BIND_EXACT_POINTERS" : "READY_FOR_NEXT_LIVE_CYCLE",
    live_site_call: false,
    side_effect: false
  }));
  const next = pending.length ? `RESUME_${pending[0]}` : "CYCLE7_BRANCH_SET_COMPLETE";

  return {
    schema_version: "CYCLE7_REAL_SITE_E2E_EXECUTION_PLAN_V1",
    parent_bundle: cycle5.schema_version,
    inputs: { target_url: targetUrl, site_id: siteId, scenario_set: scenarioSet, analysis_modes: modes },
    representative_scenario_plan: selectedScenario.filter((scenario) => steps.includes(scenario.branch)),
    branch_graph: { source: "COMMON_EVIDENCE", branches: modes },
    selected_steps: steps,
    completed_steps_skipped: skipped,
    pending_steps: pending,
    actions,
    producer_bindings: Object.fromEntries(producers.map(({ owner, state: bindingState, pointer }) => [owner, { state: bindingState, head: pointer.head, path: pointer.path, blob: pointer.blob }])),
    duplicate_execution_suppression_keys: duplicateKeys,
    result_envelope: {
      COMMAND_ID: resolvedCommandId,
      STATUS: skipped.length ? "RESUME_PREBUILD_READY" : "PREBUILD_READY",
      ATTEMPT_COUNT: Number(state.attempt_count || 0) + 1,
      CHANGED_FILES: [],
      ARTIFACT_POINTER: artifactPointer,
      BLOCKER: null,
      RECOMMENDED_NEXT: next
    },
    sequential_approval_gate: false,
    target_pc_execution: false,
    live_site_call: false,
    tunnel_change: false,
    production: false,
    ready: false,
    merge: false
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
