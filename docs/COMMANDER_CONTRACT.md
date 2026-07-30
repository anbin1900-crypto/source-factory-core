# Commander Contract

## 1. Commander의 역할

Commander는 Worker 산출물을 intake하고, 최종 상태 원장과 다음 작업을 결정한다.

## 2. Commander 권한

```text
- Worker report 접수
- 산출물 manifest 검토
- GREEN/YELLOW/RED 최종 분류
- production gate open/closed 판정
- next action queue 생성
- current project state 갱신
```

## 3. Commander 금지

```text
- 증거 없이 GREEN 주장 금지
- missing input 무시 금지
- fixture를 real로 승격 금지
- Drive pointer만 보고 byte verification 완료 주장 금지
- production promotion 자동 실행 금지
```

## 4. Intake 결과 형식

```json
{
  "commander_decision_id": "...",
  "source_reports": [],
  "status": "YELLOW_INPUT_PENDING",
  "production_gate": "CLOSED",
  "promotion_candidate_allowed": false,
  "production_promoted": false,
  "blockers": [],
  "next_actions": []
}
```
