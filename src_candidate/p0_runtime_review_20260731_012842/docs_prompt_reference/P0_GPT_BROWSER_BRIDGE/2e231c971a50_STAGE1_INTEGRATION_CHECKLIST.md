STAGE1_INTEGRATION_CHECKLIST
1. 체크리스트 목적

이 체크리스트는 Worker 1부터 Worker 6까지의 SOURCE_OUTPUT_ONLY 결과를 사용자가 한곳에 모아 Stage 1 검토 대상으로 정리하기 위한 문서이다.

이 체크리스트는 공식 Assembly Record가 아니다. 공식 완료는 파일결합, Manifest, Hash, 변경 전후 상태 기록, 보고서, 다음 Commander 인수인계 문서가 만들어진 뒤에만 판단한다.

2. 현재 Stage 1 범위

현재 목표는 7개 창 Source Factory Browser v0.1 제작 지원이다.

범위는 다음이다.

Commander 창 1개
Worker 창 6개
총 7개 창
같은 GPT 로그인 세션 공유
작업지시서 화면
GPT 실행 화면
상태 표시 화면
START 버튼
STOP 버튼
SAVE FULL OUTPUT 버튼
창별 독립 저장 폴더
GPT 전체 출력 원문 저장
진단 스크립트
실행 BAT
README
통합 체크리스트

CREATE FILES와 ASSEMBLY는 후속 단계이다. 20명 Worker 확장도 후속 단계이다.

3. Worker 결과 수집 원칙

Worker 결과는 그 자체로 공식 완료가 아니다.

수집 순서는 다음을 따른다.

Worker 1 출력 원문을 저장한다.
Worker 2 출력 원문을 저장한다.
Worker 3 출력 원문을 저장한다.
Worker 4 출력 원문을 저장한다.
Worker 5 출력 원문을 저장한다.
Worker 6 출력 원문을 저장한다.
각 Worker 출력의 SOURCE_FILE_START 블록을 추출 대상으로 표시한다.
같은 path를 두 Worker가 동시에 만들지 않았는지 확인한다.
path가 상대경로인지 확인한다.
path에 Windows 예약문자 < > : " | ? * 가 없는지 확인한다.
path에 D:\SOURCE FACTORY 같은 절대경로가 들어가지 않았는지 확인한다.
D:\BABY 수정 금지 원칙을 위반하는 내용이 없는지 확인한다.
추출된 Source Unit은 후속 물질화 단계에서만 실제 파일로 만든다.
공식 완료가 필요하면 후속 Assembly 단계에서 Assembly Record를 만든다.
4. Worker별 수집 슬롯

아래 슬롯에 Worker별 결과를 연결한다.

Worker 1 결과: Stage 1에서 해당 Worker가 담당한 SOURCE_FILE_START 블록만 수집한다.
Worker 2 결과: Stage 1에서 해당 Worker가 담당한 SOURCE_FILE_START 블록만 수집한다.
Worker 3 결과: Stage 1에서 해당 Worker가 담당한 SOURCE_FILE_START 블록만 수집한다.
Worker 4 결과: Stage 1에서 해당 Worker가 담당한 SOURCE_FILE_START 블록만 수집한다.
Worker 5 결과: Stage 1에서 해당 Worker가 담당한 SOURCE_FILE_START 블록만 수집한다.
Worker 6 결과: 실행 BAT, 진단 스크립트, README, 통합 체크리스트 관련 SOURCE_FILE_START 블록만 수집한다.

같은 파일을 여러 Worker가 만들면 충돌로 표시한다. 충돌 파일은 사용자가 승인하기 전까지 공식 물질화 대상으로 보지 않는다.

5. 경로 체크리스트

각 SOURCE_FILE_START path에 대해 다음을 확인한다.

 상대경로이다.
 / 구분자를 사용한다.
 D:\SOURCE FACTORY 같은 절대경로가 아니다.
 상위 경로 .. 를 사용하지 않는다.
 파일명에 < 문자가 없다.
 파일명에 > 문자가 없다.
 파일명에 : 문자가 없다.
 파일명에 " 문자가 없다.
 파일명에 | 문자가 없다.
 파일명에 ? 문자가 없다.
 파일명에 * 문자가 없다.
 D:\BABY 대상으로 읽기, 쓰기, 수정, 삭제, 이동, 복사를 요구하지 않는다.
 담당 Worker가 지정받은 파일만 포함한다.
 “나머지는 동일”, “생략”, “이하 동일” 같은 불완전 내용이 없다.
6. JavaScript 모듈 체크리스트

