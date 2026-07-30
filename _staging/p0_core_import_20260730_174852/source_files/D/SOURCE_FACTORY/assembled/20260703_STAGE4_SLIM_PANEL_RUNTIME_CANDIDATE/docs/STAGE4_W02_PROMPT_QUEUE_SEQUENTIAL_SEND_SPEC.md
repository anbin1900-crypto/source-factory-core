# STAGE4 WORKER_02 Prompt Queue Sequential Send Spec

Target stage: STAGE4_SLIM_PANEL_SOURCE_WAREHOUSE_CONTROL_MVP  
Worker: WORKER_02  
Function class: DOCS_WORKER  
Panel integration role: PROMPT_QUEUE_SEQUENTIAL_SENDER  
Document purpose: 프롬프트 저장소, 프롬프트 패키지, 순차 전송 큐, 실행 상태, 완료 감지, 재시도, 일시정지/재개, UI view model의 연결 기준을 Inspector가 검토할 수 있게 정리한다.

---

## 1. 개요

WORKER_02의 Stage 4 산출물은 사용자가 70개 이상의 Worker 프롬프트를 직접 하나씩 복사·전송하지 않도록, Project Panel이 프롬프트를 저장하고 패키지화하고 큐로 변환한 뒤 순차 전송 흐름을 관리할 수 있게 하는 모델 계층이다.

핵심 목표는 다음이다.

1. 프롬프트를 저장 가능한 라이브러리 item으로 표현한다.
2. 여러 프롬프트를 하나의 실행 package로 묶는다.
3. package의 실행 순서를 queue item으로 변환한다.
4. queue의 current item, status, dependencies, send result를 추적한다.
5. run state가 시작, 일시정지, 재개, 중지, 완료를 표현한다.
6. Worker 응답 완료 여부를 detector가 판단한다.
7. 실패, timeout, 미완료 응답은 retry policy가 재시도 또는 수동 검토로 분류한다.
8. Prompt Queue UI는 view model만 받아 표시하고, Worker window 내부 메뉴는 늘리지 않는다.

실제 GPT 입력 자동화는 이 문서의 범위가 아니다. 이 문서는 adapter가 호출할 데이터 계약을 정의한다. 실제 창 조작, 태오창 입력 주입, 전송 버튼 조작, preload/main IPC 연결, renderer mount는 이후 WORKER_04 delivery adapter, PRELOAD_API_WORKER, CORE_PATCH_WORKER, RENDERER_BINDING_WORKER, WORKER_07 dashboard에서 연결한다.

---

## 2. 파일 목록

| 순번 | 파일 | 역할 | 연결 대상 |
|---:|---|---|---|
| 1 | `src/core/promptAutomation/stage4PromptLibraryModel.js` | 저장 프롬프트 library item 모델 | Prompt Package Builder |
| 2 | `src/core/promptAutomation/stage4PromptPackageModel.js` | 여러 prompt를 실행 package와 run order로 묶는 모델 | Prompt Queue 생성기 |
| 3 | `src/core/promptAutomation/stage4PromptQueueModel.js` | 순차 전송 queue, queue item, next item 계산 | Sequential Sender |
| 4 | `src/core/promptAutomation/stage4PromptRunStateModel.js` | 한 번의 package 실행 run state와 summary | Dashboard, Queue UI |
| 5 | `src/core/promptAutomation/stage4SequentialPromptSender.js` | Queue와 RunState를 받아 다음 전송 decision 생성 | WORKER_04 delivery adapter |
| 6 | `src/core/promptAutomation/stage4PromptCompletionDetector.js` | Worker 응답 완료 여부 detector | Worker output collector |
| 7 | `src/core/promptAutomation/stage4PromptRetryPolicy.js` | 실패, timeout, 미완료 응답 재시도 정책 | Sequential Sender |
| 8 | `src/core/promptAutomation/stage4PromptPauseResumeController.js` | pause, resume, stop 상태 전환 controller | Queue UI, Dashboard |
| 9 | `src/renderer/panelAutomation/stage4PromptQueueViewModel.js` | renderer 표시용 prompt queue view model | WORKER_07 Dashboard mount |
| 10 | `docs/STAGE4_W02_PROMPT_QUEUE_SEQUENTIAL_SEND_SPEC.md` | 현재 문서. Inspector 검토 기준과 연결 흐름 설명 | Commander, Inspector |

---

## 3. Prompt Package Flow

Prompt Package Flow는 사용자가 보관한 프롬프트 묶음을 Project Panel이 순차 전송 가능한 큐로 바꾸는 흐름이다.

