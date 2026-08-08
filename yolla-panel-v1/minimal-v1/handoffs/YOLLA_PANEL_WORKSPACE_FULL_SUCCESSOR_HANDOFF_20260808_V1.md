# YOLLA Panel Workspace Full Successor Handoff V1

HANDOFF_ID=YOLLA-PANEL-WORKSPACE-FULL-SUCCESSOR-HANDOFF-V1-20260808-001
GENERATED_AT_KST=2026-08-08T14:33:00+09:00
REPOSITORY=anbin1900-crypto/source-factory-core
CONTROL_PR=17
IMPLEMENTATION_PR=76
PRODUCTION=false
READY=false
MERGE=false

## 0. 새 컨텍스트의 즉시 행동 규칙

1. GitHub를 권위로 사용한다. 대화 기억보다 PR #17과 PR #76의 최신 Remote Head/Pointer를 먼저 읽는다.
2. 기존 안정 Runtime과 로그인 세션을 파괴하지 않는다. 새 실험은 항상 별도 Release/Launcher/State 또는 명시적 백업 후 수행한다.
3. Target-PC Receipt·Process Readback·실제 화면 증거 없이 Live PASS/LTS/Production/Ready/Merge를 주장하지 않는다.
4. Browser Profile, workspace_state, runtime.log를 보존한다.
5. E/A 기능은 현재 목표가 아니다. 새로운 Minimal Runtime에는 넣지 않는다.
6. 사이트 분석기는 현재 엔진이 아니라 Shell/주소창/Provider 연결점까지만 범위다.

## 1. 현재 권위

### Control

- Repository: `anbin1900-crypto/source-factory-core`
- Control PR: `#17`
- Branch: `integration/a0-yolla-workspace-automation-successor-v1`
- Head at handoff check: `53c1f034dc11dd7c3bbe2eb08585dabad1ec877a`
- PR state: Open / Draft / Unmerged
- A-0 successor Pointer: `yolla-panel-v1/a0-successor-control/LATEST_A0_SUCCESSOR_HANDOFF_POINTER.json`

### Minimal Runtime implementation

- PR: `#76`
- Branch: `agent/yolla-minimal-separate-runtime-v1`
- Head before this handoff publication: `367d6d78e05bd27720adae1d464dff677a88a20b`
- PR state: Open / Draft / Unmerged
- Current design target: `YOLLA Minimal V1.2 observability`
- Pointer: `yolla-panel-v1/minimal-v1/LATEST_YOLLA_MINIMAL_V1_2_OBSERVABILITY_POINTER.json`

## 2. 기존 Legacy Workspace 권위와 경로

마지막으로 권위 문서가 지정한 Legacy 기준선은 `5.10.2.3.7`이다.

```text
LEGACY_RELEASE=E:\SOURCE FACTORY\.yolla\yolla-panel\releases\v5.10.2.3.7-dispatch-token-recovery
LEGACY_LAUNCHER=E:\SOURCE FACTORY\RUN_AI_YOLLA_PANEL_WORKSPACE_V5_10_2_3_7.bat
LEGACY_STATE_ROOT=E:\SOURCE FACTORY\.yolla\yolla-workspace-v5-2
LEGACY_WORKSPACE_STATE=E:\SOURCE FACTORY\.yolla\yolla-workspace-v5-2\workspace_state.json
LEGACY_RUNTIME_LOG=E:\SOURCE FACTORY\.yolla\yolla-workspace-v5-2\runtime.log
ORIGINAL_BROWSER_PROFILE=E:\SOURCE FACTORY\.yolla\yolla-workspace-browser-profile
```

Electron resolution authority:

```text
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_*\node_modules\electron\dist\electron.exe
```

Target-PC logs previously resolved:

```text
E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038\node_modules\electron\dist\electron.exe
```

Legacy active source authority Pointer:

`yolla-panel-v1/v1-existing-runtime-control/LATEST_C_MODE_ACTIVE_RUNTIME_SOURCE_AUTHORITY_POINTER.json`

Authority answer:

