# C-2 Role Registry · Left Role Menu V1

`C1-TO-C2-ROLE-REGISTRY-LEFT-MENU-V1-20260802-001`의 전용 산출물입니다.

- A-2 호환 최소 역할계약 필드를 그대로 사용합니다.
- 기존 Electron·Browser Window·IPC·Prompt Transport를 생성하지 않습니다.
- `worker_window_id`는 C-3 Browser Binding Adapter가 소비할 논리 결속키입니다.
- 그룹 접기/펼치기, 상태 Badge, 현재 역할 표시, Registry 기반 동적 역할추가를 제공합니다.

## 실행

```bash
node --test testRoleRegistryMenu.js
python validateRoleRegistrySchema.py
```
