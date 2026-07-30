<#
SOURCE_FACTORY_PROMOTE_FINAL_P0_TO_SRC_IMPORT.ps1

Stage 007 helper for Source Factory Core migration.
It consumes the final P0 promotion candidate plan and copies approved candidates
into src_import/ for Commander review. It does not overwrite src/ and does not
promote directly into runtime core.

Inputs:
  _staging/p0_core_import_*/reports/SF_CORE_FINAL_P0_PROMOTION_CANDIDATES.csv

Outputs:
  src_import/p0_core_import_YYYYMMDD_HHMMSS/
    PROMOTED_SOURCE_MANIFEST.csv
    PROMOTED_SOURCE_MANIFEST.json
    PROMOTED_SOURCE_SUMMARY.md
    WORKER_REPORT_007.md
    source_files/...

Safety:
  - Copy only FINAL_PROMOTION_CANDIDATE rows.
  - Do not copy BLOCKED_REVIEW_REQUIRED rows.
  - Do not write to src/.
  - Do not delete staging files.
#>

param(
  [string]$StagingDir = ".\_staging\p0_core_import_20260730_174852",
  [string]$OutputRoot = ".\src_import\p0_core_import_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
)

$ErrorActionPreference = "Stop"

function Get-FileSha256 {
  param([string]$Path)
  try { return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant() } catch { return $null }
}

function Get-Prop {
  param([object]$Row, [string[]]$Names)
  foreach ($n in $Names) {
    $p = $Row.PSObject.Properties[$n]
    if ($null -ne $p -and -not [string]::IsNullOrWhiteSpace([string]$p.Value)) { return [string]$p.Value }
  }
  return ""
}

function Safe-Name {
  param([string]$Name)
  $s = $Name
  foreach ($c in [System.IO.Path]::GetInvalidFileNameChars()) { $s = $s.Replace([string]$c, "_") }
  if ([string]::IsNullOrWhiteSpace($s)) { return "unknown" }
  return $s
}

function Safe-Category {
  param([string]$Category)
  if ([string]::IsNullOrWhiteSpace($Category)) { return "misc" }
  $c = $Category.ToLowerInvariant()
  if ($c.Contains("daily") -or $c.Contains("queue") -or $c.Contains("prompt") -or $c.Contains("runner")) { return "daily_queue_runner" }
  if ($c.Contains("browser") -or $c.Contains("gpt") -or $c.Contains("window") -or $c.Contains("selector")) { return "gpt_browser_bridge" }
  if ($c.Contains("agent") -or $c.Contains("worker") -or $c.Contains("commander") -or $c.Contains("receipt") -or $c.Contains("lineage")) { return "pc_agent_routing" }
  return (Safe-Name $Category)
}

function Resolve-CandidatePath {
  param([string]$RawPath)
  if ([string]::IsNullOrWhiteSpace($RawPath)) { return $null }

  $candidates = New-Object System.Collections.Generic.List[string]
  [void]$candidates.Add($RawPath)
  [void]$candidates.Add($RawPath.Replace("._staging", "._staging"))
  [void]$candidates.Add($RawPath.Replace("._staging", "_staging"))
  [void]$candidates.Add($RawPath.Replace(".\._staging", ".\_staging"))
  [void]$candidates.Add($RawPath.Replace("./._staging", "./_staging"))

  foreach ($c in $candidates) {
    try {
      if (Test-Path -LiteralPath $c) { return (Resolve-Path -LiteralPath $c).Path }
    } catch {}
    try {
      $joined = Join-Path (Get-Location).Path $c
      if (Test-Path -LiteralPath $joined) { return (Resolve-Path -LiteralPath $joined).Path }
    } catch {}
  }

  return $null
}

