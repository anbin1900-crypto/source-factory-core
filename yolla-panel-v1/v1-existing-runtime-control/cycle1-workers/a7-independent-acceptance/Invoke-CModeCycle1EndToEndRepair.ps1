#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$RepositoryRoot = (Get-Location).Path,
    [string]$OutputRoot = (Join-Path $env:TEMP 'YOLLA_C_MODE_CYCLE1_A7_REPAIR'),
    [int]$RootProcessId = 0,
    [string]$ExpectedActiveRuntimeVersion = '5.10.2.3.7',
    [string[]]$LauncherPath = @(),
    [string]$ReleaseRoot = '',
    [string]$StateRoot = '',
    [string]$BrowserProfileRoot = '',
    [string]$A4ActionScriptPath = '',
    [string]$A6ActionDriverPath = '',
    [string]$A6SnapshotDriverPath = '',
    [ValidateRange(30, 3600)][int]$SampleCount = 30,
    [ValidateRange(250, 60000)][int]$SampleIntervalMs = 1000,
    [ValidateRange(10, 1000)][int]$A6Iterations = 10,
    [ValidateRange(0, 60000)][int]$A6SettleMs = 1000,
    [switch]$SkipGitFetch
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$CycleId = 'C-MODE-CYCLE1-AUTHORITY-RUNTIME-PERFORMANCE-BASELINE-20260806-001'
$TaskId = 'W2-A7-REPAIR-CYCLE1-INCOMPLETE-BASELINE'

$Sources = @(
    [ordered]@{
        id='A3_READBACK'; pr=22; commit='57012279520de80260bd857c9b6a9edd7aa51cba';
        path='yolla-panel-v1/v1-existing-runtime-control/cycle1-workers/a3-target-pc-readback/Invoke-CModeCycle1TargetPcReadback.ps1';
        blob='c79e102fa805054d2c2a07b62de2d616ce87454d'; file='Invoke-CModeCycle1TargetPcReadback.ps1'
    },
    [ordered]@{
        id='A4_RESOURCE_BASELINE'; pr=23; commit='b54af2bb3272b613be5458a283e22e2eb5d90ade';
        path='yolla-panel-v1/v1-existing-runtime-control/cycle1-workers/a4-resource-baseline/Invoke-CModeCycle1ResourceBaseline.ps1';
        blob='82bfd506922b7471d5bd1c4ed6697950a738489f'; file='Invoke-CModeCycle1ResourceBaseline.ps1'
    },
    [ordered]@{
        id='A6_REPEAT_HARNESS'; pr=25; commit='84ea9b34a7c9445a77214288556ff3230442d81e';
        path='yolla-panel-v1/v1-existing-runtime-control/cycle1-workers/a6-leak-and-repeat-harness/c_mode_cycle1_browser_repeat_harness.cjs';
        blob='0d1e4bbf2220212c2d85c39826b31abe01bd176c'; file='c_mode_cycle1_browser_repeat_harness.cjs'
    },
    [ordered]@{
        id='A6_THRESHOLD'; pr=25; commit='84ea9b34a7c9445a77214288556ff3230442d81e';
        path='yolla-panel-v1/v1-existing-runtime-control/cycle1-workers/a6-leak-and-repeat-harness/C_MODE_CYCLE1_LEAK_THRESHOLD_CONTRACT_V1.json';
        blob='26c30db46bc103ead553ac723469d099d714d900'; file='C_MODE_CYCLE1_LEAK_THRESHOLD_CONTRACT_V1.json'
    }
)

function Invoke-Git {
    param([string[]]$Arguments, [switch]$AllowFailure)
    $output = & git -C $RepositoryRoot @Arguments 2>&1
    $code = $LASTEXITCODE
    if ($code -ne 0 -and -not $AllowFailure) {
        throw "GIT_FAILED_${code}:$($Arguments -join ' '):$($output -join [Environment]::NewLine)"
    }
    [pscustomobject]@{ ExitCode=$code; Output=@($output) }
}

