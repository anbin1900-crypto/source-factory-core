param([ValidateSet("install","verify","self-test","run-sample","rollback")][string]$Action="self-test")
$ErrorActionPreference="Stop"
$Python=(Get-Command python -ErrorAction Stop).Source
& $Python (Join-Path $PSScriptRoot "bootstrap.py") $Action
exit $LASTEXITCODE
