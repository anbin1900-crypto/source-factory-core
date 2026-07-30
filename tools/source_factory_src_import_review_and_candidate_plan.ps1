param(
  [string]$SrcImportDir = "",
  [string]$OutputRoot = ""
)

$ErrorActionPreference = "Stop"

function Resolve-ExistingDirectory {
  param([string]$PathValue)
  if ([string]::IsNullOrWhiteSpace($PathValue)) { return $null }
  $item = Get-Item -LiteralPath $PathValue -ErrorAction Stop
  if (-not $item.PSIsContainer) { throw "Not a directory: $PathValue" }
  return $item.FullName
}

function Get-FileSha256 {
  param([string]$PathValue)
  return (Get-FileHash -LiteralPath $PathValue -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Normalize-RepoPath {
  param([string]$PathValue)
  return ($PathValue -replace '\\','/').TrimStart('./')
}

function Get-Decision {
  param(
    [string]$FileName,
    [string]$Category,
    [string]$PromotedPath
  )

  $name = $FileName.ToLowerInvariant()
  $ext = [System.IO.Path]::GetExtension($FileName).ToLowerInvariant()

  $isPrompt = ($name -match 'prompt|mission|commander_report|worker_report|read_me|readme|delivery|checklist|source_extraction_report')
  $isEvidence = ($ext -in @('.json','.csv') -or $name -match 'receipt|manifest|index|hash|prohibited|connection_gate|user_action|output')
  $isCode = ($ext -in @('.js','.py'))
  $isOps = ($ext -in @('.ps1','.bat','.yml','.yaml'))
  $isDoc = ($ext -in @('.md','.txt'))

  if ($isCode -and -not $isPrompt -and -not $isEvidence) {
    return "SRC_READY_REVIEW"
  }
  if ($isOps -and -not $isPrompt) {
    return "OPS_READY_REVIEW"
  }
  if ($isEvidence) {
    return "EVIDENCE_REFERENCE_ONLY"
  }
  if ($isPrompt -or $isDoc) {
    return "DOCS_PROMPT_REFERENCE_ONLY"
  }
  return "MANUAL_REVIEW_REQUIRED"
}

function Get-TargetGroup {
  param([string]$Decision)
  switch ($Decision) {
    "SRC_READY_REVIEW" { return "runtime_candidate" }
    "OPS_READY_REVIEW" { return "ops_candidate" }
    "EVIDENCE_REFERENCE_ONLY" { return "evidence_reference" }
    "DOCS_PROMPT_REFERENCE_ONLY" { return "docs_prompt_reference" }
    default { return "manual_review" }
  }
}

if ([string]::IsNullOrWhiteSpace($SrcImportDir)) {
  $latest = Get-ChildItem -LiteralPath ".\src_import" -Directory -Filter "p0_core_import_v2_*" -ErrorAction Stop |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if (-not $latest) { throw "No src_import/p0_core_import_v2_* directory found." }
  $srcRoot = $latest.FullName
} else {
  $srcRoot = Resolve-ExistingDirectory $SrcImportDir
}

$manifestCsv = Join-Path $srcRoot "PROMOTED_SOURCE_MANIFEST_V2.csv"
if (-not (Test-Path -LiteralPath $manifestCsv)) {
  $found = Get-ChildItem -LiteralPath $srcRoot -Recurse -File -Filter "PROMOTED_SOURCE_MANIFEST_V2.csv" | Select-Object -First 1
  if (-not $found) { throw "PROMOTED_SOURCE_MANIFEST_V2.csv not found under: $srcRoot" }
  $manifestCsv = $found.FullName
}

if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
  $stamp = Get-Date -Format "yyyyMMdd_HHmmss"
  $outRoot = Join-Path ".\src_candidate" "p0_runtime_review_$stamp"
} else {
  $outRoot = $OutputRoot
}

New-Item -ItemType Directory -Force -Path $outRoot | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $outRoot "reports") | Out-Null

$rows = @(Import-Csv -LiteralPath $manifestCsv)
$plan = New-Object System.Collections.ArrayList
$copyCount = 0
$missingCount = 0
$shaMismatchCount = 0

