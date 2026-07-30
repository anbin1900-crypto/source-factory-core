# Commander Intake Template

```text
===== COMMANDER_INTAKE_START =====

COMMANDER_ID: {{COMMANDER_ID}}
INTAKE_ID: {{INTAKE_ID}}
SOURCE_REPORTS:
{{SOURCE_REPORTS}}

검토 대상:
- Worker reports
- artifact manifest
- SHA / size / CRC evidence
- tests_run / tests_not_run
- blockers

판정 원칙:
- Worker 자기판정은 최종판정이 아니다.
- 증거 없는 GREEN 금지.
- fixture와 real runtime 분리.
- production promotion은 별도 명시 승인 전 금지.

출력:
- COMMANDER_DECISION.md
- COMMANDER_DECISION.json
- SLOT_STATUS_MATRIX.csv
- NEXT_ACTIONS.json

===== COMMANDER_INTAKE_END =====
```
