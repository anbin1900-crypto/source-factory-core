<#
SOURCE_FACTORY_SECRET_REUSE_CLASSIFIER.ps1

Purpose:
  Stage 002 scanner for Source Factory Core migration.
  It consumes the local inventory scan result, performs a heuristic secret/name-risk scan,
  and creates a reusable-source upload plan.

Safety:
  - Read-only scan of source candidates.
  - Does not copy source files.
  - Does not upload source files.
  - Does not modify source files.
  - Produces reports only.

Hotfix notes:
  - No hashtable regex pattern array.
  - No quote-heavy regex literals.
  - ASCII-only token scan for Windows PowerShell parser compatibility.
#>

param(
  [string]$InventoryRunDir = "",
  [int64]$MaxContentScanBytes = 2MB
)

$ErrorActionPreference = "Stop"

function Get-LatestInventoryRunDir {
  $runsRoot = ".\runs"
  if (-not (Test-Path -LiteralPath $runsRoot)) {
    throw "runs directory not found. Run source_factory_local_inventory_scan.ps1 first."
  }
  $dirs = Get-ChildItem -LiteralPath $runsRoot -Directory -Filter "local_source_inventory_*" | Sort-Object LastWriteTime -Descending
  if ($dirs.Count -eq 0) {
    throw "local_source_inventory_* directory not found. Run source_factory_local_inventory_scan.ps1 first."
  }
  return $dirs[0].FullName
}

function Test-TextExtension {
  param([string]$Extension)
  return ($Extension -in @(".js", ".mjs", ".cjs", ".ts", ".tsx", ".py", ".ps1", ".bat", ".cmd", ".md", ".json", ".yaml", ".yml", ".html", ".css", ".sql", ".csv", ".txt"))
}

function Test-ContainsAny {
  param(
    [string]$Text,
    [string[]]$Needles
  )
  foreach ($needle in $Needles) {
    if ($Text.Contains($needle)) { return $true }
  }
  return $false
}

function Get-NameRisk {
  param([string]$Path)
  $p = $Path.ToLowerInvariant()
  $tokens = @(".env", "secret", "secrets", "credential", "credentials", "token", "apikey", "api_key", "privatekey", "private_key", "id_rsa", "id_dsa", "id_ecdsa", "id_ed25519", "password", "passwd", "pat")
  return (Test-ContainsAny -Text $p -Needles $tokens)
}

function Find-SecretIndicators {
  param([string]$Path, [int64]$SizeBytes, [string]$Extension)

  $hits = @()

  if (-not (Test-TextExtension -Extension $Extension)) {
    return @("SKIPPED_NON_TEXT_EXTENSION")
  }

  if ($SizeBytes -gt $MaxContentScanBytes) {
    return @("SKIPPED_TOO_LARGE_FOR_CONTENT_SCAN")
  }

  try {
    $text = [System.IO.File]::ReadAllText($Path)
  } catch {
    return @("READ_FAILED")
  }

  $lower = $text.ToLowerInvariant()

  if (Test-ContainsAny -Text $text -Needles @("ghp_", "gho_", "ghu_", "ghs_", "ghr_")) { $hits += "GITHUB_TOKEN_PREFIX" }
  if ($text.Contains("github_pat_")) { $hits += "GITHUB_FINE_GRAINED_PAT_PREFIX" }
  if ($text.Contains("sk-")) { $hits += "OPENAI_STYLE_KEY_PREFIX" }
  if ($text.Contains("AKIA")) { $hits += "AWS_ACCESS_KEY_ID_PREFIX" }
  if ($text.Contains("AIza")) { $hits += "GOOGLE_API_KEY_PREFIX" }
  if ($lower.Contains("-----begin ") -and $lower.Contains("private key-----")) { $hits += "PRIVATE_KEY_BLOCK" }

  $assignmentTokens = @(
    "password=", "password:", "passwd=", "passwd:",
    "secret=", "secret:", "token=", "token:",
    "api_key=", "api_key:", "apikey=", "apikey:",
    "api-key=", "api-key:", "authorization: bearer"
  )
  if (Test-ContainsAny -Text $lower -Needles $assignmentTokens) { $hits += "GENERIC_SECRET_ASSIGNMENT_TOKEN" }

  return @($hits | Select-Object -Unique)
}

