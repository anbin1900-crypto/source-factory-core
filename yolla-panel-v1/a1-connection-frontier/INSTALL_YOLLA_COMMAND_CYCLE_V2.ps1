[CmdletBinding()]
param(
    [string]$WorkspaceRoot = 'E:\SOURCE FACTORY',
    [string]$SafePanelDirectory = '',
    [switch]$Rollback,
    [switch]$Launch,
    [switch]$FixtureMode
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$PackageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Read-Utf8([string]$Path) { return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8) }
function Write-Utf8NoBom([string]$Path, [string]$Content) { [System.IO.File]::WriteAllText($Path, $Content, $Utf8NoBom) }
function Replace-Required([string]$Text, [string]$Old, [string]$New, [string]$Code) {
    if (-not $Text.Contains($Old)) { throw "${Code}:ANCHOR_NOT_FOUND" }
    return $Text.Replace($Old, $New)
}
function Invoke-NodeCheck([string[]]$Paths) {
    foreach ($item in $Paths) {
        & node --check $item
        if ($LASTEXITCODE -ne 0) { throw "NODE_CHECK_FAILED:$item" }
    }
}
function Resolve-SafePanelDirectory {
    if (-not [string]::IsNullOrWhiteSpace($SafePanelDirectory)) {
        $explicit = [System.IO.Path]::GetFullPath($SafePanelDirectory)
        if (-not (Test-Path -LiteralPath (Join-Path $explicit 'safe_panel_main.js') -PathType Leaf)) { throw "SAFE_PANEL_MAIN_NOT_FOUND:$explicit" }
        return $explicit
    }
    $activeRoot = Join-Path $WorkspaceRoot 'source-factory-active-core'
    $candidates = @()
    if (Test-Path -LiteralPath $activeRoot -PathType Container) {
        $candidates = @(Get-ChildItem -LiteralPath $activeRoot -Directory -Recurse -Depth 3 -ErrorAction SilentlyContinue | Where-Object {
            $_.Name -eq 'safe_panel_v10' -and (Test-Path -LiteralPath (Join-Path $_.FullName 'safe_panel_main.js') -PathType Leaf)
        })
    }
    $selected = $candidates | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
    if (-not $selected) { throw "SAFE_PANEL_DIRECTORY_NOT_FOUND_UNDER:$WorkspaceRoot" }
    return $selected.FullName
}

$SafePanel = Resolve-SafePanelDirectory
$PanelRoot = if ($FixtureMode) { Join-Path (Split-Path -Parent $SafePanel) '.yolla-panel-cycle-fixture' } else { Join-Path $WorkspaceRoot '.yolla\yolla-panel' }
$BackupRoot = Join-Path $PanelRoot 'cycle-v2-backups'
$RuntimeRoot = Join-Path $PanelRoot 'runtime'
$LatestBackupPointer = Join-Path $PanelRoot 'LATEST_CYCLE_V2_BACKUP_PATH.txt'
New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
New-Item -ItemType Directory -Path $RuntimeRoot -Force | Out-Null

$TargetFiles = @('safe_panel_main.js','safe_panel_preload.js','safe_panel.html','safe_panel.css')
$InstalledFiles = @(
    'yolla_panel_main_bridge.cjs','yolla_panel_renderer.js','yolla_panel.css','yolla_panel_role_registry.json',
    'yolla_worker_preload.js','yolla_worker_shell.html','yolla_worker_shell.css','yolla_worker_shell.js'
)

