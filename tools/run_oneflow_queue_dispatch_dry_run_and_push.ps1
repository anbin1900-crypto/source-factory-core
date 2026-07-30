param(
  [string]$RepositoryRoot = (Get-Location).Path
)

$ErrorActionPreference = "Stop"

function Find-PythonCommand {
  $candidates = @(
    @{ exe = "py"; args = @("-3") },
    @{ exe = "python"; args = @() },
    @{ exe = "python3"; args = @() }
  )
  foreach ($candidate in $candidates) {
    $exe = [string]$candidate.exe
    $args = @($candidate.args)
    $cmd = Get-Command $exe -ErrorAction SilentlyContinue
    if ($null -ne $cmd) {
      return @{ exe = $exe; args = $args }
    }
  }
  throw "Python executable not found. Tried: py -3, python, python3"
}

$root = (Resolve-Path -LiteralPath $RepositoryRoot).Path
Set-Location $root

Write-Host "[QUEUE-ONEFLOW] Repository root: $root"
Write-Host "[QUEUE-ONEFLOW] Git pull"
git pull
if ($LASTEXITCODE -ne 0) { throw "git pull failed: $LASTEXITCODE" }

$python = Find-PythonCommand
$scriptPath = Join-Path $root "tools\source_factory_oneflow_queue_dispatch_dry_run.py"
if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
  throw "Verifier not found: $scriptPath"
}

Write-Host "[QUEUE-ONEFLOW] Run Python queue dispatch dry-run verifier"
& $python.exe @($python.args) $scriptPath --root $root
if ($LASTEXITCODE -ne 0) { throw "Python queue dispatch dry-run verifier failed: $LASTEXITCODE" }

Write-Host "[QUEUE-ONEFLOW] Git add reports"
git add .\reports
if ($LASTEXITCODE -ne 0) { throw "git add failed: $LASTEXITCODE" }

$status = git status --short
if ([string]::IsNullOrWhiteSpace(($status | Out-String))) {
  Write-Host "[QUEUE-ONEFLOW] No report changes to commit"
} else {
  Write-Host "[QUEUE-ONEFLOW] Git commit"
  git commit -m "add oneflow queue dispatch dry run receipt"
  if ($LASTEXITCODE -ne 0) { throw "git commit failed: $LASTEXITCODE" }

  Write-Host "[QUEUE-ONEFLOW] Git push"
  git push
  if ($LASTEXITCODE -ne 0) { throw "git push failed: $LASTEXITCODE" }
}

Write-Host "SOURCE_FACTORY_ONEFLOW_QUEUE_DISPATCH_DRY_RUN_AND_PUSH_COMPLETE"
Write-Host "Status=PASS_LOCAL_QUEUE_ONEFLOW_DRY_RUN_AND_PUSH_DONE"
