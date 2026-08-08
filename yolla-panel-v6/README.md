# YOLLA Panel V6

V6는 기존 V5, Minimal V1, PC Operation Executor V2를 수정하는 패치가 아니라 별도의 욜라패널 운영 체계입니다.

## 독립 범위

- 설치 루트, Release, 상태, 브라우저 프로필, 로그, Receipt를 E:\YOLLA\panel-v6 아래에만 둡니다.
- IPC는 v6 네임스페이스를 사용합니다.
- Browser partition과 예약 작업 이름도 V6 전용입니다.
- Electron 실행 파일은 설치 시 V6 dependencies로 복사합니다. 설치 후 기존 Source Factory Electron에 의존하지 않습니다.
- 기존 상태는 V6.Snapshot.ps1이 읽기 전용 복사본을 만든 뒤 명시적으로 한 번만 가져옵니다.
- 기존 명령 007~010은 격리하며 자동 재발행하지 않습니다.

## 터널과 PC 실행기

로컬 MCP endpoint는 http://127.0.0.1:8610/mcp 입니다. 외부 공개 포트를 열지 않고 OpenAI Secure MCP Tunnel이 이 endpoint에 연결되는 구조입니다.

V6_RUNTIME_API_KEY는 환경 변수로만 주입합니다. 파일이나 GitHub에 저장하지 않습니다.

PC 실행기는 임의 Shell을 제공하지 않습니다. STATUS, SNAPSHOT, VALIDATE, START_PANEL, STOP_PANEL, INSTALL_UPDATE만 처리하며 INSTALL_UPDATE 패키지는 V6 staging 내부로 제한됩니다.

## 설치

Windows 10 PowerShell 5.1에서 INSTALL_AI_YOLLA_V6.bat을 실행합니다. 설치기는 원본 런타임을 중지하거나 수정하지 않습니다.

설치 완료만으로 Live PASS를 선언하지 않습니다. 다음 증거가 모두 필요합니다.

1. INSTALL_RECEIPT_V6.json
2. 로컬 health와 MCP initialize, tools/list 성공
3. STATUS 명령의 tunnel-to-executor-to-receipt 왕복
4. 패널 Renderer PASS
5. 기존 V5 및 Minimal 핵심 Hash 불변

현재 GitHub 소스 검증과 Target-PC 실가동은 별도 상태로 관리합니다.

## 세션 복구와 모듈 결속

- GPT/ChatGPT는 persist:yolla-v6-worker, Google은 persist:yolla-v6-analyzer를 재사용합니다.
- Workspace 선택 상태와 Panel·Log Window 위치/열림 상태는 state\session\V6_UI_SESSION_STATE.json에 저장합니다.
- 로그인 복구 Receipt에는 쿠키·토큰·비밀번호를 기록하지 않습니다. 전체 Runtime 재시작 후 인증된 UI marker가 양쪽에서 관찰돼야 PASS입니다.
- V-2 사이트 분석기와 B-1 Commander·Worker 메뉴는 runtime/module_host.cjs의 공통 계약으로 결속되며, 담당자는 자기 modules/<module>/provider.cjs만 수정합니다.
- 현재 47-file Source Runtime은 기존 불변 Release 6.0.0·6.0.1을 보존하고 새 Release 6.0.2로 배포하도록 승격했습니다. 6.0.1 Target-PC Smoke에서 설치 평탄화 레이아웃의 모듈 경로 결함을 검출했으며, 6.0.2는 Source·Installed 두 레이아웃을 모두 검증합니다. 장기 실행 자식은 PowerShell 5.1 `Start-Process`로 분리해 승인 실행기의 출력 파이프를 점유하지 않습니다. Target-PC 최종 영수증 검증은 아직 완료되지 않았습니다.
