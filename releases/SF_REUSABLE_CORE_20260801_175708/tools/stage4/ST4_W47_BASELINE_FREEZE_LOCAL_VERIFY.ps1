param(
[string]$Root = "D:\SOURCE FACTORY",
[string]$W47RuntimeSmokeStatus = "",
[string]$W47RuntimeSmokeSummary = "",
[switch]$JsonOnly
)

$ErrorActionPreference = "Stop"

$FreezeCandidateBaselineName = "STAGE4_PRODUCTION_BASELINE_GREEN_20260704_PLUS_W33_PROMPT_QUEUE_PATCH_PLUS_W39_TAEO_AUTOSAVE_RENDERER_PLUS_W40_TAEO_STORAGE_BINDING_PLUS_W42_COLLECTOR_EXTRACTOR_BINDING_PLUS_W43_COLLECTOR_BATCH_STORE_BINDING_PLUS_W44_GATE_ADAPTER_HELPER_PLUS_W44_GATE_ADAPTER_HANDLER_BINDING_PLUS_W45_VERSION_BINDING_PLUS_W46_EXECUTION_ASSEMBLY_REPORT_PIPELINE_SMOKE_PLUS_W47_FULL_PIPELINE_RUNTIME_SMOKE"

$RunId = "st4_w47_freeze_verify_" + (Get-Date -Format "yyyyMMdd_HHmmss")
$ReportRoot = Join-Path $Root "_STAGE4_LOGS\baseline_freeze_verify$RunId"

$Result = [ordered]@{
object_type = "ST4_W47_BASELINE_FREEZE_LOCAL_VERIFY_RESULT"
worker_id = "WORKER_W47_FREEZE_LOCAL_VERIFY_PACKAGE_01"
task_id = "ST4_W47_J_BASELINE_FREEZE_LOCAL_VERIFY_PACKAGE"
mode = "LOCAL_VERIFY_PACKAGE_ONLY_NO_FREEZE_APPLY"
run_id = $RunId
generated_at = (Get-Date).ToString("o")
root = $Root
freeze_candidate_baseline_name = $FreezeCandidateBaselineName
production_code_modified_by_this_script = $false
package_json_modified_by_this_script = $false
runtime_patch_applied_by_this_script = $false
baseline_tag_created_by_this_script = $false
checks = @()
red_blockers = @()
yellow_items = @()
green_items = @()
hash_manifest_path = ""
result_json_path = ""
result_markdown_path = ""
w47_runtime_smoke_manual_input = [ordered]@{
status = $W47RuntimeSmokeStatus
summary = $W47RuntimeSmokeSummary
required_expected_status = "GREEN_W47_FULL_PIPELINE_SMOKE_READY"
}
overall_status = "YELLOW_W47_FREEZE_VERIFY_RUN_REQUIRED"
}

function Add-Check {
param(
[string]$Name,
[string]$Status,
[string]$Detail = "",
[string]$Path = ""
)

$entry = [ordered]@{
name = $Name
status = $Status
detail = $Detail
path = $Path
}

$Result.checks += $entry

if ($Status -like "RED*") {
$Result.red_blockers += $entry
} elseif ($Status -like "YELLOW*") {
$Result.yellow_items += $entry
} else {
$Result.green_items += $entry
}
}

function Test-RequiredPath {
param(
[string]$RelativePath,
[string]$Name
)

$full = Join-Path $Root $RelativePath
if (Test-Path -LiteralPath $full) {
Add-Check -Name $Name -Status "GREEN_PATH_EXISTS" -Detail "exists" -Path $RelativePath
return $true
}

Add-Check -Name $Name -Status "RED_REQUIRED_PATH_MISSING" -Detail "missing" -Path $RelativePath
return $false
}

