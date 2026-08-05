[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$WorkspaceRoot,
  [Parameter(Mandatory=$true)][string]$OutputDirectory,
  [Parameter(Mandatory=$true)][string]$RegistrySnapshotPath,
  [string[]]$ScreenshotPaths=@(),
  [string]$RuntimeVersion='5.10.2.4.2-rc3'
)
$ErrorActionPreference='Stop'
New-Item -ItemType Directory -Force -Path $OutputDirectory|Out-Null
function Read-Json([string]$p){if(!(Test-Path $p)){throw "FILE_NOT_FOUND:$p"};Get-Content -Raw -Encoding UTF8 $p|ConvertFrom-Json}
function Snapshot([string]$phase){[ordered]@{phase=$phase;captured_at=(Get-Date).ToString('o');runtime=if(Test-Path (Join-Path $WorkspaceRoot 'workspace_runtime_status.json')){Read-Json (Join-Path $WorkspaceRoot 'workspace_runtime_status.json')}else{$null};registry=if(Test-Path (Join-Path $WorkspaceRoot 'workspace_registry_status.json')){Read-Json (Join-Path $WorkspaceRoot 'workspace_registry_status.json')}else{$null}}}
$before=Snapshot 'before_restart'
$registry=Read-Json $RegistrySnapshotPath
$shots=@();foreach($p in $ScreenshotPaths){if(!(Test-Path $p)){throw "SCREENSHOT_NOT_FOUND:$p"};$shots += [ordered]@{path=(Resolve-Path $p).Path;sha256=(Get-FileHash -Algorithm SHA256 $p).Hash.ToLowerInvariant();purpose='WAVE8_ACTUAL_CANDIDATE_UI'}}
$after=Snapshot 'after_restart'
$resultComments=@();$resultKeys=@();$commitIds=@();foreach($x in $registry.entries){if($null-ne$x.result_comment_id){$resultComments+=$x.result_comment_id};if($x.result_key){$resultKeys+=$x.result_key};if($x.result_commit){$commitIds+=$x.result_commit}}
$evidence=[ordered]@{
 schema_version='W3_TARGET_PC_UI_EVIDENCE_V5';control_id='V1-C-MODE-6W-VALIDATION-CYCLE-002';wave_id='V1-C-MODE-6W-WAVE-008';command_id='C6W-W8-W3-ACTUAL-UI-CANDIDATE';result_key='519386239100';captured_at_kst=[DateTimeOffset]::Now.ToOffset([TimeSpan]::FromHours(9)).ToString('o');runtime_version=$RuntimeVersion;before_restart=$before;after_restart=$after;registry_snapshot=$registry;screenshots=$shots;result_comments=$resultComments;result_keys=$resultKeys;commit_ids=$commitIds;assertions=[ordered]@{current_registry=$false;historical_registry=$false;awaiting=$false;missing=$false;duplicate=$false;error=$false;end=$false;idle=$false;result_comment_preferred=$false;disabled_working_zero=$false;legacy_a_e_excluded=$false;restart_readback=$false};live_pass_claimed=$false
}
$out=Join-Path $OutputDirectory 'W3_WAVE8_TARGET_PC_EVIDENCE.json';$evidence|ConvertTo-Json -Depth 40|Set-Content -Encoding UTF8 $out
Write-Output "W3_WAVE8_EVIDENCE=$out";Write-Output ('SCREENSHOT_COUNT='+$shots.Count);Write-Output ('RESULT_COMMENT_COUNT='+$resultComments.Count);Write-Output 'LIVE_PASS_CLAIMED=false'
