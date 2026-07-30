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

Write-Host "[CLAIM-ONEFLOW] Repository root: $root"
Write-Host "[CLAIM-ONEFLOW] Git pull"
git pull
if ($LASTEXITCODE -ne 0) { throw "git pull failed" }

$scriptPath = Join-Path $root "tools\source_factory_oneflow_queue_claim_receipt_contract.py"
if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
  throw "020 Python verifier not found: $scriptPath"
}

Write-Host "[CLAIM-ONEFLOW] Run Python oneflow claim/receipt verifier"
$exitCode = Invoke-PythonScript -ScriptPath $scriptPath -RootPath $root
if ($exitCode -ne 0) { throw "020 Python oneflow claim/receipt verifier failed with exit code $exitCode" }

Write-Host "[CLAIM-ONEFLOW] Git add reports"
git add .\reports
if ($LASTEXITCODE -ne 0) { throw "git add failed" }

$changes = git status --porcelain -- reports
if ([string]::IsNullOrWhiteSpace(($changes | Out-String))) {
  Write-Host "[CLAIM-ONEFLOW] No report changes to commit"
} else {
  Write-Host "[CLAIM-ONEFLOW] Git commit"
  git commit -m "add oneflow queue claim receipt contract result"
  if ($LASTEXITCODE -ne 0) { throw "git commit failed" }

  Write-Host "[CLAIM-ONEFLOW] Git push"
  git push
  if ($LASTEXITCODE -ne 0) { throw "git push failed" }
}

Write-Host "SOURCE_FACTORY_ONEFLOW_QUEUE_CLAIM_RECEIPT_CONTRACT_AND_PUSH_COMPLETE"
Write-Host "Status=PASS_LOCAL_QUEUE_CLAIM_RECEIPT_CONTRACT_AND_PUSH_DONE"
