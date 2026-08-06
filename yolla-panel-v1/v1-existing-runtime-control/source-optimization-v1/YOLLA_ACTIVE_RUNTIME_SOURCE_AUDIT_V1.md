# YOLLA 활성 Runtime 소스 최적화 감사 V1

```text
AUDIT_ID=YOLLA-ACTIVE-RUNTIME-SOURCE-OPTIMIZATION-AUDIT-V1-20260806-001
CONTROL_PR=#17
BASE_HEAD=a73997a3ecca2fe7b506cefdb9feaa2130afc036
MODE=READ_ACTIVE_SOURCE_THEN_DELETE_FUNCTIONS
CSS_HIDE_ALLOWED=false
DOM_ONLY_DELETE_SUFFICIENT=false
TARGET_PC_WRITE=false
PRODUCTION=false
READY=false
MERGE=false
```

## 1. 사용자 결정

현재 작업은 기능 추가가 아니라 기능 최적화다. 필요 없는 기능은 UI에서 가리는 것이 아니라 Renderer 생성코드, 클릭 Handler, Preload API, Main IPC, 상태 저장, Timer·Queue, Launcher 및 전용 폴더까지 제거한다.

```text
REMOVE=A_MODE,E_MODE
KEEP=C_MODE,COMMANDER_DISPATCH,WORKER_DISPATCH,GROUP_EDIT,GROUP_ADD,PROJECT_CHAT_BINDING,STATE_LOG_RECEIPT,ROLLBACK
```

C 모드와 공동 사용되는 모듈은 호출 그래프를 확인한 뒤 보존하거나 C 전용 이름으로 축소한다.

## 2. 실제 관측 회귀

사용자 Target PC 화면에서 모든 그룹 헤더에 `E`, `A` 버튼이 계속 표시되고 `C 모드 실행` 버튼은 표시되지 않았다.

```text
LEGACY_E_VISIBLE=true
LEGACY_A_VISIBLE=true
C_MODE_BUTTON_VISIBLE=false
V1_PATCH=REJECTED
V2_PATCH=REJECTED_AS_LIVE_FIX
```

기존 V1/V2 Offline Fixture PASS는 실제 활성 Source 적용 증거가 아니므로 최적화 완료 근거로 사용하지 않는다.

## 3. 확인한 Source 계층

### 3.1 5.10.2.4.0 C 패치 Bundle

GitHub 권위 Manifest와 Google Drive Source Bundle을 Readback했다. 이 Bundle은 완전한 실행 앱 원본이 아니라 기존 Release를 복제한 뒤 다음 작업을 수행하는 변환 Patch다.

- `automation-v1` 삭제
- `automation-v2` 삭제
- E/A IPC를 제거 오류 Handler로 교체
- C Runtime·Renderer·CSS 추가
- 새 5.10.2.4.0 Release 생성

따라서 이 Bundle의 성공 여부만으로 현재 실행 중 Source가 수정됐다고 판단할 수 없다.

### 3.2 A1 Connection Frontier Overlay

A1 설치기는 다음 Target PC Source 후보를 직접 찾는다.

```text
E:\SOURCE FACTORY\source-factory-active-core\chatgpt-control-system\ui\safe_panel_v10
E:\SOURCE FACTORY\source-factory-active-core\chatgpt-control-system\ui\safe_panel
E:\SOURCE FACTORY\chatgpt-control-system\ui\safe_panel_v10
E:\SOURCE FACTORY\chatgpt-control-system\ui\safe_panel
```

또한 기존 Launcher 탐색 목록에 `RUN_E_...E_ONLY...bat`가 포함돼 있다. 이는 C 패치 이후에도 E 계열 Runtime을 다시 실행할 수 있는 회귀 경로다.

### 3.3 PR #2 SAFE Panel Snapshot

PR #2의 `releases/SF_REUSABLE_CORE_20260801_175708/safe_panel_v10/`에서 원본 SAFE Panel Source 5개를 확인했다.

```text
safe_panel_main.js
safe_panel_preload.js
safe_panel_renderer.js
safe_panel.html
safe_panel.css
```

그러나 해당 Renderer는 현재 스크린샷의 V5 그룹 헤더 구조와 일치하지 않는다. 따라서 참고 Source이지 현재 활성 V5 Source 권위는 아니다.

### 3.4 PR #14 V5 Clean Runtime

PR #14 원장은 V5 Clean Runtime과 Target PC 50 Seat·7 Group Render PASS를 기록하지만, 현재 화면을 생성한 V5 Package Source Byte는 Branch 파일에 포함돼 있지 않다. 현재 활성 V5 원본은 Target PC 또는 당시 배포 Artifact에만 남아 있을 가능성이 높다.