### 3.1 단계

1. Prompt Library  
   사용자가 저장한 단일 프롬프트 또는 템플릿 프롬프트를 `prompt_id`, `title`, `body`, `category`, `target_role`, `tags`, `version` 형태로 보관한다.

2. Prompt Package  
   여러 prompt를 하나의 `package_id` 아래 묶는다. 70개 프롬프트 같은 대량 실행 묶음도 `prompts[]`, `target_slots[]`, `order_policy`로 표현한다.

3. Run Order  
   package의 prompt 목록을 `sequence_number`, `target_slot`, `target_worker_id`, `dispatch_packet`이 포함된 run order로 변환한다.

4. Prompt Queue  
   run order를 queue item으로 변환한다. queue는 `queue_id`, `items[]`, `current_index`, `status`, `created_at`, `updated_at`를 가진다.

5. Sequential Sender  
   `getNextPromptQueueItem(queue)` 결과를 보고 다음 전송 대상을 결정한다. 이 단계는 실제 입력 자동화가 아니라 전송 후보 결정이다.

6. Worker Delivery Adapter  
   이후 단계에서 adapter가 `target_slot_id` 또는 `target_worker_id`를 해석해 해당 Worker의 태오창으로 prompt를 전달한다.

7. Output Collector  
   Worker 응답을 수집하고 completion detector를 통해 완료 여부를 판단한다.

8. Result Update  
   완료 시 queue item은 completed, 실패 시 failed, 보류 시 held, 재시도 가능하면 retry 대상으로 전환된다.

### 3.2 데이터 흐름

```text id="04ldzi"
Prompt Library Item
-> Prompt Package
-> Prompt Package Run Order
-> Prompt Queue
-> Queue Item
-> Dispatch Packet
-> Worker Taeo Tab
-> Worker Output
-> Completion Decision
-> Queue Item Result
-> Run Summary
-> Dashboard View Model
```

---

## 4. Queue State Machine

Prompt Queue는 실제 전송 실행기가 아니라 순차 전송 판단을 위한 상태 모델이다.

### 4.1 Queue Status

| status | 의미 | 다음 상태 |
|---|---|---|
| draft | queue item이 없거나 준비 전 | ready |
| ready | 전송 가능한 item이 있음 | running, paused, completed |
| running | 하나 이상의 item이 전송 중 | paused, completed, failed |
| paused | 사용자 또는 panel command 때문에 멈춤 | ready, running, stopped |
| stopped | 사용자가 중지함 | terminal |
| completed | 모든 item이 완료 또는 skipped로 종료 | terminal |
| failed | 실패 정책상 중단됨 | terminal 또는 manual review |
| archived | 보관 상태 | terminal |

### 4.2 Queue Item Send Status

| send_status | 의미 |
|---|---|
| pending | 아직 전송되지 않음 |
| ready | dependency가 충족되어 전송 가능 |
| sent | Worker 태오창에 전송된 상태 |
| completed | Worker 응답 완료 |
| failed | 실패 또는 불완전 응답으로 실패 처리 |
| held | pause, manual review, retry backoff 등으로 보류 |
| skipped | stop 또는 정책상 건너뜀 |
| blocked | 구조 문제 또는 수동 검토 필요 |

### 4.3 Dependency Rule

Queue item은 `dependencies` 배열을 가질 수 있다. dependency가 있는 item은 의존 item이 요구 status에 도달해야 다음 전송 후보가 된다.

기본 dependency required status는 completed다.

### 4.4 Worker 수 고정 금지

Queue는 Worker 개수를 고정하지 않는다. 전송 대상은 `target_slot_id` 기준이다. Panel은 `target_slot_id`를 현재 열린 Worker window 또는 slot registry에 연결한다.

---

## 5. Send Decision Contract

Sequential Sender는 다음 입력을 종합해 다음 행동을 결정한다.

### 5.1 입력

| 입력 | 출처 | 설명 |
|---|---|---|
| queue | `stage4PromptQueueModel.js` | 다음 전송 item과 item 상태 |
| run | `stage4PromptRunStateModel.js` | 실행 상태, pause/stop 요청 |
| completion_decision | `stage4PromptCompletionDetector.js` | Worker 응답 완료 여부 |
| retry_decision | `stage4PromptRetryPolicy.js` | 실패 또는 미완료 응답 재시도 여부 |
| pause_resume_result | `stage4PromptPauseResumeController.js` | pause/resume/stop 적용 결과 |
| delivery_result | WORKER_04 예정 | 실제 Worker Taeo tab 전송 결과 |
| autosave_result | WORKER_01 예정 | prompt package, queue, run state 저장 결과 |