function Invoke-NodeCheck {
param([string]$RelativePath)

$full = Join-Path $Root $RelativePath

if (-not (Test-Path -LiteralPath $full)) {
Add-Check -Name "node --check $RelativePath" -Status "RED_NODE_CHECK_TARGET_MISSING" -Detail "target missing" -Path $RelativePath
return
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
Add-Check -Name "node --check $RelativePath" -Status "YELLOW_NODE_NOT_AVAILABLE" -Detail "node command not found" -Path $RelativePath
return
}

$process = Start-Process -FilePath "node" -ArgumentList @("--check", $full) -NoNewWindow -PassThru -Wait -RedirectStandardOutput "$env:TEMP\st4_w47_node_stdout.txt" -RedirectStandardError "$env:TEMP\st4_w47_node_stderr.txt"
$stdout = ""
$stderr = ""

if (Test-Path "$env:TEMP\st4_w47_node_stdout.txt") {
$stdout = Get-Content "$env:TEMP\st4_w47_node_stdout.txt" -Raw
}
if (Test-Path "$env:TEMP\st4_w47_node_stderr.txt") {
$stderr = Get-Content "$env:TEMP\st4_w47_node_stderr.txt" -Raw
}

if ($process.ExitCode -eq 0) {
Add-Check -Name "node --check $RelativePath" -Status "GREEN_NODE_CHECK_PASS" -Detail "exit 0" -Path $RelativePath
} else {
Add-Check -Name "node --check $RelativePath" -Status "RED_NODE_CHECK_FAIL" -Detail ("exit " + $process.ExitCode + " " + $stderr) -Path $RelativePath
}
}

function Invoke-RequireExportSmoke {
param(
[string]$RelativePath,
[string[]]$ExpectedExports
)

$full = Join-Path $Root $RelativePath

if (-not (Test-Path -LiteralPath $full)) {
Add-Check -Name "require/export $RelativePath" -Status "RED_REQUIRE_TARGET_MISSING" -Detail "target missing" -Path $RelativePath
return
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
Add-Check -Name "require/export $RelativePath" -Status "YELLOW_NODE_NOT_AVAILABLE" -Detail "node command not found" -Path $RelativePath
return
}

$exportJson = ($ExpectedExports | ConvertTo-Json -Compress)
$script = @"
const mod = require(process.argv[1]);
const expected = $exportJson;
const missing = expected.filter((name) => typeof mod[name] === 'undefined');
if (missing.length > 0) {
console.error(JSON.stringify({ ok:false, missing }));
process.exit(1);
}
console.log(JSON.stringify({ ok:true, expected }));
"@

$tmpScript = Join-Path $env:TEMP ("st4_w47_require_export_" + [guid]::NewGuid().ToString("N") + ".js")
Set-Content -LiteralPath $tmpScript -Value $script -Encoding UTF8

$process = Start-Process -FilePath "node" -ArgumentList @($tmpScript, $full) -NoNewWindow -PassThru -Wait -RedirectStandardOutput "$env:TEMP\st4_w47_require_stdout.txt" -RedirectStandardError "$env:TEMP\st4_w47_require_stderr.txt"
$stderr = ""
if (Test-Path "$env:TEMP\st4_w47_require_stderr.txt") {
$stderr = Get-Content "$env:TEMP\st4_w47_require_stderr.txt" -Raw
}

Remove-Item -LiteralPath $tmpScript -Force -ErrorAction SilentlyContinue

if ($process.ExitCode -eq 0) {
Add-Check -Name "require/export $RelativePath" -Status "GREEN_REQUIRE_EXPORT_PASS" -Detail ($ExpectedExports -join ", ") -Path $RelativePath
} else {
Add-Check -Name "require/export $RelativePath" -Status "RED_REQUIRE_EXPORT_FAIL" -Detail $stderr -Path $RelativePath
}
}

function Get-GitStatusForPath {
param([string]$RelativePath)

$git = Get-Command git -ErrorAction SilentlyContinue
if (-not $git) {
return "YELLOW_GIT_NOT_AVAILABLE"
}

Push-Location $Root
try {
$status = git status --porcelain -- "$RelativePath" 2>$null
if ([string]::IsNullOrWhiteSpace($status)) {
return "GREEN_GIT_CLEAN"
}
return "YELLOW_GIT_STATUS_PRESENT: " + ($status -replace "r?n", " | ")
} finally {
Pop-Location
}
}

