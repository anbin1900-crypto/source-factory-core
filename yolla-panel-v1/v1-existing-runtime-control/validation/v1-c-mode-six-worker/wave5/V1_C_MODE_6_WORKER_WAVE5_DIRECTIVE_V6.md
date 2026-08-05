# V1 C Mode Six-Worker Wave 5 Directive V6

```text
CONTROL_ID=V1-C-MODE-6W-VALIDATION-CYCLE-002
WAVE_ID=V1-C-MODE-6W-WAVE-005
COMMANDER=V-1
DISPATCH_MODE=PARALLEL_FINAL_INTEGRATION
CURRENT_PROGRESS=88%
TARGET_CANDIDATE_VERSION=5.10.2.4.2-rc1
PRODUCTION=false
READY=false
MERGE=false
AUTO_TEST_WRITE_COUNT=0
```

## 공통 실행규칙

각 워커는 자신의 PR에 게시된 최신 Wave 5 지시를 읽고 소유범위를 End-to-End로 수행한다. 첫 실패는 Terminal이 아니며 직접 교정·재시험한다. 결과 Commit과 정확히 상관된 Terminal 댓글을 모두 게시해야 보고완료다. Target-PC Live Receipt 없이 Live PASS·LTS·Ready·Merge를 주장하지 않는다.

필수 Terminal 형식:

```text
PANEL | ROLE={ROLE} | WAVE=V1-C-MODE-6W-WAVE-005 | COMMAND_ID={COMMAND_ID} | STATUS=END | RESULT_COMMIT={40_HEX}
```

## AUTOMATION-C-W1 — Canonical Candidate Manifest·Source Inventory

```text
WORKER_PR=#59
COMMAND_ID=C6W-W5-W1-CANONICAL-CANDIDATE-MANIFEST
INPUT_W2_HEAD=1be5e02112cc16851b6d19e4fdf8a34b2ee9749f
INPUT_W3_HEAD=4ffa247184900467774aa8c87c1f4f12053cfac2
INPUT_W4_HEAD=5b6f204145a1275ae9fcaab21e9be2725c8cb355
INPUT_W5_HEAD=77c5d465d2eaaff5a26ab62f7b31f06312fbe88f
```

Cross-head Node 실행 책임을 W5로 이동한다. W1은 실행 컨테이너 Mount를 다시 시도하지 말고, 정확한 파일 경로·Blob/Commit·SHA-256·대상 Release 경로·적용순서·충돌정책·Rollback 순서를 포함하는 `5.10.2.4.2-rc1` Canonical Candidate Manifest와 Source Inventory를 Commit하라. 기존 상태머신은 Oracle로 유지한다. Manifest는 W5 One-click Package가 기계적으로 소비할 수 있어야 하며 실행 PASS는 주장하지 않는다.

Required Terminal:

```text
PANEL | ROLE=AUTOMATION-C-W1 | WAVE=V1-C-MODE-6W-WAVE-005 | COMMAND_ID=C6W-W5-W1-CANONICAL-CANDIDATE-MANIFEST | STATUS=END | RESULT_COMMIT={40_HEX}
```

## AUTOMATION-C-W2 — Runtime Report Watcher Integration Adapter

```text
WORKER_PR=#60
COMMAND_ID=C6W-W5-W2-REPORT-WATCHER-RUNTIME-ADAPTER
INPUT_HEAD=1be5e02112cc16851b6d19e4fdf8a34b2ee9749f
```

검증용 Parser를 실제 C Runtime이 호출할 수 있는 비파괴 Adapter로 정리하라. Directive Discovery·C_RESULT·REPEAT_RESULT·Report Completeness Gate를 하나의 공개 API로 제공하고, `Result Commit만 존재`, `Terminal만 존재`, `정확한 Commit+Terminal`, `최신 지시 존재`, `END`를 Fail-closed로 판정하라. Pagination·일시 오류 5회·댓글 순서 단조성·Post ID 자동취득·연속 미보고 Reset을 시험하고 W1 Manifest와 W5 Package가 소비할 Export Manifest를 Commit하라.

Required Terminal:

```text
PANEL | ROLE=AUTOMATION-C-W2 | WAVE=V1-C-MODE-6W-WAVE-005 | COMMAND_ID=C6W-W5-W2-REPORT-WATCHER-RUNTIME-ADAPTER | STATUS=END | RESULT_COMMIT={40_HEX}
```

## AUTOMATION-C-W3 — Actual Runtime UI Truth Patch

```text
WORKER_PR=#61
COMMAND_ID=C6W-W5-W3-ACTUAL-UI-TRUTH-PATCH
INPUT_HEAD=4ffa247184900467774aa8c87c1f4f12053cfac2
```

Fixture 전용 검증에서 끝내지 말고 실제 `workspace_c_mode.js`·CSS·Bridge 후보 경로에 Report Truth 상태를 결속한 비파괴 Patch를 작성하라. 화면은 C·명령·완료대기·보고누락·오류·END·쉬는 중을 분리하고, 과거 A/E 상태를 현재 작업 수에 포함하지 않아야 한다. C와 명령이 모두 비활성이면 작업 중 0을 보장한다. DOM/Render Test와 Collector Schema를 같은 Patch에 결속하되 Target-PC Live PASS는 보류한다.

Required Terminal:

```text
PANEL | ROLE=AUTOMATION-C-W3 | WAVE=V1-C-MODE-6W-WAVE-005 | COMMAND_ID=C6W-W5-W3-ACTUAL-UI-TRUTH-PATCH | STATUS=END | RESULT_COMMIT={40_HEX}
```

