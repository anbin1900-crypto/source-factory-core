param(
  [Parameter(Mandatory=$true)]
  [string]$StableCandidateDir,
  [Parameter(Mandatory=$false)]
  [string]$OpsCandidateDir = ""
)

$ErrorActionPreference = "Stop"

function Get-Sha256Lower {
  param([string]$Path)
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Write-Utf8NoBom {
  param([string]$Path, [string]$Text)
  $dir = Split-Path -Parent $Path
  if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Text, $enc)
}

function Normalize-PathForCsv {
  param([string]$Path)
  return ($Path -replace '\\','/')
}

function JsonEscape {
  param([string]$Value)
  if ($null -eq $Value) { return "" }
  return ($Value -replace '\\','\\' -replace '"','\"')
}

$root = (Resolve-Path -LiteralPath $StableCandidateDir).Path
if (-not (Test-Path -LiteralPath $root -PathType Container)) {
  throw "Stable candidate dir not found: $StableCandidateDir"
}

$opsRoot = ""
if ($OpsCandidateDir -and (Test-Path -LiteralPath $OpsCandidateDir -PathType Container)) {
  $opsRoot = (Resolve-Path -LiteralPath $OpsCandidateDir).Path
}

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$outRoot = Join-Path (Get-Location).Path "reports\stable_candidate_static_verify_$stamp"
New-Item -ItemType Directory -Force -Path $outRoot | Out-Null

$files = @(Get-ChildItem -LiteralPath $root -Recurse -File | Where-Object { $_.Extension -in @('.js','.py') } | Sort-Object FullName)
$rows = New-Object System.Collections.ArrayList
$pass = 0
$fail = 0
$skip = 0
$jsCount = 0
$pyCount = 0

foreach ($f in $files) {
  $status = "SKIP_UNSUPPORTED"
  $exitCode = 0
  $message = ""
  $kind = "runtime"

  if ($f.Extension -eq '.js') {
    $jsCount++
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if ($null -eq $nodeCmd) {
      $status = "FAIL_NODE_NOT_FOUND"
      $exitCode = -1
      $message = "node command not found"
    } else {
      $output = & node --check $f.FullName 2>&1
      $exitCode = $LASTEXITCODE
      $message = ($output | Out-String).Trim()
      if ($exitCode -eq 0) { $status = "PASS_NODE_CHECK" } else { $status = "FAIL_NODE_CHECK" }
    }
  } elseif ($f.Extension -eq '.py') {
    $pyCount++
    $pyCmd = Get-Command python -ErrorAction SilentlyContinue
    if ($null -eq $pyCmd) { $pyCmd = Get-Command py -ErrorAction SilentlyContinue }
    if ($null -eq $pyCmd) {
      $status = "FAIL_PYTHON_NOT_FOUND"
      $exitCode = -1
      $message = "python/py command not found"
    } else {
      $cmdName = $pyCmd.Source
      $output = & $cmdName -m py_compile $f.FullName 2>&1
      $exitCode = $LASTEXITCODE
      $message = ($output | Out-String).Trim()
      if ($exitCode -eq 0) { $status = "PASS_PY_COMPILE" } else { $status = "FAIL_PY_COMPILE" }
    }
  }

  if ($status -like 'PASS_*') { $pass++ } elseif ($status -like 'FAIL_*') { $fail++ } else { $skip++ }

  $rel = $f.FullName.Substring($root.Length).TrimStart('\','/')
  [void]$rows.Add([ordered]@{
    kind = $kind
    file_name = $f.Name
    relative_path = $rel
    full_path = $f.FullName
    extension = $f.Extension
    sha256 = Get-Sha256Lower $f.FullName
    status = $status
    exit_code = $exitCode
    message = $message
  })
}

$opsFiles = @()
if ($opsRoot) { $opsFiles = @(Get-ChildItem -LiteralPath $opsRoot -Recurse -File | Sort-Object FullName) }

$csvPath = Join-Path $outRoot "STABLE_CANDIDATE_STATIC_VERIFY_RESULTS.csv"
$jsonPath = Join-Path $outRoot "STABLE_CANDIDATE_STATIC_VERIFY_RESULTS.json"
$summaryPath = Join-Path $outRoot "STABLE_CANDIDATE_STATIC_VERIFY_SUMMARY.md"
$workerReportPath = Join-Path $outRoot "WORKER_REPORT_012.md"

$csvLines = New-Object System.Collections.ArrayList
[void]$csvLines.Add('"kind","file_name","relative_path","extension","sha256","status","exit_code","message"')
foreach ($r in $rows) {
  $line = '"{0}","{1}","{2}","{3}","{4}","{5}","{6}","{7}"' -f `
    $r.kind, ($r.file_name -replace '"','""'), (Normalize-PathForCsv $r.relative_path -replace '"','""'), $r.extension, $r.sha256, $r.status, $r.exit_code, (($r.message -replace "`r|`n", " ") -replace '"','""')
  [void]$csvLines.Add($line)
}
Write-Utf8NoBom $csvPath (($csvLines -join "`r`n") + "`r`n")

$jsonItems = New-Object System.Collections.ArrayList
foreach ($r in $rows) {
  [void]$jsonItems.Add(('    {{"kind":"{0}","file_name":"{1}","relative_path":"{2}","extension":"{3}","sha256":"{4}","status":"{5}","exit_code":{6},"message":"{7}"}}' -f `
    (JsonEscape $r.kind), (JsonEscape $r.file_name), (JsonEscape (Normalize-PathForCsv $r.relative_path)), (JsonEscape $r.extension), (JsonEscape $r.sha256), (JsonEscape $r.status), $r.exit_code, (JsonEscape $r.message)))
}
$statusFinal = if ($fail -eq 0 -and $files.Count -gt 0) { "PASS_STABLE_CANDIDATE_STATIC_VERIFY_READY_FOR_013" } else { "FAIL_STABLE_CANDIDATE_STATIC_VERIFY_BLOCKS_013" }
$jsonText = @"
{
  "schema_version": "SOURCE_FACTORY_STABLE_CANDIDATE_STATIC_VERIFY_V1",
  "generated_at": "$(Get-Date -Format o)",
  "stable_candidate_dir": "$(JsonEscape $root)",
  "ops_candidate_dir": "$(JsonEscape $opsRoot)",
  "status": "$statusFinal",
  "runtime_files": $($files.Count),
  "runtime_pass": $pass,
  "runtime_fail": $fail,
  "runtime_skip": $skip,
  "js_files": $jsCount,
  "py_files": $pyCount,
  "ops_reference_files": $($opsFiles.Count),
  "results": [
$($jsonItems -join ",`n")
  ]
}
"@
Write-Utf8NoBom $jsonPath $jsonText

