<#
SOURCE_FACTORY_LOCAL_INVENTORY_SCAN.ps1

Purpose:
  Read-only inventory scanner for Source Factory / YOLLA local reusable source migration.
  It scans local roots, classifies source files, computes SHA-256, detects large artifacts,
  and writes reports for GitHub / Google Drive migration.

Default roots:
  D:\SOURCE FACTORY
  E:\YOLLA

Outputs:
  reports/SF_CORE_SOURCE_INVENTORY_SCAN.md
  reports/SF_CORE_SOURCE_INVENTORY_SCAN.json
  reports/SF_CORE_SOURCE_INVENTORY_CANDIDATES.csv
  reports/SF_CORE_LARGE_ARTIFACT_POINTER_CANDIDATES.json
  WORKER_REPORT.md

Safety:
  - Read-only scan
  - No source modification
  - No delete/move/copy of source files
  - No production execution

Hotfix notes:
  - Classification uses ASCII-only Contains() checks instead of regex.
  - Uses ArrayList with explicit [void] Add() calls to avoid PowerShell Generic.List conversion failures.
#>

param(
  [string[]]$Roots = @("D:\SOURCE FACTORY", "E:\YOLLA"),
  [string]$OutputRoot = ".\runs\local_source_inventory_$(Get-Date -Format 'yyyyMMdd_HHmmss')",
  [int64]$LargeFileThresholdBytes = 100MB
)

$ErrorActionPreference = "Stop"

function Test-ContainsAny {
  param(
    [string]$Text,
    [string[]]$Needles
  )
  if ($null -eq $Text) { return $false }
  foreach ($needle in $Needles) {
    if ($Text.Contains($needle)) { return $true }
  }
  return $false
}

function Get-FileSha256 {
  param([string]$Path)
  try {
    return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
  } catch {
    return $null
  }
}

function Get-Category {
  param([string]$Path, [string]$Extension)
  $p = $Path.ToLowerInvariant()

  if (Test-ContainsAny -Text $p -Needles @("gpt", "browser", "window", "preload", "inject", "selector", "chatgpt")) {
    return "P0_GPT_BROWSER_BRIDGE"
  }

  if (Test-ContainsAny -Text $p -Needles @("commander", "worker", "receipt", "lineage", "wal", "executor", "dispatch", "claim", "agent")) {
    return "P0_PC_AGENT_ROUTING_CORE"
  }

  if (Test-ContainsAny -Text $p -Needles @("queue", "daily", "prompt", "sender", "runner")) {
    return "P0_DAILY_QUEUE_RUNNER"
  }

  if (Test-ContainsAny -Text $p -Needles @("sha", "manifest", "zip", "verify", "artifact", "drive")) {
    return "P1_ARTIFACT_LEDGER_AND_DRIVE_POINTER"
  }

  if (Test-ContainsAny -Text $p -Needles @("opinet", "gas", "station", "petro", "kpetro", "oil", "fuel")) {
    return "P1_GAS_STATION_PORTAL_EXAMPLES"
  }

  if ($Extension -in @(".js", ".ts", ".mjs", ".cjs", ".py", ".ps1", ".bat", ".cmd")) {
    return "P1_REUSABLE_SOURCE_CANDIDATE"
  }

  if ($Extension -in @(".md", ".json", ".yaml", ".yml", ".csv")) {
    return "P2_DOC_LEDGER_OR_CONFIG"
  }

  return "P3_ARCHIVE_OR_REVIEW_ONLY"
}

function Get-StorageTarget {
  param([int64]$Size, [string]$Extension)
  if ($Size -ge $LargeFileThresholdBytes) { return "GOOGLE_DRIVE_POINTER" }
  if ($Extension -in @(".zip", ".7z", ".rar", ".gz", ".db", ".sqlite", ".bak", ".dump")) { return "GOOGLE_DRIVE_POINTER_OR_GITHUB_IF_SMALL" }
  return "GITHUB_SOURCE_REPO"
}

New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null
$reportsDir = Join-Path $OutputRoot "reports"
New-Item -ItemType Directory -Force -Path $reportsDir | Out-Null

