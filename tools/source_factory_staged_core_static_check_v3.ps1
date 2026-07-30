<#
SOURCE_FACTORY_STAGED_CORE_STATIC_CHECK_V3.ps1

Purpose:
  Re-run staged P0 core static checks without aborting when one staged file has syntax errors.
  V2 proved path resolution was fixed, but native node --check errors could stop PowerShell.

Safety:
  - Read-only check of staged files
  - Does not modify staged source files
  - Does not promote files into src/
  - Records pass/fail per file and continues
#>

param(
  [string]$StagingDir = "",
  [int64]$MaxTextScanBytes = 2MB
)

$ErrorActionPreference = "Stop"

function Get-LatestStagingDir {
  $root = ".\_staging"
  if (-not (Test-Path -LiteralPath $root)) {
    throw "_staging directory not found. Run stage selected core sources first."
  }
  $dirs = Get-ChildItem -LiteralPath $root -Directory -Filter "p0_core_import_*" | Sort-Object LastWriteTime -Descending
  if ($dirs.Count -eq 0) {
    throw "p0_core_import_* directory not found. Run stage selected core sources first."
  }
  return $dirs[0].FullName
}

function Get-FileSha256 {
  param([string]$Path)
  try { return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant() } catch { return $null }
}

function Resolve-StagedPath {
  param([string]$RawPath, [string]$StagingDir)

  $candidates = @()
  if (-not [string]::IsNullOrWhiteSpace($RawPath)) {
    $candidates += $RawPath
    $candidates += ($RawPath -replace "^\.\\\._staging", ".\_staging")
    $candidates += ($RawPath -replace "^\._staging", "_staging")
    $candidates += ($RawPath -replace "^\.\\\._staging", "_staging")
  }

  foreach ($candidate in $candidates) {
    if ([string]::IsNullOrWhiteSpace($candidate)) { continue }
    if (Test-Path -LiteralPath $candidate) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  # Fallback: locate by file name under staging dir.
  $fileName = [System.IO.Path]::GetFileName($RawPath)
  if (-not [string]::IsNullOrWhiteSpace($fileName) -and (Test-Path -LiteralPath $StagingDir)) {
    $found = Get-ChildItem -LiteralPath $StagingDir -Recurse -File -Filter $fileName -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $found) { return $found.FullName }
  }

  return $null
}

function Test-CommandAvailable {
  param([string]$Name)
  return ($null -ne (Get-Command $Name -ErrorAction SilentlyContinue))
}

function Invoke-NativeCapture {
  param([string]$CommandLine)
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "cmd.exe"
  $psi.Arguments = "/d /c " + $CommandLine
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $proc = New-Object System.Diagnostics.Process
  $proc.StartInfo = $psi
  [void]$proc.Start()
  $stdout = $proc.StandardOutput.ReadToEnd()
  $stderr = $proc.StandardError.ReadToEnd()
  $proc.WaitForExit()
  return [pscustomobject]@{
    exit_code = $proc.ExitCode
    output = (($stdout + "`n" + $stderr).Trim())
  }
}

function Test-Static {
  param([string]$Path, [string]$Extension, [int64]$SizeBytes)

  if (-not (Test-Path -LiteralPath $Path)) {
    return [pscustomobject]@{ status="FAIL_MISSING_STAGED_FILE"; detail="file not found" }
  }

  if ($Extension -in @(".js", ".mjs", ".cjs")) {
    if (-not (Test-CommandAvailable -Name "node")) {
      return [pscustomobject]@{ status="SKIP_NODE_NOT_AVAILABLE"; detail="node command not available" }
    }
    $quoted = '"' + $Path + '"'
    $result = Invoke-NativeCapture -CommandLine ("node --check " + $quoted)
    if ($result.exit_code -eq 0) {
      return [pscustomobject]@{ status="PASS_NODE_CHECK"; detail="" }
    }
    return [pscustomobject]@{ status="FAIL_NODE_CHECK"; detail=$result.output }
  }

  if ($Extension -eq ".json") {
    try {
      $raw = Get-Content -LiteralPath $Path -Raw -ErrorAction Stop
      $null = $raw | ConvertFrom-Json -ErrorAction Stop
      return [pscustomobject]@{ status="PASS_JSON_PARSE"; detail="" }
    } catch {
      return [pscustomobject]@{ status="FAIL_JSON_PARSE"; detail=$_.Exception.Message }
    }
  }

  if ($Extension -eq ".ps1") {
    try {
      $tokens = $null
      $errors = $null
      $null = [System.Management.Automation.Language.Parser]::ParseFile($Path, [ref]$tokens, [ref]$errors)
      if ($errors.Count -eq 0) {
        return [pscustomobject]@{ status="PASS_PS_PARSE"; detail="" }
      }
      return [pscustomobject]@{ status="FAIL_PS_PARSE"; detail=($errors | ForEach-Object { $_.Message }) -join "; " }
    } catch {
      return [pscustomobject]@{ status="FAIL_PS_PARSE_EXCEPTION"; detail=$_.Exception.Message }
    }
  }

  if ($Extension -eq ".py") {
    if (-not (Test-CommandAvailable -Name "python")) {
      return [pscustomobject]@{ status="SKIP_PYTHON_NOT_AVAILABLE"; detail="python command not available" }
    }
    $quoted = '"' + $Path + '"'
    $result = Invoke-NativeCapture -CommandLine ("python -m py_compile " + $quoted)
    if ($result.exit_code -eq 0) {
      return [pscustomobject]@{ status="PASS_PY_COMPILE"; detail="" }
    }
    return [pscustomobject]@{ status="FAIL_PY_COMPILE"; detail=$result.output }
  }

  if ($SizeBytes -gt $MaxTextScanBytes) {
    return [pscustomobject]@{ status="SKIP_TOO_LARGE_TEXT_CHECK"; detail="" }
  }

  return [pscustomobject]@{ status="PASS_NO_COMPILE_CHECK_REQUIRED"; detail="" }
}

