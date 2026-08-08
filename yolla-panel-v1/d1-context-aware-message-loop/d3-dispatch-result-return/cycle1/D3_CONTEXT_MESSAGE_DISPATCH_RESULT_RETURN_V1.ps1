param(
  [string]$InputPath = 'E:\YOLLA\server\approved-ops\D3_CONTEXT_MESSAGE_DISPATCH_RESULT_RETURN_INPUT_V1.json'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class D3NativeWindow {
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
}
'@

$script:Events = New-Object System.Collections.ArrayList
$script:MessageSent = $false
$script:MessageVisibleEvidence = $null
$script:Input = $null

function Add-LoopEvent {
  param([string]$Type, [hashtable]$Data = @{})
  $event = [ordered]@{
    event_type = $Type
    occurred_at = (Get-Date).ToUniversalTime().ToString('o')
  }
  foreach ($key in $Data.Keys) { $event[$key] = $Data[$key] }
  [void]$script:Events.Add([pscustomobject]$event)
  return $event
}

function Get-Sha256Text {
  param([string]$Text)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    return (($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join '')
  } finally { $sha.Dispose() }
}

function Get-RuntimeIdText {
  param([System.Windows.Automation.AutomationElement]$Element)
  try { return (($Element.GetRuntimeId()) -join '.') } catch { return '' }
}

function Get-ElementName {
  param([System.Windows.Automation.AutomationElement]$Element)
  try { return [string]$Element.Current.Name } catch { return '' }
}

function Get-ElementValue {
  param([System.Windows.Automation.AutomationElement]$Element)
  try {
    $pattern = $Element.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    return [string]$pattern.Current.Value
  } catch { return '' }
}

function Get-AllElements {
  param([System.Windows.Automation.AutomationElement]$Root)
  return $Root.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    [System.Windows.Automation.Condition]::TrueCondition
  )
}

function Get-NonCdpChromeProcesses {
  $items = @()
  Get-Process chrome -ErrorAction Stop | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object {
    $process = $_
    $wmi = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $process.Id)
    $commandLine = [string]$wmi.CommandLine
    if ($commandLine -notmatch '--remote-debugging-port(?:=|\s+)9222') { $items += $process }
  }
  return @($items)
}