$stagingRoot = (Resolve-Path -LiteralPath $StagingDir).Path
$reportsDir = Join-Path $stagingRoot "reports"
$candidateCsv = Join-Path $reportsDir "SF_CORE_FINAL_P0_PROMOTION_CANDIDATES.csv"
if (-not (Test-Path -LiteralPath $candidateCsv)) {
  $found = @(Get-ChildItem -LiteralPath $stagingRoot -Recurse -File -Filter "SF_CORE_FINAL_P0_PROMOTION_CANDIDATES.csv" -ErrorAction SilentlyContinue)
  if ($found.Count -gt 0) { $candidateCsv = $found[0].FullName }
}
if (-not (Test-Path -LiteralPath $candidateCsv)) { throw "Final promotion candidate CSV not found under: $stagingRoot" }

$candidates = @(Import-Csv -LiteralPath $candidateCsv)
if ($candidates.Count -eq 0) { throw "No promotion candidates found in: $candidateCsv" }

New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null
$sourceOut = Join-Path $OutputRoot "source_files"
New-Item -ItemType Directory -Force -Path $sourceOut | Out-Null

$manifest = @()
$copied = 0
$skipped = 0
$idx = 0

foreach ($row in $candidates) {
  $idx += 1
  $decision = Get-Prop -Row $row -Names @("final_decision", "promotion_decision", "reuse_decision", "decision")
  if ($decision -ne "" -and $decision -notlike "*PROMOTION*CANDIDATE*") {
    $skipped += 1
    continue
  }

  $category = Get-Prop -Row $row -Names @("category", "source_category")
  $fileName = Get-Prop -Row $row -Names @("file_name", "filename", "name")
  $rawPath = Get-Prop -Row $row -Names @("staged_path", "staged_file", "staged_source_path", "path", "source_path")
  $resolved = Resolve-CandidatePath -RawPath $rawPath
  if ($null -eq $resolved) {
    $manifest += [pscustomobject]@{
      index = $idx; copied = $false; reason = "SOURCE_NOT_FOUND"; category = $category; source_path = $rawPath; destination_path = ""; sha256 = ""; file_name = $fileName
    }
    $skipped += 1
    continue
  }

  if ([string]::IsNullOrWhiteSpace($fileName)) { $fileName = Split-Path -Leaf $resolved }
  $sha = Get-FileSha256 -Path $resolved
  $shortSha = "nosha"
  if (-not [string]::IsNullOrWhiteSpace($sha) -and $sha.Length -ge 12) { $shortSha = $sha.Substring(0,12) }

  $catDir = Safe-Category $category
  $destDir = Join-Path $sourceOut $catDir
  New-Item -ItemType Directory -Force -Path $destDir | Out-Null

  $safeFile = Safe-Name $fileName
  $destFile = Join-Path $destDir (("{0:D4}__{1}__{2}" -f $idx, $shortSha, $safeFile))
  Copy-Item -LiteralPath $resolved -Destination $destFile -Force
  $destSha = Get-FileSha256 -Path $destFile
  $shaMatch = ($sha -eq $destSha)

  $manifest += [pscustomobject]@{
    index = $idx
    copied = $true
    reason = "COPIED_FOR_SRC_IMPORT_REVIEW"
    category = $category
    src_import_category = $catDir
    source_path = $resolved
    destination_path = $destFile
    original_sha256 = $sha
    copied_sha256 = $destSha
    sha_match = $shaMatch
    file_name = $fileName
  }
  $copied += 1
}

$manifestCsv = Join-Path $OutputRoot "PROMOTED_SOURCE_MANIFEST.csv"
$manifestJson = Join-Path $OutputRoot "PROMOTED_SOURCE_MANIFEST.json"
$summaryMd = Join-Path $OutputRoot "PROMOTED_SOURCE_SUMMARY.md"
$workerReport = Join-Path $OutputRoot "WORKER_REPORT_007.md"