try {
if (-not (Test-Path -LiteralPath $Root)) {
Add-Check -Name "root exists" -Status "RED_ROOT_MISSING" -Detail "D:\SOURCE FACTORY not accessible" -Path $Root
$Result.overall_status = "RED_W47_FREEZE_VERIFY_BLOCKED"
$Result | ConvertTo-Json -Depth 20
exit 1
}

New-Item -ItemType Directory -Path $ReportRoot -Force | Out-Null

Add-Check -Name "root exists" -Status "GREEN_ROOT_EXISTS" -Detail "root accessible" -Path $Root
Add-Check -Name "report output folder" -Status "GREEN_REPORT_FOLDER_CREATED" -Detail "verification output folder only" -Path $ReportRoot

$SafePanelFiles = @(
"safe_panel_v10\safe_panel_main.js",
"safe_panel_v10\safe_panel_preload.js",
"safe_panel_v10\safe_panel_renderer.js",
"safe_panel_v10\ipc\stage4StationBindingHandlers.js"
)

foreach ($file in $SafePanelFiles) {
Test-RequiredPath -RelativePath $file -Name "safe_panel_v10 required file $file" | Out-Null
}

$RequiredStage4Files = @(
"src\shared\stage4\promptQueueManager.js",
"src\shared\stage4\sequentialPromptSender.js",
"src\shared\stage4\promptPackageVersionManager.js",
"src\shared\stage4\stores\taeoRawOutputStore.js",
"src\shared\stage4\stores\panelRecordExecutionStore.js",
"src\shared\stage4\stores\workerOutputBatchStore.js",
"src\shared\stage4\sourceFileBlockExtractor.js",
"src\shared\stage4\workerReportErrorExtractor.js",
"src\shared\stage4\executionResultCollector.js",
"src\shared\stage4\executionErrorReporter.js",
"src\shared\stage4\collectorCommanderGateHandoffAdapter.js",
"tools\stage4\runNodeCheckWrapper.js",
"tools\stage4\runPythonWrapper.js",
"tools\stage4\runCmdWrapper.js",
"stage4_smoke\W46_EXECUTION_PIPELINE_SMOKE_CHECKLIST.md",
"stage4_smoke\W46_EXECUTION_PIPELINE_SMOKE_DEVTOOLS_OR_NODE_SCRIPT.txt",
"stage4_smoke\W47_FULL_PIPELINE_RUNTIME_SMOKE_CHECKLIST.md",
"stage4_smoke\W47_FULL_PIPELINE_RUNTIME_SMOKE_DEVTOOLS_OR_NODE_SCRIPT.txt",
"prompts\stage4\DONE_LIGHT_REPORT_GENERATOR_PROMPT.txt",
"prompts\stage4\NEXT_COMMANDER_HANDOFF_GENERATOR_PROMPT.txt"
)

foreach ($file in $RequiredStage4Files) {
Test-RequiredPath -RelativePath $file -Name "stage4 required artifact $file" | Out-Null
}

$NodeCheckTargets = @(
"safe_panel_v10\safe_panel_main.js",
"safe_panel_v10\safe_panel_preload.js",
"safe_panel_v10\safe_panel_renderer.js",
"safe_panel_v10\ipc\stage4StationBindingHandlers.js",
"src\shared\stage4\promptQueueManager.js",
"src\shared\stage4\sequentialPromptSender.js",
"src\shared\stage4\promptPackageVersionManager.js",
"src\shared\stage4\sourceFileBlockExtractor.js",
"src\shared\stage4\workerReportErrorExtractor.js",
"src\shared\stage4\executionResultCollector.js",
"src\shared\stage4\executionErrorReporter.js",
"src\shared\stage4\collectorCommanderGateHandoffAdapter.js",
"src\shared\stage4\stores\taeoRawOutputStore.js",
"src\shared\stage4\stores\panelRecordExecutionStore.js",
"src\shared\stage4\stores\workerOutputBatchStore.js",
"tools\stage4\runNodeCheckWrapper.js",
"tools\stage4\runPythonWrapper.js",
"tools\stage4\runCmdWrapper.js"
)

foreach ($file in $NodeCheckTargets) {
Invoke-NodeCheck -RelativePath $file
}

Invoke-RequireExportSmoke -RelativePath "src\shared\stage4\promptQueueManager.js" -ExpectedExports @(
"createPromptQueue",
"enqueuePrompt",
"dequeueNextPrompt",
"markPromptStatus"
)

Invoke-RequireExportSmoke -RelativePath "src\shared\stage4\sequentialPromptSender.js" -ExpectedExports @(
"buildSequentialPromptDispatch",
"getNextDispatchPayload"
)

Invoke-RequireExportSmoke -RelativePath "src\shared\stage4\promptPackageVersionManager.js" -ExpectedExports @(
"detectPromptPackageVersionBindingIssues",
"buildPromptPackageVersionBindingMetadata"
)

Invoke-RequireExportSmoke -RelativePath "src\shared\stage4\sourceFileBlockExtractor.js" -ExpectedExports @(
"extractSourceFileBlocks"
)

Invoke-RequireExportSmoke -RelativePath "src\shared\stage4\workerReportErrorExtractor.js" -ExpectedExports @(
"extractWorkerReportsAndErrors"
)

Invoke-RequireExportSmoke -RelativePath "src\shared\stage4\executionResultCollector.js" -ExpectedExports @(
"normalizeExecutionResult",
"collectExecutionResult",
"summarizeExecutionResults"
)

Invoke-RequireExportSmoke -RelativePath "src\shared\stage4\executionErrorReporter.js" -ExpectedExports @(
"buildExecutionErrorReport",
"buildRedFixHintFromExecutionError"
)

Invoke-RequireExportSmoke -RelativePath "src\shared\stage4\collectorCommanderGateHandoffAdapter.js" -ExpectedExports @(
"normalizeCollectorResponseToGateHandoff",
"buildGateRecommendation",
"buildNextCommanderAction"
)

Invoke-RequireExportSmoke -RelativePath "src\shared\stage4\stores\workerOutputBatchStore.js" -ExpectedExports @(
"createWorkerOutputBatch",
"addWorkerOutputToBatch",
"summarizeWorkerOutputBatch",
"listPendingWorkerOutputs"
)

$DoneLightPrompt = Join-Path $Root "prompts\stage4\DONE_LIGHT_REPORT_GENERATOR_PROMPT.txt"
if (Test-Path -LiteralPath $DoneLightPrompt) {
Add-Check -Name "DONE_LIGHT prompt exists" -Status "GREEN_DONE_LIGHT_PROMPT_EXISTS" -Detail "found" -Path "prompts\stage4\DONE_LIGHT_REPORT_GENERATOR_PROMPT.txt"
} else {
Add-Check -Name "DONE_LIGHT prompt exists" -Status "RED_DONE_LIGHT_PROMPT_MISSING" -Detail "missing" -Path "prompts\stage4\DONE_LIGHT_REPORT_GENERATOR_PROMPT.txt"
}

$NextHandoffPrompt = Join-Path $Root "prompts\stage4\NEXT_COMMANDER_HANDOFF_GENERATOR_PROMPT.txt"
if (Test-Path -LiteralPath $NextHandoffPrompt) {
Add-Check -Name "NEXT_COMMANDER_HANDOFF prompt exists" -Status "GREEN_NEXT_HANDOFF_PROMPT_EXISTS" -Detail "found" -Path "prompts\stage4\NEXT_COMMANDER_HANDOFF_GENERATOR_PROMPT.txt"
} else {
Add-Check -Name "NEXT_COMMANDER_HANDOFF prompt exists" -Status "RED_NEXT_HANDOFF_PROMPT_MISSING" -Detail "missing" -Path "prompts\stage4\NEXT_COMMANDER_HANDOFF_GENERATOR_PROMPT.txt"
}

$PackageJsonPath = Join-Path $Root "package.json"
if (Test-Path -LiteralPath $PackageJsonPath) {
$pkgGit = Get-GitStatusForPath -RelativePath "package.json"
if ($pkgGit -like "GREEN*") {
Add-Check -Name "package.json changed status" -Status "GREEN_PACKAGE_JSON_CLEAN" -Detail $pkgGit -Path "package.json"
} else {
Add-Check -Name "package.json changed status" -Status "YELLOW_PACKAGE_JSON_STATUS_REVIEW" -Detail $pkgGit -Path "package.json"
}
} else {
Add-Check -Name "package.json exists" -Status "YELLOW_PACKAGE_JSON_NOT_FOUND" -Detail "package.json not found; if this app does not use root package.json, ignore after Commander review" -Path "package.json"
}

$BackupCandidates = @(
"D:\SOURCE FACTORY_BACKUP",
"D:\SOURCE_FACTORY_BACKUP",
"D:\SOURCE FACTORY_BACKUP",
"D:\SOURCE FACTORY_DAILY_BACKUP",
"D:\SOURCE FACTORY\backups"
)

$ExistingBackups = @()
foreach ($backupPath in $BackupCandidates) {
if (Test-Path -LiteralPath $backupPath) {
$ExistingBackups += $backupPath
}
}

if ($ExistingBackups.Count -gt 0) {
Add-Check -Name "backup path exists" -Status "GREEN_BACKUP_PATH_FOUND" -Detail ($ExistingBackups -join " | ")
} else {
Add-Check -Name "backup path exists" -Status "YELLOW_BACKUP_PATH_REVIEW_REQUIRED" -Detail "No common backup folder found; confirm user's D: daily zip backup before freeze"
}

if ($W47RuntimeSmokeStatus -eq "GREEN_W47_FULL_PIPELINE_SMOKE_READY" -or $W47RuntimeSmokeStatus -eq "GREEN_W47_FULL_PIPELINE_RUNTIME_SMOKE") {
Add-Check -Name "W47 runtime smoke manual summary" -Status "GREEN_W47_RUNTIME_SMOKE_CONFIRMED" -Detail $W47RuntimeSmokeSummary
} elseif ([string]::IsNullOrWhiteSpace($W47RuntimeSmokeStatus)) {
Add-Check -Name "W47 runtime smoke manual summary" -Status "YELLOW_W47_RUNTIME_SMOKE_STATUS_NOT_INPUT" -Detail "Pass -W47RuntimeSmokeStatus GREEN_W47_FULL_PIPELINE_SMOKE_READY after confirming DevTools runtime smoke"
} else {
Add-Check -Name "W47 runtime smoke manual summary" -Status "RED_W47_RUNTIME_SMOKE_NOT_GREEN" -Detail $W47RuntimeSmokeStatus
}

$HashTargets = @()
$HashTargets += $SafePanelFiles
$HashTargets += $RequiredStage4Files
$HashTargets += "package.json"

$HashManifest = @()
foreach ($relative in ($HashTargets | Select-Object -Unique)) {
$full = Join-Path $Root $relative
if (Test-Path -LiteralPath $full) {
$item = Get-Item -LiteralPath $full
if (-not $item.PSIsContainer) {
$hash = Get-FileHash -LiteralPath $full -Algorithm SHA256
$HashManifest += [ordered]@{
path = $relative
sha256 = $hash.Hash.ToLower()
size_bytes = $item.Length
last_write_time = $item.LastWriteTime.ToString("o")
}
}
}
}

$HashManifestPath = Join-Path $ReportRoot "W47_FREEZE_VERIFY_HASH_MANIFEST.json"
$HashManifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $HashManifestPath -Encoding UTF8
$Result.hash_manifest_path = $HashManifestPath
Add-Check -Name "production modified file hash manifest" -Status "GREEN_HASH_MANIFEST_CREATED" -Detail "hash manifest generated for freeze review" -Path $HashManifestPath

if ($Result.red_blockers.Count -gt 0) {
$Result.overall_status = "RED_W47_FREEZE_VERIFY_BLOCKED"
} elseif ($Result.yellow_items.Count -gt 0) {
$Result.overall_status = "YELLOW_W47_FREEZE_VERIFY_REVIEW_REQUIRED"
} else {
$Result.overall_status = "GREEN_W47_FREEZE_LOCAL_VERIFY_PASS"
}

$ResultJsonPath = Join-Path $ReportRoot "W47_FREEZE_LOCAL_VERIFY_RESULT.json"
$ResultMarkdownPath = Join-Path $ReportRoot "W47_FREEZE_LOCAL_VERIFY_RESULT.md"

$Result.result_json_path = $ResultJsonPath
$Result.result_markdown_path = $ResultMarkdownPath

$Result | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $ResultJsonPath -Encoding UTF8

$Markdown = @()
$Markdown += "# W47 Freeze Local Verify Result"
$Markdown += ""
$Markdown += "RUN_ID: $RunId"
$Markdown += "OVERALL_STATUS: $($Result.overall_status)"
$Markdown += "FREEZE_CANDIDATE_BASELINE_NAME: $FreezeCandidateBaselineName"
$Markdown += ""
$Markdown += "## RED BLOCKERS"
if ($Result.red_blockers.Count -eq 0) {
$Markdown += "- none"
} else {
foreach ($item in $Result.red_blockers) {
$Markdown += "- $($item.name): $($item.status) $($item.path) $($item.detail)"
}
}
$Markdown += ""
$Markdown += "## YELLOW ITEMS"
if ($Result.yellow_items.Count -eq 0) {
$Markdown += "- none"
} else {
foreach ($item in $Result.yellow_items) {
$Markdown += "- $($item.name): $($item.status) $($item.path) $($item.detail)"
}
}
$Markdown += ""
$Markdown += "## OUTPUTS"
$Markdown += "- result_json_path: $ResultJsonPath"
$Markdown += "- result_markdown_path: $ResultMarkdownPath"
$Markdown += "- hash_manifest_path: $HashManifestPath"

$Markdown -join "rn" | Set-Content -LiteralPath $ResultMarkdownPath -Encoding UTF8

if (-not $JsonOnly) {
Write-Host "W47_FREEZE_LOCAL_VERIFY_RESULT"
Write-Host ("overall_status: " + $Result.overall_status)
Write-Host ("freeze_candidate_baseline_name: " + $FreezeCandidateBaselineName)
Write-Host ("red_blocker_count: " + $Result.red_blockers.Count)
Write-Host ("yellow_item_count: " + $Result.yellow_items.Count)
Write-Host ("result_json_path: " + $ResultJsonPath)
Write-Host ("hash_manifest_path: " + $HashManifestPath)
}

$Result | ConvertTo-Json -Depth 30
} catch {
$message = $_.Exception.Message
Add-Check -Name "script runtime error" -Status "RED_VERIFY_SCRIPT_RUNTIME_ERROR" -Detail $message
$Result.overall_status = "RED_W47_FREEZE_VERIFY_SCRIPT_ERROR"

try {
if (Test-Path -LiteralPath $Root) {
New-Item -ItemType Directory -Path $ReportRoot -Force | Out-Null
$ResultJsonPath = Join-Path $ReportRoot "W47_FREEZE_LOCAL_VERIFY_RESULT_ERROR.json"
$Result.result_json_path = $ResultJsonPath
$Result | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $ResultJsonPath -Encoding UTF8
}
} catch {
# no-op: final stdout still reports error
}

$Result | ConvertTo-Json -Depth 30
exit 1
}