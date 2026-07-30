# Source Factory Core

Source Factory Core는 여러 프로젝트에서 재사용할 수 있는 AI 개발 자동화 코어입니다.

이 저장소의 목적은 특정 프로젝트 산출물이 아니라 다음 공통 기능을 분리 보관하는 것입니다.

```text
GitHub daily queue
→ prompt 순차 실행
→ worker output 수집
→ WORKER_REPORT 추출
→ SHA / manifest / ZIP 검증
→ Commander gate 판정
→ GitHub 원장 갱신
→ 대용량 artifact는 Google Drive pointer로 관리
```

## 핵심 원칙

```text
GitHub = 원장, 프롬프트, 보고서, 상태, 작은 소스
Google Drive = 대용량 ZIP, DB dump, 실사이트 evidence, 원본 archive
Local PC = 실제 브라우저, DB runtime, 대형 파일 생성, runner 실행
```

## 기본 폴더

```text
docs/       운영모델, 계약, 정책 문서
templates/  Worker/Commander/Daily Queue 템플릿
src/        재사용 가능한 코어 소스
tools/      검증·분할·로컬 보조 스크립트
examples/   실제 프로젝트 적용 예시
```

## 현재 상태

```text
STATUS: BOOTSTRAP_INITIALIZED
SCOPE: REUSABLE_CORE_ONLY
PROJECT_SPECIFIC_OUTPUTS: EXCLUDED
LARGE_ARTIFACTS: DRIVE_POINTER_ONLY
```

## 재사용 대상

- Daily Queue Runner
- Sequential Prompt Sender
- Worker Output Collector
- WORKER_REPORT Extractor
- GitHub Artifact Ledger
- Google Drive Artifact Pointer Manager
- ZIP / SHA / manifest verifier
- RED/YELLOW/GREEN Gate Classifier
- Commander Intake Decision Builder

## 금지

```text
- 특정 프로젝트 대형 ZIP 직접 commit 금지
- DB dump 직접 commit 금지
- 개인정보 가능 원본 데이터 commit 금지
- fixture 결과를 real runtime evidence로 승격 금지
- Worker 자기판정을 Commander 최종판정으로 승격 금지
```

## 다음 단계

1. 기존 Source Factory Stage 4 소스에서 재사용 가능한 파일을 선별합니다.
2. 프로젝트 종속 UI 코드는 legacy 또는 examples로 분리합니다.
3. Daily Queue Runner V1을 구현합니다.
4. GitHub + Google Drive artifact ledger를 연결합니다.
5. YOLLA 프로젝트에서 첫 적용 예시를 만듭니다.
