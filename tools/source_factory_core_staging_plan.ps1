<#
SOURCE_FACTORY_CORE_STAGING_PLAN.ps1

Purpose:
  Stage 003 planner for Source Factory Core migration.
  It consumes the 002 reuse upload plan and creates a safe staging plan for P0 core candidates.

Safety:
  - Read-only analysis
  - Does not copy source files
  - Does not upload source files
  - Does not modify local source files
  - Blocks secret/name-risk and Drive pointer files

Outputs:
  - reports/SF_CORE_P0_STAGING_PLAN.md
  - reports/SF_CORE_P0_STAGING_PLAN.json
  - reports/SF_CORE_P0_STAGING_PLAN.csv
  - reports/SF_CORE_BLOCKED_REVIEW_QUEUE.csv
  - WORKER_REPORT_003.md
#>

param(
  [string]$InventoryRunDir = "",
  [int]$MaxP0PerCategory = 80
)

$ErrorActionPreference = "Stop"

function Get-LatestInventoryRunDir {
  $runsRoot = ".\runs"
  if (-not (Test-Path -LiteralPath $runsRoot)) { throw "runs directory not found." }
  $dirs = Get-ChildItem -LiteralPath $runsRoot -Directory -Filter "local_source_inventory_*" | Sort-Object LastWriteTime -Descending
  if ($dirs.Count -eq 0) { throw "local_source_inventory_* directory not found." }
  return $dirs[0].FullName
}

function Get-StageTarget {
  param([string]$Category, [string]$SourcePath, [string]$FileName, [string]$Extension)
  $p = $SourcePath.ToLowerInvariant()
  $safeName = $FileName

  if ($Category -eq "P0_PC_AGENT_ROUTING_CORE") {
    if ($p.Contains("receipt")) { return "staging/p0_pc_agent_routing/receipt/$safeName" }
    if ($p.Contains("executor")) { return "staging/p0_pc_agent_routing/executor/$safeName" }
    if ($p.Contains("commander") -or $p.Contains("worker")) { return "staging/p0_pc_agent_routing/worker_commander/$safeName" }
    return "staging/p0_pc_agent_routing/misc/$safeName"
  }

  if ($Category -eq "P0_GPT_BROWSER_BRIDGE") {
    if ($p.Contains("preload")) { return "staging/p0_gpt_browser_bridge/preload/$safeName" }
    if ($p.Contains("window")) { return "staging/p0_gpt_browser_bridge/window/$safeName" }
    if ($p.Contains("collector") -or $p.Contains("output")) { return "staging/p0_gpt_browser_bridge/collector/$safeName" }
    return "staging/p0_gpt_browser_bridge/misc/$safeName"
  }

  if ($Category -eq "P0_DAILY_QUEUE_RUNNER") {
    if ($p.Contains("queue")) { return "staging/p0_daily_queue_runner/queue/$safeName" }
    if ($p.Contains("sender")) { return "staging/p0_daily_queue_runner/sender/$safeName" }
    if ($p.Contains("runner")) { return "staging/p0_daily_queue_runner/runner/$safeName" }
    return "staging/p0_daily_queue_runner/misc/$safeName"
  }

  return "staging/review/$safeName"
}

if ([string]::IsNullOrWhiteSpace($InventoryRunDir)) { $InventoryRunDir = Get-LatestInventoryRunDir }

$reportsDir = Join-Path $InventoryRunDir "reports"
$planCsv = Join-Path $reportsDir "SF_CORE_REUSE_UPLOAD_PLAN.csv"
if (-not (Test-Path -LiteralPath $planCsv)) { throw "Reuse upload plan not found: $planCsv" }

$rows = @(Import-Csv -LiteralPath $planCsv)
$p0 = @($rows | Where-Object { $_.reuse_decision -eq "PROMOTE_TO_CORE_CANDIDATE" })
$blocked = @($rows | Where-Object { $_.reuse_decision -like "BLOCK_REVIEW*" })
$drive = @($rows | Where-Object { $_.reuse_decision -eq "DRIVE_POINTER_ONLY" })
$review = @($rows | Where-Object { $_.reuse_decision -eq "REVIEW_FOR_REUSE" -or $_.reuse_decision -eq "DOC_OR_CONFIG_REVIEW" })

$selected = @()
foreach ($category in @("P0_PC_AGENT_ROUTING_CORE", "P0_GPT_BROWSER_BRIDGE", "P0_DAILY_QUEUE_RUNNER")) {
  $categoryRows = @($p0 | Where-Object { $_.category -eq $category } | Sort-Object size_bytes, source_path | Select-Object -First $MaxP0PerCategory)
  foreach ($row in $categoryRows) {
    $selected += [pscustomobject]@{
      source_path = $row.source_path
      file_name = $row.file_name
      extension = $row.extension
      size_bytes = [int64]$row.size_bytes
      sha256 = $row.sha256
      category = $row.category
      reuse_decision = $row.reuse_decision
      stage_target = Get-StageTarget -Category $row.category -SourcePath $row.source_path -FileName $row.file_name -Extension $row.extension
      action = "STAGE_AFTER_MANUAL_REVIEW"
    }
  }
}

