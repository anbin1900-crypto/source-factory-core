# SLOT 03 Prompt — 026 Terminal Receipt Validation Hardening

ISSUED_AT_KST: 2026-07-31T13:17+09:00
REPOSITORY: anbin1900-crypto/source-factory-core
BRANCH: main
BATCH_ID: SF_026_HOTFIX_R1_20260731_1317
SLOT_ID: SLOT_03
WORKER_ID: SOURCE_FACTORY_SLOT_03
TASK_ID: SF_026_R1_TERMINAL_RECEIPT_VALIDATION
WORKER_FUNCTION_CLASS: CORE_PATCH_WORKER
DEPENDENCY_STATUS: INDEPENDENT
CURRENT_GATE: 026_HOLD
MODE: SMALL_HOTFIX_ONLY / ASSIGNED_FILE_ONLY / NO_026_EXECUTION
REPORT_TO: SOURCE_FACTORY_COMMANDER

## Priority 0

- 지정되지 않은 파일을 수정하지 않는다.
- 기존 저장·중복 차단 기능을 삭제하지 않는다.
- 작은 additive validation patch를 우선한다.
- 026 verifier를 실행하지 않는다.
- GPT·브라우저·PC Agent service·외부 API·미들웨어·배포를 실행하지 않는다.
- 자기 산출물에 최종 GREEN 판정을 내리지 않는다.

## Authority and evidence

- Baseline HEAD: `7be56f647f9b2019f90d8a8867302877e7eef467`
- W001 report commit: `ea19fcec32abeda2bbcf261600d95fcf61b0081a`

## Assigned file

- `src/queue/terminal_receipt_store.py`

## Problem

현재 terminal receipt validator의 필수 필드는 `status`, `worker_id`, `task_id`, `outputs`, `verification`, `blockers`에 한정된다. 그러나 dedupe와 추적에 필요한 schema/identity 필드가 누락되거나 공백이어도 receipt가 승인될 수 있다. 금지행위 카운터도 필드 자체가 없어도 0으로 간주된다.

## Required implementation

1. 최소 필수 필드에 다음을 추가한다.
   - `schema_version`
   - `queue_id`
   - `assignment_id`
   - `claim_key`
   - `project_code`
   - `forbidden_effect_counters`
2. 다음 identity는 문자열 공백을 허용하지 않는다.
   - worker_id
   - task_id
   - queue_id
   - assignment_id
   - claim_key
   - project_code
3. `forbidden_effect_counters`는 모든 정의된 counter 필드가 실제로 존재해야 하며 값은 0이어야 한다.
4. `outputs`, `verification`, `blockers`의 예상 타입을 검사한다.
5. invalid receipt는 저장하지 않고 구체적인 problems 목록을 반환한다.
6. 기존 valid 024B/025 형식과 호환되는지 정적으로 확인한다.
7. dedupe key는 blank identity로 생성되지 않도록 validation 이후에만 사용한다.

## Required negative checks

- queue_id 누락 → reject
- assignment_id 공백 → reject
- claim_key 공백 → reject
- forbidden counter 필드 일부 누락 → reject
- forbidden counter non-zero → reject
- outputs 타입 오류 → reject
- 완전한 valid receipt → accept
- 동일 receipt 두 번째 저장 → duplicate reject

## Allowed output

- `src/queue/terminal_receipt_store.py` 최소 수정
- `reports/slot_03_026_terminal_receipt_validation_<timestamp>/WORKER_REPORT_SLOT_03.md`

## Forbidden output

- 다른 source 수정
- 기존 receipt history 삭제
- 026 verifier 실행
- remote queue mutation
- 025 PASS 재판정

## Required checks

- `python -m py_compile src/queue/terminal_receipt_store.py`
- import check
- 임시 디렉터리 기반 valid/invalid receipt fixture 테스트

## Done-light report

WORKER_REPORT_START
worker_id: SOURCE_FACTORY_SLOT_03
task_id: SF_026_R1_TERMINAL_RECEIPT_VALIDATION
worker_function_class: CORE_PATCH_WORKER
files_created:
files_modified:
tests_run:
tests_not_run:
required_identity_validation_status:
forbidden_counter_presence_status:
duplicate_receipt_status:
known_risks:
next_needed: SLOT_05_INTAKE
WORKER_REPORT_END
