# SLOT 04 Prompt — 026 HOTFIX R1 Negative Verification Package

ISSUED_AT_KST: 2026-07-31T13:17+09:00
REPOSITORY: anbin1900-crypto/source-factory-core
BRANCH: main
BATCH_ID: SF_026_HOTFIX_R1_20260731_1317
SLOT_ID: SLOT_04
WORKER_ID: SOURCE_FACTORY_SLOT_04
TASK_ID: SF_026_R1_NEGATIVE_VERIFY_PACKAGE
WORKER_FUNCTION_CLASS: TEST_FIXTURE_WORKER
DEPENDENCY_STATUS: INDEPENDENT_AUTHORING / RUN_AFTER_SLOT_01_02_03
CURRENT_GATE: 026_HOLD
MODE: VERIFY_PACKAGE_ONLY / NO_026_EXECUTION / NO_PRODUCTION_SOURCE_MODIFICATION
REPORT_TO: SOURCE_FACTORY_COMMANDER

## Priority 0

- production source를 수정하지 않는다.
- 026 one-flow verifier를 실행하지 않는다.
- 외부 효과 없는 fake/spy/temp-directory fixture만 사용한다.
- GPT·브라우저·PC Agent service·외부 API·미들웨어·배포를 실행하지 않는다.
- 실행하지 않은 검사를 PASS로 주장하지 않는다.
- 자기 산출물에 최종 GREEN 판정을 내리지 않는다.

## Authority and evidence

- Baseline HEAD: `7be56f647f9b2019f90d8a8867302877e7eef467`
- W001 report commit: `ea19fcec32abeda2bbcf261600d95fcf61b0081a`

## Expected upstream contracts

SLOT_01:
- rejected first claim이면 command invocation 0
- receipt save 0

SLOT_02:
- command ID와 canonical argv/spec 결속
- mismatched spec subprocess invocation 0
- FileNotFoundError/OSError structured failure

SLOT_03:
- receipt schema/identity/counter presence validation 강화

## Required artifact

새 검증 스크립트 또는 fixture package를 작성한다.

권장 경로:
- `tools/source_factory_026_hotfix_r1_negative_verify.py`

공유 source 파일은 수정하지 않는다.

## Required verification cases

1. **Pre-seeded duplicate claim**
   - claim store에 동일 claim을 미리 넣는다.
   - PC Agent MVP를 호출한다.
   - first claim status: `REJECTED_DUPLICATE_CLAIM`
   - spy command runner invocation count: 0
   - receipt save invocation count 또는 stored receipt 증가: 0
   - claim store count unchanged

2. **Canonical command mismatch**
   - allowed ID에 임의 argv를 결합한다.
   - status: `REJECTED_COMMAND_SPEC_MISMATCH` 또는 동등한 명시 상태
   - subprocess invocation count: 0

3. **Unknown command ID**
   - 실행 거부
   - subprocess invocation count: 0

4. **Command launch failures**
   - FileNotFoundError fixture
   - OSError fixture
   - 구조화된 failure result 확인

5. **Receipt validation**
   - missing queue_id reject
   - blank assignment_id reject
   - blank claim_key reject
   - missing forbidden counter reject
   - non-zero forbidden counter reject
   - valid receipt first accept / duplicate reject

6. **Unexpected mutation observation**
   - 테스트 전후 report/temp directory 밖의 변경 목록을 비교한다.
   - fixture가 허용 경로 밖을 변경하면 FAIL한다.
   - 상수 0 기록이 아니라 관측 결과를 보고한다.

## Run policy

- 스크립트 작성은 SLOT_01~03과 병렬 가능하다.
- 최종 실행은 SLOT_01~03의 exact commit SHA를 intake한 후 수행한다.
- 026 one-flow verifier 또는 실행 가이드는 호출하지 않는다.

## Allowed output

- 신규 verify/fixture 파일
- `reports/slot_04_026_hotfix_r1_negative_verify_<timestamp>/` 아래 결과
- `WORKER_REPORT_SLOT_04.md`

## Forbidden output

- `src/` 수정
- remote queue mutation
- git push 자동화 내장
- PC Agent service 실행
- 실제 026 dry-run PASS 주장

## Done-light report

WORKER_REPORT_START
worker_id: SOURCE_FACTORY_SLOT_04
task_id: SF_026_R1_NEGATIVE_VERIFY_PACKAGE
worker_function_class: TEST_FIXTURE_WORKER
upstream_commits_intaked:
files_created:
files_modified:
tests_run:
tests_not_run:
duplicate_claim_no_command_status:
canonical_mismatch_no_subprocess_status:
receipt_validation_status:
unexpected_mutation_status:
known_risks:
next_needed: SLOT_05_INTAKE
WORKER_REPORT_END