function Ensure-Commit {
    param([string]$Commit, [int]$Pr)
    $probe = Invoke-Git @('cat-file','-e',"$Commit`^{commit}") -AllowFailure
    if ($probe.ExitCode -eq 0) { return }
    if ($SkipGitFetch) { throw "COMMIT_NOT_LOCAL_AND_FETCH_DISABLED:$Commit" }
    $fetch = Invoke-Git @('fetch','--no-tags','origin',$Commit) -AllowFailure
    if ($fetch.ExitCode -ne 0) {
        [void](Invoke-Git @('fetch','--no-tags','origin',"+refs/pull/$Pr/head:refs/remotes/origin/a7-repair-pr$Pr"))
    }
    [void](Invoke-Git @('cat-file','-e',"$Commit`^{commit}"))
}

function Export-GitBlobExact {
    param([System.Collections.IDictionary]$Source, [string]$Destination)
    Ensure-Commit $Source.commit $Source.pr
    $spec = "$($Source.commit):$($Source.path)"
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = 'git.exe'
    $psi.Arguments = "-C `"$RepositoryRoot`" cat-file blob `"$spec`""
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $psi
    if (-not $process.Start()) { throw "GIT_BLOB_EXPORT_START_FAILED:$($Source.id)" }
    $file = [System.IO.File]::Open($Destination,[System.IO.FileMode]::Create,[System.IO.FileAccess]::Write)
    try { $process.StandardOutput.BaseStream.CopyTo($file) } finally { $file.Dispose() }
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) { throw "GIT_BLOB_EXPORT_FAILED:$($Source.id):$stderr" }
    $actual = [string]((Invoke-Git @('hash-object','--',$Destination)).Output | Select-Object -Last 1)
    $actual = $actual.Trim()
    if ($actual -ne $Source.blob) {
        throw "EXACT_GIT_BLOB_BINDING_FAILED:$($Source.id):EXPECTED_$($Source.blob):ACTUAL_$actual"
    }
    [ordered]@{ id=$Source.id; commit=$Source.commit; path=$Source.path; expected_blob=$Source.blob; actual_blob=$actual; status='PASS' }
}

function Quote-NativeArgument {
    param([AllowNull()][string]$Value)
    if ($null -eq $Value) { return '""' }
    if ($Value.Contains('"')) { throw "NATIVE_ARGUMENT_CONTAINS_QUOTE:$Value" }
    if ($Value.Length -eq 0 -or $Value -match '\s') { return '"' + $Value + '"' }
    return $Value
}

function Invoke-CapturedProcess {
    param([string]$FileName,[string[]]$Arguments,[string]$StdoutPath,[string]$StderrPath,[hashtable]$Environment=@{})
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $FileName
    $psi.Arguments = (($Arguments | ForEach-Object { Quote-NativeArgument ([string]$_) }) -join ' ')
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    foreach ($key in $Environment.Keys) { $psi.EnvironmentVariables[$key] = [string]$Environment[$key] }
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $psi
    $started = [datetime]::UtcNow
    if (-not $process.Start()) { throw "PROCESS_START_FAILED:$FileName" }
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    [System.IO.File]::WriteAllText($StdoutPath,$stdout,(New-Object System.Text.UTF8Encoding($false)))
    [System.IO.File]::WriteAllText($StderrPath,$stderr,(New-Object System.Text.UTF8Encoding($false)))
    [ordered]@{ file=$FileName; exit_code=$process.ExitCode; elapsed_ms=[int]([datetime]::UtcNow-$started).TotalMilliseconds; stdout_path=$StdoutPath; stderr_path=$StderrPath }
}