$summary = @"
# Source Factory Stable Candidate Static Verify V1

generated_at: $(Get-Date -Format o)
stable_candidate_dir: $root
ops_candidate_dir: $opsRoot

## Summary

| Item | Count |
|---|---:|
| Runtime candidate files | $($files.Count) |
| Runtime PASS | $pass |
| Runtime FAIL | $fail |
| Runtime SKIP | $skip |
| JavaScript files | $jsCount |
| Python files | $pyCount |
| OPS reference files | $($opsFiles.Count) |

## Status

$statusFinal

## Policy

- JavaScript files are checked with node --check.
- Python files are checked with python -m py_compile or py -m py_compile fallback.
- OPS files are counted as references and not imported as runtime source.
- 013 final module merge may proceed only when Runtime FAIL is 0.
"@
Write-Utf8NoBom $summaryPath $summary

$worker = @"
# WORKER_REPORT_012

STATUS: $statusFinal
STABLE_CANDIDATE_DIR: $root
OPS_CANDIDATE_DIR: $opsRoot
RUNTIME_FILES: $($files.Count)
RUNTIME_PASS: $pass
RUNTIME_FAIL: $fail
RUNTIME_SKIP: $skip
JS_FILES: $jsCount
PY_FILES: $pyCount
OPS_REFERENCE_FILES: $($opsFiles.Count)
PRODUCTION_SOURCE_OVERWRITE: false
FINAL_MODULE_MERGE_PERFORMED: false
"@
Write-Utf8NoBom $workerReportPath $worker

Write-Host "SOURCE_FACTORY_STABLE_CANDIDATE_STATIC_VERIFY_V1_COMPLETE"
Write-Host "Status=$statusFinal"
Write-Host "RuntimeFiles=$($files.Count)"
Write-Host "RuntimePass=$pass"
Write-Host "RuntimeFail=$fail"
Write-Host "RuntimeSkip=$skip"
Write-Host "OpsReferenceFiles=$($opsFiles.Count)"
Write-Host "Summary=$summaryPath"

if ($fail -ne 0) { exit 2 }
exit 0
