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

function Write-Utf8NoBom {
    param([string]$Path, [string]$Content)
    [System.IO.File]::WriteAllText($Path, $Content, $Utf8NoBom)
}

function Read-Utf8 {
    param([string]$Path)
    return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
}

function Add-AfterAnchor {
    param([string]$Text, [string]$Anchor, [string]$Content, [string]$Marker)
    if ($Text.Contains($Marker)) { return $Text }
    if (-not $Text.Contains($Anchor)) { throw "ANCHOR_NOT_FOUND:$Anchor" }
    return $Text.Replace($Anchor, $Anchor + "`r`n" + $Content)
}

function Add-BeforeAnchor {
    param([string]$Text, [string]$Anchor, [string]$Content, [string]$Marker)
    if ($Text.Contains($Marker)) { return $Text }
    if (-not $Text.Contains($Anchor)) { throw "ANCHOR_NOT_FOUND:$Anchor" }
    return $Text.Replace($Anchor, $Content + "`r`n" + $Anchor)
}

function Resolve-SafePanelDirectory {
    if (-not [string]::IsNullOrWhiteSpace($SafePanelDirectory)) {
        $explicit = [System.IO.Path]::GetFullPath($SafePanelDirectory)
        if (-not (Test-Path -LiteralPath (Join-Path $explicit 'safe_panel_main.js') -PathType Leaf)) {
            throw "SAFE_PANEL_MAIN_NOT_FOUND:$explicit"
        }
        return $explicit
    }

    $activeRoot = Join-Path $WorkspaceRoot 'source-factory-active-core'
    $candidates = New-Object System.Collections.Generic.List[object]
    foreach ($candidate in @((Join-Path $activeRoot 'safe_panel_v10'), (Join-Path $WorkspaceRoot 'safe_panel_v10'))) {
        if (Test-Path -LiteralPath (Join-Path $candidate 'safe_panel_main.js') -PathType Leaf) { $candidates.Add((Get-Item -LiteralPath $candidate)) }
    }
    if (Test-Path -LiteralPath $activeRoot -PathType Container) {
        foreach ($child in @(Get-ChildItem -LiteralPath $activeRoot -Directory -ErrorAction SilentlyContinue)) {
            $candidate = Join-Path $child.FullName 'safe_panel_v10'
            if (Test-Path -LiteralPath (Join-Path $candidate 'safe_panel_main.js') -PathType Leaf) { $candidates.Add((Get-Item -LiteralPath $candidate)) }
        }
    }
    $selected = $candidates | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
    if (-not $selected) { throw "SAFE_PANEL_DIRECTORY_NOT_FOUND_UNDER:$WorkspaceRoot" }
    return $selected.FullName
}

function Invoke-NodeCheck {
    param([string[]]$Paths)
    foreach ($path in $Paths) {
        & node --check $path
        if ($LASTEXITCODE -ne 0) { throw "NODE_CHECK_FAILED:$path" }
    }
}

$SafePanel = Resolve-SafePanelDirectory
$PanelRoot = if ($FixtureMode) { Join-Path (Split-Path -Parent $SafePanel) '.yolla-panel-fixture' } else { Join-Path $WorkspaceRoot '.yolla\yolla-panel' }
$BackupRoot = Join-Path $PanelRoot 'backups'
$RuntimeRoot = Join-Path $PanelRoot 'runtime'
$LatestBackupPointer = Join-Path $PanelRoot 'LATEST_BACKUP_PATH.txt'
New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
New-Item -ItemType Directory -Path $RuntimeRoot -Force | Out-Null

$TargetFiles = @('safe_panel_main.js','safe_panel_preload.js','safe_panel.html','safe_panel.css')
$InstalledFiles = @('yolla_panel_main_bridge.cjs','yolla_panel_renderer.js','yolla_panel.css','yolla_panel_role_registry.json')

if ($Rollback) {
    if (-not (Test-Path -LiteralPath $LatestBackupPointer -PathType Leaf)) { throw 'LATEST_BACKUP_POINTER_MISSING' }
    $backup = (Get-Content -LiteralPath $LatestBackupPointer -Raw).Trim()
    if (-not (Test-Path -LiteralPath $backup -PathType Container)) { throw "BACKUP_DIRECTORY_MISSING:$backup" }
    foreach ($name in $TargetFiles) {
        $source = Join-Path $backup $name
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "BACKUP_FILE_MISSING:$name" }
        Copy-Item -LiteralPath $source -Destination (Join-Path $SafePanel $name) -Force
    }
    foreach ($name in $InstalledFiles) { Remove-Item -LiteralPath (Join-Path $SafePanel $name) -Force -ErrorAction SilentlyContinue }
    Invoke-NodeCheck @((Join-Path $SafePanel 'safe_panel_main.js'), (Join-Path $SafePanel 'safe_panel_preload.js'))
    $receipt = [ordered]@{
        schema_version = 'YOLLA_PANEL_INSTALL_RECEIPT_V1'
        mode = 'ROLLBACK'
        status = 'PASS'
        safe_panel_directory = $SafePanel
        backup_restored = $backup
        completed_at = (Get-Date).ToString('o')
    }
    $receiptPath = Join-Path $RuntimeRoot 'LATEST_ROLLBACK_RECEIPT.json'
    Write-Utf8NoBom $receiptPath ($receipt | ConvertTo-Json -Depth 10)
    Write-Host 'YOLLA_PANEL_ROLLBACK=PASS'
    Write-Host "RECEIPT=$receiptPath"
    exit 0
}

