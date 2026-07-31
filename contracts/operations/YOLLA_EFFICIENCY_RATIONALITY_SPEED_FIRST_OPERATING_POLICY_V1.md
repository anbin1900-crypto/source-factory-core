# YOLLA 효율성·합리성·속도 최우선 운영정책 V1

## 1. 정책 선언

욜라 프로젝트의 모든 지휘·개발·검증·실행·보고 절차에서 다음 세 가지가 최상위 운영가치다.

1. **효율성**
2. **합리성**
3. **속도**

모든 하위 정책, 감사, 승인, 보고, Gate, 역할분리, 인수인계 절차는 위 세 가지 가치에 실제로 기여하는 경우에만 유지한다.

다음과 같은 절차는 기본적으로 제거한다.

- 실제 작업보다 오래 걸리는 승인과 보고
- 담당자가 직접 고칠 수 있는 문제를 다른 워커에게 넘기는 절차
- 같은 사실을 여러 워커가 순차적으로 재확인하는 절차
- 실행 전에 반복되는 독립감사·중재·재판정
- 실패할 때마다 새 실행권을 기다리는 절차
- 로컬·격리 Staging 작업에 대한 인위적인 1회 실행 제한
- 사용자에게 워커별 지시를 순차 전달하도록 요구하는 운영방식

이 정책은 감사 확대, 보고 확대, 승인 확대보다 우선한다.

---

## 2. 최상위 판단기준

새로운 절차나 Gate를 추가하려면 다음 질문에 답해야 한다.

1. 이 절차가 실제 완료시간을 줄이는가?
2. 이 절차가 중복작업을 제거하는가?
3. 이 절차가 담당자의 문제 해결을 더 빠르게 만드는가?
4. 이 절차가 사용자 개입 횟수를 줄이는가?
5. 이 절차가 실패 후 복구와 재시도를 더 빠르게 만드는가?

위 질문에 명확한 긍정 답변이 없으면 해당 절차는 기본적으로 채택하지 않는다.

```text
POLICY_PRIORITY=
EFFICIENCY
THEN RATIONALITY
THEN SPEED

DEFAULT_RESPONSE_TO_NON_VALUE_ADDING_PROCESS=
REMOVE_OR_MAKE_NON_BLOCKING
```

---

## 3. 기본 실행모델

모든 명확한 기술작업의 기본 모델은 다음과 같다.

```text
ONE_OWNER_END_TO_END
```

한 명의 담당 워커가 다음을 끝까지 수행한다.

```text
문제 확인
→ Source·환경 분석
→ 수정
→ 실행
→ 실패 분석
→ 직접 교정
→ 재실행
→ 필요 시 다른 방법 적용
→ 성공 또는 실제 외부 차단 확인
→ 최종 보고
```

다른 워커는 담당자가 해결할 수 있는 문제에 중간 승인자나 전달자로 끼어들지 않는다.

### 금지되는 순환구조

```text
담당 워커 실행
→ 실패
→ 감사 워커
→ 중재 워커
→ 재판정 워커
→ 원래 담당 워커에게 복귀
→ 교정
```

자신이 고칠 수 있는 실패를 다른 워커에게 넘기는 것은 운영 결함으로 본다.

---

## 4. 실행권 정책

작업 배정에는 해당 작업범위 안의 실행권이 포함된다.

```text
ASSIGNMENT_INCLUDES_EXECUTION_AUTHORITY=true
SEPARATE_EXECUTION_AUTHORIZATION_REQUIRED=false
```

담당 워커는 배정된 범위에서 다음을 수행할 수 있다.

- Source 수정
- 설정 수정
- Fixture 수정
- Build·Parse·Test 실행
- 로컬·격리 Staging 실행
- 재시작
- Rollback
- 재실행
- 대체 구현 적용
- 최종 결과 게시

매 시도마다 별도의 실행권을 요청하거나 기다리지 않는다.

별도 사용자 결정을 요구할 수 있는 것은 원래 Assignment 범위를 벗어난 새로운 외부효과뿐이다.

---

## 5. 재시도 정책

로컬 개발, Build, Parse, Fixture, 테스트, 설치시험, 격리 Staging 작업에는 원칙적으로 1회 실행 제한을 두지 않는다.

```text
ONE_RUN_LIMIT=false
RETRY_UNTIL_PASS_OR_PROVEN_EXTERNAL_BLOCKER=true
```

실패하면 담당 워커가 직접 다음 절차를 수행한다.

```text
실패 로그 확인
→ 원인 추정
→ 수정
→ 재실행
```

동일한 오류가 반복되면 같은 명령만 무의미하게 반복하지 않는다.

```text
SAME_FAILURE_SIGNATURE_REPEAT_LIMIT=2
```

동일 오류가 두 번 반복되면 다음 중 하나 이상을 변경한다.

- Source
- 명령
- 실행순서
- 경로
- Runtime
- 환경
- 도구
- 구현방법

그 후 다시 실행한다.

