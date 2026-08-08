param([string]$DestinationRoot='')
$ErrorActionPreference='Stop'

. (Join-Path $PSScriptRoot 'V6.Common.ps1')
$paths=Initialize-YollaV6Directories
$stamp=Get-Date -Format 'yyyyMMdd_HHmmss'
$destination=if($DestinationRoot){[IO.Path]::GetFullPath($DestinationRoot)}else{Join-Path $paths.Imports ('snapshot-'+$stamp)}
New-Item -ItemType Directory -Force -Path $destination | Out-Null

$sources=@(
  [ordered]@{name='LEGACY_V5_STATE';root='E:\SOURCE FACTORY\.yolla\yolla-workspace-v5-2'},
  [ordered]@{name='MINIMAL_V1_STATE';root='E:\SOURCE FACTORY\.yolla\yolla-workspace-minimal-v1'}
)
$copied=New-Object System.Collections.ArrayList
$candidates=@('workspace_state.json','C_MODE_STATE.json','REPEAT_COMMANDS.json','SCHEDULED_COMMANDS.json','LATEST_RUNTIME_RECEIPT.json')
foreach($source in $sources){
  if(-not(Test-Path -LiteralPath $source.root)){continue}
  $sourceDestination=Join-Path $destination $source.name
  New-Item -ItemType Directory -Force -Path $sourceDestination | Out-Null
  foreach($name in $candidates){
    $matches=@(Get-ChildItem -LiteralPath $source.root -Recurse -File -Filter $name -ErrorAction SilentlyContinue | Select-Object -First 20)
    foreach($match in $matches){
      $relative=$match.FullName.Substring($source.root.Length).TrimStart('\')
      $target=Join-Path $sourceDestination $relative
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
      Copy-Item -LiteralPath $match.FullName -Destination $target -Force
      [void]$copied.Add([ordered]@{source=$match.FullName;snapshot=$target;size=$match.Length;sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $target).Hash.ToLower()})
    }
  }
}

$preferred=@((Join-Path $destination 'MINIMAL_V1_STATE\workspace_state.json'),(Join-Path $destination 'LEGACY_V5_STATE\workspace_state.json')) |
  Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
$importState=$null
if($preferred){$importState=Join-Path $destination 'workspace_state.json';Copy-Item -LiteralPath $preferred -Destination $importState -Force}
$manifest=[ordered]@{
  schema_version='YOLLA_PANEL_V6_IMPORT_SNAPSHOT_V1'
  namespace='YOLLA_PANEL_V6'
  snapshot_root=$destination
  imported_state_path=$importState
  source_write_count=0
  source_delete_count=0
  legacy_pending_commands_policy='QUARANTINE_DO_NOT_REISSUE'
  legacy_pending_command_ids=@('007','008','009','010')
  profile_secret_copy=false
  observed_read_only_dependencies=@('E:\SOURCE FACTORY\source-factory-active-core')
  copied_files=@($copied)
  created_at=(Get-Date).ToString('o')
}
Write-YollaV6JsonAtomic -Path (Join-Path $destination 'SNAPSHOT_MANIFEST.json') -Value $manifest
Write-Output $destination
