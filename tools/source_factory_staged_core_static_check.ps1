<#
SOURCE_FACTORY_STAGED_CORE_STATIC_CHECK.ps1

Stage 005 checker for selected P0 staged Source Factory core sources.

Purpose:
  - Read the latest _staging/p0_core_import_* folder, or a supplied staging folder.
  - Verify staged file existence, size, SHA-256 when source SHA exists in manifest.
  - Run safe parse/static checks only.
  - Produce promotion candidate lists for later manual src/ promotion.

Safety:
  - Does not execute staged source.
  - Does not copy staged source into src/.
  - Does not delete, move, or modify original local source.
#>

param(
  [string]$StagingDir = "",
  [int64]$MaxStaticScanBytes = 2MB
)

$ErrorActionPreference = "Stop"

function Get-LatestStagingDir {
  $root = ".\_staging"
  if (-not (Test-Path -LiteralPath $root)) { throw "_staging directory not found. Run stage_selected_core_sources first." }
  $dirs = Get-ChildItem -LiteralPath $root -Directory -Filter "p0_core_import_*" | Sort-Object LastWriteTime -Descending
  if ($dirs.Count -eq 0) { throw "p0_core_import_* staging directory not found." }
  return $dirs[0].FullName
}

function Get-FileSha256 {
  param([string]$Path)
  try { return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant() } catch { return $null }
}

function Get-ColumnValue {
  param([object]$Row, [string[]]$Names)
  foreach ($name in $Names) {
    if ($Row.PSObject.Properties.Name -contains $name) { return $Row.$name }
  }
  return $null
}

function Test-TextExtension {
  param([string]$Extension)
  return ($Extension -in @(".js", ".mjs", ".cjs", ".ts", ".tsx", ".py", ".ps1", ".bat", ".cmd", ".md", ".json", ".yaml", ".yml", ".html", ".css", ".sql", ".csv", ".txt"))
}

function Test-JsonParse {
  param([string]$Path)
  try {
    $raw = Get-Content -Raw -LiteralPath $Path -ErrorAction Stop
    if ([string]::IsNullOrWhiteSpace($raw)) { return "PASS_EMPTY_JSON_ALLOWED" }
    $null = $raw | ConvertFrom-Json -ErrorAction Stop
    return "PASS"
  } catch {
    return "FAIL_JSON_PARSE"
  }
}

function Test-NodeCheck {
  param([string]$Path)
  $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
  if ($null -eq $nodeCmd) { return "SKIP_NODE_NOT_FOUND" }
  try {
    $p = Start-Process -FilePath "node" -ArgumentList @("--check", $Path) -Wait -NoNewWindow -PassThru -RedirectStandardOutput "$env:TEMP\sf_node_check_out.txt" -RedirectStandardError "$env:TEMP\sf_node_check_err.txt"
    if ($p.ExitCode -eq 0) { return "PASS" }
    return "FAIL_NODE_CHECK"
  } catch {
    return "FAIL_NODE_CHECK_EXCEPTION"
  }
}

function Test-PythonCompile {
  param([string]$Path)
  $pyCmd = Get-Command python -ErrorAction SilentlyContinue
  if ($null -eq $pyCmd) { $pyCmd = Get-Command py -ErrorAction SilentlyContinue }
  if ($null -eq $pyCmd) { return "SKIP_PYTHON_NOT_FOUND" }
  try {
    if ($pyCmd.Name -eq "py.exe" -or $pyCmd.Name -eq "py") {
      $p = Start-Process -FilePath "py" -ArgumentList @("-3", "-m", "py_compile", $Path) -Wait -NoNewWindow -PassThru -RedirectStandardOutput "$env:TEMP\sf_py_compile_out.txt" -RedirectStandardError "$env:TEMP\sf_py_compile_err.txt"
    } else {
      $p = Start-Process -FilePath "python" -ArgumentList @("-m", "py_compile", $Path) -Wait -NoNewWindow -PassThru -RedirectStandardOutput "$env:TEMP\sf_py_compile_out.txt" -RedirectStandardError "$env:TEMP\sf_py_compile_err.txt"
    }
    if ($p.ExitCode -eq 0) { return "PASS" }
    return "FAIL_PY_COMPILE"
  } catch {
    return "FAIL_PY_COMPILE_EXCEPTION"
  }
}