가능한 방법을 충분히 시도하지 않은 상태에서 `BLOCKED`로 종결하지 않는다.

---

## 6. Terminal 정책

중간 실패는 Terminal이 아니다.

```text
INTERMEDIATE_FAILURE=ATTEMPT_LOG
TERMINAL=PASS_OR_EXACT_EXTERNAL_BLOCKER
```

### PASS

작업목표가 실제로 달성됐을 때 게시한다.

### BLOCKED

다음 조건을 모두 만족할 때만 게시한다.

- 담당자의 소유범위 안에서 가능한 교정과 재실행을 수행함
- 동일 방법뿐 아니라 합리적인 대체방법도 검토·시도함
- 남은 원인이 계정, 권한, 물리적 장치, 외부 서비스 장애 등 담당자 밖의 조건임
- 정확한 실패 증거와 필요한 외부 조치가 특정됨

단순히 첫 번째 실행이 실패했다는 이유로 `BLOCKED`를 게시하지 않는다.

---

## 7. 감사·중재·재판정 정책

감사, 중재, 재판정은 기본 Gate가 아니다.

```text
MID_PROCESS_AUDIT=NONE
INDEPENDENT_REVIEW=NON_BLOCKING
ADVISORY_TERMINAL=NON_BLOCKING
```

다른 워커의 검토는 다음 목적으로만 사용할 수 있다.

- 담당자가 여러 방법을 시도했으나 원인이 불명확한 경우
- 서로 다른 구현안 중 선택이 필요한 경우
- 다른 전문영역의 지식이 실제로 필요한 경우
- 동일 문제가 반복해서 재발하는 경우

자문 워커의 보고가 늦어져도 담당 워커의 실행과 교정을 막지 않는다.

최종수용은 별도 다단계 결재가 아니라 실제 결과와 기능동작으로 판단한다.

---

## 8. Rollback 중심 정책

복구 가능한 로컬·격리 작업은 사전 승인보다 실행과 Rollback을 우선한다.

```text
DEFAULT_REVERSIBLE_WORK_MODE=
EXECUTE
→ VERIFY
→ KEEP_ON_SUCCESS
→ ROLLBACK_ON_FAILURE
→ FIX
→ RETRY
```

Rollback 기능은 감사 Gate가 아니라 실행기의 기본 기능이다.

가능하면 실행 전 상태를 자동 기록하고 실패 시 역순 복구한다. 그러나 Snapshot·Receipt 작성이 실제 실행보다 복잡해져서는 안 된다.

복구가 불가능하거나 원래 Assignment에 포함되지 않은 외부효과만 별도 사용자 결정을 요구한다.

예:

- 외부 고객 대상 발송
- 결제·정산
- 공개 Production 배포
- 복구본 없는 원본 삭제
- 비밀정보 외부 게시

---

## 9. 다중 워커 운영정책

워커 수를 늘리는 목적은 벽시계 시간을 줄이는 것이다.

10명의 워커를 사용하면서 1명보다 오래 걸리는 구조를 허용하지 않는다.

### 병렬화가 적절한 경우

- 작업이 서로 독립적인 여러 파일·모듈로 나뉨
- 주 작업과 Fixture·호환성·대체안 준비를 동시에 수행할 수 있음
- 서로 다른 분야의 작업을 동시에 진행할 수 있음
- 여러 독립 해결방법이 필요한 반복 실패 난제임

### 병렬화가 부적절한 경우

- 같은 결과를 10명이 순서대로 승인함
- 앞 워커의 보고가 와야 다음 워커가 시작함
- 동일 Source를 여러 워커가 동시에 수정함
- 한 명이 직접 고칠 수 있는 오류를 여러 그룹으로 순환시킴

---

## 10. Cycle Batch 정책

PC Agent가 전체 자동화를 완성하기 전까지 사용자는 모든 활성 워커에게 한 번에 지시할 수 있어야 한다.

```text
DIRECTIVE_DISPATCH_MODE=CYCLE_BATCH_PARALLEL
SEQUENTIAL_MANUAL_WORKER_DISPATCH=false
```

금지되는 방식:

```text
A-1 완료
→ A-2 지시
→ A-2 완료
→ A-3 지시
```

필수 방식:

```text
CYCLE_N
→ 전체 활성 워커에게 독립 지시 일괄배포
→ 각 워커 병렬작업
→ 결과 일괄수집
→ 다음 Cycle 전체 일괄배포
```

의존성이 있는 워커도 같은 Cycle에서 준비 가능한 작업을 수행한다.

- Schema
- Fixture
- Validator
- Adapter
- Expected Receipt
- Activation Condition
- 대체방법
- 후속 실행 준비

단순 대기만 하는 워커를 만들지 않는다.

---

## 11. Swarm 발동정책

B·C 12-Worker Swarm은 기본 운영방식이 아니라 예외적인 문제해결 수단이다.

다음 조건에서만 발동한다.

- 한 명의 담당자가 합리적인 대체방법까지 시도했지만 해결하지 못함
- Root Cause가 불명확함
- 여러 해결안의 비교가 실제로 필요함
- 서로 독립적인 여러 방법을 병렬로 검증할 가치가 있음

