# SLOT 03 — SF_028 P0 Wave 3 Static Classification Report

REPORTED_AT_KST: 2026-08-01T21:23+09:00
REPOSITORY: anbin1900-crypto/source-factory-core
WORKER_ID: SLOT_03_SF028_P0_WAVE3_CLASSIFICATION_WORKER
TASK_ID: SF_028_P0_WAVE_03_SLOT_03_CLASSIFICATION
WORKER_FUNCTION_CLASS: SOURCE_CLASSIFICATION_WORKER / STATIC_INSPECTOR_WORKER
MODE: READ_ONLY_SOURCE_REVIEW / NO_EXECUTION / NO_PROMOTION
OBSERVED_MAIN_HEAD_BEFORE_RESULT: 61a01df401e357b013cb4fc18d141dc370ac4c85
WAVE2_CLOSED_OPEN_WAVE3_COMMIT: 61a01df401e357b013cb4fc18d141dc370ac4c85
WAVE3_BATCH_COMMIT: e162e6018a709bbae470604fef9b431673764e8a
SLOT_PROMPT_COMMIT: 595f20bad485fc4116dee44e9a47ccb77c5cbd3b
CLASSIFICATION_RESULTS_COMMIT: 03df7d63d92a6e7da2304857743205aac76c31b4

## Terminal status

`SF_028_P0_WAVE03_SLOT03_CLASSIFICATION_PASS`

이 terminal은 배정된 12개 후보의 V1 정적 분류가 완료됐다는 뜻이다. 공식 재사용 승격, runtime 연결, Ready, Merge 또는 production 반영을 의미하지 않는다.

## 권위 및 패키지 검증

- Drive file ID: `1U-ycN2xkayVSJUo9uW6pafhXdrOb9AmR`
- ZIP: `SF028_P0_EXTRACT_20260801_062137_WAVE_03_SLOT_03.zip`
- expected/observed size: `51291 / 51291` — PASS
- expected/observed SHA-256: `3e909ee2e989a621256f8bf26012eedc7f520d17140766de8749d64e730dacab / 3e909ee2e989a621256f8bf26012eedc7f520d17140766de8749d64e730dacab` — PASS
- ZIP member path safety: `PASS`
- embedded `SLOT_MANIFEST.json`: `READY`
- manifest wave/slot: `3 / 3`
- packaged candidates: `12`
- expected Source IDs: `12`
- actual unique Source IDs: `12`
- missing Source IDs: 없음
- extra Source IDs: 없음
- candidate SHA-256 and byte size: `12/12 PASS`
- embedded hard-secret hits: `0`
- embedded review hits: `0`

## 구문 및 정적 초기화 검사

후보 코드는 모듈 로드나 함수 호출 없이 `node --check` 구문 파싱만 수행했다.

- syntax-only PASS: `12`
- syntax-only FAIL: `0`
- source execution: `0`
- dependency installation: `0`

구문은 모두 유효하지만 `PCAGENT-AUTO-SRC-003485 / main.js`는 정적 초기화 결함이 있다.

- line 11에서 `registerStage3IpcHandlers(...)` 호출
- line 12에서 `const { registerStage3IpcHandlers } = require(...)` 선언
- JavaScript temporal dead zone 때문에 모듈 평가 시 `ReferenceError`가 발생하는 구조

따라서 해당 후보는 `SANITIZE_REQUIRED`로 분류했다. 소스 수정이나 모듈 실행은 수행하지 않았다.

## 분류 집계

- `DIRECT_REUSE`: 2
- `ADAPTER_REQUIRED`: 4
- `PROJECT_BOUND`: 3
- `REFERENCE_ONLY`: 1
- `SUPERSEDED`: 1
- `SANITIZE_REQUIRED`: 1
- TOTAL: 12

## 후보별 판정