### 5.2 출력 행동

| decision | 실행 의미 |
|---|---|
| SEND_NEXT | 다음 queue item을 Worker target slot으로 보낸다 |
| HOLD | pause, panel command wait, manual review 때문에 보류한다 |
| RETRY | retry policy에 따라 같은 item을 다시 전송 후보로 둔다 |
| MARK_COMPLETED | 완료 응답으로 item을 completed 처리한다 |
| MARK_FAILED | 실패 응답으로 item을 failed 처리한다 |
| MANUAL_REVIEW | Inspector 또는 Commander 확인 대상으로 보낸다 |
| STOP | 남은 item을 skipped 또는 stopped 상태로 전환한다 |
| NOOP | 보낼 item이 없거나 terminal 상태다 |

### 5.3 최소 의사결정 순서

```text id="03y4sx"
1. run.user_stop_requested가 true이면 STOP.
2. run.user_pause_requested가 true이면 HOLD.
3. completion_decision이 complete이면 MARK_COMPLETED.
4. completion_decision이 incomplete이고 retry 가능하면 RETRY.
5. retry policy가 manual_review를 요구하면 MANUAL_REVIEW.
6. queue에서 next item이 있으면 SEND_NEXT.
7. next item이 없고 모든 item이 terminal이면 run completed.
8. 그 외에는 HOLD 또는 NOOP.
```

### 5.4 Panel Command Routing

Sequential Sender가 실제 실행 명령을 직접 수행하지 않는다. 필요한 경우 다음 형태의 command packet을 만든다.

| route | 용도 |
|---|---|
| COMMAND_QUEUE | Panel이 실행할 명령 후보 |
| WORKER_INBOX | Worker slot에 전달할 prompt packet |
| PANEL_RECORD | queue/run 진행 기록 |
| COMMANDER_QUEUE | 오류, 파일, 결합 필요 결과 보고 |
| LAO_RECORD | source, report, error 해독 기록 |
| TAERA_RESOURCE | download resource, file batch 기록 |

---

## 6. Pause / Resume / Retry / Completion Detector 계약

### 6.1 Pause / Resume / Stop

Pause/Resume controller는 실제 창을 멈추지 않는다. 상태만 만든다.

- pause: 현재 전송 중 item은 `hold_after_completion` 또는 `held`로 전환한다.
- resume: held item을 pending으로 되돌리고 run을 ready 또는 running으로 전환한다.
- stop: 전송 전 item은 skipped, 전송 중 item은 stop requested hold로 표시한다.
- panel command wait: 명시 PANEL_COMMAND 대기 상태를 run과 queue에 기록한다.

### 6.2 Retry Policy

Retry policy는 timer를 실행하지 않는다. 다음 값만 반환한다.

- retry 가능 여부
- next attempt 번호
- retry delay ms
- next retry at
- manual review 필요 여부
- max attempts 도달 여부

무한 재시도는 금지한다. `max_attempts`는 반드시 유한한 정수여야 한다.

### 6.3 Completion Detector

Completion detector는 다음 신호를 조합한다.

- source output completion signal
- worker report completion signal
- custom marker signal
- stability signal
- incomplete marker warning

완료 판단은 confidence와 reasons를 함께 반환한다. Sequential Sender는 `should_send_next`가 true일 때만 다음 prompt 전송을 진행한다.

---

## 7. 70개 프롬프트 순차 전송 목표

70개 프롬프트를 사용자가 직접 보내면 반복 복사, 전송 누락, 순서 착오, Worker slot 착오, 응답 완료 대기 누락이 발생한다.

WORKER_02 모델 계층은 다음을 줄인다.

1. 사용자 수동 복사 횟수
2. Worker별 target slot 선택 실수
3. 완료되지 않은 응답 위에 다음 prompt를 보내는 실수
4. 실패 item을 놓치는 실수
5. 대량 프롬프트 진행률 확인 시간
6. pause/resume 이후 현재 위치를 잃는 문제

대량 실행에서는 Dashboard가 다음 항목을 우선 표시한다.

- 전체 prompt 수
- 완료 수
- 실패 수
- 보류 수
- 남은 수
- 현재 prompt
- 다음 prompt
- 수동 검토 대상
- target slot별 진행 현황

---

## 8. 실제 GPT 입력 자동화는 Adapter 이후 단계

이 문서와 WORKER_02 산출물은 실제 GPT 입력 자동화를 수행하지 않는다.

아직 필요한 adapter 계층은 다음이다.

