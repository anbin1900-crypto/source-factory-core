<#
SOURCE_FACTORY_PROMOTE_FINAL_P0_TO_SRC_IMPORT_V2.ps1

Purpose:
  Repair version of 007 src_import promotion.
  The V1 final candidate CSV may have blank staged_path values.
  V2 resolves candidates by matching SHA/file name/category against STAGED_SOURCE_MANIFEST.csv,
  then copies matching staged source files into src_import/ for Commander review.

Safety:
  - Does not modify original source roots.
  - Does not promote directly into src/.
  - Copies only FINAL_PROMOTION_CANDIDATE rows that can be resolved to staged files.
  - Deduplicates by sha256 + file_name + category.
#>

param(
  [string]$StagingDir = ".\_staging\p0_core_import_20260730_174852",
  [string]$OutputRoot = ""
)

$ErrorActionPreference = "Stop"

function Get-SafeName {
  param([string]$Name)
  $safe = $Name
  $bad = [System.IO.Path]::GetInvalidFileNameChars()
  foreach ($c in $bad) { $safe = $safe.Replace([string]$c, "_") }
  return $safe
}

function Get-Sha256 {
  param([string]$Path)
  try { return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant() } catch { return "" }
}

$root = (Resolve-Path -LiteralPath $StagingDir).Path

$manifestPath = Join-Path $root "STAGED_SOURCE_MANIFEST.csv"
if (-not (Test-Path -LiteralPath $manifestPath)) {
  throw "STAGED_SOURCE_MANIFEST.csv not found: $manifestPath"
}

$candidatePath = Join-Path $root "reports\SF_CORE_FINAL_P0_PROMOTION_CANDIDATES.csv"
if (-not (Test-Path -LiteralPath $candidatePath)) {
  $found = @(Get-ChildItem -LiteralPath $root -Recurse -File -Filter "SF_CORE_FINAL_P0_PROMOTION_CANDIDATES.csv" -ErrorAction SilentlyContinue)
  if ($found.Count -gt 0) { $candidatePath = $found[0].FullName }
}
if (-not (Test-Path -LiteralPath $candidatePath)) {
  throw "SF_CORE_FINAL_P0_PROMOTION_CANDIDATES.csv not found under: $root"
}

if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
  $OutputRoot = ".\src_import\p0_core_import_v2_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
}
New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null

$manifest = @(Import-Csv -LiteralPath $manifestPath)
$candidates = @(Import-Csv -LiteralPath $candidatePath)

# Build SHA map from manifest. Accept either expected_sha256 or staged_sha256 from earlier manifests.
$bySha = @{}
foreach ($m in $manifest) {
  $sha = ""
  if ($m.PSObject.Properties.Name -contains "expected_sha256") { $sha = [string]$m.expected_sha256 }
  if ([string]::IsNullOrWhiteSpace($sha) -and ($m.PSObject.Properties.Name -contains "staged_sha256")) { $sha = [string]$m.staged_sha256 }
  $sha = $sha.ToLowerInvariant()
  if ([string]::IsNullOrWhiteSpace($sha)) { continue }
  if (-not $bySha.ContainsKey($sha)) { $bySha[$sha] = @() }
  $bySha[$sha] += $m
}

$copied = @()
$skipped = @()
$seen = @{}

