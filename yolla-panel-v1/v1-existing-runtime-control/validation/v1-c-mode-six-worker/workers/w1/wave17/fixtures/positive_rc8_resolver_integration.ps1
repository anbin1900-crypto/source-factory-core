param(
  [string]$BundleRoot = $PSScriptRoot,
  [string]$ReleaseRoot = 'E:\SOURCE FACTORY\.yolla\yolla-panel\releases',
  [string]$BaseReleasePath,
  [string]$CandidateReleasePath = 'E:\SOURCE FACTORY\.yolla\yolla-panel\releases\5.10.2.4.2-rc8',
  [string]$LauncherPath = 'E:\SOURCE FACTORY\RUN_AI_YOLLA_PANEL_WORKSPACE_V5_10_2_3_7.bat',
  [string]$StateRoot = 'E:\SOURCE FACTORY\.yolla\yolla-workspace-v5-2'
)
$ErrorActionPreference = 'Stop'
$ResolverPath = Join-Path $BundleRoot '..\wave15\target_pc_runtime_locator.cjs'
$ExpectedResolverSha256 = 'a6eaeef66a2dfc59b646fb63ab62d6bff12361b79f13d97bb4022eaa01255ea6'
$ExpectedResolverSize = 10563
$ResolverReceiptPath = Join-Path $env:TEMP 'YOLLA_RC8_RESOLVER_RECEIPT.json'

if (-not (Test-Path -LiteralPath $ResolverPath -PathType Leaf)) { throw 'EXACT_RESOLVER_MISSING' }
if ((Get-Item -LiteralPath $ResolverPath).Length -ne $ExpectedResolverSize) { throw 'EXACT_RESOLVER_SIZE_MISMATCH' }
if ((Get-FileHash -LiteralPath $ResolverPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $ExpectedResolverSha256) {
  throw 'EXACT_RESOLVER_SHA256_MISMATCH'
}

$ResolverArgs = @(
  '-ReleaseRoot', $ReleaseRoot,
  '-BaselineVersion', '5.10.2.4.0',
  '-TargetVersion', '5.10.2.4.2-rc8',
  '-CandidateReleasePath', $CandidateReleasePath,
  '-LauncherPath', $LauncherPath,
  '-StateRoot', $StateRoot,
  '-ReceiptPath', $ResolverReceiptPath
)
if ($BaseReleasePath) { $ResolverArgs += @('-BaseReleasePath', $BaseReleasePath) }

& node $ResolverPath @ResolverArgs
if ($LASTEXITCODE -ne 0) { throw "EXACT_RESOLVER_FAILED:$LASTEXITCODE" }
$ResolverReceipt = Get-Content -LiteralPath $ResolverReceiptPath -Raw | ConvertFrom-Json

if ($ResolverReceipt.guessed_path_count -ne 0) { throw 'GUESSED_PATH_COUNT_NONZERO' }
if ($ResolverReceipt.baseline_clone_performed -ne $true) { throw 'BASELINE_CLONE_NOT_PERFORMED' }
if (-not $ResolverReceipt.baseline.path) { throw 'RESOLVED_BASELINE_PATH_MISSING' }
if (-not $ResolverReceipt.clone.candidate_release_path) { throw 'RESOLVED_CANDIDATE_PATH_MISSING' }
if (-not $ResolverReceipt.clone.baseline_tree_sha256) { throw 'BASELINE_TREE_SHA256_MISSING' }
if (-not $ResolverReceipt.launcher.launcher_sha256) { throw 'LAUNCHER_SHA256_MISSING' }
if (-not $ResolverReceipt.launcher.launcher_backup_path) { throw 'LAUNCHER_BACKUP_PATH_MISSING' }

$ResolvedBaseReleasePath = $ResolverReceipt.baseline.path
$ResolvedCandidateReleasePath = $ResolverReceipt.clone.candidate_release_path
$ResolvedTreeSha256 = $ResolverReceipt.clone.baseline_tree_sha256
$ResolvedLauncherSha256 = $ResolverReceipt.launcher.launcher_sha256
$ResolvedLauncherBackupPath = $ResolverReceipt.launcher.launcher_backup_path

[ordered]@{
  status = 'PASS_RESOLVER_INTEGRATION_FIXTURE'
  base_release_path = $ResolvedBaseReleasePath
  candidate_release_path = $ResolvedCandidateReleasePath
  baseline_tree_sha256 = $ResolvedTreeSha256
  launcher_sha256 = $ResolvedLauncherSha256
  launcher_backup_path = $ResolvedLauncherBackupPath
  guessed_path_count = 0
} | ConvertTo-Json -Depth 5
