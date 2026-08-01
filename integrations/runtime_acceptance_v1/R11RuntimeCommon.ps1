function Fail([string]$Code, [string]$Message) {
    throw ('{0}:{1}' -f $Code, $Message)
}

function Write-JsonNoBom([string]$Path, [object]$Value) {
    $parent = Split-Path -Parent $Path
    if ($parent) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText(
        $Path,
        ($Value | ConvertTo-Json -Depth 100),
        $utf8
    )
}

function Sha256([string]$Path) {
    return (
        Get-FileHash -LiteralPath $Path -Algorithm SHA256
    ).Hash.ToLowerInvariant()
}

function Resolve-CommandPath([string]$Name) {
    $command = Get-Command $Name -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($null -eq $command) { return $null }
    return $command.Source
}

function Quote-ProcessArgument([string]$Value) {
    if ($null -eq $Value) { return '""' }
    $text = [string]$Value
    if ($text -notmatch '[\s"]') { return $text }
    return '"' + $text.Replace('"', '\"') + '"'
}

function Wait-Condition(
    [scriptblock]$Condition,
    [int]$TimeoutSeconds,
    [string]$Description
) {
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds($TimeoutSeconds)
    do {
        $value = & $Condition
        if ($value) { return $value }
        Start-Sleep -Milliseconds 200
    } while ([DateTimeOffset]::UtcNow -lt $deadline)
    Fail 'R11001_WAIT_TIMEOUT' $Description
}

function Get-CimProcessSnapshot {
    return @(
        Get-CimInstance Win32_Process |
        Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine,CreationDate
    )
}

function Get-DescendantProcessIds(
    [object[]]$Processes,
    [int[]]$RootProcessIds
) {
    $result = New-Object System.Collections.Generic.HashSet[int]
    $frontier = New-Object System.Collections.Generic.List[int]
    foreach ($id in $RootProcessIds) {
        [void]$result.Add([int]$id)
        $frontier.Add([int]$id)
    }
    $index = 0
    while ($index -lt $frontier.Count) {
        $parent = $frontier[$index]
        $index += 1
        foreach ($process in $Processes) {
            if (
                [int]$process.ParentProcessId -eq $parent -and
                -not $result.Contains([int]$process.ProcessId)
            ) {
                [void]$result.Add([int]$process.ProcessId)
                $frontier.Add([int]$process.ProcessId)
            }
        }
    }
    return @($result | ForEach-Object { $_ })
}

function Get-RuntimeSnapshot([int[]]$LauncherProcessIds) {
    $processes = Get-CimProcessSnapshot
    $descendants = if ($LauncherProcessIds.Count -gt 0) {
        Get-DescendantProcessIds $processes $LauncherProcessIds
    } else { @() }

    $workerPattern = [regex]::Escape(
        (Join-Path $BridgeInstallRoot 'pc_agent_bridge_worker.py')
    )
    $bridgePattern = [regex]::Escape($BridgeRoot)
    $activePattern = [regex]::Escape($ActiveCoreRoot)

    $workers = @(
        $processes | Where-Object {
            $_.CommandLine -and
            $_.CommandLine -match $workerPattern -and
            $_.CommandLine -match $bridgePattern
        }
    )
    $electrons = @(
        $processes | Where-Object {
            $isElectron = $_.Name -ieq 'electron.exe'
            $pathMatch = $_.CommandLine -and (
                $_.CommandLine -match $activePattern -or
                $_.CommandLine -match 'safe_panel_main\.js'
            )
            $descendantMatch = $descendants -contains [int]$_.ProcessId
            $isElectron -and ($pathMatch -or $descendantMatch)
        }
    )
    $launchers = @(
        $processes | Where-Object {
            $LauncherProcessIds -contains [int]$_.ProcessId
        }
    )
    return [pscustomobject][ordered]@{
        observed_at = [DateTimeOffset]::UtcNow.ToString('o')
        launcher_processes = $launchers
        worker_processes = $workers
        electron_processes = $electrons
        descendant_process_ids = $descendants
    }
}

