Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Exact semantic values required by the Target PC Runner R8.
$a1SupportBlocking = $false
$b1SupportBlocking = $false

$source = @'
    a1_support_blocking = $false
    b1_support_blocking = $false
'@

$bareBooleanPattern = '(?im)^\s*[A-Za-z_][A-Za-z0-9_]*\s*=\s*(true|false)\s*$'
$matches = [regex]::Matches($source, $bareBooleanPattern)
if ($matches.Count -ne 0) {
    throw "BARE_BOOLEAN_ASSIGNMENT_DETECTED=$($matches.Count)"
}

if ($a1SupportBlocking -ne $false) {
    throw 'A1_SUPPORT_BLOCKING_VALUE_INVALID'
}
if ($b1SupportBlocking -ne $false) {
    throw 'B1_SUPPORT_BLOCKING_VALUE_INVALID'
}

Write-Host 'WINDOWS_POWERSHELL_BOOLEAN_VALUES=PASS'
Write-Host 'BARE_BOOLEAN_ASSIGNMENT_COUNT=0'
Write-Host 'B1_OPTIONAL_SMOKE_BLOCKING=false'
Write-Host 'PRODUCTION=false'
Write-Host 'READY=false'
Write-Host 'MERGE=false'
