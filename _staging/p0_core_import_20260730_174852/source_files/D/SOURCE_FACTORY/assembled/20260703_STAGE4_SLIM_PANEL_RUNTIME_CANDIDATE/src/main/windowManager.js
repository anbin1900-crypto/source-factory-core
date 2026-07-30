"use strict";



try { require("./stage4HardWindowControl").install(); } catch (error) { console.error("[SF4_HARD_WINDOW_CONTROL_HOOK_FAILED]", error); }

const fs = require("fs");
const path = require("path");
const { BrowserWindow, screen, session } = require("electron");
const {
  WINDOW_IDS,
  SHARED_GPT_SESSION_PARTITION,
  getAllWindowDefinitions,
  getWindowDefinition
} = require("../shared/windowRegistry");

const SOURCE_FACTORY_ROOT = process.env.SOURCE_FACTORY_ROOT || "D:\\SOURCE FACTORY";
const managedWindows = new Map();

function getRendererEntryPath() {
  return path.join(__dirname, "..", "renderer", "index.html");
}

function getPreloadPath() {
  return path.join(__dirname, "..", "preload", "gptPreload.js");
}

function ensureSharedGptSession() {
  return session.fromPartition(SHARED_GPT_SESSION_PARTITION, { cache: true });
}

function buildWindowTitle(windowDefinition) {
  return windowDefinition.window_id + " - Source Factory Browser v0.1";
}

function buildRendererQuery(windowDefinition, sourceFactoryRoot) {
  return {
    window_id: windowDefinition.window_id,
    role: windowDefinition.role,
    worker_id: windowDefinition.worker_id,
    task_id: windowDefinition.task_id,
    display_name: windowDefinition.display_name,
    source_factory_root: sourceFactoryRoot
  };
}

function calculateWindowBounds(index, totalCount) {
  const workArea = screen.getPrimaryDisplay().workArea;
  const spacing = 12;
  const columns = Math.min(3, Math.max(1, totalCount));
  const rows = Math.ceil(totalCount / columns);
  const width = Math.min(720, Math.max(420, Math.floor((workArea.width - spacing * (columns + 1)) / columns)));
  const height = Math.min(620, Math.max(320, Math.floor((workArea.height - spacing * (rows + 1)) / rows)));
  const column = index % columns;
  const row = Math.floor(index / columns);
  return {
    x: workArea.x + spacing + column * (width + spacing),
    y: workArea.y + spacing + row * (height + spacing),
    width: width,
    height: height
  };
}

function buildWebPreferences() {
  const preload = getPreloadPath();
  if (!fs.existsSync(preload)) {
    console.error("[Source Factory] missing preload:", preload);
  }
  return {
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: false,
    webSecurity: true,
    webviewTag: true,
    partition: SHARED_GPT_SESSION_PARTITION,
    preload: preload
  };
}

function createManagedWindow(windowDefinition, index, totalCount, options) {
  const existing = managedWindows.get(windowDefinition.window_id);
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return existing;
  }

  ensureSharedGptSession();
  const bounds = calculateWindowBounds(index, totalCount);
  const sourceFactoryRoot = (options && options.sourceFactoryRoot) || SOURCE_FACTORY_ROOT;

  const win = new BrowserWindow({
    // SF4_MENU_CONTROLBAR_NATIVE_MENU_HIDE
    autoHideMenuBar: false,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: 420,
    minHeight: 320,
    title: buildWindowTitle(windowDefinition),
    show: false,
    autoHideMenuBar: false,
    webPreferences: buildWebPreferences()
  });

  managedWindows.set(windowDefinition.window_id, win);

  win.once("ready-to-show", function () {
    if (!win.isDestroyed()) {
      win.show();
    }
  });

  win.on("closed", function () {
    managedWindows.delete(windowDefinition.window_id);
  });

  win.loadFile(getRendererEntryPath(), {
    query: buildRendererQuery(windowDefinition, sourceFactoryRoot)
  }).catch(function (error) {
    console.error("[Source Factory] renderer load failed:", windowDefinition.window_id, error);
  });

  return win;
}

function createAllWindows(options) {
  const definitions = getAllWindowDefinitions();
  return definitions.map(function (definition, index) {
    return createManagedWindow(definition, index, definitions.length, options || {});
  });
}

function createWindowById(windowId, options) {
  const definitions = getAllWindowDefinitions();
  const target = getWindowDefinition(windowId);
  const index = definitions.findIndex(function (definition) {
    return definition.window_id === target.window_id;
  });
  return createManagedWindow(target, index < 0 ? 0 : index, definitions.length, options || {});
}

function getManagedWindow(windowId) {
  const win = managedWindows.get(windowId);
  if (!win || win.isDestroyed()) {
    managedWindows.delete(windowId);
    return null;
  }
  return win;
}

function getManagedWindowCount() {
  let count = 0;
  managedWindows.forEach(function (win, id) {
    if (win && !win.isDestroyed()) {
      count += 1;
    } else {
      managedWindows.delete(id);
    }
  });
  return count;
}

function getAllManagedWindows() {
  const output = [];
  managedWindows.forEach(function (win, id) {
    if (win && !win.isDestroyed()) {
      output.push({ window_id: id, browserWindow: win });
    } else {
      managedWindows.delete(id);
    }
  });
  return output;
}

