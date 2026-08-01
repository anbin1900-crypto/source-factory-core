[CmdletBinding()]
param(
  [string]$OldRepoRoot = "D:\SOURCE FACTORY\source-factory-core",
  [string]$CompactSourceRoot = "D:\SOURCE FACTORY\_CONSTITUTION_V2_COMPACT",
  [string]$NewRoot = "D:\SOURCE FACTORY\source-factory-active-core"
)
$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0

$task = "SF_028_COMPACT_CONSTITUTION_AND_RULES_MIGRATION"
$worker = "SLOT_04_SF028_COMPACT_CONSTITUTION_AND_RULES_MIGRATION_WORKER"
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$required = @(
  "00_AI_SUPER_BOOT_v2_1_2_COMPACT.md",
  "01_COMPACT_RULE_SCHEMA_v2_1_2.json",
  "02_WORKER_COMMANDER_CONTRACTS_COMPACT_v2_1_2.md",
  "03_STAGE4_AUTOMATION_CONTRACT_COMPACT_v2_1_2.md",
  "04_COMPACT_INSTALL_AND_REFERENCE_MAP_v2_1_2.json",
  "FINAL_COMPACT_MANIFEST_v2_1_2.json",
  "V2_1_2_COMPACT_UPDATE_REPORT.md"
)
$expectedOrder = @("00_AI_SUPER_BOOT_v2_1_2_COMPACT.md", "01_COMPACT_RULE_SCHEMA_v2_1_2.json")

function Write-Utf8([string]$Path, [string]$Text) {
  $parent = Split-Path -Parent $Path
  if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Text, $utf8)
}
function Read-Json([string]$Path) {
  try { return @{ status = "PASS"; value = ((Get-Content -LiteralPath $Path -Raw -Encoding UTF8) | ConvertFrom-Json); error = "" } }
  catch { return @{ status = "FAIL"; value = $null; error = $_.Exception.Message } }
}

foreach ($path in @($OldRepoRoot, $CompactSourceRoot)) {
  if (-not (Test-Path -LiteralPath $path -PathType Container)) { throw ("Required directory missing: {0}" -f $path) }
}
foreach ($name in $required) {
  if (-not (Test-Path -LiteralPath (Join-Path $CompactSourceRoot $name) -PathType Leaf)) { throw ("Required compact file missing: {0}" -f $name) }
}

$newCompact = Join-Path $NewRoot "_CONSTITUTION_V2_COMPACT"
$newRules = Join-Path $NewRoot "rules\powershell51"
$newState = Join-Path $NewRoot "state"
$oldState = Join-Path $OldRepoRoot "state"
$oldReport = Join-Path $OldRepoRoot ("reports\sf028_slot04_compact_constitution_{0}" -f $stamp)
foreach ($dir in @($newCompact, $newState, $oldState, $oldReport)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }

$compactRecords = @()
foreach ($name in $required) {
  $src = Join-Path $CompactSourceRoot $name
  $dst = Join-Path $newCompact $name
  Copy-Item -LiteralPath $src -Destination $dst -Force
  $srcHash = (Get-FileHash -LiteralPath $src -Algorithm SHA256).Hash.ToLowerInvariant()
  $dstHash = (Get-FileHash -LiteralPath $dst -Algorithm SHA256).Hash.ToLowerInvariant()
  $compactRecords += [ordered]@{ file=$name; source_sha256=$srcHash; destination_sha256=$dstHash; match=($srcHash -eq $dstHash) }
}

