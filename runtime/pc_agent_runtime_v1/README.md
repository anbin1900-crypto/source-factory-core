# YOLLA PC Agent Windows Runtime V1

This package turns the R11-validated PC Agent bridge worker into an installable Windows runtime.

## Runtime layout

```text
E:\YOLLA\agent\runtime\pc-agent-v1\
  current.json
  config\runtime.json
  releases\1.0.0-20260802\
  Manage-PcAgentRuntime.ps1

E:\YOLLA\agent\state\pc-agent-runtime-v1\
  control\
  runtime\
  logs\
  receipts\

E:\YOLLA\agent\state\source-factory-bridge-v1\
  requests\ processing\ processed\ results\ failed\ attempts\
```

The Scheduled Task `YOLLA-PC-Agent-Runtime-V1` runs as `SYSTEM` at Windows startup. The task starts `pc_agent_runtime_supervisor.py`; the supervisor starts and monitors the existing `pc_agent_bridge_worker.py`.

## Install and start

Run the package wrapper from elevated Windows PowerShell 5.1. It verifies the ZIP SHA-256 and every file in `PC_AGENT_RUNTIME_PACKAGE_MANIFEST.json`, installs a versioned release, registers the task, and starts the runtime.

## Management

```powershell
$manager = 'E:\YOLLA\agent\runtime\pc-agent-v1\Manage-PcAgentRuntime.ps1'

powershell.exe -NoProfile -ExecutionPolicy Bypass -File $manager -Command status
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $manager -Command validate
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $manager -Command start
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $manager -Command stop
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $manager -Command restart
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $manager -Command logs
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $manager -Command uninstall
```

Uninstall preserves Runtime State and the Source Factory Bridge Queue by default. Destructive deletion requires explicit `-PurgeState` or `-PurgeBridge` switches.

## Recovery behavior

- Supervisor singleton lock prevents duplicate supervisors.
- Worker singleton lock prevents duplicate workers.
- Worker process exit triggers bounded-backoff restart.
- Missing or stale worker heartbeat triggers restart.
- Requests left under `processing/` are recovered on worker startup.
- Existing `WORK_RESULT` files suppress duplicate execution.
- Supervisor and Worker write heartbeat, status, event, shutdown and install receipts.

## Safety boundary

```text
REAL_API_CALL_COUNT=0
POSTGRESQL_APPLY_COUNT=0
PRODUCTION=false
READY=false
MERGE=false
```
