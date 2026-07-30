param(
  [string]$RepositoryRoot = (Get-Location).Path,
  [string]$QueuePath = ""
)

$ErrorActionPreference = "Stop"

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  $dir = Split-Path -Parent $Path
  if ($dir -and -not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Get-Sha256([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

$root = (Resolve-Path -LiteralPath $RepositoryRoot).Path
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$reportDir = Join-Path $root "reports\runtime_pipeline_dry_run_$timestamp"
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null

$executorPath = Join-Path $root "src\runtime_pipeline\sourceFactoryRuntimeDryRunExecutor.js"
$registryPath = Join-Path $root "src\runtime_pipeline\sourceFactoryRuntimePipelineRegistry.js"
if ([string]::IsNullOrWhiteSpace($QueuePath)) {
  $QueuePath = Join-Path $root "examples\gas_station_portal_pipeline\GAS_STATION_PORTAL_QUEUE_EXAMPLE.json"
}
$queueFullPath = (Resolve-Path -LiteralPath $QueuePath).Path

$missing = @()
foreach ($path in @($executorPath, $registryPath, $queueFullPath)) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { $missing += $path }
}

$syntaxStatus = "NOT_RUN"
$dryRunStatus = "NOT_RUN"
$nodeExit = $null
$nodeOutput = ""
$receipt = $null

if ($missing.Count -eq 0) {
  $syntaxResult = & node --check $executorPath 2>&1
  $syntaxExit = $LASTEXITCODE
  if ($syntaxExit -eq 0) {
    $syntaxStatus = "PASS_NODE_CHECK"
  } else {
    $syntaxStatus = "FAIL_NODE_CHECK: $(($syntaxResult | Out-String).Trim())"
  }

  if ($syntaxStatus -eq "PASS_NODE_CHECK") {
    $nodeResult = & node $executorPath --repository-root $root --queue $queueFullPath 2>&1
    $nodeExit = $LASTEXITCODE
    $nodeOutput = ($nodeResult | Out-String).Trim()
    if ($nodeExit -eq 0) {
      try {
        $receipt = $nodeOutput | ConvertFrom-Json
        $dryRunStatus = [string]$receipt.status
      } catch {
        $dryRunStatus = "FAIL_RECEIPT_JSON_PARSE: $($_.Exception.Message)"
      }
    } else {
      $dryRunStatus = "FAIL_NODE_DRY_RUN"
    }
  }
}

$status = if ($missing.Count -eq 0 -and $syntaxStatus -eq "PASS_NODE_CHECK" -and $dryRunStatus -eq "PASS_RUNTIME_PIPELINE_DRY_RUN_READY_FOR_019") {
  "PASS_RUNTIME_PIPELINE_DRY_RUN_READY_FOR_019"
} else {
  "FAIL_RUNTIME_PIPELINE_DRY_RUN"
}

$receiptJsonPath = Join-Path $reportDir "RUNTIME_PIPELINE_DRY_RUN_RECEIPT_V1.json"
$summaryPath = Join-Path $reportDir "RUNTIME_PIPELINE_DRY_RUN_SUMMARY_V1.md"
$workerReportPath = Join-Path $reportDir "WORKER_REPORT_018.md"
$decisionPath = Join-Path $reportDir "RUNTIME_PIPELINE_DRY_RUN_DECISION_V1.json"

if ($receipt -ne $null) {
  Write-Utf8NoBom -Path $receiptJsonPath -Content ($receipt | ConvertTo-Json -Depth 30)
} else {
  Write-Utf8NoBom -Path $receiptJsonPath -Content $nodeOutput
}

$decision = [ordered]@{
  worker_id = "SOURCE_FACTORY_018_RUNTIME_PIPELINE_DRY_RUN_WORKER"
  task_id = "018_RUNTIME_PIPELINE_DRY_RUN"
  status = $status
  generated_at = (Get-Date).ToString("o")
  repository_root = $root
  executor_path = "src/runtime_pipeline/sourceFactoryRuntimeDryRunExecutor.js"
  queue_path = $queueFullPath
  missing_count = $missing.Count
  missing = $missing
  syntax_status = $syntaxStatus
  dry_run_status = $dryRunStatus
  node_exit_code = $nodeExit
  production_overwrite_count = 0
  external_side_effect_count = 0
  report_dir = ("reports/runtime_pipeline_dry_run_" + $timestamp)
}
Write-Utf8NoBom -Path $decisionPath -Content ($decision | ConvertTo-Json -Depth 20)

$summary = @"
# Source Factory Runtime Pipeline Dry Run V1

generated_at: $((Get-Date).ToString("o"))
repository_root: $root

## Summary

| Item | Count / Status |
|---|---:|
| Executor exists | $(Test-Path -LiteralPath $executorPath -PathType Leaf) |
| Queue example exists | $(Test-Path -LiteralPath $queueFullPath -PathType Leaf) |
| Missing required files | $($missing.Count) |
| Executor syntax status | $syntaxStatus |
| Dry-run status | $dryRunStatus |
| Node exit code | $nodeExit |
| Production overwrite count | 0 |
| External side effect count | 0 |

## Status

$status

## Policy

- This stage executes dry-run only.
- It reads the Gas Station Portal queue example and Source Factory runtime pipeline registry.
- It does not run GPT, browser automation, PC Agent service, external API, middleware transmission, or production deployment.
- 019 may proceed only when status is PASS_RUNTIME_PIPELINE_DRY_RUN_READY_FOR_019.
"@
Write-Utf8NoBom -Path $summaryPath -Content $summary
Write-Utf8NoBom -Path $workerReportPath -Content $summary

Write-Host "SOURCE_FACTORY_RUNTIME_PIPELINE_DRY_RUN_V1_COMPLETE"
Write-Host "Status=$status"
Write-Host "SyntaxStatus=$syntaxStatus"
Write-Host "DryRunStatus=$dryRunStatus"
Write-Host "Missing=$($missing.Count)"
Write-Host "ReportDir=$reportDir"

if ($status -ne "PASS_RUNTIME_PIPELINE_DRY_RUN_READY_FOR_019") { exit 1 }
exit 0