function Resolve-A3RootPid {
    param([object]$Receipt,[int]$Requested)
    if ($Requested -gt 0) { return $Requested }
    $processes = @($Receipt.processes)
    $ids = @{}
    foreach ($item in $processes) { $ids[[int]$item.process_id] = $true }
    $candidates = @($processes | Where-Object {
        ($_.role -eq 'YOLLA_PANEL_OR_LAUNCHER' -or $_.role -eq 'BROWSER_MAIN') -and
        -not $ids.ContainsKey([int]$_.parent_process_id)
    })
    if ($candidates.Count -eq 1) { return [int]$candidates[0].process_id }
    return 0
}

function Test-ExpectedRuntimeVersion {
    param([object]$Receipt,[string]$Expected)
    if ([string]::IsNullOrWhiteSpace($Expected)) { return $true }
    foreach ($item in @($Receipt.processes)) {
        $fileVersion = [string]$item.executable.file_version
        $productVersion = [string]$item.executable.product_version
        if ($fileVersion -like "*$Expected*" -or $productVersion -like "*$Expected*") { return $true }
    }
    return $false
}

New-Item -ItemType Directory -Path $OutputRoot -Force | Out-Null
$tools = Join-Path $OutputRoot 'tools'
$receipts = Join-Path $OutputRoot 'receipts'
New-Item -ItemType Directory -Path $tools -Force | Out-Null
New-Item -ItemType Directory -Path $receipts -Force | Out-Null

$attempts = New-Object System.Collections.Generic.List[object]
$blockers = New-Object System.Collections.Generic.List[object]
$bindings = New-Object System.Collections.Generic.List[object]
$falseLivePassCount = 0

try {
    foreach ($source in $Sources) {
        $bindings.Add([pscustomobject](Export-GitBlobExact $source (Join-Path $tools $source.file)))
    }
    $attempts.Add([pscustomobject]@{ stage='EXACT_SOURCE_BINDING'; status='PASS'; count=$bindings.Count })
} catch {
    $blockers.Add([pscustomobject]@{ code='EXACT_GIT_BLOB_BINDING_FAILED'; detail=$_.Exception.Message })
}

