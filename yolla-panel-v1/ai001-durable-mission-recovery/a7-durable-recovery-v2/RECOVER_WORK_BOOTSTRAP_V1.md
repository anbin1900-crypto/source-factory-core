# RECOVER_WORK_BOOTSTRAP_V1

Purpose: recover AI-001 work after chat/context replacement using only durable pointers and minimal artifacts.

Read order:
1. `LATEST_AI001_MISSION_POINTER_V1.json`
2. active command JSON
3. latest result JSON
4. latest append-only checkpoint selected by maximum valid `sequence_no`
5. duplicate/idempotency check
6. output `ALREADY_DONE`, `SAFE_TO_RESUME`, `NEEDS_REPAIR`, or `BLOCKED`
7. emit one-read `AI001_RECOVERY_BRIEF_V1` payload

Default recovery never scans full chat history or full PR history. A-2/A-6/B-1 pointers are late-bound only when the current mission's `late_binding.required_sources` names them.

Single command:

```text
node RECOVER_WORK_BOOTSTRAP_V1.cjs --pointer ./LATEST_AI001_MISSION_POINTER_V1.json
```

Boundary: no tunnel creation, successor direct call, PC Agent call, Target-PC execution, Production/Ready/Merge.
