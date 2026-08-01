# SLOT 03 — SF_028 P0 Wave 1 Static Classification Report

REPORTED_AT_KST: 2026-08-01T19:30+09:00
REPOSITORY: anbin1900-crypto/source-factory-core
WORKER_ID: SLOT_03_SF028_P0_WAVE1_CLASSIFICATION_WORKER
ASSIGNMENT_ID: SF028-P0-W01-S03-20260801-1920KST
TASK_ID: SF_028_P0_WAVE_01_SLOT_03_CLASSIFICATION
WORKER_FUNCTION_CLASS: SOURCE_CLASSIFICATION_WORKER / STATIC_INSPECTOR_WORKER
MODE: READ_ONLY_SOURCE_REVIEW / NO_EXECUTION / NO_PROMOTION
OBSERVED_MAIN_HEAD_BEFORE_RESULT: f78299c8e2c912f712bac3fcb671096560648203
COMMANDER_RESEQUENCE_COMMIT: 75d816984ef29bdc7fc9c2bd9e29899c485b9642
SLOT_PROMPT_COMMIT: 08a595cd5d5d54b210eed98228474ce586cbdc8b
CLASSIFICATION_RESULTS_COMMIT: f8827318c4e1891094ddaf801000c4a583b65012

## Terminal status

`SF_028_P0_WAVE01_SLOT03_CLASSIFICATION_PASS`

정확히 배정된 12개 Source ID를 정적 검사했다. 어떤 후보 소스도 실행·수정·승격·설치·병합하지 않았다.

## 권위 및 패키지 검증

- Drive file ID: `1cMY3OXo8NiOm6CTQkty8k3nbqDV26JHT`
- Drive file: `SF028_P0_EXTRACT_20260801_062137_WAVE_01_SLOT_03.zip`
- expected size: `50875`
- observed size: `50875`
- expected SHA-256: `c5f184c16c306559f0e30cc19dedaf7e0c37b5e8b817b1e49bd47d61fb3181c4`
- observed SHA-256: `c5f184c16c306559f0e30cc19dedaf7e0c37b5e8b817b1e49bd47d61fb3181c4`
- ZIP member path safety: PASS
- embedded `SLOT_MANIFEST.json`: PASS / `READY`
- manifest packaged count: `12`
- expected Source IDs: `12`
- actual unique Source IDs: `12`
- missing Source IDs: 없음
- extra Source IDs: 없음
- all candidate SHA-256 checks: PASS
- embedded hard-secret hits: `0`
- embedded review hits: `0`

## 분류 집계

- `DIRECT_REUSE`: 6
- `ADAPTER_REQUIRED`: 3
- `PROJECT_BOUND`: 2
- `SUPERSEDED`: 1
- 그 밖의 분류: 0

## 후보별 판정

| Source ID | File | Primary classification | 정적 판정 요약 | Verification |
|---|---|---|---|---|
| `PCAGENT-AUTO-SRC-000881` | `stage4TaeraLinkExtractor.js` | `DIRECT_REUSE` | 링크 추출·정규화·중복 제거를 수행하는 무의존 순수 파서 | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-000499` | `stage3DispatchController.js` | `SUPERSEDED` | 후속 `000543`보다 오래된 preview 기본 동작의 Stage 3 controller | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-000529` | `diagnostics.js` | `PROJECT_BOUND` | Source Factory 고정 레이아웃·헌법·worker browser 진단기 | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-000536` | `rawOutputStore.js` | `ADAPTER_REQUIRED` | 로컬 raw output·state 저장 기능이나 다수의 프로젝트 helper에 결합 | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-000543` | `stage3DispatchController.js` | `ADAPTER_REQUIRED` | 후속 dispatch-write controller이나 파일시스템·Stage 3 경로 계약에 결합 | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-000552` | `workerFolderManager.js` | `ADAPTER_REQUIRED` | worker 폴더 생성·검증 기능이나 worker/path 정책에 결합 | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-000637` | `stage4DispatchPacketModel.js` | `DIRECT_REUSE` | 무의존 immutable dispatch packet 데이터 모델 | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-000645` | `stage4PromptRetryPolicy.js` | `DIRECT_REUSE` | 타이머 실행 없이 retry/manual-review 결정을 계산하는 순수 정책 엔진 | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-000650` | `stage4TaeoOutputCaptureAdapter.js` | `DIRECT_REUSE` | capture request/result/error 계약을 생성하는 무의존 데이터 adapter | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-000655` | `stage4TaeoResponseStabilityDetector.js` | `DIRECT_REUSE` | 응답 안정성과 WORKER_REPORT/SOURCE_FILE 종료 marker를 판정하는 순수 detector | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-000660` | `stage4WorkerOutputCollector.js` | `DIRECT_REUSE` | worker output envelope·상태 전이·요약을 만드는 무의존 모델 | `V1_STATIC` |
| `PCAGENT-AUTO-SRC-000687` | `collectorCommanderGateHandoffAdapter.js` | `PROJECT_BOUND` | W44/W45/W54 호환층·gate·prompt version·Project Panel metadata가 누적된 프로젝트 adapter | `V1_STATIC` |

## 핵심 관계 및 판단 근거

