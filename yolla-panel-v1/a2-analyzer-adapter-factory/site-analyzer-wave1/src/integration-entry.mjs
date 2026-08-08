import { AnalyzerCore } from './analyzer-core.mjs';
import { createAnalyzerWindowFactory, installAnalyzerIpc } from './electron-integration.mjs';

export function installSiteAnalyzer(electron, options = {}) {
  const core = options.core ?? new AnalyzerCore({
    sharedStateId: options.sharedStateId,
    browserPartition: options.browserPartition
  });
  const ipc = installAnalyzerIpc(electron, core);
  const windows = createAnalyzerWindowFactory(electron, core, options.window);
  return {
    core,
    ipc,
    windows,
    createEmbeddedAnalyzer: windows.createEmbeddedViewDescriptor,
    openStandaloneAnalyzer: windows.createStandaloneWindow,
    dispose: ipc.dispose
  };
}