function Get-PromotionDecision {
  param([string]$StaticStatus, [bool]$ShaMatch)
  if (-not $ShaMatch) { return "BLOCKED_SHA_MISMATCH" }
  if ($StaticStatus -like "FAIL_*") { return "BLOCKED_STATIC_CHECK" }
  if ($StaticStatus -like "SKIP_*") { return "REVIEW_STATIC_SKIPPED" }
  return "PROMOTION_CANDIDATE"
}

if ([string]::IsNullOrWhiteSpace($StagingDir)) { $StagingDir = Get-LatestStagingDir }
if (-not (Test-Path -LiteralPath $StagingDir)) { throw "StagingDir not found: $StagingDir" }

$manifestPath = Join-Path $StagingDir "STAGED_SOURCE_MANIFEST.csv"
if (-not (Test-Path -LiteralPath $manifestPath)) { throw "STAGED_SOURCE_MANIFEST.csv not found: $manifestPath" }

$reportsDir = Join-Path $StagingDir "reports"
New-Item -ItemType Directory -Force -Path $reportsDir | Out-Null

$rows = @(Import-Csv -LiteralPath $manifestPath)
$results = @()

foreach ($row in $rows) {
  $resolved = Resolve-StagedPath -RawPath $row.staged_path -StagingDir $StagingDir
  $expectedSha = ($row.expected_sha256 + "").ToLowerInvariant()
  $ext = [System.IO.Path]::GetExtension($row.file_name).ToLowerInvariant()
  $actualSha = $null
  $size = 0
  $shaMatch = $false
  $static = [pscustomobject]@{ status="FAIL_MISSING_STAGED_FILE"; detail="file not found" }

  if ($null -ne $resolved -and (Test-Path -LiteralPath $resolved)) {
    $actualSha = Get-FileSha256 -Path $resolved
    $shaMatch = ($actualSha -eq $expectedSha)
    $size = (Get-Item -LiteralPath $resolved).Length
    $static = Test-Static -Path $resolved -Extension $ext -SizeBytes $size
  }

  $decision = Get-PromotionDecision -StaticStatus $static.status -ShaMatch $shaMatch
  $results += [pscustomobject]@{
    source_path = $row.source_path
    manifest_staged_path = $row.staged_path
    resolved_staged_path = $resolved
    file_name = $row.file_name
    category = $row.category
    extension = $ext
    expected_sha256 = $expectedSha
    actual_sha256 = $actualSha
    sha_match = $shaMatch
    size_bytes = $size
    static_status = $static.status
    static_detail = ($static.detail + "")
    promotion_decision = $decision
  }
}

$csvPath = Join-Path $reportsDir "SF_CORE_STAGED_STATIC_CHECK_V3_RESULTS.csv"
$jsonPath = Join-Path $reportsDir "SF_CORE_STAGED_STATIC_CHECK_V3_RESULTS.json"
$mdPath = Join-Path $reportsDir "SF_CORE_STAGED_STATIC_CHECK_V3_RESULTS.md"
$wrPath = Join-Path $StagingDir "WORKER_REPORT_005B.md"

$results | Sort-Object promotion_decision, category, file_name | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $csvPath

