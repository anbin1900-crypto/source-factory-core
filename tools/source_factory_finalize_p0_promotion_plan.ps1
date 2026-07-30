<#
SOURCE_FACTORY_FINALIZE_P0_PROMOTION_PLAN.ps1

Purpose:
  Stage 006 planner for Source Factory Core migration.
  It consumes staged static-check V3 results, removes generated Python cache files from the working tree,
  and creates a final src promotion plan for manually reviewed P0 core candidates.

Safety:
  - Does not promote files into src/.
  - Does not delete source originals.
  - Removes only generated __pycache__ directories and *.pyc files inside the staging directory.
  - Produces reports only.
#>

param(
  [string]$StagingDir = ".\_staging\p0_core_import_20260730_174852"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $StagingDir)) {
  throw "StagingDir not found: $StagingDir"
}

$reportsDir = Join-Path $StagingDir "reports"
$v3Csv = Join-Path $reportsDir "SF_CORE_STAGED_STATIC_CHECK_V3_RESULTS.csv"
if (-not (Test-Path -LiteralPath $v3Csv)) {
  throw "V3 static check CSV not found: $v3Csv"
}

$removed = @()
Get-ChildItem -LiteralPath $StagingDir -Recurse -File -Force -Include *.pyc -ErrorAction SilentlyContinue | ForEach-Object {
  $removed += [pscustomobject]@{ path=$_.FullName; type="pyc"; size_bytes=[int64]$_.Length }
  Remove-Item -LiteralPath $_.FullName -Force
}
Get-ChildItem -LiteralPath $StagingDir -Recurse -Directory -Force -Filter __pycache__ -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | ForEach-Object {
  if (-not (Get-ChildItem -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue)) {
    $removed += [pscustomobject]@{ path=$_.FullName; type="empty_pycache_dir"; size_bytes=0 }
    Remove-Item -LiteralPath $_.FullName -Force
  }
}

$rows = @(Import-Csv -LiteralPath $v3Csv)
$promotion = @($rows | Where-Object { $_.promotion_decision -eq "PROMOTION_CANDIDATE" })
$blocked = @($rows | Where-Object { $_.promotion_decision -ne "PROMOTION_CANDIDATE" })

function Get-TargetArea {
  param([string]$Category, [string]$Path)
  $p = $Path.ToLowerInvariant()
  if ($Category -eq "P0_PC_AGENT_ROUTING_CORE") { return "src/pc-agent-routing" }
  if ($Category -eq "P0_GPT_BROWSER_BRIDGE") { return "src/gpt-browser-bridge" }
  if ($Category -eq "P0_DAILY_QUEUE_RUNNER") { return "src/daily-queue-runner" }
  if ($p.Contains("opinet") -or $p.Contains("petro") -or $p.Contains("kpetro") -or $p.Contains("fuel") -or $p.Contains("gas") -or $p.Contains("station")) { return "examples/gas-station-portal" }
  return "src/reviewed-core-candidates"
}

$finalPlan = @()
foreach ($row in $promotion) {
  $targetArea = Get-TargetArea -Category $row.category -Path $row.staged_path
  $finalPlan += [pscustomobject]@{
    source_path = $row.source_path
    staged_path = $row.staged_path
    file_name = $row.file_name
    category = $row.category
    static_status = $row.static_status
    promotion_decision = $row.promotion_decision
    target_area = $targetArea
    action = "MANUAL_REVIEW_THEN_PROMOTE"
    note = "Eligible by V3 static check; not yet final src promotion."
  }
}

$planCsv = Join-Path $reportsDir "SF_CORE_FINAL_P0_PROMOTION_PLAN.csv"
$planJson = Join-Path $reportsDir "SF_CORE_FINAL_P0_PROMOTION_PLAN.json"
$blockedCsv = Join-Path $reportsDir "SF_CORE_FINAL_P0_BLOCKED_STATIC_CHECK.csv"
$cleanupJson = Join-Path $reportsDir "SF_CORE_STAGING_CLEANUP_REPORT.json"
$mdPath = Join-Path $reportsDir "SF_CORE_FINAL_P0_PROMOTION_PLAN.md"
$wrPath = Join-Path $StagingDir "WORKER_REPORT_006.md"

$finalPlan | Sort-Object target_area, category, file_name | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $planCsv
$blocked | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $blockedCsv

