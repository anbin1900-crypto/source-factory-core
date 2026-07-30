param(
  [Parameter(Mandatory=$true)]
  [string]$StableCandidateDir,
  [Parameter(Mandatory=$false)]
  [string]$OpsCandidateDir = ""
)

$ErrorActionPreference = "Stop"

function Get-FullPathSafe([string]$Path) {
  if ([string]::IsNullOrWhiteSpace($Path)) { return "" }
  return [System.IO.Path]::GetFullPath($Path)
}

function Get-Sha256([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Ensure-Directory([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
  }
}

function Get-RelativeUnder([string]$Root, [string]$Path) {
  $rootFull = Get-FullPathSafe $Root
  $pathFull = Get-FullPathSafe $Path
  if (-not $rootFull.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
    $rootFull = $rootFull + [System.IO.Path]::DirectorySeparatorChar
  }
  if ($pathFull.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $pathFull.Substring($rootFull.Length)
  }
  return (Split-Path -Leaf $pathFull)
}

function Get-TargetPath([string]$RepoRoot, [string]$CandidateFullPath) {
  $name = Split-Path -Leaf $CandidateFullPath
  $lower = $name.ToLowerInvariant()

  if ($lower -eq "dailyqueuereader.js" -or $lower -eq "pythonprocessrunner.js") {
    return Join-Path $RepoRoot (Join-Path "src" (Join-Path "queue" $name))
  }

  if ($lower -eq "diagnostics.js" -or $lower -eq "buttonhandlers.js" -or $lower -eq "stage1selfcheck.js" -or $lower -eq "filenamesafe.js") {
    return Join-Path $RepoRoot (Join-Path "src" (Join-Path "gpt_browser_bridge" $name))
  }

  if ($lower -eq "b2_w12_prefinal_validator.py" -or $lower -eq "event_consumption_store.py" -or $lower -eq "resource_doctor.py") {
    return Join-Path $RepoRoot (Join-Path "src" (Join-Path "pc_agent_routing" $name))
  }

  return Join-Path $RepoRoot (Join-Path "src" (Join-Path "unmapped_integration_review" $name))
}

$repoRoot = Get-FullPathSafe (Join-Path $PSScriptRoot "..")
$stableRoot = Get-FullPathSafe $StableCandidateDir
$opsRoot = Get-FullPathSafe $OpsCandidateDir

if (-not (Test-Path -LiteralPath $stableRoot -PathType Container)) {
  throw "StableCandidateDir not found: $stableRoot"
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$reportRoot = Join-Path $repoRoot (Join-Path "reports" "stable_module_integration_$timestamp")
Ensure-Directory $reportRoot

$runtimeFiles = @(Get-ChildItem -LiteralPath $stableRoot -Recurse -File | Where-Object { $_.Extension -in @(".js", ".py") })
$opsFiles = @()
if (-not [string]::IsNullOrWhiteSpace($opsRoot) -and (Test-Path -LiteralPath $opsRoot -PathType Container)) {
  $opsFiles = @(Get-ChildItem -LiteralPath $opsRoot -Recurse -File)
}

$rows = New-Object System.Collections.ArrayList
$copied = 0
$identical = 0
$conflicts = 0
$unmapped = 0
$shaMismatch = 0

foreach ($file in $runtimeFiles) {
  $source = $file.FullName
  $target = Get-TargetPath $repoRoot $source
  $sourceSha = Get-Sha256 $source
  $targetSha = ""
  $decision = ""
  $status = ""

  if ($target -like "*unmapped_integration_review*") {
    $unmapped++
  }

  if (Test-Path -LiteralPath $target -PathType Leaf) {
    $targetSha = Get-Sha256 $target
    if ($sourceSha -eq $targetSha) {
      $decision = "NOOP_TARGET_ALREADY_IDENTICAL"
      $status = "PASS"
      $identical++
    } else {
      $decision = "CONFLICT_TARGET_EXISTS_DIFFERENT_SHA_NO_OVERWRITE"
      $status = "BLOCKED_CONFLICT"
      $conflicts++
    }
  } else {
    Ensure-Directory (Split-Path -Parent $target)
    Copy-Item -LiteralPath $source -Destination $target -Force
    $targetSha = Get-Sha256 $target
    if ($sourceSha -eq $targetSha) {
      $decision = "COPIED_TO_STABLE_TARGET"
      $status = "PASS"
      $copied++
    } else {
      $decision = "COPIED_SHA_MISMATCH"
      $status = "FAIL_SHA_MISMATCH"
      $shaMismatch++
    }
  }

  [void]$rows.Add([pscustomobject]@{
    kind = "runtime"
    file_name = (Split-Path -Leaf $source)
    source_path = $source
    target_path = $target
    source_sha256 = $sourceSha
    target_sha256 = $targetSha
    decision = $decision
    status = $status
  })
}

foreach ($file in $opsFiles) {
  [void]$rows.Add([pscustomobject]@{
    kind = "ops_reference"
    file_name = $file.Name
    source_path = $file.FullName
    target_path = "OPS_REFERENCE_ONLY_NO_STABLE_RUNTIME_COPY"
    source_sha256 = (Get-Sha256 $file.FullName)
    target_sha256 = ""
    decision = "OPS_REFERENCE_ONLY"
    status = "REFERENCE"
  })
}

$manifestCsv = Join-Path $reportRoot "STABLE_MODULE_INTEGRATION_MANIFEST_V1.csv"
$manifestJson = Join-Path $reportRoot "STABLE_MODULE_INTEGRATION_MANIFEST_V1.json"
$summaryMd = Join-Path $reportRoot "STABLE_MODULE_INTEGRATION_SUMMARY_V1.md"
$workerReport = Join-Path $reportRoot "WORKER_REPORT_013.md"

$rows | Export-Csv -LiteralPath $manifestCsv -NoTypeInformation -Encoding UTF8
$rows | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $manifestJson -Encoding UTF8

$statusFinal = "PASS_STABLE_MODULE_INTEGRATION_READY_FOR_014"
if ($conflicts -gt 0 -or $shaMismatch -gt 0 -or $unmapped -gt 0) {
  $statusFinal = "YELLOW_STABLE_MODULE_INTEGRATION_REVIEW_REQUIRED"
}

$summary = @()
$summary += "# Source Factory Stable Module Integration V1"
$summary += ""
$summary += "generated_at: $((Get-Date).ToString('o'))"
$summary += "stable_candidate_dir: $stableRoot"
$summary += "ops_candidate_dir: $opsRoot"
$summary += ""
$summary += "## Summary"
$summary += ""
$summary += "| Item | Count |"
$summary += "|---|---:|"
$summary += "| Runtime candidates | $($runtimeFiles.Count) |"
$summary += "| Copied to stable src targets | $copied |"
$summary += "| Already identical no-op | $identical |"
$summary += "| Conflicts no-overwrite | $conflicts |"
$summary += "| Unmapped review | $unmapped |"
$summary += "| SHA mismatch | $shaMismatch |"
$summary += "| OPS reference files | $($opsFiles.Count) |"
$summary += ""
$summary += "## Status"
$summary += ""
$summary += $statusFinal
$summary += ""
$summary += "## Policy"
$summary += ""
$summary += "- Existing stable src files are never overwritten."
$summary += "- If a target exists with identical SHA, this stage records a no-op."
$summary += "- If a target exists with different SHA, this stage records a conflict and does not overwrite."
$summary += "- 014 may run only when conflicts, unmapped files, and SHA mismatch are all 0."
$summary | Set-Content -LiteralPath $summaryMd -Encoding UTF8

$worker = @()
$worker += "# WORKER_REPORT_013"
$worker += ""
$worker += "status: $statusFinal"
$worker += "runtime_candidates: $($runtimeFiles.Count)"
$worker += "copied: $copied"
$worker += "already_identical: $identical"
$worker += "conflicts: $conflicts"
$worker += "unmapped: $unmapped"
$worker += "sha_mismatch: $shaMismatch"
$worker += "ops_reference_files: $($opsFiles.Count)"
$worker += "production_overwrite_count: 0"
$worker += "manifest_csv: $manifestCsv"
$worker += "summary_md: $summaryMd"
$worker | Set-Content -LiteralPath $workerReport -Encoding UTF8

Write-Host "SOURCE_FACTORY_STABLE_MODULE_INTEGRATION_V1_COMPLETE"
Write-Host "Status=$statusFinal"
Write-Host "RuntimeCandidates=$($runtimeFiles.Count)"
Write-Host "Copied=$copied"
Write-Host "AlreadyIdentical=$identical"
Write-Host "Conflicts=$conflicts"
Write-Host "Unmapped=$unmapped"
Write-Host "ShaMismatch=$shaMismatch"
Write-Host "OpsReferenceFiles=$($opsFiles.Count)"
Write-Host "ReportRoot=$reportRoot"

if ($shaMismatch -gt 0) { exit 2 }
if ($conflicts -gt 0 -or $unmapped -gt 0) { exit 1 }
exit 0
