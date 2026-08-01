[CmdletBinding()]
param(
    [string]$ActiveCoreRoot = 'E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038',
    [string]$BridgeRoot = 'E:\YOLLA\agent\state\source-factory-bridge-v1',
    [string]$BridgeInstallRoot = 'E:\YOLLA\agent\bridge\source-factory-pc-agent-v1',
    [string]$PythonExe = 'E:\YOLLA\tools\python-3.13.5-embed-amd64\python.exe',
    [string]$PackageRoot = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)),
    [string]$WorkRoot = 'E:\YOLLA\source-factory-pc-agent-runtime-r11',
    [int]$StartupTimeoutSeconds = 90,
    [int]$ResultTimeoutSeconds = 90
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONLEGACYWINDOWSSTDIO = '0'

. (Join-Path $PSScriptRoot 'R11RuntimeCommon.ps1')
. (Join-Path $PSScriptRoot 'R11RuntimeTests.ps1')

if (
    $PSVersionTable.PSEdition -ne 'Desktop' -or
    $PSVersionTable.PSVersion.Major -ne 5 -or
    $PSVersionTable.PSVersion.Minor -ne 1
) {
    Fail 'R11014_WINDOWS_POWERSHELL_51_REQUIRED' (
        [string]$PSVersionTable.PSVersion
    )
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (
    -not $principal.IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator
    )
) {
    Fail 'R11015_ADMINISTRATOR_REQUIRED' 'Run elevated Windows PowerShell 5.1.'
}

$nodeExe = Resolve-CommandPath 'node.exe'
if (-not $nodeExe) { $nodeExe = Resolve-CommandPath 'node' }
if (-not $nodeExe) { Fail 'R11016_NODE_NOT_FOUND' 'node.exe or node required.' }

$sourceWorker = Join-Path $PackageRoot 'integrations\pc_agent_v1\pc_agent_bridge_worker.py'
$liveTest = Join-Path $PackageRoot 'integrations\runtime_acceptance_v1\testLiveActiveCoreStage4HandlerBridgeV1.js'
$contractPath = Join-Path $PackageRoot 'integrations\runtime_acceptance_v1\R11_ACTIVE_RUNTIME_ACCEPTANCE_CONTRACT_V1.json'
$validatorPath = Join-Path $PackageRoot 'integrations\runtime_acceptance_v1\validate_r11_runtime_acceptance.py'
$installedWorker = Join-Path $BridgeInstallRoot 'pc_agent_bridge_worker.py'
$launcher = Join-Path $ActiveCoreRoot 'RUN_E_SF4_SAFE_PANEL_E_ONLY_WITH_PC_AGENT_BRIDGE.bat'
$handler = Join-Path $ActiveCoreRoot 'safe_panel_v10\ipc\stage4StationBindingHandlers.js'
$adapter = Join-Path $ActiveCoreRoot 'src\shared\stage4\pcAgentBridgeAdapter.js'

foreach ($required in @(
    $ActiveCoreRoot,$BridgeRoot,$PythonExe,$sourceWorker,$liveTest,
    $contractPath,$validatorPath,$launcher,$handler,$adapter
)) {
    if (-not (Test-Path -LiteralPath $required)) {
        Fail 'R11017_REQUIRED_PATH_MISSING' $required
    }
}

$runId = 'R11-' + (
    Get-Date
).ToUniversalTime().ToString('yyyyMMddTHHmmssfffZ') + '-' +
    [guid]::NewGuid().ToString('N').Substring(0, 12)
