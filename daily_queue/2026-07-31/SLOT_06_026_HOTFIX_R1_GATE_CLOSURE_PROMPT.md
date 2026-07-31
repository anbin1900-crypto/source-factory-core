# SLOT 06 Prompt — 026 HOTFIX R1 Gate Closure

ISSUED_AT_KST: 2026-07-31T13:17+09:00
REPOSITORY: anbin1900-crypto/source-factory-core
BRANCH: main
BATCH_ID: SF_026_HOTFIX_R1_20260731_1317
SLOT_ID: SLOT_06
WORKER_ID: SOURCE_FACTORY_SLOT_06
TASK_ID: SF_026_R1_GATE_CLOSURE
WORKER_FUNCTION_CLASS: INSPECTOR_WORKER
SPECIALIZED_ROLE: GATE_CLOSURE_AND_NEXT_ACTION_WORKER
DEPENDENCY_STATUS: DEPENDS_ON_SLOT_05
CURRENT_GATE: 026_HOLD
MODE: REPORT_ONLY / NO_PRODUCTION_SOURCE_MODIFICATION / NO_026_EXECUTION
REPORT_TO: SOURCE_FACTORY_COMMANDER

## Start condition

SLOT_05가 exact commit SHA와 함께 다음 중 하나의 결합검사 상태를 게시한 후에만 시작한다.

- PASS_026_HOTFIX_R1_READY_FOR_GATE_REVIEW
- YELLOW_026_HOTFIX_R1_NEEDS_SMALL_CONFIRMATION
- RED_026_HOTFIX_R1_FIX_REQUIRED

SLOT_05 결과가 없으면 `BLOCKED_WAITING_SLOT_05`만 보고한다.

## Priority 0

- production code를 수정하지 않는다.
- 026 verifier나 local MVP를 실행하지 않는다.
- evidence 없는 PASS 또는 gate open을 주장하지 않는다.
- GPT·브라우저·PC Agent service·외부 API·미들웨어·배포를 실행하지 않는다.
- 025 PASS와 026 준비 상태를 구분한다.

## Authority

- W001 review commit: `ea19fcec32abeda2bbcf261600d95fcf61b0081a`
- Batch file: `daily_queue/2026-07-31/SF_026_HOTFIX_R1_SIX_SLOT_BATCH.md`
- Current authoritative gate: 026 HOLD

## Required intake

1. SLOT_01~04 exact commits and Worker reports
2. SLOT_05 independent inspection exact commit and report
3. Current main HEAD
4. Changed-file list from baseline through hotfix completion
5. All executed test commands and results
6. Tests not run and remaining risks

## Gate criteria

`READY_TO_AUTHORIZE_026_LOCAL_DRY_RUN`은 아래가 모두 concrete evidence로 확인된 경우에만 제안한다.

- rejected first claim → command invocation 0
- rejected first claim → receipt save 0
- command ID → canonical executable/argv/spec exact binding
- mismatched allowed ID/spec → subprocess invocation 0
- unknown command ID → execution reject
- FileNotFoundError/OSError/timeout → structured failure result
- receipt schema/identity required fields enforced
- all forbidden counter fields required and zero
- valid receipt first accept / duplicate reject preserved
- Python compile/import checks pass
- report/temp 허용 경로 밖 unexpected mutation 0 observed
- GPT/browser/service/API/middleware/deploy effect 0
- 026 itself remains unexecuted

## Final decision values

다음 중 하나만 사용한다.

- `READY_TO_AUTHORIZE_026_LOCAL_DRY_RUN`
- `KEEP_026_HOLD_PENDING_FIXES`
- `BLOCKED_NEEDS_COMMANDER_DECISION`

## Decision handling

### READY

- 026 gate를 직접 실행하지 않는다.
- 별도 Commander용 execution prompt draft만 작성한다.
- 실행 prompt에는 exact authorized HEAD와 one-time local dry-run 범위를 명시한다.

### KEEP HOLD

- 실패 항목마다 작은 hotfix 범위만 지정한다.
- GREEN 산출물의 재작성을 요구하지 않는다.

### BLOCKED

- Commander가 결정해야 하는 정확한 쟁점 하나와 기본 권고안을 적는다.

## Allowed output

- `reports/slot_06_026_hotfix_r1_gate_closure_<timestamp>/WORKER_REPORT_SLOT_06.md`
- READY인 경우에만 `daily_queue/2026-07-31/026_LOCAL_DRY_RUN_AUTHORIZATION_DRAFT.md`
  - 파일명에 DRAFT를 유지한다.
  - 실행 권한으로 취급하지 않는다.

## Forbidden output

- 026 실행
- PC Agent service start
- production source 수정
- evidence 없이 027 진행
- authorization draft를 실제 authorization으로 표기

## Done-light report

WORKER_REPORT_START
worker_id: SOURCE_FACTORY_SLOT_06
task_id: SF_026_R1_GATE_CLOSURE
worker_function_class: INSPECTOR_WORKER
upstream_commits:
current_head:
evidence_checked:
tests_run_by_upstream:
tests_not_run:
remaining_risks:
final_decision:
next_action:
WORKER_REPORT_END
