/* eslint-env node */
"use strict";

const { app, BrowserWindow, BrowserView, ipcMain, session, shell, dialog, screen } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const os = require("node:os");
const childProcess = require("node:child_process");
const { V6StateStore, readJson, writeJsonAtomic, cleanText } = require("./state_store.cjs");
const { ChatGptDispatcher } = require("./chatgpt_dispatch.cjs");
const { CommandScheduler } = require("./command_scheduler.cjs");
const { createCModeRuntime } = require("./automation-c-v1/c_mode_runtime.cjs");
const { SessionRestoreManager } = require("./session_restore_manager.cjs");
const { V6ModuleHost } = require("./module_host.cjs");

const APP_VERSION = "6.0.1";
const YOLLA_ROOT = path.join("E:\\", "YOLLA");
const V6_ROOT = process.env.YOLLA_V6_ROOT
  ? path.resolve(process.env.YOLLA_V6_ROOT)
  : path.join(YOLLA_ROOT, "panel-v6");
const RELEASE_ROOT = __dirname;
const STATE_ROOT = process.env.YOLLA_V6_STATE_ROOT
  ? path.resolve(process.env.YOLLA_V6_STATE_ROOT)
  : path.join(V6_ROOT, "state");
const PROFILE_ROOT = process.env.YOLLA_V6_PROFILE_ROOT
  ? path.resolve(process.env.YOLLA_V6_PROFILE_ROOT)
  : path.join(V6_ROOT, "profile");
const LOG_ROOT = path.join(V6_ROOT, "logs");
const RECEIPT_ROOT = path.join(V6_ROOT, "receipts");
const IMPORT_STATE_PATH = process.env.YOLLA_V6_IMPORT_STATE_PATH
  ? path.resolve(process.env.YOLLA_V6_IMPORT_STATE_PATH)
  : null;
const STATE_PATH = path.join(STATE_ROOT, "workspace_state.json");
const LOG_PATH = path.join(LOG_ROOT, "runtime.log");
const RECEIPT_PATH = path.join(RECEIPT_ROOT, "LATEST_RUNTIME_RECEIPT.json");
const WORKER_PARTITION = "persist:yolla-v6-worker";
const ANALYZER_PARTITION = "persist:yolla-v6-analyzer";
const IS_SMOKE_TEST = process.argv.includes("--smoke-test");

fs.mkdirSync(PROFILE_ROOT, { recursive: true });
app.setName("AI YOLLA Workspace V6");
app.setPath("userData", PROFILE_ROOT);

let mainWindow = null;
let logAnalyzerWindow = null;
let lastBounds = { x: 330, y: 104, width: 1000, height: 700 };
let activeKind = "WORKER";
let browserSuppressedForUi = false;
const views = { WORKER: null, ANALYZER: null };
const browserState = {
  WORKER: { kind: "WORKER", created: false, attached: false, url: "https://chatgpt.com/projects", title: "", loading: false, can_go_back: false, can_go_forward: false },
  ANALYZER: { kind: "ANALYZER", created: false, attached: false, url: "https://www.google.com", title: "", loading: false, can_go_back: false, can_go_forward: false }
};
const stateStore = new V6StateStore(STATE_PATH, IMPORT_STATE_PATH);
let dispatcher = null;
let cMode = null;
let scheduler = null;
let sessionRestore = null;
let moduleHost = null;
let rendered = false;

