"use strict";

import path from "path";

const runtimePipelineContract = Object.freeze({
  schemaVersion: "SOURCE_FACTORY_RUNTIME_PIPELINE_CONTRACT_V1",
  status: "PASS_RUNTIME_PIPELINE_CONTRACT_READY_FOR_017",
  runtimeGroups: Object.freeze({
    queue: Object.freeze({
      dailyQueueReader: "src/queue/dailyQueueReader.js",
      pythonProcessRunner: "src/queue/pythonProcessRunner.js",
    }),
    gptBrowserBridge: Object.freeze({
      buttonHandlers: "src/gpt_browser_bridge/buttonHandlers.js",
      diagnostics: "src/gpt_browser_bridge/diagnostics.js",
      fileNameSafe: "src/gpt_browser_bridge/fileNameSafe.js",
      stage1SelfCheck: "src/gpt_browser_bridge/stage1SelfCheck.js",
    }),
    pcAgentRouting: Object.freeze({
      b2W12PrefinalValidator: "src/pc_agent_routing/B2_W12_PREFINAL_VALIDATOR.py",
      eventConsumptionStore: "src/pc_agent_routing/event_consumption_store.py",
      resourceDoctor: "src/pc_agent_routing/resource_doctor.py",
    }),
  }),
  executionFlow: Object.freeze([
    "daily_queue_intake",
    "worker_prompt_dispatch_plan",
    "gpt_browser_bridge_check",
    "pc_agent_receipt_gate",
    "commander_gate_decision",
  ]),
});

function getRuntimePipelineContract() {
  return runtimePipelineContract;
}

function resolveRuntimePath(repositoryRoot, relativePath) {
  if (!repositoryRoot || typeof repositoryRoot !== "string") {
    throw new TypeError("repositoryRoot must be a non-empty string");
  }
  if (!relativePath || typeof relativePath !== "string") {
    throw new TypeError("relativePath must be a non-empty string");
  }
  return path.join(repositoryRoot, relativePath);
}

function listRuntimeSourcePaths() {
  const groups = runtimePipelineContract.runtimeGroups;
  return [
    groups.queue.dailyQueueReader,
    groups.queue.pythonProcessRunner,
    groups.gptBrowserBridge.buttonHandlers,
    groups.gptBrowserBridge.diagnostics,
    groups.gptBrowserBridge.fileNameSafe,
    groups.gptBrowserBridge.stage1SelfCheck,
    groups.pcAgentRouting.b2W12PrefinalValidator,
    groups.pcAgentRouting.eventConsumptionStore,
    groups.pcAgentRouting.resourceDoctor,
  ];
}

export {
  getRuntimePipelineContract,
  listRuntimeSourcePaths,
  resolveRuntimePath,
};

export default runtimePipelineContract;
