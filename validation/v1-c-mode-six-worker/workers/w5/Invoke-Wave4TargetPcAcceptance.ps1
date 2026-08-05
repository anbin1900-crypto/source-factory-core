param(
  [Parameter(Mandatory=$true)][string]$CandidateManifest,
  [Parameter(Mandatory=$true)][string]$EvidenceRoot,
  [switch]$Live
)
$ErrorActionPreference='Stop'
$expectedVersion='5.10.2.4.1'
$controlId='V1-C-MODE-6W-VALIDATION-CYCLE-002'
$waveId='V1-C-MODE-6W-WAVE-004'
function Fail([string]$Code,[string]$Message){ throw "$Code|$Message" }
if(!(Test-Path -LiteralPath $CandidateManifest)){ Fail 'CANDIDATE_MANIFEST_MISSING' $CandidateManifest }
$m=Get-Content -Raw -LiteralPath $CandidateManifest | ConvertFrom-Json
foreach($f in @('version','package_path','package_sha256','w2_report_gate','w3_ui_collector','w4_soak_validator')){ if(-not $m.PSObject.Properties.Name.Contains($f)){ Fail 'MANIFEST_FIELD_MISSING' $f } }
if($m.version -ne $expectedVersion){ Fail 'VERSION_MISMATCH' "$($m.version)!=$expectedVersion" }
foreach($p in @($m.package_path,$m.w2_report_gate,$m.w3_ui_collector,$m.w4_soak_validator)){ if(!(Test-Path -LiteralPath $p)){ Fail 'BOUND_INPUT_MISSING' $p } }
$observed=(Get-FileHash -Algorithm SHA256 -LiteralPath $m.package_path).Hash.ToLowerInvariant()
if($observed -ne ([string]$m.package_sha256).ToLowerInvariant()){ Fail 'PACKAGE_SHA256_MISMATCH' $observed }
$stamp=(Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$evidence=Join-Path $EvidenceRoot ("WAVE4-W5-"+$stamp)
New-Item -ItemType Directory -Path $evidence -Force | Out-Null
$smoke=Join-Path $evidence 'smoke-profile'; New-Item -ItemType Directory -Path $smoke -Force | Out-Null
$liveProfile=$env:LOCALAPPDATA
$workLog=if($m.work_control_log){[string]$m.work_control_log}else{''}
$before=@{ live_profile_exists=(Test-Path $liveProfile); work_log_exists=($workLog -and (Test-Path $workLog)) }
$steps=@()
foreach($s in @(@('W2_REPORT_GATE',$m.w2_report_gate),@('W3_UI_COLLECTOR',$m.w3_ui_collector),@('W4_SOAK_VALIDATOR',$m.w4_soak_validator))){
  $name=$s[0]; $path=$s[1];
  $steps += @{name=$name; path=$path; status='BOUND_OFFLINE'}
}
$rounds=@(); 1..3 | ForEach-Object { $r=$_; 1..6 | ForEach-Object { $rounds += @{round=$r;worker=$_;status='PENDING_LIVE_RECEIPT'} } }
$receipt=[ordered]@{
 schema_version='W5_WAVE4_TARGET_PC_RECEIPT_V1'; control_id=$controlId; wave_id=$waveId;
 command_id='C6W-W4-W5-ONE-CLICK-TARGET-PC-PACKAGE'; exact_version=$expectedVersion;
 package_sha256=$observed; evidence_directory=$evidence; immutable_after_completion=$true;
 smoke_profile=$smoke; live_profile_preserved=$before.live_profile_exists; work_control_log_preserved=$before.work_log_exists;
 hidden_browser_release='REQUIRED_LIVE_CHECK'; retry_policy=@{document_ready_timeout_seconds=30;max_attempts=5};
 install_smoke_rollback_restart='PENDING_WINDOWS_LIVE'; validators=$steps; six_worker_three_round=$rounds;
 historical_runtime_log_policy='ERROR_FIXTURE_ONLY_EXCLUDE_A_E_FROM_CURRENT_C_COUNT';
 offline_package_status='PASS'; live_status=if($Live){'BLOCKED_NO_LIVE_RECEIPTS'}else{'NOT_REQUESTED'};
 production=$false; ready=$false; merge=$false
}
$receiptPath=Join-Path $evidence 'FINAL_RECEIPT.json'
$receipt | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $receiptPath -Encoding UTF8
$manifestPath=Join-Path $evidence 'EVIDENCE_MANIFEST.json'
Get-ChildItem -File -Recurse $evidence | ForEach-Object { @{path=$_.FullName;sha256=(Get-FileHash -Algorithm SHA256 $_.FullName).Hash.ToLowerInvariant();size=$_.Length} } | ConvertTo-Json -Depth 4 | Set-Content $manifestPath -Encoding UTF8
Write-Output $receiptPath
