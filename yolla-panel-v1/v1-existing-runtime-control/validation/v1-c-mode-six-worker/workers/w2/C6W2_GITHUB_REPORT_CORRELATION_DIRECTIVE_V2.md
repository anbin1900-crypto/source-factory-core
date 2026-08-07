# AUTOMATION-C-W2 Directive V2

```text
CONTROL_ID=V1-C-MODE-6W-VALIDATION-CYCLE-002
WORKER_ID=AUTOMATION-C-W2
CONTROL_PR=#17
BRANCH=worker/automation-c-w2-github-correlation-v2
OWNED_PATHS=validation/v1-c-mode-six-worker/workers/w2/**,automation-c-v1/github_comment_client.cjs,automation-c-v1/report_parser/**
REQUIRED_TERMINAL=C6W2_GITHUB_REPORT_CORRELATION_PASS_OR_EXACT_BLOCKER
```

## Mission

GitHub 보고 감시와 결과 상관관계를 One Owner End-to-End로 검증하고 직접 교정한다.

```text
START·REPORTED·END PANEL 파싱
ROLE 일치
WAVE 일치
COMMAND_ID 일치
결과 게시물 번호 자동취득
과거·지연 WAVE 결과 차단
동일 역할 중복 결과 1회 계산
잘못된 PANEL Fail-closed
GitHub Pagination·일시 오류·지연 복구
미보고와 작업중 비혼동
명시적 게시요구 실패횟수 정확성
```

실패하면 Parser·Client·Fixture·Test를 직접 수정하고 동일 시험을 재실행한다.

## Required Result

```text
V1_C_MODE_6_WORKER_RESULT_V2
PANEL | ROLE=AUTOMATION-C-W2 | STATUS={REPORTED|END}
```

Production·Ready·Merge·AUTO_TEST 쓰기는 금지한다.
