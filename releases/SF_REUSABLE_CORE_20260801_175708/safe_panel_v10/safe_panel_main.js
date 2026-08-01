/* eslint-env node */
"use strict";

const { app, BrowserWindow, BrowserView, ipcMain, screen, shell, Menu, session, clipboard } = require("electron");
const fs = require("fs");
const path = require("path");
const { registerSafePanelV0106RecoveryIpcHandlers } = require("./ipc/safePanelV0106RecoveryHandlers");
/* STAGE4_BINDING_REQUIRE_PATCH_START */
const { createStage4StationBindingHandlers } = require("./ipc/stage4StationBindingHandlers");
/* STAGE4_BINDING_REQUIRE_PATCH_END */

/* ST4_W33_PROMPT_QUEUE_DEPS_REQUIRE_PATCH_START */
const promptQueueManager = require("../src/shared/stage4/promptQueueManager");
const sequentialPromptSender = require("../src/shared/stage4/sequentialPromptSender");
const promptPackageVersionManager = require("../src/shared/stage4/promptPackageVersionManager");
const workerOutputBatchStore = require("../src/shared/stage4/stores/workerOutputBatchStore");

function normalizePromptPackageVersionForStage4(payload) {
  const input = payload && typeof payload === "object" ? payload : {};

  if (promptPackageVersionManager && typeof promptPackageVersionManager.validatePromptPackageVersionRecord === "function") {
    return promptPackageVersionManager.validatePromptPackageVersionRecord(input);
  }

  if (promptPackageVersionManager && typeof promptPackageVersionManager.createPromptPackageVersionRecord === "function") {
    return promptPackageVersionManager.createPromptPackageVersionRecord(input);
  }

  return {
    checked: true,
    prompt_package_id: input.prompt_package_id || input.promptPackageId || "",
    prompt_package_version: input.prompt_package_version || input.promptPackageVersion || ""
  };
}

function dispatchNextPromptViaSequentialSender(payload) {
  const input = payload && typeof payload === "object" ? payload : {};
  const queueInput = Array.isArray(input.items) || (input.queue && Array.isArray(input.queue.items))
    ? input
    : { items: [input] };

  if (sequentialPromptSender && typeof sequentialPromptSender.getNextDispatchPayload === "function") {
    return sequentialPromptSender.getNextDispatchPayload(queueInput, input);
  }

  if (sequentialPromptSender && typeof sequentialPromptSender.selectNextPrompt === "function") {
    return sequentialPromptSender.selectNextPrompt(queueInput, input);
  }

  if (sequentialPromptSender && typeof sequentialPromptSender.buildSequentialPromptDispatch === "function") {
    return sequentialPromptSender.buildSequentialPromptDispatch(input, input);
  }

  return {
    dispatched: false,
    reason: "NO_SEQUENTIAL_SENDER_HELPER_EXPORT_BOUND",
    prompt_package_id: input.prompt_package_id || input.promptPackageId || "",
    prompt_package_version: input.prompt_package_version || input.promptPackageVersion || ""
  };
}

const stage4PromptQueueDeps = {
  promptQueueManager,
  sequentialPromptSender,
  promptPackageVersionManager,
  workerOutputBatchStore,
  enqueuePrompt: promptQueueManager && promptQueueManager.enqueuePrompt,
  dispatchNextPrompt: dispatchNextPromptViaSequentialSender,
  selectNextPrompt: dispatchNextPromptViaSequentialSender,
  normalizePromptPackageVersion: normalizePromptPackageVersionForStage4,
  checkPromptPackageVersion: normalizePromptPackageVersionForStage4
};
/* ST4_W33_PROMPT_QUEUE_DEPS_REQUIRE_PATCH_END */



