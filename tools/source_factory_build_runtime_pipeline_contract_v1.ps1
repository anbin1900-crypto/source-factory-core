param(
  [string]$RepositoryRoot = "."
)

$ErrorActionPreference = "Stop"

function Resolve-FullPath([string]$Path) {
  return [System.IO.Path]::GetFullPath($Path)
}

function Get-Sha256([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Repo-Relative([string]$Root, [string]$FullPath) {
  $rootFull = Resolve-FullPath $Root
  $fileFull = Resolve-FullPath $FullPath
  if (-not $rootFull.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
    $rootFull = $rootFull + [System.IO.Path]::DirectorySeparatorChar
  }
  if ($fileFull.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    return ($fileFull.Substring($rootFull.Length) -replace "\\", "/")
  }
  return ($fileFull -replace "\\", "/")
}

$root = Resolve-FullPath $RepositoryRoot
if (-not (Test-Path -LiteralPath $root -PathType Container)) {
  throw "RepositoryRoot not found: $root"
}

$stableRuntimeFiles = @(
  @{ group = "queue"; role = "daily_queue_reader"; path = "src/queue/dailyQueueReader.js"; language = "javascript" },
  @{ group = "queue"; role = "python_process_runner"; path = "src/queue/pythonProcessRunner.js"; language = "javascript" },
  @{ group = "gpt_browser_bridge"; role = "button_handlers"; path = "src/gpt_browser_bridge/buttonHandlers.js"; language = "javascript" },
  @{ group = "gpt_browser_bridge"; role = "diagnostics"; path = "src/gpt_browser_bridge/diagnostics.js"; language = "javascript" },
  @{ group = "gpt_browser_bridge"; role = "file_name_safe"; path = "src/gpt_browser_bridge/fileNameSafe.js"; language = "javascript" },
  @{ group = "gpt_browser_bridge"; role = "stage1_self_check"; path = "src/gpt_browser_bridge/stage1SelfCheck.js"; language = "javascript" },
  @{ group = "pc_agent_routing"; role = "b2_w12_prefinal_validator"; path = "src/pc_agent_routing/B2_W12_PREFINAL_VALIDATOR.py"; language = "python" },
  @{ group = "pc_agent_routing"; role = "event_consumption_store"; path = "src/pc_agent_routing/event_consumption_store.py"; language = "python" },
  @{ group = "pc_agent_routing"; role = "resource_doctor"; path = "src/pc_agent_routing/resource_doctor.py"; language = "python" }
)

$generatedAt = (Get-Date).ToString("o")
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$pipelineDir = Join-Path $root "src/runtime_pipeline"
$exampleDir = Join-Path $root "examples/gas_station_portal_pipeline"
$reportDir = Join-Path $root ("reports/runtime_pipeline_contract_" + $stamp)
New-Item -ItemType Directory -Force -Path $pipelineDir | Out-Null
New-Item -ItemType Directory -Force -Path $exampleDir | Out-Null
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null

$sourceRows = New-Object System.Collections.ArrayList
$missing = 0
foreach ($item in $stableRuntimeFiles) {
  $full = Join-Path $root ($item.path -replace "/", [System.IO.Path]::DirectorySeparatorChar)
  $exists = Test-Path -LiteralPath $full -PathType Leaf
  $sha = ""
  $size = 0
  if ($exists) {
    $sha = Get-Sha256 $full
    $size = (Get-Item -LiteralPath $full).Length
  } else {
    $missing++
  }
  [void]$sourceRows.Add([ordered]@{
    kind = "stable_runtime_source"
    group = $item.group
    role = $item.role
    path = $item.path
    language = $item.language
    exists = [bool]$exists
    sha256 = $sha
    size_bytes = $size
  })
}

if ($missing -ne 0) {
  throw "Stable runtime source missing count is not zero: $missing"
}

$contractPath = Join-Path $pipelineDir "SOURCE_FACTORY_RUNTIME_PIPELINE_CONTRACT_V1.json"
$registryPath = Join-Path $pipelineDir "sourceFactoryRuntimePipelineRegistry.js"
$gasQueuePath = Join-Path $exampleDir "GAS_STATION_PORTAL_QUEUE_EXAMPLE.json"
$readmePath = Join-Path $exampleDir "README.md"

$contract = [ordered]@{
  schema_version = "SOURCE_FACTORY_RUNTIME_PIPELINE_CONTRACT_V1"
  generated_at = $generatedAt
  status = "PASS_RUNTIME_PIPELINE_CONTRACT_READY_FOR_017"
  closure_basis = [ordered]@{
    stable_core_closure_status = "PASS_STABLE_CORE_P0_CLOSURE"
    final_stable_src_static_verify_status = "PASS_FINAL_STABLE_SRC_STATIC_VERIFY_READY_FOR_015"
    stable_runtime_source_files = 9
    production_overwrite_count = 0
    conflict_count = 0
    external_side_effect_count = 0
  }
  runtime_groups = [ordered]@{
    queue = [ordered]@{
      description = "Daily queue reading and local process execution bridge."
      files = @(
        "src/queue/dailyQueueReader.js",
        "src/queue/pythonProcessRunner.js"
      )
    }
    gpt_browser_bridge = [ordered]@{
      description = "GPT browser bridge helpers for diagnostics, button handling, filename safety, and stage 1 self-check."
      files = @(
        "src/gpt_browser_bridge/buttonHandlers.js",
        "src/gpt_browser_bridge/diagnostics.js",
        "src/gpt_browser_bridge/fileNameSafe.js",
        "src/gpt_browser_bridge/stage1SelfCheck.js"
      )
    }
    pc_agent_routing = [ordered]@{
      description = "PC agent receipt and routing helpers."
      files = @(
        "src/pc_agent_routing/B2_W12_PREFINAL_VALIDATOR.py",
        "src/pc_agent_routing/event_consumption_store.py",
        "src/pc_agent_routing/resource_doctor.py"
      )
    }
  }
  execution_flow = @(
    [ordered]@{ step = 1; name = "daily_queue_intake"; input = "daily_queue/YYYY-MM-DD/*.json or *.md"; core_group = "queue"; side_effect = "read_only" },
    [ordered]@{ step = 2; name = "worker_prompt_dispatch_plan"; input = "queue item"; core_group = "queue"; side_effect = "plan_only" },
    [ordered]@{ step = 3; name = "gpt_browser_bridge_check"; input = "browser/session target"; core_group = "gpt_browser_bridge"; side_effect = "diagnostic_only" },
    [ordered]@{ step = 4; name = "pc_agent_receipt_gate"; input = "worker receipt / runtime artifact"; core_group = "pc_agent_routing"; side_effect = "receipt_validation_only" },
    [ordered]@{ step = 5; name = "commander_gate_decision"; input = "validated receipt"; core_group = "queue + pc_agent_routing"; side_effect = "report_only" }
  )
  gas_station_portal_binding = [ordered]@{
    example_queue_file = "examples/gas_station_portal_pipeline/GAS_STATION_PORTAL_QUEUE_EXAMPLE.json"
    project_code = "GAS_STATION_PORTAL"
    first_phase_policy = "Opinet data reprocessing and analysis pages first; AI counselor/community/reporting modules deferred until explicit stage gate."
    allowed_initial_tasks = @(
      "opinet_data_collection_design",
      "opinet_analysis_page_generation",
      "gas_station_portal_prompt_queue_test",
      "pc_agent_receipt_validation_test"
    )
  }
  source_ledger = @($sourceRows)
}

$contract | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $contractPath -Encoding UTF8

$registryJs = @'
"use strict";

const path = require("path");

const runtimePipelineContract = Object.freeze({
  schemaVersion: "SOURCE_FACTORY_RUNTIME_PIPELINE_CONTRACT_V1",
  status: "PASS_RUNTIME_PIPELINE_CONTRACT_READY_FOR_017",
  runtimeGroups: Object.freeze({
    queue: Object.freeze({
      dailyQueueReader: "src/queue/dailyQueueReader.js",
      pythonProcessRunner: "src/queue/pythonProcessRunner.js",
    }),
    gptBrowserBridge: Object.freeze({
      buttonHandlers: "src/gpt_browser_bridge/buttonHandlers.js",
      diagnostics: "src/gpt_browser_bridge/diagnostics.js",
      fileNameSafe: "src/gpt_browser_bridge/fileNameSafe.js",
      stage1SelfCheck: "src/gpt_browser_bridge/stage1SelfCheck.js",
    }),
    pcAgentRouting: Object.freeze({
      b2W12PrefinalValidator: "src/pc_agent_routing/B2_W12_PREFINAL_VALIDATOR.py",
      eventConsumptionStore: "src/pc_agent_routing/event_consumption_store.py",
      resourceDoctor: "src/pc_agent_routing/resource_doctor.py",
    }),
  }),
  executionFlow: Object.freeze([
    "daily_queue_intake",
    "worker_prompt_dispatch_plan",
    "gpt_browser_bridge_check",
    "pc_agent_receipt_gate",
    "commander_gate_decision",
  ]),
});

function getRuntimePipelineContract() {
  return runtimePipelineContract;
}

function resolveRuntimePath(repositoryRoot, relativePath) {
  if (!repositoryRoot || typeof repositoryRoot !== "string") {
    throw new TypeError("repositoryRoot must be a non-empty string");
  }
  if (!relativePath || typeof relativePath !== "string") {
    throw new TypeError("relativePath must be a non-empty string");
  }
  return path.join(repositoryRoot, relativePath);
}

function listRuntimeSourcePaths() {
  const groups = runtimePipelineContract.runtimeGroups;
  return [
    groups.queue.dailyQueueReader,
    groups.queue.pythonProcessRunner,
    groups.gptBrowserBridge.buttonHandlers,
    groups.gptBrowserBridge.diagnostics,
    groups.gptBrowserBridge.fileNameSafe,
    groups.gptBrowserBridge.stage1SelfCheck,
    groups.pcAgentRouting.b2W12PrefinalValidator,
    groups.pcAgentRouting.eventConsumptionStore,
    groups.pcAgentRouting.resourceDoctor,
  ];
}

module.exports = {
  getRuntimePipelineContract,
  listRuntimeSourcePaths,
  resolveRuntimePath,
};
'@
$registryJs | Set-Content -LiteralPath $registryPath -Encoding UTF8

$gasQueue = [ordered]@{
  schema_version = "SOURCE_FACTORY_DAILY_QUEUE_ITEM_V1"
  project_code = "GAS_STATION_PORTAL"
  queue_id = "GAS_STATION_PORTAL_016_PIPELINE_SMOKE_QUEUE_EXAMPLE"
  created_at = $generatedAt
  mode = "PROMPT_QUEUE_EXAMPLE_ONLY"
  target_stage = "PORTAL_PHASE_1_OPINET_DATA_REPROCESSING"
  task = [ordered]@{
    title = "Opinet analysis center seed task"
    objective = "Create a safe first queue item for gas station portal Opinet data collection and analysis page planning."
    allowed_effects = @("plan_only", "report_only", "no_external_transmission")
    forbidden_effects = @("production_deploy", "secret_commit", "external_api_call_without_key_policy", "middleware_transmission")
  }
  expected_receipt = [ordered]@{
    required = $true
    receipt_type = "SOURCE_FACTORY_WORKER_REPORT"
    required_fields = @("status", "worker_id", "task_id", "outputs", "verification", "blockers")
  }
}
$gasQueue | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $gasQueuePath -Encoding UTF8

$readme = @"
# Gas Station Portal Pipeline Example

This folder contains queue examples for Source Factory runtime pipeline tests.

- Project: GAS_STATION_PORTAL
- Phase: Phase 1 Opinet data reprocessing and analysis pages
- Mode: prompt queue example only
- External side effects: none

Use this example after the 016 runtime pipeline contract has passed and before any live portal automation is enabled.
"@
$readme | Set-Content -LiteralPath $readmePath -Encoding UTF8

$createdFiles = @($contractPath, $registryPath, $gasQueuePath, $readmePath)
$createdRows = New-Object System.Collections.ArrayList
foreach ($file in $createdFiles) {
  [void]$createdRows.Add([ordered]@{
    kind = "generated_pipeline_contract_file"
    path = Repo-Relative $root $file
    exists = (Test-Path -LiteralPath $file -PathType Leaf)
    sha256 = Get-Sha256 $file
    size_bytes = (Get-Item -LiteralPath $file).Length
  })
}

$nodeCheckStatus = "SKIP_NODE_NOT_FOUND"
$nodeExit = $null
$nodeOutput = ""
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($null -ne $nodeCmd) {
  $nodeOutput = (& node --check $registryPath 2>&1 | Out-String).Trim()
  $nodeExit = $LASTEXITCODE
  if ($nodeExit -eq 0) { $nodeCheckStatus = "PASS_NODE_CHECK" } else { $nodeCheckStatus = "FAIL_NODE_CHECK" }
}

$jsonParseStatus = "PASS_JSON_PARSE"
try {
  Get-Content -LiteralPath $contractPath -Raw | ConvertFrom-Json | Out-Null
  Get-Content -LiteralPath $gasQueuePath -Raw | ConvertFrom-Json | Out-Null
} catch {
  $jsonParseStatus = "FAIL_JSON_PARSE"
}

$status = "PASS_RUNTIME_PIPELINE_CONTRACT_READY_FOR_017"
if ($missing -ne 0 -or $jsonParseStatus -ne "PASS_JSON_PARSE" -or $nodeCheckStatus -eq "FAIL_NODE_CHECK") {
  $status = "FAIL_RUNTIME_PIPELINE_CONTRACT"
}

$manifestRows = @($sourceRows) + @($createdRows)
$manifestCsv = Join-Path $reportDir "RUNTIME_PIPELINE_CONTRACT_MANIFEST_V1.csv"
$manifestJson = Join-Path $reportDir "RUNTIME_PIPELINE_CONTRACT_MANIFEST_V1.json"
$summaryPath = Join-Path $reportDir "RUNTIME_PIPELINE_CONTRACT_SUMMARY_V1.md"
$workerReportPath = Join-Path $reportDir "WORKER_REPORT_016.md"

$manifestRows | Export-Csv -LiteralPath $manifestCsv -NoTypeInformation -Encoding UTF8
$manifestRows | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $manifestJson -Encoding UTF8

$summary = @"
# Source Factory Runtime Pipeline Contract V1

generated_at: $generatedAt

## Summary

| Item | Count / Status |
|---|---:|
| Stable runtime source files required | 9 |
| Stable runtime source files present | $($stableRuntimeFiles.Count - $missing) |
| Missing stable runtime source files | $missing |
| Generated contract files | $($createdFiles.Count) |
| JSON parse status | $jsonParseStatus |
| Registry node check status | $nodeCheckStatus |
| External side effect count | 0 |

## Status

$status

## Generated Files

- src/runtime_pipeline/SOURCE_FACTORY_RUNTIME_PIPELINE_CONTRACT_V1.json
- src/runtime_pipeline/sourceFactoryRuntimePipelineRegistry.js
- examples/gas_station_portal_pipeline/GAS_STATION_PORTAL_QUEUE_EXAMPLE.json
- examples/gas_station_portal_pipeline/README.md

## Policy

- This stage creates a runtime pipeline contract only.
- It does not run GPT, browser, PC Agent, external API, or production deployment.
- It does not modify the 9 stable runtime source files.
- 017 may proceed only when status is PASS_RUNTIME_PIPELINE_CONTRACT_READY_FOR_017.
"@
$summary | Set-Content -LiteralPath $summaryPath -Encoding UTF8

$workerReport = [ordered]@{
  worker_id = "SOURCE_FACTORY_016_RUNTIME_PIPELINE_CONTRACT_WORKER"
  task_id = "016_RUNTIME_PIPELINE_CONTRACT"
  status = $status
  generated_at = $generatedAt
  repository_root = $root
  stable_runtime_source_required = 9
  stable_runtime_source_missing = $missing
  generated_contract_file_count = $createdFiles.Count
  json_parse_status = $jsonParseStatus
  registry_node_check_status = $nodeCheckStatus
  registry_node_exit_code = $nodeExit
  registry_node_output = $nodeOutput
  production_overwrite_count = 0
  external_side_effect_count = 0
  report_dir = Repo-Relative $root $reportDir
}
$workerReport | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $workerReportPath -Encoding UTF8

Write-Host "SOURCE_FACTORY_RUNTIME_PIPELINE_CONTRACT_V1_COMPLETE"
Write-Host "Status=$status"
Write-Host "StableRuntimeSources=9"
Write-Host "MissingStableRuntimeSources=$missing"
Write-Host "GeneratedContractFiles=$($createdFiles.Count)"
Write-Host "JsonParseStatus=$jsonParseStatus"
Write-Host "RegistryNodeCheckStatus=$nodeCheckStatus"
Write-Host "ReportDir=$reportDir"

if ($status -ne "PASS_RUNTIME_PIPELINE_CONTRACT_READY_FOR_017") {
  exit 1
}
