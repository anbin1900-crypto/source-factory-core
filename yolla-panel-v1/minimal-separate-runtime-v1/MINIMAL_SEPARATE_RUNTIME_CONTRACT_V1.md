# AI YOLLA Minimal Separate Runtime Contract V1

```text
RUNTIME=AI_YOLLA_MINIMAL_WORKSPACE_V1
VERSION=1.0.0
EXISTING_RUNTIME_POLICY=PRESERVE_UNMODIFIED
INSTALLATION_MODE=SEPARATE_RELEASE_SEPARATE_STATE_SEPARATE_PROFILE_CLONE
TARGET_PC_INSTALL=PENDING
```

## 경로

```text
EXISTING_RUNTIME=E:\SOURCE FACTORY\.yolla\yolla-panel\releases\v5.10.2.3.7-dispatch-token-recovery
NEW_RELEASE=E:\SOURCE FACTORY\.yolla\yolla-panel\releases\yolla-minimal-v1
NEW_STATE=E:\SOURCE FACTORY\.yolla\yolla-workspace-minimal-v1
LOGIN_PROFILE_SOURCE=E:\SOURCE FACTORY\.yolla\yolla-workspace-browser-profile
NEW_PROFILE_CLONE=E:\SOURCE FACTORY\.yolla\yolla-workspace-browser-profile-minimal-v1
NEW_LAUNCHER=E:\SOURCE FACTORY\RUN_AI_YOLLA_MINIMAL_V1.bat
```

기존 Release·State·Profile·Launcher는 수정하거나 삭제하지 않는다. 기존 로그인 Profile은 최초 설치 때 별도 Profile로 복제한다.

## 지금 포함하는 기능

1. 기존 `workspace_state.json`에서 왼쪽 그룹·좌석 구조를 최초 1회 Import
2. 그룹 추가·편집·삭제
3. 커맨더·워커 추가·편집·배정
4. 선택 컨텍스트 주소창
5. 사이트 분석기 독립 주소창·사이트 등록·Provider 연결점
6. 현재 C 모드 Runtime
7. 사용자 지정 명령의 일정 간격 전송
8. 사용자 지정 명령의 명시적 `사용 마감` 전송

## 포함하지 않는 기능

```text
E_MODE=false
A_MODE=false
LEGACY_SCHEDULE_RUNTIME=false
LEGACY_GROUP_LOOP_RUNTIME=false
DATA_FACTORY=false
SITE_ANALYZER_ENGINE=false
LOG_STATUS_WINDOW=false
OLD_RUNTIME_PATCH=false
```

사이트 분석기는 실제 엔진을 포함하지 않고, 나중에 Provider를 연결할 주소·등록 사이트·상태 계약만 둔다.

## 자원 원칙

- 선택된 컨텍스트 BrowserView 1개와 사이트 분석기 BrowserView 1개만 필요할 때 생성한다.
- 좌석 수와 BrowserView 수를 분리한다.
- 비활성 컨텍스트마다 BrowserView를 만들지 않는다.
- C 모드 또는 사용자 명령이 비활성일 때 관련 Timer를 유지하지 않는다.

## 명령 방식

### C 모드

그룹에 지정된 GitHub 저장소와 Control PR을 권위로 사용한다. 커맨더·워커 배정은 새 State의 그룹·좌석 구조를 사용한다.

### 사용자 지정 명령

```text
TRIGGER=INTERVAL | ON_USE_END
TARGETS=선택한 컨텍스트들
MESSAGE=사용자 입력 원문
```

`ON_USE_END`는 사용자가 해당 컨텍스트에서 `사용 마감`을 누를 때 전송한다. 앱 종료에 암묵적으로 결속하지 않는다.

## 수용 경계

오프라인 시험은 Target PC PASS가 아니다. 설치 후 다음을 확인해야 한다.

```text
OLD_RUNTIME_LAUNCH_PASS
NEW_RUNTIME_LAUNCH_PASS
LOGIN_SESSION_CLONE_PASS
LEFT_MENU_IMPORT_PASS
DUAL_ADDRESS_BAR_PASS
COMMANDER_WORKER_ASSIGNMENT_PASS
C_MODE_START_PASS
INTERVAL_COMMAND_PASS
USE_END_COMMAND_PASS
OLD_RUNTIME_MODIFIED=false
```