`yolla-panel-v1/v1-existing-runtime-control/source-authority/C_MODE_ACTIVE_RUNTIME_SOURCE_AUTHORITY_ANSWER_V1.md`

Readback manifest:

`yolla-panel-v1/v1-existing-runtime-control/source-authority/YOLLA_ACTIVE_RUNTIME_SOURCE_READBACK_V1.json`

Legacy source hashes:

```text
workspace.js          527893e252516a1fbe6e37c1cb9f0efa934fd0e5aeca1b198dc8c1d8f0e6eb12
workspace.html        4328ef3973f64b0c194076a79463127fcc5a580dd846551504f90db65bcc4acb
workspace.css         7f9a805e48e54f3fbf4144c731783982f7f4cc1aa90ed0c10cbd81dd666016d2
workspace_preload.js  aa54293dc053537f8afbfd62413efb6001984a4193d3b19652d684fff9b816c3
main.js               e31ee5cbb9c46b0b5e6c22c6efd7cf63679828046ce230b80cd4f797e59a4934
```

Legacy log status panel source to preserve/reference:

```text
log_status.html
log_status.js
log_status.css
log_status_preload.js
main.js:createLogStatusWindow
main.js:getLogStatusSnapshot
main.js:downloadLogExport
```

Legacy log IPC:

```text
v5:panel:open-log-status
v5:log-status:get-snapshot
v5:logs:download
v5:log-status:event
v5:log-status:open-folder
```

## 3. Legacy E/A 기능 정보 — 참고만 하고 새 Minimal에 재도입 금지

Legacy Renderer에서 E/A 버튼은 `workspace.js:renderGroups()`가 동적으로 생성했다.

```text
E marker=data-epic-group / epic-button
A marker=data-auto-group / automation-button
편집=data-edit-group
좌석추가=data-add-worker
```

Legacy IPC:

```text
E=v5:schedule:*
A=v5:group-loop:*
Group management=v5:workspace:*
```

Legacy state:

```text
E_STATE_ROOT=STATE_ROOT\automation-v1
A_STATE_ROOT=STATE_ROOT\automation-v2\group-loops
A_ACTIVE_TURN=STATE_ROOT\automation-v2\ACTIVE_BROWSER_TURN.json
SHARED_STATE=STATE_ROOT\workspace_state.json
```

A/E 처리 원칙은 `BACKUP_THEN_RUNTIME_REFERENCE_REMOVAL_THEN_DEFERRED_CLEANUP`이며 역사 상태의 즉시 영구삭제는 금지한다.

## 4. C 모드 공통 Source

Legacy/Minimal에서 재사용되는 핵심 C source:

```text
automation-c-v1/c_mode_runtime.cjs
automation-c-v1/github_comment_client.cjs
```

V1/V1.2 bundle hash:

```text
c_mode_runtime.cjs      SHA256=2f3dded91d69e5eb2eed504e068d6b7429bb30ae410c77b17ecc92ae9d6fff6c
github_comment_client   SHA256=1b6e7dff885d300d5d8ccb148962ad7e59edd7869517642bc86e77480262ea55
```

C completion master Pointer:

`yolla-panel-v1/v1-existing-runtime-control/LATEST_C_MODE_COMPLETION_HANDOFF_POINTER.json`

기존 7-cycle 원안:

1. Exact runtime / idle resource baseline
2. Browser lifecycle lightweighting
3. C-mode button state machine / UI truth
4. GitHub batch relay / correlation / wave / progress
5. Repeat command / background / install / log
6. Six-worker live failure / restart recovery
7. Target-PC LTS closure

단, 사용자의 최신 지시는 기존 Runtime을 계속 패치하는 대신 별도 Minimal Runtime을 중심으로 단순화하는 것이다.

## 5. Minimal V1 — 마지막으로 Target-PC에서 검증된 별도 기준선

```text
RELEASE=E:\SOURCE FACTORY\.yolla\yolla-panel\releases\yolla-minimal-v1
STATE_ROOT=E:\SOURCE FACTORY\.yolla\yolla-workspace-minimal-v1
PROFILE_ROOT=E:\SOURCE FACTORY\.yolla\yolla-workspace-browser-profile-minimal-v1
LAUNCHER=E:\SOURCE FACTORY\RUN_AI_YOLLA_MINIMAL_V1.bat
```

