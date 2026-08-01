[CmdletBinding()]
param(
    [string]$PythonExe = 'python'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONLEGACYWINDOWSSTDIO = '0'

$probeCode = @'
import json
import locale
import sys
print(json.dumps({
    "utf8_mode": sys.flags.utf8_mode,
    "preferred_encoding": locale.getpreferredencoding(False),
    "stdout": sys.stdout.encoding,
}, sort_keys=True))
'@

$probe = @(& $PythonExe -X utf8 -c $probeCode 2>&1)
if ($LASTEXITCODE -ne 0 -or $probe.Count -eq 0) {
    throw ('R6_UTF8_PROBE_FAILED:' + ($probe -join [Environment]::NewLine))
}
$state = ([string]$probe[-1]) | ConvertFrom-Json
if ([int]$state.utf8_mode -ne 1) {
    throw ('R6_UTF8_MODE_NOT_ACTIVE:' + ($state | ConvertTo-Json -Compress))
}
if (([string]$state.preferred_encoding).ToLowerInvariant() -notmatch '^utf-?8$') {
    throw ('R6_PREFERRED_ENCODING_NOT_UTF8:' + ($state | ConvertTo-Json -Compress))
}

$root = Join-Path $env:TEMP ('yolla-r6-utf8-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root -Force | Out-Null
try {
    $sqlPath = Join-Path $root 'STAGING_INSERT_SCRIPT.sql'
    $sqlPathForPython = $sqlPath.Replace('\', '\\')
    $readCode = @"
from pathlib import Path
p = Path(r'$sqlPathForPython')
needle = '\uc704\ud5d8\ubb3c'
text = "-- " + needle + " knowledge fixture\nINSERT INTO staging_fixture VALUES ('" + needle + "');\n"
p.write_text(text, encoding='utf-8')
observed = p.read_text()
assert needle in observed
print('KOREAN_UTF8_SQL_READ=PASS')
"@

    $result = @(& $PythonExe -X utf8 -c $readCode 2>&1)
    if ($LASTEXITCODE -ne 0 -or $result.Count -eq 0 -or $result[-1] -ne 'KOREAN_UTF8_SQL_READ=PASS') {
        throw ('R6_KOREAN_UTF8_SQL_READ_FAILED:' + ($result -join [Environment]::NewLine))
    }

    'PYTHON_UTF8_MODE=PASS'
    'KOREAN_UTF8_SQL_READ=PASS'
    'R6_PYTHON_UTF8_POLICY=PASS'
    'PRODUCTION=false'
    'READY=false'
    'MERGE=false'
} finally {
    Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
