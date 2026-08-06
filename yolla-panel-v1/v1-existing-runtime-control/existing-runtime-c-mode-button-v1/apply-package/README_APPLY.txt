AI YOLLA Panel Workspace 5.10.2.4.0
C 모드 그룹 헤더 실행 버튼 패치

적용 방법
1. AI YOLLA Panel Workspace의 현재 작업을 저장합니다. 설치기가 실행 중인 대상 패널 프로세스를 자동으로 종료합니다.
2. AI_YOLLA_C_MODE_GROUP_BUTTON_PATCH_V1.zip의 압축을 풉니다.
3. APPLY_C_MODE_GROUP_BUTTON_PATCH.bat 파일을 더블클릭합니다.
4. PASS 메시지와 Receipt 경로를 확인합니다.
5. 패널이 자동 재시작되면 각 그룹 제목 우측의 "C 모드 실행" 버튼을 확인합니다.

버튼 상태
- 회색: 대기
- 파란색: 실행중
- 빨간색: 오류

버튼 클릭 시
- 즉시 파란색으로 전환
- 그룹의 커멘더창에 "모든 워커에게 지시할 작업을 게시하라"를 전송
- 커멘더가 GitHub에 전체 워커 작업 게시물을 게시하면 기존 C 모드 Runtime이 정확한 워커창으로 작업을 전달
- 그룹 제목 아래에 Wave / 수행 횟수 / 상태 표시

자동 안전장치
- 대상 Release 자동 탐색
- 원본 4개 파일 백업
- Node 문법검사 및 10개 Target 검증
- 실패 시 자동 Rollback
- 로그인 Browser Profile과 workspace_state를 변경하지 않음

수동 되돌리기
ROLLBACK_C_MODE_GROUP_BUTTON_PATCH.bat 실행

기본 대상
E:\SOURCE FACTORY\.yolla\yolla-panel\releases\v5.10.2.4.0-c-mode-repeat-command

Receipt
E:\SOURCE FACTORY\.yolla\yolla-workspace-v5-2\automation-c-v1\group-button-patch-receipts

Package SHA-256
1a573bd5bc705aa56f314b379281d3ab98c74f705e8f422c52f16f308639d654
