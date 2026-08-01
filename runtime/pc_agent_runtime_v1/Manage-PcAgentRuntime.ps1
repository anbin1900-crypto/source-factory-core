[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('start','stop','restart','status','validate','logs','uninstall')]
    [string]$Command,
    [string]$InstallRoot = 'E:\YOLLA\agent\runtime\pc-agent-v1',
    [string]$TaskName = 'YOLLA-PC-Agent-Runtime-V1',
    [switch]$PurgeState,
    [switch]$PurgeBridge
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Fail([string]$Code, [string]$Message) {
    throw ('{0}:{1}' -f $Code, $Message)
}

function Read-Json([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
    return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
}

function Get-OptionalProperty(
    [object]$Object,
    [string[]]$Names,
    [object]$Default = $null
) {
    if ($null -eq $Object) { return $Default }
    foreach ($name in $Names) {
        $property = $Object.PSObject.Properties[$name]
        if ($null -ne $property) { return $property.Value }
    }
    return $Default
}

function Write-JsonNoBom([string]$Path, [object]$Value) {
    $parent = Split-Path -Parent $Path
    if ($parent) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 100), $utf8)
}

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Fail 'PCRM001_ADMINISTRATOR_REQUIRED' 'Run elevated Windows PowerShell 5.1.'
    }
}

function Load-Authority([string]$Root) {
    $currentPath = Join-Path $Root 'current.json'
    $current = Read-Json $currentPath
    if ($null -eq $current) { Fail 'PCRM002_CURRENT_POINTER_MISSING' $currentPath }
    $config = Read-Json ([string]$current.config_path)
    if ($null -eq $config) { Fail 'PCRM003_RUNTIME_CONFIG_MISSING' ([string]$current.config_path) }
    return [pscustomobject][ordered]@{
        current_path = $currentPath
        current = $current
        config = $config
        config_path = [string]$current.config_path
        state_root = [string]$config.state_root
        bridge_root = [string]$config.bridge_root
        python_exe = [string]$config.python_exe
        supervisor_path = [string]$config.supervisor_path
        worker_path = [string]$config.worker_path
    }
}

function Find-RuntimeProcesses([object]$Authority) {
    $supervisorNeedle = ([string]$Authority.supervisor_path).ToLowerInvariant()
    $workerNeedle = ([string]$Authority.worker_path).ToLowerInvariant()
    $processes = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
    $supervisors = @($processes | Where-Object {
        $_.CommandLine -and $_.CommandLine.ToLowerInvariant().Contains($supervisorNeedle)
    })
    $workers = @($processes | Where-Object {
        $_.CommandLine -and $_.CommandLine.ToLowerInvariant().Contains($workerNeedle)
    })
    return [pscustomobject][ordered]@{
        supervisors = $supervisors
        workers = $workers
    }
}

function Get-HeartbeatAge([string]$Path) {
    $value = Read-Json $Path
    if ($null -eq $value) { return $null }
    $text = [string](Get-OptionalProperty $value @('timestamp','updated_at') $null)
    if (-not $text) { return $null }
    try {
        $timestamp = [DateTimeOffset]::Parse($text)
        return [math]::Round(([DateTimeOffset]::UtcNow - $timestamp.ToUniversalTime()).TotalSeconds, 3)
    } catch {
        return $null
    }
}

function Get-QueueCount([string]$Root, [string]$Name) {
    $path = Join-Path $Root $Name
    if (-not (Test-Path -LiteralPath $path -PathType Container)) { return 0 }
    return @(Get-ChildItem -LiteralPath $path -Filter '*.json' -File -ErrorAction SilentlyContinue).Count
}

