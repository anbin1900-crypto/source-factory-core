[CmdletBinding()]
param(
    [string]$PythonExe = 'python'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONLEGACYWINDOWSSTDIO = '0'

function Invoke-PythonUtf8Script {
    param(
        [Parameter(Mandatory=$true)][string]$Root,
        [Parameter(Mandatory=$true)][string]$Name,
        [Parameter(Mandatory=$true)][string]$Content
    )

    $scriptPath = Join-Path $Root ($Name + '.py')
    $stdoutPath = Join-Path $Root ($Name + '.stdout.txt')
    $stderrPath = Join-Path $Root ($Name + '.stderr.txt')
    Set-Content -LiteralPath $scriptPath -Value $Content -Encoding ASCII

    $process = Start-Process `
        -FilePath $PythonExe `
        -ArgumentList @('-X','utf8',$scriptPath) `
        -NoNewWindow `
        -PassThru `
        -Wait `
        -RedirectStandardOutput $stdoutPath `
        -RedirectStandardError $stderrPath

    $stdout = if (Test-Path -LiteralPath $stdoutPath) {
        [IO.File]::ReadAllText($stdoutPath).Trim()
    } else { '' }
    $stderr = if (Test-Path -LiteralPath $stderrPath) {
        [IO.File]::ReadAllText($stderrPath).Trim()
    } else { '' }

    return [pscustomobject][ordered]@{
        exit_code = [int]$process.ExitCode
        stdout = $stdout
        stderr = $stderr
    }
}

$root = Join-Path $env:TEMP ('yolla-r6-utf8-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root -Force | Out-Null
try {
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
    $probe = Invoke-PythonUtf8Script -Root $root -Name 'probe' -Content $probeCode
    if ($probe.exit_code -ne 0 -or [string]::IsNullOrWhiteSpace($probe.stdout)) {
        throw ('R6_UTF8_PROBE_FAILED:' + $probe.stderr)
    }
    $state = $probe.stdout | ConvertFrom-Json
    if ([int]$state.utf8_mode -ne 1) {
        throw ('R6_UTF8_MODE_NOT_ACTIVE:' + ($state | ConvertTo-Json -Compress))
    }
    if (([string]$state.preferred_encoding).ToLowerInvariant() -notmatch '^utf-?8$') {
        throw ('R6_PREFERRED_ENCODING_NOT_UTF8:' + ($state | ConvertTo-Json -Compress))
    }

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
    $read = Invoke-PythonUtf8Script -Root $root -Name 'read_utf8_sql' -Content $readCode
    if ($read.exit_code -ne 0 -or $read.stdout -ne 'KOREAN_UTF8_SQL_READ=PASS') {
        throw ('R6_KOREAN_UTF8_SQL_READ_FAILED:' + $read.stderr + ':' + $read.stdout)
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