function Get-ReuseDecision {
  param(
    [string]$Category,
    [string]$StorageTarget,
    [bool]$NameRisk,
    [object[]]$SecretHits
  )

  if ($StorageTarget -like "GOOGLE_DRIVE*") { return "DRIVE_POINTER_ONLY" }
  if ($NameRisk) { return "BLOCK_REVIEW_NAME_RISK" }

  $blocking = @($SecretHits | Where-Object { $_ -notlike "SKIPPED_*" -and $_ -ne "READ_FAILED" })
  if ($blocking.Count -gt 0) { return "BLOCK_REVIEW_SECRET_INDICATOR" }

  if ($Category -in @("P0_PC_AGENT_ROUTING_CORE", "P0_GPT_BROWSER_BRIDGE", "P0_DAILY_QUEUE_RUNNER")) { return "PROMOTE_TO_CORE_CANDIDATE" }
  if ($Category -in @("P1_ARTIFACT_LEDGER_AND_DRIVE_POINTER", "P1_GAS_STATION_PORTAL_EXAMPLES", "P1_REUSABLE_SOURCE_CANDIDATE")) { return "REVIEW_FOR_REUSE" }
  if ($Category -eq "P2_DOC_LEDGER_OR_CONFIG") { return "DOC_OR_CONFIG_REVIEW" }
  return "ARCHIVE_OR_IGNORE"
}

if ([string]::IsNullOrWhiteSpace($InventoryRunDir)) {
  $InventoryRunDir = Get-LatestInventoryRunDir
}

$reportsDir = Join-Path $InventoryRunDir "reports"
$csvPath = Join-Path $reportsDir "SF_CORE_SOURCE_INVENTORY_CANDIDATES.csv"
if (-not (Test-Path -LiteralPath $csvPath)) {
  throw "Inventory CSV not found: $csvPath"
}

$inventory = @(Import-Csv -LiteralPath $csvPath)
$classified = @()
$secretFindings = @()

foreach ($row in $inventory) {
  $path = $row.source_path
  $ext = $row.extension
  $size = [int64]$row.size_bytes
  $category = $row.category
  $storage = $row.storage_target
  $nameRisk = Get-NameRisk -Path $path
  $hits = @()

  if ($storage -eq "GITHUB_SOURCE_REPO") {
    $hits = @(Find-SecretIndicators -Path $path -SizeBytes $size -Extension $ext)
  }

  $decision = Get-ReuseDecision -Category $category -StorageTarget $storage -NameRisk $nameRisk -SecretHits $hits
  $blockingHits = @($hits | Where-Object { $_ -notlike "SKIPPED_*" -and $_ -ne "READ_FAILED" })

  if ($nameRisk -or ($blockingHits.Count -gt 0)) {
    $secretFindings += [pscustomobject]@{
      source_path = $path
      file_name = $row.file_name
      category = $category
      size_bytes = $size
      name_risk = $nameRisk
      secret_indicators = ($hits -join ";")
      decision = $decision
    }
  }

  $classified += [pscustomobject]@{
    source_path = $path
    file_name = $row.file_name
    extension = $ext
    size_bytes = $size
    sha256 = $row.sha256
    category = $category
    storage_target = $storage
    name_risk = $nameRisk
    secret_indicators = ($hits -join ";")
    reuse_decision = $decision
  }
}

$planCsv = Join-Path $reportsDir "SF_CORE_REUSE_UPLOAD_PLAN.csv"
$planJson = Join-Path $reportsDir "SF_CORE_REUSE_UPLOAD_PLAN.json"
$secretJson = Join-Path $reportsDir "SF_CORE_SECRET_SCAN.json"
$secretMd = Join-Path $reportsDir "SF_CORE_SECRET_SCAN.md"
$wrPath = Join-Path $InventoryRunDir "WORKER_REPORT_002.md"

$classified | Sort-Object reuse_decision, category, source_path | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $planCsv

$planSummary = [pscustomobject]@{
  generated_at = (Get-Date).ToString("o")
  inventory_run_dir = $InventoryRunDir
  total_inventory_files = $inventory.Count
  total_classified = $classified.Count
  decision_counts = @($classified | Group-Object reuse_decision | Sort-Object Name | ForEach-Object { [pscustomobject]@{ decision=$_.Name; count=$_.Count } })
  category_counts = @($classified | Group-Object category | Sort-Object Name | ForEach-Object { [pscustomobject]@{ category=$_.Name; count=$_.Count } })
  plan = $classified
}
$planSummary | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 -Path $planJson