if ($Rollback) {
    if (-not (Test-Path -LiteralPath $LatestBackupPointer -PathType Leaf)) { throw 'LATEST_CYCLE_V2_BACKUP_POINTER_MISSING' }
    $backup = (Get-Content -LiteralPath $LatestBackupPointer -Raw).Trim()
    if (-not (Test-Path -LiteralPath $backup -PathType Container)) { throw "BACKUP_DIRECTORY_MISSING:$backup" }
    foreach ($name in $TargetFiles) {
        $source = Join-Path $backup $name
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "BACKUP_FILE_MISSING:$name" }
        Copy-Item -LiteralPath $source -Destination (Join-Path $SafePanel $name) -Force
    }
    foreach ($name in $InstalledFiles) {
        $backupInstalled = Join-Path $backup $name
        $targetInstalled = Join-Path $SafePanel $name
        if (Test-Path -LiteralPath $backupInstalled -PathType Leaf) { Copy-Item -LiteralPath $backupInstalled -Destination $targetInstalled -Force }
        else { Remove-Item -LiteralPath $targetInstalled -Force -ErrorAction SilentlyContinue }
    }
    Invoke-NodeCheck @((Join-Path $SafePanel 'safe_panel_main.js'), (Join-Path $SafePanel 'safe_panel_preload.js'))
    $receipt = [ordered]@{
        schema_version = 'YOLLA_COMMAND_CYCLE_INSTALL_RECEIPT_V2'
        mode = 'ROLLBACK'
        status = 'PASS'
        safe_panel_directory = $SafePanel
        backup_restored = $backup
        completed_at = (Get-Date).ToString('o')
    }
    $receiptPath = Join-Path $RuntimeRoot 'LATEST_COMMAND_CYCLE_ROLLBACK_RECEIPT.json'
    Write-Utf8NoBom $receiptPath ($receipt | ConvertTo-Json -Depth 10)
    Write-Host 'YOLLA_COMMAND_CYCLE_ROLLBACK=PASS'
    Write-Host "RECEIPT=$receiptPath"
    exit 0
}

foreach ($name in $TargetFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $SafePanel $name) -PathType Leaf)) { throw "REQUIRED_TARGET_MISSING:$name" }
}
$PackageFiles = @(
    'yolla_panel_main_bridge.cjs','yolla_panel_renderer.js','yolla_panel.css','YOLLA_PANEL_ROLE_REGISTRY_V1.json',
    'yolla_worker_preload.js','yolla_worker_shell.html','yolla_worker_shell.css','yolla_worker_shell.js'
)
foreach ($name in $PackageFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $PackageRoot $name) -PathType Leaf)) { throw "PACKAGE_FILE_MISSING:$name" }
}

$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$backup = Join-Path $BackupRoot $timestamp
New-Item -ItemType Directory -Path $backup -Force | Out-Null
foreach ($name in $TargetFiles) { Copy-Item -LiteralPath (Join-Path $SafePanel $name) -Destination (Join-Path $backup $name) -Force }
foreach ($name in $InstalledFiles) {
    $current = Join-Path $SafePanel $name
    if (Test-Path -LiteralPath $current -PathType Leaf) { Copy-Item -LiteralPath $current -Destination (Join-Path $backup $name) -Force }
}
Set-Content -LiteralPath $LatestBackupPointer -Value $backup -Encoding UTF8

Copy-Item -LiteralPath (Join-Path $PackageRoot 'yolla_panel_main_bridge.cjs') -Destination (Join-Path $SafePanel 'yolla_panel_main_bridge.cjs') -Force
Copy-Item -LiteralPath (Join-Path $PackageRoot 'yolla_panel_renderer.js') -Destination (Join-Path $SafePanel 'yolla_panel_renderer.js') -Force
Copy-Item -LiteralPath (Join-Path $PackageRoot 'yolla_panel.css') -Destination (Join-Path $SafePanel 'yolla_panel.css') -Force
Copy-Item -LiteralPath (Join-Path $PackageRoot 'YOLLA_PANEL_ROLE_REGISTRY_V1.json') -Destination (Join-Path $SafePanel 'yolla_panel_role_registry.json') -Force
foreach ($name in @('yolla_worker_preload.js','yolla_worker_shell.html','yolla_worker_shell.css','yolla_worker_shell.js')) {
    Copy-Item -LiteralPath (Join-Path $PackageRoot $name) -Destination (Join-Path $SafePanel $name) -Force
}

$mainPath = Join-Path $SafePanel 'safe_panel_main.js'
$main = Read-Utf8 $mainPath
if (-not $main.Contains('YOLLA_PANEL_MAIN_BRIDGE_REQUIRE_V1')) {
    $requireReplacement = @'
const path = require("path");
/* YOLLA_PANEL_MAIN_BRIDGE_REQUIRE_V1 */
const { registerYollaPanelBridge } = require("./yolla_panel_main_bridge.cjs");
'@
    $main = Replace-Required $main 'const path = require("path");' $requireReplacement.TrimEnd() 'MAIN_REQUIRE'
}