1. `PCAGENT-AUTO-SRC-000499`와 `PCAGENT-AUTO-SRC-000543`은 동일 Stage 3 controller 계열이다. 정적 유사도는 약 `0.9895`이며, 후속 `000543`은 `dispatchToWorkers`와 `distributeCollectedFiles`의 기본 `dryRun`을 `true`에서 `false`로 바꾼다. 따라서 `000499`는 `SUPERSEDED`, `000543`은 filesystem·경로 계약 분리가 필요한 `ADAPTER_REQUIRED`로 판정했다.
2. `000637`, `000645`, `000650`, `000655`, `000660`, `000881`은 로컬 require가 없고 데이터 변환만 수행한다. 파일시스템·프로세스·네트워크·브라우저·미들웨어·서비스 실행이 없어 `DIRECT_REUSE`로 판정했다. 단, JSON 원장의 각 next action과 fixture 요구는 승격 전 수행해야 한다.
3. `000536`과 `000552`는 유용한 저장·폴더 기능을 제공하지만 Source Factory path, worker identity, state, folder contract에 결합되어 있고 동기식 filesystem mutation을 수행하므로 `ADAPTER_REQUIRED`다.
4. `000529`는 현재 Source Factory의 package/main/renderer 경로, worker browser 폴더, 헌법 파일명, restricted root 규칙을 직접 내장하므로 `PROJECT_BOUND`다.
5. `000687`은 단일 파일에 Stage 4 W44/W45/W54 호환 wrapper와 gate status, prompt-package version, Project Panel identity 처리가 누적돼 있어 범용 core가 아니라 `PROJECT_BOUND`다.
6. manifest의 `duplicate_copy_count`는 반복 복사 정황으로만 사용했다. 배정된 12개 내부에서 byte-identical 상대가 확인되지 않은 후보를 `EXACT_DUPLICATE`로 판정하지 않았다.

## 경계 준수

- source execution: `0`
- source modification: `0`
- dependency installation: `0`
- runtime/service start: `0`
- external API call: `0`
- browser automation: `0`
- middleware transmission: `0`
- candidate promotion: `0`
- Ready/Merge: `0`
- OLD_ROOT deletion: `0`

## 연속성 기록

Commander resequence를 읽기 전에 당시 유효했던 Active Core copy 배정에 따라 안전 복사 실행기 `tools/sf028_active_core_copy.py`를 커밋 `54605544f0dfd3f170471b4bc112c40d750c7592`로 생성했다. 이후 최신 Commander 권위 `75d816984ef29bdc7fc9c2bd9e29899c485b9642`를 수용하자마자 local copy track을 HOLD하고 P0 분류로 전환했다. 해당 실행기는 실행하지 않았으며 Windows `D:`/`E:` 복사나 OLD_ROOT 변경을 주장하지 않는다.

WORKER_REPORT_START
worker_id: SLOT_03_SF028_P0_WAVE1_CLASSIFICATION_WORKER
assignment_id: SF028-P0-W01-S03-20260801-1920KST
task_id: SF_028_P0_WAVE_01_SLOT_03_CLASSIFICATION
worker_function_class: SOURCE_CLASSIFICATION_WORKER / STATIC_INSPECTOR_WORKER
observed_main_head_before_result: f78299c8e2c912f712bac3fcb671096560648203
classification_results_commit: f8827318c4e1891094ddaf801000c4a583b65012
drive_file_id: 1cMY3OXo8NiOm6CTQkty8k3nbqDV26JHT
zip_sha256_status: PASS_c5f184c16c306559f0e30cc19dedaf7e0c37b5e8b817b1e49bd47d61fb3181c4
zip_size_status: PASS_50875
manifest_status: PASS_READY_12
source_id_status: PASS_EXACTLY_12_UNIQUE_NO_EXTRA_NO_MISSING
files_created:
  - reports/sf028_p0_wave01_slot03_20260801_1930KST/CLASSIFICATION_RESULTS_SLOT_03.json
  - reports/sf028_p0_wave01_slot03_20260801_1930KST/WORKER_REPORT_SLOT_03.md
files_modified: []
classification_counts:
  DIRECT_REUSE: 6
  ADAPTER_REQUIRED: 3
  PROJECT_BOUND: 2
  SUPERSEDED: 1
verification_level: V1_STATIC
checks_run:
  - Drive ZIP size and SHA-256 verification
  - safe ZIP member path inspection
  - embedded manifest parsing and exact Source ID set comparison
  - per-source SHA-256 verification
  - static require/export/function/effect/path-coupling inspection
  - stage3DispatchController 000499 versus 000543 static comparison
checks_not_run:
  - source execution
  - dependency installation
  - fixture/integration/runtime tests
forbidden_operations:
  source_execution: NOT_RUN
  source_modification: NOT_RUN
  service_start: NOT_RUN
  external_api_browser_middleware: NOT_RUN
  promotion_ready_merge: NOT_RUN
  old_root_delete: NOT_RUN
class_contract_status: PASS_READ_ONLY_STATIC_CLASSIFICATION
priority_0_status: PASS
known_risks:
  - V1_STATIC does not prove runtime compatibility; each promotion next action remains required.
  - Manifest duplicate_copy_count does not prove byte identity and was not used alone for EXACT_DUPLICATE.
  - Prior copy runner commit exists but remained inert after commander resequence.
next_needed: SLOT_06_INTEGRATION_AFTER_SLOT_01_TO_SLOT_05_ACTUAL_RESULT_COMMITS
terminal_status: SF_028_P0_WAVE01_SLOT03_CLASSIFICATION_PASS
WORKER_REPORT_END
