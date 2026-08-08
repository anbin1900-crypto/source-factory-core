$ErrorActionPreference='Stop'
Set-StrictMode -Version 2

function Get-YollaV6Root {
  if($env:YOLLA_V6_ROOT){return [IO.Path]::GetFullPath($env:YOLLA_V6_ROOT)}
  return 'E:\YOLLA\panel-v6'
}

function Get-YollaV6Paths {
  $root=Get-YollaV6Root
  return [ordered]@{
    Root=$root
    Releases=(Join-Path $root 'releases')
    Release=(Join-Path $root 'releases\6.0.0')
    State=(Join-Path $root 'state')
    Profile=(Join-Path $root 'profile')
    Logs=(Join-Path $root 'logs')
    Receipts=(Join-Path $root 'receipts')
    Imports=(Join-Path $root 'imports')
    Staging=(Join-Path $root 'staging')
    Dependencies=(Join-Path $root 'dependencies')
    Electron=(Join-Path $root 'dependencies\electron\electron.exe')
    Control=(Join-Path $root 'control')
    Executor=(Join-Path $root 'executor')
    Inbox=(Join-Path $root 'executor\inbox')
    Processing=(Join-Path $root 'executor\processing')
    Archive=(Join-Path $root 'executor\archive')
    ExecutorReceipts=(Join-Path $root 'executor\receipts')
  }
}

function Initialize-YollaV6Directories {
  $p=Get-YollaV6Paths
  @($p.Root,$p.Releases,$p.State,$p.Profile,$p.Logs,$p.Receipts,$p.Imports,$p.Staging,$p.Dependencies,$p.Control,$p.Executor,$p.Inbox,$p.Processing,$p.Archive,$p.ExecutorReceipts) |
    ForEach-Object { New-Item -ItemType Directory -Force -Path $_ | Out-Null }
  return $p
}

function Write-YollaV6JsonAtomic {
  param([Parameter(Mandatory=$true)][string]$Path,[Parameter(Mandatory=$true)]$Value)
  $parent=Split-Path -Parent $Path
  if($parent){New-Item -ItemType Directory -Force -Path $parent | Out-Null}
  $temp=$Path+'.tmp-'+$PID+'-'+[DateTime]::UtcNow.Ticks
  $Value | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $temp -Encoding UTF8
  Move-Item -LiteralPath $temp -Destination $Path -Force
}

function New-YollaV6ProcessStartInfo {
  param(
    [Parameter(Mandatory=$true)][string]$FileName,
    [Parameter(Mandatory=$true)][string]$WorkingDirectory,
    [Parameter(Mandatory=$true)][string]$Arguments,
    [hashtable]$EnvironmentVariables=@{}
  )
  $psi=New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName=$FileName
  $psi.WorkingDirectory=$WorkingDirectory
  $psi.UseShellExecute=$false
  $psi.CreateNoWindow=$false
  $psi.Arguments=$Arguments
  foreach($key in $EnvironmentVariables.Keys){$psi.EnvironmentVariables[[string]$key]=[string]$EnvironmentVariables[$key]}
  return $psi
}

function Get-YollaV6Status {
  $p=Get-YollaV6Paths
  $panel=@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -eq 'electron.exe' -and $_.CommandLine -like ('*'+$p.Release+'*')
  } | Select-Object ProcessId,Name,CommandLine)
  $control=@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -eq 'electron.exe' -and $_.CommandLine -like ('*'+(Join-Path $p.Control 'v6_mcp_server.cjs')+'*')
  } | Select-Object ProcessId,Name,CommandLine)
  return [ordered]@{
    schema_version='YOLLA_PANEL_V6_STATUS_V1'
    namespace='YOLLA_PANEL_V6'
    root=$p.Root
    release_exists=(Test-Path -LiteralPath $p.Release)
    state_exists=(Test-Path -LiteralPath $p.State)
    profile_exists=(Test-Path -LiteralPath $p.Profile)
    electron_exists=(Test-Path -LiteralPath $p.Electron)
    panel_processes=$panel
    control_processes=$control
    queue_depth=@(Get-ChildItem -LiteralPath $p.Inbox -Filter '*.json' -File -ErrorAction SilentlyContinue).Count
    legacy_write_count=0
    observed_at=(Get-Date).ToString('o')
  }
}