foreach ($row in $rows) {
  $promotedPathRaw = [string]$row.promoted_path
  if ([string]::IsNullOrWhiteSpace($promotedPathRaw)) { continue }

  $srcPath = $promotedPathRaw
  if ($srcPath.StartsWith(".\") -or $srcPath.StartsWith("./")) {
    $srcPath = Join-Path (Get-Location).Path $srcPath.Substring(2)
  }

  $exists = Test-Path -LiteralPath $srcPath
  $decision = Get-Decision -FileName ([string]$row.file_name) -Category ([string]$row.category) -PromotedPath $srcPath
  $group = Get-TargetGroup -Decision $decision
  $targetDir = Join-Path $outRoot (Join-Path $group ([string]$row.category))
  New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

  $targetPath = Join-Path $targetDir ([System.IO.Path]::GetFileName($srcPath))
  $actualSha = ""
  $shaOk = $false
  $copied = $false

  if ($exists) {
    Copy-Item -LiteralPath $srcPath -Destination $targetPath -Force
    $copyCount += 1
    $copied = $true
    $actualSha = Get-FileSha256 $targetPath
    $shaOk = ($actualSha -eq ([string]$row.copied_sha256).ToLowerInvariant())
    if (-not $shaOk) { $shaMismatchCount += 1 }
  } else {
    $missingCount += 1
  }

  [void]$plan.Add([pscustomobject]@{
    file_name = [string]$row.file_name
    category = [string]$row.category
    source_staged_path = [string]$row.source_staged_path
    src_import_path = Normalize-RepoPath $promotedPathRaw
    review_decision = $decision
    review_group = $group
    review_copy_path = if ($copied) { Normalize-RepoPath $targetPath } else { "" }
    expected_sha256 = [string]$row.copied_sha256
    review_copy_sha256 = $actualSha
    sha_match = $shaOk
    exists = $exists
  })
}

$planCsv = Join-Path $outRoot "reports\SRC_IMPORT_REVIEW_PLAN.csv"
$planJson = Join-Path $outRoot "reports\SRC_IMPORT_REVIEW_PLAN.json"
$summaryMd = Join-Path $outRoot "SRC_IMPORT_REVIEW_SUMMARY.md"
$workerReport = Join-Path $outRoot "WORKER_REPORT_008.md"

$plan | Export-Csv -LiteralPath $planCsv -NoTypeInformation -Encoding UTF8
$plan | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $planJson -Encoding UTF8

$decisionCounts = $plan | Group-Object review_decision | Sort-Object Name
$categoryDecisionCounts = $plan | Group-Object category,review_decision | Sort-Object Name

$srcReady = @($plan | Where-Object { $_.review_decision -eq "SRC_READY_REVIEW" }).Count
$opsReady = @($plan | Where-Object { $_.review_decision -eq "OPS_READY_REVIEW" }).Count
$docsRef = @($plan | Where-Object { $_.review_decision -eq "DOCS_PROMPT_REFERENCE_ONLY" }).Count
$evidenceRef = @($plan | Where-Object { $_.review_decision -eq "EVIDENCE_REFERENCE_ONLY" }).Count
$manual = @($plan | Where-Object { $_.review_decision -eq "MANUAL_REVIEW_REQUIRED" }).Count

$summary = New-Object System.Collections.Generic.List[string]
$summary.Add("# Source Factory src_import Review and Runtime Candidate Plan")
$summary.Add("")
$summary.Add("generated_at: $(Get-Date -Format o)")
$summary.Add("src_import_dir: $srcRoot")
$summary.Add("manifest_csv: $manifestCsv")
$summary.Add("")
$summary.Add("## Summary")
$summary.Add("")
$summary.Add("| Item | Count |")
$summary.Add("|---|---:|")
$summary.Add("| Manifest rows | $($rows.Count) |")
$summary.Add("| Copied to review folders | $copyCount |")
$summary.Add("| Missing source files | $missingCount |")
$summary.Add("| SHA mismatch | $shaMismatchCount |")
$summary.Add("| SRC ready review | $srcReady |")
$summary.Add("| OPS ready review | $opsReady |")
$summary.Add("| Docs/prompt reference only | $docsRef |")
$summary.Add("| Evidence reference only | $evidenceRef |")
$summary.Add("| Manual review required | $manual |")
$summary.Add("")
$summary.Add("## Decision Counts")
$summary.Add("")
$summary.Add("| Decision | Count |")
$summary.Add("|---|---:|")
foreach ($g in $decisionCounts) { $summary.Add("| $($g.Name) | $($g.Count) |") }
$summary.Add("")
$summary.Add("## Category / Decision Counts")
$summary.Add("")
$summary.Add("| Category + Decision | Count |")
$summary.Add("|---|---:|")
foreach ($g in $categoryDecisionCounts) { $summary.Add("| $($g.Name) | $($g.Count) |") }
$summary.Add("")
$summary.Add("## Policy")
$summary.Add("")
$summary.Add("- This stage does not promote files into final src/ runtime paths.")
$summary.Add("- SRC_READY_REVIEW files are only candidates for 009 runtime promotion.")
$summary.Add("- DOCS_PROMPT_REFERENCE_ONLY files belong in docs/examples/prompt archives, not runtime src/.")
$summary.Add("- EVIDENCE_REFERENCE_ONLY files must not be imported as runtime source.")
$summary.Add("- SHA mismatch must be 0 before 009.")

$summary | Set-Content -LiteralPath $summaryMd -Encoding UTF8
$summary | Set-Content -LiteralPath $workerReport -Encoding UTF8

Write-Host "SOURCE_FACTORY_SRC_IMPORT_REVIEW_PLAN_COMPLETE"
Write-Host "SrcImportDir=$srcRoot"
Write-Host "OutputRoot=$outRoot"
Write-Host "ManifestRows=$($rows.Count)"
Write-Host "CopiedToReview=$copyCount"
Write-Host "SrcReadyReview=$srcReady"
Write-Host "OpsReadyReview=$opsReady"
Write-Host "DocsPromptReference=$docsRef"
Write-Host "EvidenceReference=$evidenceRef"
Write-Host "ManualReview=$manual"
Write-Host "Missing=$missingCount"
Write-Host "ShaMismatch=$shaMismatchCount"
Write-Host "PlanCsv=$planCsv"