1. Worker window slot registry  
   `target_slot_id`를 실제 Worker window에 연결한다.

2. Taeo tab delivery adapter  
   dispatch packet의 `body`를 태오창 입력 영역으로 전달한다.

3. Completion read adapter  
   Worker 태오창 output을 읽어 raw text로 collector에 넘긴다.

4. Lao/Taera parser adapter  
   라오창과 태라창의 SOURCE_FILE, SOURCE_UNIT, DOWNLOAD_RESOURCE, FILE_BATCH 후보를 Panel record로 분류한다.

5. Preload/Main IPC bridge  
   `window.sfApi.stage4RunPromptQueue`와 `sf:stage4-run-prompt-queue`를 실제 Panel 기능에 연결한다.

6. Renderer binding  
   `#sf-stage4-run-prompt-queue`에 view model을 mount하고 start/pause/resume/stop/send-next action을 연결한다.

---

## 9. Class Scope Limits

### 9.1 WORKER_02 범위

WORKER_02의 현재 산출물은 model, helper, controller, view model, docs에 한정된다.

허용 범위:

- 새 core model 파일 생성
- 새 helper 파일 생성
- 새 renderer view model 파일 생성
- docs 작성
- 순수 함수 제공
- JSON 직렬화 가능한 상태 모델 제공
- Inspector 검토 기준 제공

금지 범위:

- main.js 직접 수정
- preload 직접 수정
- renderer.js 직접 수정
- index.html 직접 수정
- package.json 직접 수정
- Worker window 메뉴 추가
- 실제 GPT 입력 자동화 실행
- 파일 저장, 다운로드, 압축, 업로드 실행
- timer 실행
- IPC handler 등록

### 9.2 연결 담당

| 담당 | 연결 역할 |
|---|---|
| WORKER_01 autosave | prompt package, queue, run state를 `{PROJECT_DATA}/prompt_packages/`, `{PROJECT_DATA}/runs/prompt_queue/`에 저장 |
| WORKER_04 delivery | queue item dispatch packet을 실제 Worker Taeo tab에 전달 |
| WORKER_07 dashboard | Prompt Queue view model을 Panel Dashboard에 mount |
| CORE_PATCH_WORKER | main registration 또는 shared core integration patch 작성 |
| PRELOAD_API_WORKER | `window.sfApi.stage4RunPromptQueue` 노출 |
| IPC_HANDLER_WORKER | `sf:stage4-run-prompt-queue` handler 작성 |
| RENDERER_BINDING_WORKER | panel selector와 action binding 연결 |
| INSPECTOR_WORKER | output format, class scope, syntax/combination gate 검토 |

---

## 10. Inspector Checklist

Inspector는 보안 검문을 하지 않는다. 문법오류, 결합 실패, 시간지연 방지만 본다.

### 10.1 SOURCE_FILE 형식

- source file block이 하나의 target path만 가진다.
- path가 프로젝트 상대경로다.
- language, purpose, operation, owner_worker, target_stage가 있다.
- content가 생략되지 않았다.
- Worker report가 있다.

### 10.2 Class Scope

- WORKER_02 P01~P08은 SHARED_HELPER_WORKER 범위에 맞는 새 helper/model/controller 파일이다.
- WORKER_02 P09는 RENDERER_COMPONENT_WORKER 범위에 맞는 새 view model 파일이다.
- WORKER_02 P10은 DOCS_WORKER 범위에 맞는 문서 파일이다.
- main/preload/renderer.js/index.html/package.json 직접 수정이 없다.
- 기존 기능 삭제가 없다.

### 10.3 Prompt Queue Flow

- library item에서 package로 연결된다.
- package에서 run order가 나온다.
- run order에서 queue item이 생성된다.
- queue item은 target_slot_id를 사용한다.
- Worker 수를 고정하지 않는다.
- queue는 next item 계산을 순수 함수로 처리한다.

### 10.4 Completion / Retry / Pause

- 완료 detector는 confidence와 reasons를 반환한다.
- retry policy는 max_attempts를 가진다.
- retry policy는 무한 재시도를 허용하지 않는다.
- pause/resume/stop은 실제 창 조작이 아니라 상태 전환이다.
- panel command wait 상태가 표현된다.

### 10.5 UI View Model

- DOM 직접 조작이 없다.
- expected panel API와 selector가 문서화되어 있다.
- start/pause/resume/stop/send-next action은 모델링만 한다.
- Worker window 메뉴를 늘리지 않는다.
- Panel이 prompt controls를 소유한다.

### 10.6 Integration Readiness

