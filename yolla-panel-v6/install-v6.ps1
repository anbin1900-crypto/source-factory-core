param([string]$Root='E:\YOLLA\panel-v6',[switch]$SkipLaunch)
$ErrorActionPreference='Stop'

$env:YOLLA_V6_ROOT=[IO.Path]::GetFullPath($Root)
. (Join-Path $PSScriptRoot 'V6.Common.ps1')
$paths=Initialize-YollaV6Directories
$installLog=Join-Path $paths.Logs 'install-v6.log'
$installReceipt=Join-Path $paths.Receipts 'INSTALL_RECEIPT_V6.json'
function Log([string]$message){$line='['+(Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff')+'] '+$message;Add-Content -LiteralPath $installLog -Value $line -Encoding UTF8;Write-Output $line}
function Receipt([string]$status,$extra){
  $value=[ordered]@{schema_version='YOLLA_PANEL_V6_INSTALL_RECEIPT_V1';status=$status;root=$paths.Root;release=$paths.Release;state=$paths.State;profile=$paths.Profile;electron=$paths.Electron;legacy_runtime_modified=false;legacy_state_modified=false;legacy_queue_reissued=false;production=false;ready=false;merge=false;observed_at=(Get-Date).ToString('o')}
  foreach($key in $extra.Keys){$value[$key]=$extra[$key]}
  Write-YollaV6JsonAtomic -Path $installReceipt -Value $value
}

try{
  Log 'STEP_1_VALIDATE_PACKAGE_MANIFEST'
  $manifestPath=Join-Path $PSScriptRoot 'RUNTIME_MANIFEST.json'
  $manifest=Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
  foreach($property in $manifest.files.PSObject.Properties){
    $source=Join-Path $PSScriptRoot $property.Name
    if(-not(Test-Path -LiteralPath $source)){throw ('PACKAGE_FILE_MISSING:'+$property.Name)}
    $hash=(Get-FileHash -Algorithm SHA256 -LiteralPath $source).Hash.ToLower()
    if($hash-ne([string]$property.Value.sha256).ToLower()){throw ('PACKAGE_HASH_MISMATCH:'+$property.Name)}
  }

  Log 'STEP_2_CREATE_READ_ONLY_IMPORT_SNAPSHOT'
  $snapshot=& (Join-Path $PSScriptRoot 'V6.Snapshot.ps1') | Select-Object -Last 1
  $importState=Join-Path $snapshot 'workspace_state.json'
  if(-not(Test-Path -LiteralPath $importState)){$importState=''}

  Log 'STEP_3_COPY_ELECTRON_DEPENDENCY_INTO_V6'
  if(-not(Test-Path -LiteralPath $paths.Electron)){
    $sourceElectron=(Get-ChildItem 'E:\SOURCE FACTORY\source-factory-active-core' -Directory -Filter 'SF_ACTIVE_CORE_*' -ErrorAction SilentlyContinue |
      Sort-Object Name -Descending | ForEach-Object {Join-Path $_.FullName 'node_modules\electron\dist'} | Where-Object {Test-Path -LiteralPath (Join-Path $_ 'electron.exe')} | Select-Object -First 1)
    if(-not$sourceElectron){throw 'ELECTRON_SOURCE_NOT_FOUND'}
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $paths.Electron) | Out-Null
    & robocopy.exe $sourceElectron (Split-Path -Parent $paths.Electron) /E /COPY:DAT /R:1 /W:1 | Out-Null
    if($LASTEXITCODE-ge8){throw ('ELECTRON_COPY_FAILED:'+$LASTEXITCODE)}
  }

  Log 'STEP_4_INSTALL_IMMUTABLE_V6_RELEASE'
  if(Test-Path -LiteralPath $paths.Release){
    foreach($property in $manifest.files.PSObject.Properties){
      if(-not$property.Name.StartsWith('runtime/')){continue}
      $relative=$property.Name.Substring(8)
      $target=Join-Path $paths.Release $relative
      if(-not(Test-Path -LiteralPath $target)){throw ('V6_RELEASE_EXISTS_DIFFERENT:MISSING:'+$relative)}
      $hash=(Get-FileHash -Algorithm SHA256 -LiteralPath $target).Hash.ToLower()
      if($hash-ne([string]$property.Value.sha256).ToLower()){throw ('V6_RELEASE_EXISTS_DIFFERENT:HASH:'+$relative)}
    }
  }else{
    New-Item -ItemType Directory -Force -Path $paths.Release | Out-Null
    Copy-Item -Path (Join-Path $PSScriptRoot 'runtime\*') -Destination $paths.Release -Recurse -Force
  }

  Log 'STEP_5_INSTALL_COMPLETE_V6_SOURCE_AND_CONTROL'
  foreach($property in $manifest.files.PSObject.Properties){
    $source=Join-Path $PSScriptRoot $property.Name
    $target=Join-Path $paths.Root $property.Name
    if([IO.Path]::GetFullPath($source)-eq[IO.Path]::GetFullPath($target)){continue}
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
    Copy-Item -LiteralPath $source -Destination $target -Force
  }
  if([IO.Path]::GetFullPath($manifestPath)-ne[IO.Path]::GetFullPath((Join-Path $paths.Root 'RUNTIME_MANIFEST.json'))){Copy-Item -LiteralPath $manifestPath -Destination (Join-Path $paths.Root 'RUNTIME_MANIFEST.json') -Force}

  Log 'STEP_6_CLONE_BROWSER_PROFILE_ONCE'
  if(@(Get-ChildItem -LiteralPath $paths.Profile -Force -ErrorAction SilentlyContinue).Count-eq0){
    $profileSource=@('E:\SOURCE FACTORY\.yolla\yolla-workspace-browser-profile-minimal-v1','E:\SOURCE FACTORY\.yolla\yolla-workspace-browser-profile') |
      Where-Object {Test-Path -LiteralPath $_} | Select-Object -First 1
    if($profileSource){
      & robocopy.exe $profileSource $paths.Profile /E /COPY:DAT /R:1 /W:1 /XD 'Cache' 'Code Cache' 'GPUCache' 'Crashpad' /XF 'SingletonCookie' 'SingletonLock' 'SingletonSocket' | Out-Null
      if($LASTEXITCODE-ge8){throw ('PROFILE_CLONE_FAILED:'+$LASTEXITCODE)}
    }
  }

  Log 'STEP_7_POWERSHELL_5_1_COMPATIBLE_SMOKE'
  $smokeRoot=Join-Path $env:TEMP ('YOLLA_V6_SMOKE_'+[guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force -Path $smokeRoot | Out-Null
  $smokeEnvironment=@{YOLLA_V6_ROOT=$smokeRoot;YOLLA_V6_STATE_ROOT=(Join-Path $smokeRoot 'state');YOLLA_V6_PROFILE_ROOT=(Join-Path $smokeRoot 'profile')}
  if($importState){$smokeEnvironment.YOLLA_V6_IMPORT_STATE_PATH=$importState}
  $psi=New-YollaV6ProcessStartInfo -FileName $paths.Electron -WorkingDirectory $paths.Release -Arguments ('"{0}" --smoke-test' -f $paths.Release) -EnvironmentVariables $smokeEnvironment
  $process=[System.Diagnostics.Process]::Start($psi)
  $smokeReceipt=Join-Path $smokeRoot 'receipts\LATEST_RUNTIME_RECEIPT.json'
  $deadline=(Get-Date).AddSeconds(60)
  $last='NONE'
  do{
    Start-Sleep -Milliseconds 250
    if(Test-Path -LiteralPath $smokeReceipt){
      try{$json=Get-Content -Raw -LiteralPath $smokeReceipt | ConvertFrom-Json;$last=[string]$json.status;if($last-eq'PASS'){break};if($last-eq'FAIL'){throw ('SMOKE_FAIL:'+$json.error)}}catch{if($_.Exception.Message-like'SMOKE_FAIL:*'){throw}}
    }
  }while((Get-Date)-lt$deadline)
  if($last-ne'PASS'){try{Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue}catch{};throw ('SMOKE_TIMEOUT_LAST_STATUS:'+$last)}
  try{$process.WaitForExit(5000)|Out-Null}catch{}
  Remove-Item -LiteralPath $smokeRoot -Recurse -Force -ErrorAction SilentlyContinue

  Log 'STEP_8_REGISTER_V6_ONLY_ONLOGON_TASKS'
  $taskResults=[ordered]@{}
  $taskCommands=[ordered]@{YOLLA_PANEL_V6_EXECUTOR=('powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+(Join-Path $paths.Root 'V6.Executor.ps1')+'"')}
  if($env:YOLLA_V6_RUNTIME_API_KEY){$taskCommands.YOLLA_PANEL_V6_CONTROL='powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+(Join-Path $paths.Root 'RUN_YOLLA_V6_CONTROL.ps1')+'"'}
  foreach($name in $taskCommands.Keys){
    & schtasks.exe /Create /SC ONLOGON /TN $name /TR $taskCommands[$name] /F | Out-Null
    $taskResults[$name]=if($LASTEXITCODE-eq0){'REGISTERED'}else{'REGISTRATION_FAILED_NONBLOCKING'}
  }

  if(-not$SkipLaunch){
    Log 'STEP_9_START_V6_EXECUTOR_CONTROL_AND_PANEL'
    & (Join-Path $paths.Root 'RUN_YOLLA_V6_EXECUTOR.ps1')
    if($env:YOLLA_V6_RUNTIME_API_KEY){& (Join-Path $paths.Root 'RUN_YOLLA_V6_CONTROL.ps1')}else{Log 'CONTROL_NOT_STARTED_API_KEY_REQUIRED'}
    & (Join-Path $paths.Root 'RUN_AI_YOLLA_V6.ps1')
  }
  Receipt 'PASS_SOURCE_AND_SMOKE' @{snapshot_root=$snapshot;import_state_path=$importState;scheduled_tasks=$taskResults;control_started=([bool]$env:YOLLA_V6_RUNTIME_API_KEY);terminal='YOLLA_PANEL_V6_INDEPENDENT_SOURCE_SMOKE_PASS';target_pc_live_acceptance=false}
  Log 'INSTALL_V6_PASS_SOURCE_AND_SMOKE'
}catch{
  Log ('INSTALL_V6_FAILED='+$_.Exception.Message)
  Receipt 'FAIL_EXISTING_SYSTEMS_PRESERVED' @{error=$_.Exception.Message;exception=$_.Exception.ToString();target_pc_live_acceptance=false}
  throw
}