const VERSION = "v0.10.6";
const SOURCE_FACTORY_ROOT = path.join("D:", "SOURCE FACTORY");
const PROJECT_DIR = path.join(SOURCE_FACTORY_ROOT, "_PROJECTS", "STAGE4_DEFAULT_PROJECT");
const STATE_DIR = path.join(PROJECT_DIR, "PANEL_STATE");
const STATE_FILE = path.join(STATE_DIR, "safe_panel_only_v10_state.json");
const SAFE_PANEL_V0106_REPORT_ROOT = path.join(SOURCE_FACTORY_ROOT, "_STAGE4_LOGS", "safe_panel_v0106", "reports");
const SAFE_PANEL_V0106_GENERATED_ROOT = path.join(SOURCE_FACTORY_ROOT, "generated");
const DEFAULT_URL = "https://chatgpt.com/g/g-p-6a43a643a1148191ab9bc5697224e628/project";
const PROJECT_HOME_URL = DEFAULT_URL;
const DEFAULT_TAEO_TOP = 34;
const LAYOUT_FORCE_MIN_WORKER_WIDTH = 900;
const LAYOUT_FORCE_MIN_WORKER_HEIGHT = 330;
const LAYOUT_FORCE_MIN_COMMANDER_WIDTH = 900;
const LAYOUT_FORCE_MIN_COMMANDER_HEIGHT = 650;
const LAYOUT_REPEAT_DELAYS = [150, 500, 1200, 2500];

let panelWindow = null;
const terminalWindows = new Map();

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJsonSafe(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch (_err) {
    return fallback;
  }
}

function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function isPlainChatGptUrl(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  return raw === "https://chatgpt.com" || raw === "http://chatgpt.com" || raw === "chatgpt.com" || raw === "https://chatgpt.com/projects";
}

function normalizeConfig(config) {
  const base = Object.assign({
    commanderCount: 1,
    workerCount: 6,
    url: DEFAULT_URL,
    projectHomeUrl: DEFAULT_URL
  }, config || {});

  if (!base.url || isPlainChatGptUrl(base.url)) base.url = DEFAULT_URL;
  if (!base.projectHomeUrl || isPlainChatGptUrl(base.projectHomeUrl)) base.projectHomeUrl = DEFAULT_URL;
  return base;
}

function getConfig() {
  return normalizeConfig(readJsonSafe(STATE_FILE, {}));
}

function saveConfig(config) {
  const current = getConfig();
  writeJson(STATE_FILE, Object.assign({}, current, config, {
    updated_at: new Date().toISOString()
  }));
}

function clampCount(value, max) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return 0;
  return Math.max(0, Math.min(max, parsed));
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function normalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return DEFAULT_URL;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return raw;
  return "https://" + raw;
}

function createPanelWindow() {
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.focus();
    return panelWindow;
  }

  ensureDir(STATE_DIR);

  panelWindow = new BrowserWindow({
    width: 1120,
    height: 820,
    title: "Source Factory SAFE Panel Only v0.10.6",
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "safe_panel_preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  panelWindow.on("closed", () => {
    panelWindow = null;
  });

  panelWindow.loadFile(path.join(__dirname, "safe_panel.html"));
  return panelWindow;
}

function getTerminalKey(role, slot) {
  return `${role}:${slot}`;
}

function aliveTerminals() {
  for (const [key, win] of Array.from(terminalWindows.entries())) {
    if (!win || win.isDestroyed()) {
      terminalWindows.delete(key);
    }
  }

  return Array.from(terminalWindows.entries()).map(([key, win]) => ({
    key,
    id: win.id,
    role: win.__sfSafeRole || "unknown",
    slot: win.__sfSafeSlot || 0,
    title: win.getTitle(),
    url: win.__sfSafeCurrentUrl || ""
  })).sort((a, b) => {
    const order = { commander: 0, worker: 1, unknown: 2 };
    const ar = order[a.role] == null ? 2 : order[a.role];
    const br = order[b.role] == null ? 2 : order[b.role];
    if (ar !== br) return ar - br;
    return a.slot - b.slot;
  });
}

function sendTerminalCommand(win, command) {
  if (!win || win.isDestroyed()) return;
  try {
    win.webContents.send("sf-terminal-command", command);
  } catch (_err) {}
}

function sendTerminalUrlState(win, url, title) {
  if (!win || win.isDestroyed()) return;
  if (url) win.__sfSafeCurrentUrl = url;
  try {
    win.webContents.send("sf-terminal-url-state", {
      url: win.__sfSafeCurrentUrl || "",
      title: title || ""
    });
  } catch (_err) {}
}

function getTerminalFromSender(event) {
  if (!event || !event.sender) return null;
  return BrowserWindow.fromWebContents(event.sender);
}

