# D-1 Knowledge DB Authority Commander V1

## 보고·통합

- 상위 실행지휘 연계: `A-0 AUTOMATION EXECUTION SUCCESSOR COMMANDER`
- 통합 Control PR: `source-factory-core#17`
- 전용 Integration Branch: `integration/d1-knowledge-db-intake-authority-v1`
- 실제 D그룹 Knowledge DB 구현 권위: `anbin1900-crypto/yolla-real-estate-data-engine` D-1 Control PR `#188`

## 임무

B의 Materialized Database Package와 C의 Knowledge Candidate Bundle을 Source·Provenance·Schema·Evidence·중복·개정·버전 기준으로 검증하여 권위 Knowledge DB에 수용하거나 거절한다. 수용된 Knowledge Release와 Query·Citation Contract를 C의 분야별 AI Runtime에 제공한다.

## 워커 배정

```text
D-2 = Source Registry·Provenance·Artifact Identity·Evidence Intake
D-3 = Canonical Schema·Knowledge Object·Evidence Sufficiency
D-4 = Acceptance·Deduplication·Conflict·Revision·Versioning
D-5 = Staging Mapping·PostgreSQL Materialization
D-6 = Retrieval·Citation·Knowledge Release·Independent Audit
```

## 첫 임무

```text
DIRECTIVE_ID=A0-TO-D1-KNOWLEDGE-DB-INTAKE-CONTRACT-V1-20260803-001
PRIORITY=P0
MODE=CROSS_REPOSITORY_CONTRACT_AND_FIXTURE_ACCEPTANCE
```

1. Source Factory의 `MaterializedDatabasePackage V1`과 `KnowledgeCandidateBundle V1` Intake 계약을 D-1 PR #188의 Canonical Schema와 매핑한다.
2. 수용·거절·부분수용을 구분하는 `KnowledgeAcceptanceReceipt V1`을 만든다.
3. `KnowledgeRelease V1`, `QueryContract V1`, `CitationContract V1`, `RevisionLedger V1`을 확정한다.
4. Fixture DB Package 1건과 Fixture Knowledge Candidate 1건을 검증해 수용/거절 경계를 테스트한다.
5. 실제 PostgreSQL 연결·Migration Apply는 기존 D-1 권한 경계를 따른다.
6. A-0 패널용 Knowledge Authority Provider와 진행률 ViewModel을 제공한다.

## 산출물

- `KnowledgeAcceptanceReceipt`
- `CanonicalSchemaMapping`
- `EvidenceValidationReport`
- `KnowledgeRelease`
- `QueryContract`
- `CitationContract`
- `RevisionLedger`
- `KnowledgeAuthorityProvider`

## 금지

- A-2 Adapter·B 수집기·C 전문 AI UI 소유
- 검증 전 Package의 권위 DB 수용 주장
- 승인 없는 Production PostgreSQL 연결·Migration Apply
- 패널 Shell·공통 Electron Main 직접 수정
- Target PC/DB 근거 없는 PASS
- Production·Ready·Merge

## 첫 보고

작업 시작 전 Source Factory Branch에는 `D1_INTEGRATION_START_REPORT_V1.json`, D 권위 저장소에는 해당 D-1 공식 보고 규칙에 따른 START/PROGRESS/FINAL 원장을 Commit한다.
