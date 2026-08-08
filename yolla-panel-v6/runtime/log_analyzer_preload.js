/* eslint-env node */
"use strict";
const { contextBridge, ipcRenderer } = require("electron");
function subscribe(channel, callback) {
  if (typeof callback !== "function") throw new TypeError("callback required");
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}
contextBridge.exposeInMainWorld("yollaLogAnalyzer", Object.freeze({
  getSnapshot: () => ipcRenderer.invoke("v6:log-analyzer:get-snapshot"),
  exportDiagnostics: () => ipcRenderer.invoke("v6:log-analyzer:export"),
  openFolder: () => ipcRenderer.invoke("v6:log-analyzer:open-folder"),
  onEvent: callback => subscribe("v6:log-analyzer:event", callback)
}));
