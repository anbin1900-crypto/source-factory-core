[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('PANEL_ONLY', 'ONE_BROWSER', 'INACTIVE_SEAT_TRANSITION', 'BROWSER_CLOSE', 'BROWSER_REOPEN', 'CLOSE_REOPEN')]
    [string]$Scenario,

    [int]$RootProcessId = 0,

    [string[]]$RootProcessNamePattern = @('YOLLA', 'electron'),

    [ValidateRange(30, 3600)]
    [int]$SampleCount = 30,

    [ValidateRange(250, 60000)]
    [int]$SampleIntervalMs = 1000,

    [ValidateRange(0, 300)]
    [int]$WarmupSeconds = 3,

    [string]$ActionScriptPath = '',

    [ValidateRange(1, 1800)]
    [int]$ActionTimeoutSeconds = 120,

    [string]$OutputDirectory = (Join-Path $env:TEMP 'YOLLA_C_MODE_CYCLE1_RESOURCE_BASELINE')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-KstIso8601 {
    param([datetime]$UtcDateTime = [datetime]::UtcNow)

    try {
        $kst = [System.TimeZoneInfo]::FindSystemTimeZoneById('Korea Standard Time')
        return [System.TimeZoneInfo]::ConvertTimeFromUtc($UtcDateTime, $kst).ToString('yyyy-MM-ddTHH:mm:ss.fffzzz')
    }
    catch {
        return $UtcDateTime.AddHours(9).ToString('yyyy-MM-ddTHH:mm:ss.fff+09:00')
    }
}

function Get-ProcessSnapshot {
    $rows = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, CommandLine, CreationDate)
    $map = @{}
    foreach ($row in $rows) {
        $map[[int]$row.ProcessId] = $row
    }
    return $map
}

function Resolve-RootProcessId {
    param(
        [int]$RequestedRootProcessId,
        [string[]]$NamePatterns
    )

    $processMap = Get-ProcessSnapshot

    if ($RequestedRootProcessId -gt 0) {
        if (-not $processMap.ContainsKey($RequestedRootProcessId)) {
            throw "ROOT_PROCESS_NOT_FOUND:$RequestedRootProcessId"
        }
        return $RequestedRootProcessId
    }

    $regex = ($NamePatterns | ForEach-Object { [regex]::Escape($_) }) -join '|'
    $candidates = @(
        $processMap.Values |
            Where-Object {
                ($_.Name -match $regex) -or
                ((-not [string]::IsNullOrWhiteSpace($_.CommandLine)) -and ($_.CommandLine -match $regex))
            } |
            Sort-Object CreationDate -Descending
    )

    if ($candidates.Count -eq 0) {
        throw 'ROOT_PROCESS_AUTO_DETECTION_EMPTY'
    }

    $topLevelCandidates = @(
        $candidates | Where-Object {
            -not $processMap.ContainsKey([int]$_.ParentProcessId) -or
            -not (($processMap[[int]$_.ParentProcessId].Name -match $regex) -or
                 ((-not [string]::IsNullOrWhiteSpace($processMap[[int]$_.ParentProcessId].CommandLine)) -and
                  ($processMap[[int]$_.ParentProcessId].CommandLine -match $regex)))
        }
    )

    if ($topLevelCandidates.Count -ne 1) {
        $ids = @($topLevelCandidates | ForEach-Object { [int]$_.ProcessId }) -join ','
        throw "ROOT_PROCESS_AUTO_DETECTION_AMBIGUOUS:$ids"
    }

    return [int]$topLevelCandidates[0].ProcessId
}

function Get-DescendantProcessIds {
    param(
        [hashtable]$ProcessMap,
        [int]$RootId
    )

    $result = New-Object System.Collections.Generic.List[int]
    $queue = New-Object System.Collections.Generic.Queue[int]
    $seen = New-Object 'System.Collections.Generic.HashSet[int]'

    $queue.Enqueue($RootId)
    [void]$seen.Add($RootId)

    while ($queue.Count -gt 0) {
        $current = $queue.Dequeue()
        $result.Add($current)

        foreach ($entry in $ProcessMap.Values) {
            $childId = [int]$entry.ProcessId
            if ([int]$entry.ParentProcessId -eq $current -and -not $seen.Contains($childId)) {
                [void]$seen.Add($childId)
                $queue.Enqueue($childId)
            }
        }
    }

    return @($result)
}

