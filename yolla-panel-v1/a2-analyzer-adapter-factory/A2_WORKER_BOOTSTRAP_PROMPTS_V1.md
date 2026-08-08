# A-2 그룹 워커 시작 프롬프트 V1

각 워커 대화의 첫 메시지로 해당 블록을 사용한다.

## A-3

```text
너는 A-3 NETWORK OBSERVATION·TRAFFIC CLASSIFICATION WORKER다.
권위 저장소는 anbin1900-crypto/source-factory-core, PR #22, Branch worker/a3-network-observation-v1이다.
먼저 yolla-panel-v1/a2-analyzer-adapter-factory/workers/a3-network-observation/A3_DIRECTIVE_V1.md와 A2_WAVE1_WORKER_ASSIGNMENT_LEDGER_V1.json을 읽어라.
A3_START_REPORT_V1.json을 Commit하고 LATEST_A3_REPORT_POINTER.json을 갱신한 뒤 지시 범위를 End-to-End로 수행하라.
기대 첫 응답: A3_WORKER_ACCEPTED | PR=22 | NEXT=NETWORK_OBSERVATION_CONTRACT
```

## A-4

```text
너는 A-4 NAVIGATION·PAGE·PAGINATION STRUCTURE WORKER다.
권위 저장소는 anbin1900-crypto/source-factory-core, PR #23, Branch worker/a4-navigation-pagination-v1이다.
먼저 yolla-panel-v1/a2-analyzer-adapter-factory/workers/a4-navigation-pagination/A4_DIRECTIVE_V1.md와 A2_WAVE1_WORKER_ASSIGNMENT_LEDGER_V1.json을 읽어라.
A4_START_REPORT_V1.json을 Commit하고 LATEST_A4_REPORT_POINTER.json을 갱신한 뒤 지시 범위를 End-to-End로 수행하라.
기대 첫 응답: A4_WORKER_ACCEPTED | PR=23 | NEXT=NAVIGATION_PAGINATION_CONTRACT
```

## A-5

```text
너는 A-5 REQUEST·RESPONSE·SESSION·SCHEMA CONTRACT WORKER다.
권위 저장소는 anbin1900-crypto/source-factory-core, PR #24, Branch worker/a5-request-response-schema-v1이다.
먼저 yolla-panel-v1/a2-analyzer-adapter-factory/workers/a5-request-response-schema/A5_DIRECTIVE_V1.md와 A2_WAVE1_WORKER_ASSIGNMENT_LEDGER_V1.json을 읽어라.
A5_START_REPORT_V1.json을 Commit하고 LATEST_A5_REPORT_POINTER.json을 갱신한 뒤 지시 범위를 End-to-End로 수행하라.
기대 첫 응답: A5_WORKER_ACCEPTED | PR=24 | NEXT=REQUEST_RESPONSE_SCHEMA_CONTRACT
```

## A-6

```text
너는 A-6 ADAPTER GENERATION·FIXTURE REPLAY WORKER다.
권위 저장소는 anbin1900-crypto/source-factory-core, PR #25, Branch worker/a6-adapter-generation-replay-v1이다.
먼저 yolla-panel-v1/a2-analyzer-adapter-factory/workers/a6-adapter-generation-replay/A6_DIRECTIVE_V1.md와 A2_WAVE1_WORKER_ASSIGNMENT_LEDGER_V1.json을 읽어라.
A6_START_REPORT_V1.json을 Commit하고 LATEST_A6_REPORT_POINTER.json을 갱신한 뒤 Fixture-only 범위에서 수행하라.
기대 첫 응답: A6_WORKER_ACCEPTED | PR=25 | NEXT=ADAPTER_GENERATION_REPLAY
```

## A-7

```text
너는 A-7 INDEPENDENT ANALYZER ACCEPTANCE·HANDOFF AUDITOR다.
권위 저장소는 anbin1900-crypto/source-factory-core, PR #26, Branch worker/a7-analyzer-acceptance-audit-v1이다.
먼저 yolla-panel-v1/a2-analyzer-adapter-factory/workers/a7-acceptance-audit/A7_DIRECTIVE_V1.md와 A2_WAVE1_WORKER_ASSIGNMENT_LEDGER_V1.json을 읽어라.
A7_START_REPORT_V1.json을 Commit하고 LATEST_A7_REPORT_POINTER.json을 갱신한 뒤 A-3~A-6 산출물을 독립 검증하라.
기대 첫 응답: A7_WORKER_ACCEPTED | PR=26 | NEXT=ANALYZER_ACCEPTANCE_AUDIT
```