function Get-RuntimeStatus([object]$Authority) {
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    $taskInfo = if ($task) { Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction SilentlyContinue } else { $null }
    $processes = Find-RuntimeProcesses $Authority
    $stateRoot = [string]$Authority.state_root
    $bridgeRoot = [string]$Authority.bridge_root
    $runtimeStatus = Read-Json (Join-Path $stateRoot 'runtime\status.json')
    return [ordered]@{
        schema_version = 'YOLLA_PC_AGENT_WINDOWS_RUNTIME_MANAGEMENT_STATUS_V1'
        runtime_id = 'YOLLA-PC-AGENT-RUNTIME-V1'
        version = [string]$Authority.current.version
        task_name = $TaskName
        task_registered = ($null -ne $task)
        task_state = if ($task) { [string]$task.State } else { 'NOT_REGISTERED' }
        task_last_run_time = if ($taskInfo) { $taskInfo.LastRunTime.ToUniversalTime().ToString('o') } else { $null }
        task_last_result = if ($taskInfo) { $taskInfo.LastTaskResult } else { $null }
        supervisor_process_count = $processes.supervisors.Count
        supervisor_pids = @($processes.supervisors | ForEach-Object { [int]$_.ProcessId })
        worker_process_count = $processes.workers.Count
        worker_pids = @($processes.workers | ForEach-Object { [int]$_.ProcessId })
        supervisor_heartbeat_age_seconds = Get-HeartbeatAge (Join-Path $stateRoot 'runtime\supervisor-heartbeat.json')
        worker_heartbeat_age_seconds = Get-HeartbeatAge (Join-Path $bridgeRoot 'runtime\heartbeat.json')
        runtime_state = if ($runtimeStatus) {
            [string](Get-OptionalProperty $runtimeStatus @('state') 'UNKNOWN')
        } else { 'NOT_STARTED' }
        worker_restart_count = if ($runtimeStatus) {
            [int](Get-OptionalProperty $runtimeStatus @('worker_restart_count') 0)
        } else { 0 }
        queue = [ordered]@{
            requests = Get-QueueCount $bridgeRoot 'requests'
            processing = Get-QueueCount $bridgeRoot 'processing'
            results = Get-QueueCount $bridgeRoot 'results'
            failed = Get-QueueCount $bridgeRoot 'failed'
        }
        install_root = $InstallRoot
        state_root = $stateRoot
        bridge_root = $bridgeRoot
        production = $false
        ready = $false
        merge = $false
        observed_at = [DateTimeOffset]::UtcNow.ToString('o')
    }
}

function Wait-RuntimeRunning([object]$Authority, [int]$TimeoutSeconds = 40) {
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds($TimeoutSeconds)
    do {
        Start-Sleep -Milliseconds 500
        $status = Get-RuntimeStatus $Authority
        if (
            $status.supervisor_process_count -eq 1 -and
            $status.worker_process_count -eq 1 -and
            $null -ne $status.supervisor_heartbeat_age_seconds -and
            [double]$status.supervisor_heartbeat_age_seconds -lt 15 -and
            $null -ne $status.worker_heartbeat_age_seconds -and
            [double]$status.worker_heartbeat_age_seconds -lt 15
        ) { return $status }
    } while ([DateTimeOffset]::UtcNow -lt $deadline)
    Fail 'PCRM004_RUNTIME_START_TIMEOUT' (($status | ConvertTo-Json -Depth 20 -Compress))
}

function Stop-Runtime([object]$Authority, [int]$TimeoutSeconds = 40) {
    $control = Join-Path ([string]$Authority.state_root) 'control'
    New-Item -ItemType Directory -Path $control -Force | Out-Null
    [IO.File]::WriteAllText(
        (Join-Path $control 'stop.request'),
        ([DateTimeOffset]::UtcNow.ToString('o') + [Environment]::NewLine),
        (New-Object System.Text.UTF8Encoding($false))
    )
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds($TimeoutSeconds)
    do {
        Start-Sleep -Milliseconds 500
        $processes = Find-RuntimeProcesses $Authority
        if ($processes.supervisors.Count -eq 0 -and $processes.workers.Count -eq 0) {
            Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
            return
        }
    } while ([DateTimeOffset]::UtcNow -lt $deadline)
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    $processes = Find-RuntimeProcesses $Authority
    if ($processes.supervisors.Count -ne 0 -or $processes.workers.Count -ne 0) {
        Fail 'PCRM005_RUNTIME_STOP_TIMEOUT' ('supervisors={0} workers={1}' -f $processes.supervisors.Count,$processes.workers.Count)
    }
}

if ($PSVersionTable.PSEdition -ne 'Desktop' -or $PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1) {
    Fail 'PCRM006_WINDOWS_POWERSHELL_51_REQUIRED' ([string]$PSVersionTable.PSVersion)
}

if ($Command -eq 'status') {
    $authority = Load-Authority $InstallRoot
    Get-RuntimeStatus $authority | ConvertTo-Json -Depth 30
    exit 0
}

if ($Command -eq 'logs') {
    $authority = Load-Authority $InstallRoot
    [ordered]@{
        runtime_events = Join-Path ([string]$authority.state_root) 'logs\runtime-events.jsonl'
        worker_stdout = Join-Path ([string]$authority.state_root) 'logs\worker-stdout.log'
        worker_stderr = Join-Path ([string]$authority.state_root) 'logs\worker-stderr.log'
        status = Join-Path ([string]$authority.state_root) 'runtime\status.json'
        supervisor_heartbeat = Join-Path ([string]$authority.state_root) 'runtime\supervisor-heartbeat.json'
        worker_heartbeat = Join-Path ([string]$authority.bridge_root) 'runtime\heartbeat.json'
    } | ConvertTo-Json -Depth 10
    exit 0
}

