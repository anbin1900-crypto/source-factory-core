
// SF4_WORKSPACE_OPTIMIZED_MENU_POLICY_START
try {
  const sf4Electron = require("electron");
  const sf4App = sf4Electron.app;
  const sf4Menu = sf4Electron.Menu;
  const sf4BrowserWindow = sf4Electron.BrowserWindow;

  function sf4HideNativeMenus() {
    try {
      if (sf4Menu && typeof sf4Menu.setApplicationMenu === "function") {
        sf4Menu.setApplicationMenu(null);
      }
    } catch (error) {}

    try {
      if (sf4BrowserWindow && typeof sf4BrowserWindow.getAllWindows === "function") {
        sf4BrowserWindow.getAllWindows().forEach(function (win) {
          try { if (typeof win.setMenu === "function") win.setMenu(null); } catch (error) {}
          try { if (typeof win.setMenuBarVisibility === "function") win.setMenuBarVisibility(false); } catch (error) {}
          try { if (typeof win.setAutoHideMenuBar === "function") win.setAutoHideMenuBar(true); } catch (error) {}
        });
      }
    } catch (error) {}
  }

  if (sf4App && typeof sf4App.whenReady === "function") {
    sf4App.whenReady().then(function () {
      sf4HideNativeMenus();
      setInterval(sf4HideNativeMenus, 1500);
    }).catch(function () {});
  }

  if (sf4App && typeof sf4App.on === "function") {
    sf4App.on("browser-window-created", function (_event, win) {
      try { if (typeof win.setMenu === "function") win.setMenu(null); } catch (error) {}
      try { if (typeof win.setMenuBarVisibility === "function") win.setMenuBarVisibility(false); } catch (error) {}
      try { if (typeof win.setAutoHideMenuBar === "function") win.setAutoHideMenuBar(true); } catch (error) {}
      setTimeout(sf4HideNativeMenus, 100);
      setTimeout(sf4HideNativeMenus, 500);
      setTimeout(sf4HideNativeMenus, 1500);
    });
  }
} catch (error) {}
// SF4_WORKSPACE_OPTIMIZED_MENU_POLICY_END


/* eslint-env node */
"use strict";

