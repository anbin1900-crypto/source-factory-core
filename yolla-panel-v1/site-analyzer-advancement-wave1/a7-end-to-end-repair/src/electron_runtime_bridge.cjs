'use strict';
const REGISTERED = Symbol.for('yolla.siteAnalyzer.ipc.registered');

function registerAnalyzerIpc({ ipcMain, core }) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') throw new TypeError('ipcMain.handle is required');
  if (!core) throw new TypeError('AnalyzerCore is required');
  if (ipcMain[REGISTERED]) return ipcMain[REGISTERED];
  const channels = {
    'site-analyzer:register-site': (_event, input) => core.registerSite(input),
    'site-analyzer:get-state': () => core.getStateSnapshot(),
    'site-analyzer:analyze': (_event, input) => core.analyze(input)
  };
  for (const [channel, handler] of Object.entries(channels)) ipcMain.handle(channel, handler);
  const dispose = () => {
    for (const channel of Object.keys(channels)) if (typeof ipcMain.removeHandler === 'function') ipcMain.removeHandler(channel);
    delete ipcMain[REGISTERED];
  };
  ipcMain[REGISTERED] = { channels: Object.keys(channels), dispose };
  return ipcMain[REGISTERED];
}

function createStandaloneAnalyzerWindow({ BrowserWindow, core, preload = null, html = null, parent = null } = {}) {
  if (typeof BrowserWindow !== 'function') throw new TypeError('BrowserWindow constructor is required');
  if (!core) throw new TypeError('AnalyzerCore is required');
  const win = new BrowserWindow({
    width: 1440, height: 960, show: false, parent: parent || undefined,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, preload: preload || undefined,
      partition: `persist:yolla-site-analyzer-${core.sessionKey}` }
  });
  win.once('ready-to-show', () => win.show());
  if (html) win.loadFile(html);
  win.__yollaAnalyzer = { mode: 'STANDALONE', sessionKey: core.sessionKey, core };
  return win;
}

function bindEmbeddedAnalyzer({ webContents, core }) {
  if (!webContents || typeof webContents.send !== 'function') throw new TypeError('embedded webContents.send is required');
  if (!core) throw new TypeError('AnalyzerCore is required');
  const listener = event => webContents.send('site-analyzer:event', event);
  core.on('analyzer-event', listener);
  webContents.once?.('destroyed', () => core.removeListener('analyzer-event', listener));
  return { mode: 'EMBEDDED', sessionKey: core.sessionKey, dispose: () => core.removeListener('analyzer-event', listener) };
}

module.exports = { registerAnalyzerIpc, createStandaloneAnalyzerWindow, bindEmbeddedAnalyzer };