function Assert-NoExistingRuntime {
    $snapshot = Get-RuntimeSnapshot @()
    if (
        $snapshot.worker_processes.Count -ne 0 -or
        $snapshot.electron_processes.Count -ne 0
    ) {
        Write-JsonNoBom (
            Join-Path $evidenceRoot 'EXISTING_RUNTIME_PROCESSES.json'
        ) $snapshot
        Fail 'R11002_EXISTING_RUNTIME_PROCESS' (
            'workers={0} electrons={1} evidence={2}' -f
            $snapshot.worker_processes.Count,
            $snapshot.electron_processes.Count,
            (Join-Path $evidenceRoot 'EXISTING_RUNTIME_PROCESSES.json')
        )
    }
}

function Write-StopRequest([string]$Reason) {
    $controlRoot = Join-Path $BridgeRoot 'control'
    New-Item -ItemType Directory -Path $controlRoot -Force | Out-Null
    Remove-Item -LiteralPath (
        Join-Path $controlRoot 'stop.ack.json'
    ) -Force -ErrorAction SilentlyContinue
    Write-JsonNoBom (
        Join-Path $controlRoot 'stop.request'
    ) ([ordered]@{
        schema_version = 'YOLLA_R11_WORKER_STOP_REQUEST_V1'
        reason = $Reason
        requested_at = [DateTimeOffset]::UtcNow.ToString('o')
        production = $false
    })
}

function Stop-Runtime(
    [int[]]$LauncherProcessIds,
    [string]$Reason,
    [int]$TimeoutSeconds = 30
) {
    $before = Get-RuntimeSnapshot $LauncherProcessIds
    $forcedElectron = New-Object System.Collections.Generic.List[int]
    $forcedLauncher = New-Object System.Collections.Generic.List[int]

    if ($before.worker_processes.Count -gt 0) {
        Write-StopRequest $Reason
        Wait-Condition {
            $snapshot = Get-RuntimeSnapshot $LauncherProcessIds
            if ($snapshot.worker_processes.Count -eq 0) {
                return $snapshot
            }
            return $null
        } $TimeoutSeconds 'PC_AGENT_WORKER_GRACEFUL_STOP' | Out-Null
    }

    $snapshot = Get-RuntimeSnapshot $LauncherProcessIds
    $mainCandidates = @(
        $snapshot.electron_processes |
        ForEach-Object {
            Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
        } |
        Where-Object { $null -ne $_ -and $_.MainWindowHandle -ne 0 }
    )
    foreach ($process in $mainCandidates) {
        [void]$process.CloseMainWindow()
    }

    if ($snapshot.electron_processes.Count -gt 0) {
        $deadline = [DateTimeOffset]::UtcNow.AddSeconds($TimeoutSeconds)
        do {
            Start-Sleep -Milliseconds 300
            $current = Get-RuntimeSnapshot $LauncherProcessIds
            if ($current.electron_processes.Count -eq 0) { break }
        } while ([DateTimeOffset]::UtcNow -lt $deadline)
    }

    $remaining = Get-RuntimeSnapshot $LauncherProcessIds
    if ($remaining.electron_processes.Count -gt 0) {
        foreach ($process in $remaining.electron_processes) {
            Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
            $forcedElectron.Add([int]$process.ProcessId)
        }
    }

    foreach ($id in $LauncherProcessIds) {
        $process = Get-Process -Id $id -ErrorAction SilentlyContinue
        if ($process) {
            try {
                if (-not $process.HasExited) {
                    [void]$process.CloseMainWindow()
                    if (-not $process.WaitForExit(5000)) {
                        Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
                        $forcedLauncher.Add([int]$id)
                    }
                }
            } catch {
                Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
                $forcedLauncher.Add([int]$id)
            }
        }
    }

    Start-Sleep -Seconds 2
    $after = Get-RuntimeSnapshot @()
    $receipt = [ordered]@{
        schema_version = 'YOLLA_R11_RUNTIME_STOP_RECEIPT_V1'
        reason = $Reason
        before = $before
        after = $after
        worker_graceful_stop = ($before.worker_processes.Count -eq 0 -or $after.worker_processes.Count -eq 0)
        forced_electron_process_ids = @($forcedElectron)
        forced_electron_process_count = $forcedElectron.Count
        forced_launcher_process_ids = @($forcedLauncher)
        forced_launcher_process_count = $forcedLauncher.Count
        worker_orphan_count = $after.worker_processes.Count
        electron_orphan_count = $after.electron_processes.Count
        stopped_at = [DateTimeOffset]::UtcNow.ToString('o')
        production = $false
    }
    Write-JsonNoBom (
        Join-Path $evidenceRoot ('STOP_' + $Reason + '.json')
    ) $receipt

    if (
        $after.worker_processes.Count -ne 0 -or
        $after.electron_processes.Count -ne 0
    ) {
        Fail 'R11003_ORPHAN_PROCESS_REMAINS' (
            'reason={0} workers={1} electrons={2}' -f
            $Reason,
            $after.worker_processes.Count,
            $after.electron_processes.Count
        )
    }
    if ($forcedElectron.Count -ne 0) {
        Fail 'R11003A_ELECTRON_GRACEFUL_STOP_FAILED' (
            'reason={0} forced_electron_count={1} evidence={2}' -f
            $Reason,
            $forcedElectron.Count,
            (Join-Path $evidenceRoot ('STOP_' + $Reason + '.json'))
        )
    }
    return $receipt
}

