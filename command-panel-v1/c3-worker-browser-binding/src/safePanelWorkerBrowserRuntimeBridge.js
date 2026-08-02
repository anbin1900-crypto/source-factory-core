/* eslint-env node */
"use strict";

function requireFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} dependency is required`);
  return value;
}

function createSafePanelWorkerBrowserRuntimeBridge(runtimeSurface) {
  const surface = runtimeSurface && typeof runtimeSurface === "object" ? runtimeSurface : {};
  if (!(surface.terminalWindows instanceof Map)) {
    throw new TypeError("terminalWindows Map dependency is required");
  }
  const createTerminal = requireFunction(surface.createTerminal, "createTerminal");
  const getTerminalKey = requireFunction(surface.getTerminalKey, "getTerminalKey");

  function alive(win) {
    return Boolean(win && !(typeof win.isDestroyed === "function" && win.isDestroyed()));
  }

  function listWorkerWindows() {
    const output = [];
    for (const [key, win] of surface.terminalWindows.entries()) {
      if (!alive(win)) continue;
      if ((win.__sfSafeRole || "") !== "worker") continue;
      output.push(win);
      if (key !== getTerminalKey("worker", win.__sfSafeSlot)) {
        const error = new Error("SAFE_PANEL_TERMINAL_KEY_MISMATCH");
        error.code = "SAFE_PANEL_TERMINAL_KEY_MISMATCH";
        throw error;
      }
    }
    return output.sort((a, b) => Number(a.__sfSafeSlot || 0) - Number(b.__sfSafeSlot || 0));
  }

  function createWorkerWindow(request) {
    const input = request && typeof request === "object" ? request : {};
    const slot = Number(input.slot);
    if (!Number.isInteger(slot) || slot <= 0) {
      const error = new Error("INVALID_WORKER_SLOT");
      error.code = "INVALID_WORKER_SLOT";
      throw error;
    }
    return createTerminal("worker", slot, input.url || undefined, input.project_home_url || undefined);
  }

  function attachRoleContext(win, binding) {
    if (!alive(win)) {
      const error = new Error("WINDOW_NOT_ALIVE");
      error.code = "WINDOW_NOT_ALIVE";
      throw error;
    }
    Object.defineProperty(win, "__sfCommandPanelRoleBinding", {
      value: Object.freeze({
        role_id: binding.role_id,
        worker_window_id: binding.worker_window_id,
        browser_session_id: binding.browser_session_id,
        context: binding.context
      }),
      configurable: true,
      enumerable: false,
      writable: false
    });
  }

  return Object.freeze({
    listWorkerWindows,
    createWorkerWindow,
    getWindowId: (win) => win && win.id,
    getBrowserSessionId: (win) => win && win.__sfSafePartition,
    getWorkerSlot: (win) => win && win.__sfSafeSlot,
    isWindowAlive: alive,
    focusWindow(win) {
      if (!alive(win)) return;
      if (typeof win.focus === "function") win.focus();
      if (typeof win.moveTop === "function") win.moveTop();
    },
    attachRoleContext
  });
}

module.exports = { createSafePanelWorkerBrowserRuntimeBridge };
