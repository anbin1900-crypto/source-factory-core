param(
  [string]$RepositoryRoot = "E:\YOLLA\source-factory-core"
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
  Write-Host "[ONEFLOW-V2] $Message"
}

function Resolve-PythonCommand {
  $py = Get-Command py -ErrorAction SilentlyContinue
  if ($py -and $py.Source) {
    return [pscustomobject]@{
      Exe = $py.Source
      Args = @("-3")
      Label = "py -3"
    }
  }

  $python = Get-Command python -ErrorAction SilentlyContinue
  if ($python -and $python.Source) {
    return [pscustomobject]@{
      Exe = $python.Source
      Args = @()
      Label = "python"
    }
  }

  $python3 = Get-Command python3 -ErrorAction SilentlyContinue
  if ($python3 -and $python3.Source) {
    return [pscustomobject]@{
      Exe = $python3.Source
      Args = @()
      Label = "python3"
    }
  }

  throw "Python was not found. Install Python or ensure py/python is available in PATH."
}

$root = (Resolve-Path -LiteralPath $RepositoryRoot).Path
Set-Location $root

Write-Step "Repository root: $root"
Write-Step "Git pull"
git pull
if ($LASTEXITCODE -ne 0) { throw "git pull failed with exit code $LASTEXITCODE" }

$scriptPath = Join-Path $root "tools\source_factory_oneflow_runtime_pipeline_verify.py"
if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
  throw "Oneflow verifier not found: $scriptPath"
}

$python = Resolve-PythonCommand
Write-Step "Python command: $($python.Label) => $($python.Exe)"
Write-Step "Run Python oneflow verifier"

& $python.Exe @($python.Args + @($scriptPath, "--root", $root))
$verifyExit = $LASTEXITCODE
if ($verifyExit -ne 0) {
  throw "Python oneflow verifier failed with exit code $verifyExit"
}

Write-Step "Git status after verify"
$status = git status --short
if ($status) {
  $status | ForEach-Object { Write-Host $_ }
} else {
  Write-Step "No git changes detected after verify. Nothing to commit."
  Write-Host "SOURCE_FACTORY_ONEFLOW_RUNTIME_PIPELINE_VERIFY_AND_PUSH_V2_COMPLETE"
  Write-Host "Status=PASS_LOCAL_ONEFLOW_VERIFY_DONE_NO_NEW_CHANGES"
  exit 0
}

Write-Step "Git add reports"
git add .\reports
if ($LASTEXITCODE -ne 0) { throw "git add failed with exit code $LASTEXITCODE" }

$statusAfterAdd = git status --short
if (-not $statusAfterAdd) {
  Write-Step "No staged changes after git add. Nothing to commit."
  Write-Host "SOURCE_FACTORY_ONEFLOW_RUNTIME_PIPELINE_VERIFY_AND_PUSH_V2_COMPLETE"
  Write-Host "Status=PASS_LOCAL_ONEFLOW_VERIFY_DONE_NO_STAGED_CHANGES"
  exit 0
}

$commitMessage = "add Python oneflow runtime pipeline verify result"
Write-Step "Git commit: $commitMessage"
git commit -m $commitMessage
$commitExit = $LASTEXITCODE
if ($commitExit -ne 0) {
  throw "git commit failed with exit code $commitExit"
}

Write-Step "Git push"
git push
if ($LASTEXITCODE -ne 0) { throw "git push failed with exit code $LASTEXITCODE" }

Write-Host "SOURCE_FACTORY_ONEFLOW_RUNTIME_PIPELINE_VERIFY_AND_PUSH_V2_COMPLETE"
Write-Host "Status=PASS_LOCAL_ONEFLOW_VERIFY_AND_PUSH_DONE"
exit 0
