# SLOT 06 — SF_027 PC Agent Automation Design Integration

BATCH_ID: SF_027_PC_AGENT_SOURCE_EXTRACTION_20260801_0537
WORKER_ID: SOURCE_FACTORY_SLOT_06
MODE: READ_ONLY_INTEGRATION / REPORT_ONLY

## Start condition

Do not start final integration until actual result commits from SLOT 01~05 exist.

Required upstream terminals:

- SLOT 01: PASS, YELLOW or FAIL boundary result
- SLOT 02: PASS, YELLOW or FAIL boundary result
- SLOT 03: PASS, YELLOW or FAIL boundary result
- SLOT 04: PASS, YELLOW or FAIL boundary result
- SLOT 05: PASS, YELLOW or FAIL boundary result

Prompt commits must not be substituted for worker result commits.

## Objective

Integrate the extraction reports into a Commander-facing automation source ledger and design the future PC Agent modes without implementing or executing them.

Required design modes:

- `PC_AGENT_MODE=COMMANDER_INTAKE`
- `PC_AGENT_MODE=NEXT_DISPATCH_PLAN`
- `PC_AGENT_MODE=DISPATCH_PUBLISH`
- `PC_AGENT_MODE=CANDIDATE_LEDGER_BUILD`

Required findings:

1. integrated candidate list by category
2. stable core that can be reused as-is
3. assets requiring wrappers or adapters
4. parser, stale-detector or gate modules that must be newly implemented later
5. blocked and sanitize-required candidates
6. Drive-pointer-only assets
7. priority order and dependencies
8. approval policy: draft generation may be automatic, publication requires Commander approval
9. blocking risks and exact next actions
10. proposed updates to `state/SF_027_PC_AGENT_AUTOMATION_SOURCE_EXTRACTION_LEDGER.json`

Output:

`reports/sf027_slot_06_pc_agent_automation_design_<timestamp>/WORKER_REPORT_SLOT_06.md`

Allowed terminal status:

- `SF_027_SLOT_06_INTEGRATION_PASS_READY_FOR_COMMANDER_REVIEW`
- `SF_027_SLOT_06_INTEGRATION_YELLOW_NEEDS_CONFIRMATION`
- `SF_027_SLOT_06_INTEGRATION_FAIL_BOUNDARY`

Boundaries:

- no runtime implementation
- no source modification
- no automatic publication
- no candidate promotion
- no service or external operation
- preserve the 026 HOLD boundary

Next: Commander reviews the integrated report and decides the next implementation batch separately.
