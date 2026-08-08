$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'V6.Common.ps1')
$paths=Initialize-YollaV6Directories
$script=Join-Path $paths.Root 'V6.Executor.ps1'
if(-not(Test-Path -LiteralPath $script)){throw 'V6_EXECUTOR_NOT_INSTALLED'}
$existing=@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {$_.Name-eq'powershell.exe' -and $_.CommandLine-like('*V6.Executor.ps1*')})
if($existing.Count-gt0){Write-Output ('YOLLA_V6_EXECUTOR_ALREADY_RUNNING PID='+$existing[0].ProcessId);exit 0}
$psi=New-YollaV6ProcessStartInfo -FileName 'powershell.exe' -WorkingDirectory $paths.Root -Arguments ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "{0}"' -f $script) -EnvironmentVariables @{YOLLA_V6_ROOT=$paths.Root}
$psi.CreateNoWindow=$true
$process=[System.Diagnostics.Process]::Start($psi)
Write-Output ('YOLLA_V6_EXECUTOR_STARTED PID='+$process.Id)
