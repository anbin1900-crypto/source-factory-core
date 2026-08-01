# Source Factory Core Usage Index

| 핵심 파일 | 역할 | 재사용 방법 | 주의 |
|---|---|---|---|
| safe_panel_v10\safe_panel_main.js | Electron main entry | SAFE Panel 앱을 띄우는 시작점 | preload/html/ipc 상대경로 유지 |
| safe_panel_v10\safe_panel_preload.js | window.sfApi bridge | Renderer에서 main IPC 호출 | API/IPC 이름 변경 금지 |
| safe_panel_v10\safe_panel_renderer.js | UI binding/controller | 버튼, 패널, Project Panel 표시 제어 | selectedPrompt/logPanel 보존 |
| safe_panel_v10\safe_panel.html | UI layout | SAFE Panel DOM 구조 | selector/id/data-* 변경 주의 |
| safe_panel_v10\ipc\stage4StationBindingHandlers.js | Stage4 IPC controller | PC Agent adapter 삽입 핵심 파일 | 기존 fallback 삭제 금지 |
| src\shared\stage4\promptQueueManager.js | Prompt queue | Worker/Commander prompt queue 관리 | prompt_package_id/version 유지 |
| src\shared\stage4\sequentialPromptSender.js | Sequential sender | 다음 prompt 선택/전송 | PC Agent 실행과 혼동 금지 |
| src\shared\stage4\promptPackageVersionManager.js | Version gate | prompt package version 확인 | dispatch 전 우회 금지 |
| src\shared\stage4\executionResultCollector.js | Execution/result collector | PC Agent 결과 수집 후보 | runExecutionCheck와 연결 |
| src\shared\stage4\executionErrorReporter.js | Error report | 실행 실패 보고 생성 | error schema 유지 |
| src\shared\stage4\fileBatchDispatcher.js | File batch dispatch | SOURCE_FILE 묶음 처리 | prompt dispatch와 구분 |
| src\shared\stage4\collectorCommanderGateHandoffAdapter.js | Commander handoff | Worker output을 gate 판단 입력으로 변환 | 공유 record-layer라 수정 주의 |
| src\shared\stage4\projectPanelIdentityHelper.js | Project Panel identity helper | panel_instance_id/project_id 정규화 | fake project value 금지 |
| src\shared\stage4\sourceFileBlockExtractor.js | SOURCE_FILE extractor | GPT/Worker 출력에서 SOURCE_FILE 추출 | 추출과 실행을 구분 |
| src\shared\stage4\sourceFileFormatValidator.js | SOURCE_FILE validator | SOURCE_FILE 형식 검증 | omitted code 허용 금지 |
| src\shared\stage4\panelCommandParser.js | Panel command parser | SOURCE_FILE/SF_COMMAND 후보 감지 | auto execution 금지 |
| src\shared\stage4\panelInputClassifier.js | Input classifier | 라오창/입력 분류 | Project Panel identity source로 쓰지 않음 |
| src\shared\stage4\stores\taeoRawOutputStore.js | Raw output store | GPT/Worker raw output 저장 | append-only 선호 |
| src\shared\stage4\stores\workerOutputBatchStore.js | Worker batch store | batch별 worker output 저장 | worker_id/prompt_id/output_id 유지 |
| src\shared\stage4\stores\panelRecordExecutionStore.js | Panel record store | panel execution/event record 저장 | singleton current_project 금지 |
| src\shared\stage4\stores\laoSourceUnitStore.js | Lao source unit store | 라오창 source unit 저장 | detect/queue와 execution 분리 |
| src\shared\stage4\stores\taeraDownloadResourceStore.js | Download resource store | 태라창 resource metadata 저장 | 실행결과와 다운로드 표시 분리 |

## 재사용 원칙

1. 원본 public function name을 보존한다.
2. IPC channel 이름을 바꾸지 않는다.
3. preload API 이름을 바꾸지 않는다.
4. package.json은 마지막 단계에서만 수정한다.
5. node --check로 JS 문법을 확인한다.
6. Project Panel Identity에는 fake/default 값을 넣지 않는다.
7. SF_COMMAND는 감지/Queue 후보이며 자동실행하지 않는다.
