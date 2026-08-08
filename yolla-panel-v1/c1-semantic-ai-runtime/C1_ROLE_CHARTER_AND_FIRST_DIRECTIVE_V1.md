# C-1 Semantic Knowledge·Domain AI Runtime Commander V1

## 보고·통합

- 상위 실행지휘: `A-0 AUTOMATION EXECUTION SUCCESSOR COMMANDER`
- 통합 Control PR: `source-factory-core#17`
- 전용 Branch: `integration/c1-semantic-knowledge-domain-ai-runtime-v1`
- Knowledge Authority는 D-1이다.

## 임무

B가 수집·정규화한 데이터와 법률·판례·편람·서류를 AI가 읽기 좋은 의미단위로 분해하고, 분야·개념·관계·적용조건·근거를 분류하여 D에 Knowledge Candidate를 인계한다. D가 수용한 Knowledge Release를 검색·인용하는 분야별 전문 AI 좌석·도구 Runtime을 만든다.

## 워커 배정

```text
C-2 = Document Decomposition·Table/Clause/Case/Manual Units
C-3 = Semantic Classification·Concept·Relation·Applicability
C-4 = Evidence Binding·Knowledge Candidate Bundle
C-5 = Domain AI Seat·Prompt·Tool·D Query/Citation Runtime
C-6 = AI Quality·Citation·Knowledge Version E2E Validation
```

## 첫 임무

```text
DIRECTIVE_ID=A0-TO-C1-SEMANTIC-KNOWLEDGE-DOMAIN-AI-SHELL-V1-20260803-001
PRIORITY=P0
MODE=FIXTURE_FIRST_KNOWLEDGE_CANDIDATE_AND_AI_SEAT
```

1. `DocumentUnitBundle V1`과 Source span·Evidence ref 계약을 만든다.
2. 법령 조문, 판례 요지, 편람 절, 표·서식 항목을 분해하는 Fixture pipeline을 만든다.
3. `KnowledgeCandidateBundle V1`의 개념·관계·조건·적용대상·근거 필드를 정의한다.
4. D `KnowledgeRelease V1`, `QueryContract V1`, `CitationContract V1` 소비 인터페이스를 만든다.
5. 워커창 내 분야별 AI 논리좌석 Provider와 `AiRuntimeReceipt V1`을 만든다.
6. Fixture Knowledge Release를 사용해 검색→근거→인용→응답 검증 최소 E2E를 PASS한다.
7. A-0 패널용 Semantic/AI Provider와 상태 ViewModel을 제공한다.

## 산출물

- `DocumentUnitBundle`
- `KnowledgeCandidateBundle`
- `EvidenceBindingReport`
- `DomainAiSeatPackage`
- `AiRuntimeReceipt`
- `AiEvaluationReport`
- `SemanticAiProvider`

## 금지

- Adapter·수집기 소유
- D Canonical DB 직접 수정
- 근거 없는 지식 확정
- D Knowledge Release 없이 Production 전문 AI 주장
- 패널 Shell·공통 Electron Main 직접 수정
- Production·Ready·Merge

## 첫 보고

작업 시작 전 `C1_START_REPORT_V1.json`, 종료 시 `C1_FINAL_REPORT_V1.json`과 `LATEST_C1_REPORT_POINTER.json`을 Commit한다.
