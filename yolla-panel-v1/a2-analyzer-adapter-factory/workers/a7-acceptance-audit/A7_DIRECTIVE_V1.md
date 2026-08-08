# A-7 Independent Analyzer Acceptance·Handoff Auditor Directive V1

## Authority

```text
COMMANDER=A-2
CONTROL_PR=#18
BRANCH=worker/a7-analyzer-acceptance-audit-v1
DIRECTIVE_ID=A2-TO-A7-ANALYZER-ACCEPTANCE-AUDIT-V1-20260803-001
OWNED_ROOT=yolla-panel-v1/a2-analyzer-adapter-factory/workers/a7-acceptance-audit/**
```

## Mission

A-3~A-6 산출물을 독립 검증하여 사이트 구조 분석률, 계약 일관성, 민감정보 차단, Adapter replay 재현성, B-1 인계 준비도를 판정한다. 구현 워커의 자기 PASS를 그대로 수용하지 않는다.

## Required work

1. `AnalyzerAcceptanceChecklist V1` 작성.
2. 분석 진행률이 실제 단계·완료항목 기반이며 scope freeze 이후 단조 증가하는지 검증.
3. A-3 통신 Event → A-4 Navigation/Pagination → A-5 Contract Bundle → A-6 Adapter Candidate 추적성 검증.
4. Raw Secret·Cookie·Authorization·개인식별값 노출 검사.
5. Fixture Replay 결과 독립 재실행 또는 결과 재계산 검증.
6. 필수 파일·Schema version·SHA-256·evidence refs·test counts 검증.
7. `VerifiedAdapterPackage` 최종 상태를 ACCEPTED, REJECTED, BLOCKED 중 하나로 판정.
8. B-1 인계 가능한 `AdapterHandoffAcceptanceReport V1` 생성.

## PASS criteria

```text
TRACEABILITY_CHAIN=PASS
PROGRESS_MONOTONICITY=PASS
RAW_SECRET_VALUE_COUNT=0
REPLAY_EVIDENCE=PASS
REQUIRED_CONTRACTS=PASS
PACKAGE_SHA256_PRESENT=true
SELF_APPROVAL_REJECTED=true
B_HANDOFF_STATUS=ACCEPTED_OR_EXPLICIT_BLOCKED
OUT_OF_SCOPE_FILE_COUNT=0
```

## Reports

- `A7_START_REPORT_V1.json`
- `A7_PROGRESS_OR_BLOCKER_REPORT_V1.json`
- `A7_FINAL_REPORT_V1.json`
- `LATEST_A7_REPORT_POINTER.json`

## Forbidden

A-3~A-6 구현파일 직접 수정, 자기 판단으로 패널 탑재, 실사이트 호출, 실제 수집, 승인 없는 오류 은폐, Target PC 근거 없는 PASS, Production·Ready·Merge.