$registerV2 = @'
  /* YOLLA_PANEL_MAIN_BRIDGE_REGISTER_V2 */
  registerYollaPanelBridge({
    ipcMain,
    shell,
    terminalWindows,
    createTerminal,
    getTerminalKey,
    dispatchNextPrompt: dispatchNextPromptViaSequentialSender,
    sourceFactoryRoot: path.join("E:", "SOURCE FACTORY"),
    registryPath: path.join(__dirname, "yolla_panel_role_registry.json")
  });
'@
if ($main.Contains('YOLLA_PANEL_MAIN_BRIDGE_REGISTER_V1')) {
    $pattern = '(?s)\s*/\* YOLLA_PANEL_MAIN_BRIDGE_REGISTER_V1 \*/\s*registerYollaPanelBridge\(\{.*?\}\);'
    $main = [regex]::Replace($main, $pattern, "`r`n" + $registerV2.TrimEnd(), 1)
} elseif (-not $main.Contains('YOLLA_PANEL_MAIN_BRIDGE_REGISTER_V2')) {
    $anchor = '  ipcMain.handle("sf-terminal-control", (event, command) => terminalControl(getTerminalFromSender(event), command || {}));'
    $main = Replace-Required $main $anchor ($anchor + "`r`n" + $registerV2.TrimEnd()) 'MAIN_REGISTER'
}

if (-not $main.Contains('YOLLA_WORKSPACE_CONSTANTS_V2')) {
    $constants = @'
const DEFAULT_TAEO_TOP = 34;
/* YOLLA_WORKSPACE_CONSTANTS_V2 */
const YOLLA_WORKER_SIDEBAR_WIDTH = 410;
const YOLLA_WORKER_HEADER_HEIGHT = 56;
'@
    $main = Replace-Required $main 'const DEFAULT_TAEO_TOP = 34;' $constants.TrimEnd() 'WORKSPACE_CONSTANTS'
}

if (-not $main.Contains('YOLLA_WORKSPACE_BOUNDS_V2')) {
    $boundsState = @'
  /* YOLLA_WORKSPACE_BOUNDS_V2 */
  const isYollaWorkspace = Boolean(win.__yollaWorkspaceWindow);
  const left = isYollaWorkspace ? YOLLA_WORKER_SIDEBAR_WIDTH : 0;
  const top = isYollaWorkspace ? YOLLA_WORKER_HEADER_HEIGHT : getTaeoTopOffset(win);
'@
    $main = Replace-Required $main '  const top = getTaeoTopOffset(win);' $boundsState.TrimEnd() 'WORKSPACE_BOUNDS_STATE'
    $oldBounds = @'
      view.setBounds({
        x: 0,
        y: Math.max(0, top),
        width: Math.max(1, contentWidth),
        height: Math.max(120, contentHeight - top)
      });
'@
    $newBounds = @'
      view.setBounds({
        x: Math.max(0, left),
        y: Math.max(0, top),
        width: Math.max(1, contentWidth - left),
        height: Math.max(120, contentHeight - top)
      });
'@
    $main = Replace-Required $main $oldBounds.Trim() $newBounds.Trim() 'WORKSPACE_BOUNDS_APPLY'
}