| Source ID | File | Primary classification | 정적 판정 요약 | Syntax/static |
|---|---|---|---|---|
| `PCAGENT-AUTO-SRC-000564` | `stage2MenuView.js` | `PROJECT_BOUND` | Stage 2 고정 DOM·버튼·Commander 메뉴 렌더러 | `PASS` |
| `PCAGENT-AUTO-SRC-000571` | `statusView.js` | `ADAPTER_REQUIRED` | 상태 정규화+고정 DOM 렌더링+sfApi 주기 조회 | `PASS` |
| `PCAGENT-AUTO-SRC-000667` | `stage4CommanderDispatchViewModel.js` | `DIRECT_REUSE` | Commander dispatch 순수 ViewModel 생성기 | `PASS` |
| `PCAGENT-AUTO-SRC-000676` | `sequentialPromptSender.js` | `DIRECT_REUSE` | 실제 전송 없는 순차 prompt dispatch 계획기 | `PASS` |
| `PCAGENT-AUTO-SRC-000823` | `main.js` | `SUPERSEDED` | 후속 Stage 3 통합 main 이전의 Stage 1 Electron entry | `PASS` |
| `PCAGENT-AUTO-SRC-003289` | `gptPreload.js` | `ADAPTER_REQUIRED` | 고정 sf:* IPC를 노출하는 Electron preload bridge | `PASS` |
| `PCAGENT-AUTO-SRC-003485` | `main.js` | `SANITIZE_REQUIRED` | Stage 2/3 통합 main이나 선언 전 Stage 3 등록 호출 결함 | `PASS_WITH_STATIC_INITIALIZATION_DEFECT` |
| `PCAGENT-AUTO-SRC-003839` | `stage3WorkerReturnPanel.js` | `ADAPTER_REQUIRED` | Worker return 입력·preview·Commander 전송 DOM panel | `PASS` |
| `PCAGENT-AUTO-SRC-003887` | `stage35MenuCommandAdapter.js` | `REFERENCE_ONLY` | 초기 Stage 3.5 종합 menu route 계약 비교용 | `PASS` |
| `PCAGENT-AUTO-SRC-003893` | `stage35RealtimeMessagePoller.js` | `ADAPTER_REQUIRED` | timer·sfApi·DOM 결합 realtime message poller | `PASS` |
| `PCAGENT-AUTO-SRC-003951` | `stage35MenuCommandAdapter.js` | `PROJECT_BOUND` | operator-ready 고정 menu/button/event adapter | `PASS` |
| `PCAGENT-AUTO-SRC-004085` | `gptWindowController.js` | `PROJECT_BOUND` | Electron·ChatGPT·파일·IPC·menu 통합 GPT controller | `PASS` |

## 핵심 판정 근거

1. `000667`과 `000676`은 외부 I/O 없이 입력을 정규화해 ViewModel 또는 dry-run dispatch plan을 반환한다. 고정 taxonomy와 clock/id는 V2 fixture가 필요하지만 V1 기준 `DIRECT_REUSE`다.
2. `000571`, `003289`, `003839`, `003893`은 유용한 상태·IPC·return-panel·polling 기능을 제공하지만 각각 DOM, timer, preload channel, sfApi transport와 결합돼 `ADAPTER_REQUIRED`다.
3. `000564`, `003951`, `004085`은 고정 Source Factory UI/IPC/ChatGPT/Electron 계약을 직접 소유하므로 drop-in 범용 core가 아니라 `PROJECT_BOUND`다.
4. `000823`은 Stage 1 Electron main entry이며 같은 핵심 API에 Stage 2/3 handler를 추가한 후속 `003485` 계열이 존재하므로 `SUPERSEDED`다. 이는 삭제 권한이 아니며 후속 후보도 sanitization 전 승격할 수 없다.
5. `003887`과 `003951`은 같은 파일명을 사용하지만 event contract가 다르다. 초기 routing-fix 구현 `003887`은 `stage35:menu-existing-flow`, operator-ready 구현 `003951`은 `stage35:existing-flow-command`를 사용한다. exact replacement가 입증되지 않아 `003887`은 `REFERENCE_ONLY`로 보존했다.
6. `004085`은 Wave 2의 `000553 gptWindowController.js`보다 후속 Stage 4 계열이지만 Electron window/session, ChatGPT DOM, clipboard, 파일 저장, IPC, native menu patch가 한 모듈에 누적돼 계속 `PROJECT_BOUND`다.
7. 배정 12개 내부에는 byte-identical 파일이 없고, manifest `duplicate_copy_count`만으로 `EXACT_DUPLICATE`를 주장하지 않았다.

