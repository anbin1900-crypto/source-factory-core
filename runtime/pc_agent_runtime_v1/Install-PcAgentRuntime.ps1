[CmdletBinding()]
param(
    [string]$PackageRoot = $PSScriptRoot,
    [string]$InstallRoot = 'E:\YOLLA\agent\runtime\pc-agent-v1',
    [string]$StateRoot = 'E:\YOLLA\agent\state\pc-agent-runtime-v1',
    [string]$BridgeRoot = 'E:\YOLLA\agent\state\source-factory-bridge-v1',
    [string]$PythonExe = 'E:\YOLLA\tools\python-3.13.5-embed-amd64\python.exe',
    [string]$TaskName = 'YOLLA-PC-Agent-Runtime-V1',
    [string]$Version = '1.0.0-20260802',
    [switch]$StartNow
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Fail([string]$Code, [string]$Message) {
    throw ('{0}:{1}' -f $Code, $Message)
}

function Write-JsonNoBom([string]$Path, [object]$Value) {
    $parent = Split-Path -Parent $Path
    if ($parent) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 100), $utf8)
}

function Sha256([string]$Path) {
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Fail 'PCRI001_ADMINISTRATOR_REQUIRED' 'Run elevated Windows PowerShell 5.1.'
    }
}

function Stop-ExistingRuntime([string]$Root, [string]$Name) {
    $manager = Join-Path $Root 'Manage-PcAgentRuntime.ps1'
    if (Test-Path -LiteralPath $manager -PathType Leaf) {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $manager -Command stop -InstallRoot $Root
        if ($LASTEXITCODE -ne 0) { Fail 'PCRI002_EXISTING_RUNTIME_STOP_FAILED' ('exit=' + $LASTEXITCODE) }
        return
    }
    $task = Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue
    if ($task) {
        Stop-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue
    }
}

if ($PSVersionTable.PSEdition -ne 'Desktop' -or $PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1) {
    Fail 'PCRI003_WINDOWS_POWERSHELL_51_REQUIRED' ([string]$PSVersionTable.PSVersion)
}
Assert-Administrator

$PackageRoot = (Resolve-Path -LiteralPath $PackageRoot).Path
$requiredPackageFiles = @(
    'PC_AGENT_RUNTIME_CONTRACT_V1.json',
    'pc_agent_runtime_supervisor.py',
    'pc_agent_bridge_worker.py',
    'Manage-PcAgentRuntime.ps1',
    'validate_pc_agent_runtime.py',
    'PC_AGENT_RUNTIME_PACKAGE_MANIFEST.json'
)
foreach ($name in $requiredPackageFiles) {
    $path = Join-Path $PackageRoot $name
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        Fail 'PCRI004_PACKAGE_FILE_MISSING' $path
    }
}
if (-not (Test-Path -LiteralPath $PythonExe -PathType Leaf)) {
    Fail 'PCRI005_PYTHON_NOT_FOUND' $PythonExe
}

$manifestPath = Join-Path $PackageRoot 'PC_AGENT_RUNTIME_PACKAGE_MANIFEST.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.schema_version -ne 'YOLLA_PC_AGENT_WINDOWS_RUNTIME_PACKAGE_MANIFEST_V1') {
    Fail 'PCRI006_PACKAGE_MANIFEST_SCHEMA_INVALID' ([string]$manifest.schema_version)
}
if ($manifest.version -ne $Version) {
    Fail 'PCRI007_VERSION_MISMATCH' ('requested={0} manifest={1}' -f $Version,$manifest.version)
}
foreach ($file in $manifest.files) {
    $path = Join-Path $PackageRoot ([string]$file.path)
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        Fail 'PCRI008_MANIFEST_FILE_MISSING' $path
    }
    $observed = Sha256 $path
    if ($observed -ne [string]$file.sha256) {
        Fail 'PCRI009_MANIFEST_SHA_MISMATCH' ('path={0} expected={1} actual={2}' -f $path,$file.sha256,$observed)
    }
}