if (-not $main.Contains('YOLLA_WORKSPACE_TERMINAL_V2')) {
    $createFlag = @'
  const isCommander = role === "commander";
  /* YOLLA_WORKSPACE_TERMINAL_V2 */
  const isYollaWorkspace = role === "worker" && slot === 1;
'@
    $main = Replace-Required $main '  const isCommander = role === "commander";' $createFlag.TrimEnd() 'WORKSPACE_CREATE_FLAG'
    $main = Replace-Required $main '    width: isCommander ? 1280 : 980,' '    width: isYollaWorkspace ? 1560 : (isCommander ? 1280 : 980),' 'WORKSPACE_WIDTH'
    $main = Replace-Required $main '    height: isCommander ? 900 : 420,' '    height: isYollaWorkspace ? 920 : (isCommander ? 900 : 420),' 'WORKSPACE_HEIGHT'
    $main = Replace-Required $main '      preload: path.join(__dirname, "safe_terminal_preload.js"),' '      preload: path.join(__dirname, isYollaWorkspace ? "yolla_worker_preload.js" : "safe_terminal_preload.js"),' 'WORKSPACE_PRELOAD'
    $workspaceFlag = @'
  win.__sfActiveTab = "taeo";
  win.__yollaWorkspaceWindow = isYollaWorkspace;
'@
    $main = Replace-Required $main '  win.__sfActiveTab = "taeo";' $workspaceFlag.TrimEnd() 'WORKSPACE_FLAG'
    $main = Replace-Required $main '    win.setMinimumSize(isCommander ? LAYOUT_FORCE_MIN_COMMANDER_WIDTH : LAYOUT_FORCE_MIN_WORKER_WIDTH, isCommander ? LAYOUT_FORCE_MIN_COMMANDER_HEIGHT : LAYOUT_FORCE_MIN_WORKER_HEIGHT);' '    win.setMinimumSize(isYollaWorkspace ? 1180 : (isCommander ? LAYOUT_FORCE_MIN_COMMANDER_WIDTH : LAYOUT_FORCE_MIN_WORKER_WIDTH), isYollaWorkspace ? 700 : (isCommander ? LAYOUT_FORCE_MIN_COMMANDER_HEIGHT : LAYOUT_FORCE_MIN_WORKER_HEIGHT));' 'WORKSPACE_MIN_SIZE'
    $main = Replace-Required $main '  win.loadFile(path.join(__dirname, "safe_terminal.html"));' '  win.loadFile(path.join(__dirname, isYollaWorkspace ? "yolla_worker_shell.html" : "safe_terminal.html"));' 'WORKSPACE_HTML'
}
Write-Utf8NoBom $mainPath $main

$preloadPath = Join-Path $SafePanel 'safe_panel_preload.js'
$preload = Read-Utf8 $preloadPath
$panelPreloadV2 = @'
/* YOLLA_PANEL_PRELOAD_BRIDGE_V2 */
contextBridge.exposeInMainWorld("yollaPanel", Object.freeze({
  getRegistry: () => ipcRenderer.invoke("yolla-panel:get-registry"),
  getRuntime: () => ipcRenderer.invoke("yolla-panel:get-runtime"),
  openWorkspace: (payload) => ipcRenderer.invoke("yolla-panel:open-workspace", payload || {}),
  focusWorkspace: () => ipcRenderer.invoke("yolla-panel:focus-workspace"),
  openWorker: (payload) => ipcRenderer.invoke("yolla-panel:open-workspace", payload || {}),
  focusWorker: () => ipcRenderer.invoke("yolla-panel:focus-workspace"),
  runCycleOnce: (payload) => ipcRenderer.invoke("yolla-panel:run-cycle-once", payload || {}),
  getLatestCycle: () => ipcRenderer.invoke("yolla-panel:get-latest-cycle"),
  openExternal: (payload) => ipcRenderer.invoke("yolla-panel:open-external", payload || {})
}));
'@
if ($preload.Contains('YOLLA_PANEL_PRELOAD_BRIDGE_V1')) {
    $preload = [regex]::Replace($preload, '(?s)/\* YOLLA_PANEL_PRELOAD_BRIDGE_V1 \*/.*$', $panelPreloadV2.TrimEnd() + "`r`n", 1)
} elseif (-not $preload.Contains('YOLLA_PANEL_PRELOAD_BRIDGE_V2')) {
    $preload = $preload.TrimEnd() + "`r`n`r`n" + $panelPreloadV2.TrimEnd() + "`r`n"
}
Write-Utf8NoBom $preloadPath $preload

$htmlPath = Join-Path $SafePanel 'safe_panel.html'
$html = Read-Utf8 $htmlPath
if (-not $html.Contains('YOLLA_PANEL_SHELL_V1')) { throw 'YOLLA_PANEL_V1_MUST_BE_INSTALLED_FIRST_OR_USE_V1_INSTALLER' }
Write-Utf8NoBom $htmlPath $html

