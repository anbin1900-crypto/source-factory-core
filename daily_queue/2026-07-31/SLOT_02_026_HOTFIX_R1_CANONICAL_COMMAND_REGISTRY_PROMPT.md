# SLOT 02 Prompt — 026 Canonical Command Registry

ISSUED_AT_KST: 2026-07-31T13:17+09:00
REPOSITORY: anbin1900-crypto/source-factory-core
BRANCH: main
BATCH_ID: SF_026_HOTFIX_R1_20260731_1317
SLOT_ID: SLOT_02
WORKER_ID: SOURCE_FACTORY_SLOT_02
TASK_ID: SF_026_R1_CANONICAL_COMMAND_REGISTRY
WORKER_FUNCTION_CLASS: CORE_PATCH_WORKER
DEPENDENCY_STATUS: INDEPENDENT
CURRENT_GATE: 026_HOLD
MODE: SMALL_HOTFIX_ONLY / ASSIGNED_FILE_ONLY / NO_026_EXECUTION
REPORT_TO: SOURCE_FACTORY_COMMANDER

## Priority 0

- 지정되지 않은 파일을 수정하지 않는다.
- 기존 기능을 삭제·교체하지 않는다.
- 작은 additive patch를 우선한다.
- 026 verifier를 실행하지 않는다.
- GPT·브라우저·PC Agent service·외부 API·미들웨어·배포를 실행하지 않는다.
- 자기 산출물에 최종 GREEN 판정을 내리지 않는다.

## Authority and evidence

- Baseline HEAD: `7be56f647f9b2019f90d8a8867302877e7eef467`
- W001 report commit: `ea19fcec32abeda2bbcf261600d95fcf61b0081a`

## Assigned file

- `src/pc_agent/local_command_runner.py`

## Problem

현재 allowlist는 `command_id` 포함 여부만 검사한다. 호출자는 허용된 ID `LOCAL_PYTHON_VERSION_CHECK`를 유지하면서 다른 실행 파일이나 임의 argv를 넣을 수 있다.

## Required implementation

1. 허용 명령을 immutable canonical registry로 정의한다.
2. 최소한 다음 값을 명령 ID와 결속한다.
   - executable/argv
   - cwd 정책
   - timeout_seconds
   - expected_exit_code
   - effect
3. 실행 시 전달받은 spec 전체가 canonical spec과 일치하는지 검사하거나, 외부 spec을 받지 않고 registry에서 직접 resolve한다.
4. 불일치 시 실행하지 않고 구조화된 상태를 반환한다.
   - 권장 status: `REJECTED_COMMAND_SPEC_MISMATCH`
   - exit_code: -1
   - stdout: empty
   - stderr: mismatch reason
5. 기존 `LOCAL_PYTHON_VERSION_CHECK` 정상 경로를 보존한다.
6. timeout 처리와 함께 `FileNotFoundError` 및 일반 `OSError`를 deterministic result로 변환한다.
7. `shell=False`를 유지한다.

## Required negative checks

- allowed ID + 임의 argv → 실행 거부
- allowed ID + timeout 변경 → 실행 거부
- allowed ID + cwd 변경 → 실행 거부
- unknown ID → 실행 거부
- canonical Python version spec → 기존 정상 실행 가능

실제 026 verifier는 실행하지 않는다. 필요하면 fake executable 없이 spec comparison 단계까지만 검증한다.

## Allowed output

- `src/pc_agent/local_command_runner.py` 최소 수정
- `reports/slot_02_026_canonical_command_registry_<timestamp>/WORKER_REPORT_SLOT_02.md`

## Forbidden output

- 다른 production source 수정
- broad shell command allowlist
- wildcard executable/argv 허용
- 026 execution 결과
- 025 PASS 변경

## Required checks

- `python -m py_compile src/pc_agent/local_command_runner.py`
- module import check
- canonical spec mismatch가 subprocess 호출 전에 차단되는지 정적 또는 spy 검증

## Done-light report

WORKER_REPORT_START
worker_id: SOURCE_FACTORY_SLOT_02
task_id: SF_026_R1_CANONICAL_COMMAND_REGISTRY
worker_function_class: CORE_PATCH_WORKER
files_created:
files_modified:
tests_run:
tests_not_run:
canonical_binding_status:
oserror_handling_status:
known_risks:
next_needed: SLOT_05_INTAKE
WORKER_REPORT_END
