# C Mode Wave 6 Review and Wave 7 Directive V1

```text
CONTROL_ID=V1-C-MODE-6W-VALIDATION-CYCLE-002
REVIEWED_WAVE=V1-C-MODE-6W-WAVE-006
NEXT_WAVE=V1-C-MODE-6W-WAVE-007
COMMANDER=V-1
MODE=POINTER_RELAY_RESULT_KEY
NEXT_OBJECTIVE=SINGLE_REGISTRY_AUTHORITY_AND_RUNTIME_CONVERGENCE
TARGET_CANDIDATE_VERSION=5.10.2.4.2-rc3
EXISTING_VALIDATION_SYSTEM=PRESERVED_ACTIVE
PRODUCTION=false
READY=false
MERGE=false
AUTO_TEST_WRITE_COUNT=0
```

## 1. Wave 6 결과검토

Wave 6에는 두 개의 Registry 계열이 게시되어 단일 권위가 깨졌다.

```text
SUPERSEDED_REGISTRY_COMMENT=5193445434
LATEST_WAVE6_REGISTRY_COMMENT=5193471047
DUPLICATE_WAVE_REGISTRY_FINDING=CONFIRMED
```

최신 Wave 6 Registry `5193471047` 기준 정확 RESULT_KEY 보고는 0/6이다. 다만 먼저 게시된 Registry 계열을 수행한 실질 산출물은 폐기하지 않고 Wave 7 입력으로 재사용한다.

```text
W1_RESULT_COMMENT=5193518682
W1_RESULT_KEY=519342314700
W1_RESULT_COMMIT=b597692983120f1d5bbd8c2d1820150efa21b705
W1_TECHNICAL_RESULT=PASS_16_OF_16
W1_LATEST_REGISTRY_CORRELATION=INVALID_SUPERSEDED_REGISTRY

W2_RESULT_COMMENT=MISSING
W2_HEAD=1be5e02112cc16851b6d19e4fdf8a34b2ee9749f

W3_RESULT_COMMENT=MISSING
W3_HEAD=63147181754dc7528a2c822b28980367a1ea0fc0

W4_RESULT_COMMENT=MISSING
W4_HEAD=25f5ffd39d2ce73110a7f8479c6ebd4f36edd0b6

W5_RESULT_COMMENT=5193510906
W5_RESULT_KEY=519343566200
W5_RESULT_COMMIT=e04cba11e0e008ee04abbeaabc1728477f7e387f
W5_TECHNICAL_RESULT=EXACT_DEPENDENCY_BLOCKER
W5_LATEST_REGISTRY_CORRELATION=INVALID_SUPERSEDED_REGISTRY

W6_RESULT_COMMENT=5193508667
W6_RESULT_KEY=519344076100
W6_RESULT_COMMIT=cc55a245305cf7d19bab33267fc2156c5fc30fd2
W6_TECHNICAL_RESULT=OFFLINE_PASS_TARGET_PC_BLOCKED
W6_LATEST_REGISTRY_CORRELATION=INVALID_SUPERSEDED_REGISTRY
```

판정:

```text
LATEST_REGISTRY_VALID_REPORTS=0_OF_6
SUBSTANTIVE_REUSABLE_RESULTS=3_OF_6
MISSING_IMPLEMENTATION_RESULTS=W2,W3,W4
REPLACEMENT_REQUIRED=NONE
CURRENT_PROGRESS=90%
```

## 2. Wave 7 단일 권위 규칙

Wave 7부터 Control PR에는 같은 `WAVE_ID`의 READY Registry를 정확히 하나만 게시한다.

```text
REGISTRY_SCHEMA=C_MODE_WAVE_V2
REGISTRY_SEQUENCE=7
PREVIOUS_REGISTRY_COMMENT=5193471047
SUPERSEDES_REGISTRY_COMMENTS=5193445434,5193471047
HIGHEST_VALID_REGISTRY_SEQUENCE_WINS=true
SAME_SEQUENCE_DUPLICATE=FAIL_CLOSED
SAME_WAVE_MULTIPLE_READY=FAIL_CLOSED
COMMENT_EDIT_AFTER_READY=false
ALL_ROWS_VALID_BEFORE_ANY_DISPATCH=true
```

Wave 6의 실질 Source·Test·Finding은 입력으로 재사용하지만, Wave 7 보고는 새 Directive Comment에서 파생한 새 RESULT_KEY로만 인정한다.

## 3. Wave 7 워커별 작업

