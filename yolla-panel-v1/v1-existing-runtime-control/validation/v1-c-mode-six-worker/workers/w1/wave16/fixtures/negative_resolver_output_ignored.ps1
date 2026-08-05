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
& node @ResolverArgs
if ($LASTEXITCODE -ne 0) { throw 'RESOLVER_FAILED' }
$ResolverReceipt = Get-Content $ResolverReceiptPath -Raw | ConvertFrom-Json
$CandidateReleasePath = Join-Path $ReleaseRoot $TargetVersion
