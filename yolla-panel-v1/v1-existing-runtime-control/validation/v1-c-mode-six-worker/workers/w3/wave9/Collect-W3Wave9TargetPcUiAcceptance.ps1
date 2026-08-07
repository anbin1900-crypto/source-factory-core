[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$WorkspaceRoot,
  [Parameter(Mandatory=$true)][string]$OutputDirectory,
  [Parameter(Mandatory=$true)][string]$CandidateBridgePath,
  [Parameter(Mandatory=$true)][string]$ProjectionBuilderPath,
  [Parameter(Mandatory=$true)][string]$ExpectedReceiptPath,
  [Parameter(Mandatory=$true)][string]$SchemaPath,
  [Parameter(Mandatory=$true)][string]$RegistrySnapshotPath,
  [Parameter(Mandatory=$true)][string[]]$ScreenshotPaths,
  [string]$RuntimeVersion='5.10.2.4.2-rc3',
  [string]$RestartCommandPath='',
  [switch]$ExecuteRestart
)
$ErrorActionPreference='Stop'
if($RuntimeVersion-ne'5.10.2.4.2-rc3'){throw "VERSION_MISMATCH:$RuntimeVersion"}
foreach($p in @($WorkspaceRoot,$CandidateBridgePath,$ProjectionBuilderPath,$ExpectedReceiptPath,$SchemaPath,$RegistrySnapshotPath)){if(!(Test-Path $p)){throw "REQUIRED_PATH_MISSING:$p"}}
if($ScreenshotPaths.Count-lt4){throw 'SCREENSHOT_COUNT_LT_4'}
New-Item -ItemType Directory -Force -Path $OutputDirectory|Out-Null
function Read-Json([string]$Path){Get-Content -Raw -Encoding UTF8 $Path|ConvertFrom-Json}
function Snapshot([string]$Phase){[ordered]@{phase=$Phase;captured_at=(Get-Date).ToString('o');runtime_status=if(Test-Path (Join-Path $WorkspaceRoot 'workspace_runtime_status.json')){Read-Json (Join-Path $WorkspaceRoot 'workspace_runtime_status.json')}else{$null};c_state=if(Test-Path (Join-Path $WorkspaceRoot 'workspace_c_mode_state.json')){Read-Json (Join-Path $WorkspaceRoot 'workspace_c_mode_state.json')}else{$null};repeat_state=if(Test-Path (Join-Path $WorkspaceRoot 'workspace_repeat_command_state.json')){Read-Json (Join-Path $WorkspaceRoot 'workspace_repeat_command_state.json')}else{$null};registry_state=if(Test-Path (Join-Path $WorkspaceRoot 'workspace_registry_status.json')){Read-Json (Join-Path $WorkspaceRoot 'workspace_registry_status.json')}else{$null}}}
$before=Snapshot 'before_restart'
if($ExecuteRestart){if(!$RestartCommandPath-or!(Test-Path $RestartCommandPath)){throw 'RESTART_COMMAND_REQUIRED'};& $RestartCommandPath;if($LASTEXITCODE-ne0){throw "RESTART_FAILED:$LASTEXITCODE"};Start-Sleep -Seconds 5}
$after=Snapshot 'after_restart'
$projectionPath=Join-Path $OutputDirectory 'W3_WAVE9_UI_PROJECTION_RECEIPT.json'
& node $ProjectionBuilderPath --bridge $CandidateBridgePath --expected $ExpectedReceiptPath --out $projectionPath
if($LASTEXITCODE-ne0){throw "PROJECTION_BUILDER_FAILED:$LASTEXITCODE"}
$projection=Read-Json $projectionPath
if(!$projection.assertions_all_pass){throw 'PROJECTION_ASSERTIONS_FAILED'}
$purposes=@('IDLE_TRUTH','C_EXECUTION','COMMAND_EXECUTION','REGISTRY_RESULT_TRUTH','PENDING_MISSING_DUPLICATE_ERROR_END','RESTART_READBACK')
$shots=@();for($i=0;$i-lt$ScreenshotPaths.Count;$i++){if(!(Test-Path $ScreenshotPaths[$i])){throw "SCREENSHOT_MISSING:$($ScreenshotPaths[$i])"};$shots += [ordered]@{path=(Resolve-Path $ScreenshotPaths[$i]).Path;purpose=$purposes[[Math]::Min($i,$purposes.Count-1)];sha256=(Get-FileHash -Algorithm SHA256 $ScreenshotPaths[$i]).Hash.ToLowerInvariant()}}
$receipt=[ordered]@{schema_version='W3_WAVE9_TARGET_PC_UI_ACCEPTANCE_RECEIPT_V1';control_id='V1-C-MODE-6W-VALIDATION-CYCLE-002';wave_id='V1-C-MODE-6W-WAVE-009';registry_sequence=9;result_key='519440526200';target_version=$RuntimeVersion;captured_at_kst=[DateTimeOffset]::Now.ToOffset([TimeSpan]::FromHours(9)).ToString('o');target_pc=[ordered]@{computer_name=$env:COMPUTERNAME;os_version=[Environment]::OSVersion.VersionString};inputs=[ordered]@{candidate_bridge_sha256=(Get-FileHash -Algorithm SHA256 $CandidateBridgePath).Hash.ToLowerInvariant();projection_builder_sha256=(Get-FileHash -Algorithm SHA256 $ProjectionBuilderPath).Hash.ToLowerInvariant();expected_receipt_sha256=(Get-FileHash -Algorithm SHA256 $ExpectedReceiptPath).Hash.ToLowerInvariant();schema_sha256=(Get-FileHash -Algorithm SHA256 $SchemaPath).Hash.ToLowerInvariant();registry_snapshot_sha256=(Get-FileHash -Algorithm SHA256 $RegistrySnapshotPath).Hash.ToLowerInvariant()};screenshots=$shots;registry_snapshot=Read-Json $RegistrySnapshotPath;before_restart=$before;after_restart=$after;restart_readback=[ordered]@{runtime_status_present=($null-ne$after.runtime_status);c_state_present=($null-ne$after.c_state);repeat_state_present=($null-ne$after.repeat_state);registry_state_present=($null-ne$after.registry_state)};projection_receipt=$projection;execute_restart_requested=[bool]$ExecuteRestart;live_pass_claimed=$false}
$out=Join-Path $OutputDirectory 'W3_WAVE9_TARGET_PC_UI_ACCEPTANCE_RECEIPT.json';$receipt|ConvertTo-Json -Depth 50|Set-Content -Encoding UTF8 $out
Write-Output "W3_WAVE9_RECEIPT=$out";Write-Output ('SCREENSHOT_COUNT='+$shots.Count);Write-Output 'LIVE_PASS_CLAIMED=false'
