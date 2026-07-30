import fs from "node:fs";
import path from "node:path";
import {
  getRuntimePipelineContract,
  listRuntimeSourcePaths,
  resolveRuntimePath,
} from "./sourceFactoryRuntimePipelineRegistry.js";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch (_err) {
    return false;
  }
}

function getArgValue(argv, name, fallback) {
  const idx = argv.indexOf(name);
  if (idx >= 0 && idx + 1 < argv.length) return argv[idx + 1];
  return fallback;
}

export function buildRuntimePipelineDryRunReceipt(options = {}) {
  const repositoryRoot = path.resolve(options.repositoryRoot || process.cwd());
  const queuePath = path.resolve(
    options.queuePath ||
      path.join(repositoryRoot, "examples/gas_station_portal_pipeline/GAS_STATION_PORTAL_QUEUE_EXAMPLE.json")
  );

  const contract = getRuntimePipelineContract();
  const runtimeSourcePaths = listRuntimeSourcePaths();
  const queueItem = readJson(queuePath);

  const resolvedRuntimeSources = runtimeSourcePaths.map((relativePath) => {
    const absolutePath = resolveRuntimePath(repositoryRoot, relativePath);
    return {
      relativePath,
      absolutePath,
      exists: fileExists(absolutePath),
    };
  });

  const missingRuntimeSources = resolvedRuntimeSources.filter((entry) => !entry.exists);

  const receipt = {
    schema_version: "SOURCE_FACTORY_RUNTIME_DRY_RUN_RECEIPT_V1",
    generated_at: new Date().toISOString(),
    mode: "DRY_RUN_ONLY_NO_EXTERNAL_EFFECTS",
    repository_root: repositoryRoot,
    queue_path: queuePath,
    contract_status: contract.status,
    queue_project_code: queueItem.project_code || null,
    queue_id: queueItem.queue_id || null,
    queue_mode: queueItem.mode || null,
    target_stage: queueItem.target_stage || null,
    runtime_source_count: runtimeSourcePaths.length,
    missing_runtime_source_count: missingRuntimeSources.length,
    execution_flow: contract.executionFlow,
    planned_steps: [
      {
        step: "daily_queue_intake",
        status: "DRY_RUN_PASS",
        source: "examples/gas_station_portal_pipeline/GAS_STATION_PORTAL_QUEUE_EXAMPLE.json",
      },
      {
        step: "worker_prompt_dispatch_plan",
        status: "DRY_RUN_PASS",
        effect: "plan_only_no_prompt_send",
      },
      {
        step: "gpt_browser_bridge_check",
        status: "DRY_RUN_PASS",
        effect: "no_browser_launch_no_gpt_call",
      },
      {
        step: "pc_agent_receipt_gate",
        status: "DRY_RUN_PASS",
        effect: "no_pc_agent_service_start",
      },
      {
        step: "commander_gate_decision",
        status: missingRuntimeSources.length === 0 ? "DRY_RUN_READY" : "DRY_RUN_BLOCKED_MISSING_RUNTIME_SOURCE",
        effect: "receipt_only",
      },
    ],
    runtime_sources: resolvedRuntimeSources,
    missing_runtime_sources: missingRuntimeSources,
    production_overwrite_count: 0,
    external_side_effect_count: 0,
  };

  receipt.status =
    contract.status === "PASS_RUNTIME_PIPELINE_CONTRACT_READY_FOR_017" &&
    queueItem.project_code === "GAS_STATION_PORTAL" &&
    queueItem.mode === "PROMPT_QUEUE_EXAMPLE_ONLY" &&
    missingRuntimeSources.length === 0
      ? "PASS_RUNTIME_PIPELINE_DRY_RUN_READY_FOR_019"
      : "FAIL_RUNTIME_PIPELINE_DRY_RUN";

  return receipt;
}

export function runRuntimePipelineDryRun(options = {}) {
  const receipt = buildRuntimePipelineDryRunReceipt(options);
  return receipt;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`) {
  const repositoryRoot = getArgValue(process.argv, "--repository-root", process.cwd());
  const queuePath = getArgValue(process.argv, "--queue", null);
  const receipt = runRuntimePipelineDryRun({ repositoryRoot, queuePath });
  console.log(JSON.stringify(receipt, null, 2));
  process.exit(receipt.status === "PASS_RUNTIME_PIPELINE_DRY_RUN_READY_FOR_019" ? 0 : 1);
}
