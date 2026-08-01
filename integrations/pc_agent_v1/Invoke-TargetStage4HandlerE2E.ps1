function Invoke-TargetStage4HandlerE2E(
    [string]$CoreRoot,
    [string]$TestBridgeRoot,
    [string]$EvidencePath
) {
    $testScript = Join-Path $packageRoot 'releases\SF_REUSABLE_CORE_20260801_175708\tools\stage4\testTargetStage4HandlerPcAgentBridgeE2E.js'
    $output = @(
        & $nodeExe $testScript `
            --active-core-root $CoreRoot `
            --package-root $packageRoot `
            --bridge-root $TestBridgeRoot `
            --python $PythonExe 2>&1
    )
    $exitCode = $LASTEXITCODE
    $parent = Split-Path -Parent $EvidencePath
    if ($parent) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    [IO.File]::WriteAllLines(
        $EvidencePath,
        [string[]]$output,
        (New-Object System.Text.UTF8Encoding($false))
    )
    if ($exitCode -ne 0) {
        Fail 'SFPADB2_TARGET_HANDLER_E2E_FAILED' (
            'core={0} exit={1} output={2}' -f
            $CoreRoot,
            $exitCode,
            ($output -join [Environment]::NewLine)
        )
    }
    $jsonLine = @(
        $output | Where-Object {
            ([string]$_).StartsWith(
                '{"schema_version":"YOLLA_TARGET_STAGE4_HANDLER_PC_AGENT_E2E_V1"',
                [StringComparison]::Ordinal
            )
        }
    ) | Select-Object -Last 1
    if (-not $jsonLine) {
        Fail 'SFPADB2_TARGET_HANDLER_E2E_RECEIPT_MISSING' $EvidencePath
    }
    $result = ([string]$jsonLine) | ConvertFrom-Json
    if (
        $result.status -ne 'PASS' -or
        $result.target_handler_loaded -ne $true -or
        $result.pc_agent_execution -ne 'PASS' -or
        [int]$result.exit_code -ne 0 -or
        $result.storage -ne 'PASS' -or
        $result.production -ne $false
    ) {
        Fail 'SFPADB2_TARGET_HANDLER_E2E_RECEIPT_INVALID' (
            $result | ConvertTo-Json -Depth 20 -Compress
        )
    }
    return $result
}
