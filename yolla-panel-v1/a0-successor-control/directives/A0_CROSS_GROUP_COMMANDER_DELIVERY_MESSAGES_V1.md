# A-0 교차그룹 지시 전달문 V1

## 공통 원칙

- 아래 전달문은 **각 그룹 Commander의 ChatGPT 대화창**에 입력한다.
- 하위 워커에게 직접 전달하지 않는다. 각 Commander가 현재 작업과 충돌하지 않는 범위에서 워커별 Directive를 생성·게시한다.
- 기존 활성 Directive는 폐기하거나 중복 생성하지 않는다.
- 공식 교차지시: `A0-CROSS-GROUP-SITE-ANALYSIS-EXTRACTION-TRANSFORM-DB-ALIGNMENT-V1-20260804-001`
- 공식 지시 파일: `yolla-panel-v1/a0-successor-control/directives/A0_CROSS_GROUP_SITE_ANALYSIS_EXTRACTION_TRANSFORM_DB_ALIGNMENT_BATCH_V1.json`
- 전달표: `yolla-panel-v1/a0-successor-control/directives/A0_CROSS_GROUP_COMMANDER_DELIVERY_MATRIX_V1.json`

---

## 1. A-0 대화창에 전달

```text
ROLE=A-0_AUTOMATION_EXECUTION_SUCCESSOR_COMMANDER
REPOSITORY=anbin1900-crypto/source-factory-core
CONTROL_PR=#17
DIRECTIVE_ID=A0-CROSS-GROUP-SITE-ANALYSIS-EXTRACTION-TRANSFORM-DB-ALIGNMENT-V1-20260804-001

PR #17의 최신 교차그룹 지시와 전달표를 읽어라.
A-2→B-1→C-1→D-1 인계 Chain의 결과 Pointer를 수집하고,
각 인계조건이 충족될 때 다음 Wave를 활성화하라.
기존 V5.9 자동화 작업과 교차그룹 작업을 서로 대체하지 말고 병렬 관리하라.
결과는 PR #17에 Pointer·진행상태·정확한 차단요인으로 게시하라.
```

## 2. A-2 Commander 대화창에 전달

```text
ROLE=A-2_GENERIC_SITE_ANALYZER_ADAPTER_FACTORY_COMMANDER
REPOSITORY=anbin1900-crypto/source-factory-core
CONTROL_PR=#18
UPPER_DIRECTIVE_ID=A0-CROSS-GROUP-SITE-ANALYSIS-EXTRACTION-TRANSFORM-DB-ALIGNMENT-V1-20260804-001
DELIVERY_COMMENT=5170676647

PR #18의 기존 활성 지시를 유지한 채 최신 비대체형 보완지시를 수행하라.
A-3~A-7에게 현재 Owned Root와 충돌하지 않는 실행가능 작업을 병렬 배정하라.
목표는 범용 사이트 분석기, SiteStructureProfile, VerifiedAdapterPackage,
AdapterBuildReceipt와 Replay Acceptance를 완성해 B-1에게 인계하는 것이다.

필수 산출물:
SITE_STRUCTURE_PROFILE_V1
VERIFIED_ADAPTER_PACKAGE_V1
ADAPTER_BUILD_RECEIPT_V1
ANALYSIS_PROGRESS_EVENT_V1

실제 대량수집·인증우회·B/C/D 소유기능 구현은 금지한다.
완료 또는 정확한 외부 차단 후 PR #18에 Result Pointer와 Terminal을 게시하라.
```

## 3. B-1 Commander 대화창에 전달

```text
ROLE=B-1_COLLECTION_DB_MATERIALIZATION_COMMANDER
REPOSITORY=anbin1900-crypto/source-factory-core
CONTROL_PR=#19
UPPER_DIRECTIVE_ID=A0-CROSS-GROUP-SITE-ANALYSIS-EXTRACTION-TRANSFORM-DB-ALIGNMENT-V1-20260804-001
DELIVERY_COMMENT=5170679407

PR #19의 기존 활성 지시를 유지한 채 최신 비대체형 보완지시를 수행하라.
B-2~B-6에게 현재 Owned Root와 충돌하지 않는 실행가능 작업을 병렬 배정하라.
A-2의 VERIFIED_ADAPTER_PACKAGE_V1을 소비하는 데이터 추출기를 만들고,
원문·Provenance·SHA-256을 보존한 RAW_ARTIFACT_MANIFEST와 NORMALIZED_DATASET을 생성하라.

필수 산출물:
RAW_ARTIFACT_MANIFEST_V1
SOURCE_RECORD_ENVELOPE_V1
NORMALIZED_DATASET_V1
EXTRACTION_RECEIPT_V1

A-2 검증 Adapter가 없으면 실제 사이트 추출을 시작하지 말고 Fixture Shell만 완성하라.
사이트 분석기 재구현·미검증 Adapter 생성·D Canonical DB 직접쓰기는 금지한다.
완료 또는 정확한 외부 차단 후 PR #19에 Result Pointer와 Terminal을 게시하라.
```

## 4. C-1 Commander 대화창에 전달