$secretSummary = [pscustomobject]@{
  generated_at = (Get-Date).ToString("o")
  inventory_run_dir = $InventoryRunDir
  total_findings = $secretFindings.Count
  findings = $secretFindings
}
$secretSummary | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 -Path $secretJson

$md = @()
$md += "# Source Factory Core Secret Scan and Reuse Classification"
$md += ""
$md += "generated_at: $((Get-Date).ToString('o'))"
$md += "inventory_run_dir: $InventoryRunDir"
$md += ""
$md += "## Summary"
$md += ""
$md += "| Item | Count |"
$md += "|---|---:|"
$md += "| Total inventory files | $($inventory.Count) |"
$md += "| Total classified | $($classified.Count) |"
$md += "| Secret/name-risk findings | $($secretFindings.Count) |"
$md += ""
$md += "## Decision Counts"
$md += ""
$md += "| Decision | Count |"
$md += "|---|---:|"
foreach ($g in ($classified | Group-Object reuse_decision | Sort-Object Name)) { $md += "| $($g.Name) | $($g.Count) |" }
$md += ""
$md += "## Policy"
$md += ""
$md += "- Do not upload BLOCK_REVIEW files until manually reviewed."
$md += "- Store DRIVE_POINTER_ONLY artifacts in Google Drive and commit only pointer metadata."
$md += "- Promote only PROMOTE_TO_CORE_CANDIDATE after secret review and compile/static check."
$md += "- Gas station portal examples are reusable examples, not core runtime until reviewed."
$md -join "`r`n" | Set-Content -Encoding UTF8 -Path $secretMd

$wr = @()
$wr += "WORKER_REPORT_START"
$wr += "worker_id: SOURCE_FACTORY_CORE_SECRET_REUSE_CLASSIFIER_WORKER_002"
$wr += "task_id: SOURCE_FACTORY_CORE_SECRET_AND_REUSE_CLASSIFICATION"
$wr += "worker_function_class: READ_ONLY_SECRET_SCAN_WORKER / REUSE_CLASSIFIER_WORKER"
$wr += "files_created:"
$wr += "  - reports/SF_CORE_SECRET_SCAN.md"
$wr += "  - reports/SF_CORE_SECRET_SCAN.json"
$wr += "  - reports/SF_CORE_REUSE_UPLOAD_PLAN.csv"
$wr += "  - reports/SF_CORE_REUSE_UPLOAD_PLAN.json"
$wr += "  - WORKER_REPORT_002.md"
$wr += "files_modified: []"
$wr += "patch_requests_created: []"
$wr += "report_only_artifacts:"
$wr += "  - secret/name-risk report"
$wr += "  - reusable source upload plan"
$wr += "tests_run:"
$wr += "  - inventory CSV read"
$wr += "  - heuristic secret/name indicator scan"
$wr += "  - reuse decision classification"
$wr += "tests_not_run:"
$wr += "  - source copy"
$wr += "  - source upload"
$wr += "  - compile/static check"
$wr += "  - Google Drive upload"
$wr += "class_contract_status: READY_FOR_COMMANDER_REVIEW"
$wr += "priority_0_status: SECRET_SCAN_AND_REUSE_CLASSIFICATION_COMPLETE_IF_TOTAL_CLASSIFIED_GT_0"
$wr += "known_risks:"
$wr += "  - heuristic scan only"
$wr += "  - manual review required before public upload"
$wr += "  - false positives and false negatives possible"
$wr += "next_needed:"
$wr += "  - review BLOCK_REVIEW files"
$wr += "  - run 003 core source staging after approval"
$wr += "WORKER_REPORT_END"
$wr -join "`r`n" | Set-Content -Encoding UTF8 -Path $wrPath

Write-Host "SOURCE_FACTORY_SECRET_REUSE_CLASSIFICATION_COMPLETE"
Write-Host "InventoryRunDir=$InventoryRunDir"
Write-Host "TotalClassified=$($classified.Count)"
Write-Host "SecretOrNameRiskFindings=$($secretFindings.Count)"
Write-Host "PlanCsv=$planCsv"
