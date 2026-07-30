# Available Source Upload Plan — 2026-07-30

## 1. Decision

Source Factory Core must become the reusable source repository for multiple projects, including:

```text
- PC Agent
- YOLLA real estate data engine
- gas station professional portal
- API/data runtime
- domain knowledge database
- future business portals
```

Therefore all available reusable Source Factory sources must be classified and migrated.

## 2. Storage policy

```text
GitHub:
  source code
  docs
  prompts
  ledgers
  manifest
  SHA/size record
  Drive pointer

Google Drive:
  large ZIP
  binary artifact
  DB dump
  raw site evidence
  collector bundle
  screenshots/video
  large CSV/JSONL/GZIP

Local PC:
  execution
  source scan
  browser runtime
  Windows service
  PostgreSQL/PostGIS
```

## 3. Immediate source classes

### P0 — PC Agent routing core

Purpose:

```text
4 Commander × 6 Worker routing
GitHub directive claim
exactly-once execution
receipt publication
worker output return
```

Target:

```text
src/pc_agent/
src/runner/
src/receipt/
src/github/
```

### P0 — GPT Browser Bridge

Known source candidates:

```text
gptWindowController.js
gptOutputCollector.js
gptInjectionPlan.md
gptPreload.js
windowManager.js
promptBuilder.js
taskInstructionManager.js
rawOutputStore.js
stateStore.js
windowRegistry.js
```

Target:

```text
src/browser_bridge/
src/collector/
src/queue/
```

### P0 — Worker/Commander contracts

Target:

```text
docs/
templates/
src/gate/
```

### P1 — Stage4 legacy package sources

Current available snapshot from mounted Source Factory packages:

```text
SOURCE_FILES_TXT_COUNT=17
SOURCE_UNIT_COUNT=110
JAVASCRIPT=34
BAT=28
MARKDOWN=24
JSON=23
TEXT=1
```

These are not automatically promoted to core. They first go into:

```text
legacy/stage4_packages/
docs/legacy_stage4/
```

### P1 — Gas station portal support templates

Target:

```text
examples/gas_station_portal/
docs/GAS_STATION_PORTAL_SUPPORT_MODEL.md
```

## 4. Upload rule

Small, verified source files may be committed directly to GitHub.

Large or raw artifacts must be stored in Google Drive and registered in GitHub using a pointer file.

Pointer file format:

```json
{
  "artifact_id": "...",
  "storage": "GOOGLE_DRIVE",
  "drive_path_or_url": "...",
  "file_name": "...",
  "size_bytes": 0,
  "sha256": "...",
  "status": "AVAILABLE|REQUIRED|ARCHIVED|BLOCKED"
}
```

## 5. Migration sequence

```text
001 Source inventory scan
002 Classify PC Agent routing source
003 Classify GPT Browser Bridge source
004 Upload Worker/Commander contract source
005 Upload GitHub/Drive ledger source
006 Upload Stage4 legacy source references
007 Create gas station portal support examples
008 Create reusable package release candidate
```

## 6. Commander rule

No source is called reusable core until it passes:

```text
- syntax check
- project-neutral path review
- dependency review
- no hardcoded D:\SOURCE FACTORY requirement unless parameterized
- no YOLLA-only business logic inside source-factory-core
- WORKER_REPORT or migration record exists
```

## 7. Current status

```text
CLASSIFICATION_STARTED=true
DIRECT_FULL_LOCAL_SOURCE_ACCESS=false
PC_AGENT_LOCAL_SOURCE_COLLECTION_REQUIRED=true
GITHUB_REGISTRY_CREATED=true
GOOGLE_DRIVE_POINTER_POLICY_CREATED=true
```
