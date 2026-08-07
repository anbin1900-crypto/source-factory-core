param([string]$BaseReleasePath)
$ErrorActionPreference = 'Stop'
$ReleaseRoot = 'E:\SOURCE FACTORY\.yolla\yolla-panel\releases'
$BaselineVersion = '5.10.2.4.0'
$TargetVersion = '5.10.2.4.2-rc7'
$LauncherPath = 'E:\SOURCE FACTORY\RUN_AI_YOLLA_PANEL_WORKSPACE_V5_10_2_3_7.bat'
$ResolverPath = Join-Path $PSScriptRoot 'target_pc_runtime_locator.cjs'
$ResolverReceiptPath = Join-Path $PSScriptRoot 'RC7_RESOLVER_RECEIPT.json'
$CandidateInputPath = Join-Path $ReleaseRoot $TargetVersion
$ResolverArgs = @(
  $ResolverPath,
  '-ReleaseRoot', $ReleaseRoot,
  '-BaselineVersion', $BaselineVersion,
  '-TargetVersion', $TargetVersion,
  '-CandidateReleasePath', $CandidateInputPath,
  '-LauncherPath', $LauncherPath,
  '-ReceiptPath', $ResolverReceiptPath
)
if ($BaseReleasePath) { $ResolverArgs += @('-BaseReleasePath', $BaseReleasePath) }
& node @ResolverArgs
if ($LASTEXITCODE -ne 0) { throw "RESOLVER_FAILED:$LASTEXITCODE" }
$ResolverReceipt = Get-Content -LiteralPath $ResolverReceiptPath -Raw | ConvertFrom-Json
if ($ResolverReceipt.guessed_path_count -ne 0) { throw 'GUESSED_PATH_FORBIDDEN' }
if ($ResolverReceipt.baseline_clone_performed -ne $true) { throw 'BASELINE_CLONE_REQUIRED' }
$ResolvedBaseReleasePath = $ResolverReceipt.baseline.path
$CandidateReleasePath = $ResolverReceipt.clone.candidate_release_path
$BaselineTreeSha256 = $ResolverReceipt.clone.baseline_tree_sha256
$LauncherSha256 = $ResolverReceipt.launcher.launcher_sha256
$LauncherBackupPath = $ResolverReceipt.launcher.launcher_backup_path
if (-not $ResolvedBaseReleasePath -or -not $CandidateReleasePath -or -not $BaselineTreeSha256) { throw 'RESOLVER_OUTPUT_INCOMPLETE' }
if (-not $LauncherSha256 -or -not (Test-Path -LiteralPath $LauncherBackupPath)) { throw 'LAUNCHER_BACKUP_OUTPUT_INCOMPLETE' }
# All later overlay, smoke and launcher-switch operations use only $CandidateReleasePath and receipt fields.