function focusWindow(windowId) {
  const win = getManagedWindow(windowId);
  if (!win) {
    return false;
  }
  if (win.isMinimized()) {
    win.restore();
  }
  win.show();
  win.focus();
  return true;
}

function focusAllWindows() {
  getAllManagedWindows().forEach(function (entry) {
    const win = entry.browserWindow;
    if (win.isMinimized()) {
      win.restore();
    }
    win.show();
  });
  focusWindow(WINDOW_IDS.COMMANDER);
}

function closeAllWindows(options) {
  const destroy = options && options.destroy === true;
  getAllManagedWindows().forEach(function (entry) {
    if (destroy) {
      entry.browserWindow.destroy();
    } else {
      entry.browserWindow.close();
    }
  });
}

module.exports = {
  SOURCE_FACTORY_ROOT,
  createAllWindows,
  createWindowById,
  getManagedWindow,
  getManagedWindowCount,
  getAllManagedWindows,
  focusWindow,
  focusAllWindows,
  closeAllWindows,
  ensureSharedGptSession,
  getPreloadPath
};


// SF4_NATIVE_MENU_CONTROLS_PATCH_START
(function sf4NativeMenuControlsPatch() {
  try {
    const electron = require("electron");
    const app = electron.app;
    const Menu = electron.Menu;
    const BrowserWindow = electron.BrowserWindow;

    const HOME_URL = "https://chatgpt.com/g/g-p-6a43a643a1148191ab9bc5697224e628-soseugongjang-peurojegteu";
    const TITLE_TEXT = "열심히 돈 벌어서 kee맛있는거 사주는 Source Factory";

    function normalizeIdentityTitle(win) {
      const current = win && typeof win.getTitle === "function" ? String(win.getTitle() || "") : "";
      let role = /COMMANDER|커맨더|커멘더/i.test(current) ? "커멘더" : "워커";
      let number = "1";

      const workerMatch = current.match(/WORKER[_\s-]*(\d+)/i) || current.match(/Worker\s*(\d+)/i) || current.match(/워커\s*(\d+)/i);
      const commanderMatch = current.match(/COMMANDER[_\s-]*(\d+)/i) || current.match(/Commander\s*(\d+)/i) || current.match(/커맨더\s*(\d+)/i) || current.match(/커멘더\s*(\d+)/i);

      if (role === "커멘더" && commanderMatch) {
        number = String(parseInt(commanderMatch[1], 10));
      } else if (workerMatch) {
        number = String(parseInt(workerMatch[1], 10));
      } else if (commanderMatch) {
        number = String(parseInt(commanderMatch[1], 10));
      }

      return "● [" + role + "][" + number + "] " + TITLE_TEXT;
    }

    function getTargetWindow() {
      return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
    }

    function sendAction(action) {
      const win = getTargetWindow();
      if (!win || !win.webContents) return;

      const script = "window.sf4NativeMenuAction && window.sf4NativeMenuAction(" + JSON.stringify(action) + ");";
      win.webContents.executeJavaScript(script, true).catch(function () {});
    }

    function restoreMenuVisibility() {
      BrowserWindow.getAllWindows().forEach(function (win) {
        try {
          win.setAutoHideMenuBar(false);
          win.setMenuBarVisibility(true);
          win.setTitle(normalizeIdentityTitle(win));
        } catch (error) {}
      });
    }

    function buildMenu() {
      const template = [
        {
          label: "File",
          submenu: [
            { role: "close", label: "Close" },
            { type: "separator" },
            { role: "quit", label: "Quit" }
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
        {
          label: "View",
          submenu: [
            { role: "reload", label: "Reload Window" },
            { role: "forceReload", label: "Force Reload" },
            { role: "toggleDevTools", label: "Developer Tools" },
            { type: "separator" },
            { role: "resetZoom", label: "Actual Size" },
            { role: "zoomIn", label: "Zoom In" },
            { role: "zoomOut", label: "Zoom Out" },
            { type: "separator" },
            { role: "togglefullscreen", label: "Toggle Full Screen" }
          ]
        },
        {
          label: "Window",
          submenu: [
            { role: "minimize", label: "Minimize" },
            { role: "zoom", label: "Zoom" },
            { role: "close", label: "Close" }
          ]
        },
        {
          label: "Help",
          submenu: [
            { label: "Source Factory", click: function () { sendAction("home"); } }
          ]
        },
        { label: "태오창", click: function () { sendAction("taeo"); } },
        { label: "라오창", click: function () { sendAction("lao"); } },
        { label: "태라창", click: function () { sendAction("taera"); } },
        { label: "새로고침", click: function () { sendAction("refresh"); } },
        { label: "홈", click: function () { sendAction("home"); } },
        { label: "주소창", click: function () { sendAction("focus-url"); } },
        { label: "이동", click: function () { sendAction("go-url"); } }
      ];

      Menu.setApplicationMenu(Menu.buildFromTemplate(template));
      restoreMenuVisibility();
    }

    function applyLater() {
      setTimeout(buildMenu, 100);
      setTimeout(buildMenu, 700);
      setTimeout(buildMenu, 1500);
    }

    if (app && app.whenReady) {
      app.whenReady().then(applyLater);
      app.on("browser-window-created", function () {
        applyLater();
      });
    }
  } catch (error) {
    // The patch must never stop the app.
  }
}());
// SF4_NATIVE_MENU_CONTROLS_PATCH_END
