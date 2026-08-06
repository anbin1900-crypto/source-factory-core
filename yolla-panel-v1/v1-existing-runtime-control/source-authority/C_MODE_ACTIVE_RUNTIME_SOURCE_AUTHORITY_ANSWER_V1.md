# C Mode 활성 Runtime Source Authority 답변 V1

```text
QUESTION_ID=C-MODE-ACTIVE-RUNTIME-SOURCE-AUTHORITY-QUESTION-V1-20260806-001
ANSWER_TO_COMMENT_ID=5205286126
STATUS=SOURCE_AUTHORITY_RESOLVED_LIVE_PROCESS_READBACK_PENDING
LAST_VERIFIED_ACTIVE_RUNTIME=5.10.2.3.7
C_TARGET_CHAIN=5.10.2.4.0_BASE_THEN_5.10.2.4.1_HOTFIX
TARGET_PC_C_INSTALL=PENDING
PRODUCTION=false
READY=false
MERGE=false
```

## 1. 실행 프로세스·ReleaseRoot

제출된 Target PC 로그에는 실제 `Win32_Process.ExecutablePath`와 전체 `CommandLine`이 포함되지 않았다. 따라서 이를 관측값으로 추정하지 않는다.

```text
ACTUAL_LIVE_EXECUTABLE_PATH=UNOBSERVED
ACTUAL_LIVE_FULL_COMMAND_LINE=UNOBSERVED
```

마지막으로 확인된 활성 앱은 `5.10.2.3.7`이며, 정확한 Launcher Source는 다음을 지정한다.

```text
LAUNCHER=E:\SOURCE FACTORY\RUN_AI_YOLLA_PANEL_WORKSPACE_V5_10_2_3_7.bat
RELEASE_ROOT=E:\SOURCE FACTORY\.yolla\yolla-panel\releases\v5.10.2.3.7-dispatch-token-recovery
EXECUTABLE_RESOLUTION=E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_*\node_modules\electron\dist\electron.exe 중 최신 유효 Core
COMMAND_LINE=<resolved electron.exe> "<RELEASE_ROOT>"
```

실제 PID Readback은 C 설치 직전 Installer가 다음 값으로 수집하고 Receipt에 고정해야 한다.

```powershell
Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -like '*v5.10.2.3.7-dispatch-token-recovery*' -or $_.CommandLine -like '*v5.10.2.4.*c-*' } |
  Select-Object ProcessId,ExecutablePath,CommandLine
```

## 2. E/A/편집/+ UI Source

버튼은 HTML에 하드코딩되지 않고 `workspace.js`의 `renderGroups()`에서 동적으로 생성된다.

```text
workspace.js   SHA256=527893e252516a1fbe6e37c1cb9f0efa934fd0e5aeca1b198dc8c1d8f0e6eb12
workspace.html SHA256=4328ef3973f64b0c194076a79463127fcc5a580dd846551504f90db65bcc4acb
workspace.css  SHA256=7f9a805e48e54f3fbf4144c731783982f7f4cc1aa90ed0c10cbd81dd666016d2
```

생성 Marker:

```text
E=data-epic-group / epic-button
A=data-auto-group / automation-button
편집=data-edit-group
+=data-add-worker
```

## 3. Preload·IPC·State

Preload:

```text
workspace_preload.js
SHA256=aa54293dc053537f8afbfd62413efb6001984a4193d3b19652d684fff9b816c3
```

E IPC는 `v5:schedule:*`, A IPC는 `v5:group-loop:*`, 그룹 편집은 `v5:workspace:*`이다. 상세 목록은 JSON Readback Manifest에 고정했다.

```text
E_STATE_ROOT=STATE_ROOT\automation-v1
A_STATE_ROOT=STATE_ROOT\automation-v2\group-loops
A_ACTIVE_TURN=STATE_ROOT\automation-v2\ACTIVE_BROWSER_TURN.json
SHARED_STATE=STATE_ROOT\workspace_state.json
```

