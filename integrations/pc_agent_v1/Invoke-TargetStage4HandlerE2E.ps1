function Invoke-TargetStage4HandlerE2E(
    [string]$CoreRoot,
    [string]$TestBridgeRoot,
    [string]$EvidencePath
) {
    function Quote-TargetHandlerProcessArgument([string]$Value) {
        if ($null -eq $Value) { return '""' }
        $text = [string]$Value
        if ($text -notmatch '[\s"]') { return $text }
        return '"' + $text.Replace('"', '\"') + '"'
    }

    $testScript = Join-Path $packageRoot 'releases\SF_REUSABLE_CORE_20260801_175708\tools\stage4\testTargetStage4HandlerPcAgentBridgeE2E.js'
    $parent = Split-Path -Parent $EvidencePath
    if ($parent) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }

    $stdoutPath = $EvidencePath + '.stdout.txt'
    $stderrPath = $EvidencePath + '.stderr.txt'
    Remove-Item -LiteralPath $stdoutPath,$stderrPath -Force -ErrorAction SilentlyContinue

    $argumentLine = @(
        (Quote-TargetHandlerProcessArgument $testScript),
        '--active-core-root', (Quote-TargetHandlerProcessArgument $CoreRoot),
        '--package-root', (Quote-TargetHandlerProcessArgument $packageRoot),
        '--bridge-root', (Quote-TargetHandlerProcessArgument $TestBridgeRoot),
        '--python', (Quote-TargetHandlerProcessArgument $PythonExe)
    ) -join ' '

    $process = Start-Process `
        -FilePath $nodeExe `
        -ArgumentList $argumentLine `
        -WorkingDirectory $packageRoot `
        -NoNewWindow `
        -PassThru `
        -Wait `
        -RedirectStandardOutput $stdoutPath `
        -RedirectStandardError $stderrPath

    $exitCode = [int]$process.ExitCode
    $stdoutText = if (Test-Path -LiteralPath $stdoutPath) {
        [IO.File]::ReadAllText($stdoutPath, [Text.Encoding]::UTF8)
    } else { '' }
    $stderrText = if (Test-Path -LiteralPath $stderrPath) {
        [IO.File]::ReadAllText($stderrPath, [Text.Encoding]::UTF8)
    } else { '' }

    $combinedEvidence = @(
        '=== STDOUT ===',
        $stdoutText,
        '=== STDERR ===',
        $stderrText,
        ('=== EXIT_CODE={0} ===' -f $exitCode)
    ) -join [Environment]::NewLine
    [IO.File]::WriteAllText(
        $EvidencePath,
        $combinedEvidence,
        (New-Object System.Text.UTF8Encoding($false))
    )

    if ($exitCode -ne 0) {
        Fail 'SFPADB2_TARGET_HANDLER_E2E_FAILED' (
            'core={0} exit={1} stdout={2} stderr={3}' -f
            $CoreRoot,
            $exitCode,
            $stdoutText,
            $stderrText
        )
    }

    $jsonLine = @(
        $stdoutText -split '\r?\n' | Where-Object {
            ([string]$_).Trim().StartsWith(
                '{"schema_version":"YOLLA_TARGET_STAGE4_HANDLER_PC_AGENT_E2E_V1"',
                [StringComparison]::Ordinal
            )
        }
    ) | Select-Object -Last 1
    if (-not $jsonLine) {
        Fail 'SFPADB2_TARGET_HANDLER_E2E_RECEIPT_MISSING' (
            'evidence={0} stdout={1} stderr={2}' -f
            $EvidencePath,
            $stdoutText,
            $stderrText
        )
    }

    $result = ([string]$jsonLine).Trim() | ConvertFrom-Json
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

    $stderrLines = @(
        $stderrText -split '\r?\n' | Where-Object { ([string]$_).Trim() }
    )
    $stderrNonfatal = ($stderrLines.Count -gt 0)
    if ($stderrNonfatal) {
        Write-Warning (
            'TARGET_HANDLER_E2E_STDERR_NONFATAL lines={0} path={1}' -f
            $stderrLines.Count,
            $stderrPath
        )
    }
    Write-Host ('TARGET_HANDLER_E2E_EXIT_CODE=' + $exitCode)
    Write-Host ('TARGET_HANDLER_E2E_STDERR_NONFATAL=' + $stderrNonfatal.ToString().ToLowerInvariant())
    Write-Host ('TARGET_HANDLER_E2E_STDERR_LINE_COUNT=' + $stderrLines.Count)

    $result | Add-Member -NotePropertyName helper_exit_code -NotePropertyValue $exitCode -Force
    $result | Add-Member -NotePropertyName helper_stderr_nonfatal -NotePropertyValue $stderrNonfatal -Force
    $result | Add-Member -NotePropertyName helper_stderr_line_count -NotePropertyValue $stderrLines.Count -Force
    $result | Add-Member -NotePropertyName helper_stdout_path -NotePropertyValue $stdoutPath -Force
    $result | Add-Member -NotePropertyName helper_stderr_path -NotePropertyValue $stderrPath -Force
    return $result
}