정책:

```text
EXISTING_510237_MODIFIED=false
ORIGINAL_BROWSER_PROFILE_MODIFIED=false
MINIMAL_PROFILE=original profile clone
```

Target-PC 증거:

`MINIMAL_V1_LAUNCHER_REPAIR_RECEIPT.json`

마지막 확인 내용:

```text
status=PASS
release_root=...\yolla-minimal-v1
state_root=...\yolla-workspace-minimal-v1
profile_root=...\yolla-workspace-browser-profile-minimal-v1
existing_runtime_modified=false
minimal_runtime_source_modified=false
smoke_test=PASS
terminal=YOLLA_MINIMAL_V1_LAUNCHER_SPACE_QUOTE_REPAIRED
```

주의: 이 Receipt는 당시 launch 성공을 증명하지만 handoff 시점 현재 PID가 아직 실행 중이라는 뜻은 아니다. 현재 Process는 필요 시 다시 readback한다.

Minimal V1 package authority:

```text
PACKAGE=AI_YOLLA_MINIMAL_V1_SEPARATE_RUNTIME_PACKAGE.zip
DRIVE_ID=12DOVAiQkQ5ioG2_6AJo0Weu9rIjOBGN-
SIZE=49916
SHA256=06ed11cd571e5d9222487cc75b902dda526b8e7b7ca13f116ebb536576f7e0c6
```

One-click V1:

```text
INSTALL_AI_YOLLA_MINIMAL_V1_ONE_CLICK.bat
DRIVE_ID=1G68UM_92eN8Pd5srC7Q1Wg8ZVb-xT58e
SIZE=69144
SHA256=2d39122dd23b0d41e638cec9263c8f39c85d033166f4ef1b05570b517f4e9e61
```

Manifest:

`yolla-panel-v1/minimal-separate-runtime-v1/SOURCE_AND_ARTIFACT_MANIFEST_V1.json`

## 6. Minimal V1.2 — 현재 개발 목표

목표는 기능을 최소화하고 아래만 제공하는 것이다.

```text
TOP_MENU=프로젝트 | 로그 분석기 | 대화 | 워커 지정 | 명령
LEFT_MENU=그룹/커맨더/워커
SITE_ANALYZER=Shell + address bar + future Provider boundary only
C_MODE=enabled
USER_COMMAND_TRIGGER_1=INTERVAL
USER_COMMAND_TRIGGER_2=AFTER_COMPLETION(작업완료후)
GROUP_COMPLETION_COUNT=visible
```

`사용마감` 개념은 폐기했다.

### 워커 지정 의미

1. 사용자가 `[프로젝트]`로 ChatGPT 프로젝트에 들어간다.
2. 새 대화/새 worker context를 만든다.
3. 그 대화가 열린 상태에서 `[워커 지정]`을 누른다.
4. BrowserView의 현재 `https://chatgpt.com/.../c/...` URL을 읽는다.
5. 선택 그룹의 commander 아래 새 worker `context_url`로 저장한다.
6. 일반 Browser navigation은 기존 role URL을 자동 변경하지 않는다.

### 작업완료후 의미

C mode의 worker completion token(`latest_result_post_by_role` 또는 `worker_report_counts`)이 새로 증가/변경되었을 때 사용자 지정 명령을 한 번 전송한다.

- 등록 시 기존 완료 상태를 baseline으로 잡아 과거 완료에 오발송하지 않는다.
- 같은 완료 token에 중복 전송하지 않는다.

### 로그 분석기 의미

로그 분석기는 단순 Viewer가 아니라 C 모드의 충돌·에러·미보고·재시도·대기·부분완료를 분석하기 위한 기본 개발 장치다.

Signal 분류 대상:

```text
ERROR FAIL BLOCKED TIMEOUT CONFLICT INVALID
MISSING RETRY WAIT CARRYOVER PARTIAL
```

