param(
  [string]$RepositoryRoot = (Get-Location).Path
)

$ErrorActionPreference = "Stop"

function Resolve-FullPath([string]$PathValue) {
  return [System.IO.Path]::GetFullPath($PathValue)
}

function Invoke-PythonFile([string]$ScriptPath, [string]$RootPath) {
  $commands = @(
    @{ Exe = "py"; Args = @("-3", $ScriptPath, "--root", $RootPath) },
    @{ Exe = "python"; Args = @($ScriptPath, "--root", $RootPath) },
    @{ Exe = "python3"; Args = @($ScriptPath, "--root", $RootPath) }
  )

  foreach ($cmd in $commands) {
    $found = Get-Command $cmd.Exe -ErrorAction SilentlyContinue
    if ($found) {
      & $cmd.Exe @($cmd.Args)
      return [int]$LASTEXITCODE
    }
  }

  throw "Python executable not found. Tried: py -3, python, python3."
}

$root = Resolve-FullPath $RepositoryRoot
Set-Location $root

Write-Host "[EXACTLY-ONCE] Repository root: $root"
Write-Host "[EXACTLY-ONCE] Git pull"
git pull
if ($LASTEXITCODE -ne 0) { throw "git pull failed" }

$scriptPath = Join-Path $root "tools\source_factory_oneflow_local_exactly_once_simulator.py"
if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
  throw "021 Python simulator not found: $scriptPath"
}

Write-Host "[EXACTLY-ONCE] Run Python oneflow local exactly-once simulator"
$exitCode = Invoke-PythonFile -ScriptPath $scriptPath -RootPath $root
if ([int]$exitCode -ne 0) { throw "021 Python oneflow local exactly-once simulator failed with exit code $exitCode" }

Write-Host "[EXACTLY-ONCE] Git add reports"
git add .\reports
if ($LASTEXITCODE -ne 0) { throw "git add failed" }

$changes = git status --porcelain -- reports
if ([string]::IsNullOrWhiteSpace(($changes | Out-String))) {
  Write-Host "[EXACTLY-ONCE] No report changes to commit"
} else {
  Write-Host "[EXACTLY-ONCE] Git commit"
  git commit -m "add oneflow local exactly once simulation result"
  if ($LASTEXITCODE -ne 0) { throw "git commit failed" }

  Write-Host "[EXACTLY-ONCE] Git push"
  git push
  if ($LASTEXITCODE -ne 0) { throw "git push failed" }
}

Write-Host "SOURCE_FACTORY_ONEFLOW_LOCAL_EXACTLY_ONCE_SIMULATOR_AND_PUSH_COMPLETE"
Write-Host "Status=PASS_LOCAL_EXACTLY_ONCE_SIMULATOR_AND_PUSH_DONE"