### W1 — Registry Authority Normalization·Export

기존 PASS Commit `b597692983120f1d5bbd8c2d1820150efa21b705`를 재사용한다. 같은 구현을 다시 만들지 말고 `REGISTRY_SEQUENCE`, 중복 READY Registry 차단, Supersedes Chain, 최신 Registry Snapshot 복구를 추가한다. W2·W5가 소비할 Export Manifest와 정확한 Source 경로·SHA-256을 Commit한다. 기존 20분·90분·4회·공정률 상태머신은 회귀 유지한다.

### W2 — Result Watcher·Commander Result Collector

Wave 6 미보고를 먼저 기록한다. W1 Export를 사용해 최신 권위 Registry의 Directive Comment 이후 댓글만 증분 조회하고, 정확 RESULT_KEY를 0=MISSING·1=REPORTED·2+=DUPLICATE로 판정한다. Superseded Registry 결과는 `HISTORICAL_NOT_CURRENT`로 보존하되 현재 완료로 계산하지 않는다. 실제 RESULT_COMMENT 번호를 수집하는 `C_MODE_WAVE_RESULT_V1` Builder와 Pagination·5회 Retry·Restart Test를 Commit한다.

### W3 — UI Authority Truth

Wave 6 미보고를 먼저 기록한다. UI에서 `현재 Registry 결과`, `과거 Registry 결과`, `미보고`, `중복`, `오류`, `END`, `쉬는 중`을 분리한다. 커맨더 화면에는 RESULT_KEY보다 실제 RESULT_COMMENT를 우선 표시한다. C와 명령모드가 비활성이면 작업 중 0을 유지하고 과거 A/E 상태를 제외한다. DOM/Render Test와 대상 PC Collector를 갱신한다.

### W4 — C·Repeat Namespace Non-interference

Wave 6 미보고를 먼저 기록한다. C Registry Sequence·RESULT_KEY와 반복명령 ROLE+COMMAND_ID+DISPATCH_ID가 서로 완료를 발생시키지 않도록 Runtime Adapter를 완성한다. Superseded Registry 결과, 현재 Registry 결과, 반복명령 결과를 혼합한 6슬롯 300회 이상 Soak에서 중복·상호취소·END 재전송·Receipt 유실·대기 Queue 증가를 모두 0으로 검증한다.

### W5 — Candidate Assembler·Nondependent Package Preparation

Wave 6 Blocker Evidence `e04cba11...`를 재사용한다. W1~W4 결과가 오기 전에도 수행 가능한 Candidate Assembler, Input Manifest Validator, 설치 BAT·Rollback·One-click Runner의 비의존 부분을 완성한다. W1~W4 Wave 7 입력이 모두 확인되면 `5.10.2.4.2-rc3`를 조립·오프라인 검증·Artifact 생성한다. 입력이 남으면 첫 실패를 Terminal로 만들지 말고 비의존 작업을 완료한 뒤 정확한 잔여 의존성만 보고한다. 기존 로그·Profile·C/Repeat State 보존과 A/E 재도입 0을 유지한다.

### W6 — Duplicate Registry Failure Injection·Independent Audit

구현 Source 직접 수정은 금지한다. Wave 6의 중복 Registry 사고를 Fixture로 고정하고 Highest Sequence, Same Sequence Duplicate, Stale Registry Result, Wrong Result Key, Partial Dispatch, Restart 중 Registry Roll-forward를 독립 검증한다. W1~W5 Wave 7 결과가 게시되면 상관관계와 기존 검증 Gate 보존 여부를 재감사한다. Target PC·6워커×3 WAVE·Restart·Log Loss Zero는 실제 Receipt 전까지 정확한 차단으로 유지한다.

## 4. 공통 Terminal

각 워커는 자신의 PR에 결과 또는 미수행 사유를 게시하고 댓글 마지막 줄에 자신의 새 Wave 7 RESULT_KEY Marker를 정확히 기록한다.

```text
C_RESULT|RESULT_KEY={WAVE7_RESULT_KEY}|ROLE={ROLE}|OUTCOME={PASS|FAIL|BLOCKED|NO_WORK}|STATUS=END|RESULT_COMMIT={40_HEX_OR_NONE}
```

중간 실패는 Attempt Log이며, 담당 범위에서 직접 수정·재시험한다. 기존 검증체계는 폐기하지 않는다. Target PC 증거 없이 Live PASS·LTS·Ready·Merge를 주장하지 않는다.
