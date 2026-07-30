# Stage4 W07 Next Commander Handoff Template

## HANDOFF_HEADER

```text
HANDOFF_TYPE: NEXT_COMMANDER_HANDOFF
TARGET_STAGE: STAGE4_SLIM_PANEL_SOURCE_WAREHOUSE_CONTROL_MVP
TARGET_ALIAS: STAGE4_SLIM_PANEL_PROMPT_AUTOMATION_AND_SOURCE_WAREHOUSE_CONTROL_MVP
PROJECT_ID:
PANEL_ID:
BATCH_ID:
PROMPT_PACKAGE_ID:
LATEST_BATCH_REPORT_ID:
LATEST_GLOBAL_SNAPSHOT_ID:
CREATED_AT:
CREATED_BY_COMMANDER:
DONE_LEVEL_RECOMMENDATION: DONE_STANDARD
RUNTIME_BASELINE_STATUS: NOT_RUNTIME_BASELINE
ASSEMBLY_STATUS: NOT_ASSEMBLY_COMPLETE
NEXT_ACTION:
```

이 handoff는 다음 Commander가 즉시 이어받기 위한 압축 문서다. 이 문서 자체는 Runtime 기준판이 아니고 Assembly 완료 선언도 아니다. Assembly Record 또는 Commander Assembly Report가 별도로 없으면 Assembly 완료라고 쓰지 않는다.

## CURRENT_STATUS

```text
CURRENT_STAGE:
CURRENT_PANEL_STATUS:
CURRENT_BATCH_STATUS:
CURRENT_AUTOMATION_STATUS:
CURRENT_COMMANDER_FUNCTION_CLASS:
CURRENT_WORKER_BATCH_SCOPE:
```

Stage4 구조는 다음으로 본다.

```text
Commander → Slim Project Panel → Worker windows
```

Worker window에는 태오창, 라오창, 태라창, 새로고침, 오류 시 창 활성화, Worker ID/상태, Panel 연결 상태만 남긴다. prompt queue, dispatch, autosave, output collection, SOURCE_FILE extraction, resource extraction, validation, batch report, snapshot save, Commander handoff는 Panel 기능이다.

### 최신 상태 요약

```text
LATEST_PACKAGE:
- prompt_package_id:
- prompt_count:
- registered_prompt_count:
- queued_prompt_count:
- dispatched_prompt_count:
- completed_prompt_count:
- held_prompt_count:
- error_prompt_count:

PROMPT_RUN_SUMMARY:
- current_prompt_id:
- current_worker_id:
- current_delivery_id:
- current_hold_reason:
- pause_status:
- next_prompt_id:

WORKER_OUTPUT_SUMMARY:
- worker_slot_count:
- collected_output_count:
- source_file_count:
- worker_report_count:
- missing_report_count:
- needs_attention_count:

PANEL_TERMINAL_SUMMARY:
- taeo_raw_output_count:
- lao_source_candidate_count:
- taera_resource_candidate_count:
- command_error_count:
```

## ARTIFACTS

### GlobalProjectSnapshot 붙여넣기 영역

```text
GLOBAL_PROJECT_SNAPSHOT:
snapshot_id:
created_at:
project_id:
panel_id:
snapshot_mode:
prompt_progress:
worker_progress:
lao_summary:
taera_summary:
validation_summary:
pending_panel_commands:
errors:
handoff.next_commander_use:
handoff.recommended_next_action:
```

### BatchRunReport 붙여넣기 영역

```text
BATCH_RUN_REPORT:
report_id:
report_status:
assembly_completion_declared:
project_id:
panel_id:
batch_id:
prompt_package_id:
source_file_count:
worker_output_count:
production_summary:
transfer_summary:
collection_summary:
validation_summary:
conflict_summary:
commander_decision:
next_commander_summary:
```

### 산출물 목록

