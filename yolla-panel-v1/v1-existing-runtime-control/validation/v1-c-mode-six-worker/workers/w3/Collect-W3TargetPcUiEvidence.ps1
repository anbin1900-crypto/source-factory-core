[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$WorkspaceRoot,
  [Parameter(Mandatory=$true)][string]$OutputDirectory,
  [string]$RuntimeVersion = '5.10.2.4.1',
  [string[]]$ScreenshotPaths = @(),
  [string]$MixedFixturePath = ''
)
$ErrorActionPreference='Stop'
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
function Read-JsonIfExists([string]$Path){ if(Test-Path $Path){ return Get-Content -Raw -Encoding UTF8 $Path | ConvertFrom-Json }; return $null }
function Snapshot([string]$Phase){
  $runtime=Read-JsonIfExists (Join-Path $WorkspaceRoot 'workspace_runtime_status.json')
  $cState=Read-JsonIfExists (Join-Path $WorkspaceRoot 'workspace_c_mode_state.json')
  $repeat=Read-JsonIfExists (Join-Path $WorkspaceRoot 'workspace_repeat_command_state.json')
  return [ordered]@{phase=$Phase;captured_at=(Get-Date).ToString('o');runtime_status=$runtime;c_state=$cState;repeat_state=$repeat}
}
$before=Snapshot 'before_restart'
$shots=@()
$purposes=@('IDLE_TRUTH','GROUP_C_BUTTON','COMMAND_POPUP','COUNTERS_LABELS','RESTART_RESUME','MIXED_SIX_SLOT')
$i=0
foreach($p in $ScreenshotPaths){
  if(!(Test-Path $p)){ throw "SCREENSHOT_NOT_FOUND:$p" }
  $shots += [ordered]@{path=(Resolve-Path $p).Path;sha256=(Get-FileHash -Algorithm SHA256 $p).Hash.ToLowerInvariant();purpose=$purposes[[Math]::Min($i,$purposes.Count-1)]}
  $i++
}
$mixed=$null
if($MixedFixturePath){
  if(!(Test-Path $MixedFixturePath)){ throw "MIXED_FIXTURE_NOT_FOUND:$MixedFixturePath" }
  $mixed=Get-Content -Raw -Encoding UTF8 $MixedFixturePath|ConvertFrom-Json
}
$after=Snapshot 'after_restart'
$restartReadback=[ordered]@{
 runtime_status_present=($null-ne$after.runtime_status)
 c_state_present=($null-ne$after.c_state)
 repeat_state_present=($null-ne$after.repeat_state)
}
$evidence=[ordered]@{
 schema_version='W3_TARGET_PC_UI_EVIDENCE_V2'; control_id='V1-C-MODE-6W-VALIDATION-CYCLE-002'; command_id='C6W-W3-W3-UI-PROJECTION-INTEGRATION';
 captured_at_kst=[DateTimeOffset]::Now.ToOffset([TimeSpan]::FromHours(9)).ToString('o');
 target_pc=[ordered]@{computer_name=$env:COMPUTERNAME;os_version=[Environment]::OSVersion.VersionString};
 runtime=[ordered]@{version=$RuntimeVersion;runtime_status=$before.runtime_status;c_state=$before.c_state;repeat_state=$before.repeat_state};
 before_restart=$before;after_restart=$after;restart_readback=$restartReadback;screenshots=$shots;mixed_fixture=$mixed;
 assertions=[ordered]@{idle_working_zero=$false;group_c_button=$false;top_command_popup=$false;counter_label_separation=$false;mixed_six_slot=$false;restart_resume=$false};
 live_pass_claimed=$false
}
$out=Join-Path $OutputDirectory 'W3_TARGET_PC_UI_EVIDENCE.json'
$evidence|ConvertTo-Json -Depth 30|Set-Content -Encoding UTF8 $out
Write-Output "W3_EVIDENCE_CAPTURED=$out"
Write-Output ('SCREENSHOT_COUNT='+$shots.Count)
Write-Output 'LIVE_PASS_CLAIMED=false'
