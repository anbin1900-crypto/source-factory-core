param(
  [string]$ReleaseRoot,
  [string]$BaseReleasePath,
  [string]$CandidateReleasePath,
  [string]$LauncherPath,
  [string]$StateRoot
)
$ErrorActionPreference = 'Stop'
$ResolverPath = Join-Path $PSScriptRoot 'rc7_simplified_target_pc_runtime_locator.cjs'
$ReceiptPath = Join-Path $env:TEMP 'RC7_SIMPLE_RECEIPT.json'

if (-not $BaseReleasePath) {
  $BaseReleasePath = Get-ChildItem -LiteralPath $ReleaseRoot -Directory |
    Where-Object { $_.Name -eq '5.10.2.4.0' } |
    Select-Object -First 1 -ExpandProperty FullName
}
Copy-Item -LiteralPath $BaseReleasePath -Destination $CandidateReleasePath -Recurse
[IO.File]::WriteAllBytes((Join-Path $StateRoot 'launcher.bak'), [IO.File]::ReadAllBytes($LauncherPath))
& node $ResolverPath --release-root $ReleaseRoot --baseline-version '5.10.2.4.0' --target-version '5.10.2.4.2-rc8' --candidate-release-path $CandidateReleasePath --launcher-path $LauncherPath --state-root $StateRoot --receipt-path $ReceiptPath
Get-Content -LiteralPath $ReceiptPath -Raw | ConvertFrom-Json | Out-Null
