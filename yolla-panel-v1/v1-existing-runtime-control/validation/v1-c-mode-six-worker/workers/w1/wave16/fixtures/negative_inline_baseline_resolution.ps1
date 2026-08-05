param([string]$BaseReleasePath)
$ReleaseRoot = 'E:\SOURCE FACTORY\.yolla\yolla-panel\releases'
$TargetVersion = '5.10.2.4.2-rc7'
$Candidate = Join-Path $ReleaseRoot $TargetVersion
if (-not $BaseReleasePath) {
  $c = @(Get-ChildItem -LiteralPath $ReleaseRoot -Directory | Where-Object { $_.Name -eq '5.10.2.4.0' })
  $BaseReleasePath = $c[0].FullName
}
Copy-Item -LiteralPath $BaseReleasePath -Destination $Candidate -Recurse