### 진단 ZIP 저장

로그 분석기에서 `진단 ZIP 저장`을 누르면 기본적으로 Downloads에 `YOLLA_MINIMAL_DIAGNOSTIC_<timestamp>.zip`을 만들 수 있다.

포함:

```text
DIAGNOSTIC_SUMMARY.json
README.txt
runtime.log
LATEST_RUNTIME_RECEIPT.json
workspace_state.json
automation-c-v1/C_MODE_STATE.json
automation-c-v1/REPEAT_COMMANDS.json
automation-c-v1/work_control_events.jsonl
commands/SCHEDULED_COMMANDS.json
recent dispatch-receipts/*.json
recent automation-c-v1/dispatch-receipts/*.json
recent commands/receipts/*.json
```

제외:

```text
Browser Profile
cookies
login tokens
cache
passwords
```

## 7. Minimal V1.2 Target paths

```text
TARGET_RELEASE=E:\SOURCE FACTORY\.yolla\yolla-panel\releases\yolla-minimal-v1.2-observability
STATE_ROOT=E:\SOURCE FACTORY\.yolla\yolla-workspace-minimal-v1
STATE_FILE=E:\SOURCE FACTORY\.yolla\yolla-workspace-minimal-v1\workspace_state.json
RUNTIME_LOG=E:\SOURCE FACTORY\.yolla\yolla-workspace-minimal-v1\runtime.log
LATEST_RUNTIME_RECEIPT=E:\SOURCE FACTORY\.yolla\yolla-workspace-minimal-v1\LATEST_RUNTIME_RECEIPT.json
INSTALL_RECEIPT=E:\SOURCE FACTORY\.yolla\yolla-workspace-minimal-v1\MINIMAL_V1_2_INSTALL_RECEIPT.json
INSTALL_LOG=E:\SOURCE FACTORY\.yolla\yolla-workspace-minimal-v1\install-minimal-v1.2.log
PROFILE_ROOT=E:\SOURCE FACTORY\.yolla\yolla-workspace-browser-profile-minimal-v1
LAUNCHER_BAT=E:\SOURCE FACTORY\RUN_AI_YOLLA_MINIMAL_V1_2.bat
LAUNCHER_PS1=E:\SOURCE FACTORY\RUN_AI_YOLLA_MINIMAL_V1_2.ps1
```

Minimal main.js defaults:

```text
APP_VERSION=1.2.0
WORKER_PARTITION=persist:sf4-safe-panel-worker-1
ANALYZER_PARTITION=persist:yolla-analysis-browser-v1
LEGACY_STATE_PATH=E:\SOURCE FACTORY\.yolla\yolla-workspace-v5-2\workspace_state.json
```

## 8. Minimal V1.2 source package and exact files

Package:

```text
AI_YOLLA_MINIMAL_V1_2_OBSERVABILITY_PACKAGE.zip
DRIVE_ID=1IgrrhyONEBfKS6UT6Ryndy0lLchpHsBb
SIZE=59043
SHA256=902ab7eaa08b71998169084f2a2efcdbaf06a2b2a8a6b3272636b6c954608d05
```

Original V1.2 one-click installer:

```text
INSTALL_AI_YOLLA_MINIMAL_V1_2_ONE_CLICK.bat
DRIVE_ID=1Ee4-YDvMhDT0sEsrtbdXLbrSVMlMLBCn
SIZE=85929
SHA256=b1efd60068f302d7a2e501bcd3028076c6894b66db011f79de8c1c05331853bf
```

GitHub Pointer:

`yolla-panel-v1/minimal-v1/LATEST_YOLLA_MINIMAL_V1_2_OBSERVABILITY_POINTER.json`

Contract:

`yolla-panel-v1/minimal-v1/runtime-v1.2/YOLLA_MINIMAL_V1_2_OBSERVABILITY_AND_BINDING_CONTRACT_V1.md`

Build report:

`yolla-panel-v1/minimal-v1/runtime-v1.2/YOLLA_MINIMAL_V1_2_BUILD_TEST_REPORT_V1.json`

