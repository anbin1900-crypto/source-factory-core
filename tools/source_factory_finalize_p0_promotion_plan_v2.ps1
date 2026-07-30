<#
SOURCE_FACTORY_FINALIZE_P0_PROMOTION_PLAN_V2.ps1

Purpose:
  Robust final promotion planner for staged Source Factory P0 import.
  It auto-discovers the V3 static-check CSV even when relative path separators differ.
  It removes generated Python cache files from staging and writes final promotion/block lists.

Safety:
  - Does not promote files into src/.
  - Does not modify original source roots.
  - Removes only generated cache files under the supplied staging directory: *.pyc and empty __pycache__ dirs.
#>

param(
  [string]$StagingDir = ".\_staging\p0_core_import_20260730_174852"
)

$ErrorActionPreference = "Stop"

function Resolve-ExistingDirectory {
  param([string]$Path)
  if (Test-Path -LiteralPath $Path) {
    return (Resolve-Path -LiteralPath $Path).Path
  }
  $candidate = Join-Path (Get-Location).Path $Path
  if (Test-Path -LiteralPath $candidate) {
    return (Resolve-Path -LiteralPath $candidate).Path
  }
  throw "StagingDir not found: $Path"
}

function Find-FirstFile {
  param([string]$Root, [string]$FileName)
  $direct = Join-Path (Join-Path $Root "reports") $FileName
  if (Test-Path -LiteralPath $direct) { return (Resolve-Path -LiteralPath $direct).Path }
  $found = Get-ChildItem -LiteralPath $Root -Recurse -File -Filter $FileName -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -ne $found) { return $found.FullName }
  return $null
}

function Get-FieldValue {
  param([object]$Row, [string[]]$Names)
  foreach ($name in $Names) {
    if ($Row.PSObject.Properties.Name -contains $name) {
      return [string]$Row.$name
    }
  }
  return ""
}

$root = Resolve-ExistingDirectory -Path $StagingDir
$reportsDir = Join-Path $root "reports"
New-Item -ItemType Directory -Force -Path $reportsDir | Out-Null

$v3Csv = Find-FirstFile -Root $root -FileName "SF_CORE_STAGED_STATIC_CHECK_V3_RESULTS.csv"
if ([string]::IsNullOrWhiteSpace($v3Csv)) {
  throw "V3 static check CSV not found under: $root"
}

$manifestCsv = Find-FirstFile -Root $root -FileName "STAGED_SOURCE_MANIFEST.csv"

# Remove generated Python cache files created by static checks.
$removedCache = 0
$pycFiles = @(Get-ChildItem -LiteralPath $root -Recurse -File -Filter "*.pyc" -ErrorAction SilentlyContinue)
foreach ($f in $pycFiles) {
  try {
    Remove-Item -LiteralPath $f.FullName -Force -ErrorAction Stop
    $removedCache += 1
  } catch {}
}

$cacheDirs = @(Get-ChildItem -LiteralPath $root -Recurse -Directory -Filter "__pycache__" -ErrorAction SilentlyContinue | Sort-Object FullName -Descending)
foreach ($d in $cacheDirs) {
  try {
    $children = @(Get-ChildItem -LiteralPath $d.FullName -Force -ErrorAction SilentlyContinue)
    if ($children.Count -eq 0) { Remove-Item -LiteralPath $d.FullName -Force -ErrorAction Stop }
  } catch {}
}

$rows = @(Import-Csv -LiteralPath $v3Csv)

$finalRows = @()
foreach ($row in $rows) {
  $decision = Get-FieldValue -Row $row -Names @("promotion_decision", "PromotionDecision", "decision", "reuse_decision")
  $staticStatus = Get-FieldValue -Row $row -Names @("static_status", "StaticStatus", "status")
  $fileName = Get-FieldValue -Row $row -Names @("file_name", "FileName")
  $stagedPath = Get-FieldValue -Row $row -Names @("staged_path", "StagedPath", "path")
  $category = Get-FieldValue -Row $row -Names @("category", "Category")
  $sha = Get-FieldValue -Row $row -Names @("staged_sha256", "sha256", "expected_sha256")

  $finalDecision = "BLOCKED_REVIEW_REQUIRED"
  if ($decision -eq "PROMOTION_CANDIDATE") { $finalDecision = "FINAL_PROMOTION_CANDIDATE" }

  $finalRows += [pscustomobject]@{
    file_name = $fileName
    staged_path = $stagedPath
    category = $category
    static_status = $staticStatus
    prior_decision = $decision
    final_decision = $finalDecision
    sha256 = $sha
  }
}

