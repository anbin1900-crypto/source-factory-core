# PC Agent Multi-Commander Worker GitHub Routing Model

## Status

```text
STATUS: ADOPTED_DESIGN_RECORD
DATE: 2026-07-30
REPOSITORY: source-factory-core
PURPOSE: Reusable Source Factory control model for PC Agent, Commander, Worker, GitHub, and artifact storage.
```

## 1. Core model

The PC Agent is the local execution bridge between GitHub directives and GPT/Worker execution.

```text
GitHub Directive
→ PC Agent claim
→ Commander routing
→ Worker prompt delivery
→ Worker output collection
→ Terminal Receipt creation
→ GitHub report publication
→ Commander intake
→ next directive
```

## 2. 4 Commander × 6 Worker model

The current reusable operating target is:

```text
MASTER / S-1
→ Commander A / 6 Workers
→ Commander B / 6 Workers
→ Commander C / 6 Workers
→ Commander D / 6 Workers
```

This yields 24 Worker execution slots.

The PC Agent must not treat Worker numbers as fixed identities. The correct identity model is:

```text
commander_id
worker_slot_id
assignment_id
directive_id
execution_id
repo
branch
commit_sha
receipt_id
```

## 3. GitHub as authority

GitHub is the authoritative ledger for:

```text
- directive queue
- prompt files
- commander handoff
- worker output pointer
- receipt status
- source migration index
- project state
- gate decision
```

The PC Agent may execute locally, but it must report back to GitHub with exact metadata.

## 4. Worker delivery contract

For every worker execution:

```text
1. Read directive from GitHub.
2. Verify directive_id and assignment_id.
3. Claim exactly once.
4. Deliver prompt to target Worker context.
5. Wait for terminal output or timeout.
6. Collect full raw output.
7. Extract WORKER_REPORT.
8. Save local copy.
9. Commit/publish GitHub result.
10. Wake Commander if required.
```

## 5. Stop and continue rules

```text
GREEN_READY: continue
YELLOW_INPUT_PENDING: record and continue to next independent task
YELLOW_RUNTIME_PENDING: record and continue if unrelated task exists
RED_FIX_REQUIRED: stop current branch and create red-fix directive
BLOCKED_BY_MISSING_INPUT: move to pending_input and continue
BLOCKED_BY_RUNTIME: move to runtime_blocked and continue
BLACK_USER_INSTRUCTION_VIOLATION: stop entire run
```

## 6. Why this matters for Source Factory Core

Source Factory Core is not only a source-code repository. It is the reusable control layer for multiple projects:

```text
- YOLLA real estate data engine
- gas station professional portal
- domain knowledge DB
- API/data runtime
- future business portals
```

Therefore PC Agent routing, Worker output collection, and GitHub receipt publication must be project-neutral.

## 7. Required reusable modules

```text
src/queue/dailyQueueReader.js
src/queue/promptQueueManager.js
src/queue/sequentialPromptSender.js
src/collector/workerOutputCollector.js
src/collector/workerReportExtractor.js
src/github/githubArtifactLedger.js
src/drive/googleDrivePointerManager.js
src/gate/statusClassifier.js
src/gate/commanderGateDecision.js
```

## 8. Next implementation target

```text
NEXT_ACTION:
Extract reusable Source Factory browser and PC Agent bridge source into source-factory-core under categorized modules.
```