Stop-ExistingRuntime $InstallRoot $TaskName

$releaseParent = Join-Path $InstallRoot 'releases'
$releaseRoot = Join-Path $releaseParent $Version
$stagingRoot = Join-Path $releaseParent ('.staging-' + $Version + '-' + [guid]::NewGuid().ToString('N'))
$configRoot = Join-Path $InstallRoot 'config'
$configPath = Join-Path $configRoot 'runtime.json'
$currentPath = Join-Path $InstallRoot 'current.json'
$managerTarget = Join-Path $InstallRoot 'Manage-PcAgentRuntime.ps1'
$contractTarget = Join-Path $InstallRoot 'PC_AGENT_RUNTIME_CONTRACT_V1.json'
$receiptRoot = Join-Path $StateRoot 'receipts'
$previousPointer = $null
if (Test-Path -LiteralPath $currentPath -PathType Leaf) {
    $previousPointer = Get-Content -LiteralPath $currentPath -Raw | ConvertFrom-Json
}

New-Item -ItemType Directory -Path $releaseParent,$configRoot,$StateRoot,$BridgeRoot,$receiptRoot -Force | Out-Null
Remove-Item -LiteralPath $stagingRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $stagingRoot -Force | Out-Null

$installStatus = 'FAIL'
$installError = $null
try {
    foreach ($file in $manifest.files) {
        $source = Join-Path $PackageRoot ([string]$file.path)
        $destination = Join-Path $stagingRoot ([string]$file.path)
        $parent = Split-Path -Parent $destination
        if ($parent) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
        Copy-Item -LiteralPath $source -Destination $destination -Force
        if ((Sha256 $destination) -ne [string]$file.sha256) {
            Fail 'PCRI010_STAGED_SHA_MISMATCH' $destination
        }
    }

    & $PythonExe -X utf8 (Join-Path $stagingRoot 'validate_pc_agent_runtime.py') --package-root $stagingRoot
    if ($LASTEXITCODE -ne 0) { Fail 'PCRI011_RUNTIME_SOURCE_VALIDATION_FAILED' ('exit=' + $LASTEXITCODE) }

    Remove-Item -LiteralPath $releaseRoot -Recurse -Force -ErrorAction SilentlyContinue
    Move-Item -LiteralPath $stagingRoot -Destination $releaseRoot

    $runtimeConfig = [ordered]@{
        schema_version = 'YOLLA_PC_AGENT_WINDOWS_RUNTIME_CONFIG_V1'
        runtime_id = 'YOLLA-PC-AGENT-RUNTIME-V1'
        version = $Version
        install_root = $InstallRoot
        state_root = $StateRoot
        bridge_root = $BridgeRoot
        python_exe = $PythonExe
        supervisor_path = (Join-Path $releaseRoot 'pc_agent_runtime_supervisor.py')
        worker_path = (Join-Path $releaseRoot 'pc_agent_bridge_worker.py')
        worker_poll_seconds = 0.25
        supervisor_policy = [ordered]@{
            heartbeat_interval_seconds = 2
            worker_heartbeat_stale_seconds = 15
            worker_start_timeout_seconds = 30
            worker_stop_timeout_seconds = 20
            restart_backoff_seconds = @(1,2,5,10,30)
            restart_burst_window_seconds = 300
            restart_burst_limit = 20
        }
        production = $false
        ready = $false
        merge = $false
    }
    Write-JsonNoBom $configPath $runtimeConfig

    $currentPointer = [ordered]@{
        schema_version = 'YOLLA_PC_AGENT_WINDOWS_RUNTIME_CURRENT_POINTER_V1'
        runtime_id = 'YOLLA-PC-AGENT-RUNTIME-V1'
        version = $Version
        release_root = $releaseRoot
        config_path = $configPath
        worker_sha256 = Sha256 (Join-Path $releaseRoot 'pc_agent_bridge_worker.py')
        supervisor_sha256 = Sha256 (Join-Path $releaseRoot 'pc_agent_runtime_supervisor.py')
        updated_at = [DateTimeOffset]::UtcNow.ToString('o')
        production = $false
        ready = $false
        merge = $false
    }
    $currentTemp = $currentPath + '.tmp-' + [guid]::NewGuid().ToString('N')
    Write-JsonNoBom $currentTemp $currentPointer
    Move-Item -LiteralPath $currentTemp -Destination $currentPath -Force

    Copy-Item -LiteralPath (Join-Path $releaseRoot 'Manage-PcAgentRuntime.ps1') -Destination $managerTarget -Force
    Copy-Item -LiteralPath (Join-Path $releaseRoot 'PC_AGENT_RUNTIME_CONTRACT_V1.json') -Destination $contractTarget -Force

    $supervisorPath = Join-Path $releaseRoot 'pc_agent_runtime_supervisor.py'
    $argument = '-X utf8 "{0}" --config "{1}"' -f $supervisorPath,$configPath
    $action = New-ScheduledTaskAction -Execute $PythonExe -Argument $argument -WorkingDirectory $InstallRoot
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet `
        -StartWhenAvailable `
        -RestartCount 999 `
        -RestartInterval (New-TimeSpan -Minutes 1) `
        -ExecutionTimeLimit (New-TimeSpan -Days 3650) `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries
    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $action `
        -Trigger $trigger `
        -Principal $principal `
        -Settings $settings `
        -Description 'YOLLA PC Agent Runtime V1 supervisor' `
        -Force | Out-Null

    & $PythonExe -X utf8 $supervisorPath --config $configPath --validate-config
    if ($LASTEXITCODE -ne 0) { Fail 'PCRI012_INSTALLED_CONFIG_VALIDATION_FAILED' ('exit=' + $LASTEXITCODE) }

    if ($StartNow) {
        Start-ScheduledTask -TaskName $TaskName
        Start-Sleep -Seconds 3
    }
    $installStatus = 'PASS'
} catch {
    $installError = $_.Exception.Message
    if ($previousPointer) {
        Write-JsonNoBom $currentPath $previousPointer
    }
    throw
} finally {
    Remove-Item -LiteralPath $stagingRoot -Recurse -Force -ErrorAction SilentlyContinue
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    $receipt = [ordered]@{
        schema_version = 'YOLLA_PC_AGENT_WINDOWS_RUNTIME_INSTALL_RECEIPT_V1'
        status = $installStatus
        error = $installError
        version = $Version
        install_root = $InstallRoot
        release_root = $releaseRoot
        state_root = $StateRoot
        bridge_root = $BridgeRoot
        python_exe = $PythonExe
        task_name = $TaskName
        scheduled_task_registered = ($null -ne $task)
        started_now = [bool]$StartNow
        previous_version = if ($previousPointer) { $previousPointer.version } else { $null }
        production = $false
        ready = $false
        merge = $false
        completed_at = [DateTimeOffset]::UtcNow.ToString('o')
    }
    Write-JsonNoBom (Join-Path $receiptRoot ('install-' + (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssfffZ') + '.json')) $receipt
}

Write-Host 'PC_AGENT_RUNTIME_INSTALL=PASS'
Write-Host ('PC_AGENT_RUNTIME_VERSION=' + $Version)
Write-Host ('PC_AGENT_RUNTIME_INSTALL_ROOT=' + $InstallRoot)
Write-Host ('PC_AGENT_RUNTIME_TASK=' + $TaskName)
Write-Host ('PC_AGENT_RUNTIME_STARTED=' + ([bool]$StartNow).ToString().ToLowerInvariant())
Write-Host 'PRODUCTION=false'
Write-Host 'READY=false'
Write-Host 'MERGE=false'
