param(
  [string]$RepositoryRoot = "E:\YOLLA\source-factory-core",
  [string]$CommitMessage = "add Python oneflow runtime pipeline verify result"
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
  Write-Host "[ONEFLOW] $Message"
}

function Resolve-PythonCommand {
  $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
  if ($pythonCmd) {
    return @("python")
  }

  $pyCmd = Get-Command py -ErrorAction SilentlyContinue
  if ($pyCmd) {
    return @("py", "-3")
  }

  throw "Python executable not found. Install Python or add python/py to PATH."
}

$root = (Resolve-Path -LiteralPath $RepositoryRoot).Path
Set-Location $root

Write-Step "Repository root: $root"
Write-Step "Git pull"
git pull
if ($LASTEXITCODE -ne 0) { throw "git pull failed: $LASTEXITCODE" }

$scriptPath = Join-Path $root "tools\source_factory_oneflow_runtime_pipeline_verify.py"
if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
  throw "Oneflow verifier not found: $scriptPath"
}

$python = Resolve-PythonCommand
Write-Step "Run Python oneflow verifier"
if ($python.Count -eq 1) {
  & $python[0] $scriptPath --root $root
} else {
  & $python[0] $python[1] $scriptPath --root $root
}
if ($LASTEXITCODE -ne 0) { throw "oneflow verifier failed: $LASTEXITCODE" }

Write-Step "Stage reports"
git add .\reports
if ($LASTEXITCODE -ne 0) { throw "git add reports failed: $LASTEXITCODE" }

Write-Step "Check staged changes"
git diff --cached --quiet
$diffExit = $LASTEXITCODE
if ($diffExit -eq 0) {
  Write-Step "No new report changes to commit. Done."
  exit 0
}
if ($diffExit -ne 1) { throw "git diff --cached failed: $diffExit" }

Write-Step "Commit"
git commit -m $CommitMessage
if ($LASTEXITCODE -ne 0) { throw "git commit failed: $LASTEXITCODE" }

Write-Step "Push"
git push
if ($LASTEXITCODE -ne 0) { throw "git push failed: $LASTEXITCODE" }

Write-Host "SOURCE_FACTORY_ONEFLOW_RUNTIME_PIPELINE_VERIFY_AND_PUSH_COMPLETE"
Write-Host "Status=PASS_LOCAL_ONEFLOW_VERIFY_AND_PUSH_DONE"
exit 0
