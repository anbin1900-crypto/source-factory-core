$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'V6.Common.ps1')
$paths=Initialize-YollaV6Directories
$script=Join-Path $paths.Root 'V6.Executor.ps1'
if(-not(Test-Path -LiteralPath $script)){throw 'V6_EXECUTOR_NOT_INSTALLED'}
$existing=@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {$_.Name-eq'powershell.exe' -and $_.CommandLine-like('*V6.Executor.ps1*')})
if($existing.Count-gt0){Write-Output ('YOLLA_V6_EXECUTOR_ALREADY_RUNNING PID='+$existing[0].ProcessId);exit 0}
$previousRoot=[Environment]::GetEnvironmentVariable('YOLLA_V6_ROOT','Process')
try{
  [Environment]::SetEnvironmentVariable('YOLLA_V6_ROOT',$paths.Root,'Process')
  $arguments='-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "{0}"' -f $script
  $process=Start-Process -FilePath 'powershell.exe' -WorkingDirectory $paths.Root -ArgumentList $arguments -WindowStyle Hidden -PassThru
}finally{
  [Environment]::SetEnvironmentVariable('YOLLA_V6_ROOT',$previousRoot,'Process')
}
Write-Output ('YOLLA_V6_EXECUTOR_STARTED PID='+$process.Id)