foreach ($name in $TargetFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $SafePanel $name) -PathType Leaf)) { throw "REQUIRED_TARGET_MISSING:$name" }
}
foreach ($name in @('yolla_panel_main_bridge.cjs','yolla_panel_renderer.js','yolla_panel.css','YOLLA_PANEL_ROLE_REGISTRY_V1.json')) {
    if (-not (Test-Path -LiteralPath (Join-Path $PackageRoot $name) -PathType Leaf)) { throw "PACKAGE_FILE_MISSING:$name" }
}

$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$backup = Join-Path $BackupRoot $timestamp
New-Item -ItemType Directory -Path $backup -Force | Out-Null
foreach ($name in $TargetFiles) { Copy-Item -LiteralPath (Join-Path $SafePanel $name) -Destination (Join-Path $backup $name) -Force }
Set-Content -LiteralPath $LatestBackupPointer -Value $backup -Encoding UTF8

Copy-Item -LiteralPath (Join-Path $PackageRoot 'yolla_panel_main_bridge.cjs') -Destination (Join-Path $SafePanel 'yolla_panel_main_bridge.cjs') -Force
Copy-Item -LiteralPath (Join-Path $PackageRoot 'yolla_panel_renderer.js') -Destination (Join-Path $SafePanel 'yolla_panel_renderer.js') -Force
Copy-Item -LiteralPath (Join-Path $PackageRoot 'yolla_panel.css') -Destination (Join-Path $SafePanel 'yolla_panel.css') -Force
Copy-Item -LiteralPath (Join-Path $PackageRoot 'YOLLA_PANEL_ROLE_REGISTRY_V1.json') -Destination (Join-Path $SafePanel 'yolla_panel_role_registry.json') -Force

$mainPath = Join-Path $SafePanel 'safe_panel_main.js'
$main = Read-Utf8 $mainPath
$mainRequire = @'
/* YOLLA_PANEL_MAIN_BRIDGE_REQUIRE_V1 */
const { registerYollaPanelBridge } = require("./yolla_panel_main_bridge.cjs");
'@
$main = Add-AfterAnchor $main 'const path = require("path");' $mainRequire 'YOLLA_PANEL_MAIN_BRIDGE_REQUIRE_V1'
$mainRegister = @'
  /* YOLLA_PANEL_MAIN_BRIDGE_REGISTER_V1 */
  registerYollaPanelBridge({
    ipcMain,
    shell,
    terminalWindows,
    createTerminal,
    getTerminalKey,
    sourceFactoryRoot: path.join("E:", "SOURCE FACTORY"),
    registryPath: path.join(__dirname, "yolla_panel_role_registry.json")
  });
'@
$handlerAnchor = '  ipcMain.handle("sf-terminal-control", (event, command) => terminalControl(getTerminalFromSender(event), command || {}));'
$main = Add-AfterAnchor $main $handlerAnchor $mainRegister 'YOLLA_PANEL_MAIN_BRIDGE_REGISTER_V1'
Write-Utf8NoBom $mainPath $main

$preloadPath = Join-Path $SafePanel 'safe_panel_preload.js'
$preload = Read-Utf8 $preloadPath
$preloadBlock = @'

/* YOLLA_PANEL_PRELOAD_BRIDGE_V1 */
contextBridge.exposeInMainWorld("yollaPanel", Object.freeze({
  getRegistry: () => ipcRenderer.invoke("yolla-panel:get-registry"),
  getRuntime: () => ipcRenderer.invoke("yolla-panel:get-runtime"),
  openWorker: (payload) => ipcRenderer.invoke("yolla-panel:open-worker", payload || {}),
  focusWorker: (payload) => ipcRenderer.invoke("yolla-panel:focus-worker", payload || {}),
  openExternal: (payload) => ipcRenderer.invoke("yolla-panel:open-external", payload || {})
}));
'@
if (-not $preload.Contains('YOLLA_PANEL_PRELOAD_BRIDGE_V1')) { $preload = $preload.TrimEnd() + $preloadBlock + "`r`n" }
Write-Utf8NoBom $preloadPath $preload

