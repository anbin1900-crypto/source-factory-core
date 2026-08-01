Set-StrictMode -Version Latest

function Invoke-GitProcess([string[]]$Arguments) {
    $token = [guid]::NewGuid().ToString('N')
    $stdoutPath = Join-Path $env:TEMP ('yolla-git-' + $token + '.stdout.txt')
    $stderrPath = Join-Path $env:TEMP ('yolla-git-' + $token + '.stderr.txt')
    try {
        $process = Start-Process `
            -FilePath 'git.exe' `
            -ArgumentList $Arguments `
            -NoNewWindow `
            -PassThru `
            -Wait `
            -RedirectStandardOutput $stdoutPath `
            -RedirectStandardError $stderrPath
        $stdout = if (Test-Path -LiteralPath $stdoutPath) {
            [IO.File]::ReadAllText($stdoutPath).Trim()
        } else { '' }
        $stderr = if (Test-Path -LiteralPath $stderrPath) {
            [IO.File]::ReadAllText($stderrPath).Trim()
        } else { '' }
        return [pscustomobject][ordered]@{
            exit_code = [int]$process.ExitCode
            stdout = $stdout
            stderr = $stderr
        }
    } finally {
        Remove-Item -LiteralPath $stdoutPath,$stderrPath -Force -ErrorAction SilentlyContinue
    }
}

function Git-CommitExists([string]$Commit) {
    $result = Invoke-GitProcess @(
        '-C', $Repository,
        'cat-file', '-e',
        ($Commit + '^{commit}')
    )
    return ($result.exit_code -eq 0)
}

function Git-IsShallow {
    $result = Invoke-GitProcess @(
        '-C', $Repository,
        'rev-parse', '--is-shallow-repository'
    )
    return ($result.exit_code -eq 0 -and $result.stdout.Trim().ToLowerInvariant() -eq 'true')
}

function Fetch-GitBranch([string]$Branch, [int]$Deepen = 0) {
    $arguments = New-Object System.Collections.Generic.List[string]
    foreach ($value in @('-C',$Repository,'fetch','--no-tags','--prune')) {
        $arguments.Add([string]$value)
    }
    if ($Deepen -gt 0) {
        $arguments.Add('--deepen=' + $Deepen)
    }
    $arguments.Add('origin')
    $arguments.Add($Branch)
    return Invoke-GitProcess $arguments.ToArray()
}

function Fetch-GitCommit([string]$Commit) {
    return Invoke-GitProcess @(
        '-C', $Repository,
        'fetch', '--no-tags',
        'origin', $Commit
    )
}

function Ensure-Commits([string[]]$Commits) {
    $required = @($Commits | Where-Object { $_ } | Select-Object -Unique)
    $missing = @($required | Where-Object { -not (Git-CommitExists $_) })
    if ($missing.Count -eq 0) {
        Write-Host 'EXTERNAL_GIT_FETCH_RECOVERY=NOT_REQUIRED'
        return
    }

    Write-Host ('GIT_FETCH_REQUIRED_FOR=' + ($missing -join ','))
    $branches = @(
        'followup/api-w01-contract-finalization',
        'command/d-group-domain-knowledge-db-foundation-v1',
        'command/b-group-next-integration-development-v1',
        'command/c-group-forward-development-v2'
    )

    foreach ($branch in $branches) {
        $result = Fetch-GitBranch $branch
        Write-Host ('GIT_BRANCH_FETCH branch={0} exit={1}' -f $branch,$result.exit_code)
    }

    $missing = @($required | Where-Object { -not (Git-CommitExists $_) })
    foreach ($commit in $missing) {
        $result = Fetch-GitCommit $commit
        Write-Host ('GIT_EXACT_COMMIT_FETCH commit={0} exit={1}' -f $commit,$result.exit_code)
    }

    $missing = @($required | Where-Object { -not (Git-CommitExists $_) })
    if ($missing.Count -gt 0 -and (Git-IsShallow)) {
        Write-Host 'GIT_SHALLOW_REPOSITORY_DETECTED=true'
        foreach ($branch in $branches) {
            $result = Fetch-GitBranch $branch 1024
            Write-Host ('GIT_DEEPEN_FETCH branch={0} exit={1}' -f $branch,$result.exit_code)
        }
    }

    $missing = @($required | Where-Object { -not (Git-CommitExists $_) })
    if ($missing.Count -gt 0) {
        throw ('SFPADB2_COMMIT_MISSING_AFTER_FETCH_RECOVERY:{0}' -f ($missing -join ','))
    }
    Write-Host 'EXTERNAL_GIT_FETCH_RECOVERY=PASS'
}

function Materialize-GitBlob([string]$Commit, [string]$RepoPath, [string]$ExpectedBlob, [string]$Destination) {
    $binding = Invoke-GitProcess @('-C',$Repository,'rev-parse',($Commit + ':' + $RepoPath))
    $observed = $binding.stdout.Trim()
    if ($binding.exit_code -ne 0 -or $observed -ne $ExpectedBlob) {
        throw ('SFPADB2_GIT_BLOB_BINDING_MISMATCH:path={0} expected={1} observed={2} git_error={3}' -f $RepoPath,$ExpectedBlob,$observed,$binding.stderr)
    }

    $parent = Split-Path -Parent $Destination
    if ($parent) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    $stderrPath = Join-Path $env:TEMP ('yolla-git-blob-' + [guid]::NewGuid().ToString('N') + '.stderr.txt')
    try {
        $process = Start-Process `
            -FilePath 'git.exe' `
            -ArgumentList @('-C',$Repository,'cat-file','blob',$ExpectedBlob) `
            -NoNewWindow `
            -PassThru `
            -Wait `
            -RedirectStandardOutput $Destination `
            -RedirectStandardError $stderrPath
        $gitError = if (Test-Path -LiteralPath $stderrPath) {
            [IO.File]::ReadAllText($stderrPath).Trim()
        } else { '' }
        if ($process.ExitCode -ne 0) {
            throw ('SFPADB2_GIT_CAT_FILE_FAILED:path={0} error={1}' -f $RepoPath,$gitError)
        }
    } finally {
        Remove-Item -LiteralPath $stderrPath -Force -ErrorAction SilentlyContinue
    }

    $hash = Invoke-GitProcess @('-C',$Repository,'hash-object','--no-filters','--',$Destination)
    $materializedBlob = $hash.stdout.Trim()
    if ($hash.exit_code -ne 0 -or $materializedBlob -ne $ExpectedBlob) {
        throw ('SFPADB2_MATERIALIZED_BLOB_MISMATCH:path={0} expected={1} observed={2} git_error={3}' -f $Destination,$ExpectedBlob,$materializedBlob,$hash.stderr)
    }
}