모든 JavaScript 파일에 대해 다음을 확인한다.

 CommonJS 방식을 사용한다.
 require를 사용한다.
 module.exports를 사용한다.
 import 문을 사용하지 않는다.
 export default를 사용하지 않는다.
 export { ... } 구문을 사용하지 않는다.
 package.json의 main은 src/main/main.js이다.
7. Electron 구조 체크리스트

Electron 기본 구조는 다음을 확인한다.

 package.json이 존재한다.
 package.json의 main 값이 src/main/main.js이다.
 src/main/main.js가 존재한다.
 src/renderer/index.html이 존재한다.
 모든 창이 src/renderer/index.html을 로드한다.
 모든 창이 session partition persist:source-factory-gpt를 사용한다.
 사용자가 직접 로그인하는 흐름이 유지된다.
 프로그램이 비밀번호를 수집하지 않는다.
 프로그램이 비밀번호를 평문 저장하지 않는다.
 자동 로그인 강제, 캡차 우회, 보안 우회 코드가 없다.
8. 창 ID 체크리스트

창 ID는 다음 7개만 사용한다.

 COMMANDER
 WORKER_01
 WORKER_02
 WORKER_03
 WORKER_04
 WORKER_05
 WORKER_06

다음도 확인한다.

 임의 창 ID가 없다.
 Worker 번호 표기가 WORKER_1처럼 축약되지 않았다.
 Commander 표기가 COMMANDER와 일치한다.
9. 상태 색상과 상태 코드 체크리스트

상태 색상은 다음만 사용한다.

 BLUE
 ORANGE
 RED

상태 코드는 다음을 기준으로 한다.

 READY
 LOGIN_REQUIRED
 TASK_LOADED
 CONSTITUTION_LOADING
 PROMPT_BUILDING
 PROMPT_INJECTING
 GPT_READY
 GPT_RUNNING
 GPT_OUTPUT_DETECTING
 GPT_OUTPUT_DONE
 FULL_OUTPUT_SAVING
 FULL_OUTPUT_SAVED
 STOPPED_BY_USER
 SAVE_FAILED
 TASK_MISSING
 PAGE_LOAD_FAILED
 FAILED
 DONE
10. Renderer API 체크리스트

Renderer는 다음 API 이름을 호출해야 한다.

 window.sfApi.loadTaskInstruction(workerId)
 window.sfApi.buildPrompt(workerId)
 window.sfApi.startWorker(workerId)
 window.sfApi.stopWorker(workerId)
 window.sfApi.saveFullOutput(workerId)
 window.sfApi.reloadTask(workerId)
 window.sfApi.getWorkerState(workerId)
 window.sfApi.setWorkerState(workerId, state)
 window.sfApi.getAllWorkerStates()
 window.sfApi.openGpt(workerId)
11. IPC 채널 체크리스트

Electron IPC 채널명은 다음을 사용해야 한다.

 sf:load-task
 sf:build-prompt
 sf:start-worker
 sf:stop-worker
 sf:save-full-output
 sf:reload-task
 sf:get-worker-state
 sf:set-worker-state
 sf:get-all-worker-states
 sf:open-gpt
12. 폴더 구조 체크리스트

각 창 폴더가 있어야 한다.

 browsers/COMMANDER/
 browsers/WORKER_01/
 browsers/WORKER_02/
 browsers/WORKER_03/
 browsers/WORKER_04/
 browsers/WORKER_05/
 browsers/WORKER_06/

각 창 폴더 안에는 다음 하위 폴더가 있어야 한다.

 task_instruction/
 raw_outputs/
 extracted_units/
 materialized_files/
 states/
 logs/
 reports/

startupInitializer.js는 이 폴더들을 생성하거나 확인할 수 있어야 한다.

13. BAT 체크리스트

BAT 파일은 다음을 만족해야 한다.

 ASCII 중심으로 작성되어 있다.
 CMD 한글 깨짐으로 오작동할 가능성을 줄인다.
 run/RUN_SOURCE_FACTORY_BROWSER.bat가 존재한다.
 RUN_SOURCE_FACTORY_BROWSER.bat가 Node.js를 확인한다.
 RUN_SOURCE_FACTORY_BROWSER.bat가 npm을 확인한다.
 RUN_SOURCE_FACTORY_BROWSER.bat가 package.json을 확인한다.
 RUN_SOURCE_FACTORY_BROWSER.bat가 node_modules가 없을 때 npm install을 실행한다.
 RUN_SOURCE_FACTORY_BROWSER.bat가 npm start를 실행한다.
 run/RUN_STAGE1_DIAGNOSTIC.bat가 존재한다.
 RUN_STAGE1_DIAGNOSTIC.bat가 node로 src/core/stage1SelfCheck.js를 실행한다.
14. 진단 체크리스트

