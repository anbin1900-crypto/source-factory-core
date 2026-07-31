# SLOT 03 — SF_027 Worker Report Parser Extraction

BATCH_ID: SF_027_PC_AGENT_SOURCE_EXTRACTION_20260801_0537
WORKER_ID: SOURCE_FACTORY_SLOT_03
MODE: READ_ONLY_EXTRACTION / DESIGN_REPORT_ONLY

## Objective

Extract reusable report structures needed to detect and summarize worker results from GitHub.

Owned evidence scope:

- `reports/`
- `WORKER_REPORT_START` and `WORKER_REPORT_END`
- terminal status lines
- `tests_run`, `tests_not_run`, `blockers`, `known_risks`, `next_needed`
- forbidden-effect counter patterns
- actual result commit versus prompt commit distinctions

Required work:

1. Find representative report formats and exact evidence paths.
2. Identify stable fields, optional fields and incompatible variants.
3. Propose parser candidates without implementing them:
   - `worker_report_parser.py`
   - `terminal_status_extractor.py`
4. Define stale-report signals and parse-failure handling.
5. Record exact paths, commits, blobs where available, dependencies and risk flags.
6. Propose ledger records for worker report parser, dependency gate, stale report detector and evidence receipt categories.

Output:

`reports/sf027_slot_03_worker_report_parser_extraction_<timestamp>/WORKER_REPORT_SLOT_03.md`

Allowed terminal status:

- `SF_027_SLOT_03_EXTRACTION_PASS`
- `SF_027_SLOT_03_EXTRACTION_YELLOW_NEEDS_REVIEW`
- `SF_027_SLOT_03_EXTRACTION_FAIL_BOUNDARY`

Boundaries:

- no parser implementation in this task
- no source or report rewriting
- no runtime or service execution
- no candidate promotion

Next: SLOT 06 integration intake.
