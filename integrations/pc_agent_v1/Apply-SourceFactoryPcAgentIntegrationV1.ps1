[CmdletBinding()]
param(
    [string]$ActiveCoreRoot = 'E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038',
    [string]$PackageRoot = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)),
    [string]$BridgeRoot = 'E:\YOLLA\agent\state\source-factory-bridge-v1',
    [string]$BridgeInstallRoot = 'E:\YOLLA\agent\bridge\source-factory-pc-agent-v1',
    [string]$PythonExe = 'E:\YOLLA\tools\python-3.13.5-embed-amd64\python.exe',
    [switch]$SkipMockE2E
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONLEGACYWINDOWSSTDIO = '0'

function Fail([string]$Code, [string]$Message) {
    throw ('{0}:{1}' -f $Code, $Message)
}

function Sha256([string]$Path) {
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Write-JsonNoBom([string]$Path, [object]$Value) {
    $parent = Split-Path -Parent $Path
    if ($parent) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 100), $utf8)
}

function Resolve-CommandPath([string]$Name) {
    $command = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -eq $command) { return $null }
    return $command.Source
}

$nodeExe = Resolve-CommandPath 'node.exe'
if (-not $nodeExe) { $nodeExe = Resolve-CommandPath 'node' }
if (-not $nodeExe) { Fail 'SFPC001_NODE_NOT_FOUND' 'node.exe or node must be available in PATH.' }
if (-not (Test-Path -LiteralPath $PythonExe -PathType Leaf)) { Fail 'SFPC002_PYTHON_NOT_FOUND' $PythonExe }
if (-not (Test-Path -LiteralPath $ActiveCoreRoot -PathType Container)) { Fail 'SFPC003_ACTIVE_CORE_NOT_FOUND' $ActiveCoreRoot }

$releaseRoot = Join-Path $PackageRoot 'releases\SF_REUSABLE_CORE_20260801_175708'
$integrationRoot = Join-Path $PackageRoot 'integrations\pc_agent_v1'
$sourceAdapter = Join-Path $releaseRoot 'src\shared\stage4\pcAgentBridgeAdapter.js'
$sourcePatcher = Join-Path $releaseRoot 'tools\stage4\applyPcAgentBridgePatch.js'
$sourceTest = Join-Path $releaseRoot 'tools\stage4\testPcAgentBridgeE2E.js'
$sourceWorker = Join-Path $integrationRoot 'pc_agent_bridge_worker.py'
$sourceValidator = Join-Path $integrationRoot 'validate_source_factory_pc_agent_integration.py'
$sourceContract = Join-Path $integrationRoot 'SOURCE_FACTORY_PC_AGENT_INTEGRATION_CONTRACT_V1.json'

foreach ($required in @($sourceAdapter, $sourcePatcher, $sourceTest, $sourceWorker, $sourceValidator, $sourceContract)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { Fail 'SFPC004_PACKAGE_FILE_MISSING' $required }
}

$targetHandler = Join-Path $ActiveCoreRoot 'safe_panel_v10\ipc\stage4StationBindingHandlers.js'
$targetAdapter = Join-Path $ActiveCoreRoot 'src\shared\stage4\pcAgentBridgeAdapter.js'
$targetWorker = Join-Path $BridgeInstallRoot 'pc_agent_bridge_worker.py'
$targetLauncher = Join-Path $ActiveCoreRoot 'RUN_E_SF4_SAFE_PANEL_E_ONLY_WITH_PC_AGENT_BRIDGE.bat'
$baseLauncher = Join-Path $ActiveCoreRoot 'RUN_E_SF4_SAFE_PANEL_E_ONLY.bat'
foreach ($required in @($targetHandler, $baseLauncher)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { Fail 'SFPC005_ACTIVE_CORE_FILE_MISSING' $required }
}