$a3 = $null
$resolvedRootPid = 0
if ($blockers.Count -eq 0) {
    try {
        $a3Stdout = Join-Path $receipts 'A3_TARGET_PC_READBACK_STDOUT.json'
        $a3Stderr = Join-Path $receipts 'A3_TARGET_PC_READBACK_STDERR.txt'
        $args = @('-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $tools 'Invoke-CModeCycle1TargetPcReadback.ps1'))
        foreach ($value in $LauncherPath) { $args += @('-LauncherPath',$value) }
        if ($ReleaseRoot) { $args += @('-ReleaseRoot',$ReleaseRoot) }
        if ($StateRoot) { $args += @('-StateRoot',$StateRoot) }
        if ($BrowserProfileRoot) { $args += @('-BrowserProfileRoot',$BrowserProfileRoot) }
        $run = Invoke-CapturedProcess 'powershell.exe' $args $a3Stdout $a3Stderr
        $a3 = Get-Content $a3Stdout -Raw | ConvertFrom-Json
        if ($run.exit_code -ne 0 -or $a3.status -ne 'PASS') {
            $blockers.Add([pscustomobject]@{ code='TARGET_PC_READBACK_NOT_PASS'; detail="EXIT_$($run.exit_code)_STATUS_$($a3.status)" })
        } elseif (-not (Test-ExpectedRuntimeVersion $a3 $ExpectedActiveRuntimeVersion)) {
            $blockers.Add([pscustomobject]@{ code='ACTIVE_RUNTIME_VERSION_NOT_OBSERVED'; expected=$ExpectedActiveRuntimeVersion })
        } else {
            $resolvedRootPid = Resolve-A3RootPid $a3 $RootProcessId
            if ($resolvedRootPid -le 0) {
                $blockers.Add([pscustomobject]@{ code='ACTIVE_RUNTIME_ROOT_PID_UNRESOLVED'; detail='Supply -RootProcessId after reviewing A-3 receipt.' })
            }
        }
        $attempts.Add([pscustomobject]@{ stage='A3_TARGET_PC_READBACK'; status=$a3.status; root_process_id=$resolvedRootPid; run=$run })
    } catch {
        $blockers.Add([pscustomobject]@{ code='TARGET_PC_READBACK_NOT_PASS'; detail=$_.Exception.Message })
    }
}

$a4Results = New-Object System.Collections.Generic.List[object]
$requiredScenarios = @('PANEL_ONLY','ONE_BROWSER','CLOSE_REOPEN')
if ($resolvedRootPid -gt 0) {
    foreach ($scenario in $requiredScenarios) {
        if ($scenario -ne 'PANEL_ONLY' -and [string]::IsNullOrWhiteSpace($A4ActionScriptPath)) {
            $blockers.Add([pscustomobject]@{ code='A4_ACTION_DRIVER_REQUIRED'; scenario=$scenario; detail='Supply -A4ActionScriptPath.' })
            continue
        }
        try {
            $scenarioRoot = Join-Path $receipts "A4_$scenario"
            New-Item -ItemType Directory -Path $scenarioRoot -Force | Out-Null
            $args = @('-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $tools 'Invoke-CModeCycle1ResourceBaseline.ps1'),'-Scenario',$scenario,'-RootProcessId',[string]$resolvedRootPid,'-SampleCount',[string]$SampleCount,'-SampleIntervalMs',[string]$SampleIntervalMs,'-OutputDirectory',$scenarioRoot)
            if ($A4ActionScriptPath) { $args += @('-ActionScriptPath',$A4ActionScriptPath) }
            $run = Invoke-CapturedProcess 'powershell.exe' $args (Join-Path $scenarioRoot 'stdout.txt') (Join-Path $scenarioRoot 'stderr.txt')
            $status = if ($run.exit_code -eq 0) { 'PASS' } else { 'FAILED' }
            $a4Results.Add([pscustomobject]@{ scenario=$scenario; status=$status; sample_count=$SampleCount; run=$run })
            if ($status -ne 'PASS') { $blockers.Add([pscustomobject]@{ code='A4_LIVE_SCENARIO_FAILED'; scenario=$scenario; detail="EXIT_$($run.exit_code)" }) }
        } catch {
            $blockers.Add([pscustomobject]@{ code='A4_LIVE_SCENARIO_FAILED'; scenario=$scenario; detail=$_.Exception.Message })
        }
    }
}
$attempts.Add([pscustomobject]@{ stage='A4_RESOURCE_BASELINE'; completed_scenarios=$a4Results.Count; required_scenarios=$requiredScenarios.Count })

$a6Result = $null
if ([string]::IsNullOrWhiteSpace($A6ActionDriverPath) -or [string]::IsNullOrWhiteSpace($A6SnapshotDriverPath)) {
    $blockers.Add([pscustomobject]@{ code='A6_RUNTIME_ACTION_OR_SNAPSHOT_DRIVER_REQUIRED'; detail='Supply both driver paths. Required metrics are never synthesized.' })
} elseif ($resolvedRootPid -gt 0) {
    try {
        $bridge = Join-Path $PSScriptRoot 'target_pc_runtime_adapter.cjs'
        if (-not (Test-Path $bridge -PathType Leaf)) { throw "A7_ADAPTER_BRIDGE_NOT_FOUND:$bridge" }
        $a6Output = Join-Path $receipts 'A6_CYCLE1_TARGET_PC_BROWSER_REPEAT_RESULT_V1.json'
        $args = @((Join-Path $tools 'c_mode_cycle1_browser_repeat_harness.cjs'),'--adapter',$bridge,'--thresholds',(Join-Path $tools 'C_MODE_CYCLE1_LEAK_THRESHOLD_CONTRACT_V1.json'),'--iterations',[string]$A6Iterations,'--settle-ms',[string]$A6SettleMs,'--target','TARGET_PC_WINDOWS_10','--output',$a6Output)
        $envMap = @{ YOLLA_A7_ACTION_DRIVER=$A6ActionDriverPath; YOLLA_A7_SNAPSHOT_DRIVER=$A6SnapshotDriverPath; YOLLA_A7_ROOT_PROCESS_ID=[string]$resolvedRootPid }
        $run = Invoke-CapturedProcess 'node.exe' $args (Join-Path $receipts 'A6_STDOUT.json') (Join-Path $receipts 'A6_STDERR.txt') $envMap
        if (Test-Path $a6Output) { $a6Result = Get-Content $a6Output -Raw | ConvertFrom-Json }
        if ($run.exit_code -ne 0 -or $null -eq $a6Result -or $a6Result.evaluation.status -ne 'PASS') {
            $detail = if ($null -eq $a6Result) { "EXIT_$($run.exit_code)_NO_RESULT" } else { "EXIT_$($run.exit_code)_$($a6Result.evaluation.status)" }
            $blockers.Add([pscustomobject]@{ code='A6_REAL_ADAPTER_REPEAT_FAILED'; detail=$detail })
        }
        $attempts.Add([pscustomobject]@{ stage='A6_REAL_ADAPTER_REPEAT'; status=if($null -eq $a6Result){'NO_RESULT'}else{$a6Result.evaluation.status}; run=$run })
    } catch {
        $blockers.Add([pscustomobject]@{ code='A6_REAL_ADAPTER_REPEAT_FAILED'; detail=$_.Exception.Message })
    }
}

$cycle2Entry = $blockers.Count -eq 0 -and $null -ne $a3 -and $a3.status -eq 'PASS' -and $a4Results.Count -eq $requiredScenarios.Count -and @($a4Results | Where-Object {$_.status -ne 'PASS'}).Count -eq 0 -and $null -ne $a6Result -and $a6Result.evaluation.status -eq 'PASS' -and $falseLivePassCount -eq 0

$aggregate = [pscustomobject][ordered]@{
    schema_version='A7_C_MODE_CYCLE1_END_TO_END_REPAIR_RESULT_V1'
    task_id=$TaskId
    cycle_id=$CycleId
    completed_at_utc=[datetime]::UtcNow.ToString('o')
    target='TARGET_PC_WINDOWS_10'
    exact_source_bindings=@($bindings)
    a3=[pscustomobject]@{ status=if($null -eq $a3){'NOT_COMPLETED'}else{$a3.status}; expected_runtime_version=$ExpectedActiveRuntimeVersion; resolved_root_process_id=$resolvedRootPid }
    a4=[pscustomobject]@{ required_scenarios=$requiredScenarios; results=@($a4Results); minimum_sample_count=$SampleCount }
    a6=[pscustomobject]@{ real_adapter_requested=$true; result=if($null -eq $a6Result){'NOT_COMPLETED'}else{$a6Result.evaluation.status}; minimum_repeat_count=$A6Iterations; required_metrics_synthesized=$false }
    blockers=@($blockers)
    attempt_log=@($attempts)
    false_live_pass_count=$falseLivePassCount
    active_runtime_authority='5.10.2.3.7_LAST_VERIFIED'
    candidate_runtime_authority='5.10.2.4.3_NOT_ACTIVE'
    cycle2_entry=$cycle2Entry
    terminal=if($cycle2Entry){'A7_C_MODE_CYCLE1_REPAIR_PASS_CYCLE2_ENTRY_READY'}else{'A7_C_MODE_CYCLE1_REPAIR_EXACT_FINDINGS'}
    production=$false
    ready=$false
    merge=$false
}
$resultPath = Join-Path $OutputRoot 'A7_C_MODE_CYCLE1_END_TO_END_REPAIR_RESULT_V1.json'
$aggregate | ConvertTo-Json -Depth 20 | Set-Content $resultPath -Encoding UTF8
$aggregate | ConvertTo-Json -Depth 20
if (-not $cycle2Entry) { exit 2 }