$htmlPath = Join-Path $SafePanel 'safe_panel.html'
$html = Read-Utf8 $htmlPath
$html = $html.Replace('<title>Source Factory SAFE Panel Only v0.10.6</title>', '<title>YOLLA Panel · Connection Frontier V1</title>')
$linkBlock = '  <!-- YOLLA_PANEL_STYLE_LINK_V1 --><link rel="stylesheet" href="./yolla_panel.css">'
$html = Add-BeforeAnchor $html '</head>' $linkBlock 'YOLLA_PANEL_STYLE_LINK_V1'
$panelBlock = @'

    <!-- YOLLA_PANEL_SHELL_V1 -->
    <section id="yolla-panel-shell" class="card span-2" aria-label="YOLLA Panel Connection Frontier">
      <aside class="yolla-panel-sidebar">
        <span class="yolla-kicker">YOLLA PANEL V0.1</span>
        <h2>역할·워커창</h2>
        <p>기능을 만들지 않고 다른 그룹 모듈이 꽂힐 연결지점을 먼저 엽니다.</p>
        <div id="yolla-panel-role-menu"></div>
      </aside>
      <section id="yolla-panel-workspace" class="yolla-panel-workspace" aria-live="polite"></section>
    </section>
'@
$html = Add-AfterAnchor $html '  <main class="layout">' $panelBlock 'YOLLA_PANEL_SHELL_V1'
$scriptBlock = '  <!-- YOLLA_PANEL_RENDERER_SCRIPT_V1 --><script src="./yolla_panel_renderer.js"></script>'
$html = Add-BeforeAnchor $html '</body>' $scriptBlock 'YOLLA_PANEL_RENDERER_SCRIPT_V1'
Write-Utf8NoBom $htmlPath $html

Invoke-NodeCheck @(
    (Join-Path $SafePanel 'safe_panel_main.js'),
    (Join-Path $SafePanel 'safe_panel_preload.js'),
    (Join-Path $SafePanel 'safe_panel_renderer.js'),
    (Join-Path $SafePanel 'yolla_panel_main_bridge.cjs'),
    (Join-Path $SafePanel 'yolla_panel_renderer.js')
)

$registry = Get-Content -LiteralPath (Join-Path $SafePanel 'yolla_panel_role_registry.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($registry.schema_version -ne 'YOLLA_PANEL_ROLE_REGISTRY_V1') { throw 'REGISTRY_SCHEMA_MISMATCH' }
if (@($registry.roles).Count -lt 22) { throw 'REGISTRY_ROLE_COUNT_TOO_SMALL' }
if ((@($registry.roles | Group-Object role_id | Where-Object Count -gt 1)).Count -ne 0) { throw 'DUPLICATE_ROLE_ID' }

foreach ($assertion in @(
    @{ File='safe_panel_main.js'; Marker='YOLLA_PANEL_MAIN_BRIDGE_REGISTER_V1' },
    @{ File='safe_panel_preload.js'; Marker='YOLLA_PANEL_PRELOAD_BRIDGE_V1' },
    @{ File='safe_panel.html'; Marker='YOLLA_PANEL_SHELL_V1' },
    @{ File='safe_panel.html'; Marker='YOLLA_PANEL_RENDERER_SCRIPT_V1' }
)) {
    $value = Read-Utf8 (Join-Path $SafePanel $assertion.File)
    if (-not $value.Contains($assertion.Marker)) { throw "INSTALL_MARKER_MISSING:$($assertion.Marker)" }
}

$receipt = [ordered]@{
    schema_version = 'YOLLA_PANEL_INSTALL_RECEIPT_V1'
    mode = 'APPLY'
    status = 'YOLLA_PANEL_CONNECTION_FRONTIER_INSTALLED'
    safe_panel_directory = $SafePanel
    workspace_root = $WorkspaceRoot
    backup_directory = $backup
    role_count = @($registry.roles).Count
    group_count = @($registry.groups).Count
    provider_slots = @($registry.provider_slots)
    existing_safe_panel_runtime_reused = $true
    existing_browser_window_factory_reused = $true
    existing_stage4_transport_reused = $true
    new_electron_runtime_count = 0
    new_browser_runtime_count = 0
    new_prompt_transport_count = 0
    node_syntax = 'PASS'
    completed_at = (Get-Date).ToString('o')
}
$receiptPath = Join-Path $RuntimeRoot 'LATEST_INSTALL_RECEIPT.json'
Write-Utf8NoBom $receiptPath ($receipt | ConvertTo-Json -Depth 20)

Write-Host 'YOLLA_PANEL_CONNECTION_FRONTIER_INSTALL=PASS'
Write-Host "SAFE_PANEL_DIRECTORY=$SafePanel"
Write-Host "ROLE_COUNT=$(@($registry.roles).Count)"
Write-Host "BACKUP_DIRECTORY=$backup"
Write-Host "RECEIPT=$receiptPath"

if ($Launch) {
    $activeRoot = Split-Path -Parent $SafePanel
    $launcherNames = @(
      'RUN_E_SF4_SAFE_PANEL_E_ONLY_WITH_PC_AGENT_BRIDGE.bat',
      'RUN_E_SF4_SAFE_PANEL_E_ONLY.bat',
      'RUN_SF4_SAFE_PANEL_ONLY.bat'
    )
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