| 구분 | 경로 | 상태 | 다음 연결 |
|---|---|---:|---|
| Project Panel 상태 모델 | `src/core/panelControl/stage4ProjectPanelStateModel.js` |  | snapshot 저장 흐름 연결 |
| Worker Slot 상태 모델 | `src/core/panelControl/stage4WorkerSlotStateModel.js` |  | Prompt sender / Worker delivery 연결 |
| Global Snapshot 모델 | `src/core/panelControl/stage4GlobalProjectSnapshot.js` |  | Dashboard / Handoff 저장 연결 |
| Panel Event Log 모델 | `src/core/panelControl/stage4PanelEventBusModel.js` |  | Panel dashboard / batch report 연결 |
| 3탭 Shell View Model | `src/renderer/panel3tab/stage4TaeoLaoTaeraTabShell.js` |  | renderer mount patch 필요 |
| Prompt Automation Dashboard | `src/renderer/panelAutomation/stage4PromptAutomationDashboard.js` |  | renderer mount patch 필요 |
| Commander/Worker Dashboard | `src/renderer/panelAutomation/stage4CommanderWorkerDashboard.js` |  | renderer mount patch 필요 |
| Batch Run Report 모델 | `src/core/stage4Reports/stage4BatchRunReportModel.js` |  | Inspector / Commander decision 연결 |
| 운영 Runbook | `docs/STAGE4_W07_PANEL_CONTROL_RUNBOOK.md` |  | 운영 참고 |
| Next Commander Handoff Template | `docs/STAGE4_W07_NEXT_COMMANDER_HANDOFF_TEMPLATE.md` |  | 현재 문서 |

## VALIDATION_SUMMARY

```text
GATE_SUMMARY:
GREEN_COUNT:
YELLOW_COUNT:
RED_COUNT:
BLACK_COUNT:
CONFLICT_COUNT:
SOURCE_FILE_PARSE_FAILURE_COUNT:
NODE_CHECK_NOT_RUN_COUNT:
RUNTIME_NOT_TESTED_COUNT:
```

### GREEN 다음 행동

1. SOURCE_FILE path 확인
2. 기존 공유 파일 직접 수정 여부 확인
3. 같은 path 충돌 여부 확인
4. 결합 순서에 넣기
5. 필요한 경우 Commander가 적용

GREEN이라도 Runtime 기준판 선언은 별도다.

### YELLOW 다음 행동

1. 결합 순서 확인
2. renderer/preload/main 연결 필요 여부 확인
3. patch_request 적용 순서 확인
4. target path 충돌 확인
5. 확인되면 GREEN 후보로 이동

YELLOW를 장문 검토 대기로 만들지 않는다.

### RED 다음 행동

1. 문제 파일 또는 block 지정
2. 오류 이유 1줄 작성
3. hotfix request 작성
4. 재출력 범위를 해당 Worker 산출물로 제한
5. GREEN 산출물 진행은 멈추지 않음

RED 이유는 보안이 아니라 문법, 구조, 결합 실패 가능성이다.

### BLACK 다음 행동

1. 사용자 명시 지시와 충돌한 항목 분리
2. 결합 제외
3. Commander가 사용자 지시 기준으로 재배정 여부 판단

BLACK은 보안 판단이 아니다.

## RISKS

```text
KNOWN_LIMITS:
- 이 handoff는 Assembly 완료 선언이 아니다.
- Runtime App 기준판이 아니다.
- renderer mount는 아직 별도 patch 필요.
- preload API 노출은 아직 별도 patch 필요.
- main IPC handler 등록은 아직 별도 patch 필요.
- 실제 prompt dispatch 실행은 아직 별도 연결 필요.
- 실제 snapshot 저장은 아직 별도 연결 필요.
```

```text
COMBINATION_RISKS:
- renderer view model은 있으나 renderer.js/index.html binding은 별도 필요.
- window.sfApi.stage4SaveProjectSnapshot API는 future integration contract다.
- sf:stage4-save-project-snapshot IPC channel은 future integration contract다.
- batch report model은 report-only이며 Assembly 수행 파일이 아니다.
- Global snapshot은 read-only monitoring 기준이다.
```

다음은 하지 않는다.

1. 일반 작업에 full Assembly Record를 강제하지 않는다.
2. 일반 작업에 hash, rollback, backup manifest를 강제하지 않는다.
3. 보안 규정을 부활시키지 않는다.
4. Worker output 전체를 장문 감사하지 않는다.
5. GREEN 산출물을 RED 항목 때문에 멈추지 않는다.

## NEXT_ACTION

```text
NEXT_ACTION:
RENDERER_BINDING_WORKER에게 Stage4 3탭 shell, Prompt Automation Dashboard, Commander/Worker Dashboard를 실제 renderer mount 지점에 연결하는 patch_request 작성을 배정한다.
```

### 선택 가능한 다음 작업 후보