$attemptRoot = Join-Path $WorkRoot ('attempts\' + $runId)
$evidenceRoot = Join-Path $attemptRoot 'evidence'
$backupRoot = Join-Path $attemptRoot 'backup'
New-Item -ItemType Directory -Path (
    $evidenceRoot
),$backupRoot,$BridgeInstallRoot -Force | Out-Null

$sourceValidation = Invoke-CapturedProcess `
    -FilePath $PythonExe `
    -Arguments @(
        '-X','utf8',
        $validatorPath,
        '--package-root',$PackageRoot,
        '--output',(Join-Path $evidenceRoot 'R11_PACKAGE_VALIDATION.json')
    ) `
    -WorkingDirectory $PackageRoot `
    -StdoutPath (Join-Path $evidenceRoot 'R11_VALIDATOR.stdout.txt') `
    -StderrPath (Join-Path $evidenceRoot 'R11_VALIDATOR.stderr.txt')
if ($sourceValidation.exit_code -ne 0) {
    Fail 'R11018_PACKAGE_VALIDATION_FAILED' (
        $sourceValidation.stderr + $sourceValidation.stdout
    )
}

Assert-NoExistingRuntime

$workerBefore = [ordered]@{
    exists = Test-Path -LiteralPath $installedWorker -PathType Leaf
    sha256 = if (Test-Path -LiteralPath $installedWorker -PathType Leaf) {
        Sha256 $installedWorker
    } else { $null }
}
if ($workerBefore.exists) {
    Copy-Item -LiteralPath $installedWorker -Destination (
        Join-Path $backupRoot 'pc_agent_bridge_worker.py'
    ) -Force
}
Copy-Item -LiteralPath $sourceWorker -Destination $installedWorker -Force
& $PythonExe -X utf8 -m py_compile $installedWorker
if ($LASTEXITCODE -ne 0) {
    Fail 'R11019_INSTALLED_WORKER_COMPILE_FAILED' $installedWorker
}

$status = 'FAIL'
$primaryError = $null
$phase1 = $null
$phase2 = $null
$phase3 = $null
$liveReceipt = $null
$duplicateReceipt = $null
$recoveryReceipt = $null
$singletonReceipt = $null
$backupReceipt = $null
$stopReceipts = @()

try {
    $phase1 = Start-Runtime 'COLD_BOOT'
    $liveReceipt = Invoke-LiveHandlerRuntime (
        $runId.Replace('-','').ToLowerInvariant()
    )
    $duplicateReceipt = Test-DuplicateSuppression $liveReceipt
    $singletonReceipt = Test-SingletonLock

    $stopReceipts += Stop-Runtime `
        $phase1.launcher_process_ids `
        'BEFORE_RECOVERY_RESTART'

    $recoveryWorkId = 'r11-recovery-' + $runId.ToLowerInvariant()
    $phase2Result = Test-RestartRecovery $recoveryWorkId
    $phase2 = $phase2Result.runtime
    $recoveryReceipt = $phase2Result.receipt

    $liveResultHash = Sha256 ([string]$liveReceipt.work_result_path)
    $recoveryResultHash = Sha256 ([string]$recoveryReceipt.result_path)
    $stopReceipts += Stop-Runtime `
        $phase2.launcher_process_ids `
        'BEFORE_PERSISTENCE_RESTART'

    $phase3 = Start-Runtime 'PERSISTENCE_RESTART'
    if (
        (Sha256 ([string]$liveReceipt.work_result_path)) -ne $liveResultHash -or
        (Sha256 ([string]$recoveryReceipt.result_path)) -ne $recoveryResultHash
    ) {
        Fail 'R11020_STATE_PERSISTENCE_HASH_DRIFT' $runId
    }
    $persistenceReceipt = [ordered]@{
        schema_version = 'YOLLA_R11_STATE_PERSISTENCE_RECEIPT_V1'
        live_work_result_sha256 = $liveResultHash
        recovery_work_result_sha256 = $recoveryResultHash
        hash_drift_count = 0
        state_persistence = 'PASS'
        production = $false
    }
    Write-JsonNoBom (
        Join-Path $evidenceRoot 'STATE_PERSISTENCE.json'
    ) $persistenceReceipt
    Write-Host 'R11_STATE_PERSISTENCE=PASS'

    $backupReceipt = Test-ApplyBackupAuthority
    $stopReceipts += Stop-Runtime `
        $phase3.launcher_process_ids `
        'FINAL_CLEAN_SHUTDOWN'

    $finalSnapshot = Get-RuntimeSnapshot @()
    if (
        $finalSnapshot.worker_processes.Count -ne 0 -or
        $finalSnapshot.electron_processes.Count -ne 0
    ) {
        Fail 'R11021_FINAL_ORPHAN_PROCESS' (
            'workers={0} electrons={1}' -f
            $finalSnapshot.worker_processes.Count,
            $finalSnapshot.electron_processes.Count
        )
    }
    Write-Host 'R11_ORPHAN_WORKER_COUNT=0'
    Write-Host 'R11_ORPHAN_ELECTRON_COUNT=0'

    $status = 'PASS'
} catch {
    $primaryError = $_.Exception.Message
} finally {
    foreach ($runtime in @($phase1,$phase2,$phase3)) {
        if ($runtime) {
            try {
                $stopReceipts += Stop-Runtime `
                    $runtime.launcher_process_ids `
                    'FAILURE_CLEANUP'
            } catch {
                # The terminal receipt below preserves cleanup failure.
            }
        }
    }

    if ($status -ne 'PASS') {
        try {
            if ($workerBefore.exists) {
                Copy-Item -LiteralPath (
                    Join-Path $backupRoot 'pc_agent_bridge_worker.py'
                ) -Destination $installedWorker -Force
            } elseif (Test-Path -LiteralPath $installedWorker) {
                Remove-Item -LiteralPath $installedWorker -Force
            }
        } catch {
            $primaryError = $primaryError + ';WORKER_ROLLBACK_FAILED:' +
                $_.Exception.Message
        }
    }
}

$finalSnapshot = Get-RuntimeSnapshot @()
$finalReceipt = [ordered]@{
    schema_version = 'YOLLA_A1_R11_ACTIVE_RUNTIME_ACCEPTANCE_RECEIPT_V1'
    directive_id = 'A1-SF-PCAGENT-R11-ACTIVE-RUNTIME-BOOT-RESTART-RECOVERY-V1-20260802-001'
    run_id = $runId
    status = $status
    terminal = if ($status -eq 'PASS') {
        'A1_R11_ACTIVE_RUNTIME_BOOT_RESTART_RECOVERY_PASS'
    } else {
        'A1_R11_ACTIVE_RUNTIME_BOOT_RESTART_RECOVERY_FAIL'
    }
    primary_error = $primaryError
    active_core_root = $ActiveCoreRoot
    bridge_root = $BridgeRoot
    launcher = $launcher
    installed_worker = $installedWorker
    installed_worker_sha256 = if (
        Test-Path -LiteralPath $installedWorker -PathType Leaf
    ) { Sha256 $installedWorker } else { $null }
    live_handler_runtime = $liveReceipt
    duplicate_suppression = $duplicateReceipt
    restart_recovery = $recoveryReceipt
    singleton_lock = $singletonReceipt
    backup_authority = $backupReceipt
    stop_receipts = $stopReceipts
    final_worker_orphan_count = $finalSnapshot.worker_processes.Count
    final_electron_orphan_count = $finalSnapshot.electron_processes.Count
    real_api_call_count = 0
    postgresql_apply_count = 0
    destructive_rollback_count = 0
    production = $false
    ready = $false
    merge = $false
    completed_at = [DateTimeOffset]::UtcNow.ToString('o')
}
$finalPath = Join-Path $evidenceRoot 'R11_ACTIVE_RUNTIME_FINAL_RECEIPT.json'
Write-JsonNoBom $finalPath $finalReceipt

if ($status -ne 'PASS') {
    Fail 'R11022_R11_ACCEPTANCE_FAILED' (
        'error={0} receipt={1}' -f $primaryError,$finalPath
    )
}

Write-Host 'R11_COLD_BOOT=PASS'
Write-Host 'R11_LIVE_HANDLER_RUNTIME=PASS'
Write-Host 'R11_RESTART_RECOVERY=PASS'
Write-Host 'R11_DUPLICATE_SUPPRESSION=PASS'
Write-Host 'R11_SINGLETON_LOCK=PASS'
Write-Host 'R11_STATE_PERSISTENCE=PASS'
Write-Host 'R11_CLEAN_SHUTDOWN=PASS'
Write-Host 'R11_ACTIVE_RUNTIME_BOOT_RESTART_RECOVERY=PASS'
Write-Host 'REAL_API_CALL_COUNT=0'
Write-Host 'POSTGRESQL_APPLY_COUNT=0'
Write-Host 'PRODUCTION=false'
Write-Host 'READY=false'
Write-Host 'MERGE=false'
Write-Host ('R11_FINAL_RECEIPT=' + $finalPath)
