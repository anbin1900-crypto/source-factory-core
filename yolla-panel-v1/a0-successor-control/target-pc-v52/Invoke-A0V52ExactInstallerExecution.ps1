[CmdletBinding()]
param(
    [string]$InstallerPath = 'E:\SOURCE FACTORY\incoming\INSTALL_YOLLA_WORKSPACE_V52_SESSION_ANALYZER.bat',
    [string]$ExpectedInstallerSha256 = '96731d281a138048d96d8f2a99900805d2ee15711666a2f3f4d33d994ac8d544',
    [string]$SourceFactoryRoot = 'E:\SOURCE FACTORY',
    [string]$StableV5Launcher = 'E:\SOURCE FACTORY\RUN_YOLLA_WORKSPACE_V5.bat',
    [string]$FixedBrowserProfile = 'E:\SOURCE FACTORY\.yolla\yolla-workspace-browser-profile',
    [string]$V5State = 'E:\SOURCE FACTORY\.yolla\yolla-workspace-v5\workspace_state.json',
    [string]$V51State = 'E:\SOURCE FACTORY\.yolla\yolla-workspace-v5-1\workspace_state.json',
    [string]$V51Cycles = 'E:\SOURCE FACTORY\.yolla\yolla-workspace-v5-1\cycles',
    [string]$V52Root = 'E:\SOURCE FACTORY\.yolla\yolla-workspace-v5-2',
    [string]$OperatorObservationPath = 'E:\SOURCE FACTORY\.yolla\yolla-workspace-v5-2\acceptance\A0_V52_OPERATOR_OBSERVATION_V1.json',
    [int]$TimeoutSeconds = 900
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

function Fail([string]$Code, [string]$Message) {
    throw ($Code + ':' + $Message)
}

function Get-UtcStamp {
    return [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')
}

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Ensure-Directory([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Write-JsonAtomic([string]$Path, $Value) {
    Ensure-Directory (Split-Path -Parent $Path)
    $temporary = $Path + '.tmp-' + $PID
    $Value | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $temporary -Encoding UTF8
    Move-Item -LiteralPath $temporary -Destination $Path -Force
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
        $sum = ($files | Measure-Object -Property Length -Sum).Sum
        $record.total_bytes = if ($null -eq $sum) { [int64]0 } else { [int64]$sum }
        $record.last_write_time_utc = $item.LastWriteTimeUtc.ToString('o')
    }
    return $record
}

function Copy-StateIfPresent([string]$Path, [string]$BackupRoot, [string]$Name) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return [ordered]@{ name = $Name; source = $Path; copied = $false; destination = $null; sha256 = $null }
    }
    $destination = Join-Path $BackupRoot $Name
    if (Test-Path -LiteralPath $destination) {
        Fail 'A0V52X001_BACKUP_DESTINATION_EXISTS' $destination
    }
    Copy-Item -LiteralPath $Path -Destination $destination
    return [ordered]@{
        name = $Name
        source = $Path
        copied = $true
        destination = $destination
        sha256 = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
    }
}

function Read-JsonReceipt([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return [ordered]@{ path = $Path; exists = $false; json_parse = $false; content = $null; error = 'FILE_MISSING' }
    }
    try {
        $content = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
        return [ordered]@{ path = $Path; exists = $true; json_parse = $true; content = $content; error = $null }
    } catch {
        return [ordered]@{ path = $Path; exists = $true; json_parse = $false; content = $null; error = $_.Exception.Message }
    }
}

function Read-OperatorObservation([string]$Path) {
    $result = [ordered]@{
        path = $Path
        provided = $false
        valid = $false
        checks = [ordered]@{}
        evidence_paths = @()
        error = $null
    }
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        $result.error = 'OPERATOR_OBSERVATION_NOT_PROVIDED'
        return $result
    }
    $result.provided = $true
    try {
        $payload = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    } catch {
        $result.error = 'OPERATOR_OBSERVATION_JSON_INVALID'
        return $result
    }
    $allPass = $true
    foreach ($name in $RequiredUiChecks) {
        $value = $false
        if ($null -ne $payload.checks -and $null -ne $payload.checks.PSObject.Properties[$name]) {
            $value = [bool]$payload.checks.$name
        }
        $result.checks[$name] = $value
        if (-not $value) { $allPass = $false }
    }
    if ($null -ne $payload.evidence_paths) {
        $result.evidence_paths = @($payload.evidence_paths | ForEach-Object { [string]$_ })
    }
    if ($result.evidence_paths.Count -eq 0) { $allPass = $false }
    $result.valid = $allPass
    if (-not $allPass) { $result.error = 'OPERATOR_OBSERVATION_INCOMPLETE' }
    return $result
}

