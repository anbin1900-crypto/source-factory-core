param(
  [string]$RepositoryRoot = (Get-Location).Path
)

$ErrorActionPreference = "Stop"

function Resolve-FullPath([string]$PathValue) {
  return [System.IO.Path]::GetFullPath($PathValue)
}

function Invoke-PythonScript([string]$ScriptPath, [string]$RootPath) {
  $py = Get-Command py -ErrorAction SilentlyContinue
  if ($py) {
    & py -3 $ScriptPath --root $RootPath
    return $LASTEXITCODE
  }

  $python = Get-Command python -ErrorAction SilentlyContinue
  if ($python) {
    & python $ScriptPath --root $RootPath
    return $LASTEXITCODE
  }

  $python3 = Get-Command python3 -ErrorAction SilentlyContinue
  if ($python3) {
    & python3 $ScriptPath --root $RootPath
    return $LASTEXITCODE
  }

  throw "Python executable not found. Tried: py -3, python, python3."
}

$root = Resolve-FullPath $RepositoryRoot
Set-Location $root

Write-Host "[EXACTLY-ONCE-V2] Repository root: $root"
Write-Host "[EXACTLY-ONCE-V2] Git pull"
git pull
if ($LASTEXITCODE -ne 0) { throw "git pull failed" }

$scriptPath = Join-Path $root "tools\source_factory_oneflow_local_exactly_once_simulator_v2.py"
if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
  throw "021B Python simulator not found: $scriptPath"
}

Write-Host "[EXACTLY-ONCE-V2] Run Python oneflow local exactly-once simulator V2"
$exitCode = Invoke-PythonScript -ScriptPath $scriptPath -RootPath $root
if ($exitCode -ne 0) { throw "021B Python oneflow local exactly-once simulator V2 failed with exit code $exitCode" }

Write-Host "[EXACTLY-ONCE-V2] Git add reports"
git add .\reports
if ($LASTEXITCODE -ne 0) { throw "git add failed" }

$changes = git status --porcelain -- reports
if ([string]::IsNullOrWhiteSpace(($changes | Out-String))) {
  Write-Host "[EXACTLY-ONCE-V2] No report changes to commit"
} else {
  Write-Host "[EXACTLY-ONCE-V2] Git commit"
  git commit -m "add oneflow local exactly once simulator V2 result"
  if ($LASTEXITCODE -ne 0) { throw "git commit failed" }

  Write-Host "[EXACTLY-ONCE-V2] Git push"
  git push
  if ($LASTEXITCODE -ne 0) { throw "git push failed" }
}

Write-Host "SOURCE_FACTORY_ONEFLOW_LOCAL_EXACTLY_ONCE_SIMULATOR_V2_AND_PUSH_COMPLETE"
Write-Host "Status=PASS_LOCAL_EXACTLY_ONCE_SIMULATOR_V2_AND_PUSH_DONE"