$rulesRecords = @()
$skippedRules = @()
$rulesSource = Join-Path $OldRepoRoot "rules\powershell51"
$rulesStatus = "MISSING"
if (Test-Path -LiteralPath $rulesSource -PathType Container) {
  $rulesStatus = "PRESENT"
  $prefix = $rulesSource.TrimEnd("\") + "\"
  Get-ChildItem -LiteralPath $rulesSource -File -Recurse | ForEach-Object {
    $relative = $_.FullName.Substring($prefix.Length)
    $lower = $relative.ToLowerInvariant()
    $blocked = ($lower -match '(^|\\)(archive|_archive|archives|deprecated|legacy)(\\|$)') -or ($_.Extension.ToLowerInvariant() -in @('.zip','.7z','.tar','.gz','.tgz','.bz2','.bak','.old'))
    if ($blocked) { $skippedRules += [ordered]@{ relative_path=$relative; reason="CONFIG_RULE_REFERENCE_YELLOW" }; return }
    $dst = Join-Path $newRules $relative
    New-Item -ItemType Directory -Path (Split-Path -Parent $dst) -Force | Out-Null
    Copy-Item -LiteralPath $_.FullName -Destination $dst -Force
    $a = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    $b = (Get-FileHash -LiteralPath $dst -Algorithm SHA256).Hash.ToLowerInvariant()
    $rulesRecords += [ordered]@{ relative_path=$relative.Replace('\','/'); source_sha256=$a; destination_sha256=$b; match=($a -eq $b) }
  }
}

$manifest = Read-Json (Join-Path $newCompact "FINAL_COMPACT_MANIFEST_v2_1_2.json")
$schema = Read-Json (Join-Path $newCompact "01_COMPACT_RULE_SCHEMA_v2_1_2.json")
$install = Read-Json (Join-Path $newCompact "04_COMPACT_INSTALL_AND_REFERENCE_MAP_v2_1_2.json")
$manifestHashes = @()
$manifestPass = ($manifest.status -eq "PASS")
if ($manifestPass) {
  foreach ($entry in $manifest.value.files) {
    $leaf = Split-Path -Leaf ([string]$entry.path)
    $path = Join-Path $newCompact $leaf
    $actual = if (Test-Path -LiteralPath $path) { (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() } else { "MISSING" }
    $expected = ([string]$entry.sha256).ToLowerInvariant()
    $match = ($actual -eq $expected)
    if (-not $match) { $manifestPass = $false }
    $manifestHashes += [ordered]@{ file=$leaf; expected=$expected; actual=$actual; match=$match }
  }
}

$orderPass = $false
$referencePass = $false
if (($schema.status -eq "PASS") -and ($install.status -eq "PASS")) {
  $io = @($install.value.initial_read_order)
  $so = @($schema.value.initial_load_required_files)
  $orderPass = ($io.Count -eq 2 -and $so.Count -eq 2 -and $io[0] -eq $expectedOrder[0] -and $io[1] -eq $expectedOrder[1] -and $so[0] -eq $expectedOrder[0] -and $so[1] -eq $expectedOrder[1])
  $referencePass = ([string]$install.value.compression_strategy.detailed_files_are -eq "reference_only" -and @($schema.value.optional_expansion_files).Count -ge 3)
}
$copyPass = (($compactRecords | Where-Object { -not $_.match }).Count -eq 0) -and (($rulesRecords | Where-Object { -not $_.match }).Count -eq 0)
$status = "SF_028_SLOT_04_COMPACT_CONSTITUTION_COPY_PASS"
$risks = @()
if ($rulesStatus -eq "MISSING") { $status = "SF_028_SLOT_04_COMPACT_CONSTITUTION_COPY_YELLOW"; $risks += "rules/powershell51 source missing" }
if ($skippedRules.Count -gt 0) { $status = "SF_028_SLOT_04_COMPACT_CONSTITUTION_COPY_YELLOW"; $risks += "archive/deprecated rule candidates excluded" }
if (($manifest.status -ne "PASS") -or ($schema.status -ne "PASS") -or ($install.status -ne "PASS") -or (-not $manifestPass) -or (-not $copyPass) -or (-not $orderPass) -or (-not $referencePass)) { $status = "SF_028_SLOT_04_COMPACT_CONSTITUTION_COPY_FAIL" }

$report = [ordered]@{
  task_id=$task; worker_id=$worker; generated_at=(Get-Date).ToString("o")
  old_root=$OldRepoRoot; compact_source_root=$CompactSourceRoot; new_root=$NewRoot
  compact_files=$compactRecords; rules_source_status=$rulesStatus; rules_files=$rulesRecords; skipped_rule_files=$skippedRules
  json_parse=[ordered]@{ "FINAL_COMPACT_MANIFEST_v2_1_2.json"=$manifest.status; "01_COMPACT_RULE_SCHEMA_v2_1_2.json"=$schema.status; "04_COMPACT_INSTALL_AND_REFERENCE_MAP_v2_1_2.json"=$install.status }
  sha256_match=$manifestHashes; initial_read_order_preserved=$orderPass; reference_only_files_preserved=$referencePass
  old_full_archive_copied=$false; external_effect_count=0; known_risks=$risks; terminal_status=$status
}
$json = $report | ConvertTo-Json -Depth 12
$newStatePath = Join-Path $newState "SF_028_COMPACT_CONSTITUTION_COPY_REPORT.json"
$oldStatePath = Join-Path $oldState "SF_028_COMPACT_CONSTITUTION_COPY_REPORT.json"
Write-Utf8 $newStatePath $json
Write-Utf8 $oldStatePath $json

$workerReportPath = Join-Path $oldReport "WORKER_REPORT_SLOT_04.md"
$md = @"
WORKER_REPORT_START
worker_id: $worker
task_id: $task
worker_function_class: DOCS_WORKER / RUN_SCRIPT_WORKER
old_root: $OldRepoRoot
new_root: $NewRoot
compact_files_copied_count: $($compactRecords.Count)
rules_files_copied_count: $($rulesRecords.Count)
json_parse_status: manifest=$($manifest.status), schema=$($schema.status), install_map=$($install.status)
sha256_match_status: $manifestPass
initial_read_order_preserved: $orderPass
files_created:
  - $newStatePath
  - $oldStatePath
  - $workerReportPath
files_modified: []
tests_run: required files, JSON parse, SHA256, read order, reference-only, selective rules copy
tests_not_run: SLOT_05 standalone Active Core verification
forbidden_operations:
  old_archive_active_copy: NOT_RUN
  old_root_delete: NOT_RUN
  026_oneflow_verifier: NOT_RUN
  pc_agent_service: NOT_STARTED
  external_effect: 0
class_contract_status: COMPLIANT
priority_0_status: COMPLIANT
known_risks: $($risks -join '; ')
next_needed: SLOT_05_ACTIVE_CORE_STANDALONE_VERIFY
terminal_status: $status
WORKER_REPORT_END
"@
Write-Utf8 $workerReportPath $md
Write-Host ("COPY_REPORT={0}" -f $oldStatePath)
Write-Host ("WORKER_REPORT={0}" -f $workerReportPath)
Write-Host ("TERMINAL_STATUS={0}" -f $status)
if ($status -like "*FAIL") { exit 1 }
if ($status -like "*YELLOW") { exit 2 }
exit 0
