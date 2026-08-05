# AUTOMATION-C-W3 Directive V2

```text
CONTROL_ID=V1-C-MODE-6W-VALIDATION-CYCLE-002
WORKER_ID=AUTOMATION-C-W3
CONTROL_PR=#17
BRANCH=worker/automation-c-w3-ui-truth-v2
OWNED_PATHS=validation/v1-c-mode-six-worker/workers/w3/**,workspace_c_mode.js,workspace_c_mode.css
REQUIRED_TERMINAL=C6W3_UI_STATE_TRUTH_AND_MODE_SEPARATION_PASS_OR_EXACT_BLOCKER
```

## Mission

패널 UI의 현재상태 정확성과 C 모드·명령 실행모드 분리를 One Owner End-to-End로 검증하고 직접 교정한다.

```text
C·명령 모두 비활성 → 작업중 0
과거 A/E RUNNING·RESULT_WAITING·RETRY_READY 제외
그룹명 옆 C 버튼
상단 명령 실행 팝업
전체·C 실행·명령 실행·오류 집계 분리
쉬는 중·C 실행·명령 실행·오류 라벨 정확성
그룹 C 설정·시작·정지·재개 UI
팝업 대상 슬롯·조건·명령 원문 표시
대상 PC 화면 증거
```

실패하면 UI Source·CSS·Fixture·Test를 직접 수정하고 동일 시험을 재실행한다.

## Required Result

```text
V1_C_MODE_6_WORKER_RESULT_V2
PANEL | ROLE=AUTOMATION-C-W3 | STATUS={REPORTED|END}
```

Production·Ready·Merge·AUTO_TEST 쓰기는 금지한다.
