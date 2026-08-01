# Source Factory ↔ PC Agent Integration V1

## Authority

```text
SOURCE_FACTORY_REPOSITORY=anbin1900-crypto/source-factory-core
SOURCE_FACTORY_PR=2
SOURCE_FACTORY_SOURCE_HEAD=486915d9f23a78779de99bb5d25dcc3325ed52c0
SOURCE_FACTORY_RELEASE=releases/SF_REUSABLE_CORE_20260801_175708
LOCAL_ACTIVE_CORE=E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038
```

## Flow

```text
handleStage4DispatchNextPrompt
→ existing sequentialPromptSender
→ pcAgentBridgeAdapter
→ durable WORK_REQUEST file
→ pc_agent_bridge_worker.py
→ WORK_RESULT file
→ handleStage4RunCheck
→ existing executionResultCollector
→ handleStage4AppendStationRecords
```

The existing Source Factory path remains the fallback. No IPC channel, preload API, Project Panel Identity, package.json, or existing sender/collector is renamed or removed.

## Local bridge root

```text
E:\YOLLA\agent\state\source-factory-bridge-v1
├─ requests
├─ processing
├─ processed
├─ results
├─ failed
└─ attempts
```

## Target PC apply

Extract the integration package and run in Windows PowerShell 5.1:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\integrations\pc_agent_v1\Apply-SourceFactoryPcAgentIntegrationV1.ps1
```

On success, launch the combined runtime with:

```text
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\RUN_E_SF4_SAFE_PANEL_E_ONLY_WITH_PC_AGENT_BRIDGE.bat
```

## Validation

```text
node --check pcAgentBridgeAdapter.js
node --check applyPcAgentBridgePatch.js
python -m py_compile pc_agent_bridge_worker.py
python validate_source_factory_pc_agent_integration.py <package-root>
node testPcAgentBridgeE2E.js
```

## Safety boundary

```text
PRODUCTION_CONNECTION=false
PRODUCTION_CREDENTIAL_USE=false
PRODUCTION_DEPLOY=false
READY=false
MERGE=false
```