```text
ROLE=C-1_SEMANTIC_KNOWLEDGE_DOMAIN_AI_RUNTIME_COMMANDER
REPOSITORY=anbin1900-crypto/source-factory-core
CONTROL_PR=#20
UPPER_DIRECTIVE_ID=A0-CROSS-GROUP-SITE-ANALYSIS-EXTRACTION-TRANSFORM-DB-ALIGNMENT-V1-20260804-001
DELIVERY_COMMENT=5170682348

PR #20의 기존 활성 지시를 유지한 채 최신 비대체형 보완지시를 수행하라.
C-2~C-6에게 현재 Owned Root와 충돌하지 않는 실행가능 작업을 병렬 배정하라.
B-1의 NORMALIZED_DATASET 또는 RAW_ARTIFACT_MANIFEST를 입력으로 받고,
D-1의 CANONICAL_SCHEMA_PROFILE과 INBOUND_FIELD_MAPPING_CONTRACT를 소비하는 변환기를 만들어라.

필수 산출물:
D_ALIGNED_TRANSFORMATION_PACKAGE_V1
FIELD_MAPPING_REPORT_V1
REJECTED_RECORD_BUNDLE_V1
KNOWLEDGE_CANDIDATE_BUNDLE_V1

모든 필드는 Source Field→Transformation Rule→D Target Field로 추적 가능해야 한다.
미매핑·오류 레코드는 삭제하지 말고 REJECTED_RECORD_BUNDLE로 분리하라.
D Canonical Schema 변경·D DB 직접쓰기·사이트 수집 Runtime 소유는 금지한다.
완료 또는 정확한 외부 차단 후 PR #20에 Result Pointer와 Terminal을 게시하라.
```

## 5. Source Factory D-1 Integration Commander 대화창에 전달

```text
ROLE=D-1_KNOWLEDGE_DB_INTEGRATION_COMMANDER
REPOSITORY=anbin1900-crypto/source-factory-core
CONTROL_PR=#21
UPPER_DIRECTIVE_ID=A0-CROSS-GROUP-SITE-ANALYSIS-EXTRACTION-TRANSFORM-DB-ALIGNMENT-V1-20260804-001
DELIVERY_COMMENT=5170684734
ACTUAL_DB_AUTHORITY=anbin1900-crypto/yolla-real-estate-data-engine#188

PR #21의 기존 활성 지시를 유지한 채 최신 비대체형 보완지시를 수행하라.
Source Factory의 B·C 산출물과 실제 D DB 권위 PR #188 사이의 Intake·Mapping 계약을 정렬하라.

필수 산출물:
D_CANONICAL_SCHEMA_PROFILE_V1
D_INBOUND_FIELD_MAPPING_CONTRACT_V1
D_INTAKE_VALIDATION_RULESET_V1
KNOWLEDGE_ACCEPTANCE_RECEIPT_V1

실제 Schema 권위는 PR #188에 있으며 PR #21은 교차저장소 통합계약만 소유한다.
완료 또는 정확한 차단 후 PR #21에 Cross-repository Pointer와 Terminal을 게시하라.
```

## 6. 실제 D DB 권위 Commander 대화창에 전달

```text
ROLE=D-1_DOMAIN_KNOWLEDGE_DATABASE_COMMANDER
REPOSITORY=anbin1900-crypto/yolla-real-estate-data-engine
CONTROL_PR=#188
UPPER_DIRECTIVE_ID=A0-CROSS-GROUP-SITE-ANALYSIS-EXTRACTION-TRANSFORM-DB-ALIGNMENT-V1-20260804-001
DELIVERY_COMMENT=5170687497
SOURCE_FACTORY_INTEGRATION_PR=anbin1900-crypto/source-factory-core#21

PR #188의 기존 활성 임무와 충돌하지 않도록 Fixture-first Schema Alignment 작업을 수행하라.
C 변환기가 소비할 Canonical Schema Profile과 Inbound Field Mapping Contract를 확정하고,
Entity·Field·Type·Required·Key·Constraint·Relationship·Evidence·Versioning·Dedup 규칙을 명시하라.

필수 산출물 또는 정확한 Pointer:
CANONICAL_SCHEMA_PROFILE
INBOUND_FIELD_MAPPING_CONTRACT
INTAKE_VALIDATION_RULESET
FIXTURE_ACCEPTANCE_OR_REJECTION_RECEIPT

D-2~D-6에게 기존 소유경로와 충돌하지 않는 작업을 배정하라.
실제 Production PostgreSQL 연결·Migration Apply·검증 전 수용 주장은 금지한다.
완료 또는 정확한 외부 차단 후 PR #188에 Commit·Pointer·Terminal을 게시하라.
```

## 전달 완료 판정

각 Commander가 자기 PR에 다음을 게시해야 전달 완료로 판정한다.

```text
DIRECTIVE_ACCEPTED=true
WORKER_ASSIGNMENT_POINTER=<path>
RESULT_POINTER=<path or pending>
TERMINAL=<PASS or exact blocker>
EXISTING_DIRECTIVE_SUPERSEDED=false
```