$stagingCsv = Join-Path $reportsDir "SF_CORE_P0_STAGING_PLAN.csv"
$stagingJson = Join-Path $reportsDir "SF_CORE_P0_STAGING_PLAN.json"
$stagingMd = Join-Path $reportsDir "SF_CORE_P0_STAGING_PLAN.md"
$blockedCsv = Join-Path $reportsDir "SF_CORE_BLOCKED_REVIEW_QUEUE.csv"
$wrPath = Join-Path $InventoryRunDir "WORKER_REPORT_003.md"

$selected | Sort-Object category, stage_target | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $stagingCsv
$blocked | Sort-Object category, source_path | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $blockedCsv

$summary = [pscustomobject]@{
  generated_at = (Get-Date).ToString("o")
  inventory_run_dir = $InventoryRunDir
  total_rows = $rows.Count
  p0_candidate_count = $p0.Count
  selected_stage_count = $selected.Count
  blocked_review_count = $blocked.Count
  drive_pointer_count = $drive.Count
  review_for_reuse_count = $review.Count
  selected_by_category = @($selected | Group-Object category | Sort-Object Name | ForEach-Object { [pscustomobject]@{ category=$_.Name; count=$_.Count } })
  staging_plan = $selected
}
$summary | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 -Path $stagingJson

$md = @()
$md += "# Source Factory Core P0 Staging Plan"
$md += ""
$md += "generated_at: $((Get-Date).ToString('o'))"
$md += "inventory_run_dir: $InventoryRunDir"
$md += ""
$md += "## Summary"
$md += ""
$md += "| Item | Count |"
$md += "|---|---:|"
$md += "| Total rows | $($rows.Count) |"
$md += "| P0 core candidates | $($p0.Count) |"
$md += "| Selected for first staging plan | $($selected.Count) |"
$md += "| Blocked review queue | $($blocked.Count) |"
$md += "| Drive pointer only | $($drive.Count) |"
$md += "| Review for reuse / docs | $($review.Count) |"
$md += ""
$md += "## Selected by Category"
$md += ""
$md += "| Category | Count |"
$md += "|---|---:|"
foreach ($g in ($selected | Group-Object category | Sort-Object Name)) { $md += "| $($g.Name) | $($g.Count) |" }
$md += ""
$md += "## Policy"
$md += ""
$md += "- This script creates a staging plan only."
$md += "- It does not copy source files."
$md += "- Manual review is required before committing staged source."
$md += "- Public repository exposure must be checked before source upload."
$md += "- Blocked files must not be promoted until reviewed."
$md -join "`r`n" | Set-Content -Encoding UTF8 -Path $stagingMd

$wr = @()
$wr += "WORKER_REPORT_START"
$wr += "worker_id: SOURCE_FACTORY_CORE_P0_STAGING_PLANNER_WORKER_003"
$wr += "task_id: SOURCE_FACTORY_CORE_P0_STAGING_PLAN"
$wr += "worker_function_class: READ_ONLY_STAGING_PLANNER / CORE_MIGRATION_WORKER"
$wr += "files_created:"
$wr += "  - reports/SF_CORE_P0_STAGING_PLAN.md"
$wr += "  - reports/SF_CORE_P0_STAGING_PLAN.json"
$wr += "  - reports/SF_CORE_P0_STAGING_PLAN.csv"
$wr += "  - reports/SF_CORE_BLOCKED_REVIEW_QUEUE.csv"
$wr += "  - WORKER_REPORT_003.md"
$wr += "files_modified: []"
$wr += "patch_requests_created: []"
$wr += "report_only_artifacts:"
$wr += "  - P0 staging plan"
$wr += "  - blocked review queue"
$wr += "tests_run:"
$wr += "  - 002 reuse plan read"
$wr += "  - P0 category selection"
$wr += "  - stage target mapping"
$wr += "tests_not_run:"
$wr += "  - source copy"
$wr += "  - source upload"
$wr += "  - compile/static check"
$wr += "class_contract_status: READY_FOR_COMMANDER_REVIEW"
$wr += "priority_0_status: P0_STAGING_PLAN_COMPLETE_IF_SELECTED_STAGE_COUNT_GT_0"
$wr += "known_risks:"
$wr += "  - planning only"
$wr += "  - manual source review required"
$wr += "next_needed:"
$wr += "  - review staging plan"
$wr += "  - execute source copy only after approval"
$wr += "WORKER_REPORT_END"
$wr -join "`r`n" | Set-Content -Encoding UTF8 -Path $wrPath

Write-Host "SOURCE_FACTORY_CORE_P0_STAGING_PLAN_COMPLETE"
Write-Host "InventoryRunDir=$InventoryRunDir"
Write-Host "P0Candidates=$($p0.Count)"
Write-Host "SelectedStageCount=$($selected.Count)"
Write-Host "BlockedReviewCount=$($blocked.Count)"
Write-Host "StagingCsv=$stagingCsv"
