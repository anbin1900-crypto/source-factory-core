param([switch]$Once,[int]$PollMilliseconds=1000)
$ErrorActionPreference='Stop'

. (Join-Path $PSScriptRoot 'V6.Common.ps1')
$paths=Initialize-YollaV6Directories
$mutex=New-Object System.Threading.Mutex($false,'Local\YOLLA_PANEL_V6_EXECUTOR')
$acquired=$false
try{$acquired=$mutex.WaitOne(0,$false)}catch{$acquired=$false}
if(-not$acquired){throw 'YOLLA_V6_EXECUTOR_ALREADY_RUNNING'}

function Write-ExecutorReceipt($command,[string]$status,$result,[string]$error=''){
  $safeRequestId=[string]$command.request_id
  if($safeRequestId-notmatch'^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$'){$safeRequestId='INVALID-'+[guid]::NewGuid().ToString('N')}
  $receipt=[ordered]@{
    schema_version='YOLLA_PANEL_V6_PC_COMMAND_RECEIPT_V1'
    namespace='YOLLA_PANEL_V6'
    request_id=$safeRequestId
    action=[string]$command.action
    idempotency_key=[string]$command.idempotency_key
    status=$status
    result=$result
    error=$error
    legacy_write_count=0
    arbitrary_shell_executed=$false
    completed_at=(Get-Date).ToString('o')
  }
  $target=Join-Path $paths.ExecutorReceipts ($safeRequestId+'.json')
  Write-YollaV6JsonAtomic -Path $target -Value $receipt
  Write-YollaV6JsonAtomic -Path (Join-Path $paths.Receipts 'LATEST_EXECUTOR_RECEIPT.json') -Value $receipt
  return $receipt
}

function Invoke-V6Script([string]$ScriptPath,[string[]]$Arguments=@()){
  if(-not(Test-Path -LiteralPath $ScriptPath)){throw ('SCRIPT_NOT_FOUND:'+$ScriptPath)}
  $global:LASTEXITCODE=0
  $output=& $ScriptPath @Arguments 2>&1 | Out-String
  if($LASTEXITCODE-ne0){throw ('SCRIPT_FAILED:'+([IO.Path]::GetFileName($ScriptPath))+':'+$output)}
  return $output.Trim()
}

function Stop-V6Panel {
  $stopped=New-Object System.Collections.ArrayList
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {$_.Name -eq 'electron.exe' -and $_.CommandLine -like ('*'+$paths.Release+'*')} |
    ForEach-Object {Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop;[void]$stopped.Add($_.ProcessId)}
  return [ordered]@{stopped_process_ids=@($stopped)}
}

function Execute-V6Command($command){
  if(([string]$command.schema_version) -ne 'YOLLA_PANEL_V6_PC_COMMAND_V1'){throw 'INVALID_COMMAND_SCHEMA'}
  if(([string]$command.namespace) -ne 'YOLLA_PANEL_V6'){throw 'INVALID_COMMAND_NAMESPACE'}
  if(([string]$command.request_id) -notmatch '^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$'){throw 'INVALID_REQUEST_ID'}
  if(([string]$command.idempotency_key) -notmatch '^[a-f0-9]{64}$'){throw 'INVALID_IDEMPOTENCY_KEY'}
  if(([bool]$command.legacy_target_allowed) -ne $false){throw 'LEGACY_TARGET_FORBIDDEN'}
  if(([bool]$command.arbitrary_shell_allowed) -ne $false){throw 'ARBITRARY_SHELL_FORBIDDEN'}
  $action=([string]$command.action).ToUpperInvariant()
  switch($action){
    'STATUS' { return (Get-YollaV6Status) }
    'SNAPSHOT' {return [ordered]@{snapshot_root=(Invoke-V6Script -ScriptPath (Join-Path $paths.Root 'V6.Snapshot.ps1'))}}
    'VALIDATE' {
      $out=Join-Path $paths.Receipts ('VALIDATION_'+(Get-Date -Format 'yyyyMMdd_HHmmss')+'.json')
      $validation=Invoke-V6Script -ScriptPath (Join-Path $paths.Root 'V6.Validate.ps1') -Arguments @('-PackageRoot',$paths.Root,'-OutputPath',$out)
      return [ordered]@{validation_receipt=$out;output=$validation}
    }
    'START_PANEL' {return [ordered]@{output=(Invoke-V6Script -ScriptPath (Join-Path $paths.Root 'RUN_AI_YOLLA_V6.ps1'))}}
    'STOP_PANEL' { return Stop-V6Panel }
    'INSTALL_UPDATE' {
      $candidate=[IO.Path]::GetFullPath([string]$command.payload.package_root)
      $stagingPrefix=[IO.Path]::GetFullPath($paths.Staging).TrimEnd('\')+'\'
      if(-not$candidate.StartsWith($stagingPrefix,[StringComparison]::OrdinalIgnoreCase)){throw 'PACKAGE_OUTSIDE_V6_STAGING'}
      $output=Invoke-V6Script -ScriptPath (Join-Path $candidate 'install-v6.ps1')
      return [ordered]@{package_root=$candidate;output=$output}
    }
    default { throw ('ACTION_NOT_ALLOWED:'+$action) }
  }
}

try{
  do{
    $files=@(Get-ChildItem -LiteralPath $paths.Inbox -Filter '*.json' -File -ErrorAction SilentlyContinue | Sort-Object CreationTimeUtc,Name)
    foreach($file in $files){
      $processing=Join-Path $paths.Processing $file.Name
      try{Move-Item -LiteralPath $file.FullName -Destination $processing -ErrorAction Stop}catch{continue}
      $command=$null
      try{
        $command=Get-Content -Raw -LiteralPath $processing | ConvertFrom-Json
        if(([string]$command.request_id) -notmatch '^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$'){throw 'INVALID_REQUEST_ID'}
        $existing=Join-Path $paths.ExecutorReceipts (([string]$command.request_id)+'.json')
        if(Test-Path -LiteralPath $existing){Move-Item -LiteralPath $processing -Destination (Join-Path $paths.Archive $file.Name) -Force;continue}
        [void](Write-ExecutorReceipt -command $command -status 'PASS' -result (Execute-V6Command $command))
      }catch{
        if($null-eq$command){$command=[ordered]@{request_id=('INVALID-'+[guid]::NewGuid().ToString('N'));action='INVALID';idempotency_key=''}}
        [void](Write-ExecutorReceipt -command $command -status 'FAIL' -result $null -error $_.Exception.ToString())
      }finally{
        if(Test-Path -LiteralPath $processing){Move-Item -LiteralPath $processing -Destination (Join-Path $paths.Archive $file.Name) -Force}
      }
    }
    if(-not$Once){Start-Sleep -Milliseconds ([Math]::Max(250,$PollMilliseconds))}
  }while(-not$Once)
}finally{
  if($acquired){$mutex.ReleaseMutex() | Out-Null}
  $mutex.Dispose()
}
