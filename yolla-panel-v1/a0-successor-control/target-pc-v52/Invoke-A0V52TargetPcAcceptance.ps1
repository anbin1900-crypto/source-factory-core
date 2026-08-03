[CmdletBinding()]
param(
    [string]$SourceFactoryRoot = 'E:\SOURCE FACTORY',
    [string]$StableV5Launcher = 'E:\SOURCE FACTORY\RUN_YOLLA_WORKSPACE_V5.bat',
    [string]$V52Launcher = 'E:\SOURCE FACTORY\RUN_YOLLA_WORKSPACE_V5_2.bat',
    [string]$FixedBrowserProfile = 'E:\SOURCE FACTORY\.yolla\yolla-workspace-browser-profile',
    [string]$V5State = 'E:\SOURCE FACTORY\.yolla\yolla-workspace-v5\workspace_state.json',
    [string]$V51State = 'E:\SOURCE FACTORY\.yolla\yolla-workspace-v5-1\workspace_state.json',
    [string]$V51Cycles = 'E:\SOURCE FACTORY\.yolla\yolla-workspace-v5-1\cycles',
    [string]$V52State = 'E:\SOURCE FACTORY\.yolla\yolla-workspace-v5-2\workspace_state.json',
    [string]$V52AnalysisRuns = 'E:\SOURCE FACTORY\.yolla\yolla-workspace-v5-2\analysis_runs',
    [string]$ReceiptRoot = 'E:\SOURCE FACTORY\.yolla\yolla-workspace-v5-2\acceptance',
    [string]$OperatorObservationPath = '',
    [switch]$PreflightOnly,
    [switch]$SkipLaunch,
    [int]$LaunchObservationSeconds = 20
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$DirectiveId = 'A0-P0-V52-TARGET-PC-ACCEPTANCE'
$CycleId = 'A0-V52-TARGET-PC-ACCEPTANCE-20260803-001'
$RequiredUiChecks = @(
    'chatgpt_login_preserved_after_update',
    'chatgpt_login_preserved_after_app_restart',
    'worker_address_bar_only_visible_on_worker_tab',
    'analyzer_address_bar_only_visible_on_analyzer_tab',
    'site_navigation_does_not_change_chatgpt_context',
    '50_seats_and_7_groups_preserved',
    'project_and_context_bindings_preserved'
)

function Get-UtcStamp {
    return [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')
}

function Get-FileRecord([string]$Path) {
    $exists = Test-Path -LiteralPath $Path -PathType Leaf
    $record = [ordered]@{
        path = $Path
        exists = $exists
        size_bytes = $null
        sha256 = $null
        last_write_time_utc = $null
    }
    if ($exists) {
        $item = Get-Item -LiteralPath $Path
        $record.size_bytes = [int64]$item.Length
        $record.sha256 = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
        $record.last_write_time_utc = $item.LastWriteTimeUtc.ToString('o')
    }
    return $record
}

function Get-DirectoryRecord([string]$Path) {
    $exists = Test-Path -LiteralPath $Path -PathType Container
    $record = [ordered]@{
        path = $Path
        exists = $exists
        file_count = $null
        total_bytes = $null
        last_write_time_utc = $null
    }
    if ($exists) {
        $item = Get-Item -LiteralPath $Path
        $files = @(Get-ChildItem -LiteralPath $Path -File -Recurse -Force -ErrorAction SilentlyContinue)
        $record.file_count = $files.Count
        $record.total_bytes = [int64](($files | Measure-Object -Property Length -Sum).Sum)
        $record.last_write_time_utc = $item.LastWriteTimeUtc.ToString('o')
    }
    return $record
}

function Write-JsonAtomic([string]$Path, $Value) {
    $parent = Split-Path -Parent $Path
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
    $temporary = "$Path.tmp-$PID"
    $Value | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $temporary -Encoding UTF8
    Move-Item -LiteralPath $temporary -Destination $Path -Force
}

function Copy-StateIfPresent([string]$Path, [string]$BackupRoot) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return [ordered]@{ source = $Path; copied = $false; destination = $null; sha256 = $null }
    }
    $leaf = Split-Path -Leaf $Path
    $destination = Join-Path $BackupRoot $leaf
    if (Test-Path -LiteralPath $destination) {
        throw "A0V52001_BACKUP_DESTINATION_EXISTS:$destination"
    }
    Copy-Item -LiteralPath $Path -Destination $destination
    return [ordered]@{
        source = $Path
        copied = $true
        destination = $destination
        sha256 = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
    }
}