Files inside package:

```text
runtime/main.js
runtime/preload.js
runtime/renderer.js
runtime/index.html
runtime/styles.css
runtime/state_store.cjs
runtime/chatgpt_dispatch.cjs
runtime/command_scheduler.cjs
runtime/log_analyzer.html
runtime/log_analyzer.js
runtime/log_analyzer.css
runtime/log_analyzer_preload.js
runtime/automation-c-v1/c_mode_runtime.cjs
runtime/automation-c-v1/github_comment_client.cjs
runtime/package.json
install-minimal-v1.2.ps1
INSTALL_AI_YOLLA_MINIMAL_V1_2.bat
RUN_AI_YOLLA_MINIMAL_V1_2.ps1
RUN_AI_YOLLA_MINIMAL_V1_2.bat
REMOVE_AI_YOLLA_MINIMAL_V1_2.ps1
REMOVE_AI_YOLLA_MINIMAL_V1_2.bat
RUNTIME_MANIFEST.json
```

Important source hashes:

```text
runtime/main.js              0389d065050f86a23184a688a271d86970cf83b9e1a825a0432a82809a2ab446
runtime/preload.js           0cc7a87b0e5d98fbb98aa5bd8cae2498db5d5d69f56abb8c6d06acf02db2e5f8
runtime/renderer.js          1277af0035ab279973e28443f7b4286412f9f608751e05f5f08d0db51fc75865
runtime/state_store.cjs      6e206135d7df37e711ace12b5eeca02d968af6f45b44cfaef98e29849b3d7ba5
runtime/chatgpt_dispatch.cjs ffcbc712775caadb0a585f65dc14fe4b33287071d8b26f2b541bbdb7133c56cd
runtime/command_scheduler.cjs 53fc6825d6b5b7c1ced254d0b7dc9986e161f1fbb25af3298eed9d8ed4b702d1
runtime/log_analyzer.js      af76cb04915868cdcdbc90f432313caad6c5d1061af64aa27feecb98728b3b13
runtime/log_analyzer_preload.js af52602b65df06db093ec3e4a69ae92ac2f5f286a2730fe32f2eb38812cfd23b
runtime/automation-c-v1/c_mode_runtime.cjs 2f3dded91d69e5eb2eed504e068d6b7429bb30ae410c77b17ecc92ae9d6fff6c
```

## 9. V1.2 offline validation

GitHub build report states:

```text
FEATURE_STATIC=PASS_25
COMPLETION_SCHEDULER=PASS_10
STATE_BINDING=PASS_4
NODE_SYNTAX=PASS_10_FILES
ZIP_INTEGRITY=PASS
SELF_EXTRACT_PAYLOAD_MATCH=PASS
TARGET_PC_INSTALL=PENDING
TARGET_PC_LIVE_PASS=false
```

This is offline/source validation only, not Target-PC live acceptance.

## 10. 가장 최근 Target-PC V1.2 설치 실패 — 현재 P0 blocker

User execution:

```text
STEP_1_VALIDATE_PAYLOAD=passed
STEP_2_RESOLVE_ELECTRON=passed
STEP_3_PREPARE_PROFILE_WITHOUT_TOUCHING_ORIGINAL=passed
STEP_4_STOP_ONLY_OLDER_MINIMAL_PROCESSES=passed
STEP_5_INSTALL_SEPARATE_V1_2_RELEASE=passed
STEP_6_INSTALL_SEPARATE_LAUNCHER=passed
STEP_7_SMOKE_TEST_WAIT_FOR_PASS=FAILED
ERROR=You cannot call a method on a null-valued expression.
LOCATION=install-minimal-v1.2.ps1 line 38
```

Exact bad code in V1.2 package:

```powershell
$psi=New-Object System.Diagnostics.ProcessStartInfo
...
$psi.ArgumentList.Add($Release)
$psi.ArgumentList.Add('--smoke-test')
```

그리고 launcher에도 같은 패턴이 있다:

```powershell
$psi.ArgumentList.Add($release)
```

Root cause:

