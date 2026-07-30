param(
  [Parameter(Mandatory=$true)]
  [string]$ReviewDir
)

$ErrorActionPreference = 'Stop'

function Resolve-FullPath {
  param([Parameter(Mandatory=$true)][string]$Path)
  return (Resolve-Path -LiteralPath $Path).Path
}

function Ensure-Dir {
  param([Parameter(Mandatory=$true)][string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
  }
}

function Get-Sha256Lower {
  param([Parameter(Mandatory=$true)][string]$Path)
  return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

function Get-RelativePathLegacy {
  param(
    [Parameter(Mandatory=$true)][string]$BasePath,
    [Parameter(Mandatory=$true)][string]$FullPath
  )
  $base = (Resolve-Path -LiteralPath $BasePath).Path.TrimEnd('\','/')
  $full = (Resolve-Path -LiteralPath $FullPath).Path
  if ($full.StartsWith($base, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $full.Substring($base.Length).TrimStart('\','/')
  }
  return $full
}

function Copy-CandidateTree {
  param(
    [Parameter(Mandatory=$true)][string]$SourceRoot,
    [Parameter(Mandatory=$true)][string]$DestRoot,
    [Parameter(Mandatory=$true)][string]$Decision,
    [Parameter(Mandatory=$true)][string]$Kind
  )

  $rows = New-Object System.Collections.ArrayList
  $mismatches = 0
  $copied = 0

  if (-not (Test-Path -LiteralPath $SourceRoot)) {
    return @{ Rows=$rows; Copied=0; Mismatches=0 }
  }

  $files = @(Get-ChildItem -LiteralPath $SourceRoot -Recurse -File | Sort-Object FullName)
  foreach ($file in $files) {
    $rel = Get-RelativePathLegacy -BasePath $SourceRoot -FullPath $file.FullName
    $dest = Join-Path $DestRoot $rel
    $destDir = Split-Path -Parent $dest
    Ensure-Dir $destDir
    Copy-Item -LiteralPath $file.FullName -Destination $dest -Force

    $srcSha = Get-Sha256Lower $file.FullName
    $dstSha = Get-Sha256Lower $dest
    $match = ($srcSha -eq $dstSha)
    if (-not $match) { $mismatches++ }
    $copied++

    [void]$rows.Add([pscustomobject]@{
      kind = $Kind
      decision = $Decision
      source_path = $file.FullName
      relative_path = $rel
      promoted_path = $dest
      source_sha256 = $srcSha
      promoted_sha256 = $dstSha
      sha_match = $match
    })
  }

  return @{ Rows=$rows; Copied=$copied; Mismatches=$mismatches }
}

$reviewRoot = Resolve-FullPath $ReviewDir
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptRoot
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'

$runtimeSourceRoot = Join-Path $reviewRoot 'runtime_candidate'
$opsSourceRoot = Join-Path $reviewRoot 'ops_candidate'

$runtimeDestRoot = Join-Path $repoRoot ("src\runtime_import\p0_runtime_import_$stamp")
$opsDestRoot = Join-Path $repoRoot ("ops_import\p0_ops_import_$stamp")
$reportsRoot = Join-Path $repoRoot ("reports\runtime_src_import_$stamp")

Ensure-Dir $runtimeDestRoot
Ensure-Dir $opsDestRoot
Ensure-Dir $reportsRoot

$runtimeResult = Copy-CandidateTree -SourceRoot $runtimeSourceRoot -DestRoot $runtimeDestRoot -Decision 'SRC_READY_REVIEW_TO_RUNTIME_IMPORT' -Kind 'runtime'
$opsResult = Copy-CandidateTree -SourceRoot $opsSourceRoot -DestRoot $opsDestRoot -Decision 'OPS_READY_REVIEW_TO_OPS_IMPORT' -Kind 'ops'

$allRows = New-Object System.Collections.ArrayList
foreach ($r in $runtimeResult.Rows) { [void]$allRows.Add($r) }
foreach ($r in $opsResult.Rows) { [void]$allRows.Add($r) }

$manifestCsv = Join-Path $reportsRoot 'RUNTIME_SRC_IMPORT_MANIFEST_V2.csv'
$manifestJson = Join-Path $reportsRoot 'RUNTIME_SRC_IMPORT_MANIFEST_V2.json'
$summaryMd = Join-Path $reportsRoot 'RUNTIME_SRC_IMPORT_SUMMARY_V2.md'
$workerReport = Join-Path $reportsRoot 'WORKER_REPORT_009B.md'

$allRows | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $manifestCsv
$allRows | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 -Path $manifestJson

$runtimeCandidates = 0
$opsCandidates = 0
if (Test-Path -LiteralPath $runtimeSourceRoot) { $runtimeCandidates = @(Get-ChildItem -LiteralPath $runtimeSourceRoot -Recurse -File).Count }
if (Test-Path -LiteralPath $opsSourceRoot) { $opsCandidates = @(Get-ChildItem -LiteralPath $opsSourceRoot -Recurse -File).Count }

$status = 'PASS_RUNTIME_SRC_IMPORT_READY_FOR_010'
if ($runtimeResult.Mismatches -ne 0 -or $opsResult.Mismatches -ne 0) { $status = 'FAIL_SHA_MISMATCH' }

$summary = @"
# Source Factory Runtime SRC Import V2

generated_at: $(Get-Date -Format o)
review_dir: $reviewRoot
runtime_dest_root: $runtimeDestRoot
ops_dest_root: $opsDestRoot

## Summary

| Item | Count |
|---|---:|
| Runtime candidates | $runtimeCandidates |
| Runtime copied | $($runtimeResult.Copied) |
| OPS candidates | $opsCandidates |
| OPS copied | $($opsResult.Copied) |
| Runtime SHA mismatch | $($runtimeResult.Mismatches) |
| OPS SHA mismatch | $($opsResult.Mismatches) |

## Status

$status

## Policy

- This V2 script is compatible with Windows PowerShell 5.x.
- It does not use System.IO.Path.GetRelativePath.
- Runtime candidates are copied to src/runtime_import/, not merged into existing production modules.
- OPS candidates are copied to ops_import/.
- Final integration into stable src modules requires 010 static verify and Commander approval.
"@
$summary | Set-Content -Encoding UTF8 -Path $summaryMd

$report = @"
# WORKER_REPORT_009B

status: $status
script: tools/source_factory_promote_runtime_candidates_to_src_v2.ps1
review_dir: $reviewRoot
runtime_candidates: $runtimeCandidates
runtime_copied: $($runtimeResult.Copied)
ops_candidates: $opsCandidates
ops_copied: $($opsResult.Copied)
runtime_sha_mismatch: $($runtimeResult.Mismatches)
ops_sha_mismatch: $($opsResult.Mismatches)
production_side_effect: false
external_side_effect_count: 0
completed_at: $(Get-Date -Format o)
"@
$report | Set-Content -Encoding UTF8 -Path $workerReport

Write-Host 'SOURCE_FACTORY_RUNTIME_SRC_IMPORT_V2_COMPLETE'
Write-Host "Status=$status"
Write-Host "ReviewDir=$reviewRoot"
Write-Host "RuntimeCandidates=$runtimeCandidates"
Write-Host "RuntimeCopied=$($runtimeResult.Copied)"
Write-Host "OpsCandidates=$opsCandidates"
Write-Host "OpsCopied=$($opsResult.Copied)"
Write-Host "RuntimeShaMismatch=$($runtimeResult.Mismatches)"
Write-Host "OpsShaMismatch=$($opsResult.Mismatches)"
Write-Host "ManifestCsv=$manifestCsv"