$promotion = @($finalRows | Where-Object { $_.final_decision -eq "FINAL_PROMOTION_CANDIDATE" })
$blocked = @($finalRows | Where-Object { $_.final_decision -ne "FINAL_PROMOTION_CANDIDATE" })

$promotionCsv = Join-Path $reportsDir "SF_CORE_FINAL_P0_PROMOTION_CANDIDATES.csv"
$blockedCsv = Join-Path $reportsDir "SF_CORE_FINAL_P0_BLOCKED_FILES.csv"
$planJson = Join-Path $reportsDir "SF_CORE_FINAL_P0_PROMOTION_PLAN.json"
$planMd = Join-Path $reportsDir "SF_CORE_FINAL_P0_PROMOTION_PLAN.md"
$wrPath = Join-Path $root "WORKER_REPORT_006.md"

$promotion | Sort-Object category, staged_path | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $promotionCsv
$blocked | Sort-Object category, staged_path | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $blockedCsv

$summary = [pscustomobject]@{
  generated_at = (Get-Date).ToString("o")
  staging_dir = $root
  v3_csv = $v3Csv
  manifest_csv = $manifestCsv
  total_checked = $rows.Count
  promotion_candidates = $promotion.Count
  blocked = $blocked.Count
  removed_generated_cache = $removedCache
  promotion_candidate_files = $promotion
  blocked_files = $blocked
}
$summary | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 -Path $planJson

$md = @()
$md += "# Source Factory Final P0 Promotion Plan V2"
$md += ""
$md += "generated_at: $((Get-Date).ToString('o'))"
$md += "staging_dir: $root"
$md += ""
$md += "## Summary"
$md += ""
$md += "| Item | Count |"
$md += "|---|---:|"
$md += "| Total checked | $($rows.Count) |"
$md += "| Final promotion candidates | $($promotion.Count) |"
$md += "| Blocked / review required | $($blocked.Count) |"
$md += "| Removed generated cache files | $removedCache |"
$md += ""
$md += "## Policy"
$md += ""
$md += "- This plan does not move files into src/."
$md += "- FINAL_PROMOTION_CANDIDATE requires Commander approval before src promotion."
$md += "- BLOCKED_REVIEW_REQUIRED files must not be promoted."
$md += "- Generated cache files (*.pyc, empty __pycache__) are not reusable source."
$md -join "`r`n" | Set-Content -Encoding UTF8 -Path $planMd

$wr = @()
$wr += "WORKER_REPORT_START"
$wr += "worker_id: SOURCE_FACTORY_FINAL_P0_PROMOTION_PLANNER_WORKER_006_V2"
$wr += "task_id: SOURCE_FACTORY_FINAL_P0_PROMOTION_PLAN"
$wr += "worker_function_class: FINAL_PROMOTION_PLAN_WORKER / GENERATED_CACHE_CLEANUP_WORKER"
$wr += "files_created:"
$wr += "  - reports/SF_CORE_FINAL_P0_PROMOTION_CANDIDATES.csv"
$wr += "  - reports/SF_CORE_FINAL_P0_BLOCKED_FILES.csv"
$wr += "  - reports/SF_CORE_FINAL_P0_PROMOTION_PLAN.json"
$wr += "  - reports/SF_CORE_FINAL_P0_PROMOTION_PLAN.md"
$wr += "  - WORKER_REPORT_006.md"
$wr += "files_modified: []"
$wr += "patch_requests_created: []"
$wr += "report_only_artifacts:"
$wr += "  - final P0 promotion candidate plan"
$wr += "  - generated cache cleanup count"
$wr += "tests_run:"
$wr += "  - V3 static check CSV discovery"
$wr += "  - promotion/block split"
$wr += "  - pyc cleanup under staging"
$wr += "tests_not_run:"
$wr += "  - src promotion"
$wr += "  - runtime execution"
$wr += "class_contract_status: READY_FOR_COMMANDER_REVIEW"
$wr += "priority_0_status: FINAL_PROMOTION_PLAN_CREATED"
$wr += "known_risks:"
$wr += "  - final src promotion still requires Commander approval"
$wr += "next_needed:"
$wr += "  - review final promotion candidates"
$wr += "  - execute dedicated src promotion only after approval"
$wr += "WORKER_REPORT_END"
$wr -join "`r`n" | Set-Content -Encoding UTF8 -Path $wrPath

Write-Host "SOURCE_FACTORY_FINAL_P0_PROMOTION_PLAN_V2_COMPLETE"
Write-Host "StagingDir=$root"
Write-Host "V3Csv=$v3Csv"
Write-Host "PromotionCandidates=$($promotion.Count)"
Write-Host "Blocked=$($blocked.Count)"
Write-Host "RemovedGeneratedCache=$removedCache"
Write-Host "PromotionCsv=$promotionCsv"
