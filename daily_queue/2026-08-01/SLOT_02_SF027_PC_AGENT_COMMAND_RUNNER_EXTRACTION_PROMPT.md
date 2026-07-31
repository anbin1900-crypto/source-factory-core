# SLOT 02 — SF_027 PC Agent Command Runner Extraction

BATCH_ID: SF_027_PC_AGENT_SOURCE_EXTRACTION_20260801_0537
WORKER_ID: SOURCE_FACTORY_SLOT_02
MODE: READ_ONLY_EXTRACTION / REPORT_ONLY

## Objective

Inspect reusable assets under `src/pc_agent/` for safe local command execution and structured result handling.

Primary candidates:

- `src/pc_agent/local_command_runner.py`
- `src/pc_agent/local_pc_agent_mvp.py`
- command registry, command result and local execution boundary candidates

Required review:

- command ID and canonical specification binding
- caller mutation rejection
- timeout and expected exit policy
- stdout, stderr and exit-code separation
- structured launch-error handling
- `shell=False` or equivalent safe process boundary
- project-specific fields requiring wrapping
- exact path, current blob, evidence commit, dependencies and risk flags

Output:

`reports/sf027_slot_02_pc_agent_command_runner_extraction_<timestamp>/WORKER_REPORT_SLOT_02.md`

Allowed terminal status:

- `SF_027_SLOT_02_EXTRACTION_PASS`
- `SF_027_SLOT_02_EXTRACTION_YELLOW_NEEDS_REVIEW`
- `SF_027_SLOT_02_EXTRACTION_FAIL_BOUNDARY`

Boundaries:

- do not modify source
- do not run the PC Agent service or execution flow
- do not promote candidates
- preserve existing reports

Next: SLOT 06 integration intake.