```text
TARGET_OS=Windows 10
TARGET_POWERSHELL=Windows PowerShell 5.1
ProcessStartInfo.ArgumentList is unavailable/null in this environment
```

이 실패는 V1.2 runtime source 기능의 실패가 아니라 installer/launcher compatibility failure다. 사용자 로그상 기존 runtime은 보존되었다.

### 다음 컨텍스트가 가장 먼저 할 일

V1.2 source를 다시 설계하지 말고 **launcher/smoke process start 부분만 PowerShell 5.1 호환으로 교정**한다.

권장 형태:

```powershell
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $electron
$psi.WorkingDirectory = $Release
$psi.UseShellExecute = $false
$psi.Arguments = ('"{0}" --smoke-test' -f $Release)
```

실제 launcher:

```powershell
$psi.Arguments = ('"{0}"' -f $release)
```

주의:

- 공백이 있는 `E:\SOURCE FACTORY\...` path를 반드시 quote한다.
- V1에서 이미 발생했던 `E:\SOURCE` 절단 회귀를 다시 만들지 않는다.
- 수정 범위는 launcher/smoke start compatibility로 최소화한다.
- 새 versioned repair 또는 V1.2.1을 만들고 기존 V1/V1.2 bytes를 덮어쓰지 않는다.
- smoke는 `STARTING`을 transient로 허용하고 `PASS`까지 polling해야 한다.
- Target-PC PASS는 새 Receipt 확인 후에만 선언한다.

## 11. 과거 실패 이력 — 같은 실수를 반복하지 말 것

### V510243 R1

- 실패: `LEGACY_ACTION_CHANNEL_REMAINS_MAIN:v5:group-loop:start`
- 원인: regex patch가 A-mode action IPC loop를 완전히 제거하지 못함
- 결과: rollback to 5.10.2.3.7

### V510243 R2

- 실패: `STATIC_REQUIRED_MISSING:C_BUTTON_LABEL`
- 실제 기능 failure보다 과도한 static string gate가 전체 설치를 차단
- 이후 사용자 결정: 기존 Runtime을 계속 patch하지 말고 별도 Minimal Runtime으로 전환

### Minimal V1 최초 설치

- 실패: space-containing app path가 `E:\SOURCE`로 잘림
- 원인: Process start argument quoting
- Launcher-only repair 후 PASS

### Minimal V1.1

- 실패: `SMOKE_STATUS_NOT_PASS:STARTING`
- 원인: Receipt file 존재를 terminal state로 오판; STARTING을 즉시 실패 처리
- 교정 원칙: 250ms polling, PASS까지 기다림, FAIL만 즉시 failure

### Minimal V1.2

- 현재 실패: PowerShell 5.1 `ProcessStartInfo.ArgumentList` null
- 다음 수정은 launcher/smoke compatibility only

## 12. UI 요구사항 — 최신 사용자 결정

현재 사용자가 원하는 핵심 UI는 다음뿐이다.

```text
TOP=프로젝트 | 로그 분석기 | 대화 | 워커 지정 | 명령
LEFT=그룹 + 커맨더 + 워커
GROUP_HEADER=C 모드 | 편집 | + | -
GROUP_FOOTER=작업완료 N회 | Wave | 상태
MAIN=선택한 ChatGPT context BrowserView + 주소창
ANALYZER=사이트 분석기 Shell + 주소창
```

BrowserView가 Drawer를 가리면 CSS z-index로 해결하려 하지 않는다. Drawer open 시 native BrowserView를 main window에서 detach하고 close 시 restore한다.

## 13. 로그인/session 정책

- Original profile은 보존한다.
- Minimal은 clone profile을 사용한다.
- Minimal profile root: `E:\SOURCE FACTORY\.yolla\yolla-workspace-browser-profile-minimal-v1`
- `app.setPath('userData', PROFILE_ROOT)`로 로그인 세션을 유지한다.
- 진단 ZIP에는 profile/cookie/token을 넣지 않는다.

## 14. 상태·로그 구조

Minimal state root:

`E:\SOURCE FACTORY\.yolla\yolla-workspace-minimal-v1`

