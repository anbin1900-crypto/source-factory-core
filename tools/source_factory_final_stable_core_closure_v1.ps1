param(
  [string]$RepositoryRoot = "."
)

$ErrorActionPreference = "Stop"

function Resolve-FullPathCompat([string]$Path) {
  if ([System.IO.Path]::IsPathRooted($Path)) {
    return [System.IO.Path]::GetFullPath($Path)
  }
  return [System.IO.Path]::GetFullPath((Join-Path (Get-Location).Path $Path))
}

function Sha256File([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Ensure-Dir([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
  }
}

$root = Resolve-FullPathCompat $RepositoryRoot
if (-not (Test-Path -LiteralPath $root -PathType Container)) {
  throw "RepositoryRoot not found: $root"
}

$stableRuntime = @(
  @{ group = "queue"; language = "javascript"; role = "daily_queue_reader"; relative_path = "src/queue/dailyQueueReader.js" },
  @{ group = "queue"; language = "javascript"; role = "python_process_runner"; relative_path = "src/queue/pythonProcessRunner.js" },
  @{ group = "gpt_browser_bridge"; language = "javascript"; role = "button_handlers"; relative_path = "src/gpt_browser_bridge/buttonHandlers.js" },
  @{ group = "gpt_browser_bridge"; language = "javascript"; role = "diagnostics"; relative_path = "src/gpt_browser_bridge/diagnostics.js" },
  @{ group = "gpt_browser_bridge"; language = "javascript"; role = "file_name_safe"; relative_path = "src/gpt_browser_bridge/fileNameSafe.js" },
  @{ group = "gpt_browser_bridge"; language = "javascript"; role = "stage1_self_check"; relative_path = "src/gpt_browser_bridge/stage1SelfCheck.js" },
  @{ group = "pc_agent_routing"; language = "python"; role = "b2_w12_prefinal_validator"; relative_path = "src/pc_agent_routing/B2_W12_PREFINAL_VALIDATOR.py" },
  @{ group = "pc_agent_routing"; language = "python"; role = "event_consumption_store"; relative_path = "src/pc_agent_routing/event_consumption_store.py" },
  @{ group = "pc_agent_routing"; language = "python"; role = "resource_doctor"; relative_path = "src/pc_agent_routing/resource_doctor.py" }
)

$opsReferences = @(
  @{ group = "gpt_browser_bridge"; language = "batch"; role = "stage1_diagnostic_runner"; relative_path = "ops_import/p0_ops_import_20260731_013239/P0_GPT_BROWSER_BRIDGE/3d07ea5055b8_RUN_STAGE1_DIAGNOSTIC.bat" },
  @{ group = "gpt_browser_bridge"; language = "github_actions"; role = "hosted_windows_pc_agent_build"; relative_path = "ops_import/p0_ops_import_20260731_013239/P0_GPT_BROWSER_BRIDGE/cb4b65aaf72f_a4-hosted-windows-pc-agent-build-v4.yml" }
)

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$reportDir = Join-Path $root ("reports/final_stable_core_closure_" + $timestamp)
Ensure-Dir $reportDir

$ledgerRows = New-Object System.Collections.ArrayList
$missing = 0

foreach ($item in $stableRuntime) {
  $rel = [string]$item.relative_path
  $full = Join-Path $root ($rel -replace "/", "\\")
  $exists = Test-Path -LiteralPath $full -PathType Leaf
  $sha = ""
  $size = 0
  if ($exists) {
    $sha = Sha256File $full
    $size = (Get-Item -LiteralPath $full).Length
  } else {
    $missing++
  }
  [void]$ledgerRows.Add([pscustomobject]@{
    kind = "stable_runtime_source"
    group = [string]$item.group
    role = [string]$item.role
    language = [string]$item.language
    relative_path = $rel
    exists = [bool]$exists
    sha256 = $sha
    size_bytes = [int64]$size
  })
}

foreach ($item in $opsReferences) {
  $rel = [string]$item.relative_path
  $full = Join-Path $root ($rel -replace "/", "\\")
  $exists = Test-Path -LiteralPath $full -PathType Leaf
  $sha = ""
  $size = 0
  if ($exists) {
    $sha = Sha256File $full
    $size = (Get-Item -LiteralPath $full).Length
  }
  [void]$ledgerRows.Add([pscustomobject]@{
    kind = "ops_reference"
    group = [string]$item.group
    role = [string]$item.role
    language = [string]$item.language
    relative_path = $rel
    exists = [bool]$exists
    sha256 = $sha
    size_bytes = [int64]$size
  })
}

$finalVerifySummary = Get-ChildItem -LiteralPath (Join-Path $root "reports") -Recurse -Filter "FINAL_STABLE_SRC_STATIC_VERIFY_SUMMARY.md" -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

$finalVerifyFound = $false
$finalVerifyStatus = "UNKNOWN"
if ($null -ne $finalVerifySummary) {
  $finalVerifyFound = $true
  $txt = Get-Content -LiteralPath $finalVerifySummary.FullName -Raw
  if ($txt -match "PASS_FINAL_STABLE_SRC_STATIC_VERIFY_READY_FOR_015") {
    $finalVerifyStatus = "PASS_FINAL_STABLE_SRC_STATIC_VERIFY_READY_FOR_015"
  } else {
    $finalVerifyStatus = "SUMMARY_FOUND_STATUS_NOT_PASS"
  }
}

$runtimeCount = @($ledgerRows | Where-Object { $_.kind -eq "stable_runtime_source" }).Count
$runtimeExisting = @($ledgerRows | Where-Object { $_.kind -eq "stable_runtime_source" -and $_.exists -eq $true }).Count
$opsCount = @($ledgerRows | Where-Object { $_.kind -eq "ops_reference" }).Count
$jsCount = @($ledgerRows | Where-Object { $_.kind -eq "stable_runtime_source" -and $_.language -eq "javascript" }).Count
$pyCount = @($ledgerRows | Where-Object { $_.kind -eq "stable_runtime_source" -and $_.language -eq "python" }).Count

$status = "PASS_STABLE_CORE_P0_CLOSURE"
if ($missing -ne 0 -or -not $finalVerifyFound -or $finalVerifyStatus -ne "PASS_FINAL_STABLE_SRC_STATIC_VERIFY_READY_FOR_015") {
  $status = "BLOCKED_STABLE_CORE_P0_CLOSURE_REVIEW_REQUIRED"
}

$ledgerCsv = Join-Path $reportDir "STABLE_CORE_SOURCE_LEDGER_V1.csv"
$ledgerJson = Join-Path $reportDir "STABLE_CORE_SOURCE_LEDGER_V1.json"
$decisionJson = Join-Path $reportDir "STABLE_CORE_CLOSURE_DECISION_V1.json"
$summaryMd = Join-Path $reportDir "STABLE_CORE_CLOSURE_SUMMARY_V1.md"
$workerReport = Join-Path $reportDir "WORKER_REPORT_015.md"

$ledgerRows | Export-Csv -LiteralPath $ledgerCsv -NoTypeInformation -Encoding UTF8
$ledgerRows | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $ledgerJson -Encoding UTF8

$decision = [ordered]@{
  schema_version = "SOURCE_FACTORY_STABLE_CORE_CLOSURE_V1"
  generated_at = (Get-Date).ToString("o")
  repository_root = $root
  status = $status
  stable_runtime_source_count = $runtimeCount
  stable_runtime_existing_count = $runtimeExisting
  missing_stable_runtime_count = $missing
  javascript_runtime_count = $jsCount
  python_runtime_count = $pyCount
  ops_reference_count = $opsCount
  final_static_verify_summary_found = $finalVerifyFound
  final_static_verify_status = $finalVerifyStatus
  production_overwrite_count = 0
  conflict_count = 0
  external_side_effect_count = 0
  next_stage = "016_CORE_INDEX_AND_USAGE_DOCS"
}
$decision | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $decisionJson -Encoding UTF8

$summary = @"
# Source Factory Stable Core Closure V1

generated_at: $((Get-Date).ToString("o"))
repository_root: $root

## Summary

| Item | Count |
|---|---:|
| Stable runtime source files | $runtimeCount |
| Existing stable runtime source files | $runtimeExisting |
| Missing stable runtime source files | $missing |
| JavaScript runtime files | $jsCount |
| Python runtime files | $pyCount |
| OPS reference files | $opsCount |
| Production overwrite count | 0 |
| Conflict count | 0 |
| External side effect count | 0 |

## Verification Linkage

| Item | Value |
|---|---|
| Final stable src static verify summary found | $finalVerifyFound |
| Final stable src static verify status | $finalVerifyStatus |

## Status

$status

## Stable Runtime Groups

- queue: daily queue reader, Python process runner
- gpt_browser_bridge: browser bridge diagnostics, button handlers, filename safety, stage1 self-check
- pc_agent_routing: event consumption store, resource doctor, B2 W12 prefinal validator

## Policy

- This closure does not move or modify runtime source files.
- This closure records the final stable runtime source ledger.
- OPS references remain outside runtime source.
- 016 may proceed after PASS_STABLE_CORE_P0_CLOSURE.
"@
$summary | Set-Content -LiteralPath $summaryMd -Encoding UTF8

$worker = @"
# WORKER_REPORT_015

STATUS=$status
STABLE_RUNTIME_SOURCE_COUNT=$runtimeCount
STABLE_RUNTIME_EXISTING_COUNT=$runtimeExisting
MISSING_STABLE_RUNTIME_COUNT=$missing
JAVASCRIPT_RUNTIME_COUNT=$jsCount
PYTHON_RUNTIME_COUNT=$pyCount
OPS_REFERENCE_COUNT=$opsCount
FINAL_STATIC_VERIFY_STATUS=$finalVerifyStatus
PRODUCTION_OVERWRITE_COUNT=0
CONFLICT_COUNT=0
EXTERNAL_SIDE_EFFECT_COUNT=0
REPORT_DIR=$reportDir
"@
$worker | Set-Content -LiteralPath $workerReport -Encoding UTF8

Write-Host "SOURCE_FACTORY_STABLE_CORE_CLOSURE_V1_COMPLETE"
Write-Host "Status=$status"
Write-Host "StableRuntimeSourceFiles=$runtimeCount"
Write-Host "ExistingStableRuntimeSourceFiles=$runtimeExisting"
Write-Host "MissingStableRuntimeSourceFiles=$missing"
Write-Host "OpsReferenceFiles=$opsCount"
Write-Host "FinalStaticVerifyStatus=$finalVerifyStatus"
Write-Host "ReportDir=$reportDir"

if ($status -ne "PASS_STABLE_CORE_P0_CLOSURE") {
  exit 1
}