$manifest | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $manifestCsv
[pscustomobject]@{
  generated_at = (Get-Date).ToString("o")
  staging_dir = $stagingRoot
  candidate_csv = $candidateCsv
  output_root = $OutputRoot
  total_candidates = $candidates.Count
  copied_count = $copied
  skipped_count = $skipped
  category_counts = @($manifest | Where-Object { $_.copied -eq $true } | Group-Object src_import_category | Sort-Object Name | ForEach-Object { [pscustomobject]@{ category=$_.Name; count=$_.Count } })
  manifest = $manifest
} | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 -Path $manifestJson

$md = @()
$md += "# Source Factory P0 src_import Promotion Package"
$md += ""
$md += "generated_at: $((Get-Date).ToString('o'))"
$md += "staging_dir: $stagingRoot"
$md += "candidate_csv: $candidateCsv"
$md += ""
$md += "## Summary"
$md += ""
$md += "| Item | Count |"
$md += "|---|---:|"
$md += "| Total final promotion candidates | $($candidates.Count) |"
$md += "| Copied to src_import | $copied |"
$md += "| Skipped | $skipped |"
$md += ""
$md += "## Category Counts"
$md += ""
$md += "| Category | Count |"
$md += "|---|---:|"
foreach ($g in ($manifest | Where-Object { $_.copied -eq $true } | Group-Object src_import_category | Sort-Object Name)) { $md += "| $($g.Name) | $($g.Count) |" }
$md += ""
$md += "## Policy"
$md += ""
$md += "- This package copies files into src_import/, not src/."
$md += "- Commander review is required before runtime core promotion."
$md += "- Original SHA and copied SHA must match."
$md += "- Blocked/review-required files remain excluded."
$md -join "`r`n" | Set-Content -Encoding UTF8 -Path $summaryMd

$wr = @()
$wr += "WORKER_REPORT_START"
$wr += "worker_id: SOURCE_FACTORY_CORE_P0_SRC_IMPORT_WORKER_007"
$wr += "task_id: SOURCE_FACTORY_CORE_FINAL_P0_SRC_IMPORT_PROMOTION_PACKAGE"
$wr += "worker_function_class: SOURCE_STAGING_WORKER / SRC_IMPORT_PROMOTION_PACKAGE_WORKER"
$wr += "files_created:"
$wr += "  - PROMOTED_SOURCE_MANIFEST.csv"
$wr += "  - PROMOTED_SOURCE_MANIFEST.json"
$wr += "  - PROMOTED_SOURCE_SUMMARY.md"
$wr += "  - WORKER_REPORT_007.md"
$wr += "  - source_files/**"
$wr += "files_modified: []"
$wr += "patch_requests_created: []"
$wr += "tests_run:"
$wr += "  - final promotion candidate CSV read"
$wr += "  - source file existence check"
$wr += "  - source copy into src_import"
$wr += "  - SHA-256 readback"
$wr += "tests_not_run:"
$wr += "  - direct src/ promotion"
$wr += "  - runtime integration"
$wr += "  - package publication"
$wr += "class_contract_status: SRC_IMPORT_PACKAGE_READY_FOR_COMMANDER_REVIEW"
$wr += "priority_0_status: COPIED_$copied`_OF_$($candidates.Count)_FINAL_PROMOTION_CANDIDATES_TO_SRC_IMPORT"
$wr += "known_risks:"
$wr += "  - src_import is not final runtime src"
$wr += "  - manual review still required"
$wr += "next_needed:"
$wr += "  - review src_import manifest"
$wr += "  - choose modules for final src promotion"
$wr += "WORKER_REPORT_END"
$wr -join "`r`n" | Set-Content -Encoding UTF8 -Path $workerReport

Write-Host "SOURCE_FACTORY_P0_SRC_IMPORT_PROMOTION_PACKAGE_COMPLETE"
Write-Host "OutputRoot=$OutputRoot"
Write-Host "TotalCandidates=$($candidates.Count)"
Write-Host "CopiedCount=$copied"
Write-Host "SkippedCount=$skipped"
Write-Host "ManifestCsv=$manifestCsv"
