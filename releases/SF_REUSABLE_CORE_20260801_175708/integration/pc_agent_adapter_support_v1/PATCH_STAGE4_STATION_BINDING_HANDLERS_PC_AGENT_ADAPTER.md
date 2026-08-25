# PATCH REQUEST — Stage 4 PC Agent Adapter Binding

## Scope

- Target: `safe_panel_v10/ipc/stage4StationBindingHandlers.js`
- Delivery: patch request only
- Active E core mutation: not authorized
- `package.json`: unchanged

## Required import

Add a guarded require near the existing Stage 4 helper requires:

```javascript
var __sfPcAgentAdapterPackage = null;
try {
  __sfPcAgentAdapterPackage = require('../../integration/pc_agent_adapter_support_v1/SOURCE_FACTORY_PC_AGENT_ADAPTER_PACKAGE');
} catch (_error) {
  __sfPcAgentAdapterPackage = null;
}
```

## Dispatch anchor

Function: `handleStage4DispatchNextPrompt`

Preserve the existing `promptPackageVersionManager` call and existing `sequentialPromptSender` dispatch as the fallback. After the existing `dispatchResult` is produced, call the optional PC Agent dispatch service only when explicitly enabled:

```javascript
var pcAgentDispatch = deps && typeof deps.dispatchPcAgentWorkRequest === 'function'
  ? await deps.dispatchPcAgentWorkRequest(input, dispatchResult, event)
  : null;

return ok(STAGE4_STATION_NAMES.SENDER, 'dispatch_next_prompt', {
  version: versionResult,
  dispatch: pcAgentDispatch || dispatchResult,
  sequential_fallback: dispatchResult
});
```

Preferred no-target-mutation wiring: create handlers with the object returned by `createStage4PcAgentAdapterDeps(...)`. Its `dispatchNextPrompt` uses the existing dependency-injection path and preserves the sequential fallback.

## Result anchor

Function: `handleStage4RunCheck`

Before the existing `executionResultCollector` invocation, optionally normalize a `WORK_RESULT` through the result adapter. If the adapter is absent, pass the original input unchanged. The existing `executionResultCollector` fallback must remain intact.

Preferred no-target-mutation wiring: provide `runExecutionCheck` from `createStage4PcAgentAdapterDeps(...)` through the existing dependency-injection path.

## Storage

Do not replace `handleStage4AppendStationRecords`. Pass the normalized run-check result to the existing storage handler. Its `taeoRawOutputStore`, `panelRecordExecutionStore`, and `workerOutputBatchStore` bindings remain unchanged.

## Must preserve

- `sequentialPromptSender` fallback
- `executionResultCollector` fallback
- all preload API names
- all IPC channel names
- Project Panel Identity fields and getter
- `source:not_found` fallback
- Lao detect/queue behavior
- `package.json`

## Rollback or disable

1. Instantiate the package with `{ enabled: false }`.
2. Set `disable_pc_agent_adapter: true`.
3. Omit `transport`; dispatch falls back to `sequentialPromptSender`.
4. Omit the Adapter dependency object when creating Stage 4 handlers.
5. If a later approved patch is applied, remove only the guarded Adapter require and optional Adapter calls.

Expected disabled behavior: dispatch continues through `sequentialPromptSender`; run-check continues through `executionResultCollector`; storage, IPC, preload, Project Panel Identity, Lao detect/queue, and `package.json` remain unchanged.
