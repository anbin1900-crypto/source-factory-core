# SLOT 04 — SF_027 Candidate Ledger and Inventory Extraction

BATCH_ID: SF_027_PC_AGENT_SOURCE_EXTRACTION_20260801_0537
WORKER_ID: SOURCE_FACTORY_SLOT_04
MODE: READ_ONLY_EXTRACTION / REPORT_ONLY

## Objective

Find the tools and evidence used to inventory, stage, classify, sanitize and promote reusable Source Factory candidates.

Owned scope:

- inventory and scanning tools
- candidate classification and ledger builders
- staging and promotion tools
- duplicate and fingerprint records
- sanitize-required and blocked candidate handling
- Drive-pointer records
- evidence related to the historical 5,903 inventory and downstream candidate counts

Required classification:

- core source
- candidate source
- prompt library
- operations runbook
- evidence or receipt
- blocked or sanitize required
- Drive pointer
- deprecated or superseded

For each candidate/tool record:

- exact path
- source type and reuse role
- exact current blob and evidence commit
- input and output artifacts
- dependencies
- sensitive-data or path-leak risks
- GitHub byte-storage suitability
- next action

Output:

`reports/sf027_slot_04_candidate_ledger_extraction_<timestamp>/WORKER_REPORT_SLOT_04.md`

Allowed terminal status:

- `SF_027_SLOT_04_EXTRACTION_PASS`
- `SF_027_SLOT_04_EXTRACTION_YELLOW_NEEDS_REVIEW`
- `SF_027_SLOT_04_EXTRACTION_FAIL_BOUNDARY`

Boundaries:

- no bulk promotion
- no upload of Drive byte artifacts
- no source modification
- no sanitize action; report sanitize requirements only
- no runtime or service execution

Next: SLOT 06 integration intake.