## 경계 준수

- source execution: `0`
- source modification: `0`
- dependency installation: `0`
- runtime/service start: `0`
- browser/Electron/ChatGPT start: `0`
- external API call: `0`
- middleware transmission: `0`
- candidate promotion: `0`
- Ready/Merge: `0`
- OLD_ROOT deletion: `0`
- external effect: `0`

상세 기능, 입력·출력, symbols, dependencies, external effects, coupling, lineage, evidence, risks와 next action은 `CLASSIFICATION_RESULTS_SLOT_03.json`에 기록했다.

WORKER_REPORT_START
worker_id: SLOT_03_SF028_P0_WAVE3_CLASSIFICATION_WORKER
task_id: SF_028_P0_WAVE_03_SLOT_03_CLASSIFICATION
worker_function_class: SOURCE_CLASSIFICATION_WORKER / STATIC_INSPECTOR_WORKER
observed_main_head_before_result: 61a01df401e357b013cb4fc18d141dc370ac4c85
authority_commits:
  wave2_closed_open_wave3: 61a01df401e357b013cb4fc18d141dc370ac4c85
  wave3_batch: e162e6018a709bbae470604fef9b431673764e8a
  slot_prompt: 595f20bad485fc4116dee44e9a47ccb77c5cbd3b
classification_results_commit: 03df7d63d92a6e7da2304857743205aac76c31b4
drive_file_id: 1U-ycN2xkayVSJUo9uW6pafhXdrOb9AmR
zip_sha256_status: PASS_3e909ee2e989a621256f8bf26012eedc7f520d17140766de8749d64e730dacab
zip_size_status: PASS_51291
manifest_status: PASS_READY_WAVE3_SLOT3_12
source_id_status: PASS_EXACTLY_12_UNIQUE_NO_EXTRA_NO_MISSING
files_created:
  - reports/sf028_p0_wave03_slot03_20260801_2123KST/CLASSIFICATION_RESULTS_SLOT_03.json
  - reports/sf028_p0_wave03_slot03_20260801_2123KST/WORKER_REPORT_SLOT_03.md
files_modified: []
classification_counts:
  DIRECT_REUSE: 2
  ADAPTER_REQUIRED: 4
  PROJECT_BOUND: 3
  REFERENCE_ONLY: 1
  SUPERSEDED: 1
  SANITIZE_REQUIRED: 1
verification_level: V1_STATIC
checks_run:
  - Drive ZIP metadata, size and SHA-256 verification
  - ZIP member path safety inspection
  - embedded manifest parsing and exact Source ID set comparison
  - per-source SHA-256 and byte-size verification
  - static function, I/O, symbol, dependency, effect, coupling and lineage inspection
  - node --check syntax-only parse: PASS_12
  - static TDZ/initialization-order inspection
checks_not_run:
  - source module loading or function execution
  - dependency installation
  - V2 fixture/integration/runtime tests
forbidden_operations:
  source_execution: NOT_RUN
  source_modification: NOT_RUN
  dependency_installation: NOT_RUN
  runtime_service_browser: NOT_RUN
  external_api_middleware: NOT_RUN
  promotion_ready_merge: NOT_RUN
  old_root_delete: NOT_RUN
class_contract_status: PASS_READ_ONLY_STATIC_CLASSIFICATION
priority_0_status: PASS
known_risks:
  - PCAGENT-AUTO-SRC-003485 requires initialization-order sanitization before it can load.
  - V1_STATIC does not prove runtime compatibility or authorize promotion.
  - Project-bound and adapter-required modules must not be treated as drop-in reusable core.
next_needed: SLOT_06_WAVE03_INTEGRATION_AFTER_SLOT_01_TO_SLOT_05_ACTUAL_RESULTS
terminal_status: SF_028_P0_WAVE03_SLOT03_CLASSIFICATION_PASS
WORKER_REPORT_END