- WORKER_01 autosave 연결 지점이 명확하다.
- WORKER_04 delivery adapter 연결 지점이 명확하다.
- WORKER_07 Dashboard mount 지점이 명확하다.
- PRELOAD_API_WORKER, IPC_HANDLER_WORKER, RENDERER_BINDING_WORKER가 필요한 연결 항목이 분리되어 있다.

---

## 11. Inspector Suggested Status

현재 WORKER_02 산출물 묶음의 예상 판정은 다음이다.

| 항목 | 예상 status | 이유 |
|---|---|---|
| 파일 범위 | GREEN | 각 prompt가 지정 파일 1개만 생성 |
| function class | GREEN | P01~P08 helper/model/controller, P09 view model, P10 docs |
| direct binding | GREEN | 직접 main/preload/renderer.js/index.html 수정 없음 |
| prompt queue model | GREEN | queue_id, items, current_index, status, next item 계산 제공 |
| run state model | GREEN | run_id, package_id, queue_id, status, started/paused/completed 표현 |
| completion detector | GREEN | completion status, confidence, reasons 반환 |
| retry policy | GREEN | max_attempts와 manual review 전환 포함 |
| pause/resume controller | GREEN | 실제 실행 없이 상태 전환만 수행 |
| view model | YELLOW | 실제 Dashboard mount와 renderer binding은 별도 작업 필요 |
| full integration | YELLOW | WORKER_01, WORKER_04, WORKER_07 및 IPC/preload 연결 필요 |

YELLOW는 대기 상태가 아니다. 다음 연결 Worker에게 patch 또는 binding 작업을 배정하면 진행 가능하다.

---

## 12. Commander Next Integration Order

권장 결합 순서는 다음이다.

1. WORKER_02 산출물 파일을 지정 경로에 저장한다.
2. Inspector가 node syntax와 SOURCE_FILE block parse를 일괄 확인한다.
3. WORKER_01 autosave가 prompt package, queue, run state 저장 위치를 연결한다.
4. WORKER_04 delivery adapter가 `target_slot_id -> Worker Taeo tab` 전달 계약을 연결한다.
5. PRELOAD_API_WORKER가 `window.sfApi.stage4RunPromptQueue`를 노출한다.
6. IPC_HANDLER_WORKER가 `sf:stage4-run-prompt-queue` handler를 등록한다.
7. RENDERER_BINDING_WORKER가 `#sf-stage4-run-prompt-queue` action binding을 연결한다.
8. WORKER_07 Dashboard가 view model을 mount하고 대량 prompt 진행률을 표시한다.
9. 통합 후 3개 prompt package로 smoke run을 수행한다.
10. 70개 prompt package는 smoke run 이후 대량 실행 후보로 둔다.

---

## 13. 최소 Smoke Test Scenario

Smoke test는 실제 GPT 자동 입력 전에 model 흐름만 확인한다.

1. prompt library item 3개를 만든다.
2. 3개 item으로 package를 만든다.
3. package run order에서 queue를 만든다.
4. get next item으로 첫 번째 prompt를 가져온다.
5. item sent로 표시한다.
6. 가짜 Worker output을 completion detector에 넣는다.
7. complete이면 item completed로 표시한다.
8. 다음 item을 가져온다.
9. 두 번째 item을 failed로 표시한다.
10. retry policy가 retry 또는 manual review를 반환하는지 본다.
11. pause request를 적용한다.
12. resume request를 적용한다.
13. view model에서 progress, failed item, held item, next action이 표시되는지 본다.

이 smoke test는 adapter 실행이 아니라 모델 결합 확인이다.

---

## 14. Final Scope Declaration

WORKER_02 산출물은 Prompt Queue Sequential Sender의 모델 계층이다.

이 계층은 다음을 만든다.

- 저장 프롬프트 구조
- 실행 패키지 구조
- 순차 queue 구조
- run state 구조
- 완료 감지 구조
- 재시도 정책 구조
- pause/resume/stop 상태 전환 구조
- Dashboard 표시용 view model
- Inspector 검토 문서

이 계층은 다음을 하지 않는다.

- 실제 창 조작
- 실제 GPT 입력
- 실제 파일 저장
- 실제 IPC 연결
- 실제 renderer mount
- Worker window 메뉴 확장

다음 작업은 adapter와 binding을 붙이는 것이다.

NEXT_INTEGRATION_TARGET:
WORKER_04 delivery adapter가 `queue item dispatch packet`을 실제 Worker Taeo tab 전달 후보로 변환하고, WORKER_01 autosave가 queue/run state 저장 흐름을 연결한다.