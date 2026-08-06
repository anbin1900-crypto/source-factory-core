[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$ConfigPath
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'

$CONTROL_ID='V1-C-MODE-6W-VALIDATION-CYCLE-002'
$WAVE_ID='V1-C-MODE-6W-WAVE-018'
$COMMAND_ID='C6W-W18-W3-TARGET-PC-UI-EVIDENCE-PACK-V2'
$RESULT_KEY='519890152100'
$TARGET_VERSION='5.10.2.4.2-rc8'
$AUTH_RELEASE_ROOT='E:\SOURCE FACTORY\.yolla\yolla-panel\releases'
$AUTH_STATE_ROOT='E:\SOURCE FACTORY\.yolla\yolla-workspace-v5-2'
$AUTH_PROFILE='E:\SOURCE FACTORY\.yolla\yolla-workspace-browser-profile'
$REQUIRED_PURPOSES=@(
  'APP_VERSION_RUNTIME_STATUS','IDLE_WORKING_ZERO','RESULT_COMMENT_PRIORITY',
  'CURRENT_HISTORICAL_REGISTRY','C_MODE_SEPARATION','REPEAT_MODE_SEPARATION',
  'RESTART_BEFORE','RESTART_AFTER','ROLLBACK_VISUAL_STATE'
)

function Fail([string]$Code){ throw "W3_UI_EVIDENCE_FAIL_CLOSED:$Code" }
function Require-Path([string]$Path,[string]$Code){ if([string]::IsNullOrWhiteSpace($Path)-or!(Test-Path -LiteralPath $Path)){Fail "$Code`:$Path"} }
function Read-Json([string]$Path){ Require-Path $Path 'JSON_PATH_MISSING'; try{return Get-Content -LiteralPath $Path -Raw -Encoding UTF8|ConvertFrom-Json}catch{Fail "JSON_PARSE_FAILED:$Path"} }
function Hash-File([string]$Path){ Require-Path $Path 'HASH_PATH_MISSING'; return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }
function Assert-Eq($Actual,$Expected,[string]$Code){ if($Actual -ne $Expected){Fail "$Code expected=$Expected actual=$Actual"} }
function Invoke-CommandFile([string]$Path,[string]$Code){
  Require-Path $Path $Code
  $ext=[IO.Path]::GetExtension($Path).ToLowerInvariant()
  if($ext -in @('.bat','.cmd')){$p=Start-Process -FilePath $env:ComSpec -ArgumentList @('/d','/c',('"'+$Path+'"')) -Wait -PassThru -NoNewWindow}
  elseif($ext -eq '.ps1'){$p=Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',$Path) -Wait -PassThru -NoNewWindow}
  else{$p=Start-Process -FilePath $Path -Wait -PassThru -NoNewWindow}
  if($p.ExitCode-ne0){Fail "$Code`_EXIT_$($p.ExitCode)"}
}
function Capture-Screen([string]$Path){
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $bounds=[System.Windows.Forms.SystemInformation]::VirtualScreen
  if($bounds.Width-lt100-or$bounds.Height-lt100){Fail 'INVALID_VIRTUAL_SCREEN'}
  $bmp=New-Object System.Drawing.Bitmap $bounds.Width,$bounds.Height
  $g=[System.Drawing.Graphics]::FromImage($bmp)
  try{$g.CopyFromScreen($bounds.Left,$bounds.Top,0,0,$bounds.Size);$dir=Split-Path -Parent $Path;if($dir){New-Item -ItemType Directory -Force -Path $dir|Out-Null};$bmp.Save($Path,[System.Drawing.Imaging.ImageFormat]::Png)}finally{$g.Dispose();$bmp.Dispose()}
  Require-Path $Path 'SCREENSHOT_CAPTURE_MISSING'
  if((Get-Item -LiteralPath $Path).Length-lt1024){Fail "SCREENSHOT_TOO_SMALL:$Path"}
}
function Snapshot-State([string]$Phase,$cfg){
  foreach($p in @($cfg.runtime_status_path,$cfg.ui_truth_snapshot_path,$cfg.registry_snapshot_path,$cfg.c_mode_state_path,$cfg.repeat_state_path)){Require-Path $p "STATE_PATH_MISSING_$Phase"}
  return [ordered]@{
    phase=$Phase;captured_at=(Get-Date).ToString('o');
    runtime_status_sha256=Hash-File $cfg.runtime_status_path;
    ui_truth_sha256=Hash-File $cfg.ui_truth_snapshot_path;
    registry_sha256=Hash-File $cfg.registry_snapshot_path;
    c_mode_state_sha256=Hash-File $cfg.c_mode_state_path;
    repeat_state_sha256=Hash-File $cfg.repeat_state_path
  }
}
function Hash-Profile([string]$Root){
  Require-Path $Root 'PROFILE_ROOT_MISSING'
  $files=Get-ChildItem -LiteralPath $Root -File -Recurse|Sort-Object FullName
  if($files.Count-eq0){Fail 'PROFILE_EMPTY'}
  $rows=@();foreach($f in $files){$rows+=((Resolve-Path -LiteralPath $f.FullName).Path.Substring($Root.Length).TrimStart('\\')+'|'+$f.Length+'|'+(Hash-File $f.FullName))}
  $tmp=[IO.Path]::GetTempFileName();try{[IO.File]::WriteAllLines($tmp,$rows,[Text.UTF8Encoding]::new($false));return Hash-File $tmp}finally{Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue}
}
function Validate-UiTruth($truth){
  Assert-Eq ([int]$truth.working_count) 0 'IDLE_WORKING_NOT_ZERO'
  Assert-Eq ([bool]$truth.c_enabled) $false 'C_NOT_DISABLED_FOR_IDLE'
  Assert-Eq ([bool]$truth.repeat_enabled) $false 'REPEAT_NOT_DISABLED_FOR_IDLE'
  Assert-Eq ([bool]$truth.result_comment_priority) $true 'RESULT_COMMENT_PRIORITY_FALSE'
  if([long]$truth.result_comment_id-le0){Fail 'RESULT_COMMENT_ID_MISSING'}
  Assert-Eq ([bool]$truth.current_historical_registry_separated) $true 'REGISTRY_NOT_SEPARATED'
  $current=@($truth.current_registry_roles);$historical=@($truth.historical_registry_roles)
  if($current.Count-lt1-or$historical.Count-lt1){Fail 'REGISTRY_ROLE_SET_EMPTY'}
  foreach($r in $current){if($historical-contains$r){Fail "REGISTRY_ROLE_OVERLAP:$r"}}
  Assert-Eq ([bool]$truth.c_repeat_mode_separated) $true 'C_REPEAT_NOT_SEPARATED'
  Assert-Eq ([int]$truth.legacy_a_e_current_count) 0 'LEGACY_A_E_PRESENT'
}

Require-Path $ConfigPath 'CONFIG_MISSING'
$cfg=Read-Json $ConfigPath
foreach($name in @('output_directory','candidate_release_root','state_root','browser_profile','bundle_manifest_path','app_version_path','runtime_status_path','ui_truth_snapshot_path','registry_snapshot_path','c_mode_state_path','repeat_state_path','patch_receipt_path','restart_command_path','rollback_command_path')){if([string]::IsNullOrWhiteSpace([string]$cfg.$name)){Fail "CONFIG_FIELD_MISSING:$name"}}
Assert-Eq ([string]$cfg.state_root) $AUTH_STATE_ROOT 'STATE_ROOT_AUTHORITY_MISMATCH'
Assert-Eq ([string]$cfg.browser_profile) $AUTH_PROFILE 'PROFILE_AUTHORITY_MISMATCH'
if(!([string]$cfg.candidate_release_root).StartsWith($AUTH_RELEASE_ROOT+'\\',[StringComparison]::OrdinalIgnoreCase)){Fail 'CANDIDATE_RELEASE_OUTSIDE_AUTHORITY'}
if(!([string]$cfg.candidate_release_root).EndsWith('5.10.2.4.2-rc8',[StringComparison]::OrdinalIgnoreCase)){Fail 'CANDIDATE_VERSION_PATH_MISMATCH'}
New-Item -ItemType Directory -Force -Path $cfg.output_directory|Out-Null

$bundle=Read-Json $cfg.bundle_manifest_path
Assert-Eq $bundle.schema_version 'RC8_EXACT_UI_HOOK_ROLLBACK_BUNDLE_V2' 'BUNDLE_SCHEMA_MISMATCH'
Assert-Eq $bundle.target_version $TARGET_VERSION 'BUNDLE_TARGET_VERSION_MISMATCH'
Assert-Eq @($bundle.members).Count 5 'BUNDLE_MEMBER_COUNT_MISMATCH'
$expected=@{
 TRUTH_BRIDGE='27267b1b0b1d057e2ca40e3fcc864fd4609a1520';CSS_OVERLAY='ff1bf6c84fb9806328bb3e5d8616a85cce943473';JS_OVERLAY='82862f1b4c8c2599c4035c78023ffea850909b4c';EXACT_LOAD_HOOK='1e6e54914737b1878a3f3ba1e88adbba57eab190';EXACT_ROLLBACK='1b3df39a0ffa6c80ffa0b99e44422d6a26110f11'
}
foreach($m in @($bundle.members)){if(!$expected.ContainsKey([string]$m.logical_role)){Fail "UNEXPECTED_BUNDLE_ROLE:$($m.logical_role)"};Assert-Eq ([string]$m.blob_sha1) $expected[[string]$m.logical_role] "BUNDLE_BLOB_MISMATCH_$($m.logical_role)"}

$app=Read-Json $cfg.app_version_path
$appVersion=if($app.version){[string]$app.version}elseif($app.app_version){[string]$app.app_version}else{Fail 'APP_VERSION_FIELD_MISSING'}
Assert-Eq $appVersion $TARGET_VERSION 'APP_VERSION_MISMATCH'
$runtime=Read-Json $cfg.runtime_status_path
if(!$runtime.status-and!$runtime.runtime_status){Fail 'RUNTIME_STATUS_FIELD_MISSING'}
$truth=Read-Json $cfg.ui_truth_snapshot_path;Validate-UiTruth $truth
$registry=Read-Json $cfg.registry_snapshot_path
if(@($registry.current).Count-lt1-or@($registry.historical).Count-lt1){Fail 'REGISTRY_SNAPSHOT_INCOMPLETE'}
if((Resolve-Path $cfg.c_mode_state_path).Path-eq(Resolve-Path $cfg.repeat_state_path).Path){Fail 'C_REPEAT_STATE_PATH_COLLISION'}

$profileBefore=Hash-Profile $cfg.browser_profile
$beforeRestart=Snapshot-State 'before_restart' $cfg
$shots=@();$hashSet=@{}
function Add-Shot([string]$Purpose,[string]$Path){Capture-Screen $Path;$h=Hash-File $Path;if($hashSet.ContainsKey($h)){Fail "DUPLICATE_SCREENSHOT_HASH:$Purpose"};$hashSet[$h]=$true;$script:shots += [ordered]@{purpose=$Purpose;path=(Resolve-Path $Path).Path;sha256=$h;size_bytes=(Get-Item $Path).Length;state_snapshot=(Snapshot-State ('capture_'+$Purpose) $cfg)}}

$stepMap=@{};foreach($s in @($cfg.capture_steps)){if($stepMap.ContainsKey([string]$s.purpose)){Fail "DUPLICATE_CAPTURE_PURPOSE:$($s.purpose)"};$stepMap[[string]$s.purpose]=$s}
foreach($purpose in $REQUIRED_PURPOSES[0..5]){if(!$stepMap.ContainsKey($purpose)){Fail "CAPTURE_STEP_MISSING:$purpose"};$s=$stepMap[$purpose];if($s.prepare_command_path){Invoke-CommandFile $s.prepare_command_path "PREPARE_$purpose"};Start-Sleep -Seconds ([Math]::Max(1,[int]$s.wait_seconds));Add-Shot $purpose (Join-Path $cfg.output_directory ($purpose+'.png'))}
Add-Shot 'RESTART_BEFORE' (Join-Path $cfg.output_directory 'RESTART_BEFORE.png')
Invoke-CommandFile $cfg.restart_command_path 'RESTART_COMMAND'
Start-Sleep -Seconds ([Math]::Max(5,[int]$cfg.restart_wait_seconds))
$afterRestart=Snapshot-State 'after_restart' $cfg
$appAfter=Read-Json $cfg.app_version_path;$appAfterVersion=if($appAfter.version){[string]$appAfter.version}else{[string]$appAfter.app_version};Assert-Eq $appAfterVersion $TARGET_VERSION 'APP_VERSION_CHANGED_AFTER_RESTART'
$truthAfter=Read-Json $cfg.ui_truth_snapshot_path;Validate-UiTruth $truthAfter
Add-Shot 'RESTART_AFTER' (Join-Path $cfg.output_directory 'RESTART_AFTER.png')

$patchReceipt=Read-Json $cfg.patch_receipt_path
foreach($k in @('main_sha256','workspace_html_sha256','base_js_sha256','base_css_sha256')){if([string]::IsNullOrWhiteSpace([string]$patchReceipt.before.$k)){Fail "PATCH_RECEIPT_BEFORE_HASH_MISSING:$k"}}
Invoke-CommandFile $cfg.rollback_command_path 'ROLLBACK_COMMAND'
Start-Sleep -Seconds ([Math]::Max(2,[int]$cfg.rollback_wait_seconds))
$mainPath=Join-Path $cfg.candidate_release_root 'main.js';$htmlPath=Join-Path $cfg.candidate_release_root 'workspace.html';$baseJs=Join-Path $cfg.candidate_release_root 'workspace_c_mode.js';$baseCss=Join-Path $cfg.candidate_release_root 'workspace_c_mode.css'
Assert-Eq (Hash-File $mainPath) ([string]$patchReceipt.before.main_sha256) 'ROLLBACK_MAIN_NOT_EXACT'
Assert-Eq (Hash-File $htmlPath) ([string]$patchReceipt.before.workspace_html_sha256) 'ROLLBACK_HTML_NOT_EXACT'
Assert-Eq (Hash-File $baseJs) ([string]$patchReceipt.before.base_js_sha256) 'BASE_JS_CHANGED'
Assert-Eq (Hash-File $baseCss) ([string]$patchReceipt.before.base_css_sha256) 'BASE_CSS_CHANGED'
foreach($rel in @('automation-c-v1\workspace_ui_truth_bridge.cjs','workspace_c_mode_rc4_truth.css','workspace_c_mode_rc4_truth.js')){if(Test-Path (Join-Path $cfg.candidate_release_root $rel)){Fail "ROLLBACK_OVERLAY_REMAINS:$rel"}}
Add-Shot 'ROLLBACK_VISUAL_STATE' (Join-Path $cfg.output_directory 'ROLLBACK_VISUAL_STATE.png')
$profileAfter=Hash-Profile $cfg.browser_profile
Assert-Eq $profileAfter $profileBefore 'BROWSER_PROFILE_CHANGED'

$purposes=@($shots|ForEach-Object{$_.purpose});foreach($p in $REQUIRED_PURPOSES){if($purposes-notcontains$p){Fail "SCREENSHOT_PURPOSE_MISSING:$p"}}
$receipt=[ordered]@{
 schema_version='W3_TARGET_PC_UI_EVIDENCE_PACK_V2_RECEIPT';control_id=$CONTROL_ID;wave_id=$WAVE_ID;registry_sequence=18;command_id=$COMMAND_ID;directive_comment=5198901521;result_key=$RESULT_KEY;target_version=$TARGET_VERSION;
 status='LIVE_EVIDENCE_COLLECTED_PENDING_INDEPENDENT_ACCEPTANCE';evidence_mode='LIVE_TARGET_PC';captured_at_kst=[DateTimeOffset]::Now.ToOffset([TimeSpan]::FromHours(9)).ToString('o');target_pc_live_execution=$true;target_pc_acceptance_claimed=$false;live_pass_claimed=$false;
 target_pc=[ordered]@{computer_name=$env:COMPUTERNAME;os_version=[Environment]::OSVersion.VersionString};authority=[ordered]@{release_root=$AUTH_RELEASE_ROOT;state_root=$AUTH_STATE_ROOT;browser_profile=$AUTH_PROFILE};
 bundle_authority=[ordered]@{result_commit='7af7a51ee18e6b5ae6f64942cf02392f596e4678';artifact_commit='f023ce7ab94d5522eaf2c790a172478ea268e184';manifest_blob='984e42bab53a62bdaa61df2e41009c4e3bea0fda';exact_member_count=5};
 app=[ordered]@{version=$appVersion;version_source=(Resolve-Path $cfg.app_version_path).Path;version_source_sha256=Hash-File $cfg.app_version_path};runtime_status=[ordered]@{source=(Resolve-Path $cfg.runtime_status_path).Path;sha256=Hash-File $cfg.runtime_status_path;status=$runtime.status};
 screenshots=$shots;login_profile_preservation=[ordered]@{path=$AUTH_PROFILE;before_sha256=$profileBefore;after_sha256=$profileAfter;unchanged=$true;login_session_preserved=$true};
 ui_truth_assertions=[ordered]@{idle_working_count=0;result_comment_priority=$true;result_comment_id=[long]$truthAfter.result_comment_id;current_registry_roles=@($truthAfter.current_registry_roles);historical_registry_roles=@($truthAfter.historical_registry_roles);current_historical_registry_separated=$true;legacy_a_e_current_count=0};
 mode_separation=[ordered]@{c_mode_state_sha256=Hash-File $cfg.c_mode_state_path;repeat_state_sha256=Hash-File $cfg.repeat_state_path;c_repeat_mode_separated=$true};restart_evidence=[ordered]@{executed=$true;before=$beforeRestart;after=$afterRestart;evidence_complete=$true};
 rollback_visual_evidence=[ordered]@{executed=$true;screenshot_sha256=($shots|Where-Object purpose-eq'ROLLBACK_VISUAL_STATE').sha256;base_main_restored=$true;base_workspace_html_restored=$true;base_ui_js_unchanged=$true;base_ui_css_unchanged=$true;overlay_files_absent=$true};
 fail_closed=[ordered]@{missing_evidence_rejected=$true;duplicate_screenshot_hash_rejected=$true;incomplete_restart_rejected=$true;rollback_mismatch_rejected=$true;live_pass_self_claim_forbidden=$true}
}
$out=Join-Path $cfg.output_directory 'W3_TARGET_PC_UI_EVIDENCE_PACK_V2_RECEIPT.json'
$receipt|ConvertTo-Json -Depth 64|Set-Content -LiteralPath $out -Encoding UTF8
Write-Output "W3_TARGET_PC_UI_EVIDENCE_RECEIPT=$out"
Write-Output 'TARGET_PC_ACCEPTANCE_CLAIMED=false'
Write-Output 'LIVE_PASS_CLAIMED=false'
