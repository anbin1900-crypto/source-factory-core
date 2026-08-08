import { fileURLToPath } from 'node:url';
import path from 'node:path';

const UI_ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), 'ui', 'index.html');
const PRELOAD_ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), 'analyzer-preload.cjs');

export function installAnalyzerIpc(electron, core) {
  const { ipcMain } = electron;
  const handlers = {
    'analyzer:get-state': async () => core.getState(),
    'analyzer:register-site': async (_event, site) => core.registerSite(site),
    'analyzer:run': async (_event, payload) => core.runSiteAnalysis(payload.siteId, payload.input),
    'analyzer:get-workspace': async (_event, mode = 'embedded') => core.createWorkspaceDescriptor(mode),
    'analyzer:restore': async (_event, snapshot) => core.restore(snapshot)
  };
  for (const [channel, handler] of Object.entries(handlers)) {
    if (typeof ipcMain.removeHandler === 'function') ipcMain.removeHandler(channel);
    ipcMain.handle(channel, handler);
  }
  const broadcast = (payload) => {
    const windows = typeof electron.BrowserWindow?.getAllWindows === 'function' ? electron.BrowserWindow.getAllWindows() : [];
    for (const win of windows) {
      if (!win?.isDestroyed?.() && win?.webContents?.send) win.webContents.send('analyzer:progress', payload);
    }
  };
  core.on('progress', broadcast);
  return { channels: Object.keys(handlers), dispose: () => core.off('progress', broadcast) };
}

export function createAnalyzerWindowFactory(electron, core, options = {}) {
  const { BrowserWindow, session } = electron;
  const partition = core.browserPartition;
  const sharedSession = session?.fromPartition ? session.fromPartition(partition) : { partition };

  function commonWebPreferences() {
    return {
      partition,
      session: sharedSession,
      contextIsolation: true,
      nodeIntegration: false,
      preload: options.preload ?? PRELOAD_ENTRY
    };
  }

  function createStandaloneWindow() {
    const win = new BrowserWindow({
      width: options.width ?? 1480,
      height: options.height ?? 940,
      minWidth: 1080,
      minHeight: 700,
      title: 'YOLLA Site Analyzer',
      webPreferences: commonWebPreferences()
    });
    win.loadFile(options.uiEntry ?? UI_ENTRY, { query: { mode: 'standalone', sharedStateId: core.sharedStateId } });
    return win;
  }

  function createEmbeddedViewDescriptor() {
    return {
      ...core.createWorkspaceDescriptor('embedded'),
      webPreferences: commonWebPreferences(),
      entry: options.uiEntry ?? UI_ENTRY,
      query: { mode: 'embedded', sharedStateId: core.sharedStateId }
    };
  }

  return { partition, sharedSession, createStandaloneWindow, createEmbeddedViewDescriptor };
}