진단 스크립트는 다음을 확인해야 한다.

 package.json 존재
 src/main/main.js 존재
 src/renderer/index.html 존재
 browsers/COMMANDER 폴더 존재
 browsers/WORKER_01 폴더 존재
 browsers/WORKER_02 폴더 존재
 browsers/WORKER_03 폴더 존재
 browsers/WORKER_04 폴더 존재
 browsers/WORKER_05 폴더 존재
 browsers/WORKER_06 폴더 존재
 CONSTITUTION 또는 _CONSTITUTION 폴더 존재
 source, run script, package metadata 영역에서 제한 루트 접근 참조 없음
 README 존재
 통합 체크리스트 존재
 로그인은 사용자가 직접 한다는 문구 존재
 D:\BABY 수정 금지 문구 존재
 CREATE FILES와 ASSEMBLY는 후속 단계라는 문구 존재
 20명 Worker 확장은 후속 단계라는 문구 존재
15. Stage 1 사용 준비 기준

Stage 1 사용 준비 상태는 다음 기준을 모두 검토한 뒤 판단한다.

 Worker 1부터 Worker 6까지의 담당 파일이 모두 수집되었다.
 파일 path 충돌이 없다.
 package.json이 존재한다.
 src/main/main.js가 존재한다.
 src/renderer/index.html이 존재한다.
 7개 창의 폴더 구조가 존재한다.
 공통 session partition 값이 persist:source-factory-gpt이다.
 START / STOP / SAVE FULL OUTPUT 버튼이 UI에 있다.
 GPT 화면이 열린다.
 자동 입력 실패 시 clipboard 또는 수동 붙여넣기 fallback 흐름이 있다.
 SAVE FULL OUTPUT이 GPT 전체 출력 원문 저장 흐름을 가진다.
 run/RUN_STAGE1_DIAGNOSTIC.bat를 실행했을 때 RED 항목이 없거나, RED 원인이 아직 물질화되지 않은 파일 누락임을 사용자가 알고 있다.
 로그인은 사용자가 직접 한다.
 D:\BABY 수정 금지 원칙을 유지한다.
 CREATE FILES와 ASSEMBLY가 후속 단계로 표시되어 있다.
 20명 Worker 확장이 후속 단계로 표시되어 있다.
 Stage 1 산출물을 공식 완료로 과장하지 않는다.
16. 공식 완료 기준

공식 완료 기준은 Stage 1 사용 준비 기준과 다르다.

공식 완료에는 다음이 필요하다.

 파일결합 수행
 Assembly Record 폴더 생성
 ASSEMBLY_REPORT.md 생성
 ASSEMBLY_REPORT.json 생성
 ASSEMBLY_MANIFEST.json 생성
 FILE_HASHES.json 생성
 CHANGESET.json 생성
 PRE_STATE_INDEX.json 생성
 POST_STATE_INDEX.json 생성
 DIFF_SUMMARY.json 생성
 WORK_LOG.md 생성
 NEXT_COMMANDER_HANDOFF.md 생성
 NEXT_COMMANDER_PROMPT.txt 생성
 SOURCE_FACTORY_MASTER_STATUS.json 최신 Assembly 반영

이 항목들이 없으면 공식 완료를 주장하지 않는다.

17. 실패 또는 경고 처리

RED가 나오면 다음을 수행한다.

누락 파일 또는 충돌 path를 확인한다.
담당 Worker 출력 원문을 다시 확인한다.
SOURCE_FILE_START 블록이 완전한지 확인한다.
경로 규칙 위반이 있는지 확인한다.
제한 루트 접근 참조가 있는지 확인한다.
필요한 경우 Commander Review 대상으로 표시한다.

ORANGE가 나오면 다음을 수행한다.

사용자가 직접 로그인 상태를 확인한다.
7개 창이 같은 세션을 공유하는지 확인한다.
START / STOP / SAVE FULL OUTPUT 버튼을 수동 확인한다.
헌법 파일이 루트 fallback에만 있는 경우 CONSTITUTION 또는 _CONSTITUTION 폴더 배치를 검토한다.
18. 결합 전 최종 확인

후속 파일결합 또는 Assembly로 넘어가기 전 다음을 확인한다.

 이 체크리스트는 검토 보조 문서이며 Assembly Record가 아니다.
 사용자 컴퓨터 상태를 바꾸는 작업은 파일결합 규칙을 따른다.
 삭제, 이동, 덮어쓰기에는 별도 검토와 승인이 필요하다.
 증거 없는 PASS를 기록하지 않는다.
 실제 계산 없는 SHA256을 기록하지 않는다.
 실제 확인 없는 파일 크기를 기록하지 않는다.
 공식 완료는 Assembly Record 생성 이후에만 판단한다.