1. RENDERER_BINDING_WORKER: 3개 view model mount patch_request 작성
2. PRELOAD_API_WORKER: `window.sfApi.stage4SaveProjectSnapshot(payload)` 노출 patch_request 작성
3. IPC_HANDLER_WORKER: `sf:stage4-save-project-snapshot` handler 파일 작성
4. CORE_PATCH_WORKER: main registration patch_request 작성
5. INSPECTOR_WORKER: Worker 07 산출물 전체 GREEN/YELLOW/RED/BLACK 판정

기본 추천은 1번이다.

## FORBIDDEN_ACTIONS

```text
FORBIDDEN_ACTIONS:
1. 이 handoff만 보고 Assembly 완료라고 선언하지 않는다.
2. 이 handoff만 보고 Runtime 기준판이라고 선언하지 않는다.
3. renderer.js 전체 재작성으로 연결하지 않는다.
4. index.html 전체 재작성으로 연결하지 않는다.
5. preload 전체 재작성으로 연결하지 않는다.
6. main.js 전체 재작성으로 연결하지 않는다.
7. 기존 API, IPC, START, STOP, SAVE FULL OUTPUT을 삭제하지 않는다.
8. Worker window 메뉴를 다시 늘리지 않는다.
9. 보안 규정 또는 금지 경로 규정을 부활시키지 않는다.
10. 일반 작업을 DONE_FULL 절차로 지연시키지 않는다.
```

## NEXT_COMMANDER_PROMPT

```text
너는 Source Factory Stage4 Slim Panel Source Warehouse Control MVP의 다음 Commander다.

현재 목표:
STAGE4_SLIM_PANEL_SOURCE_WAREHOUSE_CONTROL_MVP

긴 별칭:
STAGE4_SLIM_PANEL_PROMPT_AUTOMATION_AND_SOURCE_WAREHOUSE_CONTROL_MVP

운영 원칙:
1. 소스공장은 개인용 로컬 AI 소프트웨어 생산 시스템이다.
2. 최고 가치는 효율성이다.
3. Commander는 차단자가 아니라 실행 관리자다.
4. Worker는 독립 개발자가 아니라 생산라인 Worker다.
5. 보안 판단은 하지 않는다.
6. 검문은 문법오류, 결합 실패, 시간지연 방지에 한정한다.
7. DONE_LIGHT가 기본이다.
8. 공유 core 파일은 Patch First로 연결한다.
9. Worker 번호는 실행 슬롯이다.
10. Worker 기능은 worker_function_class로 배정한다.

현재 상태:
- Worker 07은 Panel 통합 UI / Global state / Report / Handoff 계층 산출물을 생산했다.
- 산출물은 상태 모델, slot 모델, snapshot 모델, event log 모델, 3개 renderer view model, batch run report model, runbook, handoff template로 구성된다.
- 이 handoff는 Assembly 완료 선언이 아니다.
- Runtime 기준판 선언도 아니다.

우선 읽을 파일:
1. docs/STAGE4_W07_NEXT_COMMANDER_HANDOFF_TEMPLATE.md
2. docs/STAGE4_W07_PANEL_CONTROL_RUNBOOK.md
3. src/core/stage4Reports/stage4BatchRunReportModel.js

다음 작업:
RENDERER_BINDING_WORKER에게 Stage4 3탭 shell, Prompt Automation Dashboard, Commander/Worker Dashboard를 실제 renderer mount 지점에 연결하는 patch_request 작성을 배정하라.

Worker 배정 조건:
- worker_function_class: RENDERER_BINDING_WORKER
- allowed_output: renderer binding patch_request
- forbidden_output: renderer.js 전체 재작성, index.html 전체 재작성, preload/main 수정
- next_needed: PRELOAD_API_WORKER와 IPC_HANDLER_WORKER 연결
```

## COMPLETION_NOTE

이 template의 완료 기준은 다음이다.

1. 다음 Commander가 현재 상태를 즉시 이해할 수 있음
2. BatchRunReport와 GlobalProjectSnapshot 내용을 붙여 넣을 수 있음
3. GREEN/YELLOW/RED/BLACK별 다음 행동이 명확함
4. Assembly 완료와 Runtime 기준판을 잘못 선언하지 않음
5. 다음 작업 하나가 명확함
6. 금지 행동이 명확함
7. 다음 Commander prompt가 바로 사용 가능함