## AUTOMATION-C-W4 — Actual Repeat Bridge Release Adapter

```text
WORKER_PR=#62
COMMAND_ID=C6W-W5-W4-ACTUAL-REPEAT-RELEASE-ADAPTER
INPUT_HEAD=5b6f204145a1275ae9fcaab21e9be2725c8cb355
```

120회 Soak에서 교정된 슬롯별 Runtime을 실제 명령 팝업·Bridge·상태저장 후보 경로에 적용할 수 있는 Release Adapter로 정리하라. 사용자 명령 Byte 보존, EVERY_X_MINUTES, AFTER_COMPLETION, ROLE+COMMAND_ID+DISPATCH_ID, END 슬롯 자동정지, 워커별 활성명령 1개, C Queue와 Repeat Queue 비간섭, 재시작 복구를 보장하라. 6슬롯 200회 이상 재Soak하고 중복·취소·Receipt 유실·대기 Queue 증가가 모두 0인 Export Manifest를 Commit하라.

Required Terminal:

```text
PANEL | ROLE=AUTOMATION-C-W4 | WAVE=V1-C-MODE-6W-WAVE-005 | COMMAND_ID=C6W-W5-W4-ACTUAL-REPEAT-RELEASE-ADAPTER | STATUS=END | RESULT_COMMIT={40_HEX}
```

## AUTOMATION-C-W5 — One Owner Final Candidate Build·Installer·Artifact

```text
WORKER_PR=#63
COMMAND_ID=C6W-W5-W5-FINAL-CANDIDATE-BUILD-INSTALLER
TARGET_VERSION=5.10.2.4.2-rc1
```

W5가 최종 통합 실행 Owner다. W1 Manifest, W2 Report Adapter, W3 UI Patch, W4 Repeat Adapter를 정확한 Head로 결속하고 기존 `5.10.2.4.1` Source Supplement 위에 비파괴 Candidate를 구성하라. 가능한 환경에서 Node·정적·Package Test를 직접 실행하고 실패는 수정·재시험한다. 설치 BAT, Source ZIP, Payload Manifest, Rollback, One-click Target-PC Acceptance Runner를 생성해 Google Drive에 업로드하고 File ID·크기·SHA-256·Readback을 Commit하라. 현재 로그인 Profile·Runtime Log·Work-Control JSONL을 보존하고 A/E 실행경로를 되살리지 않는다. Windows Live Receipt가 없으면 `PACKAGE_PASS_TARGET_PC_PENDING`으로 정확히 종결한다.

Required Terminal:

```text
PANEL | ROLE=AUTOMATION-C-W5 | WAVE=V1-C-MODE-6W-WAVE-005 | COMMAND_ID=C6W-W5-W5-FINAL-CANDIDATE-BUILD-INSTALLER | STATUS=END | RESULT_COMMIT={40_HEX}
```

## AUTOMATION-C-W6 — Wave 4 Final Re-audit·Wave 5 Independent Acceptance

```text
WORKER_PR=#64
COMMAND_ID=C6W-W5-W6-FINAL-OFFLINE-INDEPENDENT-ACCEPTANCE
WAVE4_FINAL_HEADS=W1:a13a4466f530ab7bace36bba5258974978d4293f,W2:1be5e02112cc16851b6d19e4fdf8a34b2ee9749f,W3:4ffa247184900467774aa8c87c1f4f12053cfac2,W4:5b6f204145a1275ae9fcaab21e9be2725c8cb355,W5:77c5d465d2eaaff5a26ab62f7b31f06312fbe88f
```

먼저 Wave 4 최종 댓글이 모두 게시된 상태를 재감사해 `6/6 보고완료`, W2·W6 연속 미보고 Reset, 교체대상 0을 확정하라. 이어 W1~W5 Wave 5 산출물을 독립 검증한다. malformed·상관불일치·stale·duplicate·순서역전·Retry 소진·Restart·Log Loss Fixture를 검증하고, W5 Installer·Source Artifact의 SHA-256·Manifest·A/E 제거·로그·Profile 보존을 감사하라. 구현 Source 직접 수정은 금지한다. Target-PC·6워커×3라운드는 실제 Receipt 전까지 정확한 외부 차단으로 유지한다.

Required Terminal:

```text
PANEL | ROLE=AUTOMATION-C-W6 | WAVE=V1-C-MODE-6W-WAVE-005 | COMMAND_ID=C6W-W5-W6-FINAL-OFFLINE-INDEPENDENT-ACCEPTANCE | STATUS=END | RESULT_COMMIT={40_HEX}
```

## Wave 5 수용조건

```text
VALID_CORRELATED_REPORTS=6_OF_6
CANONICAL_CANDIDATE_MANIFEST=PASS
REPORT_WATCHER_RUNTIME_ADAPTER=PASS
ACTUAL_UI_TRUTH_PATCH=PASS
ACTUAL_REPEAT_RELEASE_ADAPTER=PASS
FINAL_INSTALLER_AND_SOURCE_ARTIFACT=PASS_OR_EXACT_EXTERNAL_BLOCKER
INDEPENDENT_OFFLINE_ACCEPTANCE=PASS_OR_EXACT_TARGET_PC_BLOCKER
DUPLICATE_DISPATCH_COUNT=0
PREVIOUS_COMMAND_CANCEL_COUNT=0
LOST_WORK_CONTROL_EVENT_COUNT=0
A_E_EXECUTION_REINTRODUCTION_COUNT=0
AUTO_TEST_WRITE_COUNT=0
TARGET_PC_PASS=PENDING
```
