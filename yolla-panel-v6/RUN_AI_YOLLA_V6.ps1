$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'V6.Common.ps1')
$paths=Initialize-YollaV6Directories
if(-not(Test-Path -LiteralPath $paths.Electron)){throw 'V6_ELECTRON_NOT_INSTALLED'}
if(-not(Test-Path -LiteralPath (Join-Path $paths.Release 'main.js'))){throw 'V6_RELEASE_NOT_INSTALLED'}
$existing=@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {$_.Name-eq'electron.exe' -and $_.CommandLine-like('*'+$paths.Release+'*')})
if($existing.Count-gt0){Write-Output ('YOLLA_V6_ALREADY_RUNNING PID='+$existing[0].ProcessId);exit 0}
$environment=@{
  YOLLA_V6_ROOT=$paths.Root
  YOLLA_V6_STATE_ROOT=$paths.State
  YOLLA_V6_PROFILE_ROOT=$paths.Profile
}
$psi=New-YollaV6ProcessStartInfo -FileName $paths.Electron -WorkingDirectory $paths.Release -Arguments ('"{0}"' -f $paths.Release) -EnvironmentVariables $environment
$process=[System.Diagnostics.Process]::Start($psi)
$receipt=[ordered]@{schema_version='YOLLA_PANEL_V6_START_RECEIPT_V1';status='STARTED';pid=$process.Id;release=$paths.Release;state=$paths.State;profile=$paths.Profile;legacy_write_count=0;started_at=(Get-Date).ToString('o')}
Write-YollaV6JsonAtomic -Path (Join-Path $paths.Receipts 'LATEST_START_RECEIPT.json') -Value $receipt
Write-Output ('YOLLA_V6_STARTED PID='+$process.Id)
