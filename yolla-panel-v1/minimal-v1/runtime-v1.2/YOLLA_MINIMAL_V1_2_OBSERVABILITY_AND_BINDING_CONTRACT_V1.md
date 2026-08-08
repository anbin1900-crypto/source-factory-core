# YOLLA MINIMAL V1.2 OBSERVABILITY AND BINDING CONTRACT V1

```text
VERSION=1.2.0
TARGET_RELEASE=E:\SOURCE FACTORY\.yolla\yolla-panel\releases\yolla-minimal-v1.2-observability
STATE_ROOT=E:\SOURCE FACTORY\.yolla\yolla-workspace-minimal-v1
PROFILE_ROOT=E:\SOURCE FACTORY\.yolla\yolla-workspace-browser-profile-minimal-v1
LEGACY_RUNTIME_MODIFIED=false
BASE_MINIMAL_RUNTIME_FILES_MODIFIED=false
```

## 1. 상단 메뉴

커맨더·워커 화면의 상단 메뉴는 다음 순서를 사용한다.

```text
프로젝트 | 로그 분석기 | 대화 | 워커 지정 | 명령
```

`사용 마감` 기능과 상단 버튼은 제거한다.

## 2. 워커 지정

`프로젝트`로 프로젝트 화면에 이동하여 새 ChatGPT 대화를 만든 뒤 `워커 지정`을 누르면 현재 Worker BrowserView의 실제 `/c/` 대화 URL을 읽는다.

- 선택 그룹의 `commander_id`가 반드시 존재해야 한다.
- 현재 URL은 ChatGPT 대화 URL이어야 한다.
- 이미 다른 좌석에 저장된 URL이면 중복 등록을 거부한다.
- 새 좌석은 `WORKER`로 생성되며 선택 그룹 커맨더의 관리 대상이 된다.
- 브라우저의 일반 이동은 커맨더/워커의 저장된 `context_url`을 자동 변경하지 않는다. 주소 변경은 명시적 지정/편집으로만 수행한다.

## 3. 사용자 지정 명령

명령 조건은 정확히 두 종류다.

```text
INTERVAL=일정한 시간마다
AFTER_COMPLETION=작업완료후
```

`AFTER_COMPLETION`은 C 모드가 관측한 워커별 `latest_result_post_by_role` 또는 `worker_report_counts`의 새 완료 이벤트를 기준으로 1회 전송한다. 명령 등록 시 기존 완료 상태를 baseline으로 저장해 과거 완료에 대한 즉시 오발송을 막는다. 동일 완료 토큰에 대한 중복 전송은 금지한다.

기존 저장 상태의 `ON_USE_END`는 실행 기능을 유지하지 않고 `AFTER_COMPLETION`으로 일회성 마이그레이션한다.

## 4. 그룹 작업완료 표시

각 그룹 헤더 바로 아래 행에 다음을 표시한다.

```text
작업완료 N회 | Wave N | 상태
```

수치는 C 모드의 `completed_task_count`, `current_wave_index`, `status`를 사용한다.

## 5. 로그 분석기

`프로젝트` 옆 `로그 분석기` 버튼은 별도 Electron BrowserWindow를 연다. 이 창은 C 모드의 기본 관측·충돌 분석 장치다.

표시 대상:

- Runtime 로그
- C 모드 work-control 이벤트
- 오류/경고/충돌 신호
- C 상태·Wave·작업완료·미보고·중복전송
- 워커 상태 수

오류 판단 키워드는 ERROR/FAIL/BLOCKED/TIMEOUT/CONFLICT/INVALID/REPLACEMENT_REQUIRED/RENDER_PROCESS_GONE이며, 경고는 MISSING/RETRY/WAIT/STALE/CARRYOVER/PARTIAL/WARNING을 포함한다.

## 6. 진단 ZIP 저장

로그 분석기에서 `진단 ZIP 저장`을 누르면 사용자가 선택한 경로에 ZIP을 생성한다.

포함:

```text
DIAGNOSTIC_SUMMARY.json
runtime.log
LATEST_RUNTIME_RECEIPT.json
workspace_state.json
automation-c-v1/C_MODE_STATE.json
automation-c-v1/REPEAT_COMMANDS.json
automation-c-v1/work_control_events.jsonl
commands/SCHEDULED_COMMANDS.json
최근 dispatch receipt
```

명시적으로 제외:

```text
Browser Profile
쿠키
로그인 토큰
캐시
비밀번호
```

생성 완료 후 ZIP 경로·크기·SHA-256을 로그 분석기에 표시하고 Explorer에서 파일 위치를 연다. 사용자는 해당 ZIP을 ChatGPT 대화에 첨부하여 분석을 요청할 수 있다.

## 7. 사이트 분석기와 C 모드

기존 사이트 분석기 주소창/Provider 연결 구조와 C 모드 Runtime은 보존한다. E/A Mode 및 구형 Schedule/Group Loop Runtime은 포함하지 않는다.

## 8. 수용 경계

오프라인 검증은 Target PC Live PASS가 아니다. 실제 설치 후 워커 지정 URL 저장, 로그 분석기 열기, 진단 ZIP 생성, 작업완료후 트리거, 그룹 작업완료 표시를 확인해야 한다.
