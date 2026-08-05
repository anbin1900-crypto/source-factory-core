[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$WorkspaceRoot,
  [Parameter(Mandatory=$true)][string]$OutputDirectory,
  [string]$RuntimeVersion = '5.10.2.4.1',
  [string[]]$ScreenshotPaths = @(),
  [string]$MixedFixturePath = '',
  [string]$ReportTruthFixturePath = '',
  [string]$RegistryTruthFixturePath = ''
)
$ErrorActionPreference='Stop'
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
function Read-JsonIfExists([string]$Path){if(Test-Path $Path){return Get-Content -Raw -Encoding UTF8 $Path|ConvertFrom-Json};return $null}
function Snapshot([string]$Phase){return [ordered]@{phase=$Phase;captured_at=(Get-Date).ToString('o');runtime_status=Read-JsonIfExists (Join-Path $WorkspaceRoot 'workspace_runtime_status.json');c_state=Read-JsonIfExists (Join-Path $WorkspaceRoot 'workspace_c_mode_state.json');repeat_state=Read-JsonIfExists (Join-Path $WorkspaceRoot 'workspace_repeat_command_state.json');registry_state=Read-JsonIfExists (Join-Path $WorkspaceRoot 'workspace_registry_status.json')}}
$before=Snapshot 'before_restart'
$shots=@();$purposes=@('IDLE_TRUTH','GROUP_C_BUTTON','COMMAND_POPUP','COUNTERS_LABELS','RESTART_RESUME','MIXED_SIX_SLOT','REPORT_TRUTH','REGISTRY_AUTHORITY_TRUTH');$i=0
foreach($p in $ScreenshotPaths){if(!(Test-Path $p)){throw "SCREENSHOT_NOT_FOUND:$p"};$shots += [ordered]@{path=(Resolve-Path $p).Path;sha256=(Get-FileHash -Algorithm SHA256 $p).Hash.ToLowerInvariant();purpose=$purposes[[Math]::Min($i,$purposes.Count-1)]};$i++}
$mixed=if($MixedFixturePath){Read-JsonIfExists $MixedFixturePath}else{$null}
$reportTruth=if($ReportTruthFixturePath){Read-JsonIfExists $ReportTruthFixturePath}else{$null}
$registryTruth=if($RegistryTruthFixturePath){Read-JsonIfExists $RegistryTruthFixturePath}else{$null}
$postIds=@();$commitIds=@();$resultKeys=@();$resultComments=@()
foreach($set in @($reportTruth,$registryTruth)){if($set){foreach($x in $set.fixtures){if($null-ne$x.post_id){$postIds+=$x.post_id};if($x.commit_id){$commitIds+=$x.commit_id};if($x.result_key){$resultKeys+=$x.result_key};if($null-ne$x.result_comment_id){$resultComments+=$x.result_comment_id}}}}
$after=Snapshot 'after_restart'
$restartReadback=[ordered]@{runtime_status_present=($null-ne$after.runtime_status);c_state_present=($null-ne$after.c_state);repeat_state_present=($null-ne$after.repeat_state);registry_state_present=($null-ne$after.registry_state)}
$evidence=[ordered]@{schema_version='W3_TARGET_PC_UI_EVIDENCE_V4';control_id='V1-C-MODE-6W-VALIDATION-CYCLE-002';command_id='C6W-W7-W3-UI-AUTHORITY-TRUTH';captured_at_kst=[DateTimeOffset]::Now.ToOffset([TimeSpan]::FromHours(9)).ToString('o');target_pc=[ordered]@{computer_name=$env:COMPUTERNAME;os_version=[Environment]::OSVersion.VersionString};runtime=[ordered]@{version=$RuntimeVersion;runtime_status=$before.runtime_status;c_state=$before.c_state;repeat_state=$before.repeat_state;registry_state=$before.registry_state};before_restart=$before;after_restart=$after;restart_readback=$restartReadback;screenshots=$shots;mixed_fixture=$mixed;report_truth_fixture=$reportTruth;registry_truth_fixture=$registryTruth;post_ids=$postIds;commit_ids=$commitIds;result_keys=$resultKeys;result_comments=$resultComments;assertions=[ordered]@{current_registry_result=$false;historical_registry_result=$false;result_comment_preferred=$false;missing_duplicate_error_separated=$false;disabled_working_zero=$false;legacy_a_e_excluded=$false;restart_resume=$false};live_pass_claimed=$false}
$out=Join-Path $OutputDirectory 'W3_TARGET_PC_UI_EVIDENCE.json';$evidence|ConvertTo-Json -Depth 40|Set-Content -Encoding UTF8 $out
Write-Output "W3_EVIDENCE_CAPTURED=$out";Write-Output ('RESULT_COMMENT_COUNT='+$resultComments.Count);Write-Output ('RESULT_KEY_COUNT='+$resultKeys.Count);Write-Output 'LIVE_PASS_CLAIMED=false'
