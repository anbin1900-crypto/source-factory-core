param(
  [string]$RepositoryRoot = (Get-Location).Path
)

$ErrorActionPreference = "Stop"

function Get-Sha256([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  $dir = Split-Path -Parent $Path
  if ($dir -and -not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

$root = (Resolve-Path -LiteralPath $RepositoryRoot).Path
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$reportDir = Join-Path $root "reports\runtime_pipeline_smoke_verify_v2_$timestamp"
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null

$contractPath = Join-Path $root "src\runtime_pipeline\SOURCE_FACTORY_RUNTIME_PIPELINE_CONTRACT_V1.json"
$registryPath = Join-Path $root "src\runtime_pipeline\sourceFactoryRuntimePipelineRegistry.js"
$queueExamplePath = Join-Path $root "examples\gas_station_portal_pipeline\GAS_STATION_PORTAL_QUEUE_EXAMPLE.json"

$requiredStableSources = @(
  "src\queue\dailyQueueReader.js",
  "src\queue\pythonProcessRunner.js",
  "src\gpt_browser_bridge\buttonHandlers.js",
  "src\gpt_browser_bridge\diagnostics.js",
  "src\gpt_browser_bridge\fileNameSafe.js",
  "src\gpt_browser_bridge\stage1SelfCheck.js",
  "src\pc_agent_routing\B2_W12_PREFINAL_VALIDATOR.py",
  "src\pc_agent_routing\event_consumption_store.py",
  "src\pc_agent_routing\resource_doctor.py"
)

$requiredContractFiles = @(
  "src\runtime_pipeline\SOURCE_FACTORY_RUNTIME_PIPELINE_CONTRACT_V1.json",
  "src\runtime_pipeline\sourceFactoryRuntimePipelineRegistry.js",
  "examples\gas_station_portal_pipeline\GAS_STATION_PORTAL_QUEUE_EXAMPLE.json"
)

$missing = @()
foreach ($rel in @($requiredStableSources + $requiredContractFiles)) {
  $p = Join-Path $root $rel
  if (-not (Test-Path -LiteralPath $p -PathType Leaf)) { $missing += $rel }
}

$jsonParseStatus = "NOT_RUN"
$contractStatus = "NOT_RUN"
$queueExampleStatus = "NOT_RUN"
$registryImportStatus = "NOT_RUN"
$registryListStatus = "NOT_RUN"
$registryPathResolveStatus = "NOT_RUN"
$registrySyntaxStatus = "NOT_RUN"
$nodeExit = $null
$nodeOutput = ""
$nodeError = ""

if ($missing.Count -eq 0) {
  try {
    $contract = Get-Content -LiteralPath $contractPath -Raw | ConvertFrom-Json
    $queueExample = Get-Content -LiteralPath $queueExamplePath -Raw | ConvertFrom-Json
    $jsonParseStatus = "PASS_JSON_PARSE"
    if ($contract.status -eq "PASS_RUNTIME_PIPELINE_CONTRACT_READY_FOR_017") { $contractStatus = "PASS_CONTRACT_STATUS" } else { $contractStatus = "FAIL_CONTRACT_STATUS" }
    if ($queueExample.mode -eq "PROMPT_QUEUE_EXAMPLE_ONLY" -and $queueExample.project_code -eq "GAS_STATION_PORTAL") { $queueExampleStatus = "PASS_QUEUE_EXAMPLE" } else { $queueExampleStatus = "FAIL_QUEUE_EXAMPLE" }
  } catch {
    $jsonParseStatus = "FAIL_JSON_PARSE: $($_.Exception.Message)"
  }

  $registryCheck = & node --check $registryPath 2>&1
  if ($LASTEXITCODE -eq 0) {
    $registrySyntaxStatus = "PASS_NODE_CHECK"
  } else {
    $registrySyntaxStatus = "FAIL_NODE_CHECK"
    $nodeError = ($registryCheck | Out-String).Trim()
  }

  if ($registrySyntaxStatus -eq "PASS_NODE_CHECK") {
    $nodeScript = @"
import path from 'path';
import { pathToFileURL } from 'url';
const root = process.argv[2];
const registryUrl = pathToFileURL(path.join(root, 'src/runtime_pipeline/sourceFactoryRuntimePipelineRegistry.js')).href;
const registry = await import(registryUrl);
const contract = registry.getRuntimePipelineContract();
const paths = registry.listRuntimeSourcePaths();
const resolved = paths.map((p) => registry.resolveRuntimePath(root, p));
if (!contract || contract.status !== 'PASS_RUNTIME_PIPELINE_CONTRACT_READY_FOR_017') {
  throw new Error('CONTRACT_STATUS_MISMATCH');
}
if (!Array.isArray(paths) || paths.length !== 9) {
  throw new Error('RUNTIME_SOURCE_PATH_COUNT_MISMATCH:' + (Array.isArray(paths) ? paths.length : 'not-array'));
}
if (!resolved.every((p) => typeof p === 'string' && p.includes(root))) {
  throw new Error('RESOLVE_RUNTIME_PATH_FAILED');
}
console.log('PASS_REGISTRY_ESM_SMOKE paths=' + paths.length);
"@
    $nodeTemp = Join-Path $reportDir "runtime_pipeline_smoke_node_check_v2.mjs"
    Write-Utf8NoBom -Path $nodeTemp -Content $nodeScript
    try {
      $nodeResult = & node $nodeTemp $root 2>&1
      $nodeExit = $LASTEXITCODE
      $nodeOutput = ($nodeResult | Out-String).Trim()
    } catch {
      $nodeExit = 1
      $nodeOutput = $_.Exception.Message
    }
    if ($nodeExit -eq 0 -and $nodeOutput -match "PASS_REGISTRY_ESM_SMOKE") {
      $registryImportStatus = "PASS_IMPORT_ESM"
      $registryListStatus = "PASS_LIST_RUNTIME_SOURCE_PATHS"
      $registryPathResolveStatus = "PASS_RESOLVE_RUNTIME_PATH"
    } else {
      $registryImportStatus = "FAIL_IMPORT_OR_SMOKE"
      $registryListStatus = "FAIL_LIST_OR_COUNT"
      $registryPathResolveStatus = "FAIL_RESOLVE_RUNTIME_PATH"
      $nodeError = $nodeOutput
    }
    Remove-Item -LiteralPath $nodeTemp -Force -ErrorAction SilentlyContinue
  }
}

$rows = New-Object System.Collections.ArrayList
foreach ($rel in $requiredStableSources) {
  $p = Join-Path $root $rel
  $exists = Test-Path -LiteralPath $p -PathType Leaf
  [void]$rows.Add([pscustomobject]@{
    kind = "stable_runtime_source"
    path = $rel.Replace("\\", "/")
    exists = $exists
    sha256 = if ($exists) { Get-Sha256 $p } else { "" }
  })
}
foreach ($rel in $requiredContractFiles) {
  $p = Join-Path $root $rel
  $exists = Test-Path -LiteralPath $p -PathType Leaf
  [void]$rows.Add([pscustomobject]@{
    kind = "pipeline_contract_or_example"
    path = $rel.Replace("\\", "/")
    exists = $exists
    sha256 = if ($exists) { Get-Sha256 $p } else { "" }
  })
}

$pass = ($missing.Count -eq 0 -and $jsonParseStatus -eq "PASS_JSON_PARSE" -and $contractStatus -eq "PASS_CONTRACT_STATUS" -and $queueExampleStatus -eq "PASS_QUEUE_EXAMPLE" -and $registrySyntaxStatus -eq "PASS_NODE_CHECK" -and $registryImportStatus -eq "PASS_IMPORT_ESM" -and $registryListStatus -eq "PASS_LIST_RUNTIME_SOURCE_PATHS" -and $registryPathResolveStatus -eq "PASS_RESOLVE_RUNTIME_PATH")
$status = if ($pass) { "PASS_RUNTIME_PIPELINE_SMOKE_VERIFY_READY_FOR_018" } else { "FAIL_RUNTIME_PIPELINE_SMOKE_VERIFY" }

$resultsCsv = Join-Path $reportDir "RUNTIME_PIPELINE_SMOKE_VERIFY_RESULTS_V2.csv"
$resultsJson = Join-Path $reportDir "RUNTIME_PIPELINE_SMOKE_VERIFY_RESULTS_V2.json"
$summaryMd = Join-Path $reportDir "RUNTIME_PIPELINE_SMOKE_VERIFY_SUMMARY_V2.md"
$workerReport = Join-Path $reportDir "WORKER_REPORT_017B.md"

$rows | Export-Csv -LiteralPath $resultsCsv -NoTypeInformation -Encoding UTF8
$decision = [ordered]@{
  worker_id = "SOURCE_FACTORY_017B_RUNTIME_PIPELINE_SMOKE_VERIFY_WORKER"
  task_id = "017B_RUNTIME_PIPELINE_SMOKE_VERIFY_ESM"
  status = $status
  generated_at = (Get-Date).ToString("o")
  repository_root = $root
  stable_runtime_sources_checked = $requiredStableSources.Count
  missing_count = $missing.Count
  missing = $missing
  json_parse_status = $jsonParseStatus
  contract_status = $contractStatus
  queue_example_status = $queueExampleStatus
  registry_syntax_status = $registrySyntaxStatus
  registry_import_status = $registryImportStatus
  registry_list_status = $registryListStatus
  registry_path_resolve_status = $registryPathResolveStatus
  node_exit_code = $nodeExit
  node_output = $nodeOutput
  node_error = $nodeError
  production_overwrite_count = 0
  external_side_effect_count = 0
  report_dir = ("reports/runtime_pipeline_smoke_verify_v2_" + $timestamp)
}
$decision | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $resultsJson -Encoding UTF8

$summary = @"
# Source Factory Runtime Pipeline Smoke Verify V2

generated_at: $((Get-Date).ToString("o"))
repository_root: $root

## Summary

| Item | Count / Status |
|---|---:|
| Stable runtime sources checked | $($requiredStableSources.Count) |
| Missing stable/runtime contract files | $($missing.Count) |
| JSON parse status | $jsonParseStatus |
| Contract status | $contractStatus |
| Queue example status | $queueExampleStatus |
| Registry syntax status | $registrySyntaxStatus |
| Registry import status | $registryImportStatus |
| Registry list status | $registryListStatus |
| Registry path resolve status | $registryPathResolveStatus |
| Production overwrite count | 0 |
| External side effect count | 0 |

## Status

$status

## Policy

- This stage is dry-run smoke verification only.
- It uses ESM import because package.json declares type=module.
- It does not run GPT, browser automation, PC Agent service, external API, or production deployment.
- 018 may proceed only when status is PASS_RUNTIME_PIPELINE_SMOKE_VERIFY_READY_FOR_018.
"@
Write-Utf8NoBom -Path $summaryMd -Content $summary
Write-Utf8NoBom -Path $workerReport -Content $summary

Write-Host "SOURCE_FACTORY_RUNTIME_PIPELINE_SMOKE_VERIFY_V2_COMPLETE"
Write-Host "Status=$status"
Write-Host "StableRuntimeSourcesChecked=$($requiredStableSources.Count)"
Write-Host "Missing=$($missing.Count)"
Write-Host "JsonParseStatus=$jsonParseStatus"
Write-Host "RegistrySyntaxStatus=$registrySyntaxStatus"
Write-Host "RegistryImportStatus=$registryImportStatus"
Write-Host "RegistryListStatus=$registryListStatus"
Write-Host "RegistryPathResolveStatus=$registryPathResolveStatus"
Write-Host "ReportDir=$reportDir"

if (-not $pass) { exit 1 }
exit 0