Swarm에서도 다음을 금지한다.

- 12명이 같은 Source를 동시에 수정
- 12명의 Terminal을 모두 기다린 뒤 실행
- 다수결로 기술적 PASS 선언
- 모든 자문을 필수 Gate로 사용

Swarm 결과는 담당 워커 또는 단일 통합자가 즉시 소비해 해결에 사용한다.

---

## 12. 보고정책

보고는 작업을 증명하기 위한 최소 수준으로 유지한다.

```text
REPORTING_MINIMUM_REQUIRED=true
REPORTING_MUST_NOT_DELAY_EXECUTION=true
```

중간 시도마다 PR Comment·Commit·Pointer를 반복 생성하지 않는다.

작업 중에는 간단한 Attempt Log를 사용하고 최종 보고에 다음을 묶는다.

- 시도 횟수
- 주요 실패 원인
- 적용한 교정
- 사용한 대체방법
- 최종 성공방법
- 최종 상태
- 실제 외부 차단이 있다면 정확한 차단요인

GitHub 원장은 최종 결과와 재사용 가치가 있는 핵심 증거 중심으로 유지한다.

---

## 13. 성과측정 기준

워커 수, 보고서 수, 감사 횟수는 성과가 아니다.

다음 수치를 성과로 본다.

- 실제 완료까지 걸린 벽시계 시간
- 사용자 수동 개입 횟수
- Worker 간 Handoff 횟수
- 실패 후 교정까지 걸린 시간
- 동일 오류 반복 횟수
- 실제 기능 완료 건수
- Rollback 성공률
- 다음 Cycle 준비시간

```text
PRIMARY_METRIC=WALL_CLOCK_TIME_TO_WORKING_RESULT
SECONDARY_METRIC=USER_ACTION_COUNT
TERTIARY_METRIC=HANDOFF_COUNT
```

---

## 14. T-1·S-2 적용

### T-1

T-1은 PC Agent 설치·실행 임무의 단일 End-to-End Owner다.

T-1은 배정범위 안에서 설치, 수정, 재설치, 재시작, 교정, 대체방법 적용, Rollback, 재실행을 별도 승인 없이 계속한다.

첫 실패를 Terminal로 종결하지 않는다.

### S-2

S-2는 PC Agent 설치 이후 다음을 통합한다.

- Source Factory Core
- API
- Queue
- Claim
- Worker Dispatch
- 결과수집
- 다음 Cycle 자동생성

S-2는 Worker별 순차 전달구조를 만들지 않는다. 모든 독립 작업은 Cycle Batch로 한 번에 배포한다.

---

## 15. 정책 충돌 시 우선순위

다른 정책이 다음 결과를 초래하면 이 정책을 우선 적용한다.

- 불필요한 직렬 Gate
- 중복감사
- 반복 승인
- 담당자 교정권 제한
- 1회 실행 후 강제중단
- 사용자 Relay 증가
- 작업보다 긴 보고절차
- 워커 수 증가에 따른 처리시간 증가

정책 충돌 시 판단은 다음과 같다.

```text
1. 사용자의 최신 명시적 지시
2. 효율성·합리성·속도 최우선 정책
3. 작업별 기술계약
4. 기타 감사·보고·승인 정책
```

플랫폼 자체 제한이나 사용자가 배정하지 않은 새로운 비가역 외부효과는 이 정책으로 임의 확대하지 않는다.

---

## 16. 최종 운영명령

```text
일을 맡긴 순간 실행권도 함께 준다.

담당 워커는 자신이 고칠 수 있는 실패를 다른 워커에게 넘기지 않는다.

실패하면 직접 고쳐 다시 실행한다.

같은 방법이 안 되면 다른 방법을 찾는다.

중간 실패를 Terminal로 만들지 않는다.

감사와 자문은 작업을 막지 않는다.

여러 워커에게 줄 수 있는 독립 작업은 한 Cycle에 동시에 지시한다.

효율성·합리성·속도에 기여하지 않는 절차는 제거한다.
```

---

## 17. 공식 상태

```text
POLICY_ID=YOLLA_EFFICIENCY_RATIONALITY_SPEED_FIRST_OPERATING_POLICY_V1
STATUS=ACTIVE_SUPREME_OPERATING_POLICY
DEFAULT_OWNER_MODEL=ONE_OWNER_END_TO_END
EXECUTION_AUTHORITY=INHERENT_IN_ASSIGNMENT_SCOPE
RETRY_POLICY=RETRY_UNTIL_PASS_OR_PROVEN_EXTERNAL_BLOCKER
MID_PROCESS_AUDIT=NONE
ADVISORY_WORKERS=NON_BLOCKING
CYCLE_BATCH_PARALLEL=true
SEQUENTIAL_MANUAL_DISPATCH=false
PRIMARY_METRIC=WALL_CLOCK_TIME_TO_WORKING_RESULT
```
