/* eslint-env node */
"use strict";
const { contextBridge, ipcRenderer } = require("electron");
function subscribe(channel, callback) {
  if (typeof callback !== "function") throw new TypeError("callback required");
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}
contextBridge.exposeInMainWorld("yollaV6", Object.freeze({
  getState: () => ipcRenderer.invoke("v6:get-state"),
  setMode: mode => ipcRenderer.invoke("v6:set-mode", { mode }),
  selectGroup: group_id => ipcRenderer.invoke("v6:select-group", { group_id }),
  selectRole: role_id => ipcRenderer.invoke("v6:select-role", { role_id }),
  addGroup: payload => ipcRenderer.invoke("v6:add-group", payload || {}),
  updateGroup: payload => ipcRenderer.invoke("v6:update-group", payload || {}),
  deleteGroup: group_id => ipcRenderer.invoke("v6:delete-group", { group_id }),
  addRole: payload => ipcRenderer.invoke("v6:add-role", payload || {}),
  updateRole: payload => ipcRenderer.invoke("v6:update-role", payload || {}),
  deleteRole: role_id => ipcRenderer.invoke("v6:delete-role", { role_id }),
  browserControl: payload => ipcRenderer.invoke("v6:browser-control", payload || {}),
  setBrowserSuppressed: (suppressed, reason) => ipcRenderer.invoke("v6:set-browser-suppressed", { suppressed:Boolean(suppressed), reason:String(reason || "UI_OVERLAY") }),
  reportLayout: bounds => ipcRenderer.invoke("v6:layout", { bounds }),
  reportRendered: payload => ipcRenderer.invoke("v6:rendered", payload || {}),
  registerSite: payload => ipcRenderer.invoke("v6:register-site", payload || {}),
  deleteSite: site_id => ipcRenderer.invoke("v6:delete-site", { site_id }),
  openStateFolder: () => ipcRenderer.invoke("v6:open-state-folder"),
  assignCurrentWorker: payload => ipcRenderer.invoke("v6:assign-current-worker", payload || {}),
  openLogAnalyzer: () => ipcRenderer.invoke("v6:log-analyzer:open"),
  cStart: payload => ipcRenderer.invoke("v6:c:start", payload || {}),
  cPause: () => ipcRenderer.invoke("v6:c:pause"),
  cResume: () => ipcRenderer.invoke("v6:c:resume"),
  cStop: () => ipcRenderer.invoke("v6:c:stop"),
  cTick: () => ipcRenderer.invoke("v6:c:tick"),
  configureCommand: payload => ipcRenderer.invoke("v6:commands:configure", payload || {}),
  enableCommand: (command_id, enabled) => ipcRenderer.invoke("v6:commands:enable", { command_id, enabled }),
  deleteCommand: command_id => ipcRenderer.invoke("v6:commands:delete", { command_id }),
  tickCommands: () => ipcRenderer.invoke("v6:commands:tick"),
  sendNow: payload => ipcRenderer.invoke("v6:commands:send-now", payload || {}),
  onState: callback => subscribe("v6:state", callback),
  onLog: callback => subscribe("v6:log", callback)
}));
