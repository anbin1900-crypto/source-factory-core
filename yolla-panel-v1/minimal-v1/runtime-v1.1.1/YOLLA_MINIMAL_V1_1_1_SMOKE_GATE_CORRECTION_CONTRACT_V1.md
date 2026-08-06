# YOLLA Minimal V1.1.1 Smoke Gate Correction Contract

```text
VERSION=1.1.1
PREVIOUS_VERSION=1.1.0
PREVIOUS_TARGET_PC_RESULT=FAIL
PREVIOUS_ERROR=SMOKE_STATUS_NOT_PASS:STARTING
TARGET_PC_INSTALL=PENDING
TARGET_PC_LIVE_PASS=false
```

## 원인

V1.1 Runtime은 시작 직후 `LATEST_RUNTIME_RECEIPT.json`에 `STARTING`을 기록하고, Renderer가 완전히 그려진 뒤 `minimal:rendered` IPC에서 `PASS`로 갱신한다. 기존 설치기는 Receipt 파일의 존재만 기다린 뒤 한 번만 읽었기 때문에 정상적인 중간 상태인 `STARTING`을 설치 실패로 처리했다.

또한 Smoke Process 종료 시 `before-quit`이 `STOPPED`를 다시 기록하므로, 설치기가 `PASS` 상태를 늦게 읽는 경우 Terminal 근거가 사라질 가능성이 있었다.

## 교정

```text
SMOKE_WAIT=file existence -> terminal PASS polling
STARTING=TRANSIENT_ALLOWED
FAIL=IMMEDIATE_FAILURE
PASS=SUCCESS
TIMEOUT=45_SECONDS_WITH_LAST_STATUS
SMOKE_BEFORE_QUIT=DO_NOT_OVERWRITE_PASS_WITH_STOPPED
```

설치기는 250ms 간격으로 Receipt를 다시 읽고 `PASS`가 될 때까지 기다린다. Smoke Runtime이 `FAIL`을 기록하거나 `PASS` 전에 종료되거나 45초 내 PASS가 되지 않으면 전체 Stack과 마지막 상태를 Receipt에 기록하고 새 Release만 제거한다.

## 분리 경계

```text
LEGACY_RUNTIME_MODIFIED=false
BASE_MINIMAL_V1_MODIFIED=false
TARGET_RELEASE=E:\SOURCE FACTORY\.yolla\yolla-panel\releases\yolla-minimal-v1.1.1-ui-fix
STATE_ROOT=E:\SOURCE FACTORY\.yolla\yolla-workspace-minimal-v1
PROFILE_ROOT=E:\SOURCE FACTORY\.yolla\yolla-workspace-browser-profile-minimal-v1
LAUNCHER=E:\SOURCE FACTORY\RUN_AI_YOLLA_MINIMAL_V1_1_1.bat
```

V1.1의 BrowserView Drawer 분리, 그룹 헤더 `－` 삭제 버튼, C 모드, 주소창, 그룹·커맨더·워커 배정 기능은 그대로 보존한다.

## 수용 조건

```text
SMOKE_RECEIPT_SEQUENCE=STARTING_TO_PASS
SMOKE_PASS_PRESERVED_AFTER_PROCESS_EXIT=true
DRAWER_BROWSER_VIEW_DETACH=PASS
GROUP_HEADER_DELETE_BUTTON=PASS
LOGIN_PROFILE_PRESERVED=PASS
LEGACY_RUNTIME_PRESERVED=PASS
```

정적 검증만으로 Target PC Live PASS를 주장하지 않는다.
