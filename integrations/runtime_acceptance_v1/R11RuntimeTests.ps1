function Invoke-LiveHandlerRuntime([string]$PhaseRunId) {
    $stdoutPath = Join-Path $evidenceRoot (
        'LIVE_HANDLER_' + $PhaseRunId + '.stdout.txt'
    )
    $stderrPath = Join-Path $evidenceRoot (
        'LIVE_HANDLER_' + $PhaseRunId + '.stderr.txt'
    )
    $result = Invoke-CapturedProcess `
        -FilePath $nodeExe `
        -Arguments @(
            $liveTest,
            '--active-core-root',$ActiveCoreRoot,
            '--bridge-root',$BridgeRoot,
            '--python',$PythonExe,
            '--run-id',$PhaseRunId,
            '--timeout-seconds',$ResultTimeoutSeconds
        ) `
        -WorkingDirectory $PackageRoot `
        -StdoutPath $stdoutPath `
        -StderrPath $stderrPath

    if ($result.exit_code -ne 0) {
        Fail 'R11004_LIVE_HANDLER_RUNTIME_FAILED' (
            'exit={0} stdout={1} stderr={2}' -f
            $result.exit_code,
            $result.stdout,
            $result.stderr
        )
    }
    $jsonLine = @(
        $result.stdout -split '\r?\n' |
        Where-Object {
            ([string]$_).Trim().StartsWith(
                '{"schema_version":"YOLLA_R11_LIVE_ACTIVE_CORE_HANDLER_RUNTIME_V1"',
                [StringComparison]::Ordinal
            )
        }
    ) | Select-Object -Last 1
    if (-not $jsonLine) {
        Fail 'R11005_LIVE_HANDLER_RECEIPT_MISSING' $stdoutPath
    }
    $receipt = ([string]$jsonLine).Trim() | ConvertFrom-Json
    if (
        $receipt.status -ne 'PASS' -or
        $receipt.pc_agent_execution -ne 'PASS' -or
        $receipt.collector -ne 'PASS' -or
        $receipt.storage -ne 'PASS' -or
        [int]$receipt.exit_code -ne 0 -or
        $receipt.production -ne $false
    ) {
        Fail 'R11006_LIVE_HANDLER_RECEIPT_INVALID' (
            $receipt | ConvertTo-Json -Depth 20 -Compress
        )
    }
    Write-JsonNoBom (
        Join-Path $evidenceRoot ('LIVE_HANDLER_' + $PhaseRunId + '.json')
    ) $receipt
    Write-Host 'R11_LIVE_ACTIVE_CORE_HANDLER=PASS'
    Write-Host 'R11_LIVE_PC_AGENT_EXECUTION=PASS'
    Write-Host 'R11_LIVE_COLLECTOR_STORAGE=PASS'
    return $receipt
}

function Test-DuplicateSuppression([object]$LiveReceipt) {
    $workId = [string]$LiveReceipt.work_id
    $resultPath = [string]$LiveReceipt.work_result_path
    $originalHash = Sha256 $resultPath
    $originalWriteTime = (
        Get-Item -LiteralPath $resultPath
    ).LastWriteTimeUtc.Ticks
    $processedRequest = Join-Path (
        Join-Path $BridgeRoot 'processed'
    ) ($workId + '.json')
    if (-not (Test-Path -LiteralPath $processedRequest -PathType Leaf)) {
        $processedRequest = @(
            Get-ChildItem -LiteralPath (
                Join-Path $BridgeRoot 'processed'
            ) -File |
            Where-Object {
                $_.Name -like ($workId + '*.json')
            } |
            Sort-Object LastWriteTimeUtc -Descending
        ) | Select-Object -First 1 |
            ForEach-Object { $_.FullName }
    }
    if (-not $processedRequest) {
        Fail 'R11007_PROCESSED_REQUEST_NOT_FOUND' $workId
    }

    $duplicatePath = Join-Path (
        Join-Path $BridgeRoot 'requests'
    ) ('r11-duplicate-' + $runId + '.json')
    Copy-Item -LiteralPath $processedRequest -Destination $duplicatePath -Force

    Wait-Condition {
        if (-not (Test-Path -LiteralPath $duplicatePath)) {
            $duplicateReceipt = @(
                Get-ChildItem -LiteralPath (
                    Join-Path $BridgeRoot 'attempts'
                ) -File |
                Where-Object {
                    $_.Name -like ($workId + '*duplicate*.json')
                }
            )
            if ($duplicateReceipt.Count -ge 1) {
                return $duplicateReceipt
            }
        }
        return $null
    } $ResultTimeoutSeconds 'DUPLICATE_SUPPRESSION_RECEIPT' | Out-Null

    $afterHash = Sha256 $resultPath
    $afterWriteTime = (
        Get-Item -LiteralPath $resultPath
    ).LastWriteTimeUtc.Ticks
    $normalAttempts = @(
        Get-ChildItem -LiteralPath (
            Join-Path $BridgeRoot 'attempts'
        ) -File |
        Where-Object {
            $_.Name -like ($workId + '-attempt-1.json')
        }
    )
    if (
        $afterHash -ne $originalHash -or
        $afterWriteTime -ne $originalWriteTime -or
        $normalAttempts.Count -ne 1
    ) {
        Fail 'R11008_DUPLICATE_SUPPRESSION_FAILED' (
            'hash_equal={0} write_time_equal={1} normal_attempt_count={2}' -f
            ($afterHash -eq $originalHash),
            ($afterWriteTime -eq $originalWriteTime),
            $normalAttempts.Count
        )
    }
    $receipt = [ordered]@{
        schema_version = 'YOLLA_R11_DUPLICATE_SUPPRESSION_RECEIPT_V1'
        work_id = $workId
        result_sha256_before = $originalHash
        result_sha256_after = $afterHash
        result_write_time_unchanged = ($afterWriteTime -eq $originalWriteTime)
        normal_attempt_count = $normalAttempts.Count
        duplicate_suppression = 'PASS'
        duplicate_execution_count = 0
        production = $false
    }
    Write-JsonNoBom (
        Join-Path $evidenceRoot 'DUPLICATE_SUPPRESSION.json'
    ) $receipt
    Write-Host 'R11_DUPLICATE_SUPPRESSION=PASS'
    Write-Host 'R11_DUPLICATE_EXECUTION_COUNT=0'
    return $receipt
}

function New-RecoveryRequest([string]$WorkId) {
    return [ordered]@{
        schema_version = 'YOLLA_SOURCE_FACTORY_PC_AGENT_BRIDGE_V1'
        object_type = 'WORK_REQUEST'
        work_id = $WorkId
        project_id = 'source-factory-r11-runtime'
        cycle_id = 'R11-RECOVERY'
        worker_slot_uid = 'A1-T1-R11'
        assignment_id = 'A1-R11-ACTIVE-RUNTIME-ACCEPTANCE'
        directive_id = 'A1-SF-PCAGENT-R11-ACTIVE-RUNTIME-BOOT-RESTART-RECOVERY-V1-20260802-001'
        execution_id = ('r11-recovery-execution-' + $runId)
        attempt_id = 'attempt-1'
        source_github_ref = 'anbin1900-crypto/source-factory-core@integration/source-factory-pc-agent-api-db-v1'
        idempotency_key = ('r11-recovery-idempotency-' + $runId)
        work_type = 'LOCAL_COMMAND'
        command_spec = [ordered]@{
            executable = $PythonExe
            args = @(
                '-X','utf8','-c',
                'import json; print("YOLLA_RESULT_JSON="+json.dumps({"restart_recovery":"PASS","outputs":[{"kind":"r11-recovery"}],"artifacts":[],"database_receipt":None,"production":False},ensure_ascii=False))'
            )
            cwd = $BridgeRoot
            timeout_seconds = 30
            env = [ordered]@{}
        }
        input_artifacts = @()
        retry_policy = [ordered]@{
            max_attempts = 1
            retry_on_exit_codes = @()
        }
        result_callback = [ordered]@{
            transport = 'FILE_QUEUE_V1'
            result_file = ($WorkId + '.json')
        }
        source_factory = [ordered]@{
            source = 'R11_SIMULATED_CLAIMED_BEFORE_RESTART'
            original_task_id = $WorkId
        }
        production = $false
        created_at = [DateTimeOffset]::UtcNow.ToString('o')
    }
}

function Test-RestartRecovery([string]$WorkId) {
    $processingRoot = Join-Path $BridgeRoot 'processing'
    New-Item -ItemType Directory -Path $processingRoot -Force | Out-Null
    $processingPath = Join-Path $processingRoot ($WorkId + '.json')
    Write-JsonNoBom $processingPath (New-RecoveryRequest $WorkId)

    $runtime = Start-Runtime 'RECOVERY_RESTART'
    $resultPath = Join-Path (
        Join-Path $BridgeRoot 'results'
    ) ($WorkId + '.json')
    Wait-Condition {
        if (Test-Path -LiteralPath $resultPath -PathType Leaf) {
            return $true
        }
        return $false
    } $ResultTimeoutSeconds 'RECOVERED_WORK_RESULT' | Out-Null

    $result = Get-Content -LiteralPath $resultPath -Raw | ConvertFrom-Json
    $recoveryPath = Join-Path $BridgeRoot 'runtime\last_recovery.json'
    if (-not (Test-Path -LiteralPath $recoveryPath -PathType Leaf)) {
        Fail 'R11009_RECOVERY_RECEIPT_MISSING' $recoveryPath
    }
    $recovery = Get-Content -LiteralPath $recoveryPath -Raw |
        ConvertFrom-Json
    $matched = @(
        $recovery.actions | Where-Object {
            $_.work_id -eq $WorkId -and
            $_.status -eq 'REQUEUED_FROM_PROCESSING'
        }
    )
    $attempts = @(
        Get-ChildItem -LiteralPath (
            Join-Path $BridgeRoot 'attempts'
        ) -File |
        Where-Object {
            $_.Name -eq ($WorkId + '-attempt-1.json')
        }
    )
    if (
        $result.final_status -ne 'PASS' -or
        [int]$result.exit_code -ne 0 -or
        $matched.Count -ne 1 -or
        $attempts.Count -ne 1
    ) {
        Fail 'R11010_RESTART_RECOVERY_INVALID' (
            'status={0} exit={1} matched={2} attempts={3}' -f
            $result.final_status,
            $result.exit_code,
            $matched.Count,
            $attempts.Count
        )
    }
    $receipt = [ordered]@{
        schema_version = 'YOLLA_R11_RESTART_RECOVERY_RECEIPT_V1'
        work_id = $WorkId
        processing_path_before_restart = $processingPath
        result_path = $resultPath
        result_sha256 = Sha256 $resultPath
        startup_recovery_receipt = $recoveryPath
        requeued_from_processing_count = $matched.Count
        attempt_count = $attempts.Count
        pending_request_resume = 'PASS'
        duplicate_execution_count = 0
        production = $false
    }
    Write-JsonNoBom (
        Join-Path $evidenceRoot 'RESTART_RECOVERY.json'
    ) $receipt
    Write-Host 'R11_PENDING_REQUEST_RESUME=PASS'
    Write-Host 'R11_RESTART_RECOVERY=PASS'
    return [pscustomobject][ordered]@{
        runtime = $runtime
        receipt = $receipt
    }
}

function Test-SingletonLock {
    $stdoutPath = Join-Path $evidenceRoot 'SINGLETON.stdout.txt'
    $stderrPath = Join-Path $evidenceRoot 'SINGLETON.stderr.txt'
    $result = Invoke-CapturedProcess `
        -FilePath $PythonExe `
        -Arguments @(
            '-X','utf8',
            $installedWorker,
            '--bridge-root',$BridgeRoot,
            '--once'
        ) `
        -WorkingDirectory $BridgeRoot `
        -StdoutPath $stdoutPath `
        -StderrPath $stderrPath
    $jsonLine = @(
        $result.stdout -split '\r?\n' |
        Where-Object {
            ([string]$_).Trim().StartsWith('{')
        }
    ) | Select-Object -First 1
    $receipt = if ($jsonLine) {
        ([string]$jsonLine).Trim() | ConvertFrom-Json
    } else { $null }
    if (
        $result.exit_code -ne 73 -or
        -not $receipt -or
        $receipt.code -ne 'DUPLICATE_WORKER_INSTANCE'
    ) {
        Fail 'R11011_SINGLETON_LOCK_FAILED' (
            'exit={0} stdout={1} stderr={2}' -f
            $result.exit_code,
            $result.stdout,
            $result.stderr
        )
    }
    Write-Host 'R11_SINGLETON_LOCK=PASS'
    Write-Host 'R11_DUPLICATE_SIDECAR_COUNT=0'
    return [ordered]@{
        schema_version = 'YOLLA_R11_SINGLETON_LOCK_RECEIPT_V1'
        exit_code = $result.exit_code
        duplicate_instance_code = $receipt.code
        singleton_lock = 'PASS'
        duplicate_sidecar_count = 0
        production = $false
    }
}

