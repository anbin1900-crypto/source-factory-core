# C 모드 그룹 실행 버튼 — 대상 PC 적용 체크리스트

## 적용 전

```text
TARGET_RUNTIME=5.10.2.4.0
DEFAULT_RELEASE=E:\SOURCE FACTORY\.yolla\yolla-panel\releases\v5.10.2.4.0-c-mode-repeat-command
PACKAGE=AI_YOLLA_C_MODE_GROUP_BUTTON_PATCH_V1.zip
PACKAGE_SHA256=1a573bd5bc705aa56f314b379281d3ab98c74f705e8f422c52f16f308639d654
```

1. 패널에서 진행 중인 입력 내용을 저장한다.
2. ZIP SHA-256을 확인한다.
3. ZIP을 빈 폴더에 압축 해제한다.
4. `APPLY_C_MODE_GROUP_BUTTON_PATCH.bat`를 실행한다.

## 자동 수행 범위

1. 정확한 5.10.2.4.0 Release 탐색
2. `main.js`, `workspace_preload.js`, `workspace.html`, `automation-c-v1/c_mode_runtime.cjs` 백업
3. 해당 Release를 실행 중인 프로세스만 종료
4. 그룹 버튼 JS·CSS 및 IPC·Preload·Runtime 최소 Hook 적용
5. JavaScript/CJS 문법 검사
6. Target 검증 10개 실행
7. 실패 시 자동 Rollback
8. 성공 시 기존 Launcher로 재시작

## 적용 후 확인

```text
GROUP_HEADER_BUTTON=C 모드 실행
IDLE_COLOR=GRAY
RUNNING_COLOR=BLUE
ERROR_COLOR=RED
COMMANDER_MESSAGE=모든 워커에게 지시할 작업을 게시하라
```

1. 각 그룹 제목 우측에 버튼이 나타나는지 확인한다.
2. 대기 상태가 회색인지 확인한다.
3. 테스트 그룹에서 버튼을 한 번 누른다.
4. 즉시 파란색과 `상태: 실행중`이 표시되는지 확인한다.
5. 커멘더창에 기본 메시지가 정확히 한 번 전송됐는지 확인한다.
6. 커멘더가 게시물 번호를 게시한 뒤 정확한 워커창에 전달되는지 확인한다.
7. Wave와 수행 횟수가 배포 Cycle 기준으로 증가하는지 확인한다.

## Receipt

```text
E:\SOURCE FACTORY\.yolla\yolla-workspace-v5-2\automation-c-v1\group-button-patch-receipts
```

## 수동 복구

문제가 발생하면 압축 해제 폴더의 `ROLLBACK_C_MODE_GROUP_BUTTON_PATCH.bat`를 실행한다.

```text
TARGET_PC_APPLIED=false
TARGET_PC_LIVE_PASS=false
```

이 문서는 적용 준비 문서이며 실제 대상 PC 실행 결과를 주장하지 않는다.