$summary = [pscustomobject]@{
  generated_at = (Get-Date).ToString("o")
  staging_dir = $StagingDir
  total_v3_rows = $rows.Count
  promotion_candidate_count = $promotion.Count
  blocked_count = $blocked.Count
  cleanup_removed_count = $removed.Count
  target_area_counts = @($finalPlan | Group-Object target_area | Sort-Object Name | ForEach-Object { [pscustomobject]@{ target_area=$_.Name; count=$_.Count } })
  plan = $finalPlan
}
$summary | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 -Path $planJson

$cleanup = [pscustomobject]@{
  generated_at = (Get-Date).ToString("o")
  removed = $removed
}
$cleanup | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 -Path $cleanupJson

$md = @()
$md += "# Source Factory Final P0 Promotion Plan"
$md += ""
$md += "generated_at: $((Get-Date).ToString('o'))"
$md += "staging_dir: $StagingDir"
$md += ""
$md += "## Summary"
$md += ""
$md += "| Item | Count |"
$md += "|---|---:|"
$md += "| V3 rows | $($rows.Count) |"
$md += "| Promotion candidates | $($promotion.Count) |"
$md += "| Blocked static check | $($blocked.Count) |"
$md += "| Removed generated cache files/dirs | $($removed.Count) |"
$md += ""
$md += "## Target Area Counts"
$md += ""
$md += "| Target Area | Count |"
$md += "|---|---:|"
foreach ($g in ($finalPlan | Group-Object target_area | Sort-Object Name)) { $md += "| $($g.Name) | $($g.Count) |" }
$md += ""
$md += "## Policy"
$md += ""
$md += "- This is a final promotion plan only."
$md += "- It does not move files into src/."
$md += "- Manual review is required before final promotion."
$md += "- BLOCKED static-check files are excluded."
$md += "- Generated __pycache__ and *.pyc files are removed from staging."
$md -join "`r`n" | Set-Content -Encoding UTF8 -Path $mdPath

$wr = @()
$wr += "WORKER_REPORT_START"
$wr += "worker_id: SOURCE_FACTORY_CORE_FINAL_P0_PROMOTION_PLANNER_006"
$wr += "task_id: SOURCE_FACTORY_CORE_FINAL_P0_PROMOTION_PLAN"
$wr += "worker_function_class: PROMOTION_PLAN_WORKER / STAGING_CLEANUP_WORKER"
$wr += "files_created:"
$wr += "  - reports/SF_CORE_FINAL_P0_PROMOTION_PLAN.md"
$wr += "  - reports/SF_CORE_FINAL_P0_PROMOTION_PLAN.json"
$wr += "  - reports/SF_CORE_FINAL_P0_PROMOTION_PLAN.csv"
$wr += "  - reports/SF_CORE_FINAL_P0_BLOCKED_STATIC_CHECK.csv"
$wr += "  - reports/SF_CORE_STAGING_CLEANUP_REPORT.json"
$wr += "  - WORKER_REPORT_006.md"
$wr += "files_modified: []"
$wr += "patch_requests_created: []"
$wr += "report_only_artifacts:"
$wr += "  - final P0 promotion plan"
$wr += "  - generated cache cleanup report"
$wr += "tests_run:"
$wr += "  - V3 result CSV read"
$wr += "  - promotion candidate filtering"
$wr += "  - generated cache cleanup"
$wr += "tests_not_run:"
$wr += "  - final src promotion"
$wr += "  - manual code review"
$wr += "  - runtime execution"
$wr += "class_contract_status: READY_FOR_COMMANDER_REVIEW"
$wr += "priority_0_status: FINAL_P0_PROMOTION_PLAN_CREATED"
$wr += "known_risks:"
$wr += "  - promotion candidates still need manual review"
$wr += "  - staging includes prompt/report files as well as source files"
$wr += "next_needed:"
$wr += "  - review final promotion plan"
$wr += "  - promote approved runtime modules into src/"
$wr += "WORKER_REPORT_END"
$wr -join "`r`n" | Set-Content -Encoding UTF8 -Path $wrPath

Write-Host "SOURCE_FACTORY_FINAL_P0_PROMOTION_PLAN_COMPLETE"
Write-Host "StagingDir=$StagingDir"
Write-Host "PromotionCandidates=$($promotion.Count)"
Write-Host "Blocked=$($blocked.Count)"
Write-Host "RemovedGeneratedCache=$($removed.Count)"
Write-Host "PlanCsv=$planCsv"