function Invoke-ScenarioAction {
    param(
        [string]$ScriptPath,
        [string]$ScenarioName,
        [int]$ResolvedRootProcessId,
        [int]$TimeoutSeconds
    )

    if ([string]::IsNullOrWhiteSpace($ScriptPath)) {
        return [ordered]@{
            requested = $false
            executed = $false
            elapsed_ms = 0
            exit_code = $null
            status = 'NOT_REQUESTED'
        }
    }

    $resolvedPath = (Resolve-Path -LiteralPath $ScriptPath).Path
    if ([IO.Path]::GetExtension($resolvedPath) -ne '.ps1') {
        throw 'ACTION_SCRIPT_MUST_BE_PS1'
    }

    $arguments = @(
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', ('"{0}"' -f $resolvedPath),
        '-Scenario', $ScenarioName,
        '-RootProcessId', $ResolvedRootProcessId
    )

    $stopwatch = [Diagnostics.Stopwatch]::StartNew()
    $process = Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -PassThru -WindowStyle Hidden
    $deadline = [datetime]::UtcNow.AddSeconds($TimeoutSeconds)

    while (-not $process.HasExited) {
        if ([datetime]::UtcNow -ge $deadline) {
            try { $process.Kill() } catch { }
            throw "ACTION_SCRIPT_TIMEOUT:$TimeoutSeconds"
        }
        Start-Sleep -Milliseconds 200
        $process.Refresh()
    }

    $stopwatch.Stop()
    if ($process.ExitCode -ne 0) {
        throw "ACTION_SCRIPT_FAILED:$($process.ExitCode)"
    }

    return [ordered]@{
        requested = $true
        executed = $true
        elapsed_ms = [math]::Round($stopwatch.Elapsed.TotalMilliseconds, 3)
        exit_code = $process.ExitCode
        status = 'PASS'
    }
}

function Get-TreeMetrics {
    param(
        [int]$ResolvedRootProcessId,
        [double]$PreviousCpuMs,
        [datetime]$PreviousCapturedAtUtc,
        [int]$LogicalProcessorCount
    )

    $capturedAtUtc = [datetime]::UtcNow
    $processMap = Get-ProcessSnapshot
    if (-not $processMap.ContainsKey($ResolvedRootProcessId)) {
        throw "ROOT_PROCESS_EXITED:$ResolvedRootProcessId"
    }

    $ids = @(Get-DescendantProcessIds -ProcessMap $processMap -RootId $ResolvedRootProcessId)
    $workingSetBytes = [int64]0
    $privateBytes = [int64]0
    $totalCpuMs = [double]0
    $rendererCount = 0
    $gpuProcessCount = 0
    $utilityProcessCount = 0
    $otherTypedProcessCount = 0

    foreach ($id in $ids) {
        try {
            $process = Get-Process -Id $id -ErrorAction Stop
            $workingSetBytes += [int64]$process.WorkingSet64
            $privateBytes += [int64]$process.PrivateMemorySize64
            $totalCpuMs += [double]$process.TotalProcessorTime.TotalMilliseconds

            $commandLine = [string]$processMap[$id].CommandLine
            if ($commandLine -match '--type=renderer(?:\s|$)') {
                $rendererCount++
            }
            elseif ($commandLine -match '--type=gpu-process(?:\s|$)') {
                $gpuProcessCount++
            }
            elseif ($commandLine -match '--type=utility(?:\s|$)') {
                $utilityProcessCount++
            }
            elseif ($commandLine -match '--type=') {
                $otherTypedProcessCount++
            }
        }
        catch {
            # A process may end between CIM enumeration and Get-Process. The next sample re-enumerates.
        }
    }

    $cpuPercent = $null
    if ($PreviousCapturedAtUtc -ne [datetime]::MinValue) {
        $elapsedMs = ($capturedAtUtc - $PreviousCapturedAtUtc).TotalMilliseconds
        if ($elapsedMs -gt 0 -and $LogicalProcessorCount -gt 0) {
            $cpuDeltaMs = [math]::Max(0, $totalCpuMs - $PreviousCpuMs)
            $cpuPercent = [math]::Round(($cpuDeltaMs / $elapsedMs / $LogicalProcessorCount) * 100, 4)
        }
    }

    return [ordered]@{
        captured_at_utc = $capturedAtUtc.ToString('o')
        captured_at_kst = Get-KstIso8601 -UtcDateTime $capturedAtUtc
        cpu_percent = $cpuPercent
        total_cpu_ms = [math]::Round($totalCpuMs, 3)
        working_set_bytes = $workingSetBytes
        private_bytes = $privateBytes
        process_count = $ids.Count
        renderer_count = $rendererCount
        gpu_process_count = $gpuProcessCount
        utility_process_count = $utilityProcessCount
        other_typed_process_count = $otherTypedProcessCount
    }
}

function Get-MetricSummary {
    param(
        [object[]]$Samples,
        [string]$PropertyName
    )

    $values = @($Samples | ForEach-Object { $_.$PropertyName } | Where-Object { $null -ne $_ })
    if ($values.Count -eq 0) {
        return [ordered]@{ min = $null; avg = $null; max = $null; first = $null; last = $null; delta = $null }
    }

    $measure = $values | Measure-Object -Minimum -Maximum -Average
    return [ordered]@{
        min = [math]::Round([double]$measure.Minimum, 4)
        avg = [math]::Round([double]$measure.Average, 4)
        max = [math]::Round([double]$measure.Maximum, 4)
        first = $values[0]
        last = $values[-1]
        delta = [math]::Round(([double]$values[-1] - [double]$values[0]), 4)
    }
}

