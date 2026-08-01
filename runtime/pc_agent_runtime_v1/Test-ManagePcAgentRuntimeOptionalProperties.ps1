[CmdletBinding()]
param(
    [string]$ManagerPath = (Join-Path $PSScriptRoot 'Manage-PcAgentRuntime.ps1')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-JsonNoBom([string]$Path,[object]$Value){
    $parent=Split-Path -Parent $Path
    if($parent){New-Item -ItemType Directory -Path $parent -Force|Out-Null}
    [IO.File]::WriteAllText(
        $Path,
        (($Value|ConvertTo-Json -Depth 50)+[Environment]::NewLine),
        (New-Object System.Text.UTF8Encoding($false))
    )
}

if($PSVersionTable.PSEdition-ne'Desktop'-or$PSVersionTable.PSVersion.Major-ne5-or$PSVersionTable.PSVersion.Minor-ne1){
    throw ('WINDOWS_POWERSHELL_51_REQUIRED actual='+$PSVersionTable.PSVersion)
}
if(-not(Test-Path -LiteralPath $ManagerPath -PathType Leaf)){throw ('MANAGER_MISSING='+$ManagerPath)}

$root=Join-Path $env:RUNNER_TEMP ('pc-agent-manager-status-'+[guid]::NewGuid().ToString('N'))
$installRoot=Join-Path $root 'install'
$stateRoot=Join-Path $root 'state'
$bridgeRoot=Join-Path $root 'bridge'
$configRoot=Join-Path $installRoot 'config'
New-Item -ItemType Directory -Path $installRoot,$stateRoot,$bridgeRoot,$configRoot -Force|Out-Null

$installedManager=Join-Path $installRoot 'Manage-PcAgentRuntime.ps1'
Copy-Item -LiteralPath $ManagerPath -Destination $installedManager -Force
$configPath=Join-Path $configRoot 'runtime.json'
$currentPath=Join-Path $installRoot 'current.json'
$now=[DateTimeOffset]::UtcNow.ToString('o')

Write-JsonNoBom $configPath ([ordered]@{
    install_root=$installRoot
    state_root=$stateRoot
    bridge_root=$bridgeRoot
    python_exe='C:\missing\python.exe'
    supervisor_path='C:\missing\pc_agent_runtime_supervisor.py'
    worker_path='C:\missing\pc_agent_bridge_worker.py'
})
Write-JsonNoBom $currentPath ([ordered]@{
    version='1.0.0-20260802'
    config_path=$configPath
})

Write-JsonNoBom (Join-Path $stateRoot 'runtime\status.json') ([ordered]@{
    schema_version='PARTIAL_RUNTIME_STATUS_FIXTURE'
})
Write-JsonNoBom (Join-Path $stateRoot 'runtime\supervisor-heartbeat.json') ([ordered]@{
    updated_at=$now
})
Write-JsonNoBom (Join-Path $bridgeRoot 'runtime\heartbeat.json') ([ordered]@{
    updated_at=$now
})

$stdout=Join-Path $root 'status.stdout.txt'
$stderr=Join-Path $root 'status.stderr.txt'
$process=Start-Process -FilePath 'powershell.exe' -ArgumentList @(
    '-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$installedManager+'"'),
    '-Command','status','-InstallRoot',('"'+$installRoot+'"'),
    '-TaskName',('PC-Agent-Status-Regression-'+[guid]::NewGuid().ToString('N'))
) -NoNewWindow -PassThru -Wait -RedirectStandardOutput $stdout -RedirectStandardError $stderr

$out=if(Test-Path -LiteralPath $stdout){[IO.File]::ReadAllText($stdout)}else{''}
$err=if(Test-Path -LiteralPath $stderr){[IO.File]::ReadAllText($stderr)}else{''}
if([int]$process.ExitCode-ne0){throw ('STATUS_EXIT_NONZERO exit={0} stdout={1} stderr={2}'-f$process.ExitCode,$out,$err)}
$status=$out|ConvertFrom-Json
if([string]$status.runtime_state-ne'UNKNOWN'){throw ('RUNTIME_STATE_FALLBACK_INVALID='+[string]$status.runtime_state)}
if([int]$status.worker_restart_count-ne0){throw ('WORKER_RESTART_FALLBACK_INVALID='+[string]$status.worker_restart_count)}
if($null-eq$status.supervisor_heartbeat_age_seconds){throw 'SUPERVISOR_UPDATED_AT_FALLBACK_MISSING'}
if($null-eq$status.worker_heartbeat_age_seconds){throw 'WORKER_UPDATED_AT_FALLBACK_MISSING'}
if([bool]$status.production-ne$false-or[bool]$status.ready-ne$false-or[bool]$status.merge-ne$false){throw 'SAFETY_BOUNDARY_INVALID'}

'PC_AGENT_MANAGER_OPTIONAL_PROPERTY_REGRESSION=PASS'
'PARTIAL_STATUS_JSON=PASS'
'UPDATED_AT_HEARTBEAT_FALLBACK=PASS'
'PRODUCTION=false'
'READY=false'
'MERGE=false'