function Read-OperatorObservation([string]$Path) {
    if ([string]::IsNullOrWhiteSpace($Path)) {
        return [ordered]@{ provided = $false; valid = $false; checks = @{}; evidence_paths = @(); error = 'OPERATOR_OBSERVATION_NOT_PROVIDED' }
    }
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return [ordered]@{ provided = $true; valid = $false; checks = @{}; evidence_paths = @(); error = 'OPERATOR_OBSERVATION_FILE_MISSING' }
    }
    try {
        $payload = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    } catch {
        return [ordered]@{ provided = $true; valid = $false; checks = @{}; evidence_paths = @(); error = 'OPERATOR_OBSERVATION_JSON_INVALID' }
    }
    $checks = [ordered]@{}
    $allPass = $true
    foreach ($name in $RequiredUiChecks) {
        $value = $false
        if ($null -ne $payload.checks -and $null -ne $payload.checks.PSObject.Properties[$name]) {
            $value = [bool]$payload.checks.$name
        }
        $checks[$name] = $value
        if (-not $value) { $allPass = $false }
    }
    $evidence = @()
    if ($null -ne $payload.evidence_paths) { $evidence = @($payload.evidence_paths | ForEach-Object { [string]$_ }) }
    if ($evidence.Count -eq 0) { $allPass = $false }
    return [ordered]@{
        provided = $true
        valid = $allPass
        checks = $checks
        evidence_paths = $evidence
        observed_at = if ($null -ne $payload.observed_at) { [string]$payload.observed_at } else { $null }
        error = if ($allPass) { $null } else { 'OPERATOR_OBSERVATION_INCOMPLETE' }
    }
}

$runId = 'A0V52-' + (Get-UtcStamp)
$runRoot = Join-Path $ReceiptRoot $runId
$backupRoot = Join-Path $runRoot 'backup'
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null

$before = [ordered]@{
    source_factory_root = Get-DirectoryRecord $SourceFactoryRoot
    stable_v5_launcher = Get-FileRecord $StableV5Launcher
    v52_launcher = Get-FileRecord $V52Launcher
    fixed_browser_profile = Get-DirectoryRecord $FixedBrowserProfile
    v5_state = Get-FileRecord $V5State
    v51_state = Get-FileRecord $V51State
    v51_cycles = Get-DirectoryRecord $V51Cycles
    v52_state = Get-FileRecord $V52State
    v52_analysis_runs = Get-DirectoryRecord $V52AnalysisRuns
}

$backups = @(
    Copy-StateIfPresent $V5State $backupRoot
    Copy-StateIfPresent $V51State $backupRoot
    Copy-StateIfPresent $V52State $backupRoot
)

$launch = [ordered]@{
    requested = (-not $PreflightOnly -and -not $SkipLaunch)
    attempted = $false
    launcher_exit_code = $null
    yolla_window_observed = $false
    observed_window_titles = @()
    error = $null
}

if ($launch.requested) {
    if (-not $before.v52_launcher.exists) {
        $launch.error = 'V52_LAUNCHER_MISSING'
    } else {
        try {
            $launch.attempted = $true
            $process = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/d', '/c', ('"' + $V52Launcher + '"')) -PassThru -Wait
            $launch.launcher_exit_code = [int]$process.ExitCode
            if ($LaunchObservationSeconds -gt 0) { Start-Sleep -Seconds $LaunchObservationSeconds }
            $windows = @(Get-Process | Where-Object { -not [string]::IsNullOrWhiteSpace($_.MainWindowTitle) -and $_.MainWindowTitle -match 'YOLLA' })
            $launch.observed_window_titles = @($windows | ForEach-Object { $_.MainWindowTitle })
            $launch.yolla_window_observed = $launch.observed_window_titles.Count -gt 0
        } catch {
            $launch.error = $_.Exception.Message
        }
    }
}

$after = [ordered]@{
    stable_v5_launcher = Get-FileRecord $StableV5Launcher
    fixed_browser_profile = Get-DirectoryRecord $FixedBrowserProfile
    v5_state = Get-FileRecord $V5State
    v51_state = Get-FileRecord $V51State
    v51_cycles = Get-DirectoryRecord $V51Cycles
    v52_state = Get-FileRecord $V52State
    v52_analysis_runs = Get-DirectoryRecord $V52AnalysisRuns
}

