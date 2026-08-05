param([string]$BaseReleasePath)
$ReleaseRoot = 'E:\SOURCE FACTORY\.yolla\yolla-panel\releases'
$BaselineVersion = '5.10.2.4.0'
$TargetVersion = '5.10.2.4.2-rc7'
$LauncherPath = 'E:\SOURCE FACTORY\RUN_AI_YOLLA_PANEL_WORKSPACE_V5_10_2_3_7.bat'
$ResolverPath = Join-Path $PSScriptRoot 'target_pc_runtime_locator.cjs'
$ResolverReceiptPath = Join-Path $PSScriptRoot 'receipt.json'
$CandidateInputPath = Join-Path $ReleaseRoot $TargetVersion
$ResolverArgs = @($ResolverPath,'-ReleaseRoot',$ReleaseRoot,'-BaselineVersion',$BaselineVersion,'-TargetVersion',$TargetVersion,'-CandidateReleasePath',$CandidateInputPath,'-LauncherPath',$LauncherPath,'-ReceiptPath',$ResolverReceiptPath)
if ($BaseReleasePath) { $ResolverArgs += @('-BaseReleasePath',$BaseReleasePath) }
Remove-Item -LiteralPath $CandidateInputPath -Recurse -Force -ErrorAction SilentlyContinue
& node @ResolverArgs
if ($LASTEXITCODE -ne 0) { throw 'RESOLVER_FAILED' }
$ResolverReceipt = Get-Content $ResolverReceiptPath -Raw | ConvertFrom-Json
$ResolvedBaseReleasePath = $ResolverReceipt.baseline.path
$CandidateReleasePath = $ResolverReceipt.clone.candidate_release_path
$BaselineTreeSha256 = $ResolverReceipt.clone.baseline_tree_sha256
$LauncherSha256 = $ResolverReceipt.launcher.launcher_sha256
$LauncherBackupPath = $ResolverReceipt.launcher.launcher_backup_path
if ($ResolverReceipt.guessed_path_count -ne 0) { throw 'GUESSED_PATH_FORBIDDEN' }
if ($ResolverReceipt.baseline_clone_performed -ne $true) { throw 'BASELINE_CLONE_REQUIRED' }
