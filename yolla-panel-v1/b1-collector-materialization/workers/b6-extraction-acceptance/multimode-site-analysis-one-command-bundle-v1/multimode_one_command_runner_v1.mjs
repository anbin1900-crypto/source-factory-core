#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const MODES = ["DATA", "PRODUCT", "WRITE", "MY_LISTING", "EDIT"];
const CONFIRM_REQUIRED = new Set(["WRITE", "MY_LISTING", "EDIT"]);

function parseArgs(argv) {
  const args = { root: process.cwd(), scope: "ALL", checkpoint: null, output: null };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--root") args.root = value;
    else if (key === "--scope") args.scope = value;
    else if (key === "--checkpoint") args.checkpoint = value;
    else if (key === "--output") args.output = value;
    else throw new Error(`UNKNOWN_ARGUMENT:${key}`);
    i += 1;
  }
  return args;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function selectedModes(scope) {
  if (scope === "ALL") return [...MODES];
  const selected = scope.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean);
  const unknown = selected.filter((mode) => !MODES.includes(mode));
  if (unknown.length) throw new Error(`UNKNOWN_MODE:${unknown.join(",")}`);
  return MODES.filter((mode) => selected.includes(mode));
}

export function buildPlan({ root, scope = "ALL", checkpoint = null }) {
  const pointerSetPath = path.join(root, "REQUIRED_INPUT_POINTER_SET_V1.json");
  const expectedSetPath = path.join(root, "EXPECTED_RESULT_POINTER_SET_V1.json");
  const required = readJson(pointerSetPath);
  const expected = readJson(expectedSetPath);
  const missingPointers = required.pointers.filter((item) => {
    const pointerFile = path.resolve(root, item.fixture_path);
    return !fs.existsSync(pointerFile) || !readJson(pointerFile).terminal;
  });
  if (missingPointers.length) {
    throw new Error(`REQUIRED_POINTER_MISSING:${missingPointers.map((item) => item.owner).join(",")}`);
  }

  const state = checkpoint ? readJson(checkpoint) : { completed_modes: [], mode_results: {} };
  const completed = new Set(state.completed_modes || []);
  const selected = selectedModes(scope);
  const skipped = selected.filter((mode) => completed.has(mode));
  const pending = selected.filter((mode) => !completed.has(mode));

  return {
    schema_version: "MULTIMODE_ONE_COMMAND_EXECUTION_PLAN_V1",
    command_mode: "PREBUILD_EXECUTION_READY",
    selected_modes: selected,
    completed_modes_skipped: skipped,
    pending_modes: pending,
    actions: pending.map((mode) => ({
      mode,
      action: CONFIRM_REQUIRED.has(mode) ? "PREPARE_ONLY_AWAIT_USER_CONFIRM" : "READY_TO_EXECUTE",
      automatic_submit: false,
      automatic_delete: false,
      automatic_expire: false,
      expected_result_pointer: expected.result_pointers[mode]
    })),
    pointer_bootstrap: Object.fromEntries(required.pointers.map((item) => [item.owner, item.fixture_path])),
    transport: "EXISTING_D1_ONE_TO_ONE_ONLY_NO_CREATE_NO_BYPASS",
    target_pc_execution: false,
    live_site_call: false
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv);
    const plan = buildPlan(args);
    const serialized = `${JSON.stringify(plan, null, 2)}\n`;
    if (args.output) fs.writeFileSync(args.output, serialized);
    process.stdout.write(serialized);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
