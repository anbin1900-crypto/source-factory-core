/* eslint-env node */
"use strict";

const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, callback) {
  if (typeof callback !== "function") throw new TypeError("callback must be a function");
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("sfTerminal", Object.freeze({
  getConfig: () => ipcRenderer.invoke("sf-terminal-get-config"),
  updateUrl: (payload) => ipcRenderer.invoke("sf-terminal-url-update", payload || {}),
  control: (payload) => ipcRenderer.invoke("sf-terminal-control", payload || {}),
  onCommand: (callback) => subscribe("sf-terminal-command", callback),
  onUrlState: (callback) => subscribe("sf-terminal-url-state", callback)
}));

contextBridge.exposeInMainWorld("yollaWorker", Object.freeze({
  getRegistry: () => ipcRenderer.invoke("yolla-panel:get-registry"),
  getRuntime: () => ipcRenderer.invoke("yolla-panel:get-runtime"),
  openWorkspace: (payload) => ipcRenderer.invoke("yolla-panel:open-workspace", payload || {}),
  selectRole: (payload) => ipcRenderer.invoke("yolla-panel:select-role", payload || {}),
  runCycleOnce: (payload) => ipcRenderer.invoke("yolla-panel:run-cycle-once", payload || {}),
  getLatestCycle: () => ipcRenderer.invoke("yolla-panel:get-latest-cycle"),
  onCycleEvent: (callback) => subscribe("yolla-worker-cycle-event", callback),
  onWorkspaceState: (callback) => subscribe("yolla-worker-workspace-state", callback)
}));
