# SLOT 05 Prompt — 026 HOTFIX R1 Combined Independent Inspection

ISSUED_AT_KST: 2026-07-31T13:17+09:00
REPOSITORY: anbin1900-crypto/source-factory-core
BRANCH: main
BATCH_ID: SF_026_HOTFIX_R1_20260731_1317
SLOT_ID: SLOT_05
WORKER_ID: SOURCE_FACTORY_SLOT_05
TASK_ID: SF_026_R1_COMBINED_INDEPENDENT_INSPECTION
WORKER_FUNCTION_CLASS: INSPECTOR_WORKER
DEPENDENCY_STATUS: DEPENDS_ON_SLOT_01_02_03_04
CURRENT_GATE: 026_HOLD
MODE: REPORT_ONLY / READ_ONLY / NO_PRODUCTION_SOURCE_MODIFICATION / NO_026_EXECUTION
REPORT_TO: SOURCE_FACTORY_COMMANDER

## Start condition

다음 4개 Worker 보고와 exact commit SHA가 모두 게시된 후에만 검사를 시작한다.

- SLOT_01 claim-before-command
- SLOT_02 canonical command registry
- SLOT_03 terminal receipt validation
- SLOT_04 negative verification package

하나라도 없으면 `BLOCKED_WAITING_UPSTREAM_SLOT`으로 보고하고 최종 판정을 주장하지 않는다.

## Priority 0

- production code를 수정하지 않는다.
- 026 one-flow verifier를 실행하지 않는다.
- upstream Worker 보고를 그대로 믿지 않고 actual current file과 evidence를 확인한다.
- GPT·브라우저·PC Agent service·외부 API·미들웨어·배포를 실행하지 않는다.
- 검사하지 않은 항목을 PASS로 주장하지 않는다.

## Authority

- W001 review commit: `ea19fcec32abeda2bbcf261600d95fcf61b0081a`
- Batch file: `daily_queue/2026-07-31/SF_026_HOTFIX_R1_SIX_SLOT_BATCH.md`
- Current gate remains 026 HOLD.

## Required inspection

### A. Claim-before-command

- 첫 claim status 확인이 command 실행보다 먼저 수행되는가.
- rejected claim에서 command invocation 0이 증명되는가.
- rejected claim에서 completion receipt 생성·저장 0이 증명되는가.
- happy path 기능은 보존되는가.

### B. Canonical command registry

- allowed command ID가 exact argv/spec과 결속되는가.
- ID 재사용 + 임의 argv가 거부되는가.
- mismatch가 subprocess 전에 차단되는가.
- shell=False가 보존되는가.
- timeout/FileNotFoundError/OSError가 structured result로 처리되는가.

### C. Terminal receipt validation

- schema_version, queue_id, assignment_id, claim_key, project_code가 필수인가.
- identity 공백이 거부되는가.
- 모든 forbidden counter 필드가 존재하고 0이어야 하는가.
- invalid receipt가 저장되지 않는가.
- valid first receipt와 duplicate receipt 동작이 보존되는가.

### D. Negative verification evidence

- pre-seeded duplicate claim fixture가 실제로 command 0회를 확인하는가.
- canonical mismatch가 subprocess 0회를 확인하는가.
- receipt negative cases가 포함되는가.
- report/temp 외 예상치 못한 파일 변경을 관측 기반으로 검사하는가.

### E. Combination regression

- Python compile/import 결과 확인
- 024B/025 receipt contract와의 호환성 검토
- 기존 command output의 exit_code/stdout/stderr/timeout 보존
- worker assignment/claim/receipt identity 연결 보존

## Status proposal

다음 중 하나만 사용한다.

- `PASS_026_HOTFIX_R1_READY_FOR_GATE_REVIEW`
- `YELLOW_026_HOTFIX_R1_NEEDS_SMALL_CONFIRMATION`
- `RED_026_HOTFIX_R1_FIX_REQUIRED`
- `BLOCKED_WAITING_UPSTREAM_SLOT`

RED인 경우 아래 최소 형식으로만 요청한다.

RED_FIX_REQUIRED
cause:
fix:
resubmit_scope:

## Allowed output

- `reports/slot_05_026_hotfix_r1_combined_inspection_<timestamp>/WORKER_REPORT_SLOT_05.md`
- report-only artifact

## Forbidden output

- source 수정
- 026 실행
- 027 gate open 주장
- upstream 전체 재작성 요구

## Done-light report

WORKER_REPORT_START
worker_id: SOURCE_FACTORY_SLOT_05
task_id: SF_026_R1_COMBINED_INDEPENDENT_INSPECTION
worker_function_class: INSPECTOR_WORKER
upstream_commits:
files_inspected:
tests_evidence_checked:
tests_not_run:
combination_status_proposal:
failures_or_confirmations:
known_risks:
next_needed: SLOT_06_GATE_CLOSURE
WORKER_REPORT_END