Invoke-NodeCheck @(
    (Join-Path $SafePanel 'safe_panel_main.js'),
    (Join-Path $SafePanel 'safe_panel_preload.js'),
    (Join-Path $SafePanel 'safe_panel_renderer.js'),
    (Join-Path $SafePanel 'yolla_panel_main_bridge.cjs'),
    (Join-Path $SafePanel 'yolla_panel_renderer.js'),
    (Join-Path $SafePanel 'yolla_worker_preload.js'),
    (Join-Path $SafePanel 'yolla_worker_shell.js')
)

$registry = Get-Content -LiteralPath (Join-Path $SafePanel 'yolla_panel_role_registry.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if (@($registry.roles).Count -ne 39) { throw "REGISTRY_ROLE_COUNT_MISMATCH:$(@($registry.roles).Count)" }
$mainReadback = Read-Utf8 $mainPath
foreach ($marker in @('YOLLA_PANEL_MAIN_BRIDGE_REGISTER_V2','YOLLA_WORKSPACE_CONSTANTS_V2','YOLLA_WORKSPACE_BOUNDS_V2','YOLLA_WORKSPACE_TERMINAL_V2')) {
    if (-not $mainReadback.Contains($marker)) { throw "MAIN_MARKER_MISSING:$marker" }
}
if (-not (Read-Utf8 $preloadPath).Contains('YOLLA_PANEL_PRELOAD_BRIDGE_V2')) { throw 'PANEL_PRELOAD_V2_MISSING' }

$receipt = [ordered]@{
    schema_version = 'YOLLA_COMMAND_CYCLE_INSTALL_RECEIPT_V2'
    mode = 'APPLY'
    status = 'YOLLA_COMMAND_CYCLE_FRONTIER_INSTALLED'
    safe_panel_directory = $SafePanel
    workspace_root = $WorkspaceRoot
    backup_directory = $backup
    role_count = @($registry.roles).Count
    group_count = @($registry.groups).Count
    workspace_shell = 'GROUPED_COMMANDER_WORKER_SIDEBAR_PLUS_CHATGPT_BROWSERVIEW'
    default_commander_role = 'A-1'
    default_worker_role = 'A-3'
    command_cycle = 'COMMANDER_TO_WORKER_TO_COMMANDER_CANARY'
    existing_safe_panel_runtime_reused = $true
    existing_browser_window_factory_reused = $true
    existing_stage4_transport_reused = $true
    new_electron_runtime_count = 0
    new_browser_runtime_count = 0
    new_prompt_transport_count = 0
    node_syntax = 'PASS'
    actual_runtime_cycle_observed = $false
    completed_at = (Get-Date).ToString('o')
}
$receiptPath = Join-Path $RuntimeRoot 'LATEST_COMMAND_CYCLE_INSTALL_RECEIPT.json'
Write-Utf8NoBom $receiptPath ($receipt | ConvertTo-Json -Depth 20)

Write-Host 'YOLLA_COMMAND_CYCLE_FRONTIER_INSTALL=PASS'
Write-Host "SAFE_PANEL_DIRECTORY=$SafePanel"
Write-Host "ROLE_COUNT=$(@($registry.roles).Count)"
Write-Host "BACKUP_DIRECTORY=$backup"
Write-Host "RECEIPT=$receiptPath"

if ($Launch) {
    $activeRoot = Split-Path -Parent $SafePanel
    $launcherNames = @('RUN_E_SF4_SAFE_PANEL_E_ONLY_WITH_PC_AGENT_BRIDGE.bat','RUN_E_SF4_SAFE_PANEL_E_ONLY.bat','RUN_SF4_SAFE_PANEL_ONLY.bat')
    $launcher = $null
    foreach ($base in @($activeRoot, $WorkspaceRoot, (Join-Path $WorkspaceRoot 'source-factory-active-core'))) {
        foreach ($name in $launcherNames) {
            $candidate = Join-Path $base $name
            if (Test-Path -LiteralPath $candidate -PathType Leaf) { $launcher = $candidate; break }
        }
        if ($launcher) { break }
    }
    if (-not $launcher) { throw 'SAFE_PANEL_LAUNCHER_NOT_FOUND' }
    Start-Process -FilePath 'cmd.exe' -ArgumentList @('/k', ('"' + $launcher + '"')) -WorkingDirectory (Split-Path -Parent $launcher)
    Write-Host "LAUNCHER=$launcher"
}
