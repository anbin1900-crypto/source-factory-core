# A-1 R7 B-1 Runtime Support Execution Source
# Exact source fragments embedded in RUN_T1A1_SOURCE_FACTORY_PC_AGENT_API_DB_INTEGRATION_V2_R7.ps1.
# The runner remains the execution artifact; this file is the committed review/CI authority.

function Invoke-CapturedProcess(
    [string]$FilePath,
    [string[]]$Arguments,
    [string]$WorkingDirectory,
    [string]$StdoutPath,
    [string]$StderrPath
) {
    foreach ($path in @($StdoutPath,$StderrPath)) {
        $parent = Split-Path -Parent $path
        if ($parent) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
        Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
    }
    $process = Start-Process `
        -FilePath $FilePath `
        -ArgumentList $Arguments `
        -WorkingDirectory $WorkingDirectory `
        -NoNewWindow `
        -PassThru `
        -Wait `
        -RedirectStandardOutput $StdoutPath `
        -RedirectStandardError $StderrPath
    $stdout = if (Test-Path -LiteralPath $StdoutPath) {
        [IO.File]::ReadAllText($StdoutPath)
    } else { '' }
    $stderr = if (Test-Path -LiteralPath $StderrPath) {
        [IO.File]::ReadAllText($StderrPath)
    } else { '' }
    return [pscustomobject][ordered]@{
        exit_code = [int]$process.ExitCode
        stdout = $stdout
        stderr = $stderr
        stdout_path = $StdoutPath
        stderr_path = $StderrPath
    }
}

# B-1 runtime support package: archive identity and materialization are blocking.
# The optional support smoke is non-blocking because the authoritative pointer
# explicitly declares a1_support_blocking=false.
$b1Root = Join-Path $authorityRoot 'b1'
foreach ($name in @('pointer','package','materializer','archive')) {
    $item = $external.b_group.$name
    Materialize-GitBlob `
        $item.commit `
        $item.path `
        $item.blob `
        (Join-Path $b1Root ([IO.Path]::GetFileName($item.path)))
}
$b1PointerPath = Join-Path $b1Root 'LATEST_B1_A1_FRONTLINE_RUNTIME_SUPPORT_POINTER_V1.json'
$b1PackagePath = Join-Path $b1Root 'B1_A1_FRONTLINE_RUNTIME_SUPPORT_PACKAGE_V1.json'
$b1ArchivePath = Join-Path $b1Root 'B1_A1_FRONTLINE_RUNTIME_SUPPORT_ARCHIVE_V1.b64'
$b1Materializer = Join-Path $b1Root 'MATERIALIZE_B1_A1_FRONTLINE_RUNTIME_SUPPORT_V1.py'
$b1Pointer = Get-Content -LiteralPath $b1PointerPath -Raw | ConvertFrom-Json
$b1Package = Get-Content -LiteralPath $b1PackagePath -Raw | ConvertFrom-Json
$b1SupportBlocking = [bool]$b1Pointer.a1_support_blocking
if ($b1SupportBlocking) {
    Fail 'SFPADB2_B1_POINTER_UNEXPECTED_BLOCKING' $b1PointerPath
}

$encodedArchive = [IO.File]::ReadAllText(
    $b1ArchivePath,
    [Text.Encoding]::ASCII
).Trim()
try {
    $decodedArchive = [Convert]::FromBase64String($encodedArchive)
} catch {
    Fail 'SFPADB2_B1_ARCHIVE_BASE64_INVALID' $_.Exception.Message
}
$expectedArchiveSize = [int64]$b1Package.integrated_delivery.archive.decoded_size_bytes
$expectedArchiveSha = [string]$b1Package.integrated_delivery.archive.decoded_sha256
if ([int64]$decodedArchive.LongLength -ne $expectedArchiveSize) {
    Fail 'SFPADB2_B1_ARCHIVE_SIZE_MISMATCH' (
        'expected={0} observed={1}' -f
        $expectedArchiveSize,
        $decodedArchive.LongLength
    )
}
$sha256 = [Security.Cryptography.SHA256]::Create()
try {
    $observedArchiveSha = (
        [BitConverter]::ToString($sha256.ComputeHash($decodedArchive))
    ).Replace('-','').ToLowerInvariant()
} finally {
    $sha256.Dispose()
}
if ($observedArchiveSha -ne $expectedArchiveSha) {
    Fail 'SFPADB2_B1_ARCHIVE_SHA256_MISMATCH' (
        'expected={0} observed={1}' -f
        $expectedArchiveSha,
        $observedArchiveSha
    )
}
Write-Host 'B1_ARCHIVE_IDENTITY=PASS'

