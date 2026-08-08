$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$role='ROLE=D-2_CONTEXT_REGISTRY_AND_ACTIVE_WORKER_OWNER'
$cycle='D1-CONTEXT-AWARE-MESSAGE-LOOP-CYCLE2-20260808-001'
$candidates=@()
Get-Process chrome -ErrorAction Stop | Where-Object {$_.MainWindowHandle -ne 0} | ForEach-Object {
  $p=$_
  $wmi=Get-CimInstance Win32_Process -Filter ("ProcessId="+$p.Id)
  $cmd=[string]$wmi.CommandLine
  if($cmd -notmatch '--remote-debugging-port(?:=|\s+)9222'){$candidates += $p}
}
if($candidates.Count -ne 1){
  [ordered]@{schema_version='D2_ACTIVE_CONTEXT_LIVE_RECEIPT_V1';cycle_id=$cycle;terminal='ACTIVE_CONTEXT_IDENTIFICATION_LIVE_BLOCKED';blocker_code='NON_CDP_USER_CHROME_WINDOW_NOT_UNIQUE';window_match_count=$candidates.Count;ROLE_ID='D-2_CONTEXT_REGISTRY_AND_ACTIVE_WORKER_OWNER';CONTEXT_ID=$null;CONTEXT_NAME=$null;PAGE_ID=$null;COMMAND_ID='C2-W2-EXECUTOR-CLAIM-RECOVERY-AND-EXACT-CONTEXT-LIVE-V1-20260808-001';WORK_STATUS='REVIEW_REQUIRED';STARTED_AT='2026-08-07T16:39:00.000Z';LAST_SEEN_AT=(Get-Date).ToUniversalTime().ToString('o');target_pc_live_readback=$false;production=$false} | ConvertTo-Json -Depth 5 -Compress
  exit 0
}
$p=$candidates[0]
$root=[System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)
$all=$root.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
$sb=New-Object System.Text.StringBuilder
$url=$null
$tabName=$null
$tabRuntime=$null
$stopVisible=$false
foreach($e in $all){
  $name=[string]$e.Current.Name
  if($name){[void]$sb.AppendLine($name)}
  if($name -match '(?i)stop generating|stop responding|중지'){$stopVisible=$true}
  if($e.Current.ControlType -eq [System.Windows.Automation.ControlType]::TabItem){
    try {
      $sp=$e.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
      if($sp.Current.IsSelected){$tabName=$name;$tabRuntime=($e.GetRuntimeId() -join '.')}
    } catch {}
  }
  try {
    $vp=$e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    $v=[string]$vp.Current.Value
    if($v -match '^(https://)?chatgpt\.com/.*/c/[A-Za-z0-9-]+'){$url=$v}
  } catch {}
}
$treeText=$sb.ToString()
$roleMatch=$treeText.Contains($role)
$cycleMatch=$treeText.Contains($cycle)
if($url -and $url -notmatch '^https://'){$url='https://'+$url}
$contextId=$null
if($url -match '/c/([A-Za-z0-9-]+)'){$contextId=$Matches[1]}
$pageId=$null
if($tabRuntime){$pageId='UIA-TAB-'+$tabRuntime}else{$pageId='HWND-'+([string]$p.MainWindowHandle)}
$contextName=$tabName
if(-not $contextName){$contextName=([string]$p.MainWindowTitle) -replace '\s+-\s+Chrome$',''}
$exact=($roleMatch -and $cycleMatch -and $contextId -and $pageId -and $contextName)
$terminal=if($exact){'ACTIVE_CONTEXT_IDENTIFICATION_LIVE_PASS'}else{'ACTIVE_CONTEXT_IDENTIFICATION_LIVE_BLOCKED'}
$blocker=if($exact){$null}else{'UIA_EXACT_ROLE_CYCLE_CONTEXT_BINDING_NOT_RESOLVED'}
$status=if($stopVisible){'WORKING'}else{'RESULT_PENDING'}
[ordered]@{schema_version='D2_ACTIVE_CONTEXT_LIVE_RECEIPT_V1';cycle_id=$cycle;terminal=$terminal;blocker_code=$blocker;ROLE_ID='D-2_CONTEXT_REGISTRY_AND_ACTIVE_WORKER_OWNER';CONTEXT_ID=$contextId;CONTEXT_NAME=$contextName;PAGE_ID=$pageId;COMMAND_ID='C2-W2-EXECUTOR-CLAIM-RECOVERY-AND-EXACT-CONTEXT-LIVE-V1-20260808-001';WORK_STATUS=$status;STARTED_AT='2026-08-07T16:39:00.000Z';LAST_SEEN_AT=(Get-Date).ToUniversalTime().ToString('o');binding_state=if($exact){'LIVE_EXACT_ROLE_AND_CYCLE_MARKER_BOUND_UIA'}else{'REVIEW_REQUIRED'};role_marker_match=$roleMatch;cycle_marker_match=$cycleMatch;active_window_pid=[int]$p.Id;active_window_handle=[int64]$p.MainWindowHandle;active_window_title=[string]$p.MainWindowTitle;accessibility_element_count=$all.Count;selected_tab_runtime_resolved=[bool]$tabRuntime;url_resolved=[bool]$url;raw_conversation_persisted=$false;secret_exposure_count=0;target_pc_live_readback=$exact;source_reuse=[ordered]@{page_registry='PR22';view_model='PR38';browser='EXISTING_CHROME_UIA'};new_executor_count=0;new_tunnel_count=0;new_transport_count=0;production=$false} | ConvertTo-Json -Depth 6 -Compress
exit 0
