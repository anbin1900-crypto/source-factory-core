param(
  [Parameter(Mandatory=$true)][string]$RuntimeImportDir,
  [Parameter(Mandatory=$false)][string]$OpsImportDir = ""
)

$ErrorActionPreference = "Stop"

function Resolve-FullPath([string]$Path) {
  if ([System.IO.Path]::IsPathRooted($Path)) { return [System.IO.Path]::GetFullPath($Path) }
  return [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $Path))
}

function Get-RepoRoot {
  $p = Get-Location
  while ($null -ne $p) {
    if (Test-Path -LiteralPath (Join-Path $p.Path ".git")) { return $p.Path }
    $p = $p.Parent
  }
  throw "Git repository root not found. Run this script inside source-factory-core."
}

function Get-Sha256([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Strip-HashPrefix([string]$Name) {
  if ($Name -match '^[0-9a-fA-F]{12}_(.+)$') { return $Matches[1] }
  return $Name
}

function Get-CategoryFromPath([string]$FullPath) {
  $norm = $FullPath -replace '/', '\'
  if ($norm -match '\\P0_DAILY_QUEUE_RUNNER\\') { return "P0_DAILY_QUEUE_RUNNER" }
  if ($norm -match '\\P0_GPT_BROWSER_BRIDGE\\') { return "P0_GPT_BROWSER_BRIDGE" }
  if ($norm -match '\\P0_PC_AGENT_ROUTING_CORE\\') { return "P0_PC_AGENT_ROUTING_CORE" }
  return "P0_UNKNOWN"
}

function Get-StableSubdir([string]$Category) {
  switch ($Category) {
    "P0_DAILY_QUEUE_RUNNER" { return "queue" }
    "P0_GPT_BROWSER_BRIDGE" { return "gpt_browser_bridge" }
    "P0_PC_AGENT_ROUTING_CORE" { return "pc_agent" }
    default { return "manual_review" }
  }
}

function Ensure-Dir([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { New-Item -ItemType Directory -Force -Path $Path | Out-Null }
}

$repoRoot = Get-RepoRoot
$runtimeRoot = Resolve-FullPath $RuntimeImportDir
if (-not (Test-Path -LiteralPath $runtimeRoot -PathType Container)) {
  throw "RuntimeImportDir not found: $runtimeRoot"
}

$opsRoot = $null
if ($OpsImportDir -and $OpsImportDir.Trim().Length -gt 0) {
  $opsRoot = Resolve-FullPath $OpsImportDir
  if (-not (Test-Path -LiteralPath $opsRoot -PathType Container)) {
    throw "OpsImportDir not found: $opsRoot"
  }
}

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$stableRoot = Join-Path $repoRoot "src\integration_candidates\p0_stable_candidate_$stamp"
$opsCandidateRoot = Join-Path $repoRoot "ops_integration_candidates\p0_ops_candidate_$stamp"
$reportRoot = Join-Path $repoRoot "reports\stable_integration_candidate_$stamp"
Ensure-Dir $stableRoot
Ensure-Dir $reportRoot
if ($opsRoot) { Ensure-Dir $opsCandidateRoot }

$runtimeFiles = @(Get-ChildItem -LiteralPath $runtimeRoot -Recurse -File | Where-Object { $_.Extension -in @('.js','.py') })
$opsFiles = @()
if ($opsRoot) { $opsFiles = @(Get-ChildItem -LiteralPath $opsRoot -Recurse -File) }

$rows = New-Object System.Collections.ArrayList
$collisionCount = 0
$shaMismatch = 0

foreach ($file in $runtimeFiles) {
  $category = Get-CategoryFromPath $file.FullName
  $subdir = Get-StableSubdir $category
  $originalName = Strip-HashPrefix $file.Name
  $destDir = Join-Path $stableRoot $subdir
  Ensure-Dir $destDir
  $dest = Join-Path $destDir $originalName
  if (Test-Path -LiteralPath $dest) {
    $collisionCount += 1
    $base = [System.IO.Path]::GetFileNameWithoutExtension($originalName)
    $ext = [System.IO.Path]::GetExtension($originalName)
    $dest = Join-Path $destDir ("{0}_{1}{2}" -f $base, (Get-Sha256 $file.FullName).Substring(0,12), $ext)
  }
  Copy-Item -LiteralPath $file.FullName -Destination $dest -Force
  $srcSha = Get-Sha256 $file.FullName
  $dstSha = Get-Sha256 $dest
  $match = ($srcSha -eq $dstSha)
  if (-not $match) { $shaMismatch += 1 }
  [void]$rows.Add([pscustomobject]@{
    kind = "runtime"
    category = $category
    decision = "STABLE_INTEGRATION_CANDIDATE"
    source_path = $file.FullName
    stable_path = $dest
    original_file_name = $originalName
    source_sha256 = $srcSha
    stable_sha256 = $dstSha
    sha_match = $match
  })
}

foreach ($file in $opsFiles) {
  $category = Get-CategoryFromPath $file.FullName
  $subdir = Get-StableSubdir $category
  $originalName = Strip-HashPrefix $file.Name
  $destDir = Join-Path $opsCandidateRoot $subdir
  Ensure-Dir $destDir
  $dest = Join-Path $destDir $originalName
  if (Test-Path -LiteralPath $dest) {
    $base = [System.IO.Path]::GetFileNameWithoutExtension($originalName)
    $ext = [System.IO.Path]::GetExtension($originalName)
    $dest = Join-Path $destDir ("{0}_{1}{2}" -f $base, (Get-Sha256 $file.FullName).Substring(0,12), $ext)
  }
  Copy-Item -LiteralPath $file.FullName -Destination $dest -Force
  $srcSha = Get-Sha256 $file.FullName
  $dstSha = Get-Sha256 $dest
  $match = ($srcSha -eq $dstSha)
  if (-not $match) { $shaMismatch += 1 }
  [void]$rows.Add([pscustomobject]@{
    kind = "ops"
    category = $category
    decision = "OPS_INTEGRATION_REFERENCE"
    source_path = $file.FullName
    stable_path = $dest
    original_file_name = $originalName
    source_sha256 = $srcSha
    stable_sha256 = $dstSha
    sha_match = $match
  })
}

$manifestCsv = Join-Path $reportRoot "STABLE_INTEGRATION_CANDIDATE_MANIFEST_V1.csv"
$manifestJson = Join-Path $reportRoot "STABLE_INTEGRATION_CANDIDATE_MANIFEST_V1.json"
$summaryMd = Join-Path $reportRoot "STABLE_INTEGRATION_CANDIDATE_SUMMARY_V1.md"
$workerReport = Join-Path $reportRoot "WORKER_REPORT_011.md"

$rows | Export-Csv -LiteralPath $manifestCsv -NoTypeInformation -Encoding UTF8
$rows | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $manifestJson -Encoding UTF8

$status = "PASS_STABLE_INTEGRATION_CANDIDATE_READY_FOR_012"
if ($shaMismatch -gt 0) { $status = "FAIL_SHA_MISMATCH" }

$runtimeCount = @($rows | Where-Object { $_.kind -eq 'runtime' }).Count
$opsCount = @($rows | Where-Object { $_.kind -eq 'ops' }).Count
$queueCount = @($rows | Where-Object { $_.category -eq 'P0_DAILY_QUEUE_RUNNER' -and $_.kind -eq 'runtime' }).Count
$browserCount = @($rows | Where-Object { $_.category -eq 'P0_GPT_BROWSER_BRIDGE' -and $_.kind -eq 'runtime' }).Count
$pcAgentCount = @($rows | Where-Object { $_.category -eq 'P0_PC_AGENT_ROUTING_CORE' -and $_.kind -eq 'runtime' }).Count

$summary = @"
# Source Factory Stable Integration Candidate V1

generated_at: $(Get-Date -Format o)
runtime_import_dir: $runtimeRoot
ops_import_dir: $opsRoot
stable_candidate_root: $stableRoot
ops_candidate_root: $opsCandidateRoot

## Summary

| Item | Count |
|---|---:|
| Runtime input files | $($runtimeFiles.Count) |
| Runtime stable candidates | $runtimeCount |
| OPS input files | $($opsFiles.Count) |
| OPS reference candidates | $opsCount |
| Queue runtime candidates | $queueCount |
| GPT browser bridge runtime candidates | $browserCount |
| PC agent runtime candidates | $pcAgentCount |
| Filename collisions handled | $collisionCount |
| SHA mismatch | $shaMismatch |

## Status

$status

## Policy

- This stage copies files to src/integration_candidates/, not final stable runtime modules.
- Existing src files are not overwritten.
- Hash prefixes are removed from candidate filenames when safe.
- 012 must run syntax verify again against stable candidate paths.
- Final module merge requires Commander approval after 012 PASS.
"@
$summary | Set-Content -LiteralPath $summaryMd -Encoding UTF8
$summary | Set-Content -LiteralPath $workerReport -Encoding UTF8

Write-Host "SOURCE_FACTORY_STABLE_INTEGRATION_CANDIDATE_V1_COMPLETE"
Write-Host "Status=$status"
Write-Host "StableCandidateRoot=$stableRoot"
Write-Host "OpsCandidateRoot=$opsCandidateRoot"
Write-Host "RuntimeCandidates=$runtimeCount"
Write-Host "OpsCandidates=$opsCount"
Write-Host "ShaMismatch=$shaMismatch"
Write-Host "ManifestCsv=$manifestCsv"