$b1SmokeRoot = Join-Path $b1Root 'materialized'
Remove-Item -LiteralPath $b1SmokeRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $b1SmokeRoot -Force | Out-Null
$b1MaterializeResult = Invoke-CapturedProcess `
    -FilePath $PythonExe `
    -Arguments @(
        '-X','utf8',
        $b1Materializer,
        '--destination',$b1SmokeRoot
    ) `
    -WorkingDirectory $b1Root `
    -StdoutPath (Join-Path $evidenceRoot 'B1_MATERIALIZE_STDOUT.txt') `
    -StderrPath (Join-Path $evidenceRoot 'B1_MATERIALIZE_STDERR.txt')
if ($b1MaterializeResult.exit_code -ne 0) {
    Fail 'SFPADB2_B1_MATERIALIZATION_FAILED' (
        'exit={0} stdout={1} stderr={2}' -f
        $b1MaterializeResult.exit_code,
        $b1MaterializeResult.stdout,
        $b1MaterializeResult.stderr
    )
}

$expectedEmbeddedFileCount = [int]$b1Package.integrated_delivery.archive.embedded_file_count
$observedEmbeddedFileCount = @(
    Get-ChildItem -LiteralPath $b1SmokeRoot -File -Recurse
).Count
if ($observedEmbeddedFileCount -ne $expectedEmbeddedFileCount) {
    Fail 'SFPADB2_B1_MATERIALIZED_FILE_COUNT_MISMATCH' (
        'expected={0} observed={1}' -f
        $expectedEmbeddedFileCount,
        $observedEmbeddedFileCount
    )
}
$b1SmokeScript = Join-Path $b1SmokeRoot 'ONE_COMMAND_SMOKE.py'
if (-not (Test-Path -LiteralPath $b1SmokeScript -PathType Leaf)) {
    Fail 'SFPADB2_B1_SMOKE_SCRIPT_MISSING' $b1SmokeScript
}
Write-Host ('B1_MATERIALIZED_FILE_COUNT=' + $observedEmbeddedFileCount)
Write-Host 'B1_RUNTIME_SUPPORT_MATERIALIZATION=PASS'

$b1SmokeReceipt = Join-Path $b1SmokeRoot 'SMOKE_RESULT.json'
$b1SmokeResult = Invoke-CapturedProcess `
    -FilePath $PythonExe `
    -Arguments @(
        '-X','utf8',
        $b1SmokeScript,
        '--root',$b1SmokeRoot,
        '--output',$b1SmokeReceipt
    ) `
    -WorkingDirectory $b1SmokeRoot `
    -StdoutPath (Join-Path $evidenceRoot 'B1_SMOKE_STDOUT.txt') `
    -StderrPath (Join-Path $evidenceRoot 'B1_SMOKE_STDERR.txt')

$b1SmokeStatus = 'PASS'
if (
    $b1SmokeResult.exit_code -ne 0 -or
    -not (Test-Path -LiteralPath $b1SmokeReceipt -PathType Leaf)
) {
    $b1SmokeStatus = 'NONBLOCKING_FAIL'
    $b1NonblockingFailure = [ordered]@{
        schema_version = 'YOLLA_B1_RUNTIME_SUPPORT_NONBLOCKING_FAILURE_V1'
        status = $b1SmokeStatus
        a1_support_blocking = false
        exit_code = $b1SmokeResult.exit_code
        stdout = $b1SmokeResult.stdout
        stderr = $b1SmokeResult.stderr
        materialization = 'PASS'
        archive_identity = 'PASS'
        expected_embedded_file_count = $expectedEmbeddedFileCount
        observed_embedded_file_count = $observedEmbeddedFileCount
        next_action = 'CONTINUE_A1_INTEGRATION_WITH_A1_NATIVE_RUNNER_AND_PRESERVE_B1_LOGS'
    }
    Write-JsonNoBom `
        (Join-Path $evidenceRoot 'B1_RUNTIME_SUPPORT_NONBLOCKING_FAILURE.json') `
        $b1NonblockingFailure
    Write-Warning (
        'B1_RUNTIME_SUPPORT_SMOKE_NONBLOCKING_FAIL exit={0}; logs={1},{2}' -f
        $b1SmokeResult.exit_code,
        $b1SmokeResult.stdout_path,
        $b1SmokeResult.stderr_path
    )
} else {
    try {
        $b1SmokeReceiptObject = Get-Content -LiteralPath $b1SmokeReceipt -Raw | ConvertFrom-Json
        Write-JsonNoBom `
            (Join-Path $evidenceRoot 'B1_SMOKE_RECEIPT.json') `
            $b1SmokeReceiptObject
    } catch {
        Fail 'SFPADB2_B1_SMOKE_RECEIPT_INVALID_JSON' $_.Exception.Message
    }
}
Write-Host ('B1_RUNTIME_SUPPORT_SMOKE=' + $b1SmokeStatus)
Write-Host 'B1_SUPPORT_BLOCKING=false'