function ensureDir(directory) { fs.mkdirSync(directory, { recursive: true }); }
function nowIso() { return new Date().toISOString(); }
function normalizeUrl(value, fallback) {
  const text = cleanText(value, 3000);
  if (!text) return fallback;
  if (/^https?:\/\//i.test(text)) return text;
  return `https://${text}`;
}
function appendLog(message, details = null) {
  const row = { at: nowIso(), message: cleanText(message, 300), details: details && typeof details === "object" ? details : null };
  try { ensureDir(STATE_ROOT); fs.appendFileSync(LOG_PATH, `${JSON.stringify(row)}\n`, "utf8"); } catch (_error) {}
  try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("v6:log", row); } catch (_error) {}
  try { if (logAnalyzerWindow && !logAnalyzerWindow.isDestroyed()) logAnalyzerWindow.webContents.send("v6:log-analyzer:event", row); } catch (_error) {}
}
function writeRuntimeReceipt(status, details = {}) {
  const state = stateStore.snapshot();
  const receipt = {
    schema_version: "YOLLA_V6_RUNTIME_RECEIPT_V1",
    status,
    app_version: APP_VERSION,
    release_root: RELEASE_ROOT,
    v6_root: V6_ROOT,
    state_root: STATE_ROOT,
    profile_root: PROFILE_ROOT,
    log_root: LOG_ROOT,
    receipt_root: RECEIPT_ROOT,
    import_state_path: IMPORT_STATE_PATH,
    runtime_namespace: "YOLLA_PANEL_V6",
    legacy_write_count: 0,
    legacy_runtime_modified: false,
    group_count: Object.keys(state.groups).length,
    role_count: Object.keys(state.roles).length,
    worker_browser_created: browserState.WORKER.created,
    analyzer_browser_created: browserState.ANALYZER.created,
    session_restore: sessionRestore ? {
      launch_count: sessionRestore.snapshot().launch_count,
      gpt_partition: WORKER_PARTITION,
      google_partition: ANALYZER_PARTITION,
      secret_export_count: 0
    } : null,
    module_bindings: moduleHost ? moduleHost.status() : null,
    rendered,
    observed_at: nowIso(),
    ...details
  };
  try { writeJsonAtomic(RECEIPT_PATH, receipt); } catch (_error) {}
  return receipt;
}
function selectedRole() {
  const state = stateStore.snapshot();
  return state.selected_role_id ? state.roles[state.selected_role_id] || null : null;
}
function safeFileName(value) { return String(value || "").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 160) || "file"; }
function readJsonLines(filePath, limit = 1000) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const stat = fs.statSync(filePath);
    const maxBytes = 4 * 1024 * 1024;
    const start = Math.max(0, stat.size - maxBytes);
    const length = stat.size - start;
    const fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, start);
    fs.closeSync(fd);
    let text = buffer.toString("utf8");
    if (start > 0) text = text.slice(text.indexOf("\n") + 1);
    return text.split(/\r?\n/).filter(Boolean).slice(-limit).map(line => {
      try { return JSON.parse(line); } catch (_error) { return { at: null, message: "UNPARSEABLE_LOG_LINE", details: { line: line.slice(0, 4000) } }; }
    });
  } catch (error) { return [{ at: nowIso(), message: "LOG_READ_FAILED", details: { file_path: filePath, error: String(error && error.message || error) } }]; }
}
function severityOf(row) {
  const text = `${row && (row.message || row.event) || ""} ${JSON.stringify(row && row.details || {})}`.toUpperCase();
  if (/ERROR|FAIL|BLOCKED|TIMEOUT|CONFLICT|INVALID|REPLACEMENT_REQUIRED|RENDER_PROCESS_GONE/.test(text)) return "ERROR";
  if (/MISSING|RETRY|WAIT|STALE|CARRYOVER|PARTIAL|WARNING/.test(text)) return "WARN";
  if (/PASS|COMPLETED|DISPATCHED|STARTED|ACKNOWLEDGED|RESOLVED/.test(text)) return "PASS";
  return "INFO";
}
function logAnalyzerSnapshot() {
  const state = stateStore.snapshot();
  const c = cSummary() || {};
  const commands = schedulerSummary() || {};
  const runtimeRows = readJsonLines(LOG_PATH, 1000).map(row => ({ source: "runtime", at: row.at || null, message: row.message || row.event || "", details: row.details || null }));
  const cLogPath = path.join(STATE_ROOT, "automation-c-v1", "work_control_events.jsonl");
  const cRows = readJsonLines(cLogPath, 1000).map(row => ({ source: "c-mode", at: row.at || null, message: `C_MODE_${row.event || "EVENT"}`, details: row.details || null }));
  const seen = new Set();
  const entries = runtimeRows.concat(cRows).sort((a,b) => String(a.at || "").localeCompare(String(b.at || ""))).filter(row => {
    const key = `${row.at || ""}|${row.message || ""}|${JSON.stringify(row.details || null)}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(-1200).map(row => ({ ...row, severity: severityOf(row) }));
  const counts = { total: entries.length, error: 0, warn: 0, pass: 0, info: 0 };
  for (const row of entries) counts[String(row.severity || "INFO").toLowerCase()] += 1;
  const roles = Object.values(state.roles || {});
  const workerCounts = {
    total: roles.length,
    working: roles.filter(role => ["RUNNING","DISPATCHING"].includes(String(role.status || "").toUpperCase())).length,
    error: roles.filter(role => ["ERROR","BLOCKED"].includes(String(role.status || "").toUpperCase())).length,
    idle: roles.filter(role => !["RUNNING","DISPATCHING","ERROR","BLOCKED"].includes(String(role.status || "").toUpperCase())).length
  };
  const collisionSignals = entries.filter(row => row.severity === "ERROR" || row.severity === "WARN").slice(-120).reverse();
  return {
    schema_version: "YOLLA_V6_LOG_ANALYZER_SNAPSHOT_V1",
    app_version: APP_VERSION,
    observed_at: nowIso(),
    paths: { v6_root: V6_ROOT, state_root: STATE_ROOT, runtime_log: LOG_PATH, c_mode_log: cLogPath, receipt_root: RECEIPT_ROOT },
    worker_counts: workerCounts,
    c_mode: {
      status: c.status || "IDLE",
      group_id: c.group_id || null,
      wave: Number(c.current_wave_index || 0),
      completed_task_count: Number(c.completed_task_count || 0),
      duplicate_dispatch_count: Number(c.duplicate_dispatch_count || 0),
      missing_count: Number(c.missing_count || 0),
      progress_error: c.progress_error || null,
      last_error: c.last_error || null
    },
    commands: { timer_active: Boolean(commands.timer_active), command_count: Object.keys(commands.commands || {}).length },
    analysis: { counts, collision_signal_count: collisionSignals.length, collision_signals: collisionSignals.slice(0, 40) },
    entries
  };
}
function copyFileIfExists(source, destination) {
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) return false;
  ensureDir(path.dirname(destination)); fs.copyFileSync(source, destination); return true;
}
function copyRecentJsonFiles(sourceDir, destinationDir, limit = 80) {
  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) return 0;
  const files = fs.readdirSync(sourceDir).map(name => ({ name, full: path.join(sourceDir, name) }))
    .filter(item => { try { return fs.statSync(item.full).isFile(); } catch (_error) { return false; } })
    .map(item => ({ ...item, mtime: fs.statSync(item.full).mtimeMs }))
    .sort((a,b) => b.mtime - a.mtime).slice(0, limit);
  ensureDir(destinationDir);
  for (const item of files) fs.copyFileSync(item.full, path.join(destinationDir, safeFileName(item.name)));
  return files.length;
}
function psQuote(value) { return String(value || "").replace(/'/g, "''"); }
function createDiagnosticStaging() {
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "yolla-v6-diag-"));
  const snapshot = logAnalyzerSnapshot();
  fs.writeFileSync(path.join(staging, "DIAGNOSTIC_SUMMARY.json"), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(staging, "README.txt"), [
    "AI YOLLA V6 diagnostic bundle", "", `Generated: ${nowIso()}`,
    "포함: Runtime/C-mode 로그, 상태/Receipt, 명령 상태, 최근 dispatch receipt.",
    "제외: Browser Profile, 쿠키, 로그인 토큰, 캐시, 비밀번호.",
    "이 ZIP을 ChatGPT 대화에 첨부하면 충돌/오류 분석에 사용할 수 있습니다."
  ].join("\r\n"), "utf8");
  copyFileIfExists(LOG_PATH, path.join(staging, "runtime.log"));
  copyFileIfExists(RECEIPT_PATH, path.join(staging, "LATEST_RUNTIME_RECEIPT.json"));
  copyFileIfExists(STATE_PATH, path.join(staging, "workspace_state.json"));
  copyFileIfExists(path.join(STATE_ROOT, "automation-c-v1", "C_MODE_STATE.json"), path.join(staging, "automation-c-v1", "C_MODE_STATE.json"));
  copyFileIfExists(path.join(STATE_ROOT, "automation-c-v1", "REPEAT_COMMANDS.json"), path.join(staging, "automation-c-v1", "REPEAT_COMMANDS.json"));
  copyFileIfExists(path.join(STATE_ROOT, "automation-c-v1", "work_control_events.jsonl"), path.join(staging, "automation-c-v1", "work_control_events.jsonl"));
  copyFileIfExists(path.join(STATE_ROOT, "commands", "SCHEDULED_COMMANDS.json"), path.join(staging, "commands", "SCHEDULED_COMMANDS.json"));
  copyRecentJsonFiles(path.join(STATE_ROOT, "dispatch-receipts"), path.join(staging, "dispatch-receipts"), 80);
  copyRecentJsonFiles(path.join(STATE_ROOT, "automation-c-v1", "dispatch-receipts"), path.join(staging, "automation-c-v1", "dispatch-receipts"), 80);
  copyRecentJsonFiles(path.join(STATE_ROOT, "commands", "receipts"), path.join(staging, "commands", "receipts"), 80);
  return staging;
}
async function exportDiagnosticBundle() {
  const stamp = nowIso().replace(/[-:TZ.]/g, "").slice(0, 14);
  const defaultPath = path.join(app.getPath("downloads"), `YOLLA_V6_DIAGNOSTIC_${stamp}.zip`);
  const owner = logAnalyzerWindow && !logAnalyzerWindow.isDestroyed() ? logAnalyzerWindow : mainWindow;
  const save = await dialog.showSaveDialog(owner || undefined, { title: "AI YOLLA 진단 로그 저장", defaultPath, filters: [{ name: "ZIP", extensions: ["zip"] }] });
  if (save.canceled || !save.filePath) return { canceled: true };
  const staging = createDiagnosticStaging();
  try {
    const command = `$src='${psQuote(staging)}';$dst='${psQuote(save.filePath)}';Compress-Archive -Path (Join-Path $src '*') -DestinationPath $dst -CompressionLevel Optimal -Force`;
    const result = childProcess.spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command], { encoding: "utf8", windowsHide: true });
    if (result.status !== 0 || !fs.existsSync(save.filePath) || fs.statSync(save.filePath).size <= 0) {
      throw new Error(`DIAGNOSTIC_ZIP_FAILED:${result.stderr || result.stdout || result.status}`);
    }
    const sha256 = crypto.createHash("sha256").update(fs.readFileSync(save.filePath)).digest("hex");
    const output = { canceled: false, file_path: save.filePath, size: fs.statSync(save.filePath).size, sha256 };
    appendLog("DIAGNOSTIC_EXPORT_CREATED", output);
    try { shell.showItemInFolder(save.filePath); } catch (_error) {}
    return output;
  } finally { try { fs.rmSync(staging, { recursive: true, force: true }); } catch (_error) {} }
}
function createLogAnalyzerWindow() {
  if (logAnalyzerWindow && !logAnalyzerWindow.isDestroyed()) { logAnalyzerWindow.show(); logAnalyzerWindow.focus(); return logAnalyzerWindow; }
  const options = {
    width: 1080, height: 780, minWidth: 820, minHeight: 560, show: true,
    backgroundColor: "#0f172a", title: "AI YOLLA 로그 분석기",
    webPreferences: { preload: path.join(RELEASE_ROOT, "log_analyzer_preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true }
  };
  logAnalyzerWindow = new BrowserWindow(sessionRestore ? sessionRestore.windowOptions("log_window", options) : options);
  if (sessionRestore) {
    sessionRestore.applyWindowState("log_window", logAnalyzerWindow);
    sessionRestore.trackWindow("log_window", logAnalyzerWindow);
  }
  logAnalyzerWindow.loadFile(path.join(RELEASE_ROOT, "log_analyzer.html"));
  logAnalyzerWindow.on("closed", () => { logAnalyzerWindow = null; });
  return logAnalyzerWindow;
}
function deriveProjectUrl(contextUrl, fallback) {
  const value = cleanText(contextUrl, 3000);
  const match = value.match(/^(https:\/\/chatgpt\.com\/g\/[^/]+)(?:\/c\/[^/?#]+)?/i);
  return match ? `${match[1]}/project` : cleanText(fallback || "https://chatgpt.com/projects", 3000);
}
function currentWorkerContextUrl() {
  const view = views.WORKER;
  const url = view && !view.webContents.isDestroyed() ? view.webContents.getURL() : browserState.WORKER.url;
  return cleanText(url, 3000);
}
function assignCurrentWorker(payload = {}) {
  const state = stateStore.snapshot();
  const groupId = String(payload.group_id || state.selected_group_id || "").toUpperCase();
  const group = state.groups[groupId];
  if (!group) throw new Error(`GROUP_NOT_FOUND:${groupId}`);
  if (!group.commander_id || !state.roles[group.commander_id]) throw new Error("GROUP_COMMANDER_REQUIRED");
  const url = currentWorkerContextUrl();
  if (!/^https:\/\/chatgpt\.com\/(?:g\/[^/]+\/)?c\/[^/?#]+/i.test(url)) throw new Error("CURRENT_CHATGPT_CONVERSATION_REQUIRED");
  const duplicate = Object.values(state.roles || {}).find(role => cleanText(role.context_url, 3000) === url);
  if (duplicate) throw new Error(`WORKER_URL_ALREADY_ASSIGNED:${duplicate.role_id}`);
  const commander = state.roles[group.commander_id];
  stateStore.addRole({
    role_id: payload.role_id,
    group_id: groupId,
    display_name: cleanText(payload.display_name || "새 워커", 120),
    role_type: "WORKER",
    context_url: url,
    project_url: deriveProjectUrl(url, commander.project_url)
  });
  const after = stateStore.snapshot();
  const assigned = after.roles[after.selected_role_id];
  appendLog("WORKER_ASSIGNED_FROM_CURRENT_URL", { group_id: groupId, commander_id: group.commander_id, role_id: assigned && assigned.role_id, context_url: url });
  emitState();
  return publicState();
}
function getRole(roleId) {
  const state = stateStore.snapshot();
  return state.roles[String(roleId || "").toUpperCase()] || null;
}
function updateRoleStatus(roleId, status) {
  try {
    stateStore.updateRole({ role_id: roleId, status });
    emitState();
  } catch (error) { appendLog("ROLE_STATUS_UPDATE_FAILED", { role_id: roleId, status, error: String(error && error.message || error) }); }
}
function cSummary() { try { return cMode ? cMode.summary() : null; } catch (error) { return { status: "ERROR", last_error: String(error && error.message || error) }; } }
function schedulerSummary() { try { return scheduler ? scheduler.summary() : null; } catch (error) { return { error: String(error && error.message || error) }; } }
function publicState() {
  const state = {
    app_version: APP_VERSION,
    workspace: stateStore.snapshot(),
    browser: JSON.parse(JSON.stringify(browserState)),
    active_browser_kind: activeKind,
    c_mode: cSummary(),
    commands: schedulerSummary(),
    paths: { v6_root: V6_ROOT, state_root: STATE_ROOT, profile_root: PROFILE_ROOT, log_path: LOG_PATH, receipt_root: RECEIPT_ROOT },
    session_restore: sessionRestore ? sessionRestore.snapshot() : null,
    existing_runtime_preserved: true
  };
  state.modules = moduleHost ? moduleHost.snapshot(state) : {};
  return state;
}
function emitState() {
  try { if (sessionRestore) sessionRestore.recordWorkspace(stateStore.snapshot(), activeKind); } catch (_error) {}
  try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("v6:state", publicState()); } catch (_error) {}
}
function updateBrowserState(kind) {
  const view = views[kind];
  const meta = browserState[kind];
  if (view && !view.webContents.isDestroyed()) {
    meta.created = true;
    meta.url = view.webContents.getURL() || meta.url;
    meta.title = view.webContents.getTitle() || "";
    meta.loading = view.webContents.isLoading();
    meta.can_go_back = view.webContents.canGoBack();
    meta.can_go_forward = view.webContents.canGoForward();
  }
  meta.attached = !browserSuppressedForUi && activeKind === kind && Boolean(mainWindow && !mainWindow.isDestroyed() && view);
  emitState();
}
function viewPartition(kind) { return kind === "ANALYZER" ? ANALYZER_PARTITION : WORKER_PARTITION; }
function initialUrl(kind) {
  const state = stateStore.snapshot();
  if (kind === "ANALYZER") return state.browser.ANALYZER.url || "https://www.google.com";
  const role = state.selected_role_id && state.roles[state.selected_role_id];
  return role && (role.context_url || role.project_url) || state.browser.WORKER.url || "https://chatgpt.com/projects";
}
function configureView(kind, view) {
  const wc = view.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
    return { action: "deny" };
  });
  const changed = () => {
    if (wc.isDestroyed()) return;
    const url = wc.getURL();
    browserState[kind].url = url || browserState[kind].url;
    browserState[kind].title = wc.getTitle() || "";
    browserState[kind].loading = wc.isLoading();
    browserState[kind].can_go_back = wc.canGoBack();
    browserState[kind].can_go_forward = wc.canGoForward();
    if (url) {
      try { stateStore.updateBrowser(kind, url); } catch (_error) {}
    }
    emitState();
  };
  wc.on("did-navigate", changed);
  wc.on("did-navigate-in-page", changed);
  wc.on("page-title-updated", changed);
  wc.on("did-start-loading", () => { browserState[kind].loading = true; emitState(); });
  wc.on("did-stop-loading", () => {
    browserState[kind].loading = false;
    changed();
    setTimeout(() => probeAuthentication(kind).catch(error => appendLog("AUTH_SESSION_PROBE_FAILED", { kind, error: String(error && error.message || error) })), 500);
  });
  wc.on("render-process-gone", (_event, details) => {
    appendLog("BROWSER_RENDER_PROCESS_GONE", { kind, reason: details && details.reason, exit_code: details && details.exitCode });
    browserState[kind].created = false;
    views[kind] = null;
    emitState();
  });
}
async function probeAuthentication(kindValue) {
  const kind = kindValue === "ANALYZER" ? "ANALYZER" : "WORKER";
  const view = views[kind];
  if (!sessionRestore || !view || view.webContents.isDestroyed()) return null;
  const script = kind === "ANALYZER"
    ? `(() => {
        const host=location.hostname.toLowerCase(); const path=location.pathname||"/";
        const account=Boolean(document.querySelector('a[href*="SignOutOptions"],a[href*="ManageAccount"],[aria-label*="Google Account"],[aria-label*="Google 계정"]'));
        const login=host==="accounts.google.com" && /signin|identifier|challenge/i.test(path);
        return {observed:true,authenticated:(host==="www.google.com"||host.endsWith(".google.com"))&&!login&&account,host,path,authenticated_marker:account?"GOOGLE_ACCOUNT_CONTROL":"NONE"};
      })()`
    : `(() => {
        const host=location.hostname.toLowerCase(); const path=location.pathname||"/";
        const account=Boolean(document.querySelector('[data-testid="profile-button"],[data-testid="user-avatar"],[data-testid="accounts-profile-button"]'))||Array.from(document.querySelectorAll('button,[role="button"]')).some(node=>/account|profile|계정|프로필/i.test(node.getAttribute('aria-label')||""));
        const login=/\/auth\/(?:login|signup)|\/login|\/signup/i.test(path);
        return {observed:true,authenticated:host==="chatgpt.com"&&!login&&account,host,path,authenticated_marker:account?"CHATGPT_ACCOUNT_OR_WORKSPACE_CONTROL":"NONE"};
      })()`;
  const result = await view.webContents.executeJavaScript(script, true);
  const receipt = sessionRestore.recordAuthProbe(kind, result || {});
  appendLog("AUTH_SESSION_PROBE", { kind, authenticated: Boolean(result && result.authenticated), host: String(result && result.host || ""), path: String(result && result.path || ""), secret_export_count: 0, terminal: receipt.terminal });
  emitState();
  return receipt;
}
function ensureView(kindValue) {
  const kind = kindValue === "ANALYZER" ? "ANALYZER" : "WORKER";
  let view = views[kind];
  if (view && !view.webContents.isDestroyed()) return view;
  session.fromPartition(viewPartition(kind), { cache: true });
  view = new BrowserView({
    webPreferences: {
      partition: viewPartition(kind),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: true,
      spellcheck: true
    }
  });
  views[kind] = view;
  browserState[kind].created = true;
  configureView(kind, view);
  const url = normalizeUrl(initialUrl(kind), kind === "ANALYZER" ? "https://www.google.com" : "https://chatgpt.com/projects");
  view.webContents.loadURL(url).catch(error => appendLog("BROWSER_INITIAL_LOAD_FAILED", { kind, url, error: String(error && error.message || error) }));
  return view;
}
function setBounds(view) {
  if (!view || view.webContents.isDestroyed()) return;
  const bounds = {
    x: Math.max(0, Math.round(Number(lastBounds.x || 0))),
    y: Math.max(0, Math.round(Number(lastBounds.y || 0))),
    width: Math.max(200, Math.round(Number(lastBounds.width || 800))),
    height: Math.max(160, Math.round(Number(lastBounds.height || 600)))
  };
  view.setBounds(bounds);
  view.setAutoResize({ width: true, height: true, horizontal: false, vertical: false });
}
function detachBrowserView(reason = "UI_OVERLAY") {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const current = views[activeKind];
  if (current && !current.webContents.isDestroyed()) {
    try { mainWindow.removeBrowserView(current); }
    catch (_error) { try { mainWindow.setBrowserView(null); } catch (_ignored) {} }
  }
  for (const key of Object.keys(browserState)) browserState[key].attached = false;
  appendLog("BROWSER_VIEW_DETACHED", { reason, active_kind: activeKind });
  emitState();
}
function setBrowserSuppressed(suppressed, reason = "UI_OVERLAY") {
  browserSuppressedForUi = Boolean(suppressed);
  if (browserSuppressedForUi) {
    detachBrowserView(reason);
  } else if (mainWindow && !mainWindow.isDestroyed()) {
    attachView(activeKind);
  }
  return { ok: true, suppressed: browserSuppressedForUi, active_kind: activeKind };
}
function attachView(kindValue) {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  const kind = kindValue === "ANALYZER" ? "ANALYZER" : "WORKER";
  const view = ensureView(kind);
  activeKind = kind;
  if (browserSuppressedForUi) {
    for (const key of Object.keys(browserState)) browserState[key].attached = false;
    updateBrowserState(kind);
    return view;
  }
  mainWindow.setBrowserView(view);
  for (const key of Object.keys(browserState)) browserState[key].attached = key === kind;
  setBounds(view);
  updateBrowserState(kind);
  return view;
}
async function navigate(kindValue, urlValue) {
  const kind = kindValue === "ANALYZER" ? "ANALYZER" : "WORKER";
  const fallback = kind === "ANALYZER" ? "https://www.google.com" : "https://chatgpt.com/projects";
  const url = normalizeUrl(urlValue, fallback);
  const view = ensureView(kind);
  if (mainWindow && !mainWindow.isDestroyed()) attachView(kind);
  if (view.webContents.getURL() !== url) await view.webContents.loadURL(url);
  try { stateStore.updateBrowser(kind, url); } catch (_error) {}
  updateBrowserState(kind);
  return publicState();
}
async function browserControl(payload) {
  const kind = payload && payload.kind === "ANALYZER" ? "ANALYZER" : "WORKER";
  const view = attachView(kind);
  const action = cleanText(payload && payload.action, 30).toLowerCase();
  if (action === "navigate") return navigate(kind, payload.url);
  if (action === "back" && view.webContents.canGoBack()) view.webContents.goBack();
  if (action === "forward" && view.webContents.canGoForward()) view.webContents.goForward();
  if (action === "refresh") view.webContents.reload();
  if (action === "home") await navigate(kind, kind === "ANALYZER" ? "https://www.google.com" : "https://chatgpt.com/projects");
  updateBrowserState(kind);
  return publicState();
}
async function navigateWorkerForDispatch(url, roleId) {
  stateStore.selectRole(roleId);
  emitState();
  await navigate("WORKER", url);
  return views.WORKER;
}
function createWindow() {
  const options = {
    width: 1500,
    height: 940,
    minWidth: 1040,
    minHeight: 680,
    show: !IS_SMOKE_TEST,
    backgroundColor: "#f8fafc",
    title: "AI YOLLA Workspace V6",
    webPreferences: {
      preload: path.join(RELEASE_ROOT, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  };
  mainWindow = new BrowserWindow(sessionRestore ? sessionRestore.windowOptions("panel", options) : options);
  if (sessionRestore) {
    sessionRestore.applyWindowState("panel", mainWindow);
    sessionRestore.trackWindow("panel", mainWindow);
  }
  mainWindow.loadFile(path.join(RELEASE_ROOT, "index.html"));
  mainWindow.on("closed", () => {
    for (const kind of Object.keys(views)) {
      const view = views[kind];
      if (view && !view.webContents.isDestroyed()) view.webContents.destroy();
      views[kind] = null;
    }
    mainWindow = null;
  });
}
function moduleActionContext() {
  return {
    workspace: stateStore.snapshot(),
    browser: JSON.parse(JSON.stringify(browserState)),
    c_mode: cSummary(),
    commands: schedulerSummary(),
    upstream_receipts: {}
  };
}
function initializeModuleHost() {
  moduleHost = new V6ModuleHost({
    releaseRoot: RELEASE_ROOT,
    appendLog,
    adapters: {
      "commander-worker-menu": {
        perform: async (action, payload = {}) => {
          if (action === "SELECT_GROUP") stateStore.selectGroup(payload.group_id);
          else if (action === "SELECT_ROLE") {
            const state = stateStore.selectRole(payload.role_id);
            const role = state.roles[state.selected_role_id];
            if (role) await navigate("WORKER", role.context_url || role.project_url);
          }
          else if (action === "ADD_GROUP") stateStore.addGroup(payload);
          else if (action === "UPDATE_GROUP") stateStore.updateGroup(payload);
          else if (action === "DELETE_GROUP") stateStore.deleteGroup(payload.group_id);
          else if (action === "ADD_ROLE") stateStore.addRole(payload);
          else if (action === "UPDATE_ROLE") stateStore.updateRole(payload);
          else if (action === "DELETE_ROLE") stateStore.deleteRole(payload.role_id);
          else if (action === "ASSIGN_CURRENT_WORKER") return assignCurrentWorker(payload);
          else if (action === "OPEN_COMMANDS") return { ok: true, directive: "OPEN_COMMANDS" };
          else throw new Error(`B1_HOST_ACTION_NOT_ALLOWED:${action}`);
          emitState();
          return publicState();
        }
      },
      "site-analyzer": {
        perform: async (action, payload = {}) => {
          if (action === "REGISTER_SITE") stateStore.registerSite({ ...payload, url: payload.url || browserState.ANALYZER.url });
          else if (action === "DELETE_SITE") stateStore.deleteSite(payload.site_id);
          else if (action === "SELECT_SITE") stateStore.selectSite(payload.site_id);
          else if (action === "NAVIGATE_ANALYZER") return navigate("ANALYZER", payload.url);
          else throw new Error(`V2_HOST_ACTION_NOT_ALLOWED:${action}`);
          emitState();
          return publicState();
        }
      }
    }
  });
  const status = moduleHost.load();
  appendLog("V6_MODULE_HOST_BOUND", { status });
}
function initializeRuntimes() {
  dispatcher = new ChatGptDispatcher({
    stateRoot: STATE_ROOT,
    getWorkerView: () => ensureView("WORKER"),
    navigateWorker: navigateWorkerForDispatch,
    getRole,
    setRoleStatus: updateRoleStatus,
    appendLog
  });
  cMode = createCModeRuntime({
    stateRoot: STATE_ROOT,
    getRegistry: () => stateStore.toCRegistry(),
    getWorkspaceState: () => stateStore.toCWorkspace(),
    dispatchToRole: request => dispatcher.dispatch(request),
    getActiveRoles: () => dispatcher.getActiveRoles(),
    releaseRole: (roleId, reason) => dispatcher.releaseRole(roleId, reason),
    appendLog,
    emit: () => emitState(),
    shell
  });
  scheduler = new CommandScheduler({
    stateRoot: STATE_ROOT,
    dispatchToRole: request => dispatcher.dispatch(request),
    getCompletionSnapshot: () => cSummary() || {},
    appendLog,
    emit: () => emitState()
  });
}
function registerIpc() {
  ipcMain.handle("v6:get-state", () => publicState());
  ipcMain.handle("v6:set-mode", async (_event, payload) => {
    const mode = payload && payload.mode === "ANALYZER" ? "ANALYZER" : "CONTEXTS";
    stateStore.setMode(mode);
    attachView(mode === "ANALYZER" ? "ANALYZER" : "WORKER");
    return publicState();
  });
  ipcMain.handle("v6:select-group", (_event, payload) => { stateStore.selectGroup(payload && payload.group_id); emitState(); return publicState(); });
  ipcMain.handle("v6:select-role", async (_event, payload) => {
    const state = stateStore.selectRole(payload && payload.role_id);
    const role = state.roles[state.selected_role_id];
    if (role) await navigate("WORKER", role.context_url || role.project_url);
    emitState();
    return publicState();
  });
  ipcMain.handle("v6:add-group", (_event, payload) => { stateStore.addGroup(payload || {}); emitState(); return publicState(); });
  ipcMain.handle("v6:update-group", (_event, payload) => { stateStore.updateGroup(payload || {}); emitState(); return publicState(); });
  ipcMain.handle("v6:delete-group", (_event, payload) => { stateStore.deleteGroup(payload && payload.group_id); emitState(); return publicState(); });
  ipcMain.handle("v6:add-role", (_event, payload) => { stateStore.addRole(payload || {}); emitState(); return publicState(); });
  ipcMain.handle("v6:update-role", (_event, payload) => { stateStore.updateRole(payload || {}); emitState(); return publicState(); });
  ipcMain.handle("v6:delete-role", (_event, payload) => { stateStore.deleteRole(payload && payload.role_id); emitState(); return publicState(); });
  ipcMain.handle("v6:browser-control", (_event, payload) => browserControl(payload || {}));
  ipcMain.handle("v6:set-browser-suppressed", (_event, payload) => setBrowserSuppressed(Boolean(payload && payload.suppressed), cleanText(payload && payload.reason || "UI_OVERLAY", 80)));
  ipcMain.handle("v6:layout", (_event, payload) => {
    const bounds = payload && payload.bounds || {};
    lastBounds = { x: Number(bounds.x || 0), y: Number(bounds.y || 0), width: Number(bounds.width || 800), height: Number(bounds.height || 600) };
    setBounds(views[activeKind]);
    return { ok: true, bounds: lastBounds };
  });
  ipcMain.handle("v6:rendered", (_event, payload) => {
    rendered = true;
    writeRuntimeReceipt("PASS", { terminal: "YOLLA_V6_RENDERER_PASS", renderer: payload || {} });
    if (!IS_SMOKE_TEST) {
      const mode = stateStore.snapshot().selected_mode;
      attachView(mode === "ANALYZER" ? "ANALYZER" : "WORKER");
    } else {
      setTimeout(() => app.quit(), 500);
    }
    return publicState();
  });
  ipcMain.handle("v6:register-site", (_event, payload) => {
    const current = browserState.ANALYZER.url;
    stateStore.registerSite({ ...(payload || {}), url: payload && payload.url || current });
    emitState();
    return publicState();
  });
  ipcMain.handle("v6:delete-site", (_event, payload) => { stateStore.deleteSite(payload && payload.site_id); emitState(); return publicState(); });
  ipcMain.handle("v6:open-state-folder", () => { ensureDir(STATE_ROOT); shell.openPath(STATE_ROOT); return { ok: true, path: STATE_ROOT }; });
  ipcMain.handle("v6:assign-current-worker", (_event, payload) => assignCurrentWorker(payload || {}));
  ipcMain.handle("v6:log-analyzer:open", () => { createLogAnalyzerWindow(); return { ok: true }; });
  ipcMain.handle("v6:log-analyzer:get-snapshot", () => logAnalyzerSnapshot());
  ipcMain.handle("v6:log-analyzer:export", () => exportDiagnosticBundle());
  ipcMain.handle("v6:log-analyzer:open-folder", () => { ensureDir(STATE_ROOT); shell.openPath(STATE_ROOT); return { ok: true, path: STATE_ROOT }; });
  ipcMain.handle("v6:module:get-state", (_event, payload) => {
    const moduleId = cleanText(payload && payload.module_id, 100);
    const modules = moduleHost ? moduleHost.snapshot(moduleActionContext()) : {};
    if (!modules[moduleId]) throw new Error(`MODULE_NOT_FOUND:${moduleId}`);
    return modules[moduleId];
  });
  ipcMain.handle("v6:module:action", async (_event, payload) => {
    if (!moduleHost) throw new Error("MODULE_HOST_NOT_READY");
    const result = await moduleHost.handleAction(cleanText(payload && payload.module_id, 100), cleanText(payload && payload.action, 100), payload && payload.payload || {}, moduleActionContext());
    emitState();
    return result;
  });
  ipcMain.handle("v6:c:start", async (_event, payload) => {
    const groupId = String(payload && payload.group_id || stateStore.snapshot().selected_group_id || "").toUpperCase();
    const state = stateStore.snapshot();
    const group = state.groups[groupId];
    if (!group) throw new Error(`GROUP_NOT_FOUND:${groupId}`);
    const repository = cleanText(payload && payload.repository || group.authority_repository, 300);
    const controlPr = Number(payload && payload.control_pr || group.authority_pr || 0);
    if (payload && (payload.repository != null || payload.control_pr != null)) {
      stateStore.updateGroup({ group_id: groupId, authority_repository: repository, authority_pr: controlPr });
    }
    const result = await cMode.start({ group_id: groupId, repository, control_pr: controlPr });
    emitState();
    return result;
  });
  ipcMain.handle("v6:c:pause", () => { const value = cMode.pause(); emitState(); return value; });
  ipcMain.handle("v6:c:resume", () => { const value = cMode.resume(); emitState(); return value; });
  ipcMain.handle("v6:c:stop", () => { const value = cMode.stop(); emitState(); return value; });
  ipcMain.handle("v6:c:tick", async () => { const value = await cMode.tick(); emitState(); return value; });
  ipcMain.handle("v6:commands:configure", (_event, payload) => { const value = scheduler.configure(payload || {}); emitState(); return value; });
  ipcMain.handle("v6:commands:enable", (_event, payload) => { const value = scheduler.setEnabled(cleanText(payload && payload.command_id, 160), Boolean(payload && payload.enabled)); emitState(); return value; });
  ipcMain.handle("v6:commands:delete", (_event, payload) => { const value = scheduler.remove(cleanText(payload && payload.command_id, 160)); emitState(); return value; });
  ipcMain.handle("v6:commands:tick", async () => { const value = await scheduler.tick(); emitState(); return value; });
  ipcMain.handle("v6:commands:send-now", async (_event, payload) => {
    const targets = Array.isArray(payload && payload.targets) ? payload.targets : [];
    const message = cleanText(payload && payload.message, 50000);
    if (!message) throw new Error("COMMAND_MESSAGE_REQUIRED");
    if (!targets.length) throw new Error("COMMAND_TARGETS_REQUIRED");
    const results = [];
    for (const roleId of targets) {
      try { results.push(await dispatcher.dispatch({ role_id: roleId, kind: "USER_IMMEDIATE_COMMAND", prompt: message, dispatch_id: `manual-${Date.now()}-${crypto.randomBytes(3).toString("hex")}` })); }
      catch (error) { results.push({ accepted: false, role_id: roleId, error: String(error && error.message || error) }); }
    }
    emitState();
    return { results };
  });
}

app.whenReady().then(() => {
  [STATE_ROOT, PROFILE_ROOT, LOG_ROOT, RECEIPT_ROOT].forEach(ensureDir);
  const loadedState = stateStore.load();
  activeKind = loadedState.selected_mode === "ANALYZER" ? "ANALYZER" : "WORKER";
  sessionRestore = new SessionRestoreManager({ stateRoot: STATE_ROOT, profileRoot: PROFILE_ROOT, receiptRoot: RECEIPT_ROOT, workerPartition: WORKER_PARTITION, analyzerPartition: ANALYZER_PARTITION, screen, appendLog });
  sessionRestore.load(loadedState);
  initializeRuntimes();
  initializeModuleHost();
  registerIpc();
  createWindow();
  if (!IS_SMOKE_TEST && sessionRestore.shouldOpenLogWindow()) createLogAnalyzerWindow();
  appendLog("RUNTIME_STARTED", { app_version: APP_VERSION, v6_root: V6_ROOT, release_root: RELEASE_ROOT, state_root: STATE_ROOT, profile_root: PROFILE_ROOT, existing_runtime_preserved: true, legacy_write_count: 0 });
  writeRuntimeReceipt("STARTING");
}).catch(error => {
  try { writeRuntimeReceipt("FAIL", { error: String(error && error.stack || error) }); } catch (_error) {}
  dialog.showErrorBox("AI YOLLA V6 시작 실패", String(error && error.stack || error));
  app.quit();
});

app.on("activate", () => { if (!mainWindow) createWindow(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("before-quit", () => { if (sessionRestore) sessionRestore.markQuitting(); appendLog("RUNTIME_STOPPING", { smoke_test: IS_SMOKE_TEST }); if (!IS_SMOKE_TEST) writeRuntimeReceipt("STOPPED"); });
