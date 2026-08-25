/* eslint-env node */
"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sfSafePanel", {
  getStatus: () => ipcRenderer.invoke("sf-safe-panel-status"),
  launch: (options) => ipcRenderer.invoke("sf-safe-panel-launch", options),
  closeTerminals: () => ipcRenderer.invoke("sf-safe-panel-close-terminals"),
  arrange: () => ipcRenderer.invoke("sf-safe-panel-arrange"),
  openStateFolder: () => ipcRenderer.invoke("sf-safe-panel-open-state-folder"),
  openProjectFolder: () => ipcRenderer.invoke("sf-safe-panel-open-project-folder"),

  refreshSafePanelStatus: (payload) => ipcRenderer.invoke("sf:safe-panel:status", payload || {}),
  intakeSourceFromTextarea: (payload) => ipcRenderer.invoke("sf:safe-panel:intake-textarea", payload || {}),
  intakeSourceFromClipboard: (payload) => ipcRenderer.invoke("sf:safe-panel:intake-clipboard", payload || {}),
  runSafePanelGate: (payload) => ipcRenderer.invoke("sf:safe-panel:run-gate", payload || {}),
  materializeSafePanelSources: (payload) => ipcRenderer.invoke("sf:safe-panel:materialize", payload || {}),
  runSafePanelSyntaxCheck: (payload) => ipcRenderer.invoke("sf:safe-panel:syntax-check", payload || {}),
  openLatestSafePanelGenerated: (payload) => ipcRenderer.invoke("sf:safe-panel:open-latest-generated", payload || {})
});


/* STAGE4_PRELOAD_API_PATCH_START */
(function exposeStage4SfApi() {
  const stage4Api = Object.freeze({
    /* W57_GETTER_MISSING_PRELOAD_BRIDGE_V57_1_2_START */
    getProjectPanelIdentity: (payload) => ipcRenderer.invoke('sf:stage4-get-project-panel-identity', payload || {}),
    /* W57_GETTER_MISSING_PRELOAD_BRIDGE_V57_1_2_END */
    classifyPanelInput(payload) { return ipcRenderer.invoke("sf:stage4:classification:classify-panel-input", payload || {}); },
    validateSourceUnits(payload) { return ipcRenderer.invoke("sf:stage4:validation:validate-source-units", payload || {}); },
    collectWorkerOutput(payload) { return ipcRenderer.invoke("sf:stage4:collection:collect-worker-output", payload || {}); },
    appendStationRecords(payload) { return ipcRenderer.invoke("sf:stage4:storage:append-station-records", payload || {}); },
    generateNextInstruction(payload) { return ipcRenderer.invoke("sf:stage4:instruction:generate-next-instruction", payload || {}); },
    dispatchNextPrompt(payload) { return ipcRenderer.invoke("sf:stage4:sender:dispatch-next-prompt", payload || {}); },
    runExecutionCheck(payload) { return ipcRenderer.invoke("sf:stage4:execution:run-check", payload || {}); },
    manageDownloadResource(payload) { return ipcRenderer.invoke("sf:stage4:download:manage-resource", payload || {}); },
    buildAssemblyPlan(payload) { return ipcRenderer.invoke("sf:stage4:assembly:build-plan", payload || {}); },
    generateDoneLightReport(payload) { return ipcRenderer.invoke("sf:stage4:report:generate-done-light", payload || {}); },
    refreshControlState(payload) { return ipcRenderer.invoke("sf:stage4:control:refresh-state", payload || {}); }
  });

  contextBridge.exposeInMainWorld("sfApi", Object.freeze({
    stage4: stage4Api
  }));
}());
/* STAGE4_PRELOAD_API_PATCH_END */
