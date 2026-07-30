# Gas Station Professional Portal Support Model

## Status

```text
STATUS: ADOPTED_PRODUCT_SUPPORT_RECORD
DATE: 2026-07-30
OWNER_REPOSITORY: source-factory-core
TARGET_PRODUCT: gas station professional portal
```

## 1. Product direction

The gas station professional portal will be developed in parallel with the Source Factory and YOLLA infrastructure.

Initial product focus:

```text
Opinet data collection
→ normalization
→ price and change analysis
→ station/detail pages
→ map/table/download UI
→ natural-language data queries
```

Deferred product modules:

```text
AI counseling
community
weekly supply report support
hazardous material / soil contamination workflow
POS and middleware linkage
transport/dispatch/reverse auction
```

## 2. Why Source Factory Core must support this portal

The gas station portal needs repeated source production, data pipeline construction, evidence verification, and UI/API integration.

Reusable Source Factory modules reduce development time in:

```text
- daily task queue operation
- 4 Commander × 6 Worker routing
- GitHub directive/report loop
- large artifact pointer management
- API/document parsing
- Worker report extraction
- status gate classification
- portal module release checklist
```

## 3. Shared modules to reuse

```text
queue/
  dailyQueueReader
  promptQueueManager
  sequentialPromptSender

collector/
  workerOutputCollector
  workerReportExtractor

github/
  githubArtifactLedger

drive/
  googleDrivePointerManager

verify/
  sha256ManifestVerifier
  zipIntegrityVerifier

gate/
  statusClassifier
  commanderGateDecision
```

## 4. Portal-specific extension folders

The portal project should not pollute Source Factory Core with product-specific business logic.

Recommended separation:

```text
source-factory-core
  reusable automation engine only

gas-station-portal
  Opinet ingestion
  portal UI
  AI counselor
  community
  business workflow
  middleware/POS integration
```

Source Factory Core may contain templates and examples only.

## 5. Shared GitHub/Drive rule

```text
GitHub:
- source code
- markdown docs
- JSON ledger
- prompt queue
- worker report
- SHA/manifest/pointer

Google Drive:
- large CSV/ZIP
- raw evidence
- screenshots/video
- DB dump
- bulky collector output
```

## 6. Immediate next action

```text
Create a reusable source migration queue that classifies existing Source Factory sources into:
1. PC Agent routing core
2. GPT Browser Bridge
3. Worker/Commander reporting contracts
4. queue/runner/collector modules
5. GitHub/Drive artifact ledger modules
6. portal support examples
```