function Get-StaticCheckResult {
  param([string]$Path, [string]$Extension, [int64]$SizeBytes)
  if (-not (Test-Path -LiteralPath $Path)) { return "FAIL_MISSING_STAGED_FILE" }
  if ($SizeBytes -gt $MaxStaticScanBytes) { return "SKIP_TOO_LARGE_FOR_STATIC_SCAN" }
  if ($Extension -in @(".js", ".mjs", ".cjs")) { return (Test-NodeCheck -Path $Path) }
  if ($Extension -eq ".json") { return (Test-JsonParse -Path $Path) }
  if ($Extension -eq ".py") { return (Test-PythonCompile -Path $Path) }
  if (Test-TextExtension -Extension $Extension) { return "PASS_TEXT_FILE" }
  return "SKIP_NON_TEXT_OR_UNSUPPORTED"
}

if ([string]::IsNullOrWhiteSpace($StagingDir)) { $StagingDir = Get-LatestStagingDir }
if (-not (Test-Path -LiteralPath $StagingDir)) { throw "StagingDir not found: $StagingDir" }

$manifestCsv = Join-Path $StagingDir "STAGED_SOURCE_MANIFEST.csv"
if (-not (Test-Path -LiteralPath $manifestCsv)) { throw "STAGED_SOURCE_MANIFEST.csv not found: $manifestCsv" }

$reportsDir = Join-Path $StagingDir "reports"
New-Item -ItemType Directory -Force -Path $reportsDir | Out-Null

$rows = @(Import-Csv -LiteralPath $manifestCsv)
$results = @()

foreach ($row in $rows) {
  $stagedPath = Get-ColumnValue -Row $row -Names @("staged_path", "staged_file", "target_path", "copy_path")
  if ([string]::IsNullOrWhiteSpace($stagedPath)) {
    $maybeRel = Get-ColumnValue -Row $row -Names @("relative_staged_path", "relative_path")
    if (-not [string]::IsNullOrWhiteSpace($maybeRel)) { $stagedPath = Join-Path $StagingDir $maybeRel }
  }

  if ([string]::IsNullOrWhiteSpace($stagedPath)) {
    $stagedPath = Get-ColumnValue -Row $row -Names @("source_path")
  }

  $fileName = Get-ColumnValue -Row $row -Names @("file_name", "name")
  $ext = (Get-ColumnValue -Row $row -Names @("extension", "ext"))
  if ([string]::IsNullOrWhiteSpace($ext) -and -not [string]::IsNullOrWhiteSpace($stagedPath)) { $ext = [System.IO.Path]::GetExtension($stagedPath).ToLowerInvariant() }
  $expectedSha = Get-ColumnValue -Row $row -Names @("sha256", "source_sha256", "expected_sha256")

  $exists = $false
  $size = 0
  $actualSha = $null
  $shaStatus = "SKIP_NO_EXPECTED_SHA"

  if (-not [string]::IsNullOrWhiteSpace($stagedPath) -and (Test-Path -LiteralPath $stagedPath)) {
    $exists = $true
    $fileInfo = Get-Item -LiteralPath $stagedPath
    $size = [int64]$fileInfo.Length
    $actualSha = Get-FileSha256 -Path $stagedPath
    if (-not [string]::IsNullOrWhiteSpace($expectedSha)) {
      if ($actualSha -eq $expectedSha.ToLowerInvariant()) { $shaStatus = "PASS" } else { $shaStatus = "FAIL_SHA_MISMATCH" }
    }
  } else {
    $shaStatus = "FAIL_MISSING_STAGED_FILE"
  }

  $staticStatus = Get-StaticCheckResult -Path $stagedPath -Extension $ext -SizeBytes $size

  $promotionDecision = "REVIEW_REQUIRED"
  if ($exists -and $shaStatus -notlike "FAIL*" -and $staticStatus -notlike "FAIL*") { $promotionDecision = "PROMOTION_CANDIDATE" }
  if ($staticStatus -like "SKIP*") { $promotionDecision = "REVIEW_REQUIRED_STATIC_SKIPPED" }
  if ($shaStatus -like "FAIL*" -or $staticStatus -like "FAIL*") { $promotionDecision = "BLOCKED_STATIC_OR_SHA" }

  $results += [pscustomobject]@{
    staged_path = $stagedPath
    file_name = $fileName
    extension = $ext
    size_bytes = $size
    expected_sha256 = $expectedSha
    actual_sha256 = $actualSha
    sha_status = $shaStatus
    static_status = $staticStatus
    promotion_decision = $promotionDecision
  }
}

$csvOut = Join-Path $reportsDir "SF_CORE_STAGED_STATIC_CHECK_RESULTS.csv"
$jsonOut = Join-Path $reportsDir "SF_CORE_STAGED_STATIC_CHECK_RESULTS.json"
$mdOut = Join-Path $reportsDir "SF_CORE_STAGED_STATIC_CHECK_RESULTS.md"
$wrOut = Join-Path $StagingDir "WORKER_REPORT_005.md"

