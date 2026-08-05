[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$PackageRoot,
  [Parameter(Mandatory=$true)][string]$WorkspaceRoot,
  [Parameter(Mandatory=$true)][string]$ExportManifestPath,
  [Parameter(Mandatory=$true)][string]$OutputDirectory,
  [Parameter(Mandatory=$true)][string]$RegistrySnapshotPath,
  [Parameter(Mandatory=$true)][string[]]$ScreenshotPaths,
  [string]$RestartCommandPath='',
  [switch]$ExecuteRestart
)
$ErrorActionPreference='Stop'
foreach($p in @($PackageRoot,$WorkspaceRoot,$ExportManifestPath,$RegistrySnapshotPath)){if(!(Test-Path $p)){throw "REQUIRED_PATH_MISSING:$p"}}
if($ScreenshotPaths.Count-lt4){throw 'SCREENSHOT_COUNT_LT_4'}
New-Item -ItemType Directory -Force -Path $OutputDirectory|Out-Null
function Read-Json([string]$Path){Get-Content -Raw -Encoding UTF8 $Path|ConvertFrom-Json}
function Snapshot([string]$Phase){[ordered]@{phase=$Phase;captured_at=(Get-Date).ToString('o');runtime_status=if(Test-Path (Join-Path $WorkspaceRoot 'workspace_runtime_status.json')){Read-Json (Join-Path $WorkspaceRoot 'workspace_runtime_status.json')}else{$null};c_state=if(Test-Path (Join-Path $WorkspaceRoot 'workspace_c_mode_state.json')){Read-Json (Join-Path $WorkspaceRoot 'workspace_c_mode_state.json')}else{$null};repeat_state=if(Test-Path (Join-Path $WorkspaceRoot 'workspace_repeat_command_state.json')){Read-Json (Join-Path $WorkspaceRoot 'workspace_repeat_command_state.json')}else{$null};registry_state=if(Test-Path (Join-Path $WorkspaceRoot 'workspace_registry_status.json')){Read-Json (Join-Path $WorkspaceRoot 'workspace_registry_status.json')}else{$null}}}
$validator=Join-Path $PackageRoot 'test-evidence/w3/validate_w3_rc4_ui_membership.cjs'
$smoke=Join-Path $PackageRoot 'test-evidence/w3/test_w3_rc4_ui_smoke.cjs'
$membershipPath=Join-Path $OutputDirectory 'W3_RC4_UI_MEMBERSHIP_RECEIPT.json'
$smokePath=Join-Path $OutputDirectory 'W3_RC4_UI_SMOKE_RECEIPT.json'
& node $validator --root $PackageRoot --manifest $ExportManifestPath --receipt $membershipPath;if($LASTEXITCODE-ne0){throw "MEMBERSHIP_VALIDATOR_FAILED:$LASTEXITCODE"}
& node $smoke --root $PackageRoot --receipt $smokePath;if($LASTEXITCODE-ne0){throw "UI_SMOKE_FAILED:$LASTEXITCODE"}
$before=Snapshot 'before_restart'
if($ExecuteRestart){if(!$RestartCommandPath-or!(Test-Path $RestartCommandPath)){throw 'RESTART_COMMAND_REQUIRED'};& $RestartCommandPath;if($LASTEXITCODE-ne0){throw "RESTART_FAILED:$LASTEXITCODE"};Start-Sleep -Seconds 5}
$after=Snapshot 'after_restart'
$purposes=@('IDLE_TRUTH','C_EXECUTION','COMMAND_EXECUTION','REGISTRY_RESULT_TRUTH','MISSING_DUPLICATE_ERROR_END_RESTING','RESTART_READBACK')
$shots=@();for($i=0;$i-lt$ScreenshotPaths.Count;$i++){if(!(Test-Path $ScreenshotPaths[$i])){throw "SCREENSHOT_MISSING:$($ScreenshotPaths[$i])"};$shots += [ordered]@{path=(Resolve-Path $ScreenshotPaths[$i]).Path;purpose=$purposes[[Math]::Min($i,$purposes.Count-1)];sha256=(Get-FileHash -Algorithm SHA256 $ScreenshotPaths[$i]).Hash.ToLowerInvariant()}}
$receipt=[ordered]@{schema_version='W3_RC4_TARGET_PC_UI_EVIDENCE_RECEIPT_V1';control_id='V1-C-MODE-6W-VALIDATION-CYCLE-002';wave_id='V1-C-MODE-6W-WAVE-012';result_key='519517264100';target_version='5.10.2.4.2-rc4';captured_at_kst=[DateTimeOffset]::Now.ToOffset([TimeSpan]::FromHours(9)).ToString('o');target_pc=[ordered]@{computer_name=$env:COMPUTERNAME;os_version=[Environment]::OSVersion.VersionString};membership_receipt=Read-Json $membershipPath;smoke_receipt=Read-Json $smokePath;screenshots=$shots;registry_snapshot=Read-Json $RegistrySnapshotPath;before_restart=$before;after_restart=$after;restart_readback=[ordered]@{runtime_status_present=($null-ne$after.runtime_status);c_state_present=($null-ne$after.c_state);repeat_state_present=($null-ne$after.repeat_state);registry_state_present=($null-ne$after.registry_state)};execute_restart_requested=[bool]$ExecuteRestart;live_pass_claimed=$false}
$out=Join-Path $OutputDirectory 'W3_RC4_TARGET_PC_UI_EVIDENCE_RECEIPT.json';$receipt|ConvertTo-Json -Depth 50|Set-Content -Encoding UTF8 $out
Write-Output "W3_RC4_TARGET_PC_RECEIPT=$out";Write-Output ('SCREENSHOT_COUNT='+$shots.Count);Write-Output 'LIVE_PASS_CLAIMED=false'