foreach ($c in $candidates) {
  if (($c.PSObject.Properties.Name -contains "final_decision") -and ($c.final_decision -ne "FINAL_PROMOTION_CANDIDATE")) { continue }

  $sha = ([string]$c.sha256).ToLowerInvariant()
  $fileName = [string]$c.file_name
  $category = [string]$c.category
  $key = "$sha|$fileName|$category"
  if ($seen.ContainsKey($key)) { continue }
  $seen[$key] = $true

  $sourceRow = $null

  if (($c.PSObject.Properties.Name -contains "staged_path") -and -not [string]::IsNullOrWhiteSpace([string]$c.staged_path)) {
    $candidateStagedPath = [string]$c.staged_path
    if (Test-Path -LiteralPath $candidateStagedPath) { $sourceRow = [pscustomobject]@{ staged_path = $candidateStagedPath } }
  }

  if ($null -eq $sourceRow -and $bySha.ContainsKey($sha)) {
    $matches = @($bySha[$sha] | Where-Object { ([string]$_.file_name) -eq $fileName -and ([string]$_.category) -eq $category })
    if ($matches.Count -eq 0) { $matches = @($bySha[$sha] | Where-Object { ([string]$_.file_name) -eq $fileName }) }
    if ($matches.Count -eq 0) { $matches = @($bySha[$sha]) }
    if ($matches.Count -gt 0) { $sourceRow = $matches[0] }
  }

  if ($null -eq $sourceRow) {
    $skipped += [pscustomobject]@{ file_name=$fileName; category=$category; sha256=$sha; reason="NO_MANIFEST_MATCH" }
    continue
  }

  $srcPath = ""
  if ($sourceRow.PSObject.Properties.Name -contains "staged_path") { $srcPath = [string]$sourceRow.staged_path }
  if ([string]::IsNullOrWhiteSpace($srcPath)) {
    $skipped += [pscustomobject]@{ file_name=$fileName; category=$category; sha256=$sha; reason="BLANK_STAGED_PATH" }
    continue
  }

  # Normalize old ._staging path to current _staging path when necessary.
  if (-not (Test-Path -LiteralPath $srcPath)) {
    $alt = $srcPath.Replace("._staging", "_staging")
    if (Test-Path -LiteralPath $alt) { $srcPath = $alt }
  }
  if (-not (Test-Path -LiteralPath $srcPath)) {
    $skipped += [pscustomobject]@{ file_name=$fileName; category=$category; sha256=$sha; reason="STAGED_FILE_NOT_FOUND"; attempted_path=$srcPath }
    continue
  }

  $categoryDir = Get-SafeName -Name $category
  $destDir = Join-Path $OutputRoot $categoryDir
  New-Item -ItemType Directory -Force -Path $destDir | Out-Null

  $safeFileName = Get-SafeName -Name $fileName
  $shortSha = if ($sha.Length -ge 12) { $sha.Substring(0,12) } else { $sha }
  $destPath = Join-Path $destDir ("$shortSha`_$safeFileName")

  Copy-Item -LiteralPath $srcPath -Destination $destPath -Force
  $copiedSha = Get-Sha256 -Path $destPath
  $shaMatch = ($copiedSha -eq $sha)

  $copied += [pscustomobject]@{
    file_name = $fileName
    category = $category
    source_staged_path = $srcPath
    promoted_path = $destPath
    expected_sha256 = $sha
    copied_sha256 = $copiedSha
    sha_match = $shaMatch
  }
}

$manifestCsv = Join-Path $OutputRoot "PROMOTED_SOURCE_MANIFEST_V2.csv"
$manifestJson = Join-Path $OutputRoot "PROMOTED_SOURCE_MANIFEST_V2.json"
$skippedCsv = Join-Path $OutputRoot "PROMOTED_SOURCE_SKIPPED_V2.csv"
$summaryMd = Join-Path $OutputRoot "PROMOTED_SOURCE_SUMMARY_V2.md"
$workerReport = Join-Path $OutputRoot "WORKER_REPORT_007B.md"

$copied | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $manifestCsv
$skipped | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $skippedCsv

$summaryObj = [pscustomobject]@{
  generated_at = (Get-Date).ToString("o")
  staging_dir = $root
  candidate_csv = $candidatePath
  total_candidate_rows = $candidates.Count
  unique_candidate_keys = $seen.Count
  copied_count = $copied.Count
  skipped_count = $skipped.Count
  sha_match_false_count = @($copied | Where-Object { -not $_.sha_match }).Count
  categories = @($copied | Group-Object category | Sort-Object Name | ForEach-Object { [pscustomobject]@{ category=$_.Name; count=$_.Count } })
  copied = $copied
  skipped = $skipped
}
$summaryObj | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 -Path $manifestJson