if ($PSVersionTable.PSEdition -ne 'Desktop' -or $PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1) {
    Fail 'A0V52X002_WINDOWS_POWERSHELL_51_REQUIRED' ([string]$PSVersionTable.PSVersion)
}
if (-not (Test-IsAdministrator)) {
    Fail 'A0V52X003_ADMINISTRATOR_REQUIRED' 'Run from elevated Windows PowerShell 5.1.'
}
if ($TimeoutSeconds -lt 60 -or $TimeoutSeconds -gt 3600) {
    Fail 'A0V52X004_TIMEOUT_OUT_OF_RANGE' ([string]$TimeoutSeconds)
}
if (-not (Test-Path -LiteralPath $InstallerPath -PathType Leaf)) {
    Fail 'A0V52X005_INSTALLER_MISSING' $InstallerPath
}
if (-not (Test-Path -LiteralPath $SourceFactoryRoot -PathType Container)) {
    Fail 'A0V52X006_SOURCE_FACTORY_ROOT_MISSING' $SourceFactoryRoot
}
if (-not (Test-Path -LiteralPath $StableV5Launcher -PathType Leaf)) {
    Fail 'A0V52X007_STABLE_V5_LAUNCHER_MISSING' $StableV5Launcher
}
if (-not (Test-Path -LiteralPath $FixedBrowserProfile -PathType Container)) {
    Fail 'A0V52X008_FIXED_BROWSER_PROFILE_MISSING' $FixedBrowserProfile
}

$actualInstallerSha256 = (Get-FileHash -LiteralPath $InstallerPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualInstallerSha256 -ne $ExpectedInstallerSha256.ToLowerInvariant()) {
    Fail 'A0V52X009_INSTALLER_SHA256_MISMATCH' ('expected=' + $ExpectedInstallerSha256 + ' actual=' + $actualInstallerSha256)
}

$runId = 'A0V52X-' + (Get-UtcStamp)
$acceptanceRoot = Join-Path $V52Root 'acceptance'
$runRoot = Join-Path $acceptanceRoot $runId
$backupRoot = Join-Path $runRoot 'backup'
Ensure-Directory $backupRoot

$before = [ordered]@{
    installer = Get-FileRecord $InstallerPath
    stable_v5_launcher = Get-FileRecord $StableV5Launcher
    fixed_browser_profile = Get-DirectoryRecord $FixedBrowserProfile
    v5_state = Get-FileRecord $V5State
    v51_state = Get-FileRecord $V51State
    v51_cycles = Get-DirectoryRecord $V51Cycles
}

$backups = @(
    Copy-StateIfPresent $V5State $backupRoot 'v5_workspace_state.json'
    Copy-StateIfPresent $V51State $backupRoot 'v51_workspace_state.json'
)

$stdoutPath = Join-Path $runRoot 'installer.stdout.log'
$stderrPath = Join-Path $runRoot 'installer.stderr.log'
$commandLine = '"' + $InstallerPath + '" <nul'
$process = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/d', '/s', '/c', $commandLine) -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
$completed = $process.WaitForExit($TimeoutSeconds * 1000)
if (-not $completed) {
    try { $process.Kill() } catch { }
    Fail 'A0V52X010_INSTALLER_TIMEOUT' ([string]$TimeoutSeconds)
}
$installerExitCode = [int]$process.ExitCode

$installLogPath = Join-Path $V52Root 'install.log'
$sessionReceiptPath = Join-Path $V52Root 'SESSION_PROFILE_MIGRATION_RECEIPT.json'
$smokeReceiptPath = Join-Path $V52Root 'LATEST_SMOKE_TEST.json'
$v52LauncherPath = Join-Path $SourceFactoryRoot 'RUN_YOLLA_WORKSPACE_V5_2.bat'

$after = [ordered]@{
    stable_v5_launcher = Get-FileRecord $StableV5Launcher
    fixed_browser_profile = Get-DirectoryRecord $FixedBrowserProfile
    v5_state = Get-FileRecord $V5State
    v51_state = Get-FileRecord $V51State
    v51_cycles = Get-DirectoryRecord $V51Cycles
    v52_launcher = Get-FileRecord $v52LauncherPath
    install_log = Get-FileRecord $installLogPath
    session_receipt = Read-JsonReceipt $sessionReceiptPath
    smoke_receipt = Read-JsonReceipt $smokeReceiptPath
}

$preservation = [ordered]@{
    stable_v5_launcher_unchanged = ($before.stable_v5_launcher.sha256 -eq $after.stable_v5_launcher.sha256)
    fixed_browser_profile_preserved = ($before.fixed_browser_profile.exists -and $after.fixed_browser_profile.exists)
    v5_state_unchanged = (-not $before.v5_state.exists) -or ($after.v5_state.exists -and $before.v5_state.sha256 -eq $after.v5_state.sha256)
    v51_state_unchanged = (-not $before.v51_state.exists) -or ($after.v51_state.exists -and $before.v51_state.sha256 -eq $after.v51_state.sha256)
    v51_cycles_preserved = (-not $before.v51_cycles.exists) -or $after.v51_cycles.exists
}