Assert-Administrator
$authority = Load-Authority $InstallRoot

switch ($Command) {
    'start' {
        Remove-Item -LiteralPath (Join-Path ([string]$authority.state_root) 'control\stop.request') -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath (Join-Path ([string]$authority.bridge_root) 'control\stop.request') -Force -ErrorAction SilentlyContinue
        Start-ScheduledTask -TaskName $TaskName
        $status = Wait-RuntimeRunning $authority
        Write-Host 'PC_AGENT_RUNTIME_START=PASS'
        $status | ConvertTo-Json -Depth 30
    }
    'stop' {
        Stop-Runtime $authority
        $status = Get-RuntimeStatus $authority
        if ($status.supervisor_process_count -ne 0 -or $status.worker_process_count -ne 0) {
            Fail 'PCRM007_ORPHAN_PROCESS_PRESENT' (($status | ConvertTo-Json -Depth 20 -Compress))
        }
        Write-Host 'PC_AGENT_RUNTIME_STOP=PASS'
        $status | ConvertTo-Json -Depth 30
    }
    'restart' {
        Stop-Runtime $authority
        Remove-Item -LiteralPath (Join-Path ([string]$authority.state_root) 'control\stop.request') -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath (Join-Path ([string]$authority.bridge_root) 'control\stop.request') -Force -ErrorAction SilentlyContinue
        Start-ScheduledTask -TaskName $TaskName
        $status = Wait-RuntimeRunning $authority
        Write-Host 'PC_AGENT_RUNTIME_RESTART=PASS'
        $status | ConvertTo-Json -Depth 30
    }
    'validate' {
        foreach ($path in @($authority.python_exe,$authority.supervisor_path,$authority.worker_path,$authority.config_path)) {
            if (-not (Test-Path -LiteralPath ([string]$path) -PathType Leaf)) {
                Fail 'PCRM008_RUNTIME_FILE_MISSING' ([string]$path)
            }
        }
        $supervisorSha = (Get-FileHash -LiteralPath $authority.supervisor_path -Algorithm SHA256).Hash.ToLowerInvariant()
        $workerSha = (Get-FileHash -LiteralPath $authority.worker_path -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($supervisorSha -ne [string]$authority.current.supervisor_sha256) {
            Fail 'PCRM009_SUPERVISOR_SHA_MISMATCH' ('expected={0} actual={1}' -f $authority.current.supervisor_sha256,$supervisorSha)
        }
        if ($workerSha -ne [string]$authority.current.worker_sha256) {
            Fail 'PCRM010_WORKER_SHA_MISMATCH' ('expected={0} actual={1}' -f $authority.current.worker_sha256,$workerSha)
        }
        & $authority.python_exe -X utf8 $authority.supervisor_path --config $authority.config_path --validate-config
        if ($LASTEXITCODE -ne 0) { Fail 'PCRM011_CONFIG_VALIDATION_FAILED' ('exit=' + $LASTEXITCODE) }
        $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        if (-not $task) { Fail 'PCRM012_SCHEDULED_TASK_MISSING' $TaskName }
        Write-Host 'PC_AGENT_RUNTIME_VALIDATE=PASS'
        Get-RuntimeStatus $authority | ConvertTo-Json -Depth 30
    }
    'uninstall' {
        Stop-Runtime $authority
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
        $stateRoot = [string]$authority.state_root
        $bridgeRoot = [string]$authority.bridge_root
        Remove-Item -LiteralPath $InstallRoot -Recurse -Force -ErrorAction SilentlyContinue
        if ($PurgeState) { Remove-Item -LiteralPath $stateRoot -Recurse -Force -ErrorAction SilentlyContinue }
        if ($PurgeBridge) { Remove-Item -LiteralPath $bridgeRoot -Recurse -Force -ErrorAction SilentlyContinue }
        Write-Host 'PC_AGENT_RUNTIME_UNINSTALL=PASS'
        Write-Host ('PC_AGENT_RUNTIME_STATE_PRESERVED=' + (-not [bool]$PurgeState).ToString().ToLowerInvariant())
        Write-Host ('PC_AGENT_BRIDGE_PRESERVED=' + (-not [bool]$PurgeBridge).ToString().ToLowerInvariant())
    }
}

Write-Host 'PRODUCTION=false'
Write-Host 'READY=false'
Write-Host 'MERGE=false'
