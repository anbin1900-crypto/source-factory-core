# YOLLA MINIMAL V1.1 UI LAYER AND GROUP DELETE CONTRACT V1

```text
BASE_RELEASE=yolla-minimal-v1
TARGET_RELEASE=yolla-minimal-v1.1-ui-fix
EXISTING_5_10_2_3_7_MODIFIED=false
BASE_MINIMAL_V1_MODIFIED=false
STATE_ROOT=E:\SOURCE FACTORY\.yolla\yolla-workspace-minimal-v1
PROFILE_ROOT=E:\SOURCE FACTORY\.yolla\yolla-workspace-browser-profile-minimal-v1
```

## 사용자 관측

설정·좌석 추가 Drawer가 열려도 Electron `BrowserView`가 네이티브 상위 계층에 남아 ChatGPT 화면이 Drawer를 가렸다.

## 교정

`BrowserView`를 CSS로 숨기지 않는다. Drawer가 열리기 전에 `BrowserWindow.removeBrowserView()`로 메인 창에서 물리적으로 분리하고, Drawer가 닫힐 때 현재 모드의 View를 다시 결속한다.

```text
DRAWER_OPEN=DETACH_BROWSER_VIEW_FROM_MAIN_WINDOW
DRAWER_CLOSED=RESTORE_ACTIVE_BROWSER_VIEW
BROWSER_CONTENT_DESTROYED=false
LOGIN_SESSION_PRESERVED=true
```

따라서 C 모드와 사용자 지정 명령의 ChatGPT 세션은 유지하면서 설정창 가림만 제거한다.

## 그룹 삭제

각 그룹 제목 줄의 기존 `C 모드 / 편집 / +` 제어에 `-` 버튼을 추가한다.

```text
PLUS=좌석 추가
MINUS=그룹 삭제
DELETE_CONFIRMATION_REQUIRED=true
DELETE_SCOPE=GROUP_AND_CONTAINED_SEATS
```

기존 그룹 편집 Drawer의 삭제 기능도 유지한다.

## 보존

- 왼쪽 그룹·커맨더·워커 구조
- 커맨더·워커 배정
- 컨텍스트·사이트 분석기 주소창
- C 모드
- 일정 간격 및 사용 마감 명령
- 최소 Runtime 상태와 로그인 Profile
- 기존 5.10.2.3.7과 yolla-minimal-v1 Release

## 설치 방식

새 `yolla-minimal-v1.1-ui-fix` Release를 별도로 생성한다. 기존 최소 Runtime을 복사한 뒤 검증된 6개 파일만 SHA-256 Gate로 Overlay하며, Smoke Test가 PASS한 뒤 새 Launcher를 실행한다.

```text
TARGET_PC_INSTALL=PENDING
TARGET_PC_LIVE_PASS=false
PRODUCTION=false
READY=false
MERGE=false
```
