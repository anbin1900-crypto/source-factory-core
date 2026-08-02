# C-3 Existing Worker Browser Binding Adapter

Assignment pointer: PR #175 comment `5155840914`  
Parent directive: PR #175 comment `5154763830`

This package binds:

```text
role_id -> worker_window_id -> browser_session_id
```

It reuses the existing Source Factory Safe Panel browser runtime. It does not create a second Electron runtime or a new IPC transport.

## Behavior

- reuses the exact live binding already assigned to a role;
- otherwise reuses an unbound existing worker window;
- when no window is available, calls the existing `createTerminal` factory;
- rejects duplicate Window IDs and duplicate Browser Session IDs;
- switches roles by activating the target role's distinct window and session;
- removes input, result, prompt, message, cookie, token and secret fields from attached role context.

## Validation

```bash
node --check src/workerBrowserBindingAdapter.js
node --check src/safePanelWorkerBrowserRuntimeBridge.js
node --check tests/testWorkerBrowserBindingAdapter.js
node --check tests/testSafePanelWorkerBrowserRuntimeBridge.js
node tests/testWorkerBrowserBindingAdapter.js
node tests/testSafePanelWorkerBrowserRuntimeBridge.js
```

Expected result:

```text
Adapter tests: 15/15 PASS
Runtime bridge tests: 10/10 PASS
Total: 25/25 PASS
```

Existing Safe Panel runtime files are read-only evidence inputs and were not modified.
