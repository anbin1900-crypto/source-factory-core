# C-3 Existing Worker Browser Binding Adapter

Implements the missing C-3 assignment pointed to by YOLLA C-1 PR #175 comment `5155840914`, under parent directive `MASTER-TO-C1-EXISTING-SOURCE-FACTORY-WORKER-BROWSER-COMMAND-PANEL-V1-20260802-001`.

## Scope

- inspect and reuse the existing Source Factory Safe Panel BrowserWindow and session surface;
- bind `role_id -> worker_window_id -> browser_session_id`;
- reuse an exact live role binding or an unbound existing worker window;
- call the existing `createTerminal` factory only when no reusable window exists;
- fail closed on duplicate Window IDs or Browser Session IDs;
- isolate role context and prevent cross-role input/result/session exposure.

## Validation

```text
ADAPTER_UNIT_TESTS=15/15 PASS
SAFE_PANEL_BRIDGE_TESTS=10/10 PASS
TOTAL_TESTS=25/25 PASS
NODE_SYNTAX=4/4 PASS
EXISTING_RUNTIME_BLOB_READBACK=2/2 PASS
EXISTING_RUNTIME_MUTATION_COUNT=0
NEW_BROWSER_RUNTIME_COUNT=0
NEW_IPC_TRANSPORT_COUNT=0
CI_STATUS=NOT_RUN_NOT_CLAIMED_PASS
```

The first implementation attempt detected a fail-closed defect: duplicate runtime sessions could be skipped while a new window was created. The adapter was corrected to validate the complete live runtime surface before selecting or creating a window. A subsequent negative test was updated to assert the new earlier fail-closed boundary.

## Boundaries

This PR does not modify the existing Safe Panel runtime, create a second Electron runtime, add a new IPC transport, deploy to Production, transition Ready, or merge itself.

Terminal: `C3_EXISTING_WORKER_BROWSER_BINDING_PASS`.
