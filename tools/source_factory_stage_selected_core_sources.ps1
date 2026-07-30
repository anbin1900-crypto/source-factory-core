<#
SOURCE_FACTORY_STAGE_SELECTED_CORE_SOURCES.ps1

Purpose:
  Stage selected P0 reusable Source Factory source files into the source-factory-core repository.
  This consumes SF_CORE_P0_STAGING_PLAN.csv and copies only selected safe candidates into a staging folder.

Safety:
  - Does not modify original source files.
  - Does not promote files directly to src/.
  - Does not copy BLOCK_REVIEW files.
  - Does not copy DRIVE_POINTER_ONLY files.
  - Writes copied files under _staging/ only.

Default input:
  .\runs\local_source_inventory_20260730_172125\reports\SF_CORE_P0_STAGING_PLAN.csv

Outputs:
  _staging/p0_core_import_YYYYMMDD_HHMMSS/
    source_files/**
    STAGED_SOURCE_MANIFEST.csv
    STAGED_SOURCE_MANIFEST.json
    STAGED_SOURCE_SUMMARY.md
    WORKER_REPORT_004.md
#>

param(
  [string]$InventoryRunDir = "",
  [string]$OutputRoot = "",
  [int]$MaxFiles = 240
)

$ErrorActionPreference = "Stop"

function Get-LatestInventoryRunDir {
  $runsRoot = ".\runs"
  if (-not (Test-Path -LiteralPath $runsRoot)) {
    throw "runs directory not found. Run inventory and staging plan first."
  }
  $dirs = Get-ChildItem -LiteralPath $runsRoot -Directory -Filter "local_source_inventory_*" | Sort-Object LastWriteTime -Descending
  if ($dirs.Count -eq 0) {
    throw "local_source_inventory_* directory not found."
  }
  return $dirs[0].FullName
}

function Get-FileSha256 {
  param([string]$Path)
  try { return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant() } catch { return $null }
}

function Convert-ToSafeRelativePath {
  param([string]$SourcePath)
  $safe = $SourcePath
  $safe = $safe -replace ':', ''
  $safe = $safe -replace '\\', '/'
  $safe = $safe -replace '^/+', ''
  $safe = $safe -replace '[^A-Za-z0-9._/ -]', '_'
  $safe = $safe -replace ' ', '_'
  return $safe
}

function Get-RowValue {
  param([object]$Row, [string[]]$Names)
  foreach ($name in $Names) {
    if ($Row.PSObject.Properties.Name -contains $name) {
      return $Row.$name
    }
  }
  return $null
}

if ([string]::IsNullOrWhiteSpace($InventoryRunDir)) {
  $InventoryRunDir = Get-LatestInventoryRunDir
}

$reportsDir = Join-Path $InventoryRunDir "reports"
$planCsv = Join-Path $reportsDir "SF_CORE_P0_STAGING_PLAN.csv"
if (-not (Test-Path -LiteralPath $planCsv)) {
  throw "P0 staging plan CSV not found: $planCsv"
}

if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
  $OutputRoot = Join-Path "._staging" "p0_core_import_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
  $OutputRoot = $OutputRoot -replace '^\.','.'
}

$sourceOutDir = Join-Path $OutputRoot "source_files"
New-Item -ItemType Directory -Force -Path $sourceOutDir | Out-Null

$rows = @(Import-Csv -LiteralPath $planCsv)

# Accept either explicit selected rows or all rows in this staging CSV when no decision field exists.
$selectedRows = @()
foreach ($row in $rows) {
  $sourcePath = Get-RowValue -Row $row -Names @("source_path", "SourcePath", "path")
  $reuseDecision = Get-RowValue -Row $row -Names @("reuse_decision", "ReuseDecision")
  $stageDecision = Get-RowValue -Row $row -Names @("stage_decision", "StageDecision", "staging_decision")
  $storageTarget = Get-RowValue -Row $row -Names @("storage_target", "StorageTarget")
  if ([string]::IsNullOrWhiteSpace($sourcePath)) { continue }

  $decisionText = (($reuseDecision, $stageDecision, $storageTarget) -join " ").ToUpperInvariant()
  if ($decisionText.Contains("BLOCK_REVIEW")) { continue }
  if ($decisionText.Contains("DRIVE_POINTER")) { continue }
  if ($decisionText.Contains("SECRET")) { continue }
  if ($decisionText.Contains("NAME_RISK")) { continue }

  $isSelected = $true
  if ($stageDecision -and -not ($stageDecision.ToString().ToUpperInvariant().Contains("SELECT") -or $stageDecision.ToString().ToUpperInvariant().Contains("STAGE"))) {
    $isSelected = $false
  }
  if ($isSelected) { $selectedRows += $row }
}

if ($selectedRows.Count -gt $MaxFiles) {
  $selectedRows = @($selectedRows | Select-Object -First $MaxFiles)
}

$manifest = @()
$copyFailures = @()
$copiedCount = 0
$skippedCount = 0

foreach ($row in $selectedRows) {
  $sourcePath = Get-RowValue -Row $row -Names @("source_path", "SourcePath", "path")
  $expectedSha = Get-RowValue -Row $row -Names @("sha256", "SHA256", "sha")
  $category = Get-RowValue -Row $row -Names @("category", "Category")
  $fileName = Get-RowValue -Row $row -Names @("file_name", "FileName")

  if (-not (Test-Path -LiteralPath $sourcePath)) {
    $copyFailures += [pscustomobject]@{ source_path=$sourcePath; reason="SOURCE_NOT_FOUND" }
    $skippedCount++
    continue
  }

  $safeRel = Convert-ToSafeRelativePath -SourcePath $sourcePath
  $destPath = Join-Path $sourceOutDir $safeRel
  $destDir = Split-Path -Parent $destPath
  New-Item -ItemType Directory -Force -Path $destDir | Out-Null

  try {
    Copy-Item -LiteralPath $sourcePath -Destination $destPath -Force
    $actualSha = Get-FileSha256 -Path $destPath
    $shaMatch = $false
    if ($expectedSha -and $actualSha) { $shaMatch = ($expectedSha.ToString().ToLowerInvariant() -eq $actualSha.ToString().ToLowerInvariant()) }
    $copiedCount++
    $manifest += [pscustomobject]@{
      source_path = $sourcePath
      staged_path = $destPath
      file_name = $fileName
      category = $category
      expected_sha256 = $expectedSha
      staged_sha256 = $actualSha
      sha_match = $shaMatch
      size_bytes = (Get-Item -LiteralPath $destPath).Length
    }
  } catch {
    $copyFailures += [pscustomobject]@{ source_path=$sourcePath; reason=$_.Exception.Message }
    $skippedCount++
  }
}

$manifestCsv = Join-Path $OutputRoot "STAGED_SOURCE_MANIFEST.csv"
$manifestJson = Join-Path $OutputRoot "STAGED_SOURCE_MANIFEST.json"
$summaryMd = Join-Path $OutputRoot "STAGED_SOURCE_SUMMARY.md"
$workerReport = Join-Path $OutputRoot "WORKER_REPORT_004.md"

$manifest | Sort-Object category, staged_path | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $manifestCsv

$summary = [pscustomobject]@{
  generated_at = (Get-Date).ToString("o")
  inventory_run_dir = $InventoryRunDir
  plan_csv = $planCsv
  output_root = $OutputRoot
  selected_rows = $selectedRows.Count
  copied_count = $copiedCount
  skipped_count = $skippedCount
  copy_failures = $copyFailures
  category_counts = @($manifest | Group-Object category | Sort-Object Name | ForEach-Object { [pscustomobject]@{ category=$_.Name; count=$_.Count } })
  files = $manifest
}
$summary | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 -Path $manifestJson

$md = @()
$md += "# Source Factory Selected P0 Core Source Staging"
$md += ""
$md += "generated_at: $((Get-Date).ToString('o'))"
$md += "inventory_run_dir: $InventoryRunDir"
$md += "output_root: $OutputRoot"
$md += ""
$md += "## Summary"
$md += ""
$md += "| Item | Count |"
$md += "|---|---:|"
$md += "| Selected rows | $($selectedRows.Count) |"
$md += "| Copied files | $copiedCount |"
$md += "| Skipped files | $skippedCount |"
$md += "| Copy failures | $($copyFailures.Count) |"
$md += ""
$md += "## Category Counts"
$md += ""
$md += "| Category | Count |"
$md += "|---|---:|"
foreach ($g in ($manifest | Group-Object category | Sort-Object Name)) { $md += "| $($g.Name) | $($g.Count) |" }
$md += ""
$md += "## Policy"
$md += ""
$md += "- This is staging only, not final src promotion."
$md += "- Review staged files before moving them to src/."
$md += "- Do not stage BLOCK_REVIEW or DRIVE_POINTER files."
$md += "- Run static checks before promotion."
$md -join "`r`n" | Set-Content -Encoding UTF8 -Path $summaryMd

$wr = @()
$wr += "WORKER_REPORT_START"
$wr += "worker_id: SOURCE_FACTORY_CORE_SELECTED_P0_STAGING_WORKER_004"
$wr += "task_id: SOURCE_FACTORY_SELECTED_P0_CORE_SOURCE_STAGING"
$wr += "worker_function_class: LOCAL_COPY_STAGING_WORKER / SOURCE_MIGRATION_WORKER"
$wr += "files_created:"
$wr += "  - _staging/p0_core_import_*/source_files/**"
$wr += "  - _staging/p0_core_import_*/STAGED_SOURCE_MANIFEST.csv"
$wr += "  - _staging/p0_core_import_*/STAGED_SOURCE_MANIFEST.json"
$wr += "  - _staging/p0_core_import_*/STAGED_SOURCE_SUMMARY.md"
$wr += "  - _staging/p0_core_import_*/WORKER_REPORT_004.md"
$wr += "files_modified: []"
$wr += "patch_requests_created: []"
$wr += "report_only_artifacts:"
$wr += "  - staged selected P0 core source files"
$wr += "  - staging manifest with SHA parity"
$wr += "tests_run:"
$wr += "  - source existence check"
$wr += "  - copy operation"
$wr += "  - staged SHA-256 readback"
$wr += "tests_not_run:"
$wr += "  - final src promotion"
$wr += "  - compile/static check"
$wr += "  - Google Drive upload"
$wr += "class_contract_status: READY_FOR_COMMANDER_REVIEW"
$wr += "priority_0_status: SELECTED_P0_SOURCE_STAGED_IF_COPIED_COUNT_GT_0"
$wr += "known_risks:"
$wr += "  - staging still requires manual review"
$wr += "  - heuristic secret scan is not exhaustive"
$wr += "next_needed:"
$wr += "  - review staged manifest"
$wr += "  - commit _staging folder only if size is acceptable"
$wr += "  - run 005 static check and promotion plan"
$wr += "WORKER_REPORT_END"
$wr -join "`r`n" | Set-Content -Encoding UTF8 -Path $workerReport

Write-Host "SOURCE_FACTORY_SELECTED_P0_CORE_SOURCE_STAGING_COMPLETE"
Write-Host "InventoryRunDir=$InventoryRunDir"
Write-Host "OutputRoot=$OutputRoot"
Write-Host "SelectedRows=$($selectedRows.Count)"
Write-Host "CopiedCount=$copiedCount"
Write-Host "SkippedCount=$skippedCount"
Write-Host "ManifestCsv=$manifestCsv"