function install() {
  if (global.__SF4_HARD_WINDOW_CONTROL_INSTALLED__) {
    return;
  }

  global.__SF4_HARD_WINDOW_CONTROL_INSTALLED__ = true;

  const electron = require("electron");
  const app = electron.app;
  const Menu = electron.Menu;
  const OriginalBrowserWindow = electron.BrowserWindow;

  let createdSeq = 0;
  const records = [];

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function labelForMeta(meta) {
    if (meta.role === "commander") return "커맨더";
    return "워커 " + pad2(meta.workerIndex);
  }

  function titleForMeta(meta) {
    return labelForMeta(meta) + " - Source Factory";
  }

  function safeGetDisplays() {
    try {
      const screen = electron.screen;
      const primary = screen.getPrimaryDisplay();
      const all = screen.getAllDisplays().slice().sort(function (a, b) {
        const ax = a.bounds ? a.bounds.x : 0;
        const bx = b.bounds ? b.bounds.x : 0;
        const ay = a.bounds ? a.bounds.y : 0;
        const by = b.bounds ? b.bounds.y : 0;
        if (ax !== bx) return ax - bx;
        return ay - by;
      });

      const secondary = all.filter(function (display) {
        return display.id !== primary.id;
      });

      return {
        primary: primary,
        all: all,
        secondary: secondary
      };
    } catch (error) {
      return null;
    }
  }

  function workArea(display) {
    return (display && (display.workArea || display.bounds)) || { x: 0, y: 0, width: 1280, height: 720 };
  }

  function boundsForMeta(meta) {
    const displays = safeGetDisplays();

    if (!displays) {
      if (meta.role === "commander") {
        return { x: 0, y: 0, width: 1280, height: 720 };
      }
      return {
        x: 1280 + ((meta.workerIndex - 1) % 2) * 640,
        y: Math.floor((meta.workerIndex - 1) / 2) * 360,
        width: 640,
        height: 360
      };
    }

    if (meta.role === "commander") {
      const area = workArea(displays.primary);
      return {
        x: area.x,
        y: area.y,
        width: area.width,
        height: area.height
      };
    }

    if (displays.secondary.length >= 2) {
      const monitorIndex = Math.floor((meta.workerIndex - 1) / 3) % 2;
      const row = (meta.workerIndex - 1) % 3;
      const area = workArea(displays.secondary[monitorIndex]);
      const rowHeight = Math.floor(area.height / 3);

      return {
        x: area.x,
        y: area.y + row * rowHeight,
        width: area.width,
        height: row === 2 ? area.height - rowHeight * 2 : rowHeight
      };
    }

    if (displays.secondary.length === 1) {
      const area = workArea(displays.secondary[0]);
      const col = (meta.workerIndex - 1) % 2;
      const row = Math.floor((meta.workerIndex - 1) / 2) % 3;
      const colWidth = Math.floor(area.width / 2);
      const rowHeight = Math.floor(area.height / 3);

      return {
        x: area.x + col * colWidth,
        y: area.y + row * rowHeight,
        width: col === 1 ? area.width - colWidth : colWidth,
        height: row === 2 ? area.height - rowHeight * 2 : rowHeight
      };
    }

    const area = workArea(displays.primary);
    const rightX = area.x + Math.floor(area.width / 2);
    const rightWidth = Math.floor(area.width / 2);
    const col = (meta.workerIndex - 1) % 2;
    const row = Math.floor((meta.workerIndex - 1) / 2) % 3;
    const colWidth = Math.floor(rightWidth / 2);
    const rowHeight = Math.floor(area.height / 3);

    return {
      x: rightX + col * colWidth,
      y: area.y + row * rowHeight,
      width: col === 1 ? rightWidth - colWidth : colWidth,
      height: row === 2 ? area.height - rowHeight * 2 : rowHeight
    };
  }

  function metaForNextWindow(options) {
    createdSeq += 1;

    if (createdSeq === 1) {
      return {
        role: "commander",
        workerIndex: 0,
        sequence: createdSeq
      };
    }

    return {
      role: "worker",
      workerIndex: createdSeq - 1,
      sequence: createdSeq
    };
  }

  function applyMenuPolicy(win) {
    if (!win) return;

    try {
      if (typeof win.setMenu === "function") win.setMenu(null);
    } catch (error) {}

    try {
      if (typeof win.setMenuBarVisibility === "function") win.setMenuBarVisibility(false);
    } catch (error) {}

    try {
      if (typeof win.setAutoHideMenuBar === "function") win.setAutoHideMenuBar(true);
    } catch (error) {}
  }

  function applyWindowPolicy(win, meta) {
    if (!win || !meta) return;

    const title = titleForMeta(meta);
    const bounds = boundsForMeta(meta);

    function once() {
      try {
        if (typeof win.unmaximize === "function") win.unmaximize();
      } catch (error) {}

      try {
        if (typeof win.setTitle === "function") win.setTitle(title);
      } catch (error) {}

      try {
        if (typeof win.setBounds === "function") win.setBounds(bounds, true);
      } catch (error) {}

      try {
        if (typeof win.show === "function") win.show();
      } catch (error) {}

      applyMenuPolicy(win);
    }

    once();
    [150, 400, 900, 1800, 3500, 6000, 9000].forEach(function (delay) {
      setTimeout(once, delay);
    });

    try {
      if (win.webContents && typeof win.webContents.once === "function") {
        win.webContents.once("did-finish-load", once);
      }
    } catch (error) {}
  }

  function registerWindow(win, meta) {
    if (!win) return;

    if (!meta) {
      meta = metaForNextWindow({});
    }

    win.__sf4HardWindowMeta = meta;
    records.push({ win: win, meta: meta });
    applyWindowPolicy(win, meta);
  }

  function patchBrowserWindow() {
    if (!OriginalBrowserWindow || OriginalBrowserWindow.__sf4HardPatched) {
      return;
    }

    function SF4BrowserWindow(options) {
      const meta = metaForNextWindow(options || {});
      const bounds = boundsForMeta(meta);
      const finalOptions = Object.assign({}, options || {}, bounds, {
        title: titleForMeta(meta),
        autoHideMenuBar: false,
        titleBarStyle: "hidden",
        titleBarOverlay: {
          color: "#050505",
          symbolColor: "#ffffff",
          height: 34
        }
      });

      const win = new OriginalBrowserWindow(finalOptions);
      registerWindow(win, meta);
      return win;
    }

    Object.setPrototypeOf(SF4BrowserWindow, OriginalBrowserWindow);
    SF4BrowserWindow.prototype = OriginalBrowserWindow.prototype;

    Object.getOwnPropertyNames(OriginalBrowserWindow).forEach(function (key) {
      if (key === "length" || key === "name" || key === "prototype") return;
      try {
        Object.defineProperty(SF4BrowserWindow, key, Object.getOwnPropertyDescriptor(OriginalBrowserWindow, key));
      } catch (error) {}
    });

    SF4BrowserWindow.__sf4HardPatched = true;
    electron.BrowserWindow = SF4BrowserWindow;
  }

  function applyApplicationMenuPolicy() {
    function off() {
      try {
        Menu.setApplicationMenu(null);
      } catch (error) {}
    }

    try {
      if (app && typeof app.isReady === "function" && app.isReady()) {
        off();
      } else if (app && typeof app.once === "function") {
        app.once("ready", off);
      }
    } catch (error) {}

    try {
      if (app && typeof app.on === "function") {
        app.on("browser-window-created", function (_event, win) {
          applyMenuPolicy(win);
          if (!win.__sf4HardWindowMeta) {
            registerWindow(win, metaForNextWindow({}));
          }
        });
      }
    } catch (error) {}
  }

  function keepAlivePolicy() {
    setInterval(function () {
      try {
        if (!electron.BrowserWindow || typeof electron.BrowserWindow.getAllWindows !== "function") return;

        electron.BrowserWindow.getAllWindows().forEach(function (win) {
          if (!win.__sf4HardWindowMeta) {
            registerWindow(win, metaForNextWindow({}));
          } else {
            applyMenuPolicy(win);
            try {
              if (typeof win.setTitle === "function") {
                win.setTitle(titleForMeta(win.__sf4HardWindowMeta));
              }
            } catch (error) {}
          }
        });
      } catch (error) {}
    }, 3000);
  }

  patchBrowserWindow();
  applyApplicationMenuPolicy();
  keepAlivePolicy();
}

module.exports = {
  install: install
};