function Open-ExactContextInExistingChrome {
  param([string]$ContextUrl)
  $processes = @(Get-NonCdpChromeProcesses)
  if ($processes.Count -ne 1) { throw ('NON_CDP_CHROME_WINDOW_COUNT_INVALID count=' + $processes.Count) }
  $process = $processes[0]
  $root = [System.Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
  $address = $null
  foreach ($element in (Get-AllElements -Root $root)) {
    try {
      if ($element.Current.ControlType -ne [System.Windows.Automation.ControlType]::Edit) { continue }
      $name = Get-ElementName -Element $element
      $value = Get-ElementValue -Element $element
      if ($name -match '(?i)address and search bar|주소 및 검색창' -or $value -match '^(https://)?[^ ]+\.[^ ]+') {
        $address = $element
        if ($name -match '(?i)address and search bar|주소 및 검색창') { break }
      }
    } catch {}
  }
  if ($null -eq $address) { throw 'CHROME_ADDRESS_BAR_NOT_FOUND' }
  [void][D3NativeWindow]::SetForegroundWindow([IntPtr]$process.MainWindowHandle)
  Start-Sleep -Milliseconds 300
  try {
    $valuePattern = $address.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    $valuePattern.SetValue($ContextUrl)
  } catch { throw ('CHROME_ADDRESS_BAR_SET_FAILED ' + $_.Exception.Message) }
  $address.SetFocus()
  Start-Sleep -Milliseconds 150
  [System.Windows.Forms.SendKeys]::SendWait('%{ENTER}')
  Start-Sleep -Seconds 2
  return $process
}

function Resolve-ExactPage {
  param([string]$ExpectedContextId, [string]$ExpectedPageId, [string]$ContextUrl)
  $tabMatches = @()
  foreach ($process in (Get-NonCdpChromeProcesses)) {
    $root = [System.Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
    if ($null -eq $root) { continue }
    $all = Get-AllElements -Root $root
    $tabs = @()
    $originalSelectedId = $null
    foreach ($element in $all) {
      try {
        if ($element.Current.ControlType -ne [System.Windows.Automation.ControlType]::TabItem) { continue }
        $pageId = 'UIA-TAB-' + (Get-RuntimeIdText -Element $element)
        $selection = $element.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
        if ($selection.Current.IsSelected) { $originalSelectedId = $pageId }
        $tabs += [pscustomobject]@{
          element = $element
          page_id = $pageId
          priority = if ($pageId -eq $ExpectedPageId) { 0 } elseif ($selection.Current.IsSelected) { 1 } else { 2 }
        }
      } catch {}
    }
    foreach ($tabInfo in ($tabs | Sort-Object priority)) {
      try {
        $selection = $tabInfo.element.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
        if (-not $selection.Current.IsSelected) { $selection.Select(); Start-Sleep -Milliseconds 450 }
      } catch { continue }
      $currentRoot = [System.Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
      $currentAll = Get-AllElements -Root $currentRoot
      $url = $null
      foreach ($element in $currentAll) {
        $value = Get-ElementValue -Element $element
        if ($value -match '^(https://)?chatgpt\.com/.*/c/[A-Za-z0-9-]+') { $url = $value }
      }
      $contextId = $null
      if ($url -match '/c/([A-Za-z0-9-]+)') { $contextId = $Matches[1] }
      if ($contextId -eq $ExpectedContextId) {
        $tabMatches += [pscustomobject]@{
          process = $process
          page_id = [string]$tabInfo.page_id
        }
        if ([string]$tabInfo.page_id -eq $ExpectedPageId) { break }
      }
    }
    if ($originalSelectedId) {
      $restoreRoot = [System.Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
      foreach ($element in (Get-AllElements -Root $restoreRoot)) {
        try {
          if ($element.Current.ControlType -ne [System.Windows.Automation.ControlType]::TabItem) { continue }
          if (('UIA-TAB-' + (Get-RuntimeIdText -Element $element)) -ne $originalSelectedId) { continue }
          $restore = $element.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
          if (-not $restore.Current.IsSelected) { $restore.Select(); Start-Sleep -Milliseconds 250 }
        } catch {}
      }
    }
  }
  if ($tabMatches.Count -eq 0 -and $ContextUrl) {
    $openedProcess = Open-ExactContextInExistingChrome -ContextUrl $ContextUrl
    for ($openPoll = 0; $openPoll -lt 20; $openPoll += 1) {
      Start-Sleep -Milliseconds 500
      $openedRoot = [System.Windows.Automation.AutomationElement]::FromHandle($openedProcess.MainWindowHandle)
      $openedAll = Get-AllElements -Root $openedRoot
      $openedUrl = $null
      $openedTab = $null
      foreach ($element in $openedAll) {
        $value = Get-ElementValue -Element $element
        if ($value -match '^(https://)?chatgpt\.com/.*/c/[A-Za-z0-9-]+') { $openedUrl = $value }
        try {
          if ($element.Current.ControlType -eq [System.Windows.Automation.ControlType]::TabItem) {
            $selection = $element.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
            if ($selection.Current.IsSelected) { $openedTab = $element }
          }
        } catch {}
      }
      $openedContextId = $null
      if ($openedUrl -match '/c/([A-Za-z0-9-]+)') { $openedContextId = $Matches[1] }
      if ($openedContextId -eq $ExpectedContextId -and $openedTab) {
        $tabMatches += [pscustomobject]@{
          process = $openedProcess
          page_id = 'UIA-TAB-' + (Get-RuntimeIdText -Element $openedTab)
        }
        break
      }
    }
  }
  if ($tabMatches.Count -ne 1) { throw ('EXACT_CONTEXT_OPEN_TAB_MATCH_COUNT_INVALID count=' + $tabMatches.Count) }
  $target = $tabMatches[0]
  $pageRebound = ([string]$target.page_id -ne $ExpectedPageId)
  $targetRoot = [System.Windows.Automation.AutomationElement]::FromHandle($target.process.MainWindowHandle)
  $targetTab = $null
  foreach ($element in (Get-AllElements -Root $targetRoot)) {
    try {
      if ($element.Current.ControlType -eq [System.Windows.Automation.ControlType]::TabItem -and
          ('UIA-TAB-' + (Get-RuntimeIdText -Element $element)) -eq [string]$target.page_id) {
        $targetTab = $element
        break
      }
    } catch {}
  }
  if ($null -eq $targetTab) { throw 'EXACT_CONTEXT_TARGET_TAB_DISAPPEARED' }
  try {
    $selection = $targetTab.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
    if (-not $selection.Current.IsSelected) { $selection.Select(); Start-Sleep -Milliseconds 700 }
  } catch { throw ('EXACT_TAB_SELECTION_FAILED ' + $_.Exception.Message) }
  $root = [System.Windows.Automation.AutomationElement]::FromHandle($target.process.MainWindowHandle)
  $all = Get-AllElements -Root $root
  $url = $null
  $roleText = New-Object System.Text.StringBuilder
  foreach ($element in $all) {
    $name = Get-ElementName -Element $element
    if ($name) { [void]$roleText.AppendLine($name) }
    $value = Get-ElementValue -Element $element
    if ($value -match '^(https://)?chatgpt\.com/.*/c/[A-Za-z0-9-]+') { $url = $value }
  }
  if ($url -and $url -notmatch '^https://') { $url = 'https://' + $url }
  $contextId = $null
  if ($url -match '/c/([A-Za-z0-9-]+)') { $contextId = $Matches[1] }
  if ($contextId -ne $ExpectedContextId) {
    throw ('CONTEXT_BINDING_MISMATCH expected=' + $ExpectedContextId + ' actual=' + [string]$contextId)
  }
  return [pscustomobject]@{
    process = $target.process
    root = $root
    all = $all
    page_id = [string]$target.page_id
    previous_page_id = $ExpectedPageId
    page_rebound = $pageRebound
    context_id = $contextId
    url = $url
    tree_text = $roleText.ToString()
  }
}

function Find-Composer {
  param([System.Collections.IEnumerable]$Elements)
  $candidates = @()
  foreach ($element in $Elements) {
    try {
      if ($element.Current.ControlType -ne [System.Windows.Automation.ControlType]::Edit) { continue }
      if (-not $element.Current.IsEnabled) { continue }
      $name = Get-ElementName -Element $element
      $automationId = [string]$element.Current.AutomationId
      $score = 0
      if ($element.Current.IsKeyboardFocusable) { $score += 10 }
      if (-not $element.Current.IsOffscreen) { $score += 5 }
      if ($name -match '(?i)message chatgpt|ask anything|prompt|메시지|무엇이든') { $score += 30 }
      if ($automationId -match '(?i)prompt|composer|textarea') { $score += 20 }
      $candidates += [pscustomobject]@{ element = $element; score = $score; name = $name; automation_id = $automationId }
    } catch {}
  }
  if ($candidates.Count -eq 0) { throw 'CHATGPT_COMPOSER_NOT_FOUND' }
  return ($candidates | Sort-Object score | Select-Object -Last 1).element
}

function Set-ComposerText {
  param(
    [System.Windows.Automation.AutomationElement]$Composer,
    [string]$Text
  )
  try {
    $valuePattern = $Composer.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    if (-not $valuePattern.Current.IsReadOnly) {
      $valuePattern.SetValue($Text)
      return 'VALUE_PATTERN'
    }
  } catch {}

  $clipboardBackup = $null
  $hadText = $false
  try {
    if ([System.Windows.Forms.Clipboard]::ContainsText()) {
      $clipboardBackup = [System.Windows.Forms.Clipboard]::GetText()
      $hadText = $true
    }
    [System.Windows.Forms.Clipboard]::SetText($Text)
    $Composer.SetFocus()
    Start-Sleep -Milliseconds 150
    [System.Windows.Forms.SendKeys]::SendWait('^a')
    [System.Windows.Forms.SendKeys]::SendWait('^v')
    Start-Sleep -Milliseconds 250
    return 'CLIPBOARD_PASTE'
  } finally {
    try {
      if ($hadText) { [System.Windows.Forms.Clipboard]::SetText($clipboardBackup) }
      else { [System.Windows.Forms.Clipboard]::Clear() }
    } catch {}
  }
}

function Invoke-Send {
  param(
    [System.Windows.Automation.AutomationElement]$Root,
    [System.Windows.Automation.AutomationElement]$Composer
  )
  $all = Get-AllElements -Root $Root
  $buttons = @()
  foreach ($element in $all) {
    try {
      if ($element.Current.ControlType -ne [System.Windows.Automation.ControlType]::Button) { continue }
      if (-not $element.Current.IsEnabled -or $element.Current.IsOffscreen) { continue }
      $name = Get-ElementName -Element $element
      if ($name -match '(?i)^send$|send message|submit|메시지 보내기|^보내기$') { $buttons += $element }
    } catch {}
  }
  if ($buttons.Count -gt 0) {
    $button = $buttons[$buttons.Count - 1]
    try {
      $invoke = $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
      $invoke.Invoke()
      return 'SEND_BUTTON_INVOKE'
    } catch {}
  }
  $Composer.SetFocus()
  [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
  return 'COMPOSER_ENTER'
}

function Test-StopVisible {
  param([System.Collections.IEnumerable]$Elements)
  foreach ($element in $Elements) {
    try {
      if ($element.Current.IsOffscreen) { continue }
      $name = Get-ElementName -Element $element
      if ($name -match '(?i)stop generating|stop responding|생성 중지|응답 중지') { return $true }
    } catch {}
  }
  return $false
}

function Test-MessageVisibleOutsideComposer {
  param(
    [System.Collections.IEnumerable]$Elements,
    [System.Windows.Automation.AutomationElement]$Composer,
    [string]$Marker
  )
  $composerId = Get-RuntimeIdText -Element $Composer
  $composerValue = Get-ElementValue -Element $Composer
  $visibleMatches = @()
  foreach ($element in $Elements) {
    $elementId = Get-RuntimeIdText -Element $element
    if ($elementId -eq $composerId) { continue }
    $name = Get-ElementName -Element $element
    $value = Get-ElementValue -Element $element
    if ($name.Contains($Marker) -or $value.Contains($Marker)) { $visibleMatches += $elementId }
  }
  return [pscustomobject]@{
    visible = ($visibleMatches.Count -gt 0 -and -not $composerValue.Contains($Marker))
    match_count = $visibleMatches.Count
    composer_contains_marker = $composerValue.Contains($Marker)
    matching_runtime_ids = @($visibleMatches)
  }
}

function Get-FilteredDescendantText {
  param(
    [System.Windows.Automation.AutomationElement]$Root,
    [string]$ExpectedMarker,
    [string]$UserMarker
  )
  $all = Get-AllElements -Root $Root
  $seen = @{}
  $parts = New-Object System.Collections.ArrayList
  foreach ($element in $all) {
    try {
      if ($element.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button) { continue }
      $name = (Get-ElementName -Element $element).Trim()
      if (-not $name -or $seen.ContainsKey($name)) { continue }
      if ($name -match '(?i)^copy$|^read aloud$|good response|bad response|^edit$|^retry$|^복사$|소리 내어 읽기|좋은 답변|나쁜 답변|^편집$|^다시 시도$') { continue }
      $seen[$name] = $true
      [void]$parts.Add($name)
    } catch {}
  }
  $text = ($parts -join "`n").Trim()
  if (-not $text.Contains($ExpectedMarker) -or $text.Contains($UserMarker)) { return $null }
  return $text
}

function Find-ReplyRaw {
  param(
    [System.Windows.Automation.AutomationElement]$Root,
    [System.Collections.IEnumerable]$Elements,
    [string]$ExpectedMarker,
    [string]$UserMarker
  )
  $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
  $best = $null
  foreach ($element in $Elements) {
    $name = Get-ElementName -Element $element
    $value = Get-ElementValue -Element $element
    $direct = if ($name.Contains($ExpectedMarker)) { $name } elseif ($value.Contains($ExpectedMarker)) { $value } else { $null }
    if (-not $direct -or $direct.Contains($UserMarker)) { continue }
    $candidate = $direct.Trim()
    $ancestor = $element
    for ($level = 0; $level -lt 5; $level += 1) {
      try { $ancestor = $walker.GetParent($ancestor) } catch { $ancestor = $null }
      if ($null -eq $ancestor) { break }
      $joined = Get-FilteredDescendantText -Root $ancestor -ExpectedMarker $ExpectedMarker -UserMarker $UserMarker
      if ($joined -and $joined.Length -le 20000 -and $joined.Length -gt $candidate.Length) { $candidate = $joined }
    }
    if (-not $best -or $candidate.Length -gt $best.Length) { $best = $candidate }
  }
  return $best
}

function Emit-Result {
  param([System.Collections.IDictionary]$Result)
  $Result.events = @($script:Events)
  $Result.message_sent = [bool]$script:MessageSent
  $Result.message_visible_evidence = $script:MessageVisibleEvidence
  $Result.new_system_build = $false
  $Result.production = $false
  $Result.ready = $false
  $Result.merge = $false
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  [Console]::Out.WriteLine(($Result | ConvertTo-Json -Depth 12 -Compress))
}

try {
  if (-not (Test-Path -LiteralPath $InputPath)) { throw 'INPUT_FILE_NOT_FOUND' }
  $script:Input = Get-Content -LiteralPath $InputPath -Raw -Encoding UTF8 | ConvertFrom-Json
  foreach ($name in @('cycle_id','command_id','context_id','context_name','page_id','context_url','message','message_marker','expected_reply_contains')) {
    if (-not $script:Input.PSObject.Properties[$name] -or -not [string]$script:Input.$name) { throw ($name.ToUpperInvariant() + '_REQUIRED') }
  }

  $page = Resolve-ExactPage -ExpectedContextId ([string]$script:Input.context_id) -ExpectedPageId ([string]$script:Input.page_id) -ContextUrl ([string]$script:Input.context_url)
  $boundPageId = [string]$page.page_id
  if ($script:Input.PSObject.Properties['role_marker'] -and [string]$script:Input.role_marker) {
    if (-not $page.tree_text.Contains([string]$script:Input.role_marker)) {
      $receiptBindingAllowed = (
        $script:Input.PSObject.Properties['allow_d2_receipt_binding_after_refresh'] -and
        [bool]$script:Input.allow_d2_receipt_binding_after_refresh -and
        $script:Input.PSObject.Properties['d2_live_receipt_blob'] -and
        [string]$script:Input.d2_live_receipt_blob -eq 'e4b12628631f89b13bf0e0d05486e99d30333290'
      )
      if (-not $receiptBindingAllowed) { throw 'D2_ROLE_MARKER_NOT_VISIBLE_IN_BOUND_CONTEXT' }
      Add-LoopEvent -Type 'D2_RECEIPT_CONTEXT_REBIND_AFTER_REFRESH' -Data @{
        context_id = [string]$script:Input.context_id
        d2_live_receipt_blob = [string]$script:Input.d2_live_receipt_blob
        role_marker_currently_rendered = $false
      } | Out-Null
    }
  }
  Add-LoopEvent -Type 'CONTEXT_BOUND' -Data @{
    context_id = [string]$script:Input.context_id
    page_id = [string]$page.page_id
    previous_page_id = [string]$script:Input.page_id
    page_rebound = [bool]$page.page_rebound
    url = [string]$page.url
  } | Out-Null

  if ($page.tree_text.Contains([string]$script:Input.expected_reply_contains)) {
    throw 'EXPECTED_REPLY_MARKER_PRESENT_BEFORE_DISPATCH'
  }

  $composer = Find-Composer -Elements $page.all
  $inputMethod = Set-ComposerText -Composer $composer -Text ([string]$script:Input.message)
  Start-Sleep -Milliseconds 400
  $submitMethod = Invoke-Send -Root $page.root -Composer $composer
  Add-LoopEvent -Type 'DISPATCH_SUBMITTED' -Data @{ input_method = $inputMethod; submit_method = $submitMethod } | Out-Null

  $visibilityPolls = if ($script:Input.PSObject.Properties['visibility_polls']) { [int]$script:Input.visibility_polls } else { 40 }
  $visible = $null
  for ($attempt = 1; $attempt -le $visibilityPolls; $attempt += 1) {
    Start-Sleep -Milliseconds 500
    $page = Resolve-ExactPage -ExpectedContextId ([string]$script:Input.context_id) -ExpectedPageId $boundPageId -ContextUrl ([string]$script:Input.context_url)
    $boundPageId = [string]$page.page_id
    $composer = Find-Composer -Elements $page.all
    $proof = Test-MessageVisibleOutsideComposer -Elements $page.all -Composer $composer -Marker ([string]$script:Input.message_marker)
    if ($proof.visible) { $visible = $proof; break }
  }
  if ($null -eq $visible) { throw 'USER_MESSAGE_NOT_VISIBLE_OUTSIDE_COMPOSER' }

  $script:MessageSent = $true
  $script:MessageVisibleEvidence = $visible
  Add-LoopEvent -Type 'MESSAGE_SENT' -Data @{
    visible_in_conversation = $true
    composer_contains_message = $false
    message_sha256 = (Get-Sha256Text -Text ([string]$script:Input.message))
    match_count = [int]$visible.match_count
  } | Out-Null

  $replyPolls = if ($script:Input.PSObject.Properties['reply_polls']) { [int]$script:Input.reply_polls } else { 600 }
  $stableRequired = if ($script:Input.PSObject.Properties['stable_polls']) { [int]$script:Input.stable_polls } else { 3 }
  $lastHash = $null
  $stableCount = 0
  $replyRaw = $null
  for ($attempt = 1; $attempt -le $replyPolls; $attempt += 1) {
    Start-Sleep -Seconds 1
    $page = Resolve-ExactPage -ExpectedContextId ([string]$script:Input.context_id) -ExpectedPageId $boundPageId -ContextUrl ([string]$script:Input.context_url)
    $boundPageId = [string]$page.page_id
    $candidate = Find-ReplyRaw -Root $page.root -Elements $page.all -ExpectedMarker ([string]$script:Input.expected_reply_contains) -UserMarker ([string]$script:Input.message_marker)
    $stopVisible = Test-StopVisible -Elements $page.all
    if ($candidate -and -not $stopVisible) {
      $digest = Get-Sha256Text -Text $candidate
      if ($digest -eq $lastHash) { $stableCount += 1 } else { $lastHash = $digest; $stableCount = 1 }
      if ($stableCount -ge $stableRequired) { $replyRaw = $candidate; break }
    } else {
      $stableCount = 0
      $lastHash = $null
    }
  }
  if (-not $replyRaw) { throw 'NEW_COMPLETED_ASSISTANT_REPLY_NOT_FOUND' }

  Add-LoopEvent -Type 'REPLY_COLLECTED' -Data @{
    assistant_reply_sha256 = (Get-Sha256Text -Text $replyRaw)
    completion_stable_polls = $stableCount
  } | Out-Null
  Add-LoopEvent -Type 'RESULT_RETURN_READY' -Data @{ return_target = 'D-1_OR_SUCCESSOR' } | Out-Null

  Emit-Result -Result ([ordered]@{
    schema_version = 'D3_CONTEXT_MESSAGE_RESULT_RETURN_LIVE_V1'
    terminal = 'MESSAGE_DISPATCH_AND_RESULT_RETURN_LIVE_PASS'
    cycle_id = [string]$script:Input.cycle_id
    command_id = [string]$script:Input.command_id
    context_id = [string]$script:Input.context_id
    context_name = [string]$script:Input.context_name
    page_id = [string]$page.page_id
    d2_observed_page_id = [string]$script:Input.page_id
    page_rebound = [bool]$page.page_rebound
    return_target = 'D-1_OR_SUCCESSOR'
    message_sha256 = (Get-Sha256Text -Text ([string]$script:Input.message))
    assistant_reply_raw = $replyRaw
    assistant_reply_sha256 = (Get-Sha256Text -Text $replyRaw)
    assistant_reply_completed = $true
    target_pc = 'NOTEX'
    context_binding = 'D2_LIVE_EXACT_CONTEXT_AND_PAGE_REUSED'
  })
  exit 0
} catch {
  $code = [string]$_.Exception.Message
  Add-LoopEvent -Type 'DISPATCH_RESULT_RETURN_FAILED' -Data @{ error_code = $code } | Out-Null
  $cycleId = if ($script:Input -and $script:Input.PSObject.Properties['cycle_id']) { [string]$script:Input.cycle_id } else { $null }
  $commandId = if ($script:Input -and $script:Input.PSObject.Properties['command_id']) { [string]$script:Input.command_id } else { $null }
  $contextId = if ($script:Input -and $script:Input.PSObject.Properties['context_id']) { [string]$script:Input.context_id } else { $null }
  $pageId = if ($script:Input -and $script:Input.PSObject.Properties['page_id']) { [string]$script:Input.page_id } else { $null }
  Emit-Result -Result ([ordered]@{
    schema_version = 'D3_CONTEXT_MESSAGE_RESULT_RETURN_LIVE_V1'
    terminal = 'MESSAGE_DISPATCH_AND_RESULT_RETURN_LIVE_BLOCKED'
    cycle_id = $cycleId
    command_id = $commandId
    context_id = $contextId
    page_id = $pageId
    return_target = 'D-1_OR_SUCCESSOR'
    blocker_code = $code
    target_pc = 'NOTEX'
    target_pc_live_pass_claimed = $false
  })
  exit 0
}
