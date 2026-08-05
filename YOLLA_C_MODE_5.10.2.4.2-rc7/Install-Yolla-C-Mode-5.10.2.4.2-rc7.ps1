param([string]$BaseReleasePath)
$ErrorActionPreference='Stop'
$Root=$PSScriptRoot
$Payload=Join-Path $Root 'rc7-payload'
$ReleaseRoot='E:\SOURCE FACTORY\.yolla\yolla-panel\releases'
$StateRoot='E:\SOURCE FACTORY\.yolla\yolla-workspace-v5-2'
$BrowserProfile='E:\SOURCE FACTORY\.yolla\yolla-workspace-browser-profile'
$Launcher='E:\SOURCE FACTORY\RUN_AI_YOLLA_PANEL_WORKSPACE_V5_10_2_3_7.bat'
$Candidate=Join-Path $ReleaseRoot '5.10.2.4.2-rc7'
$Receipt=Join-Path $Root 'RC7_INSTALL_RECEIPT.json'
$LauncherBackup=Join-Path $Root 'launcher.original.bytes'
$Preserve=@('runtime.log','C_MODE_STATE.json','REPEAT_COMMANDS.json','work_control_events.jsonl')
$Members=@(
 @('automation-c-v1\c_mode_runtime.cjs','7ba9ec69c501d94e79b20774b4462a1108d8896608cd440d5932f518aab10995'),
 @('automation-c-v1\c_mode_wave_pointer.cjs','7688f6fa74829e31739f4adad26fa83f77b311f8606a7a1f981caafb46f783ba'),
 @('automation-c-v1\c_mode_registry_authority.cjs','87c019aebf35f6f07a8c27c2b0a7487a121d9a5f8b862ba1784993ce0f499f40'),
 @('automation-c-v1\result_watcher\runtime_result_adapter.cjs','7e91f62425c971d5f062c4af065aa5f828dce00ac4f9693ee68e5f8bf504c0c3'),
 @('automation-c-v1\repeat_command_runtime.cjs','20f57e91910af1346db23f16eb3e88bf572fd547a65d249820957444b1618cd2'),
 @('automation-c-v1\actual_repeat_release_adapter.cjs','a15590ed669f4e996e77846a32ee81537a7db6d32758dc3375ffbfe9fc12b05d'),
 @('automation-c-v1\c_repeat_namespace_adapter.cjs','57ec0d4eec89c5cd7d8685029d4560673f6135605d04857edb56c29eca00112c'),
 @('automation-c-v1\actual_candidate_bridge_binding.cjs','02d5d9d9bbda02bdb0200b4c0b493e15de186802de4caade60bf913ffb77404f'),
 @('automation-c-v1\work_control_event_log.cjs','afb3376c9b70448d916f93f577a86cb8034e7b6a5c679e38fa5a809b8049b30c'),
 @('automation-c-v1\workspace_ui_truth_bridge.cjs','8086f56f1f0b5731cb9ad4be5339fc211d1468f4195fcf249b7a300cc3b830e8'),
 @('workspace_c_mode_rc4_truth.css','43b6a3721c250e76b2562c45d931fd17d87ae219fec70aa3ef3206af9cd8b0fe'),
 @('workspace_c_mode_rc4_truth.js','5fdd1719e110ce80ad4b3efb911fd20a86ccbfeb27182645e8d2170287114b54'),
 @('automation-c-v1\rc4_launcher_switch.cjs','05d65f18c029ad4a764a39ef1b4a7bf386f0090101ca7a06f12b14611444ab5b'),
 @('automation-c-v1\rc4_rollback_runtime.cjs','d3cd5651eb598c55991bfc2340f6fea6124dfd6dad4b01dd35110aef6d77f70b'),
 @('automation-c-v1\tests\rc4_isolated_smoke.cjs','e9ec173251cf39b035b48288117cba01ba90f0592bb5d02d85867ce95ff0c8ed')
)
function Hash([string]$p){if(Test-Path -LiteralPath $p){(Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash.ToLowerInvariant()}else{$null}}
$Before=[ordered]@{launcher=Hash $Launcher;profile_exists=(Test-Path $BrowserProfile);dispatch_receipts_exists=(Test-Path (Join-Path $StateRoot 'dispatch-receipts'))}
foreach($n in $Preserve){$Before[$n]=Hash (Join-Path $StateRoot $n)}
try {
 if(!(Test-Path $StateRoot)){throw 'STATE_ROOT_MISSING'}
 if(!(Test-Path $BrowserProfile)){throw 'BROWSER_PROFILE_MISSING'}
 if(!(Test-Path $Launcher)){throw 'LAUNCHER_MISSING'}
 if(!(Test-Path $Payload)){throw 'PAYLOAD_ROOT_MISSING'}
 foreach($m in $Members){$src=Join-Path $Payload $m[0];if(!(Test-Path $src)){throw "PAYLOAD_MISSING:$($m[0])"};if((Hash $src)-ne$m[1]){throw "PAYLOAD_HASH_MISMATCH:$($m[0])"}}
 $resolver=Join-Path $Root 'tools\target_pc_runtime_locator.cjs'
 $resolverReceipt=Join-Path $Root 'resolver-receipt.json'
 $args=@($resolver,'--release-root',$ReleaseRoot,'--baseline-version','5.10.2.4.0','--target-version','5.10.2.4.2-rc7','--candidate-release-path',$Candidate,'--launcher-path',$Launcher,'--state-root',$StateRoot,'--receipt-path',$resolverReceipt)
 if($BaseReleasePath){$args+=@('--base-release-path',$BaseReleasePath)}
 & node @args
 if($LASTEXITCODE-ne0){throw "RESOLVER_FAILED:$LASTEXITCODE"}
 if(!(Test-Path $Candidate)){throw 'RESOLVER_DID_NOT_CREATE_CANDIDATE'}
 foreach($m in $Members){$src=Join-Path $Payload $m[0];$dst=Join-Path $Candidate $m[0];New-Item -ItemType Directory -Force -Path (Split-Path $dst)|Out-Null;Copy-Item -LiteralPath $src -Destination $dst -Force;if((Hash $dst)-ne$m[1]){throw "OVERLAY_HASH_MISMATCH:$($m[0])"}}
 Copy-Item (Join-Path $Root 'runtime\background_browser_dispatch.cjs') (Join-Path $Candidate 'automation-c-v1\background_browser_dispatch.cjs') -Force
 & node (Join-Path $Root 'tools\apply_w3_rc7_ui_overlay.cjs') --release $Candidate --package $Payload --receipt (Join-Path $Root 'ui-hook-receipt.json')
 if($LASTEXITCODE-ne0){throw 'UI_HOOK_FAILED'}
 & node (Join-Path $Root 'tests\full_component_smoke.cjs') --release $Candidate --state $StateRoot --profile $BrowserProfile --receipt (Join-Path $Root 'full-smoke-receipt.json')
 if($LASTEXITCODE-ne0){throw 'FULL_SMOKE_FAILED'}
 [IO.File]::WriteAllBytes($LauncherBackup,[IO.File]::ReadAllBytes($Launcher))
 $text=[IO.File]::ReadAllText($Launcher)
 if($text -notmatch [regex]::Escape('5.10.2.4.0')){throw 'LAUNCHER_BASELINE_TOKEN_MISSING'}
 $next=$text -replace [regex]::Escape('5.10.2.4.0'),'5.10.2.4.2-rc7'
 [IO.File]::WriteAllText($Launcher,$next,[Text.Encoding]::Default)
 $After=[ordered]@{launcher=Hash $Launcher;profile_exists=(Test-Path $BrowserProfile);dispatch_receipts_exists=(Test-Path (Join-Path $StateRoot 'dispatch-receipts'))}
 foreach($n in $Preserve){$After[$n]=Hash (Join-Path $StateRoot $n)}
 foreach($n in $Preserve){if($Before[$n]-ne$After[$n]){throw "PRESERVATION_HASH_CHANGED:$n"}}
 if($Before.profile_exists-ne$After.profile_exists){throw 'PROFILE_EXISTENCE_CHANGED'}
 if($Before.dispatch_receipts_exists-ne$After.dispatch_receipts_exists){throw 'DISPATCH_RECEIPT_EXISTENCE_CHANGED'}
 [ordered]@{status='PASS';target='5.10.2.4.2-rc7';resolver_consumed=$true;payload_verified=15;corrected_background_installed=$true;ui_hook_applied=$true;smoke='PASS';launcher_switched_after_smoke=$true;install_time_network_dependency=$false;worker_partition='persist:sf4-safe-panel-worker-1';analysis_partition='persist:yolla-analysis-browser-v1';before=$Before;after=$After}|ConvertTo-Json -Depth 6|Set-Content $Receipt -Encoding UTF8
 exit 0
} catch {
 try {& node (Join-Path $Root 'tools\rollback_w3_rc7_ui_overlay.cjs') --release $Candidate --receipt (Join-Path $Root 'ui-rollback-receipt.json')} catch {}
 if(Test-Path $LauncherBackup){[IO.File]::WriteAllBytes($Launcher,[IO.File]::ReadAllBytes($LauncherBackup))}
 if(Test-Path $Candidate){Remove-Item $Candidate -Recurse -Force}
 [ordered]@{status='ROLLBACK';error=$_.Exception.Message;launcher_restored=(Test-Path $LauncherBackup);candidate_removed=(-not(Test-Path $Candidate))}|ConvertTo-Json|Set-Content $Receipt -Encoding UTF8
 exit 30
}
