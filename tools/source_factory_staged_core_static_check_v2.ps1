<#
SOURCE_FACTORY_STAGED_CORE_STATIC_CHECK_V2.ps1

Purpose:
  V2 static checker for staged Source Factory Core files.
  Fixes legacy manifest paths that start with ._staging after the folder was renamed to _staging.

Safety:
  - Read-only check
  - Does not promote files into src/
  - Does not modify staged source files
#>

param(
  [string]$StagingDir = ".\_staging\p0_core_import_20260730_174852"
)

$ErrorActionPreference = "Stop"

function Get-FileSha256 {
  param([string]$Path)
  try { return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant() } catch { return $null }
}

function Resolve-StagedPath {
  param([string]$ManifestPath, [string]$StagingDir)
  $p = $ManifestPath
  if ([string]::IsNullOrWhiteSpace($p)) { return $null }
  $p = $p -replace '^\.\\\._staging', '.\_staging'
  $p = $p -replace '^\._staging', '_staging'
  $p = $p -replace '^\.\\_staging', '_staging'
  if (Test-Path -LiteralPath $p) { return (Resolve-Path -LiteralPath $p).Path }
  $fileName = Split-Path -Path $p -Leaf
  $matches = @(Get-ChildItem -LiteralPath $StagingDir -Recurse -File -Filter $fileName -ErrorAction SilentlyContinue)
  if ($matches.Count -eq 1) { return $matches[0].FullName }
  if ($matches.Count -gt 1) {
    foreach ($m in $matches) {
      if ($m.FullName.Replace('/','\').ToLowerInvariant().EndsWith($p.Replace('/','\').TrimStart('.','\').ToLowerInvariant())) { return $m.FullName }
    }
    return $matches[0].FullName
  }
  return $null
}

function Get-StaticStatus {
  param([string]$Path, [string]$Extension)
  if (-not (Test-Path -LiteralPath $Path)) { return "FAIL_MISSING_STAGED_FILE" }
  if ($Extension -in @('.js','.mjs','.cjs')) {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($null -eq $node) { return "SKIP_NODE_NOT_AVAILABLE" }
    $out = & node --check $Path 2>&1
    if ($LASTEXITCODE -eq 0) { return "PASS_NODE_CHECK" }
    return "FAIL_NODE_CHECK"
  }
  if ($Extension -eq '.json') {
    try { Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json | Out-Null; return "PASS_JSON_PARSE" } catch { return "FAIL_JSON_PARSE" }
  }
  if ($Extension -eq '.py') {
    $py = Get-Command python -ErrorAction SilentlyContinue
    if ($null -eq $py) { return "SKIP_PYTHON_NOT_AVAILABLE" }
    $out = & python -m py_compile $Path 2>&1
    if ($LASTEXITCODE -eq 0) { return "PASS_PY_COMPILE" }
    return "FAIL_PY_COMPILE"
  }
  return "PASS_TEXT_OR_SCRIPT_STAGED"
}

if (-not (Test-Path -LiteralPath $StagingDir)) { throw "StagingDir not found: $StagingDir" }
$manifestPath = Join-Path $StagingDir "STAGED_SOURCE_MANIFEST.csv"
if (-not (Test-Path -LiteralPath $manifestPath)) { throw "STAGED_SOURCE_MANIFEST.csv not found: $manifestPath" }

$rows = @(Import-Csv -LiteralPath $manifestPath)
$reportsDir = Join-Path $StagingDir "reports"
New-Item -ItemType Directory -Force -Path $reportsDir | Out-Null

$results = @()
foreach ($row in $rows) {
  $resolved = Resolve-StagedPath -ManifestPath $row.staged_path -StagingDir $StagingDir
  $exists = $false
  if ($null -ne $resolved -and (Test-Path -LiteralPath $resolved)) { $exists = $true }
  $actualSha = $null
  if ($exists) { $actualSha = Get-FileSha256 -Path $resolved }
  $shaMatch = ($exists -and ($actualSha -eq $row.expected_sha256))
  $staticStatus = "FAIL_MISSING_STAGED_FILE"
  if ($exists) { $staticStatus = Get-StaticStatus -Path $resolved -Extension $row.file_name.Substring($row.file_name.LastIndexOf('.')).ToLowerInvariant() }
  $promotion = "BLOCKED_STATIC_OR_SHA"
  if ($shaMatch -and ($staticStatus -like "PASS_*" -or $staticStatus -like "SKIP_*")) { $promotion = "PROMOTION_CANDIDATE_FOR_MANUAL_REVIEW" }
  $results += [pscustomobject]@{
    file_name = $row.file_name
    category = $row.category
    original_staged_path = $row.staged_path
    resolved_staged_path = $resolved
    exists = $exists
    expected_sha256 = $row.expected_sha256
    actual_sha256 = $actualSha
    sha_match = $shaMatch
    static_status = $staticStatus
    promotion_decision = $promotion
  }
}

$csv = Join-Path $reportsDir "SF_CORE_STAGED_STATIC_CHECK_RESULTS_V2.csv"
$json = Join-Path $reportsDir "SF_CORE_STAGED_STATIC_CHECK_RESULTS_V2.json"
$md = Join-Path $reportsDir "SF_CORE_STAGED_STATIC_CHECK_RESULTS_V2.md"
$wr = Join-Path $StagingDir "WORKER_REPORT_005B.md"

$results | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $csv
$summary = [pscustomobject]@{
  generated_at = (Get-Date).ToString('o')
  staging_dir = $StagingDir
  total_staged_rows = $rows.Count
  total_checked = $results.Count
  promotion_counts = @($results | Group-Object promotion_decision | Sort-Object Name | ForEach-Object { [pscustomobject]@{ decision=$_.Name; count=$_.Count } })
  static_status_counts = @($results | Group-Object static_status | Sort-Object Name | ForEach-Object { [pscustomobject]@{ status=$_.Name; count=$_.Count } })
  results = $results
}
$summary | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 -Path $json

$lines = @()
$lines += "# Source Factory Staged P0 Core Static Check V2"
$lines += ""
$lines += "generated_at: $((Get-Date).ToString('o'))"
$lines += "staging_dir: $StagingDir"
$lines += ""
$lines += "## Summary"
$lines += ""
$lines += "| Item | Count |"
$lines += "|---|---:|"
$lines += "| Total staged rows | $($rows.Count) |"
$lines += "| Total checked | $($results.Count) |"
$lines += ""
$lines += "## Promotion Decision Counts"
$lines += ""
$lines += "| Decision | Count |"
$lines += "|---|---:|"
foreach ($g in ($results | Group-Object promotion_decision | Sort-Object Name)) { $lines += "| $($g.Name) | $($g.Count) |" }
$lines += ""
$lines += "## Static Status Counts"
$lines += ""
$lines += "| Static Status | Count |"
$lines += "|---|---:|"
foreach ($g in ($results | Group-Object static_status | Sort-Object Name)) { $lines += "| $($g.Name) | $($g.Count) |" }
$lines += ""
$lines += "## Policy"
$lines += ""
$lines += "- V2 fixes ._staging to _staging path normalization."
$lines += "- This does not promote files into src/."
$lines += "- PROMOTION_CANDIDATE_FOR_MANUAL_REVIEW is not final approval."
$lines -join "`r`n" | Set-Content -Encoding UTF8 -Path $md

$report = @()
$report += "WORKER_REPORT_START"
$report += "worker_id: SOURCE_FACTORY_STAGED_CORE_STATIC_CHECK_WORKER_005B"
$report += "task_id: SOURCE_FACTORY_STAGED_P0_CORE_STATIC_CHECK_V2"
$report += "files_created:"
$report += "  - reports/SF_CORE_STAGED_STATIC_CHECK_RESULTS_V2.md"
$report += "  - reports/SF_CORE_STAGED_STATIC_CHECK_RESULTS_V2.json"
$report += "  - reports/SF_CORE_STAGED_STATIC_CHECK_RESULTS_V2.csv"
$report += "  - WORKER_REPORT_005B.md"
$report += "class_contract_status: READY_FOR_COMMANDER_REVIEW"
$report += "priority_0_status: V2_STATIC_CHECK_COMPLETE"
$report += "WORKER_REPORT_END"
$report -join "`r`n" | Set-Content -Encoding UTF8 -Path $wr

Write-Host "SOURCE_FACTORY_STAGED_CORE_STATIC_CHECK_V2_COMPLETE"
Write-Host "StagingDir=$StagingDir"
Write-Host "TotalChecked=$($results.Count)"
Write-Host "PromotionCandidates=$(($results | Where-Object { $_.promotion_decision -eq 'PROMOTION_CANDIDATE_FOR_MANUAL_REVIEW' }).Count)"
Write-Host "Blocked=$(($results | Where-Object { $_.promotion_decision -eq 'BLOCKED_STATIC_OR_SHA' }).Count)"
