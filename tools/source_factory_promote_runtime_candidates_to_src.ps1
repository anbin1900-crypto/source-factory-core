param(
  [Parameter(Mandatory=$true)]
  [string]$ReviewDir
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Resolve-FullPath([string]$PathValue) {
  if ([System.IO.Path]::IsPathRooted($PathValue)) {
    return [System.IO.Path]::GetFullPath($PathValue)
  }
  return [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $PathValue))
}

function Get-Sha256([string]$PathValue) {
  return (Get-FileHash -Algorithm SHA256 -LiteralPath $PathValue).Hash.ToLowerInvariant()
}

function Remove-HashPrefix([string]$FileName) {
  if ($FileName -match '^[0-9a-fA-F]{12}_(.+)$') {
    return $Matches[1]
  }
  return $FileName
}

function Convert-CategoryToFolder([string]$CategoryName) {
  switch ($CategoryName) {
    'P0_DAILY_QUEUE_RUNNER' { return 'daily_queue_runner' }
    'P0_GPT_BROWSER_BRIDGE' { return 'gpt_browser_bridge' }
    'P0_PC_AGENT_ROUTING_CORE' { return 'pc_agent_routing_core' }
    default { return ($CategoryName.ToLowerInvariant() -replace '[^a-z0-9_\-]+','_') }
  }
}

$root = Resolve-FullPath $ReviewDir
if (-not (Test-Path -LiteralPath $root -PathType Container)) {
  throw "ReviewDir not found: $root"
}

$runtimeRoot = Join-Path $root 'runtime_candidate'
$opsRoot = Join-Path $root 'ops_candidate'
if (-not (Test-Path -LiteralPath $runtimeRoot -PathType Container)) {
  throw "runtime_candidate folder not found under: $root"
}

$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$srcOutRoot = Join-Path (Get-Location) ("src/runtime_import/p0_core_runtime_{0}" -f $stamp)
$opsOutRoot = Join-Path (Get-Location) ("ops_import/p0_core_ops_{0}" -f $stamp)
New-Item -ItemType Directory -Force -Path $srcOutRoot | Out-Null
New-Item -ItemType Directory -Force -Path $opsOutRoot | Out-Null

$runtimeFiles = @(Get-ChildItem -LiteralPath $runtimeRoot -File -Recurse | Sort-Object FullName)
$opsFiles = @()
if (Test-Path -LiteralPath $opsRoot -PathType Container) {
  $opsFiles = @(Get-ChildItem -LiteralPath $opsRoot -File -Recurse | Sort-Object FullName)
}

$runtimeRows = New-Object System.Collections.ArrayList
$opsRows = New-Object System.Collections.ArrayList
$collisions = New-Object System.Collections.ArrayList

foreach ($file in $runtimeFiles) {
  $rel = [System.IO.Path]::GetRelativePath($runtimeRoot, $file.FullName)
  $parts = $rel -split '[\\/]'
  $category = if ($parts.Length -gt 1) { $parts[0] } else { 'UNCATEGORIZED' }
  $targetFolder = Convert-CategoryToFolder $category
  $cleanName = Remove-HashPrefix $file.Name
  $targetDir = Join-Path $srcOutRoot $targetFolder
  New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
  $targetPath = Join-Path $targetDir $cleanName

  if (Test-Path -LiteralPath $targetPath) {
    $sourceShaForCollision = Get-Sha256 $file.FullName
    $existingSha = Get-Sha256 $targetPath
    if ($sourceShaForCollision -ne $existingSha) {
      [void]$collisions.Add([pscustomobject]@{
        kind = 'runtime'
        category = $category
        source_path = $file.FullName
        target_path = $targetPath
        source_sha256 = $sourceShaForCollision
        existing_sha256 = $existingSha
      })
      continue
    }
  }

  Copy-Item -LiteralPath $file.FullName -Destination $targetPath -Force
  $sourceSha = Get-Sha256 $file.FullName
  $targetSha = Get-Sha256 $targetPath
  [void]$runtimeRows.Add([pscustomobject]@{
    decision = 'RUNTIME_SRC_IMPORTED'
    category = $category
    target_group = $targetFolder
    original_file_name = $file.Name
    promoted_file_name = $cleanName
    source_path = $file.FullName
    target_path = $targetPath
    source_sha256 = $sourceSha
    target_sha256 = $targetSha
    sha_match = ($sourceSha -eq $targetSha)
  })
}