$summary = [pscustomobject]@{
  generated_at = (Get-Date).ToString("o")
  staging_dir = $StagingDir
  total_checked = $results.Count
  promotion_decision_counts = @($results | Group-Object promotion_decision | Sort-Object Name | ForEach-Object { [pscustomobject]@{ decision=$_.Name; count=$_.Count } })
  static_status_counts = @($results | Group-Object static_status | Sort-Object Name | ForEach-Object { [pscustomobject]@{ static_status=$_.Name; count=$_.Count } })
  results = $results
}
$summary | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 -Path $jsonPath

$md = @()
$md += "# Source Factory Staged P0 Core Static Check V3"
$md += ""
$md += "generated_at: $((Get-Date).ToString('o'))"
$md += "staging_dir: $StagingDir"
$md += ""
$md += "## Summary"
$md += ""
$md += "| Item | Count |"
$md += "|---|---:|"
$md += "| Total checked | $($results.Count) |"
$md += "| Promotion candidates | $(($results | Where-Object { $_.promotion_decision -eq 'PROMOTION_CANDIDATE' }).Count) |"
$md += "| Blocked or review required | $(($results | Where-Object { $_.promotion_decision -ne 'PROMOTION_CANDIDATE' }).Count) |"
$md += ""
$md += "## Promotion Decision Counts"
$md += ""
$md += "| Decision | Count |"
$md += "|---|---:|"
foreach ($g in ($results | Group-Object promotion_decision | Sort-Object Name)) { $md += "| $($g.Name) | $($g.Count) |" }
$md += ""
$md += "## Static Status Counts"
$md += ""
$md += "| Static Status | Count |"
$md += "|---|---:|"
foreach ($g in ($results | Group-Object static_status | Sort-Object Name)) { $md += "| $($g.Name) | $($g.Count) |" }
$md += ""
$md += "## Policy"
$md += ""
$md += "- V3 records per-file static failures and continues."
$md += "- PROMOTION_CANDIDATE means eligible for manual review, not final src promotion."
$md += "- BLOCKED_STATIC_CHECK files must not be promoted."
$md -join "`r`n" | Set-Content -Encoding UTF8 -Path $mdPath

$wr = @()
$wr += "WORKER_REPORT_START"
$wr += "worker_id: SOURCE_FACTORY_STAGED_CORE_STATIC_CHECK_WORKER_005B"
$wr += "task_id: SOURCE_FACTORY_STAGED_P0_CORE_STATIC_CHECK_V3"
$wr += "worker_function_class: STATIC_CHECK_WORKER / NONFATAL_NATIVE_CHECK_WORKER"
$wr += "files_created:"
$wr += "  - reports/SF_CORE_STAGED_STATIC_CHECK_V3_RESULTS.md"
$wr += "  - reports/SF_CORE_STAGED_STATIC_CHECK_V3_RESULTS.json"
$wr += "  - reports/SF_CORE_STAGED_STATIC_CHECK_V3_RESULTS.csv"
$wr += "  - WORKER_REPORT_005B.md"
$wr += "files_modified: []"
$wr += "patch_requests_created: []"
$wr += "report_only_artifacts:"
$wr += "  - per-file static check results"
$wr += "  - promotion candidate counts"
$wr += "tests_run:"
$wr += "  - staging manifest read"
$wr += "  - staged file path resolution"
$wr += "  - SHA-256 comparison"
$wr += "  - node --check for JS where applicable"
$wr += "  - JSON parse check where applicable"
$wr += "  - PowerShell parser check where applicable"
$wr += "tests_not_run:"
$wr += "  - runtime execution"
$wr += "  - src promotion"
$wr += "  - Google Drive upload"
$wr += "class_contract_status: READY_FOR_COMMANDER_REVIEW"
$wr += "priority_0_status: STATIC_CHECK_V3_COMPLETE_IF_TOTAL_CHECKED_GT_0"
$wr += "known_risks:"
$wr += "  - static check only"
$wr += "  - promotion candidates still require manual review"
$wr += "next_needed:"
$wr += "  - review promotion candidates"
$wr += "  - create 006 src promotion plan"
$wr += "WORKER_REPORT_END"
$wr -join "`r`n" | Set-Content -Encoding UTF8 -Path $wrPath

Write-Host "SOURCE_FACTORY_STAGED_CORE_STATIC_CHECK_V3_COMPLETE"
Write-Host "StagingDir=$StagingDir"
Write-Host "TotalChecked=$($results.Count)"
Write-Host "PromotionCandidates=$(($results | Where-Object { $_.promotion_decision -eq 'PROMOTION_CANDIDATE' }).Count)"
Write-Host "BlockedOrReview=$(($results | Where-Object { $_.promotion_decision -ne 'PROMOTION_CANDIDATE' }).Count)"
Write-Host "ResultsCsv=$csvPath"