$rollback = [ordered]@{
    required = $false
    performed = $false
    restored_files = @()
    fallback_launcher_preserved = $after.stable_v5_launcher.exists
}

$preservationPass = ($preservation.stable_v5_launcher_unchanged -and $preservation.fixed_browser_profile_preserved -and $preservation.v5_state_unchanged -and $preservation.v51_state_unchanged -and $preservation.v51_cycles_preserved)
if (-not $preservationPass) {
    $rollback.required = $true
    foreach ($backup in $backups) {
        if ($backup.copied -and (Test-Path -LiteralPath $backup.destination -PathType Leaf)) {
            Copy-Item -LiteralPath $backup.destination -Destination $backup.source -Force
            $rollback.restored_files += $backup.source
        }
    }
    $rollback.performed = $true
}

$automatedPass = (
    $installerExitCode -eq 0 -and
    $actualInstallerSha256 -eq $ExpectedInstallerSha256.ToLowerInvariant() -and
    $after.v52_launcher.exists -and
    $after.install_log.exists -and
    $after.session_receipt.exists -and $after.session_receipt.json_parse -and
    $after.smoke_receipt.exists -and $after.smoke_receipt.json_parse -and
    $preservationPass
)

$operator = Read-OperatorObservation $OperatorObservationPath
$status = 'BLOCKED'
$terminal = 'V52_TARGET_PC_ACCEPTANCE_BLOCKED'
if ($automatedPass -and $operator.valid) {
    $status = 'PASS'
    $terminal = 'V52_TARGET_PC_SESSION_AND_DUAL_BROWSER_PASS'
} elseif ($automatedPass) {
    $status = 'PARTIAL_PASS'
    $terminal = 'V52_TARGET_PC_INSTALL_AND_RECEIPT_PASS_WAITING_UI_SESSION_EVIDENCE'
}

$receipt = [ordered]@{
    schema_version = 'A0_V52_EXACT_INSTALLER_EXECUTION_RECEIPT_V1'
    report_type = 'TEST'
    directive_id = $DirectiveId
    cycle_id = $CycleId
    run_id = $runId
    status = $status
    terminal = $terminal
    installer_path = $InstallerPath
    installer_sha256 = $actualInstallerSha256
    expected_installer_sha256 = $ExpectedInstallerSha256.ToLowerInvariant()
    installer_exit_code = $installerExitCode
    stdout_path = $stdoutPath
    stderr_path = $stderrPath
    before = $before
    backups = $backups
    after = $after
    preservation = $preservation
    rollback = $rollback
    automated_checks_pass = $automatedPass
    operator_or_runtime_evidence = $operator
    target_pc_pass_claimed = ($status -eq 'PASS')
    blockers = @(
        if ($installerExitCode -ne 0) { 'INSTALLER_EXIT_NONZERO' }
        if (-not $after.v52_launcher.exists) { 'V52_LAUNCHER_NOT_INSTALLED' }
        if (-not $after.install_log.exists) { 'INSTALL_LOG_MISSING' }
        if (-not $after.session_receipt.exists -or -not $after.session_receipt.json_parse) { 'SESSION_RECEIPT_MISSING_OR_INVALID' }
        if (-not $after.smoke_receipt.exists -or -not $after.smoke_receipt.json_parse) { 'SMOKE_RECEIPT_MISSING_OR_INVALID' }
        if (-not $preservationPass) { 'PRESERVATION_CHECK_FAILED_ROLLBACK_PERFORMED' }
        if ($automatedPass -and -not $operator.valid) { 'TARGET_PC_UI_SESSION_EVIDENCE_REQUIRED' }
    )
    forbidden_counters = [ordered]@{
        browser_profile_deleted = 0
        workspace_state_reset = 0
        stable_v5_deleted = 0
        cycle_ledger_deleted = 0
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

$receiptPath = Join-Path $runRoot 'A0_V52_EXACT_INSTALLER_EXECUTION_RECEIPT_V1.json'
Write-JsonAtomic $receiptPath $receipt
Write-Output ('A0_V52_EXACT_INSTALLER_RECEIPT=' + $receiptPath)
Write-Output ('A0_V52_STATUS=' + $status)
Write-Output ('A0_V52_TERMINAL=' + $terminal)
if ($status -eq 'PASS') { exit 0 }
if ($status -eq 'PARTIAL_PASS') { exit 2 }
exit 3