주요 파일:

```text
workspace_state.json
runtime.log
LATEST_RUNTIME_RECEIPT.json
automation-c-v1/C_MODE_STATE.json
automation-c-v1/REPEAT_COMMANDS.json
automation-c-v1/work_control_events.jsonl
commands/SCHEDULED_COMMANDS.json
dispatch-receipts/*.json
automation-c-v1/dispatch-receipts/*.json
commands/receipts/*.json
```

로그 분석기 IPC in V1.2:

```text
minimal:log-analyzer:open
minimal:log-analyzer:get-snapshot
minimal:log-analyzer:export
minimal:log-analyzer:open-folder
minimal:log-analyzer:event
```

## 15. GitHub 권위 Read Order for new context

새 컨텍스트는 아래 순서로 읽는다.

1. PR #17 current info / current head
2. `yolla-panel-v1/v1-existing-runtime-control/LATEST_C_MODE_ACTIVE_RUNTIME_SOURCE_AUTHORITY_POINTER.json`
3. `.../source-authority/C_MODE_ACTIVE_RUNTIME_SOURCE_AUTHORITY_ANSWER_V1.md`
4. `yolla-panel-v1/v1-existing-runtime-control/LATEST_C_MODE_COMPLETION_HANDOFF_POINTER.json`
5. PR #76 current info / current head
6. `yolla-panel-v1/minimal-separate-runtime-v1/SOURCE_AND_ARTIFACT_MANIFEST_V1.json`
7. `yolla-panel-v1/minimal-v1/LATEST_YOLLA_MINIMAL_V1_LAUNCHER_REPAIR_POINTER.json`
8. `yolla-panel-v1/minimal-v1/LATEST_YOLLA_MINIMAL_V1_1_1_SMOKE_GATE_POINTER.json`
9. `yolla-panel-v1/minimal-v1/LATEST_YOLLA_MINIMAL_V1_2_OBSERVABILITY_POINTER.json`
10. `yolla-panel-v1/minimal-v1/runtime-v1.2/YOLLA_MINIMAL_V1_2_OBSERVABILITY_AND_BINDING_CONTRACT_V1.md`
11. `yolla-panel-v1/minimal-v1/runtime-v1.2/YOLLA_MINIMAL_V1_2_BUILD_TEST_REPORT_V1.json`
12. 이 handoff 문서

## 16. 절대 하지 말 것

```text
Do not overwrite 5.10.2.3.7 release.
Do not modify original browser profile.
Do not delete historical automation-v1/v2 state.
Do not reintroduce E/A mode into Minimal.
Do not use CSS hiding as functional removal.
Do not create one BrowserView per idle seat.
Do not claim Target-PC Live PASS from offline tests.
Do not treat STARTING receipt as failure.
Do not use ProcessStartInfo.ArgumentList on target Windows PowerShell 5.1.
Do not merge PR #17/#76 without explicit user authorization.
```

## 17. Successor terminal state at handoff

```text
LEGACY_BASELINE_AUTHORITY=RESOLVED
LEGACY_510237_PRESERVED=true
MINIMAL_V1_INSTALL_AND_LAUNCH_REPAIR=TARGET_PC_PASS_AT_REPAIR_TIME
MINIMAL_V1_CURRENT_PROCESS=NOT_RE_READ
MINIMAL_V1_1_1_SOURCE=READY_BUT_TARGET_PC_PASS_NOT_CONFIRMED
MINIMAL_V1_2_SOURCE=OFFLINE_PASS
MINIMAL_V1_2_TARGET_PC_INSTALL=FAIL_AT_SMOKE_PROCESS_START
MINIMAL_V1_2_ROOT_CAUSE=POWERSHELL_5_1_PROCESSSTARTINFO_ARGUMENTLIST_NULL
NEXT_ACTION=BUILD_MINIMAL_V1_2_POWERSHELL_5_1_LAUNCHER_SMOKE_REPAIR_AND_TARGET_PC_RETEST
TARGET_PC_LIVE_PASS=false
PRODUCTION=false
READY=false
MERGE=false
```