function Test-ApplyBackupAuthority {
    $receipts = @(
        Get-ChildItem -LiteralPath (
            Join-Path $BridgeRoot 'apply-receipts'
        ) -Filter 'SOURCE_FACTORY_PC_AGENT_TARGET_APPLY_RECEIPT.json' `
            -File -Recurse -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTimeUtc -Descending
    )
    if ($receipts.Count -eq 0) {
        Fail 'R11012_APPLY_RECEIPT_NOT_FOUND' $BridgeRoot
    }
    $receipt = Get-Content -LiteralPath $receipts[0].FullName -Raw |
        ConvertFrom-Json
    if (
        $receipt.status -ne 'PASS' -or
        -not (Test-Path -LiteralPath $receipt.backup_root -PathType Container)
    ) {
        Fail 'R11013_BACKUP_AUTHORITY_INVALID' (
            $receipts[0].FullName
        )
    }
    $result = [ordered]@{
        schema_version = 'YOLLA_R11_BACKUP_AUTHORITY_RECEIPT_V1'
        apply_receipt = $receipts[0].FullName
        backup_root = $receipt.backup_root
        apply_status = $receipt.status
        backup_root_exists = $true
        destructive_rollback_executed = $false
        rollback_subgate_required = $true
        production = $false
    }
    Write-JsonNoBom (
        Join-Path $evidenceRoot 'BACKUP_AUTHORITY.json'
    ) $result
    Write-Host 'R11_BACKUP_AUTHORITY=PASS'
    Write-Host 'R11_DESTRUCTIVE_ROLLBACK_EXECUTED=false'
    return $result
}
