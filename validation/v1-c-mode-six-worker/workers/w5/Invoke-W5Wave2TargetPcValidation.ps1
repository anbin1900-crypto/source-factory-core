[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$SupplementZip,
  [string]$ExpectedSha256 = 'fd60e47b6134ee06bd568941da66e45d158bc660557f624540f2a61589f7d7ea',
  [switch]$ExecuteInstall,
  [switch]$ExecuteRollback
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Work = Join-Path $env:TEMP ('yolla-c6w5-wave2-' + [guid]::NewGuid().ToString('N'))
$Evidence = Join-Path $Root 'target-pc-evidence'
New-Item -ItemType Directory -Path $Work,$Evidence -Force | Out-Null
try {
  $Observed = (Get-FileHash -LiteralPath $SupplementZip -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($Observed -ne $ExpectedSha256.ToLowerInvariant()) { throw "SUPPLEMENT_SHA256_MISMATCH:$Observed" }
  Expand-Archive -LiteralPath $SupplementZip -DestinationPath $Work -Force
  $PackageRoot = Join-Path $Work 'v1_c_wave2_supplement'
  $TestScript = Join-Path $Root 'test_wave2_background_install_log.cjs'
  $Offline = & node $TestScript $PackageRoot 2>&1
  if ($LASTEXITCODE -ne 0) { throw "W5_OFFLINE_TEST_FAILED:$Offline" }
  $InstallStatus = 'NOT_REQUESTED'
  $RollbackStatus = 'NOT_REQUESTED'
  if ($ExecuteInstall) {
    $Installer = Join-Path $PackageRoot 'installer-v510241\install_v510241.ps1'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Installer
    if ($LASTEXITCODE -ne 0) { throw "TARGET_PC_INSTALL_FAILED:$LASTEXITCODE" }
    $InstallStatus = 'PASS'
  }
  if ($ExecuteRollback) {
    if (-not $ExecuteInstall) { throw 'ROLLBACK_REQUIRES_EXECUTE_INSTALL' }
    $Rollback = Join-Path $PackageRoot 'installer-v510241\ROLLBACK_AI_YOLLA_PANEL_WORKSPACE_V5_10_2_4_1.ps1'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Rollback
    if ($LASTEXITCODE -ne 0) { throw "TARGET_PC_ROLLBACK_FAILED:$LASTEXITCODE" }
    $RollbackStatus = 'PASS'
  }
  $OfflineResult = ($Offline | Out-String | ConvertFrom-Json)
  $Receipt = [ordered]@{
    schema_version = 'C6W5_WAVE2_TARGET_PC_RECEIPT_V1'
    control_id = 'V1-C-MODE-6W-VALIDATION-CYCLE-002'
    wave_id = 'V1-C-MODE-6W-WAVE-002'
    command_id = 'C6W-W2-W5-BACKGROUND-INSTALL-LOG'
    supplement_sha256 = $Observed
    offline_assertions = $OfflineResult.assertion_count
    offline_status = 'PASS'
    install_status = $InstallStatus
    rollback_status = $RollbackStatus
    live_pass_claimed = ($InstallStatus -eq 'PASS' -and (-not $ExecuteRollback -or $RollbackStatus -eq 'PASS'))
    executed_at = (Get-Date).ToString('o')
  }
  $ReceiptPath = Join-Path $Evidence ('C6W5_WAVE2_TARGET_PC_RECEIPT_' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json')
  $Receipt | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $ReceiptPath -Encoding UTF8
  Write-Host ('RECEIPT=' + $ReceiptPath)
  Write-Host 'PANEL | ROLE=AUTOMATION-C-W5 | WAVE=V1-C-MODE-6W-WAVE-002 | COMMAND_ID=C6W-W2-W5-BACKGROUND-INSTALL-LOG | STATUS=END'
} finally {
  Remove-Item -LiteralPath $Work -Recurse -Force -ErrorAction SilentlyContinue
}
