# Source Factory 026 HOTFIX R1 — Six-Slot Batch

ISSUED_AT_KST: 2026-07-31T13:17+09:00
REPOSITORY: anbin1900-crypto/source-factory-core
BRANCH: main
BASELINE_HEAD: 7be56f647f9b2019f90d8a8867302877e7eef467
W001_REVIEW_COMMIT: ea19fcec32abeda2bbcf261600d95fcf61b0081a
BATCH_ID: SF_026_HOTFIX_R1_20260731_1317
BATCH_VERSION: 1.0
CONSTITUTION_VERSION: 2.1.2-COMPACT
CURRENT_GATE: 026_HOLD
MODE: HOTFIX_PREPARATION_AND_VERIFY_ONLY / NO_026_EXECUTION
CREATED_BY_COMMANDER: SOURCE_FACTORY_COMMANDER
QUEUE_TARGET: daily_queue/2026-07-31

## Goal

W001 review에서 확인된 PC Agent MVP 차단요인을 최소 범위로 수정하고, 독립 검증 후에만 026 local dry-run gate 개방 여부를 판정한다.

## Slot order and dependency map

1. SLOT_01 — claim-before-command enforcement
   - class: CORE_PATCH_WORKER
   - dependency_status: INDEPENDENT
2. SLOT_02 — canonical command registry and exact allowlist binding
   - class: CORE_PATCH_WORKER
   - dependency_status: INDEPENDENT
3. SLOT_03 — terminal receipt identity/schema validation hardening
   - class: CORE_PATCH_WORKER
   - dependency_status: INDEPENDENT
4. SLOT_04 — negative-path and mutation-observation verification package
   - class: TEST_FIXTURE_WORKER
   - dependency_status: INDEPENDENT
5. SLOT_05 — combined independent inspection
   - class: INSPECTOR_WORKER
   - dependency_status: DEPENDS_ON_SLOT_01_02_03_04
6. SLOT_06 — closure and 026 gate decision
   - class: DOCS_WORKER / GATE_DECISION_WORKER
   - dependency_status: DEPENDS_ON_SLOT_05

## Shared rules

- 026 local MVP verifier를 실행하지 않는다.
- PC Agent service를 시작하지 않는다.
- GPT 호출, 브라우저 실행, 외부 API, 미들웨어 전송, production deploy를 하지 않는다.
- 지정된 파일과 산출물 범위 밖을 수정하지 않는다.
- 기존 025 PASS를 되돌리거나 재판정하지 않는다.
- source modification은 작은 hotfix로 제한한다.
- 각 Worker는 자신의 산출물에 최종 GREEN 판정을 내리지 않는다.
- 모든 보고에는 exact commit SHA, files changed, tests run/not run, known risks, next needed를 포함한다.

## Gate sequence

SLOT_01~04 병렬 완료 → SLOT_05 독립검사 → SLOT_06 gate 판정.

026 실행은 SLOT_06의 명시적 `READY_TO_AUTHORIZE_026_LOCAL_DRY_RUN` 판정 전까지 금지한다.

NEXT_BATCH_PLAN: SLOT_06이 READY를 판정한 경우에만 별도 026 execution prompt를 작성한다.
