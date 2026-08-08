# YOLLA Panel V6 module boundary

이 폴더는 담당자가 V6 전체 소스와 경로를 다시 학습하지 않고 자기 모듈만 수정하도록 만든 고정 진입점입니다.

## 시작 순서

1. `V6_MODULE_REGISTRY_V1.json`을 읽습니다.
2. 자기 모듈의 Contract 한 개만 읽습니다.
3. Contract의 `owned_root` 안에서만 구현합니다.
4. 새 Shell 기능이 필요하면 Shell을 직접 수정하지 말고 `new_mount_slot` 또는 `new_host_capability` 요청을 냅니다.
5. 결과는 자기 모듈 Receipt로 반환합니다.

## 소유권

| 모듈 | 담당 | 독립 수정 범위 |
|---|---|---|
| Session Restore | YOLLA Panel UI Owner | Google·GPT 로그인 저장소 재사용 + Workspace·Panel·Log Window 상태 복구 |
| Site Analyzer | V-2 | 분석기 Provider·ViewModel·Action·Status |
| Commander/Worker Menu | B-1 | 그룹·커맨더·워커 메뉴 ViewModel·Action·Status |

## 공통 금지

- 다른 모듈의 private 파일 직접 import
- `runtime/main.js`, `runtime/renderer.js`, `runtime/index.html` 직접 수정
- 임의 IPC namespace 또는 임의 Shell 실행 추가
- V5·Minimal 상태 쓰기·삭제
- 쿠키·토큰·비밀번호를 복사하거나 Manifest·Receipt·로그에 기록

현재 단계는 **구조·계약 확정**입니다. Runtime binding과 Target-PC 적용은 각 Contract의 Acceptance를 통과한 별도 커밋과 Receipt로 수행합니다.
