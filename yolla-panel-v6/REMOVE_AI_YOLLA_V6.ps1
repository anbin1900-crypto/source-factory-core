$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'V6.Common.ps1')
$paths=Get-YollaV6Paths
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
  ($_.Name-eq'electron.exe' -and ($_.CommandLine-like('*'+$paths.Release+'*') -or $_.CommandLine-like('*'+(Join-Path $paths.Control 'v6_mcp_server.cjs')+'*'))) -or
  ($_.Name-eq'powershell.exe' -and $_.CommandLine-like('*V6.Executor.ps1*'))
} | ForEach-Object {Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue}
@('YOLLA_PANEL_V6_EXECUTOR','YOLLA_PANEL_V6_CONTROL') | ForEach-Object {& schtasks.exe /Delete /TN $_ /F 2>$null | Out-Null}
Write-Output 'YOLLA_V6_PROCESSES_AND_TASKS_REMOVED_STATE_PROFILE_RELEASE_PRESERVED'