function getTaeoTopOffset(win) {
  const value = win && win.__sfTaeoTopOffset;
  if (Number.isFinite(value) && value >= 24) return value;
  return DEFAULT_TAEO_TOP;
}

function updateTerminalBrowserViewBounds(win) {
  if (!win || win.isDestroyed() || !win.__sfSafeTaeoView) return;
  const view = win.__sfSafeTaeoView;
  const [contentWidth, contentHeight] = win.getContentSize();
  const top = getTaeoTopOffset(win);
  const visible = (win.__sfActiveTab || "taeo") === "taeo";

  try {
    if (visible) {
      if (typeof win.getBrowserView === "function" && win.getBrowserView() !== view) {
        win.setBrowserView(view);
      }
      view.setBounds({
        x: 0,
        y: Math.max(0, top),
        width: Math.max(1, contentWidth),
        height: Math.max(120, contentHeight - top)
      });
      view.setAutoResize({ width: true, height: true, horizontal: false, vertical: false });
    } else {
      view.setBounds({ x: 0, y: contentHeight + 200, width: 1, height: 1 });
    }
  } catch (_err) {}
}

function terminalNavigate(win, url) {
  if (!win || win.isDestroyed() || !win.__sfSafeTaeoView) return;
  const safeUrl = normalizeUrl(url || win.__sfSafeInitialUrl || DEFAULT_URL);
  win.__sfSafeCurrentUrl = safeUrl;
  try {
    win.__sfSafeTaeoView.webContents.loadURL(safeUrl);
  } catch (_err) {}
  sendTerminalUrlState(win, safeUrl, "");
}

function terminalHome(win) {
  if (!win || win.isDestroyed()) return;
  terminalNavigate(win, win.__sfSafeProjectHomeUrl || win.__sfSafeInitialUrl || DEFAULT_URL);
}

function terminalRefresh(win) {
  if (!win || win.isDestroyed() || !win.__sfSafeTaeoView) return;
  try {
    win.__sfSafeTaeoView.webContents.reload();
  } catch (_err) {}
}

async function terminalDiagnose(win) {
  if (!win || win.isDestroyed() || !win.__sfSafeTaeoView) return { ok: false, reason: "missing_view" };
  const view = win.__sfSafeTaeoView;
  const expected = PROJECT_HOME_URL;
  const current = view.webContents.getURL();
  const title = view.webContents.getTitle();
  let page = null;

  try {
    page = await view.webContents.executeJavaScript(`(() => {
      const bodyText = document.body ? document.body.innerText || "" : "";
      return {
        href: location.href,
        pathname: location.pathname,
        title: document.title,
        hasProjectWord: bodyText.includes("프로젝트") || bodyText.includes("Projects"),
        hasSourceFactoryProject: bodyText.includes("소스공장 프로젝트"),
        hasSidebarNewChat: bodyText.includes("새 채팅") || bodyText.includes("New chat")
      };
    })()`, true);
  } catch (err) {
    page = { error: String(err && err.message || err) };
  }

  const currentForCheck = page && page.href ? String(page.href) : String(current || "");
  const projectUrlMatched = currentForCheck.indexOf("/g/g-p-6a43a643a1148191ab9bc5697224e628/project") >= 0;
  const sourceProjectVisible = Boolean(page && page.hasSourceFactoryProject);
  const status = projectUrlMatched ? "PROJECT_HOME_URL_MATCHED" : (sourceProjectVisible ? "PROJECT_VISIBLE_NOT_OPENED" : "GENERAL_CHATGPT_OR_PROJECT_LIST");

  const result = {
    ok: true,
    status,
    expected_project_home: expected,
    current_url: current,
    title,
    page
  };
  sendTerminalCommand(win, { type: "diagnostic", result });
  return result;
}

function terminalSetTab(win, tab) {
  if (!win || win.isDestroyed()) return;
  const nextTab = tab === "lao" || tab === "taera" ? tab : "taeo";
  win.__sfActiveTab = nextTab;
  updateTerminalBrowserViewBounds(win);
  sendTerminalCommand(win, { type: "tab", tab: nextTab, source: "main" });
}

