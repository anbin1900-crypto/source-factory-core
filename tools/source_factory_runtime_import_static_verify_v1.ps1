param(
  [Parameter(Mandatory=$true)][string]$RuntimeImportDir,
  [Parameter(Mandatory=$false)][string]$OpsImportDir = ""
)

$ErrorActionPreference = "Stop"

function Get-RepoRoot {
  $here = Split-Path -Parent $MyInvocation.ScriptName
  return (Resolve-Path (Join-Path $here "..")).Path
}

function Get-Sha256Lower([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Ensure-Dir([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
  }
}

function Safe-Rel([string]$Root, [string]$Path) {
  $rootFull = (Resolve-Path -LiteralPath $Root).Path.TrimEnd('\')
  $pathFull = (Resolve-Path -LiteralPath $Path).Path
  if ($pathFull.ToLowerInvariant().StartsWith($rootFull.ToLowerInvariant())) {
    return $pathFull.Substring($rootFull.Length).TrimStart('\')
  }
  return $pathFull
}

$repo = Get-RepoRoot
$runtimeRoot = (Resolve-Path -LiteralPath $RuntimeImportDir).Path
$opsRoot = $null
if ($OpsImportDir -and (Test-Path -LiteralPath $OpsImportDir)) {
  $opsRoot = (Resolve-Path -LiteralPath $OpsImportDir).Path
}

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$reportRoot = Join-Path $repo "reports\runtime_import_static_verify_$stamp"
Ensure-Dir $reportRoot

$runtimeFiles = @(Get-ChildItem -LiteralPath $runtimeRoot -File -Recurse | Sort-Object FullName)
$opsFiles = @()
if ($opsRoot) { $opsFiles = @(Get-ChildItem -LiteralPath $opsRoot -File -Recurse | Sort-Object FullName) }

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
$pythonCmd = Get-Command python -ErrorAction SilentlyContinue

$rows = New-Object System.Collections.ArrayList
$failCount = 0
$passCount = 0
$skipCount = 0

foreach ($file in $runtimeFiles) {
  $rel = Safe-Rel $runtimeRoot $file.FullName
  $ext = $file.Extension.ToLowerInvariant()
  $sha = Get-Sha256Lower $file.FullName
  $decision = ""
  $status = ""
  $exitCode = 0
  $message = ""

  if ($ext -eq ".js") {
    if (-not $nodeCmd) {
      $decision = "FAIL_NODE_NOT_FOUND"
      $status = "FAIL"
      $exitCode = -1
      $message = "node command not found"
    } else {
      $output = & node --check $file.FullName 2>&1
      $exitCode = $LASTEXITCODE
      if ($exitCode -eq 0) {
        $decision = "PASS_NODE_CHECK"
        $status = "PASS"
        $message = "node --check pass"
      } else {
        $decision = "FAIL_NODE_CHECK"
        $status = "FAIL"
        $message = ($output | Out-String).Trim()
      }
    }
  } elseif ($ext -eq ".py") {
    if (-not $pythonCmd) {
      $decision = "FAIL_PYTHON_NOT_FOUND"
      $status = "FAIL"
      $exitCode = -1
      $message = "python command not found"
    } else {
      $output = & python -m py_compile $file.FullName 2>&1
      $exitCode = $LASTEXITCODE
      if ($exitCode -eq 0) {
        $decision = "PASS_PY_COMPILE"
        $status = "PASS"
        $message = "python -m py_compile pass"
      } else {
        $decision = "FAIL_PY_COMPILE"
        $status = "FAIL"
        $message = ($output | Out-String).Trim()
      }
    }
  } else {
    $decision = "SKIP_NO_RUNTIME_STATIC_CHECK"
    $status = "SKIP"
    $message = "unsupported runtime extension"
  }

  if ($status -eq "PASS") { $passCount++ }
  elseif ($status -eq "FAIL") { $failCount++ }
  else { $skipCount++ }

  [void]$rows.Add([pscustomobject]@{
    kind = "runtime"
    relative_path = $rel
    file_name = $file.Name
    extension = $ext
    sha256 = $sha
    status = $status
    decision = $decision
    exit_code = $exitCode
    message = $message
  })
}

foreach ($file in $opsFiles) {
  $rel = Safe-Rel $opsRoot $file.FullName
  $ext = $file.Extension.ToLowerInvariant()
  $sha = Get-Sha256Lower $file.FullName
  [void]$rows.Add([pscustomobject]@{
    kind = "ops"
    relative_path = $rel
    file_name = $file.Name
    extension = $ext
    sha256 = $sha
    status = "REFERENCE"
    decision = "OPS_REFERENCE_STATIC_VERIFY_DEFERRED"
    exit_code = 0
    message = "ops file preserved for later integration review"
  })
}

$csv = Join-Path $reportRoot "RUNTIME_IMPORT_STATIC_VERIFY_RESULTS.csv"
$json = Join-Path $reportRoot "RUNTIME_IMPORT_STATIC_VERIFY_RESULTS.json"
$md = Join-Path $reportRoot "RUNTIME_IMPORT_STATIC_VERIFY_SUMMARY.md"
$worker = Join-Path $reportRoot "WORKER_REPORT_010.md"

$rows | Export-Csv -LiteralPath $csv -NoTypeInformation -Encoding UTF8
$rows | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $json -Encoding UTF8

$statusFinal = "PASS_RUNTIME_IMPORT_STATIC_VERIFY_READY_FOR_011"
if ($failCount -gt 0) { $statusFinal = "FAIL_RUNTIME_IMPORT_STATIC_VERIFY_BLOCKED" }

$summary = @()
$summary += "# Source Factory Runtime Import Static Verify"
$summary += ""
$summary += "generated_at: $(Get-Date -Format o)"
$summary += "runtime_import_dir: $runtimeRoot"
if ($opsRoot) { $summary += "ops_import_dir: $opsRoot" }
$summary += ""
$summary += "## Summary"
$summary += ""
$summary += "| Item | Count |"
$summary += "|---|---:|"
$summary += "| Runtime files | $($runtimeFiles.Count) |"
$summary += "| Runtime PASS | $passCount |"
$summary += "| Runtime FAIL | $failCount |"
$summary += "| Runtime SKIP | $skipCount |"
$summary += "| OPS reference files | $($opsFiles.Count) |"
$summary += ""
$summary += "## Status"
$summary += ""
$summary += $statusFinal
$summary += ""
$summary += "## Policy"
$summary += ""
$summary += "- JavaScript files are checked with node --check."
$summary += "- Python files are checked with python -m py_compile."
$summary += "- OPS files are preserved as review references and not runtime imported."
$summary += "- 011 integration may proceed only when Runtime FAIL is 0."
$summary | Set-Content -LiteralPath $md -Encoding UTF8

$workerLines = @()
$workerLines += "# WORKER_REPORT_010"
$workerLines += ""
$workerLines += "STATUS=$statusFinal"
$workerLines += "RUNTIME_FILES=$($runtimeFiles.Count)"
$workerLines += "RUNTIME_PASS=$passCount"
$workerLines += "RUNTIME_FAIL=$failCount"
$workerLines += "RUNTIME_SKIP=$skipCount"
$workerLines += "OPS_REFERENCE_FILES=$($opsFiles.Count)"
$workerLines += "REPORT_ROOT=$reportRoot"
$workerLines | Set-Content -LiteralPath $worker -Encoding UTF8

Write-Host "SOURCE_FACTORY_RUNTIME_IMPORT_STATIC_VERIFY_COMPLETE"
Write-Host "Status=$statusFinal"
Write-Host "RuntimeFiles=$($runtimeFiles.Count)"
Write-Host "RuntimePass=$passCount"
Write-Host "RuntimeFail=$failCount"
Write-Host "RuntimeSkip=$skipCount"
Write-Host "OpsReferenceFiles=$($opsFiles.Count)"
Write-Host "ReportRoot=$reportRoot"
Write-Host "Summary=$md"

if ($failCount -gt 0) { exit 1 }
exit 0
