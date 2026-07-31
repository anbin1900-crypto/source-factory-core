# SLOT 01 Prompt — 026 Claim-Before-Command Enforcement

ISSUED_AT_KST: 2026-07-31T13:17+09:00
REPOSITORY: anbin1900-crypto/source-factory-core
BRANCH: main
BATCH_ID: SF_026_HOTFIX_R1_20260731_1317
SLOT_ID: SLOT_01
WORKER_ID: SOURCE_FACTORY_SLOT_01
TASK_ID: SF_026_R1_CLAIM_BEFORE_COMMAND
WORKER_FUNCTION_CLASS: CORE_PATCH_WORKER
DEPENDENCY_STATUS: INDEPENDENT
CURRENT_GATE: 026_HOLD
MODE: SMALL_HOTFIX_ONLY / ASSIGNED_FILE_ONLY / NO_026_EXECUTION
REPORT_TO: SOURCE_FACTORY_COMMANDER

## Priority 0

- 지정되지 않은 파일을 수정하지 않는다.
- 기존 기능을 삭제·교체하지 않는다.
- additive/small patch를 우선한다.
- 026 verifier를 실행하지 않는다.
- GPT·브라우저·PC Agent service·외부 API·미들웨어·배포를 실행하지 않는다.
- 자기 산출물에 최종 GREEN 판정을 내리지 않는다.

## Authority and evidence

- Baseline HEAD: `7be56f647f9b2019f90d8a8867302877e7eef467`
- W001 report: `reports/worker_001_pc_agent_mvp_hold_review_20260731_0355/WORKER_REPORT_W001.md`
- W001 report commit: `ea19fcec32abeda2bbcf261600d95fcf61b0081a`

## Assigned file

- `src/pc_agent/local_pc_agent_mvp.py`

## Problem

현재 `run_local_pc_agent_mvp`는 claim 결과를 받은 직후 상태를 검사하지 않고 `command_runner.execute(command_spec)`를 호출한다. 따라서 이미 처리된 assignment의 claim이 `REJECTED_DUPLICATE_CLAIM`이어도 명령이 실행될 수 있다.

## Required implementation

1. 첫 claim status가 정확히 `ACCEPTED_FIRST_CLAIM`인지 명령 실행 전에 검사한다.
2. accepted가 아니면 command runner를 호출하지 않고 즉시 종료한다.
3. rejected claim 경로에서는 completion terminal receipt를 만들거나 저장하지 않는다.
4. rejected/no-execution 결과에는 다음을 구조적으로 포함한다.
   - claim status
   - command status: `NOT_RUN_CLAIM_REJECTED`
   - command invocation count: 0 또는 이를 명확히 증명하는 필드
   - receipt save status: `NOT_RUN_CLAIM_REJECTED`
   - claim/receipt store count
   - external side effect count: 0
5. accepted happy path의 기존 동작은 보존한다.
6. second duplicate claim/receipt 검사는 기존 dry-run happy-path 검증을 위해 보존할 수 있으나, 첫 claim 거부 경로와 혼동하지 않는다.

## Allowed output

- `src/pc_agent/local_pc_agent_mvp.py` 최소 수정
- `reports/slot_01_026_claim_before_command_<timestamp>/WORKER_REPORT_SLOT_01.md`
- 필요 시 assigned file에 대한 작은 patch만 포함

## Forbidden output

- 다른 production source 수정
- 026 verifier 실행 결과
- remote queue mutation
- 전체 파일 재작성
- 025 PASS 변경 또는 재판정

## Required checks

- `python -m py_compile src/pc_agent/local_pc_agent_mvp.py`
- 정적 확인: rejected first claim 경로가 `command_runner.execute` 이전에 return하는지
- 실행 테스트가 필요하면 외부 효과가 없는 in-memory fake/spy만 사용하고 026 one-flow verifier는 실행하지 않는다.

## Done-light report

WORKER_REPORT_START
worker_id: SOURCE_FACTORY_SLOT_01
task_id: SF_026_R1_CLAIM_BEFORE_COMMAND
worker_function_class: CORE_PATCH_WORKER
files_created:
files_modified:
tests_run:
tests_not_run:
claim_rejection_command_invocation_status:
known_risks:
next_needed: SLOT_05_INTAKE
WORKER_REPORT_END
