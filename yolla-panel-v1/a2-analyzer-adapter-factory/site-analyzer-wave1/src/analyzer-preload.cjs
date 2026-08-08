'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('analyzerAPI', {
  getState: () => ipcRenderer.invoke('analyzer:get-state'),
  registerSite: (site) => ipcRenderer.invoke('analyzer:register-site', site),
  run: (siteId, input) => ipcRenderer.invoke('analyzer:run', { siteId, input }),
  getWorkspace: (mode) => ipcRenderer.invoke('analyzer:get-workspace', mode),
  restore: (snapshot) => ipcRenderer.invoke('analyzer:restore', snapshot),
  onProgress: (listener) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on('analyzer:progress', handler);
    return () => ipcRenderer.removeListener('analyzer:progress', handler);
  }
});