$statePreservation = [ordered]@{
    stable_v5_launcher_unchanged = ($before.stable_v5_launcher.exists -and $after.stable_v5_launcher.exists -and $before.stable_v5_launcher.sha256 -eq $after.stable_v5_launcher.sha256)
    fixed_browser_profile_preserved = ($before.fixed_browser_profile.exists -and $after.fixed_browser_profile.exists)
    v5_state_unchanged = (-not $before.v5_state.exists) -or ($after.v5_state.exists -and $before.v5_state.sha256 -eq $after.v5_state.sha256)
    v51_state_unchanged = (-not $before.v51_state.exists) -or ($after.v51_state.exists -and $before.v51_state.sha256 -eq $after.v51_state.sha256)
    v51_cycles_preserved = (-not $before.v51_cycles.exists) -or $after.v51_cycles.exists
}

$operator = Read-OperatorObservation $OperatorObservationPath
$automatedPass = (
    $before.source_factory_root.exists -and
    $before.stable_v5_launcher.exists -and
    $before.v52_launcher.exists -and
    $before.fixed_browser_profile.exists -and
    $statePreservation.stable_v5_launcher_unchanged -and
    $statePreservation.fixed_browser_profile_preserved -and
    $statePreservation.v5_state_unchanged -and
    $statePreservation.v51_state_unchanged -and
    $statePreservation.v51_cycles_preserved -and
    (($PreflightOnly -or $SkipLaunch) -or ($launch.attempted -and $launch.launcher_exit_code -eq 0))
)

$status = 'BLOCKED'
$terminal = 'V52_TARGET_PC_ACCEPTANCE_BLOCKED'
if ($automatedPass -and $operator.valid) {
    $status = 'PASS'
    $terminal = 'V52_TARGET_PC_SESSION_AND_DUAL_BROWSER_PASS'
} elseif ($automatedPass) {
    $status = 'PARTIAL_PASS'
    $terminal = 'V52_TARGET_PC_AUTOMATED_PREFLIGHT_PASS_WAITING_UI_EVIDENCE'
}

$receipt = [ordered]@{
    schema_version = 'A0_V52_TARGET_PC_ACCEPTANCE_RECEIPT_V1'
    report_type = 'TEST'
    directive_id = $DirectiveId
    cycle_id = $CycleId
    run_id = $runId
    status = $status
    terminal = $terminal
    preflight_only = [bool]$PreflightOnly
    skip_launch = [bool]$SkipLaunch
    before = $before
    backups = $backups
    launch = $launch
    after = $after
    state_preservation = $statePreservation
    automated_checks_pass = $automatedPass
    operator_or_runtime_evidence = $operator
    target_pc_pass_claimed = ($status -eq 'PASS')
    blockers = @(
        if (-not $before.v52_launcher.exists) { 'V52_LAUNCHER_MISSING' }
        if (-not $before.fixed_browser_profile.exists) { 'FIXED_BROWSER_PROFILE_MISSING' }
        if ($automatedPass -and -not $operator.valid) { 'TARGET_PC_UI_SESSION_EVIDENCE_REQUIRED' }
        if (-not $automatedPass) { 'AUTOMATED_PREFLIGHT_NOT_PASS' }
    )
    forbidden_counters = [ordered]@{
        browser_profile_deleted = 0
        workspace_state_reset = 0
        stable_v5_deleted = 0
        legacy_v3_hotfix_reused = 0
        target_pc_pass_claimed_without_evidence = 0
        production_connection = 0
        ready_transition = 0
        merge = 0
    }
    production = $false
    ready = $false
    merge = $false
    completed_at = [DateTime]::UtcNow.ToString('o')
}

$receiptPath = Join-Path $runRoot 'A0_V52_TARGET_PC_ACCEPTANCE_RECEIPT_V1.json'
Write-JsonAtomic $receiptPath $receipt
Write-Output ('A0_V52_RECEIPT=' + $receiptPath)
Write-Output ('A0_V52_STATUS=' + $status)
Write-Output ('A0_V52_TERMINAL=' + $terminal)
if ($status -eq 'PASS') { exit 0 }
if ($status -eq 'PARTIAL_PASS') { exit 2 }
exit 3
