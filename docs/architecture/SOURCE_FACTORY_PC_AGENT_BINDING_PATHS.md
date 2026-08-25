# Source Factory PC Agent Binding Paths

이 문서는 Source Factory와 PC Agent를 결속할 때 사용할 정확한 파일·함수·흐름을 정리한다. 모든 경로는 사용자 PC에서 E: 단독 실행이 확인된 active-core 기준이다.

## 1. 기준 active-core

```text
ACTIVE_CORE=
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038
```

Stage4 IPC controller:

```text
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10\ipc\stage4StationBindingHandlers.js
```

이 파일이 PC Agent adapter의 1차 삽입 대상이다.

## 2. 현재 결속 전 흐름

현재 dispatch 흐름:

```text
renderer UI
→ safe_panel_preload.js
→ Stage4 IPC channel
→ stage4StationBindingHandlers.js
→ handleStage4DispatchNextPrompt
→ promptPackageVersionManager
→ sequentialPromptSender
```

현재 execution check 흐름:

```text
renderer UI
→ safe_panel_preload.js
→ Stage4 IPC channel
→ stage4StationBindingHandlers.js
→ handleStage4RunCheck
→ executionResultCollector
```

현재 첫 결함:

```text
PC Agent adapter is not yet inserted.
```

## 3. Adapter target file

```text
ADAPTER_TARGET_FILE=
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10\ipc\stage4StationBindingHandlers.js
```

## 4. Dispatch side target function

```text
ADAPTER_TARGET_FUNCTION=
handleStage4DispatchNextPrompt
```

현재 역할:

```text
1. payload를 normalizePayload(payload)로 정리한다.
2. promptPackageVersionManager로 prompt package version을 확인한다.
3. sequentialPromptSender의 dispatchNextPrompt / selectNextPrompt / enqueuePrompt 계열을 호출한다.
4. 결과를 ok(STAGE4_STATION_NAMES.SENDER, 'dispatch_next_prompt', ...) 형태로 반환한다.
```

PC Agent adapter 삽입 후 목표:

```text
handleStage4DispatchNextPrompt
→ promptPackageVersionManager
→ PC_AGENT_DISPATCH_ADAPTER
→ PC Agent
```

기존 sequentialPromptSender는 삭제하지 않는다. adapter가 비활성·미설정이면 기존 sequentialPromptSender fallback 경로를 유지해야 한다.

## 5. Result side target function

```text
RESULT_CALLBACK_TARGET_FUNCTION=
handleStage4RunCheck
```

현재 역할:

```text
1. payload를 normalizePayload(payload)로 정리한다.
2. executionResultCollector의 runExecutionCheck / runStage4Execution / runNodeCheck 계열을 호출한다.
3. 실행 서비스가 없으면 NO_EXECUTION_SERVICE_BOUND를 반환한다.
```

PC Agent adapter 삽입 후 목표:

```text
PC Agent
→ PC_AGENT_RESULT_ADAPTER
→ handleStage4RunCheck
→ executionResultCollector
```

## 6. Storage side target function

```text
STORAGE_TARGET_FUNCTION=
handleStage4AppendStationRecords
```

역할:

```text
1. Taeo autosave raw output 저장
2. panelRecordExecutionStore 저장
3. workerOutputBatchStore 저장
```

관련 store 절대경로:

```text
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\src\shared\stage4\stores\taeoRawOutputStore.js
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\src\shared\stage4\stores\panelRecordExecutionStore.js
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\src\shared\stage4\stores\workerOutputBatchStore.js
```

## 7. 권장 PC Agent 결속 모델

```text
handleStage4DispatchNextPrompt
→ promptPackageVersionManager
→ PC_AGENT_DISPATCH_ADAPTER
→ PC Agent
→ PC_AGENT_RESULT_ADAPTER
→ handleStage4RunCheck
→ executionResultCollector
→ handleStage4AppendStationRecords 또는 existing storage path
```

## 8. Adapter 입력 계약 후보

PC_AGENT_DISPATCH_ADAPTER input:

```json
{
  "task_id": "string",
  "prompt_package_id": "string|null",
  "prompt_package_version": "string|null",
  "target_window": "string|null",
  "dispatch_payload": {},
  "source": "handleStage4DispatchNextPrompt",
  "created_at": "ISO timestamp"
}
```

필수 보존 필드:

```text
task_id
prompt_package_id
prompt_package_version
target_window 또는 target_window_selector
worker_id 또는 worker_slot_uid가 있으면 보존
```

## 9. Adapter 출력 계약 후보

PC_AGENT_RESULT_ADAPTER output:

```json
{
  "task_id": "string",
  "executed": true,
  "exit_code": 0,
  "stdout": "string",
  "stderr": "string",
  "artifact_paths": [],
  "result_status": "PASS|PARTIAL|FAIL",
  "completed_at": "ISO timestamp"
}
```

이 output은 `handleStage4RunCheck` 또는 `executionResultCollector`가 읽을 수 있는 형태로 전달해야 한다.

## 10. 금지사항

PC Agent adapter 작업에서 금지되는 변경:

```text
1. package.json 무단 수정 금지
2. safe_panel_preload.js API rename 금지
3. IPC channel rename 금지
4. existing sequentialPromptSender 삭제 금지
5. existing executionResultCollector 삭제 금지
6. Project Panel Identity registry 삭제 금지
7. source:not_found fallback 삭제 금지
8. 라오창 입력 인식 기능 수정 금지
9. SF_COMMAND 자동실행 금지
10. Worker/Commander count 6/7 고정 금지
```

## 11. 안전한 첫 구현 방식

첫 구현은 production source 직접 수정이 아니라 patch_request로 시작한다.

```text
PATCH_REQUEST_TARGET=
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\safe_panel_v10\ipc\stage4StationBindingHandlers.js

PATCH_SCOPE=
- handleStage4DispatchNextPrompt 내부에 PC_AGENT_DISPATCH_ADAPTER 후보 branch 추가
- handleStage4RunCheck 내부에 PC_AGENT_RESULT_ADAPTER intake 후보 branch 추가
- 기존 fallback 유지
- node --check 통과
```

## 12. 완료 판정 기준

PC Agent 결속이 PASS가 되려면 다음이 확인되어야 한다.

```text
1. dispatchNextPrompt가 PC Agent adapter로 payload를 전달한다.
2. PC Agent가 실제 process 또는 자동화 task를 실행한다.
3. 결과가 PC_AGENT_RESULT_ADAPTER를 통해 돌아온다.
4. runExecutionCheck 또는 executionResultCollector가 결과를 읽는다.
5. 결과가 worker output / panel record / raw output 저장 계열에 보존된다.
6. 기존 sequentialPromptSender fallback이 계속 살아 있다.
```
