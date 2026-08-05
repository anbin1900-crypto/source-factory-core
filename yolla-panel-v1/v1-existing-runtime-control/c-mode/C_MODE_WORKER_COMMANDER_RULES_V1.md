# YOLLA V-1 C 모드 워커·커맨더 공통규칙 V1

```text
RULE_ID=YOLLA-V1-C-MODE-WORKER-COMMANDER-RULES-V1-20260805-001
OWNER=V-1
TARGET_RUNTIME=YOLLA_WORKSPACE_EXISTING_RUNTIME
STATUS=PUBLISHED_FOR_IMPLEMENTATION
```

## 1. 시작

사용자는 커맨더와 목표·범위·금지사항·작업계획의 논의를 마친 뒤 `작업시작`을 누른다. C 모드는 그때부터 시작하며, 커맨더와 모든 활성 워커는 GitHub에 `START`를 한 번 게시한다.

```text
PANEL | ROLE={ROLE} | STATUS=START
```

START는 결과보고와 WAVE 완료 수에 포함하지 않는다.

## 2. 권위와 최소판정

공식 상태는 GitHub 게시물이다. 채팅창은 초기 연결과 지시 전달에만 사용하며, C 모드는 채팅 내용을 의미적으로 판정하지 않는다.

패널이 확정하는 값은 다음뿐이다.

```text
새 결과게시물 존재 여부
END 존재 여부
커맨더 WAVE 보고 존재 여부
공정률
경과시간
연속 미보고 요구 실패 횟수
```

`작업중`과 `오류`는 화면만으로 확정하지 않는다. 결과게시물이 없으면 `미보고`로만 처리한다.

## 3. 커맨더의 WAVE 게시

커맨더는 다음 WAVE의 모든 워커별 작업을 하나의 GitHub 게시물에 일괄 게시한다. 앞 워커의 완료를 기다리며 한 명씩 지시하지 않는다.

각 작업은 다음 한 줄 형식을 사용한다.

```text
TASK | WORKER={ROLE} | TASK_ID={TASK_ID} | TYPE={CODE|TEST|RESEARCH|DOCUMENT|OTHER} | EXPECTED_MINUTES={정수|UNKNOWN}
```

커맨더 게시물 번호가 `WAVE_POST_ID`다. 커맨더는 모든 WAVE 또는 20분 부분진행 판단 때 현재 공정률을 함께 게시한다.

```text
PANEL | NORMAL={NORMAL_COUNT} | MISSING={MISSING_COUNT} | COMPLETED={TOTAL_COMPLETED_TASK_COUNT} | PROGRESS={PROGRESS_PERCENT} | END={0|1}
```

완료 작업 수가 증가했는데 공정률이 상승하지 않으면 `PROGRESS_INTEGRITY_ERROR`다. 커맨더는 계산 또는 작업계획을 교정해 다시 게시한다.

## 4. 워커의 절대 보고의무

워커는 성공·실패·차단·부분수행·미수행과 관계없이 결과 또는 미수행 사유를 GitHub에 게시한다. 이전 배정의 보고가 누락됐다면 현재 WAVE 작업 전에 먼저 보완한다.

일반 보고 마지막 줄:

```text
PANEL | WAVE={WAVE_POST_ID} | STATUS=REPORTED
```

현재 WAVE와 최신 유효 지시에 미완료 작업이 없을 때:

```text
PANEL | WAVE={WAVE_POST_ID} | STATUS=END
```

패널은 GitHub 메타데이터에서 실제 결과게시물 번호를 취득해 다음처럼 표시한다.

```text
작업완료 | 결과게시물={RESULT_POST_ID}
END | 결과게시물={RESULT_POST_ID}
```

## 5. WAVE 진행

```text
T+0분
→ 모든 대상 워커를 같은 Batch에 등록
→ 앞 워커의 완료를 기다리지 않고 전송
```

20분은 작업 종료시간이 아니라 부분진행 판단시점이다.

```text
미보고 0명
→ 모든 보고를 커맨더가 검토하고 다음 WAVE 게시

미보고 1~2명
→ 완료 워커만 다음 WAVE 진행
→ 미보고 워커는 새 작업에서 제외하고 기존 작업 계속
→ 기존 작업 결과 또는 미수행 사유 게시 요구

미보고 3명 이상
→ 다음 WAVE 보류
→ 20분 후 GitHub 보고 수만 다시 확인
```

최초 지시 후 90분이 지나도 같은 작업의 결과가 없으면 기존 워커를 중단하지 않고 보조 워커 2명에게 같은 작업을 독립 배정한다. 동일 작업 완료 수는 한 번만 계산하며 공식 결과 선택은 커맨더가 한다.

## 6. 연속 미보고와 워커 교체

단순 조회·20분 경과·페이지 확인은 미보고 횟수에 포함하지 않는다.

```text
명시적 결과게시 요구
→ 다음 해당 확인에서도 결과 또는 미수행 사유 없음
→ 연속 미보고 +1
```

```text
1~3회
→ 기존 작업 계속
→ 결과 또는 미수행 사유 게시 재요구

4회
→ 기존 실행 인스턴스 신규배정 제외
→ 같은 역할의 신규 워커 지정
→ 모든 미완료 작업 인계
```

표시:

```text
반복미보고=[{ROLE_LIST}] | 신규워커배정=[{ROLE_LIST}]
```

## 7. 명령실행 모드

명령실행은 사용자가 입력한 동일 문장을 그대로 반복하는 별도 매크로다.

```text
EVERY_X_MINUTES
AFTER_COMPLETION
```

`AFTER_COMPLETION`의 완료 권위는 채팅 화면이 아니라 해당 Dispatch 이후 새 GitHub 결과게시물이다. 결과게시물을 만들지 않는 명령은 `EVERY_X_MINUTES`를 사용한다.

동일 워커의 활성 명령은 최대 1개다. 활성 명령이 있으면 시간 Trigger를 건너뛰며 같은 명령을 Queue에 중첩하지 않는다.

## 8. 종료

전체 C 모드 종료는 다음을 모두 만족할 때만 인정한다.

```text
커맨더 END=true
공정률=100
남은 작업=0
장기 미완료 작업=0
```

Production·Ready·Merge는 이 규칙으로 승인되지 않는다.
