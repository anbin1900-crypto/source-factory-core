# V1-CV-2 Target PC·UI·Install·Live Flow Directive V1

```text
CYCLE_ID=V1-C-MODE-VALIDATION-CYCLE-001
WORKER=V1-CV-2
CONTROL_PR=#17
BASE_HEAD=cc4f5cbd6248fea5890f7fcad8245fe8a58fb221
BRANCH=worker/v1-cv2-targetpc-ui-v1
OWNED_PATHS=validation/v1-c-mode/workers/cv2/**,workspace_c_mode.*,install_v51024*.ps1
```

PR #17의 최신 C 모드 검증 Pointer와 Test Matrix를 읽고 다음을 End-to-End로 수행하라.

```text
V5.10.2.4.1 대상 PC 설치
C·명령 모두 비활성일 때 작업중 0명
각 그룹 C 버튼과 상단 명령 실행 팝업
3개 워커 × 3개 WAVE 실제 Batch
시간 반복명령
ROLE+COMMAND_ID 완료 반복
END 자동정지
로그 다운로드·작업관제 원장
재시작 복구·Rollback
```

설치·UI 결함은 직접 수정하고 새 설치패키지를 만들어 재시험한다. 로그인 Profile과 기존 관제로그를 보존한다. 결과를 다음 경로에 Commit한다.

```text
validation/v1-c-mode/workers/cv2/CV2_TARGET_PC_UI_TERMINAL.json
validation/v1-c-mode/workers/cv2/LATEST_CV2_POINTER.json
```

Terminal:

```text
CV2_TARGET_PC_C_COMMAND_UI_PASS_OR_EXACT_BLOCKER
```

근거 없는 Target PC PASS, Production·Ready·Merge·AUTO TEST 수정은 금지한다.