$results | Sort-Object promotion_decision, static_status, staged_path | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $csvOut

$summary = [pscustomobject]@{
  generated_at = (Get-Date).ToString("o")
  staging_dir = $StagingDir
  total_rows = $rows.Count
  total_results = $results.Count
  decision_counts = @($results | Group-Object promotion_decision | Sort-Object Name | ForEach-Object { [pscustomobject]@{ decision=$_.Name; count=$_.Count } })
  static_counts = @($results | Group-Object static_status | Sort-Object Name | ForEach-Object { [pscustomobject]@{ static_status=$_.Name; count=$_.Count } })
  sha_counts = @($results | Group-Object sha_status | Sort-Object Name | ForEach-Object { [pscustomobject]@{ sha_status=$_.Name; count=$_.Count } })
  results = $results
}
$summary | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 -Path $jsonOut

$md = @()
$md += "# Source Factory Staged P0 Core Static Check"
$md += ""
$md += "generated_at: $((Get-Date).ToString('o'))"
$md += "staging_dir: $StagingDir"
$md += ""
$md += "## Summary"
$md += ""
$md += "| Item | Count |"
$md += "|---|---:|"
$md += "| Total staged rows | $($rows.Count) |"
$md += "| Total checked | $($results.Count) |"
$md += ""
$md += "## Promotion Decision Counts"
$md += ""
$md += "| Decision | Count |"
$md += "|---|---:|"
foreach ($g in ($results | Group-Object promotion_decision | Sort-Object Name)) { $md += "| $($g.Name) | $($g.Count) |" }
$md += ""
$md += "## Static Status Counts"
$md += ""
$md += "| Static Status | Count |"
$md += "|---|---:|"
foreach ($g in ($results | Group-Object static_status | Sort-Object Name)) { $md += "| $($g.Name) | $($g.Count) |" }
$md += ""
$md += "## Policy"
$md += ""
$md += "- This is a staging static check only."
$md += "- It does not promote files into src/."
$md += "- PROMOTION_CANDIDATE means eligible for manual review, not final approval."
$md += "- BLOCKED_STATIC_OR_SHA files must not be promoted."
$md -join "`r`n" | Set-Content -Encoding UTF8 -Path $mdOut

$wr = @()
$wr += "WORKER_REPORT_START"
$wr += "worker_id: SOURCE_FACTORY_CORE_STAGED_STATIC_CHECK_WORKER_005"
$wr += "task_id: SOURCE_FACTORY_CORE_STAGED_P0_STATIC_CHECK"
$wr += "worker_function_class: STATIC_CHECK_WORKER / PROMOTION_CANDIDATE_CLASSIFIER"
$wr += "files_created:"
$wr += "  - reports/SF_CORE_STAGED_STATIC_CHECK_RESULTS.md"
$wr += "  - reports/SF_CORE_STAGED_STATIC_CHECK_RESULTS.json"
$wr += "  - reports/SF_CORE_STAGED_STATIC_CHECK_RESULTS.csv"
$wr += "  - WORKER_REPORT_005.md"
$wr += "files_modified: []"
$wr += "patch_requests_created: []"
$wr += "report_only_artifacts:"
$wr += "  - staged SHA/static check results"
$wr += "  - promotion candidate list"
$wr += "tests_run:"
$wr += "  - staged manifest read"
$wr += "  - staged file existence check"
$wr += "  - staged SHA-256 check"
$wr += "  - JSON parse check where applicable"
$wr += "  - Node --check where available/applicable"
$wr += "  - Python py_compile where available/applicable"
$wr += "tests_not_run:"
$wr += "  - source execution"
$wr += "  - final src promotion"
$wr += "  - production runtime"
$wr += "class_contract_status: READY_FOR_COMMANDER_REVIEW"
$wr += "priority_0_status: STATIC_CHECK_COMPLETE_IF_TOTAL_RESULTS_GT_0"
$wr += "known_risks:"
$wr += "  - static checks are not runtime proof"
$wr += "  - PROMOTION_CANDIDATE still requires manual Commander review"
$wr += "next_needed:"
$wr += "  - submit static check reports"
$wr += "  - run 006 promotion plan after review"
$wr += "WORKER_REPORT_END"
$wr -join "`r`n" | Set-Content -Encoding UTF8 -Path $wrOut

Write-Host "SOURCE_FACTORY_STAGED_CORE_STATIC_CHECK_COMPLETE"
Write-Host "StagingDir=$StagingDir"
Write-Host "TotalResults=$($results.Count)"
Write-Host "ResultsCsv=$csvOut"