foreach ($file in $opsFiles) {
  $rel = [System.IO.Path]::GetRelativePath($opsRoot, $file.FullName)
  $parts = $rel -split '[\\/]'
  $category = if ($parts.Length -gt 1) { $parts[0] } else { 'UNCATEGORIZED' }
  $targetFolder = Convert-CategoryToFolder $category
  $cleanName = Remove-HashPrefix $file.Name
  $targetDir = Join-Path $opsOutRoot $targetFolder
  New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
  $targetPath = Join-Path $targetDir $cleanName
  Copy-Item -LiteralPath $file.FullName -Destination $targetPath -Force
  $sourceSha = Get-Sha256 $file.FullName
  $targetSha = Get-Sha256 $targetPath
  [void]$opsRows.Add([pscustomobject]@{
    decision = 'OPS_IMPORTED_NOT_RUNTIME_SRC'
    category = $category
    target_group = $targetFolder
    original_file_name = $file.Name
    promoted_file_name = $cleanName
    source_path = $file.FullName
    target_path = $targetPath
    source_sha256 = $sourceSha
    target_sha256 = $targetSha
    sha_match = ($sourceSha -eq $targetSha)
  })
}

$reportRoot = Join-Path (Get-Location) ("reports/p0_runtime_promotion_{0}" -f $stamp)
New-Item -ItemType Directory -Force -Path $reportRoot | Out-Null
$runtimeCsv = Join-Path $reportRoot 'RUNTIME_SRC_IMPORT_MANIFEST.csv'
$opsCsv = Join-Path $reportRoot 'OPS_IMPORT_MANIFEST.csv'
$collisionCsv = Join-Path $reportRoot 'RUNTIME_IMPORT_COLLISIONS.csv'
$summaryMd = Join-Path $reportRoot 'RUNTIME_SRC_IMPORT_SUMMARY.md'
$workerReport = Join-Path $reportRoot 'WORKER_REPORT_009.md'

$runtimeRows | Export-Csv -LiteralPath $runtimeCsv -NoTypeInformation -Encoding UTF8
$opsRows | Export-Csv -LiteralPath $opsCsv -NoTypeInformation -Encoding UTF8
$collisions | Export-Csv -LiteralPath $collisionCsv -NoTypeInformation -Encoding UTF8

$runtimeMismatch = @($runtimeRows | Where-Object { -not $_.sha_match }).Count
$opsMismatch = @($opsRows | Where-Object { -not $_.sha_match }).Count
$status = if (($collisions.Count -eq 0) -and ($runtimeMismatch -eq 0) -and ($opsMismatch -eq 0)) { 'PASS_RUNTIME_SRC_IMPORT_READY_FOR_010' } else { 'YELLOW_REVIEW_REQUIRED' }

$summary = @()
$summary += '# Source Factory Runtime src Import Summary'
$summary += ''
$summary += "generated_at: $(Get-Date -Format o)"
$summary += "review_dir: $root"
$summary += "src_out_root: $srcOutRoot"
$summary += "ops_out_root: $opsOutRoot"
$summary += ''
$summary += '## Summary'
$summary += ''
$summary += '| Item | Count |'
$summary += '|---|---:|'
$summary += "| Runtime candidates found | $($runtimeFiles.Count) |"
$summary += "| Runtime copied to src/runtime_import | $($runtimeRows.Count) |"
$summary += "| Ops candidates found | $($opsFiles.Count) |"
$summary += "| Ops copied to ops_import | $($opsRows.Count) |"
$summary += "| Runtime SHA mismatch | $runtimeMismatch |"
$summary += "| Ops SHA mismatch | $opsMismatch |"
$summary += "| Collisions | $($collisions.Count) |"
$summary += ''
$summary += '## Status'
$summary += ''
$summary += $status
$summary += ''
$summary += '## Policy'
$summary += ''
$summary += '- This stage imports only runtime_candidate files into src/runtime_import/.'
$summary += '- It does not merge these files into existing production src modules.'
$summary += '- ops_candidate files are separated under ops_import/.'
$summary += '- docs/prompt/evidence files remain outside runtime src.'
$summary += '- 010 must normalize module names, exports, package scripts, and tests before production runtime use.'
$summary | Set-Content -LiteralPath $summaryMd -Encoding UTF8
$summary | Set-Content -LiteralPath $workerReport -Encoding UTF8

Write-Host 'SOURCE_FACTORY_RUNTIME_SRC_IMPORT_COMPLETE'
Write-Host "Status=$status"
Write-Host "SrcOutRoot=$srcOutRoot"
Write-Host "OpsOutRoot=$opsOutRoot"
Write-Host "RuntimeCandidates=$($runtimeFiles.Count)"
Write-Host "RuntimeCopied=$($runtimeRows.Count)"
Write-Host "OpsCandidates=$($opsFiles.Count)"
Write-Host "OpsCopied=$($opsRows.Count)"
Write-Host "Collisions=$($collisions.Count)"
Write-Host "RuntimeShaMismatch=$runtimeMismatch"
Write-Host "OpsShaMismatch=$opsMismatch"
Write-Host "Summary=$summaryMd"
