# SLOT 05 — SF_027 Prompt and Dispatch Template Extraction

BATCH_ID: SF_027_PC_AGENT_SOURCE_EXTRACTION_20260801_0537
WORKER_ID: SOURCE_FACTORY_SLOT_05
MODE: READ_ONLY_EXTRACTION / REPORT_ONLY

## Objective

Extract reusable instruction and dispatch structures that may support future PC Agent draft generation.

Owned scope:

- `daily_queue/`
- worker prompts
- commander prompts
- batch ledgers
- reinspection and redispatch prompts
- gate closure prompts
- minimal hotfix prompts
- wake-order and status-checkpoint records
- handoff templates

Required template groups:

- batch ledger
- worker assignment
- reinspection
- gate closure
- minimal hotfix
- redispatch
- wake order and checkpoint
- handoff

For each template candidate report:

- exact path and evidence commit
- reusable structural sections
- required variables
- project-specific fields that must be parameterized
- approval boundary
- stale dependency risk
- whether the template can be reused as-is or requires wrapping
- prohibited automatic publication behavior

Do not generate or execute new worker instructions beyond this assigned report.

Output:

`reports/sf027_slot_05_prompt_dispatch_template_extraction_<timestamp>/WORKER_REPORT_SLOT_05.md`

Allowed terminal status:

- `SF_027_SLOT_05_EXTRACTION_PASS`
- `SF_027_SLOT_05_EXTRACTION_YELLOW_NEEDS_REVIEW`
- `SF_027_SLOT_05_EXTRACTION_FAIL_BOUNDARY`

Boundaries:

- no prompt execution
- no automatic dispatch publication
- no source or report modification
- no runtime or service operation

Next: SLOT 06 integration intake.
