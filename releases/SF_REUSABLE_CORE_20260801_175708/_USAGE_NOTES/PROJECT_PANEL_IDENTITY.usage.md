# Project Panel Identity Usage Note

이 문서는 Source Factory의 Project Panel Identity 관련 핵심 개념과 재사용 주의사항을 설명한다.

## 1. 핵심 개념

Project Panel은 독립 프로젝트 단위 패널이다.

```text
panel_instance_id = 현재 열린 Project Panel runtime instance
project_id        = 해당 패널 안에서 선택된 실제 프로젝트 ID
project_name      = 해당 패널 안에서 선택된 실제 프로젝트 이름
```

`panel_instance_id`와 `project_id`는 같은 값이 아니다.

## 2. 유효한 상태

### 2.1 source:not_found

아직 lifecycle event나 registry source가 없을 때의 상태다.

```text
source_found=false
source=not_found
project_id=null
project_name=null
```

이 상태는 실패가 아니라 “아직 실제 source가 없음”을 정직하게 표시하는 fallback이다.

### 2.2 source_partial

Project Panel lifecycle event는 도착했지만, 실제 project selection 값이 아직 없을 때의 상태다.

```text
source=runtime_event_registry
source_found=true
source_status=source_partial
panel_instance_id=exists
project_id=null
project_name=null
```

이 상태는 정상이다. fake project value를 넣어서 source_found처럼 꾸미면 안 된다.

### 2.3 project_selected 또는 source_found

실제 Project Panel 선택 이벤트에서 `project_id` 또는 `project_name`이 들어왔을 때의 상태다.

```text
source=runtime_event_registry
source_found=true
source_status=project_selected 또는 source_found
panel_instance_id=exists
project_id=real selected value or null
project_name=real selected value or null
```

## 3. 관련 파일

```text
safe_panel_v10/safe_panel_preload.js
safe_panel_v10/safe_panel_renderer.js
safe_panel_v10/ipc/stage4StationBindingHandlers.js
src/shared/stage4/projectPanelIdentityHelper.js
```

역할:

| 파일 | 역할 |
|---|---|
| `safe_panel_preload.js` | `window.sfApi.stage4.getProjectPanelIdentity` bridge |
| `safe_panel_renderer.js` | Project Panel Identity UI 표시 및 lifecycle event producer |
| `stage4StationBindingHandlers.js` | `runtime_event_registry` main process registry/handler |
| `projectPanelIdentityHelper.js` | identity 정규화/검증 helper 후보 |

## 4. 절대 금지

```text
- fake project_id 생성 금지
- default project_name 생성 금지
- template/smoke/example 값을 실제 identity로 사용 금지
- singleton current_project를 Project Panel identity source로 사용 금지
- Worker/Commander 창 수를 panel identity source로 사용 금지
- 라오창 입력 인식 상태를 Project Panel identity source로 사용 금지
```

## 5. 다중 Project Panel 원칙

같은 프로젝트가 여러 패널에 열릴 수 있다.

```text
panel_instance_id A → project_id P100
panel_instance_id B → project_id P100
panel_instance_id C → project_id P200
```

따라서 registry는 `project_id`가 아니라 `panel_instance_id` 또는 runtime context 기준으로 관리해야 한다.

## 6. 재사용할 때 점검할 것

```text
1. getProjectPanelIdentity bridge가 preload에 있는가?
2. sf:stage4-get-project-panel-identity IPC channel이 main handler에 있는가?
3. runtime_event_registry branch가 있는가?
4. source:not_found fallback이 보존되는가?
5. checked_paths가 제거되지 않았는가?
6. project_id/project_name이 없을 때 null을 유지하는가?
7. renderer가 panel_instance_id를 직접 생성하지 않는가?
```

## 7. 새 프로젝트 적용 단계

```text
1. safe_panel_preload.js의 getter bridge 확인
2. safe_panel_renderer.js의 UI selector 및 lifecycle producer 확인
3. stage4StationBindingHandlers.js의 registry branch 확인
4. 실제 project selection source가 있는지 별도 probe
5. 없으면 source_partial 유지
6. 있으면 project_selected 상태로만 전환
```

## 8. 사용자에게 보여줄 표시 원칙

```text
source:not_found     = 아직 source가 없다.
source_partial       = panel instance는 있으나 project selection 값은 없다.
project_selected     = 실제 project selection 값이 일부 들어왔다.
source_found         = 필요한 identity field가 실제 source로 채워졌다.
```

화면을 예쁘게 만들기 위해 없는 값을 만들어 넣지 않는다.
