param(
  [string]$ReleaseRoot = 'E:\SOURCE FACTORY\.yolla\yolla-panel\releases',
  [string]$BaseReleasePath,
  [string]$StateRoot = 'E:\SOURCE FACTORY\.yolla\yolla-workspace-v5-2',
  [string]$BrowserProfile = 'E:\SOURCE FACTORY\.yolla\yolla-workspace-browser-profile',
  [string]$LauncherPath = 'E:\SOURCE FACTORY\RUN_AI_YOLLA_PANEL_WORKSPACE_V5_10_2_3_7.bat',
  [string]$RendererHtmlPath
)
$ErrorActionPreference='Stop'
$TargetVersion='5.10.2.4.2-rc6'
$Candidate=Join-Path $ReleaseRoot $TargetVersion
$Payload=Join-Path $PSScriptRoot 'rc6-payload'
$Receipt=Join-Path $PSScriptRoot 'RC6_INSTALL_RECEIPT.json'
$LauncherBackup=Join-Path $PSScriptRoot 'launcher.preinstall.bytes'
$members=@(
@('automation-c-v1\c_mode_runtime.cjs','7ba9ec69c501d94e79b20774b4462a1108d8896608cd440d5932f518aab10995'),
@('automation-c-v1\c_mode_wave_pointer.cjs','7688f6fa74829e31739f4adad26fa83f77b311f8606a7a1f981caafb46f783ba'),
@('automation-c-v1\c_mode_registry_authority.cjs','87c019aebf35f6f07a8c27c2b0a7487a121d9a5f8b862ba1784993ce0f499f40'),
@('automation-c-v1\result_watcher\runtime_result_adapter.cjs','7e91f62425c971d5f062c4af065aa5f828dce00ac4f9693ee68e5f8bf504c0c3'),
@('automation-c-v1\repeat_command_runtime.cjs','20f57e91910af1346db23f16eb3e88bf572fd547a65d249820957444b1618cd2'),
@('automation-c-v1\actual_repeat_release_adapter.cjs','a15590ed669f4e996e77846a32ee81537a7db6d32758dc3375ffbfe9fc12b05d'),
@('automation-c-v1\c_repeat_namespace_adapter.cjs','57ec0d4eec89c5cd7d8685029d4560673f6135605d04857edb56c29eca00112c'),
@('automation-c-v1\actual_candidate_bridge_binding.cjs','02d5d9d9bbda02bdb0200b4c0b493e15de186802de4caade60bf913ffb77404f'),
@('automation-c-v1\background_browser_dispatch.cjs','6d87056c3b1714490f97541288f4cd3a7f1287478f63545c36730416e7c125c9'),
@('automation-c-v1\work_control_event_log.cjs','afb3376c9b70448d916f93f577a86cb8034e7b6a5c679e38fa5a809b8049b30c'),
@('automation-c-v1\workspace_ui_truth_bridge.cjs','8086f56f1f0b5731cb9ad4be5339fc211d1468f4195fcf249b7a300cc3b830e8'),
@('workspace_c_mode_rc4_truth.css','43b6a3721c250e76b2562c45d931fd17d87ae219fec70aa3ef3206af9cd8b0fe'),
@('workspace_c_mode_rc4_truth.js','5fdd1719e110ce80ad4b3efb911fd20a86ccbfeb27182645e8d2170287114b54'),
@('automation-c-v1\rc4_launcher_switch.cjs','05d65f18c029ad4a764a39ef1b4a7bf386f0090101ca7a06f12b14611444ab5b'),
@('automation-c-v1\rc4_rollback_runtime.cjs','d3cd5651eb598c55991bfc2340f6fea6124dfd6dad4b01dd35110aef6d77f70b'),
@('automation-c-v1\tests\rc4_isolated_smoke.cjs','e9ec173251cf39b035b48288117cba01ba90f0592bb5d02d85867ce95ff0c8ed'),
@('INSTALL_YOLLA_C_MODE_RC4.bat','74e2aec6f227bbd3dc493ee85f468ad8fef4f229da110475061af8c778378c95')
)
function Sha([string]$p){(Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash.ToLowerInvariant()}
try {
  if(-not (Test-Path -LiteralPath $StateRoot)){throw 'STATE_ROOT_MISSING'}
  if(-not (Test-Path -LiteralPath $BrowserProfile)){throw 'BROWSER_PROFILE_MISSING'}
  if((Resolve-Path $StateRoot).Path -eq (Resolve-Path $BrowserProfile).Path){throw 'PROFILE_STATE_ROOT_COLLISION'}
  if(-not $BaseReleasePath){
    $c=@(Get-ChildItem -LiteralPath $ReleaseRoot -Directory | Where-Object {$_.Name -eq '5.10.2.4.0'})
    if($c.Count -ne 1){throw 'BASELINE_RESOLUTION_NOT_EXACTLY_ONE'}
    $BaseReleasePath=$c[0].FullName
  }
  if(-not (Test-Path -LiteralPath $BaseReleasePath)){throw 'BASELINE_MISSING'}
  if(-not (Test-Path -LiteralPath $LauncherPath)){throw 'LAUNCHER_MISSING'}
  if(Test-Path -LiteralPath $Candidate){throw 'CANDIDATE_ALREADY_EXISTS'}
  [IO.File]::WriteAllBytes($LauncherBackup,[IO.File]::ReadAllBytes($LauncherPath))
  Copy-Item -LiteralPath $BaseReleasePath -Destination $Candidate -Recurse
  foreach($m in $members){
    $src=Join-Path $Payload $m[0]
    if(-not (Test-Path -LiteralPath $src)){throw "PAYLOAD_MISSING:$($m[0])"}
    if((Sha $src) -ne $m[1]){throw "PAYLOAD_HASH_MISMATCH:$($m[0])"}
    $dst=Join-Path $Candidate $m[0]
    New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
    Copy-Item -LiteralPath $src -Destination $dst -Force
    if((Sha $dst) -ne $m[1]){throw "OVERLAY_HASH_MISMATCH:$($m[0])"}
  }
  if(-not $RendererHtmlPath){
    $html=@(Get-ChildItem -LiteralPath $Candidate -Recurse -File -Filter '*.html' | Where-Object {$_.Name -match 'workspace|index'})
    if($html.Count -ne 1){throw 'RENDERER_HTML_RESOLUTION_NOT_EXACTLY_ONE'}
    $RendererHtmlPath=$html[0].FullName
  }
  $renderer=[IO.File]::ReadAllText($RendererHtmlPath)
  if($renderer -notmatch 'workspace_c_mode_rc4_truth\.css'){$renderer=$renderer -replace '</head>','<link rel="stylesheet" href="workspace_c_mode_rc4_truth.css"></head>'}
  if($renderer -notmatch 'workspace_c_mode_rc4_truth\.js'){$renderer=$renderer -replace '</body>','<script src="workspace_c_mode_rc4_truth.js"></script></body>'}
  [IO.File]::WriteAllText($RendererHtmlPath,$renderer,[Text.UTF8Encoding]::new($false))
  & node (Join-Path $Candidate 'automation-c-v1\tests\rc4_isolated_smoke.cjs')
  if($LASTEXITCODE -ne 0){throw "SMOKE_FAILED:$LASTEXITCODE"}
  $launcher=[IO.File]::ReadAllText($LauncherPath)
  $escaped=[regex]::Escape($BaseReleasePath)
  if(([regex]::Matches($launcher,$escaped)).Count -ne 1){throw 'LAUNCHER_BASELINE_REFERENCE_NOT_EXACTLY_ONE'}
  $next=[regex]::Replace($launcher,$escaped,[System.Text.RegularExpressions.MatchEvaluator]{param($m)$Candidate},1)
  [IO.File]::WriteAllText($LauncherPath,$next,[Text.Encoding]::Default)
  [ordered]@{status='PASS';version=$TargetVersion;members_verified=17;candidate=$Candidate;network_dependency=$false;legacy_a_e_reintroduction_count=0}|ConvertTo-Json|Set-Content -LiteralPath $Receipt -Encoding UTF8
  exit 0
} catch {
  if(Test-Path -LiteralPath $LauncherBackup){[IO.File]::WriteAllBytes($LauncherPath,[IO.File]::ReadAllBytes($LauncherBackup))}
  if(Test-Path -LiteralPath $Candidate){Remove-Item -LiteralPath $Candidate -Recurse -Force}
  [ordered]@{status='ROLLBACK';error=$_.Exception.Message}|ConvertTo-Json|Set-Content -LiteralPath $Receipt -Encoding UTF8
  exit 30
}