$resolvedRootProcessId = Resolve-RootProcessId -RequestedRootProcessId $RootProcessId -NamePatterns $RootProcessNamePattern
$rootProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$resolvedRootProcessId"
if ($null -eq $rootProcess) {
    throw "ROOT_PROCESS_NOT_FOUND_AFTER_RESOLUTION:$resolvedRootProcessId"
}

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$runId = 'A4-C1-{0}-{1}' -f $Scenario, ([datetime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ'))
$runDirectory = Join-Path $OutputDirectory $runId
New-Item -ItemType Directory -Path $runDirectory -Force | Out-Null

$actionResult = Invoke-ScenarioAction -ScriptPath $ActionScriptPath -ScenarioName $Scenario -ResolvedRootProcessId $resolvedRootProcessId -TimeoutSeconds $ActionTimeoutSeconds
if ($WarmupSeconds -gt 0) {
    Start-Sleep -Seconds $WarmupSeconds
}

$logicalProcessorCount = [int](Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors
$samples = New-Object System.Collections.Generic.List[object]
$previousCpuMs = [double]0
$previousCapturedAtUtc = [datetime]::MinValue

for ($index = 1; $index -le $SampleCount; $index++) {
    $sample = Get-TreeMetrics -ResolvedRootProcessId $resolvedRootProcessId -PreviousCpuMs $previousCpuMs -PreviousCapturedAtUtc $previousCapturedAtUtc -LogicalProcessorCount $logicalProcessorCount
    $sample['sample_index'] = $index
    $sample['scenario'] = $Scenario
    $samples.Add([pscustomobject]$sample)

    $previousCpuMs = [double]$sample.total_cpu_ms
    $previousCapturedAtUtc = [datetime]::Parse([string]$sample.captured_at_utc).ToUniversalTime()

    if ($index -lt $SampleCount) {
        Start-Sleep -Milliseconds $SampleIntervalMs
    }
}

$samplesPath = Join-Path $runDirectory 'samples.json'
$receiptPath = Join-Path $runDirectory 'receipt.json'
$samples | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $samplesPath -Encoding UTF8
$samplesSha256 = (Get-FileHash -LiteralPath $samplesPath -Algorithm SHA256).Hash.ToLowerInvariant()

$receipt = [ordered]@{
    schema_version = 'C_MODE_CYCLE1_RESOURCE_BASELINE_RECEIPT_V1'
    run_id = $runId
    worker = 'A-4'
    cycle_id = 'C-MODE-CYCLE1-AUTHORITY-RUNTIME-PERFORMANCE-BASELINE-20260806-001'
    directive_id = 'C1-A4-IDLE-RESOURCE-BASELINE-HARNESS'
    scenario = $Scenario
    captured_at_utc = [datetime]::UtcNow.ToString('o')
    captured_at_kst = Get-KstIso8601
    target_pc_live_execution = $true
    machine_name = $env:COMPUTERNAME
    os_version = [Environment]::OSVersion.VersionString
    logical_processor_count = $logicalProcessorCount
    root_process = [ordered]@{
        process_id = $resolvedRootProcessId
        name = [string]$rootProcess.Name
    }
    action = $actionResult
    sample_count_requested = $SampleCount
    sample_count_actual = $samples.Count
    sample_interval_ms = $SampleIntervalMs
    warmup_seconds = $WarmupSeconds
    metrics_summary = [ordered]@{
        cpu_percent = Get-MetricSummary -Samples $samples -PropertyName 'cpu_percent'
        working_set_bytes = Get-MetricSummary -Samples $samples -PropertyName 'working_set_bytes'
        private_bytes = Get-MetricSummary -Samples $samples -PropertyName 'private_bytes'
        process_count = Get-MetricSummary -Samples $samples -PropertyName 'process_count'
        renderer_count = Get-MetricSummary -Samples $samples -PropertyName 'renderer_count'
        gpu_process_count = Get-MetricSummary -Samples $samples -PropertyName 'gpu_process_count'
        utility_process_count = Get-MetricSummary -Samples $samples -PropertyName 'utility_process_count'
    }
    load_elapsed_ms = $actionResult.elapsed_ms
    samples_file = 'samples.json'
    samples_sha256 = $samplesSha256
    optimization_source_change_count = 0
    non_destructive_measurement = $true
    terminal = 'MEASURED'
}

$receipt | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $receiptPath -Encoding UTF8
Write-Output $receiptPath