## 4. 로그 패널

보존 대상 Source:

```text
log_status.html
log_status.js
log_status.css
log_status_preload.js
main.js의 createLogStatusWindow/getLogStatusSnapshot/downloadLogExport
```

IPC:

```text
v5:panel:open-log-status
v5:log-status:get-snapshot
v5:logs:download
v5:log-status:event
v5:log-status:open-folder
```

로그 패널 자체는 보존한다. C 전환 시 A/E 전용 Projection·Filter·Event만 제거한다.

## 5. A/E와 C 공유 의존성

보존해야 할 공통 자원:

```text
main.js의 Browser/session/window/log 기반
workspace_state.json의 group_preferences·seat_profiles·commander_id·context_url
registry.json의 그룹·역할 정의
고정 Browser Profile과 WORKER_BROWSER_PARTITION
workspace 기본 Shell·그룹 렌더링
log_status.*와 로그 다운로드 IPC
```

C 전용 Source:

```text
automation-c-v1/c_mode_runtime.cjs
automation-c-v1/github_comment_client.cjs
workspace_c_mode.js
workspace_c_mode.css
main.js/workspace_preload.js/workspace.html C Patch
```

## 6. Launcher 권위

`RUN_E_*_E_ONLY*.bat`가 현재 활성 Launcher라는 근거는 없다.

```text
LAST_VERIFIED_ACTIVE=E:\SOURCE FACTORY\RUN_AI_YOLLA_PANEL_WORKSPACE_V5_10_2_3_7.bat
C_BASE=E:\SOURCE FACTORY\RUN_AI_YOLLA_PANEL_WORKSPACE_V5_10_2_4_0.bat
C_FINAL=E:\SOURCE FACTORY\RUN_AI_YOLLA_PANEL_WORKSPACE_V5_10_2_4_1.bat
```

최종 C Launcher는 `5.10.2.4.0` 설치 후 `5.10.2.4.1` Hotfix를 적용하고 Target PC Smoke Receipt가 PASS한 뒤에만 활성화한다.

## 7. GitHub에 없는 활성 Source 처리

GitHub에는 C의 Contract·Pointer·Source Manifest가 있고, 불변 Source ZIP Byte는 Drive에 있다. 마지막 활성 `5.10.2.3.7`은 Installer/Release ZIP Readback으로 고정했다.

```text
V510237_INSTALLER_SHA256=fc23f2388e977e3d2e2a78ef15313528c120a3ec6d8d976616311cb3f9016155
V510237_RELEASE_ZIP_SHA256=88abb91dd6053f367667fd2ed7b3984691960f3da556ea1bb1ae8a3a9aec9ad7
V510240_SOURCE_ZIP_SHA256=ed5ff7d376e0a0f481431037c01bd06728f35dfd55be80332a9e11a1a3070e7d
V510241_SOURCE_ZIP_SHA256=362ab825b2c476f32336b227fa82ef8d8089ace76649edc1e3b0e6da99737355
```

동등 Readback Manifest는 `YOLLA_ACTIVE_RUNTIME_SOURCE_READBACK_V1.json`이다.

## 8. A/E 상태 폐기방식

즉시 영구삭제하지 않는다.

```text
1. automation-v1과 automation-v2를 Timestamp Backup
2. C Target Release에서 A/E Runtime Require·IPC 실행경로 제거
3. 호환용 A/E 조회 IPC는 REMOVED 상태만 반환
4. C의 신규 쓰기는 STATE_ROOT\automation-c-v1만 사용
5. workspace_state.json·Browser Profile·runtime.log는 보존
6. C 수용시험과 재시작 복구 PASS 후 별도 정리
```

```text
DECISION=BACKUP_THEN_RUNTIME_REFERENCE_REMOVAL_THEN_DEFERRED_CLEANUP
DESTRUCTIVE_LIVE_EDIT=false
ROLLBACK_REQUIRED=true
```