## 4. 현재 결론

```text
EXACT_ACTIVE_RUNTIME_SOURCE_PATH=UNKNOWN
GITHUB_SOURCE_COMPLETE=false
TARGET_PC_SOURCE_READBACK_REQUIRED=true
ANOTHER_BLIND_PATCH_ALLOWED=false
```

E/A가 계속 보이는 원인은 다음 중 하나 이상이다.

1. 수정 대상과 실제 실행 Release가 다르다.
2. 이전 E-only Launcher가 다른 Release를 다시 실행한다.
3. 그룹 Header를 만드는 V5 Source가 GitHub Package와 별도 위치에 있다.
4. Main·Preload·Renderer 중 일부만 수정돼 다른 계층이 E/A를 재생성한다.
5. app.asar 또는 별도 unpacked Source가 실제 권위다.

## 5. 읽기 전용 Source Readback

대상 PC에서 다음만 회수하는 읽기 전용 수집 패키지를 준비했다.

```text
PACKAGE=YOLLA_ACTIVE_RUNTIME_SOURCE_READBACK_V1.zip
SHA256=33a9121fd20fc333302955e9d7c6a48c6f56c519ba3558d174a45e5a40f8203a
ENTRYPOINT=COLLECT_ACTIVE_YOLLA_RUNTIME_SOURCE.bat
RUNTIME_WRITE=false
PROCESS_STOP=false
PROFILE_READ=false
WORKSPACE_STATE_CONTENT_READ=false
```

수집 범위:

- 실행 중 Electron/YOLLA Process ExecutablePath·CommandLine
- 실제 Release Root 후보
- `safe_panel`·`workspace`·`main`·`preload`·Renderer·HTML·CSS Source
- RUN/APPLY/INSTALL/ROLLBACK Launcher
- E/A와 C 모드 Marker·SHA-256·원본 경로
- 복사한 Source와 경로 Index

비밀값 형식은 CommandLine에서 마스킹하며 Browser Profile, workspace_state 내용, 로그, Receipt, Backup, node_modules, `.git`은 제외한다.

## 6. 실제 삭제 Gate

Source Readback ZIP을 확보한 뒤 파일별로 다음 분류를 수행한다.

```text
LEGACY_DELETE_CANDIDATE
SHARED_REVIEW_REQUIRED
C_MODE_KEEP_CANDIDATE
```

삭제 순서는 다음과 같다.

1. E/A 전용 Launcher와 Launcher 선택 우선순위
2. E/A Renderer 버튼 생성 및 Event Listener
3. E/A Preload API
4. E/A Main IPC Handler·BrowserWindow 생성·Timer·Queue
5. E/A 전용 상태키·Migration·복구 분기
6. `automation-v1`, `automation-v2` 실행 Source와 전용 State
7. E/A 전용 로그·메뉴·상태 Projection
8. 남은 문자열·호출·파일 참조 0 검증

C 모드가 공유하는 Browser Session, Group Registry, Chat binding, GitHub Result correlation, State persistence, Receipt, Rollback은 호출 그래프를 확인한 뒤 보존한다.

## 7. 수용 기준

```text
E_BUTTON_COUNT=0
A_BUTTON_COUNT=0
E_RENDERER_REFERENCE_COUNT=0
A_RENDERER_REFERENCE_COUNT=0
E_PRELOAD_API_COUNT=0
A_PRELOAD_API_COUNT=0
E_MAIN_IPC_COUNT=0
A_MAIN_IPC_COUNT=0
E_ONLY_LAUNCHER_COUNT=0
A_E_RUNTIME_DIRECTORY_COUNT=0
C_MODE_BUTTON_COUNT=1_PER_GROUP
C_MODE_COMMANDER_DISPATCH=PASS
C_MODE_WORKER_DISPATCH=PASS
GROUP_EDIT_ADD=PASS
PROJECT_CHAT_BINDING=PASS
LOGIN_PROFILE_PRESERVED=PASS
WORKSPACE_STATE_COMPATIBILITY=PASS
ROLLBACK=PASS
```

실제 Target PC 재실행과 화면·Runtime Log·전송 Receipt가 모두 일치해야 PASS다.

## 8. 현재 Terminal

```text
STATUS=BLOCKED_PENDING_ACTIVE_RUNTIME_SOURCE_READBACK
BLOCKER=EXACT_ACTIVE_V5_SOURCE_NOT_PRESENT_IN_GITHUB
WORKER_FAULT=false
NEW_PATCH_AUTHORIZED=false
TARGET_PC_LIVE_PASS=false
```
