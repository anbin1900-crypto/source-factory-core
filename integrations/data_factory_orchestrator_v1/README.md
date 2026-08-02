# A-6 Data Factory Orchestrator V1

This package implements the PR #142 comment `5153438193` A-6 assignment as an additive orchestration layer over the existing Source Factory ↔ PC Agent durable file queue.

It does not create a second runtime or transport. Stage jobs are emitted as `YOLLA_SOURCE_FACTORY_PC_AGENT_BRIDGE_V1` `WORK_REQUEST` objects under the existing `requests/` directory and consume matching `WORK_RESULT` objects from `results/`.

Pipeline:

```text
RECEIVED
→ HASHING
→ DUPLICATE_EXCLUDED or ARCHIVED
→ SPLIT_QUEUED
→ SPLIT_COMPLETE
→ GPT_STRUCTURING
→ SCHEMA_VALIDATED
→ COMBINE_QUEUED
→ COMBINED
→ SEARCH_READBACK_PASS
```

All events carry `idempotency_key`, `project_id`, `source_id`, `execution_id`, and `artifact_pointer`.

Until real A-3/A-5/D-group stage implementations publish compatible results, `--fixture` supplies explicitly marked fixture outputs. Rebinding requires replacing the fixture producer only; the state machine and queue contract remain unchanged.

Example:

```bash
python integrations/data_factory_orchestrator_v1/event_router_and_queue_adapter.py start \
  --root ./tmp/a6-runtime \
  --source ./sample.txt \
  --project-id sample-project \
  --source-id sample-source \
  --execution-id sample-execution \
  --fixture
```

Production connection, Production credentials, Production deployment, Ready transition, and merge are not performed or claimed.