$runId = 'SFPC-' + (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssfffZ') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 12)
$backupRoot = Join-Path $BridgeRoot ('apply-backups\' + $runId)
$receiptRoot = Join-Path $BridgeRoot ('apply-receipts\' + $runId)
New-Item -ItemType Directory -Path $backupRoot, $receiptRoot, $BridgeInstallRoot -Force | Out-Null

$before = [ordered]@{
    handler = [ordered]@{ path = $targetHandler; exists = $true; sha256 = Sha256 $targetHandler }
    adapter = [ordered]@{ path = $targetAdapter; exists = (Test-Path -LiteralPath $targetAdapter -PathType Leaf); sha256 = if (Test-Path -LiteralPath $targetAdapter -PathType Leaf) { Sha256 $targetAdapter } else { $null } }
    worker = [ordered]@{ path = $targetWorker; exists = (Test-Path -LiteralPath $targetWorker -PathType Leaf); sha256 = if (Test-Path -LiteralPath $targetWorker -PathType Leaf) { Sha256 $targetWorker } else { $null } }
    launcher = [ordered]@{ path = $targetLauncher; exists = (Test-Path -LiteralPath $targetLauncher -PathType Leaf); sha256 = if (Test-Path -LiteralPath $targetLauncher -PathType Leaf) { Sha256 $targetLauncher } else { $null } }
}
Write-JsonNoBom (Join-Path $receiptRoot 'BEFORE.json') $before

Copy-Item -LiteralPath $targetHandler -Destination (Join-Path $backupRoot 'stage4StationBindingHandlers.js') -Force
if ($before.adapter.exists) { Copy-Item -LiteralPath $targetAdapter -Destination (Join-Path $backupRoot 'pcAgentBridgeAdapter.js') -Force }
if ($before.worker.exists) { Copy-Item -LiteralPath $targetWorker -Destination (Join-Path $backupRoot 'pc_agent_bridge_worker.py') -Force }
if ($before.launcher.exists) { Copy-Item -LiteralPath $targetLauncher -Destination (Join-Path $backupRoot 'RUN_E_SF4_SAFE_PANEL_E_ONLY_WITH_PC_AGENT_BRIDGE.bat') -Force }

$status = 'FAIL'
$primaryError = $null
$rollbackError = $null
$patchReceipt = $null
$mockOutput = $null
try {
    & $PythonExe -X utf8 $sourceValidator $PackageRoot --output (Join-Path $receiptRoot 'PACKAGE_VALIDATION.json')
    if ($LASTEXITCODE -ne 0) { Fail 'SFPC006_PACKAGE_VALIDATION_FAILED' (Join-Path $receiptRoot 'PACKAGE_VALIDATION.json') }

    New-Item -ItemType Directory -Path (Split-Path -Parent $targetAdapter), (Split-Path -Parent $targetWorker) -Force | Out-Null
    Copy-Item -LiteralPath $sourceAdapter -Destination $targetAdapter -Force
    Copy-Item -LiteralPath $sourceWorker -Destination $targetWorker -Force

    $patchOutput = & $nodeExe $sourcePatcher --target $targetHandler 2>&1
    if ($LASTEXITCODE -ne 0) { Fail 'SFPC007_HANDLER_PATCH_FAILED' ($patchOutput -join [Environment]::NewLine) }
    $patchReceipt = ($patchOutput | Select-Object -Last 1) | ConvertFrom-Json
    $expectedTempParent = Split-Path -Parent $targetHandler
    $allowedWriteStrategies = @(
        'SAME_DIRECTORY_ATOMIC_RENAME',
        'VERIFIED_COPY_FALLBACK_EXDEV',
        'VERIFIED_COPY_FALLBACK_EPERM',
        'VERIFIED_COPY_FALLBACK_EACCES',
        'VERIFIED_COPY_FALLBACK_EEXIST'
    )
    if ([string]$patchReceipt.temp_parent -ne $expectedTempParent) {
        Fail 'SFPC007A_PATCH_TEMP_PARENT_MISMATCH' ('expected={0} observed={1}' -f $expectedTempParent,$patchReceipt.temp_parent)
    }
    if ([string]$patchReceipt.written_sha256 -ne [string]$patchReceipt.patched_sha256) {
        Fail 'SFPC007B_PATCH_WRITE_SHA_MISMATCH' ('patched={0} written={1}' -f $patchReceipt.patched_sha256,$patchReceipt.written_sha256)
    }
    if ($allowedWriteStrategies -notcontains [string]$patchReceipt.write_strategy) {
        Fail 'SFPC007C_PATCH_WRITE_STRATEGY_INVALID' ([string]$patchReceipt.write_strategy)
    }
    Write-JsonNoBom (Join-Path $receiptRoot 'PATCH_RECEIPT.json') $patchReceipt
    Write-Host ('PATCH_WRITE_STRATEGY=' + [string]$patchReceipt.write_strategy)
    Write-Host 'PATCH_TEMP_PARENT_SAME_VOLUME=PASS'
    Write-Host 'PATCH_WRITTEN_SHA256=PASS'

    & $nodeExe --check $targetHandler
    if ($LASTEXITCODE -ne 0) { Fail 'SFPC008_HANDLER_NODE_CHECK_FAILED' $targetHandler }
    & $nodeExe --check $targetAdapter
    if ($LASTEXITCODE -ne 0) { Fail 'SFPC009_ADAPTER_NODE_CHECK_FAILED' $targetAdapter }
    & $PythonExe -X utf8 -m py_compile $targetWorker
    if ($LASTEXITCODE -ne 0) { Fail 'SFPC010_WORKER_PY_COMPILE_FAILED' $targetWorker }

    $launcherLines = @(
        '@echo off',
        'setlocal',
        'set "YOLLA_PC_AGENT_BRIDGE_ENABLED=1"',
        ('set "YOLLA_PC_AGENT_BRIDGE_ROOT={0}"' -f $BridgeRoot),
        ('start "YOLLA PC Agent Bridge" /min "{0}" "{1}" --bridge-root "{2}" --poll-seconds 0.25' -f $PythonExe, $targetWorker, $BridgeRoot),
        ('call "{0}"' -f $baseLauncher),
        'endlocal'
    )
    [IO.File]::WriteAllLines($targetLauncher, $launcherLines, (New-Object System.Text.ASCIIEncoding))

    if (-not $SkipMockE2E) {
        $env:PYTHON_EXE = $PythonExe
        $mockOutput = & $nodeExe $sourceTest 2>&1
        if ($LASTEXITCODE -ne 0) { Fail 'SFPC011_MOCK_E2E_FAILED' ($mockOutput -join [Environment]::NewLine) }
        $mockLast = $mockOutput | Select-Object -Last 1
        Write-JsonNoBom (Join-Path $receiptRoot 'MOCK_E2E_RESULT.json') ($mockLast | ConvertFrom-Json)
    }

    $status = 'PASS'
} catch {
    $primaryError = $_.Exception.Message
} finally {
    if ($status -ne 'PASS') {
        try {
            Copy-Item -LiteralPath (Join-Path $backupRoot 'stage4StationBindingHandlers.js') -Destination $targetHandler -Force
            if ($before.adapter.exists) {
                Copy-Item -LiteralPath (Join-Path $backupRoot 'pcAgentBridgeAdapter.js') -Destination $targetAdapter -Force
            } elseif (Test-Path -LiteralPath $targetAdapter) {
                Remove-Item -LiteralPath $targetAdapter -Force
            }
            if ($before.worker.exists) {
                Copy-Item -LiteralPath (Join-Path $backupRoot 'pc_agent_bridge_worker.py') -Destination $targetWorker -Force
            } elseif (Test-Path -LiteralPath $targetWorker) {
                Remove-Item -LiteralPath $targetWorker -Force
            }
            if ($before.launcher.exists) {
                Copy-Item -LiteralPath (Join-Path $backupRoot 'RUN_E_SF4_SAFE_PANEL_E_ONLY_WITH_PC_AGENT_BRIDGE.bat') -Destination $targetLauncher -Force
            } elseif (Test-Path -LiteralPath $targetLauncher) {
                Remove-Item -LiteralPath $targetLauncher -Force
            }
            & $nodeExe --check $targetHandler
            if ($LASTEXITCODE -ne 0) { Fail 'SFPC012_ROLLBACK_NODE_CHECK_FAILED' $targetHandler }
        } catch {
            $rollbackError = $_.Exception.Message
        }
    }
}

$after = [ordered]@{
    handler = [ordered]@{ path = $targetHandler; exists = (Test-Path -LiteralPath $targetHandler -PathType Leaf); sha256 = if (Test-Path -LiteralPath $targetHandler -PathType Leaf) { Sha256 $targetHandler } else { $null } }
    adapter = [ordered]@{ path = $targetAdapter; exists = (Test-Path -LiteralPath $targetAdapter -PathType Leaf); sha256 = if (Test-Path -LiteralPath $targetAdapter -PathType Leaf) { Sha256 $targetAdapter } else { $null } }
    worker = [ordered]@{ path = $targetWorker; exists = (Test-Path -LiteralPath $targetWorker -PathType Leaf); sha256 = if (Test-Path -LiteralPath $targetWorker -PathType Leaf) { Sha256 $targetWorker } else { $null } }
    launcher = [ordered]@{ path = $targetLauncher; exists = (Test-Path -LiteralPath $targetLauncher -PathType Leaf); sha256 = if (Test-Path -LiteralPath $targetLauncher -PathType Leaf) { Sha256 $targetLauncher } else { $null } }
}
Write-JsonNoBom (Join-Path $receiptRoot 'AFTER.json') $after

$final = [ordered]@{
    schema_version = 'YOLLA_SOURCE_FACTORY_PC_AGENT_TARGET_APPLY_RECEIPT_V1'
    integration_id = 'SOURCE-FACTORY-PC-AGENT-FILE-BRIDGE-V1-20260801'
    run_id = $runId
    status = $status
    primary_error = $primaryError
    rollback_error = $rollbackError
    active_core_root = $ActiveCoreRoot
    bridge_root = $BridgeRoot
    bridge_install_root = $BridgeInstallRoot
    package_root = $PackageRoot
    node_exe = $nodeExe
    python_exe = $PythonExe
    before = $before
    after = $after
    patch_receipt = $patchReceipt
    mock_e2e = if ($SkipMockE2E) { 'SKIPPED_BY_OPERATOR' } else { 'PASS' }
    sequential_prompt_sender_preserved = $true
    execution_result_collector_preserved = $true
    preload_api_renamed = $false
    ipc_channel_renamed = $false
    package_json_modified = $false
    production_connection = $false
    production_credential_use = $false
    production_deploy = $false
    ready = $false
    merge = $false
    backup_root = $backupRoot
    completed_at = [DateTimeOffset]::UtcNow.ToString('o')
}
$finalPath = Join-Path $receiptRoot 'SOURCE_FACTORY_PC_AGENT_TARGET_APPLY_RECEIPT.json'
Write-JsonNoBom $finalPath $final

if ($status -ne 'PASS') {
    Fail 'SFPC013_APPLY_FAILED' ('primary={0} rollback={1} receipt={2}' -f $primaryError, $rollbackError, $finalPath)
}

Write-Host 'SOURCE_FACTORY_PC_AGENT_APPLY=PASS'
Write-Host 'HANDLER_NODE_CHECK=PASS'
Write-Host 'ADAPTER_NODE_CHECK=PASS'
Write-Host 'WORKER_PY_COMPILE=PASS'
Write-Host ('MOCK_E2E=' + $final.mock_e2e)
Write-Host 'SEQUENTIAL_PROMPT_SENDER_PRESERVED=true'
Write-Host 'EXECUTION_RESULT_COLLECTOR_PRESERVED=true'
Write-Host 'PRODUCTION=false'
Write-Host 'READY=false'
Write-Host 'MERGE=false'
Write-Host ('LAUNCHER=' + $targetLauncher)
Write-Host ('RECEIPT=' + $finalPath)
