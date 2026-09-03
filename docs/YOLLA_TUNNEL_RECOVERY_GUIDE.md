# YOLLA 터널 접속 및 복구 가이드

이 문서는 사용자 PC 재부팅이나 작업 스케줄러 중지로 YOLLA 접속이 끊겼을 때 사용하는 표준 복구 절차다.

## 터널 종류

1. Web Tunnel
- 목적: 외부에서 Control Center, 공용게시판, 경량패널 접속
- 로컬 서비스: http://127.0.0.1:3340
- 시작 순서: YOLLA Web Server V1 다음 YOLLA Web Tunnel V1

2. Direct MCP Tunnel
- 목적: ChatGPT/Codex가 사용자 PC의 승인된 작업 실행
- 로컬 엔드포인트: http://127.0.0.1:32110/mcp
- 핵심 작업: YOLLA PC Direct Executor V3

Cloudflare Quick Tunnel의 trycloudflare.com 주소는 재시작할 때 바뀔 수 있으므로 과거 주소를 고정값으로 사용하지 않는다.

## 가장 빠른 복구 순서

관리자 PowerShell에서 실행:

    Start-ScheduledTask -TaskName "YOLLA PC Direct Executor V3"
    Start-ScheduledTask -TaskName "YOLLA Web Server V1"
    Start-ScheduledTask -TaskName "YOLLA Web Tunnel V1"
    Start-ScheduledTask -TaskName "YOLLA PC Tunnel Monitor V1"
    Start-ScheduledTask -TaskName "YOLLA PC Operations Panel V1"

작업 스케줄러 GUI에서는 각 작업을 선택하고 실행을 누른다. 이미 실행 중인데 응답이 없으면 해당 작업만 끝내기 후 실행한다.

라오프로젝트 패널 본체:

    E:\YOLLA\yolla-communicator-clean-v06\RUN_YOLLA_COMMUNICATOR_V06.ps1

반복 GPT 신호를 원하지 않으면 Communicator Watchdog을 활성화하지 않는다.

## 새 Web Tunnel 주소 확인

현재 공개 주소 파일:

    E:\YOLLA\web-server-v1\public-url.txt

확인 명령:

    Get-Content "E:\YOLLA\web-server-v1\public-url.txt"

파일이 없으면 로그에서 확인:

    Select-String -Path "E:\YOLLA\web-server-v1\logs\cloudflared.stdout.log","E:\YOLLA\web-server-v1\logs\cloudflared.stderr.log" -Pattern "https://[a-zA-Z0-9-]+\.trycloudflare\.com" | Select-Object -Last 1

확인한 새 주소에 경로를 붙인다.

- Control Center: https://현재주소.trycloudflare.com/
- 공용게시판: https://현재주소.trycloudflare.com/board.html
- 경량패널: https://현재주소.trycloudflare.com/multi-panel.html

## 로컬 검증

Web Server:

    Invoke-RestMethod "http://127.0.0.1:3340/healthz"

공용게시판:

    Invoke-RestMethod "http://127.0.0.1:3340/api/board/posts" | Select-Object ok,count

경량패널:

    Invoke-WebRequest "http://127.0.0.1:3340/multi-panel.html" -UseBasicParsing | Select-Object StatusCode

Direct MCP는 ChatGPT/Codex의 YOLLA Data Ledger에서 pc_health가 ok=true, state=READY를 반환하고 SYSTEM_STATUS가 성공하면 복구된 것이다.

## 장애 판정

- 127.0.0.1:3340 응답 없음: YOLLA Web Server V1 실행
- 로컬 3340 정상, 외부 URL 실패: YOLLA Web Tunnel V1 재시작 후 public-url.txt 재확인
- pc_health 즉시 Internal error: Direct Executor 또는 MCP 터널 미기동
- pc_health 장시간 대기 후 HTTP 504: MCP 외부 터널 경로 응답 없음
- 경량패널 정상, 운영 API 502: 상태조회 전용이면 정상. 운영 기능이 필요할 때만 Control 런타임 기동
- GPT 반복 메시지: Communicator 자동경고와 Watchdog 중지, reminder OFF

## 중요 경로

    E:\YOLLA\web-server-v1\RUN_YOLLA_WEB_SERVER_V1.ps1
    E:\YOLLA\web-server-v1\RUN_YOLLA_WEB_TUNNEL_V1.ps1
    E:\YOLLA\web-server-v1\public-url.txt
    E:\YOLLA\web-server-v1\logs\cloudflared.stdout.log
    E:\YOLLA\web-server-v1\logs\cloudflared.stderr.log
    E:\YOLLA\server\yolla-data-ledger-v1\pc-direct-executor-v3\YOLLA_PC_DIRECT_EXECUTOR_V3.ps1
    E:\YOLLA\server\yolla-data-ledger-v1\mcp-direct-access-v1\RUN_YOLLA_MCP_TUNNEL_V5.ps1

## 보안

- API 키, 토큰, secrets 폴더 내용은 GitHub, 공용게시판, 채팅에 게시하지 않는다.
- 현재 trycloudflare.com 주소는 임시 주소이며 인증 수단이 아니다.
- Assistant-side localhost 차단은 사용자 PC 서버 장애와 구분한다.
- 게시판 자동화는 Direct MCP에서 사용자 PC의 127.0.0.1:3340으로 접근한다.