$md = @()
$md += "# Source Factory P0 src_import Promotion Package V2"
$md += ""
$md += "generated_at: $((Get-Date).ToString('o'))"
$md += "staging_dir: $root"
$md += "candidate_csv: $candidatePath"
$md += ""
$md += "## Summary"
$md += ""
$md += "| Item | Count |"
$md += "|---|---:|"
$md += "| Total candidate rows | $($candidates.Count) |"
$md += "| Unique candidate keys | $($seen.Count) |"
$md += "| Copied to src_import | $($copied.Count) |"
$md += "| Skipped | $($skipped.Count) |"
$md += "| SHA mismatch | $(@($copied | Where-Object { -not $_.sha_match }).Count) |"
$md += ""
$md += "## Category Counts"
$md += ""
$md += "| Category | Count |"
$md += "|---|---:|"
foreach ($g in ($copied | Group-Object category | Sort-Object Name)) { $md += "| $($g.Name) | $($g.Count) |" }
$md += ""
$md += "## Policy"
$md += ""
$md += "- This package copies files into src_import/, not src/."
$md += "- Commander review is required before runtime core promotion."
$md += "- Original SHA and copied SHA must match."
$md += "- Duplicate candidates are deduplicated by sha256 + file_name + category."
$md -join "`r`n" | Set-Content -Encoding UTF8 -Path $summaryMd

$wr = @()
$wr += "WORKER_REPORT_START"
$wr += "worker_id: SOURCE_FACTORY_P0_SRC_IMPORT_PROMOTION_WORKER_007B"
$wr += "task_id: SOURCE_FACTORY_FINAL_P0_SRC_IMPORT_PROMOTION_PACKAGE_V2"
$wr += "worker_function_class: SOURCE_COPY_STAGING_WORKER / SRC_IMPORT_PROMOTION_WORKER"
$wr += "files_created:"
$wr += "  - PROMOTED_SOURCE_MANIFEST_V2.csv"
$wr += "  - PROMOTED_SOURCE_MANIFEST_V2.json"
$wr += "  - PROMOTED_SOURCE_SKIPPED_V2.csv"
$wr += "  - PROMOTED_SOURCE_SUMMARY_V2.md"
$wr += "  - WORKER_REPORT_007B.md"
$wr += "files_modified: []"
$wr += "patch_requests_created: []"
$wr += "tests_run:"
$wr += "  - final candidate CSV read"
$wr += "  - staged manifest SHA/path resolution"
$wr += "  - source copy to src_import"
$wr += "  - copied SHA verification"
$wr += "tests_not_run:"
$wr += "  - final src promotion"
$wr += "  - runtime execution"
$wr += "class_contract_status: READY_FOR_COMMANDER_REVIEW"
$wr += "priority_0_status: SRC_IMPORT_PROMOTION_PACKAGE_CREATED"
$wr += "known_risks:"
$wr += "  - duplicate candidates may collapse to fewer copied files"
$wr += "  - Commander approval still required before src promotion"
$wr += "next_needed:"
$wr += "  - review src_import manifest"
$wr += "  - promote approved subset into src/"
$wr += "WORKER_REPORT_END"
$wr -join "`r`n" | Set-Content -Encoding UTF8 -Path $workerReport

Write-Host "SOURCE_FACTORY_P0_SRC_IMPORT_PROMOTION_PACKAGE_V2_COMPLETE"
Write-Host "OutputRoot=$OutputRoot"
Write-Host "TotalCandidateRows=$($candidates.Count)"
Write-Host "UniqueCandidateKeys=$($seen.Count)"
Write-Host "CopiedCount=$($copied.Count)"
Write-Host "SkippedCount=$($skipped.Count)"
Write-Host "ManifestCsv=$manifestCsv"