$includeExtensions = @(
  ".js", ".mjs", ".cjs", ".ts", ".tsx",
  ".py", ".ps1", ".bat", ".cmd",
  ".md", ".json", ".yaml", ".yml",
  ".html", ".css", ".sql", ".csv", ".txt",
  ".zip", ".7z", ".gz", ".db", ".sqlite", ".dump", ".bak"
)

$excludeDirTokens = @("\node_modules\", "\.git\", "\dist\", "\build\", "\coverage\", "\.next\")

$items = New-Object System.Collections.ArrayList
$missingRoots = New-Object System.Collections.ArrayList

foreach ($root in $Roots) {
  if (-not (Test-Path -LiteralPath $root)) {
    [void]$missingRoots.Add($root)
    continue
  }

  Get-ChildItem -LiteralPath $root -Recurse -File -Force -ErrorAction SilentlyContinue | ForEach-Object {
    $full = $_.FullName
    $fullLower = $full.ToLowerInvariant()

    $skip = $false
    foreach ($token in $excludeDirTokens) {
      if ($fullLower.Contains($token)) {
        $skip = $true
        break
      }
    }
    if ($skip) { return }

    $ext = $_.Extension.ToLowerInvariant()
    if ($includeExtensions -notcontains $ext) { return }

    $sha = Get-FileSha256 -Path $full
    $category = Get-Category -Path $full -Extension $ext
    $storage = Get-StorageTarget -Size $_.Length -Extension $ext

    [void]$items.Add([pscustomobject]@{
      source_path = $full
      file_name = $_.Name
      extension = $ext
      size_bytes = [int64]$_.Length
      sha256 = $sha
      category = $category
      storage_target = $storage
      last_write_time = $_.LastWriteTime.ToString("o")
      root = $root
    })
  }
}

$itemsArray = @()
foreach ($item in $items) { $itemsArray += $item }

$missingRootsArray = @()
foreach ($missingRoot in $missingRoots) { $missingRootsArray += $missingRoot }

$large = @($itemsArray | Where-Object { $_.storage_target -like "GOOGLE_DRIVE*" })
$githubCandidates = @($itemsArray | Where-Object { $_.storage_target -eq "GITHUB_SOURCE_REPO" })

$csvPath = Join-Path $reportsDir "SF_CORE_SOURCE_INVENTORY_CANDIDATES.csv"
$jsonPath = Join-Path $reportsDir "SF_CORE_SOURCE_INVENTORY_SCAN.json"
$largePath = Join-Path $reportsDir "SF_CORE_LARGE_ARTIFACT_POINTER_CANDIDATES.json"
$mdPath = Join-Path $reportsDir "SF_CORE_SOURCE_INVENTORY_SCAN.md"
$workerReportPath = Join-Path $OutputRoot "WORKER_REPORT.md"

$itemsArray | Sort-Object category, source_path | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $csvPath

$summary = [pscustomobject]@{
  generated_at = (Get-Date).ToString("o")
  roots = $Roots
  missing_roots = $missingRootsArray
  total_files = $itemsArray.Count
  github_candidate_count = $githubCandidates.Count
  large_or_binary_pointer_count = $large.Count
  categories = @($itemsArray | Group-Object category | Sort-Object Name | ForEach-Object { [pscustomobject]@{ category=$_.Name; count=$_.Count } })
  storage_targets = @($itemsArray | Group-Object storage_target | Sort-Object Name | ForEach-Object { [pscustomobject]@{ storage_target=$_.Name; count=$_.Count } })
  files = $itemsArray
}
$summary | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 -Path $jsonPath

$largeSummary = [pscustomobject]@{
  generated_at = (Get-Date).ToString("o")
  threshold_bytes = $LargeFileThresholdBytes
  drive_pointer_required = $large
}
$largeSummary | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 -Path $largePath

$md = @()
$md += "# Source Factory Core Local Source Inventory Scan"
$md += ""
$md += "generated_at: $((Get-Date).ToString('o'))"
$md += ""
$md += "## Summary"
$md += ""
$md += "| Item | Count |"
$md += "|---|---:|"
$md += "| Total scanned files | $($itemsArray.Count) |"
$md += "| GitHub source candidates | $($githubCandidates.Count) |"
$md += "| Google Drive pointer candidates | $($large.Count) |"
$md += "| Missing roots | $($missingRootsArray.Count) |"
$md += ""
$md += "## Missing Roots"
$md += ""
if ($missingRootsArray.Count -eq 0) { $md += "None" } else { foreach ($r in $missingRootsArray) { $md += "- $r" } }
$md += ""
$md += "## Category Counts"
$md += ""
$md += "| Category | Count |"
$md += "|---|---:|"
foreach ($g in ($itemsArray | Group-Object category | Sort-Object Name)) { $md += "| $($g.Name) | $($g.Count) |" }
$md += ""
$md += "## Storage Target Counts"
$md += ""
$md += "| Storage Target | Count |"
$md += "|---|---:|"
foreach ($g in ($itemsArray | Group-Object storage_target | Sort-Object Name)) { $md += "| $($g.Name) | $($g.Count) |" }
$md += ""
$md += "## Next Needed"
$md += ""
$md += "1. Review SF_CORE_SOURCE_INVENTORY_CANDIDATES.csv."
$md += "2. Commit small reusable source files to source-factory-core."
$md += "3. Upload large artifacts to Google Drive."
$md += "4. Record Drive pointers in registry."
$md += "5. Promote only verified reusable modules to src/."
$md -join "`r`n" | Set-Content -Encoding UTF8 -Path $mdPath

$wr = @()
$wr += "WORKER_REPORT_START"
$wr += "worker_id: SOURCE_FACTORY_CORE_LOCAL_SOURCE_INVENTORY_WORKER_01"
$wr += "task_id: SOURCE_FACTORY_CORE_LOCAL_SOURCE_INVENTORY_SCAN"
$wr += "worker_function_class: READ_ONLY_INVENTORY_WORKER / SOURCE_MIGRATION_WORKER"
$wr += "files_created:"
$wr += "  - reports/SF_CORE_SOURCE_INVENTORY_SCAN.md"
$wr += "  - reports/SF_CORE_SOURCE_INVENTORY_SCAN.json"
$wr += "  - reports/SF_CORE_SOURCE_INVENTORY_CANDIDATES.csv"
$wr += "  - reports/SF_CORE_LARGE_ARTIFACT_POINTER_CANDIDATES.json"
$wr += "  - WORKER_REPORT.md"
$wr += "files_modified: []"
$wr += "patch_requests_created: []"
$wr += "report_only_artifacts:"
$wr += "  - read-only local source inventory"
$wr += "  - GitHub source candidates"
$wr += "  - Google Drive pointer candidates"
$wr += "tests_run:"
$wr += "  - source root existence scan"
$wr += "  - file metadata collection"
$wr += "  - SHA-256 calculation"
$wr += "  - storage target classification"
$wr += "tests_not_run:"
$wr += "  - source code compile"
$wr += "  - runtime execution"
$wr += "  - GitHub upload"
$wr += "  - Google Drive upload"
$wr += "class_contract_status: READY_FOR_COMMANDER_REVIEW"
$wr += "priority_0_status: SOURCE_INVENTORY_SCAN_COMPLETE_IF_TOTAL_FILES_GT_0"
$wr += "known_risks:"
$wr += "  - heuristic classification only"
$wr += "  - secrets are not automatically redacted"
$wr += "  - large files require Google Drive upload outside this script"
$wr += "next_needed:"
$wr += "  - submit generated reports to Commander"
$wr += "  - run dedicated secret scan before public release"
$wr += "WORKER_REPORT_END"
$wr -join "`r`n" | Set-Content -Encoding UTF8 -Path $workerReportPath

Write-Host "SOURCE_FACTORY_LOCAL_INVENTORY_SCAN_COMPLETE"
Write-Host "OutputRoot=$OutputRoot"
Write-Host "TotalFiles=$($itemsArray.Count)"
Write-Host "GitHubCandidates=$($githubCandidates.Count)"
Write-Host "DrivePointerCandidates=$($large.Count)"
