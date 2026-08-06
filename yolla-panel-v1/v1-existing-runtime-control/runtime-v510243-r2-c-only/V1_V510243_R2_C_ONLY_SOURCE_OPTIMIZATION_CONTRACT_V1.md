# V1 V5.10.2.4.3-R2 C-ONLY SOURCE OPTIMIZATION CONTRACT V1

```text
VERSION=5.10.2.4.3-R2
BASELINE=5.10.2.3.7
R1_STATUS=FAIL_ROLLBACK_ATTEMPTED
R1_EXACT_ERROR=LEGACY_ACTION_CHANNEL_REMAINS_MAIN:v5:group-loop:start
R2_INSTALLATION_STRATEGY=EXACT_HASH_GATED_RELEASE_FILE_OVERLAY_NO_RUNTIME_REGEX_PATCH
TARGET_PC_INSTALL=PENDING
PRODUCTION=false
READY=false
MERGE=false
```

## R1 실패 원인

R1은 Base·UI Hotfix 적용 후 Target PC에서 정규식으로 A/E 실행 경로를 삭제하려 했다. 실제 수집 Source에서 `v5:group-loop:start` Action IPC 반복문이 정규식에 걸리지 않아 Postcondition Gate가 Fail-closed로 중단됐고, 기존 `5.10.2.3.7`로 Rollback됐다.

## R2 교정 방식

R2는 Target PC에서 Source를 정규식으로 다시 변환하지 않는다. 사용자가 제출한 진단 ZIP의 정확한 `5.10.2.3.7` Source를 기반으로 미리 완성·검증한 15개 Release 파일을 SHA-256 Manifest에 따라 새 버전에 Overlay한다.

```text
TARGET_RELEASE=E:\SOURCE FACTORY\.yolla\yolla-panel\releases\v5.10.2.4.3-r2-c-only-source-optimized
BASELINE_HASH_GATE=main.js,workspace.js,workspace.html,workspace.css,workspace_preload.js
REMOVE_RELEASE_DIRECTORIES=automation-v1,automation-v2
```

## 실제 기능 삭제

- `workspace.js`: E/A 버튼 생성, 클릭 처리, Drawer, 상태 Projection, Event 처리 삭제
- `workspace_preload.js`: E/A 실행 API와 Event 구독 삭제
- `main.js`: E/A Runtime require·Queue·Timer·Restore·Action IPC 삭제
- `workspace.html/css`: E/A 전용 UI와 스타일 삭제
- 새 Release: `automation-v1`, `automation-v2` 삭제

읽기 전용 호환 조회 두 개만 `REMOVED` 응답으로 유지한다.

```text
v5:schedule:get-state
v5:group-loop:get-state
```

## 보존

- C 모드 Runtime과 반복명령
- 커맨더·워커 Browser Dispatch
- 그룹 편집·추가
- `workspace_state.json`
- Browser Profile과 Worker Partition
- `runtime.log`
- `log_status.*`와 로그 다운로드 IPC
- 기존 A/E 상태의 Timestamp Backup과 Rollback

## C 모드 UI

```text
IDLE=GRAY
RUNNING=BLUE
ERROR=RED
LABEL=C 모드 실행
STATUS_LINE=Wave {N} · 수행된 작업 {X}회 · 상태: {대기|실행중|오류}
DEFAULT_COMMANDER_MESSAGE=모든 워커에게 지시할 작업을 게시하라
```

## 설치 Gate

1. 실제 실행 Process PID·ExecutablePath·CommandLine 기록
2. Baseline 5개 Source SHA 확인
3. A/E 상태 Backup, 영구삭제 금지
4. 새 Release 별도 생성
5. 정확한 Overlay 파일 SHA 확인
6. A/E UI Marker 0, Action IPC 0 검증
7. JavaScript 문법과 C Runtime 시험
8. 새 Launcher 실행 후 Process CommandLine과 Runtime Receipt 버전 확인
9. 실패 시 새 Release 제거 및 `5.10.2.3.7` 재실행

오프라인 PASS는 Target PC Live PASS가 아니다.