function Start-Runtime([string]$Phase) {
    $controlRoot = Join-Path $BridgeRoot 'control'
    New-Item -ItemType Directory -Path $controlRoot -Force | Out-Null
    Remove-Item -LiteralPath (
        Join-Path $controlRoot 'stop.request'
    ) -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath (
        Join-Path $controlRoot 'stop.ack.json'
    ) -Force -ErrorAction SilentlyContinue

    $argumentLine = '/d /s /c ""{0}""' -f $launcher
    $process = Start-Process `
        -FilePath 'cmd.exe' `
        -ArgumentList $argumentLine `
        -WorkingDirectory $ActiveCoreRoot `
        -PassThru

    $launcherIds = @([int]$process.Id)
    $snapshot = Wait-Condition {
        $current = Get-RuntimeSnapshot $launcherIds
        $heartbeatPath = Join-Path $BridgeRoot 'runtime\heartbeat.json'
        if (
            $current.worker_processes.Count -eq 1 -and
            $current.electron_processes.Count -ge 1 -and
            (Test-Path -LiteralPath $heartbeatPath -PathType Leaf)
        ) {
            try {
                $heartbeat = Get-Content -LiteralPath $heartbeatPath -Raw |
                    ConvertFrom-Json
                if (
                    $heartbeat.state -eq 'RUNNING' -and
                    [int]$heartbeat.pid -eq
                        [int]$current.worker_processes[0].ProcessId
                ) {
                    return $current
                }
            } catch {
                return $null
            }
        }
        return $null
    } $StartupTimeoutSeconds ('RUNTIME_START_' + $Phase)

    Write-JsonNoBom (
        Join-Path $evidenceRoot ('START_' + $Phase + '.json')
    ) $snapshot

    Write-Host ('R11_RUNTIME_PHASE=' + $Phase)
    Write-Host ('R11_WORKER_PROCESS_COUNT=' + $snapshot.worker_processes.Count)
    Write-Host ('R11_ELECTRON_PROCESS_COUNT=' + $snapshot.electron_processes.Count)
    Write-Host 'R11_RUNTIME_START=PASS'
    return [pscustomobject][ordered]@{
        launcher_process_ids = $launcherIds
        snapshot = $snapshot
    }
}

function Invoke-CapturedProcess(
    [string]$FilePath,
    [string[]]$Arguments,
    [string]$WorkingDirectory,
    [string]$StdoutPath,
    [string]$StderrPath
) {
    Remove-Item -LiteralPath $StdoutPath,$StderrPath `
        -Force -ErrorAction SilentlyContinue
    $argumentLine = @(
        $Arguments | ForEach-Object {
            Quote-ProcessArgument ([string]$_)
        }
    ) -join ' '
    $process = Start-Process `
        -FilePath $FilePath `
        -ArgumentList $argumentLine `
        -WorkingDirectory $WorkingDirectory `
        -NoNewWindow `
        -PassThru `
        -Wait `
        -RedirectStandardOutput $StdoutPath `
        -RedirectStandardError $StderrPath
    return [pscustomobject][ordered]@{
        exit_code = [int]$process.ExitCode
        stdout = if (Test-Path -LiteralPath $StdoutPath) {
            [IO.File]::ReadAllText($StdoutPath, [Text.Encoding]::UTF8)
        } else { '' }
        stderr = if (Test-Path -LiteralPath $StderrPath) {
            [IO.File]::ReadAllText($StderrPath, [Text.Encoding]::UTF8)
        } else { '' }
        stdout_path = $StdoutPath
        stderr_path = $StderrPath
    }
}