function terminalControl(win, command) {
  if (!win || win.isDestroyed() || !command) return { ok: false, reason: "missing_window_or_command" };
  if (command.type === "navigate") terminalNavigate(win, command.url || DEFAULT_URL);
  if (command.type === "home") terminalHome(win);
  if (command.type === "refresh") terminalRefresh(win);
  if (command.type === "tab") terminalSetTab(win, command.tab || "taeo");
  if (command.type === "fit") updateTerminalBrowserViewBounds(win);
  if (command.type === "diagnose") terminalDiagnose(win);
  if (command.type === "top-offset") {
    const next = Number(command.value);
    if (Number.isFinite(next) && next >= 24) {
      win.__sfTaeoTopOffset = next;
      updateTerminalBrowserViewBounds(win);
    }
  }
  return { ok: true };
}

function attachTaeoBrowserView(win) {
  if (!win || win.isDestroyed() || win.__sfSafeTaeoView) return;
  const ses = session.fromPartition(win.__sfSafePartition || "persist:sf4-safe-panel-terminal");
  const view = new BrowserView({
    webPreferences: {
      session: ses,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      spellcheck: true
    }
  });

  win.__sfSafeTaeoView = view;
  win.__sfActiveTab = "taeo";
  win.setBrowserView(view);
  updateTerminalBrowserViewBounds(win);

  view.webContents.on("did-start-loading", () => sendTerminalCommand(win, { type: "status", status: "LOADING" }));
  view.webContents.on("did-stop-loading", () => {
    sendTerminalCommand(win, { type: "status", status: "READY" });
    sendTerminalUrlState(win, view.webContents.getURL(), view.webContents.getTitle());
    updateTerminalBrowserViewBounds(win);
  });
  view.webContents.on("did-navigate", (_event, url) => sendTerminalUrlState(win, url, view.webContents.getTitle()));
  view.webContents.on("did-navigate-in-page", (_event, url) => sendTerminalUrlState(win, url, view.webContents.getTitle()));
  view.webContents.on("page-title-updated", (_event, title) => sendTerminalUrlState(win, view.webContents.getURL(), title));
  view.webContents.on("dom-ready", () => {
    sendTerminalUrlState(win, view.webContents.getURL(), view.webContents.getTitle());
    updateTerminalBrowserViewBounds(win);
  });

  terminalNavigate(win, win.__sfSafeInitialUrl || DEFAULT_URL);
}

function createTerminalMenu(win) {
  return Menu.buildFromTemplate([
    {
      label: "File",
      submenu: [
        { label: "소스공장 프로젝트 홈", click: () => terminalControl(win, { type: "home" }) },
        { label: "비상 새로고침", click: () => terminalControl(win, { type: "refresh" }) },
        { type: "separator" },
        { role: "close", label: "닫기" }
      ]
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo", label: "Undo" },
        { role: "redo", label: "Redo" },
        { type: "separator" },
        { role: "cut", label: "Cut" },
        { role: "copy", label: "Copy" },
        { role: "paste", label: "Paste" },
        { role: "selectAll", label: "Select All" }
      ]
    },
    { label: "태오창", click: () => terminalControl(win, { type: "tab", tab: "taeo" }) },
    { label: "라오창", click: () => terminalControl(win, { type: "tab", tab: "lao" }) },
    { label: "태라창", click: () => terminalControl(win, { type: "tab", tab: "taera" }) },
    {
      label: "Window",
      submenu: [
        { role: "minimize", label: "Minimize" },
        { role: "zoom", label: "Zoom" },
        { type: "separator" },
        { role: "front", label: "Front" }
      ]
    },
    {
      label: "Help",
      submenu: [
        { label: "Source Factory SAFE Terminal " + VERSION, enabled: false }
      ]
    }
  ]);
}

