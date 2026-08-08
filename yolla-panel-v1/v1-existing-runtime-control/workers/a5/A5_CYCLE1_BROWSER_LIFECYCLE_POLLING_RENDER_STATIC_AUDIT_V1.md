# A-5 Browser Lifecycle·Polling·Render 정적감사 V1

- **상태:** `TERMINAL_PASS`
- **Terminal:** `A5_C_MODE_CYCLE1_STATIC_AUDIT_COMPLETE_A4_A6_HANDOFF_READY`
- **지정 댓글:** `5206070859`
- **실가동 권위:** `5.10.2.3.7` — 마지막 검증 실가동, 현재 프로세스 Readback은 A-3의 대상 PC 접근 차단으로 미확정
- **차기 후보:** `5.10.2.4.3` — PR #75, 미설치·미활성
- **Runtime Source 수정:** `0`

## I. 감사 범위와 권위 분리

실가동 `5.10.2.3.7`은 파일별 SHA-256·크기·역할·경로 권위가 확정됐지만, 이 실행환경에서 원문 `main.js`·`workspace.js` Byte 전체를 직접 읽을 수 없었습니다. 따라서 실가동에 대해서는 **권위 문서와 정확 GitHub Bridge/Shell/Preload Source**만 직접 감사했고, Byte가 없는 영역은 추정하지 않았습니다.

A-2가 차기 정확 후보로 지정한 `5.10.2.4.3`은 Google Drive Source Chain 3종을 직접 내려받아 SHA-256을 모두 검증했습니다.

| 버전 | 패키지 SHA-256 | 결과 |
|---|---|---|
| 5.10.2.4.0 | `ed5ff7d376e0a0f481431037c01bd06728f35dfd55be80332a9e11a1a3070e7d` | PASS |
| 5.10.2.4.1 | `362ab825b2c476f32336b227fa82ef8d8089ace76649edc1e3b0e6da99737355` | PASS |
| 5.10.2.4.3 | `85e4586b637a6a3030eb33c43c79ab4822a7a8a723af82787e8fd1c102715707` | PASS |

## II. 즉시 대상

### 1. 역할별 숨김 BrowserWindow 비용

후보 Source는 역할별 `BrowserWindow`를 재사용하고, 닫힘·Renderer 종료·C Mode 결과/중지 시 Map 삭제와 `destroy()`를 수행합니다. 즉, **정적 Source만으로 누수라고 단정할 수는 없습니다.**

다만 각 창은 `show:false`인데도 `backgroundThrottling:false`입니다. 여러 워커가 동시에 보고를 기다리면 역할 수만큼 숨김 Renderer가 유지되므로, A-6가 1·5·10 역할에서 CPU·RAM·Process·webContents 증가량과 해제 후 복귀를 반드시 측정해야 합니다.

### 2. Renderer의 3중 갱신 경로

`workspace_c_mode.js`는 다음을 동시에 사용합니다.

- C Mode·반복명령 이벤트 기반 갱신
- subtree `MutationObserver`
- `setInterval(refresh, 5000)`

`requestAnimationFrame`으로 같은 Frame의 Render는 합쳐지지만, Interval·Observer·구독의 Handle을 저장하거나 해제하지 않습니다. 즉시 개선 대상은 **Boot 1회 Guard, Interval/Observer/Subscription Teardown, Hidden 상태 Polling 중단, Event 우선·저주기 Health Check 보조**입니다.

### 3. 촘촘한 Browser Polling

후보 Source의 Polling은 무한하지 않고 모두 제한되어 있습니다.

- 문서 준비: 500ms 간격, 최대 30초
- Send Control 탐색: 200ms 간격, 최대 10초
- 새 사용자 메시지 검증: 250ms 간격, 최대 12초
- Dispatch: 최대 5회, definitely-not-sent 때 Reload 후 1초 대기

이는 안정성 측면에서는 합리적이지만, 여러 역할 동시 실행 시 CPU·IPC·DOM Query 비용이 중첩됩니다. A-6는 정상·Slow Load·Input 없음·Timeout별 Poll 횟수와 CPU를 측정해야 합니다.

### 4. Runtime Timer

`c_mode_runtime.cjs`는 Interval 중복을 막고 Idle/Stop에서 `clearInterval()`하므로 기본 Lifecycle은 양호합니다. 다만 Restart 복구용 1.5초 `setTimeout()` Handle은 저장하지 않아 빠른 Restore→Stop에서 한 번의 지연 Tick이 발생할 수 있습니다. Handle 또는 Generation Token을 추가하는 것이 즉시 대상입니다.

### 5. 기존 Worker Shell 전체 Render와 구독 해제

정확 GitHub Source의 `yolla_worker_shell.js`는 그룹·역할·Cycle 목록을 `innerHTML`로 재구축하고, Workspace State 변경 때 전체 `render()`를 호출합니다. Preload는 구독 해제 함수를 반환하지만 Shell은 이를 보관하지 않습니다. 단일 문서 Boot에서는 곧바로 누수가 되지 않지만, 재부팅·재삽입 시 Listener 중복 가능성이 있으므로 Boot Guard와 Teardown Registry가 필요합니다.

## III. 후순위 대상

- A-6 결과가 실제 비용을 증명한 경우에만 역할별 BrowserWindow를 제한된 Pool로 전환
- Prompt 준비·전송 검증을 `executeJavaScript` Polling에서 Preload Event/ACK 계약으로 전환
- Base Workspace의 공식 Render Event가 확정되면 MutationObserver 제거
- 실가동 `5.10.2.3.7` 원문 Source Package를 게시해 `main.js`·`workspace.js` 전체 Line Audit 재실행

## IV. A-4·A-6 결합계약

A-6는 다음 8개 Scenario를 A-4 기준선과 같은 Timestamp/Iteration Key로 결합해야 합니다.

1. Visible/Hidden Idle
2. 역할 1·5·10개 동시 BrowserWindow
3. 모든 `releaseRole` 사유별 해제
4. 동일 역할·서로 다른 역할 반복 열기/닫기
5. 정상·Slow Load·Input 없음·Timeout
6. Event·Mutation Burst
7. Restore 후 1.5초 이내 Stop
8. Workspace Close/Reopen·Mode/Group Switching

수용지표는 절대 임의 숫자가 아니라 다음 구조적 조건입니다.

- Close/Release 유예 후 BrowserWindow·webContents·Process 수가 대응 기준선으로 복귀
- 동일 Batch 3회에서 Process·Listener·Map Entry·Memory가 단조 증가하지 않음
- Renderer 문서당 Interval·Observer·Subscription Set가 정확히 1개
- Unload/Workspace Destroy 이후 Polling 0
- Stop/Idle에서 Runtime Timer 0, 지연 Restore Tick의 상태변경 0

## V. 최종판정

정적감사는 완료됐습니다. 무한 Retry·무한 Polling·Cleanup 부재는 발견되지 않았습니다. 대신 **역할별 숨김 BrowserWindow 비용, 5초 Polling+MutationObserver+Event 중첩, 촘촘한 DOM Polling, 미추적 Restore Timeout, 전체 DOM Render와 미보관 구독해제**를 즉시 계측·개선 대상으로 확정했습니다.

`A5_C_MODE_CYCLE1_STATIC_AUDIT_COMPLETE_A4_A6_HANDOFF_READY`
