param(
  [string]$RepositoryRoot = "",
  [string]$ReportRoot = ""
)

$ErrorActionPreference = "Stop"

function Resolve-FullPath([string]$Path) {
  if ([string]::IsNullOrWhiteSpace($Path)) { return $null }
  $full = [System.IO.Path]::GetFullPath($Path)
  return $full
}

function Get-Sha256([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Ensure-Dir([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
  }
}

function Run-ExternalCheck([string]$Kind, [string]$Path) {
  $result = [ordered]@{
    kind = $Kind
    path = $Path
    exists = $false
    status = "NOT_RUN"
    command = ""
    exit_code = $null
    stdout = ""
    stderr = ""
    sha256 = ""
  }

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    $result.status = "FAIL_MISSING_FILE"
    return $result
  }

  $result.exists = $true
  $result.sha256 = Get-Sha256 $Path

  $tmpOut = [System.IO.Path]::GetTempFileName()
  $tmpErr = [System.IO.Path]::GetTempFileName()

  try {
    if ($Kind -eq "javascript") {
      $cmd = Get-Command node -ErrorAction SilentlyContinue
      if ($null -eq $cmd) {
        $result.status = "FAIL_NODE_NOT_FOUND"
        return $result
      }
      $result.command = "node --check `"$Path`""
      $p = Start-Process -FilePath "node" -ArgumentList @("--check", $Path) -NoNewWindow -Wait -PassThru -RedirectStandardOutput $tmpOut -RedirectStandardError $tmpErr
      $result.exit_code = $p.ExitCode
    }
    elseif ($Kind -eq "python") {
      $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
      $usePyLauncher = $false
      if ($null -eq $pythonCmd) {
        $pyCmd = Get-Command py -ErrorAction SilentlyContinue
        if ($null -eq $pyCmd) {
          $result.status = "FAIL_PYTHON_NOT_FOUND"
          return $result
        }
        $usePyLauncher = $true
      }

      if ($usePyLauncher) {
        $result.command = "py -m py_compile `"$Path`""
        $p = Start-Process -FilePath "py" -ArgumentList @("-m", "py_compile", $Path) -NoNewWindow -Wait -PassThru -RedirectStandardOutput $tmpOut -RedirectStandardError $tmpErr
      }
      else {
        $result.command = "python -m py_compile `"$Path`""
        $p = Start-Process -FilePath "python" -ArgumentList @("-m", "py_compile", $Path) -NoNewWindow -Wait -PassThru -RedirectStandardOutput $tmpOut -RedirectStandardError $tmpErr
      }
      $result.exit_code = $p.ExitCode
    }
    else {
      $result.status = "SKIP_UNSUPPORTED_KIND"
      return $result
    }

    $result.stdout = (Get-Content -LiteralPath $tmpOut -Raw -ErrorAction SilentlyContinue)
    $result.stderr = (Get-Content -LiteralPath $tmpErr -Raw -ErrorAction SilentlyContinue)

    if ($result.exit_code -eq 0) {
      if ($Kind -eq "javascript") { $result.status = "PASS_NODE_CHECK" }
      elseif ($Kind -eq "python") { $result.status = "PASS_PY_COMPILE" }
      else { $result.status = "PASS" }
    }
    else {
      if ($Kind -eq "javascript") { $result.status = "FAIL_NODE_CHECK" }
      elseif ($Kind -eq "python") { $result.status = "FAIL_PY_COMPILE" }
      else { $result.status = "FAIL" }
    }
  }
  finally {
    Remove-Item -LiteralPath $tmpOut -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $tmpErr -Force -ErrorAction SilentlyContinue
  }

  return $result
}

if ([string]::IsNullOrWhiteSpace($RepositoryRoot)) {
  $RepositoryRoot = (Get-Location).Path
}
$root = Resolve-FullPath $RepositoryRoot
if (-not (Test-Path -LiteralPath $root -PathType Container)) {
  throw "RepositoryRoot not found: $root"
}

if ([string]::IsNullOrWhiteSpace($ReportRoot)) {
  $stamp = Get-Date -Format "yyyyMMdd_HHmmss"
  $ReportRoot = Join-Path $root "reports\final_stable_src_static_verify_$stamp"
}
$reportDir = Resolve-FullPath $ReportRoot
Ensure-Dir $reportDir

$targets = @(
  @{ kind = "javascript"; rel = "src\queue\dailyQueueReader.js" },
  @{ kind = "javascript"; rel = "src\queue\pythonProcessRunner.js" },
  @{ kind = "javascript"; rel = "src\gpt_browser_bridge\buttonHandlers.js" },
  @{ kind = "javascript"; rel = "src\gpt_browser_bridge\diagnostics.js" },
  @{ kind = "javascript"; rel = "src\gpt_browser_bridge\fileNameSafe.js" },
  @{ kind = "javascript"; rel = "src\gpt_browser_bridge\stage1SelfCheck.js" },
  @{ kind = "python"; rel = "src\pc_agent_routing\B2_W12_PREFINAL_VALIDATOR.py" },
  @{ kind = "python"; rel = "src\pc_agent_routing\event_consumption_store.py" },
  @{ kind = "python"; rel = "src\pc_agent_routing\resource_doctor.py" }
)

$rows = New-Object System.Collections.ArrayList
foreach ($t in $targets) {
  $path = Join-Path $root $t.rel
  $r = Run-ExternalCheck -Kind $t.kind -Path $path
  $obj = [pscustomobject]@{
    kind = $r.kind
    relative_path = $t.rel
    absolute_path = $r.path
    exists = $r.exists
    status = $r.status
    command = $r.command
    exit_code = $r.exit_code
    sha256 = $r.sha256
    stdout = $r.stdout
    stderr = $r.stderr
  }
  [void]$rows.Add($obj)
}

$total = $rows.Count
$pass = @($rows | Where-Object { $_.status -like "PASS*" }).Count
$fail = @($rows | Where-Object { $_.status -like "FAIL*" }).Count
$js = @($rows | Where-Object { $_.kind -eq "javascript" }).Count
$py = @($rows | Where-Object { $_.kind -eq "python" }).Count
$missing = @($rows | Where-Object { $_.exists -eq $false }).Count
$status = if ($fail -eq 0 -and $missing -eq 0 -and $pass -eq $total) { "PASS_FINAL_STABLE_SRC_STATIC_VERIFY_READY_FOR_015" } else { "FAIL_FINAL_STABLE_SRC_STATIC_VERIFY_BLOCKED" }

$csvPath = Join-Path $reportDir "FINAL_STABLE_SRC_STATIC_VERIFY_RESULTS.csv"
$jsonPath = Join-Path $reportDir "FINAL_STABLE_SRC_STATIC_VERIFY_RESULTS.json"
$mdPath = Join-Path $reportDir "FINAL_STABLE_SRC_STATIC_VERIFY_SUMMARY.md"
$workerPath = Join-Path $reportDir "WORKER_REPORT_014.md"

$rows | Export-Csv -LiteralPath $csvPath -NoTypeInformation -Encoding UTF8
$payload = [ordered]@{
  schema_version = "SOURCE_FACTORY_FINAL_STABLE_SRC_STATIC_VERIFY_V1"
  generated_at = (Get-Date).ToString("o")
  repository_root = $root
  report_dir = $reportDir
  total_files = $total
  pass = $pass
  fail = $fail
  missing = $missing
  javascript_files = $js
  python_files = $py
  status = $status
  rows = @($rows)
}
$payload | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $jsonPath -Encoding UTF8

$md = @"
# Source Factory Final Stable SRC Static Verify V1

generated_at: $((Get-Date).ToString("o"))
repository_root: $root

## Summary

| Item | Count |
|---|---:|
| Stable runtime files | $total |
| PASS | $pass |
| FAIL | $fail |
| Missing | $missing |
| JavaScript files | $js |
| Python files | $py |

## Status

$status

## Policy

- JavaScript files are checked with node --check.
- Python files are checked with python -m py_compile or py -m py_compile fallback.
- This stage verifies final stable src paths only.
- 015 closure may proceed only when FAIL and Missing are both 0.
"@
$md | Set-Content -LiteralPath $mdPath -Encoding UTF8

$worker = @"
# WORKER_REPORT_014

STATUS: $status
TOTAL_FILES: $total
PASS: $pass
FAIL: $fail
MISSING: $missing
PRODUCTION_SIDE_EFFECT_COUNT: 0
EXTERNAL_SIDE_EFFECT_COUNT: 0
REPORT_DIR: $reportDir
"@
$worker | Set-Content -LiteralPath $workerPath -Encoding UTF8

Write-Host "SOURCE_FACTORY_FINAL_STABLE_SRC_STATIC_VERIFY_V1_COMPLETE"
Write-Host "Status=$status"
Write-Host "StableRuntimeFiles=$total"
Write-Host "Pass=$pass"
Write-Host "Fail=$fail"
Write-Host "Missing=$missing"
Write-Host "ReportDir=$reportDir"

if ($status -like "FAIL*") {
  exit 1
}
exit 0