function createTerminal(role, slot, url, projectHomeUrl) {
  const isCommander = role === "commander";
  const displayName = (isCommander ? "커맨더 " : "워커 ") + pad2(slot);
  const title = displayName + " - Source Factory SAFE Terminal v0.10.6";
  const key = getTerminalKey(role, slot);
  const partition = `persist:sf4-safe-panel-${role}-${slot}`;

  const old = terminalWindows.get(key);
  if (old && !old.isDestroyed()) {
    old.focus();
    return old;
  }

  const win = new BrowserWindow({
    width: isCommander ? 1280 : 980,
    height: isCommander ? 900 : 420,
    title,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "safe_terminal_preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.__sfSafeRole = role;
  win.__sfSafeSlot = slot;
  win.__sfSafeTitle = title;
  win.__sfSafeInitialUrl = normalizeUrl(url || DEFAULT_URL);
  win.__sfSafeProjectHomeUrl = normalizeUrl(projectHomeUrl || url || DEFAULT_URL);
  win.__sfSafePartition = partition;
  win.__sfSafeCurrentUrl = win.__sfSafeInitialUrl;
  win.__sfTaeoTopOffset = DEFAULT_TAEO_TOP;
  win.__sfActiveTab = "taeo";
  try {
    win.setMinimumSize(isCommander ? LAYOUT_FORCE_MIN_COMMANDER_WIDTH : LAYOUT_FORCE_MIN_WORKER_WIDTH, isCommander ? LAYOUT_FORCE_MIN_COMMANDER_HEIGHT : LAYOUT_FORCE_MIN_WORKER_HEIGHT);
  } catch (_err) {}

  win.setMenu(null);
  terminalWindows.set(key, win);

  win.on("closed", () => {
    terminalWindows.delete(key);
  });

  win.webContents.on("did-finish-load", () => {
    if (!win.isDestroyed()) {
      win.setTitle(title);
      sendTerminalUrlState(win, win.__sfSafeCurrentUrl || win.__sfSafeInitialUrl, "");
      updateTerminalBrowserViewBounds(win);
    }
  });

  win.on("resize", () => updateTerminalBrowserViewBounds(win));
  win.on("maximize", () => updateTerminalBrowserViewBounds(win));
  win.on("unmaximize", () => updateTerminalBrowserViewBounds(win));
  win.on("restore", () => updateTerminalBrowserViewBounds(win));
  win.once("ready-to-show", () => {
    try { if (!win.isVisible()) win.show(); } catch (_err) {}
    updateTerminalBrowserViewBounds(win);
  });

  win.loadFile(path.join(__dirname, "safe_terminal.html"));
  attachTaeoBrowserView(win);
  return win;
}

function closeTerminals() {
  const closed = [];

  for (const [key, win] of Array.from(terminalWindows.entries())) {
    if (!win || win.isDestroyed()) {
      terminalWindows.delete(key);
      continue;
    }

    closed.push({
      key,
      id: win.id,
      role: win.__sfSafeRole || "unknown",
      slot: win.__sfSafeSlot || 0,
      title: win.getTitle()
    });

    try {
      win.close();
    } catch (_err) {
      try { win.destroy(); } catch (_destroyErr) {}
    }

    terminalWindows.delete(key);
  }

  return {
    ok: true,
    closed_count: closed.length,
    closed
  };
}


function sortDisplaysLeftToRight(displays) {
  return displays.slice().sort((a, b) => {
    const ax = a.workArea && Number.isFinite(a.workArea.x) ? a.workArea.x : 0;
    const bx = b.workArea && Number.isFinite(b.workArea.x) ? b.workArea.x : 0;
    if (ax !== bx) return ax - bx;
    const ay = a.workArea && Number.isFinite(a.workArea.y) ? a.workArea.y : 0;
    const by = b.workArea && Number.isFinite(b.workArea.y) ? b.workArea.y : 0;
    return ay - by;
  });
}

function getLayoutDisplays() {
  const primary = screen.getPrimaryDisplay();
  const all = sortDisplaysLeftToRight(screen.getAllDisplays());
  const others = all.filter((display) => display.id !== primary.id);
  return { primary, all, others };
}

function boundsForGroup(area, count, index, preferredRows, options) {
  const total = Math.max(1, count);
  const opts = options || {};
  let cols = 1;
  let rows = total;
  if (preferredRows && total > preferredRows) {
    rows = preferredRows;
    cols = Math.ceil(total / rows);
  }
  const col = Math.floor(index / rows);
  const row = index % rows;
  const gap = Number.isFinite(opts.gap) ? opts.gap : 6;
  const minW = Number.isFinite(opts.minWidth) ? opts.minWidth : 720;
  const minH = Number.isFinite(opts.minHeight) ? opts.minHeight : 320;
  const rawCellW = Math.floor(area.width / cols);
  const rawCellH = Math.floor(area.height / rows);
  const cellW = Math.max(minW, rawCellW - gap);
  const cellH = Math.max(minH, rawCellH - gap);
  return {
    x: Math.round(area.x + col * rawCellW),
    y: Math.round(area.y + row * rawCellH),
    width: Math.round(cellW),
    height: Math.round(cellH)
  };
}

function setWindowBoundsAndFit(win, bounds) {
  if (!win || win.isDestroyed() || !bounds) return;
  try {
    const next = {
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.max(320, Math.round(bounds.width)),
      height: Math.max(240, Math.round(bounds.height))
    };
    win.setBounds(next, false);
    if (!win.isVisible()) win.show();
    win.moveTop();
    updateTerminalBrowserViewBounds(win);
  } catch (_err) {}
}

function splitWorkersForTwoDisplays(workers) {
  const firstCount = Math.ceil(workers.length / 2);
  return [workers.slice(0, firstCount), workers.slice(firstCount)];
}

function scheduleLayoutLockRepeats() {
  LAYOUT_REPEAT_DELAYS.forEach((delay) => {
    setTimeout(() => {
      try { arrangeWindows(); } catch (_err) {}
    }, delay);
  });
}


function arrangeMultiMonitorLayout(terminals) {
  const displays = getLayoutDisplays();
  const primaryArea = displays.primary.workArea;
  const workerDisplays = displays.others.slice(0, 2);

  const panel = createPanelWindow();
  const commanders = terminals.filter((item) => item.role === "commander");
  const workers = terminals.filter((item) => item.role === "worker");

  const panelWidth = Math.max(420, Math.min(620, Math.floor(primaryArea.width * 0.32)));
  panel.setBounds({
    x: primaryArea.x,
    y: primaryArea.y,
    width: panelWidth,
    height: primaryArea.height
  });

  const commanderArea = {
    x: primaryArea.x + panelWidth,
    y: primaryArea.y,
    width: Math.max(600, primaryArea.width - panelWidth),
    height: primaryArea.height
  };

  commanders.forEach((item, index) => {
    const win = terminalWindows.get(item.key);
    setWindowBoundsAndFit(win, boundsForGroup(commanderArea, commanders.length, index, 2, { minWidth: LAYOUT_FORCE_MIN_COMMANDER_WIDTH, minHeight: LAYOUT_FORCE_MIN_COMMANDER_HEIGHT }));
  });

  if (workerDisplays.length >= 2) {
    const groups = splitWorkersForTwoDisplays(workers);
    workerDisplays.forEach((display, displayIndex) => {
      const group = groups[displayIndex] || [];
      const area = display.workArea;
      group.forEach((item, index) => {
        const win = terminalWindows.get(item.key);
        setWindowBoundsAndFit(win, boundsForGroup(area, group.length, index, 3, { minWidth: LAYOUT_FORCE_MIN_WORKER_WIDTH, minHeight: LAYOUT_FORCE_MIN_WORKER_HEIGHT }));
      });
    });
  } else if (workerDisplays.length === 1) {
    const area = workerDisplays[0].workArea;
    workers.forEach((item, index) => {
      const win = terminalWindows.get(item.key);
      setWindowBoundsAndFit(win, boundsForGroup(area, workers.length, index, 3, { minWidth: LAYOUT_FORCE_MIN_WORKER_WIDTH, minHeight: LAYOUT_FORCE_MIN_WORKER_HEIGHT }));
    });
  } else {
    const fallbackArea = commanderArea;
    const commanderCount = Math.max(1, commanders.length);
    const workerArea = {
      x: fallbackArea.x,
      y: fallbackArea.y + Math.floor(fallbackArea.height / Math.max(2, commanderCount + 1)),
      width: fallbackArea.width,
      height: Math.max(300, fallbackArea.height - Math.floor(fallbackArea.height / Math.max(2, commanderCount + 1)))
    };
    workers.forEach((item, index) => {
      const win = terminalWindows.get(item.key);
      setWindowBoundsAndFit(win, boundsForGroup(workerArea, workers.length, index, 3, { minWidth: LAYOUT_FORCE_MIN_WORKER_WIDTH, minHeight: LAYOUT_FORCE_MIN_WORKER_HEIGHT }));
    });
  }

  return {
    ok: true,
    mode: "layout_lock_main_panel_commander_workers_2_3",
    display_count: displays.all.length,
    worker_display_count: workerDisplays.length,
    terminal_count: terminals.length,
    commander_count: commanders.length,
    worker_count: workers.length,
    panelWidth,
    primary_display_id: displays.primary.id,
    worker_display_ids: workerDisplays.map((display) => display.id),
    displays: displays.all.map((display) => ({ id: display.id, scaleFactor: display.scaleFactor, workArea: display.workArea }))
  };
}

function arrangeWindows() {
  const terminals = aliveTerminals();
  const displays = getLayoutDisplays();

  if (displays.all.length >= 2) {
    return arrangeMultiMonitorLayout(terminals);
  }

  const display = screen.getPrimaryDisplay();
  const area = display.workArea;

  const panel = createPanelWindow();
  const panelWidth = terminals.length ? Math.max(500, Math.min(700, Math.floor(area.width * 0.34))) : Math.min(1120, area.width);
  const panelHeight = area.height;

  panel.setBounds({
    x: area.x,
    y: area.y,
    width: panelWidth,
    height: panelHeight
  });

  if (!terminals.length) {
    return { ok: true, mode: "panel_only", display_count: displays.all.length, terminal_count: 0, panelWidth };
  }

  const terminalX = area.x + panelWidth;
  const terminalWidth = Math.max(560, area.width - panelWidth);
  const cols = terminals.length <= 2 ? 1 : 2;
  const rows = Math.ceil(terminals.length / cols);
  const cellW = Math.max(560, Math.floor(terminalWidth / cols));
  const cellH = Math.max(420, Math.floor(area.height / rows));

  terminals.forEach((item, index) => {
    const win = terminalWindows.get(item.key);
    if (!win || win.isDestroyed()) return;
    const col = index % cols;
    const row = Math.floor(index / cols);
    setWindowBoundsAndFit(win, {
      x: terminalX + col * cellW,
      y: area.y + row * cellH,
      width: Math.max(cellW, LAYOUT_FORCE_MIN_WORKER_WIDTH),
      height: Math.max(cellH, LAYOUT_FORCE_MIN_WORKER_HEIGHT)
    });
  });

  return {
    ok: true,
    mode: "single_display_fallback_panel_plus_terminals",
    display_count: displays.all.length,
    terminal_count: terminals.length,
    cols,
    rows,
    panelWidth,
    terminalWidth
  };
}

function launchTerminals(options) {
  const commanderCount = clampCount(options && options.commanderCount, 10);
  const workerCount = clampCount(options && options.workerCount, 30);
  let url = normalizeUrl(options && options.url ? String(options.url) : DEFAULT_URL);
  if (isPlainChatGptUrl(url)) url = DEFAULT_URL;
  let projectHomeUrl = normalizeUrl(options && options.projectHomeUrl ? String(options.projectHomeUrl) : url);
  if (isPlainChatGptUrl(projectHomeUrl)) projectHomeUrl = DEFAULT_URL;
  const resetExisting = options && options.resetExisting === false ? false : true;

  saveConfig({ commanderCount, workerCount, url, projectHomeUrl });

  const closeResult = resetExisting ? closeTerminals() : { closed_count: 0, closed: [] };
  const opened = [];

  for (let i = 1; i <= commanderCount; i += 1) {
    const win = createTerminal("commander", i, url, projectHomeUrl);
    opened.push({ id: win.id, role: "commander", slot: i });
  }

  for (let i = 1; i <= workerCount; i += 1) {
    const win = createTerminal("worker", i, url, projectHomeUrl);
    opened.push({ id: win.id, role: "worker", slot: i });
  }

  const arrange = arrangeWindows();
  scheduleLayoutLockRepeats();

  return {
    ok: true,
    commanderCount,
    workerCount,
    url,
    projectHomeUrl,
    resetExisting,
    closed_count: closeResult.closed_count,
    opened_count: opened.length,
    opened,
    arrange
  };
}

function getStatus() {
  const terminals = aliveTerminals();
  const commanderOpen = terminals.filter((item) => item.role === "commander").length;
  const workerOpen = terminals.filter((item) => item.role === "worker").length;
  return {
    ok: true,
    mode: "SAFE_PANEL_ONLY_SIDEAPP_V0106_MONITOR_LAYOUT_LOCK",
    config: getConfig(),
    panel_open: Boolean(panelWindow && !panelWindow.isDestroyed()),
    terminal_count: terminals.length,
    commander_open: commanderOpen,
    worker_open: workerOpen,
    terminals,
    state_file: STATE_FILE,
    project_dir: PROJECT_DIR
  };
}

function openStateFolder() {
  ensureDir(STATE_DIR);
  shell.openPath(STATE_DIR);
  return { ok: true, path: STATE_DIR };
}

function openProjectFolder() {
  ensureDir(PROJECT_DIR);
  shell.openPath(PROJECT_DIR);
  return { ok: true, path: PROJECT_DIR };
}

function getTerminalConfig(event) {
  const win = getTerminalFromSender(event);
  if (!win) return null;
  return {
    ok: true,
    version: VERSION,
    role: win.__sfSafeRole || "unknown",
    slot: win.__sfSafeSlot || 0,
    title: win.__sfSafeTitle || win.getTitle(),
    initialUrl: win.__sfSafeInitialUrl || DEFAULT_URL,
    projectHomeUrl: win.__sfSafeProjectHomeUrl || win.__sfSafeInitialUrl || DEFAULT_URL,
    partition: win.__sfSafePartition || "persist:sf4-safe-panel-terminal"
  };
}

function updateTerminalUrl(event, payload) {
  const win = getTerminalFromSender(event);
  if (!win) return { ok: false, error: "window_not_found" };
  const url = payload && payload.url ? String(payload.url) : "";
  if (url) win.__sfSafeCurrentUrl = url;
  return { ok: true, url: win.__sfSafeCurrentUrl || "" };
}

function registerHandlers() {
  ipcMain.handle("sf-safe-panel-status", () => getStatus());
  ipcMain.handle("sf-safe-panel-launch", (_event, options) => launchTerminals(options || {}));
  ipcMain.handle("sf-safe-panel-close-terminals", () => closeTerminals());
  ipcMain.handle("sf-safe-panel-arrange", () => arrangeWindows());
  ipcMain.handle("sf-safe-panel-open-state-folder", () => openStateFolder());
  ipcMain.handle("sf-safe-panel-open-project-folder", () => openProjectFolder());
  ipcMain.handle("sf-terminal-get-config", (event) => getTerminalConfig(event));
  ipcMain.handle("sf-terminal-url-update", (event, payload) => updateTerminalUrl(event, payload || {}));
  ipcMain.handle("sf-terminal-control", (event, command) => terminalControl(getTerminalFromSender(event), command || {}));
/* STAGE4_BINDING_REGISTER_PATCH_START */
  if (!global.__SF_STAGE4_SAFE_PANEL_V10_IPC_REGISTERED__) {
    const __sfStage4Handlers = createStage4StationBindingHandlers(stage4PromptQueueDeps);
    Object.keys(__sfStage4Handlers).forEach((channel) => ipcMain.handle(channel, __sfStage4Handlers[channel]));
    global.__SF_STAGE4_SAFE_PANEL_V10_IPC_REGISTERED__ = true;
  }
  /* STAGE4_BINDING_REGISTER_PATCH_END */


  registerSafePanelV0106RecoveryIpcHandlers({
    ipcMain,
    shell,
    clipboard,
    sourceFactoryRoot: SOURCE_FACTORY_ROOT,
    reportRoot: SAFE_PANEL_V0106_REPORT_ROOT,
    generatedRoot: SAFE_PANEL_V0106_GENERATED_ROOT,
    logger: console
  });
}

app.whenReady().then(() => {
  registerHandlers();
  createPanelWindow();
  setTimeout(arrangeWindows, 500);
  scheduleLayoutLockRepeats();
});

app.on("window-all-closed", () => {
  app.quit();
});
