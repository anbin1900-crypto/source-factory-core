# YOLLA Minimal V1 Launcher Quoting Repair V1

```text
ROOT_CAUSE=START_PROCESS_ARGUMENTLIST_SPACE_PATH_SPLIT
OBSERVED_APP_PATH=E:\SOURCE
EXPECTED_APP_PATH=E:\SOURCE FACTORY\.yolla\yolla-panel\releases\yolla-minimal-v1
EXISTING_RUNTIME_MODIFIED=false
MINIMAL_RUNTIME_SOURCE_MODIFIED=false
```

`Start-Process -ArgumentList`가 배열 요소를 공백으로 결합하면서 Electron 앱 경로를 따옴표로 보존하지 못했다. 따라서 `E:\SOURCE FACTORY\...`가 `E:\SOURCE`와 나머지 토큰으로 분리되었고, Smoke Receipt가 생성되지 않았다.

## 교정

- `Start-Process -ArgumentList`를 제거한다.
- `System.Diagnostics.ProcessStartInfo`를 사용한다.
- 첫 번째 Electron 인수를 명시적으로 큰따옴표로 감싼다.
- 설치된 `yolla-minimal-v1` Source는 수정하지 않는다.
- 루트 Launcher BAT·PS1만 Timestamp Backup 후 교체한다.
- 임시 State·Profile로 Smoke Receipt PASS를 확인한다.
- PASS 후에만 별도 Minimal Runtime을 실행한다.

## Artifact

```text
ONE_CLICK=REPAIR_AI_YOLLA_MINIMAL_V1_LAUNCHER_ONE_CLICK.bat
ONE_CLICK_SIZE=6811
ONE_CLICK_SHA256=17bb43c6d40ae42369c7209460606fe70ea3dda5c233ef4d38e2f1e6a503536e
ONE_CLICK_DRIVE_ID=1c4tKwZuVOG3GxcXhih04p_8wZ3nl8Eqb

SOURCE_ZIP=AI_YOLLA_MINIMAL_V1_LAUNCHER_REPAIR_V1.zip
SOURCE_ZIP_SIZE=4345
SOURCE_ZIP_SHA256=18c3d532b6fd1f926c6201ff10b70eec5348ab41c33ecefdda273a6c75591313
SOURCE_ZIP_DRIVE_ID=1-3eNQcR8IlWod5ai5QSsahHoAX_iIJaB
```

## Receipt

```text
E:\SOURCE FACTORY\.yolla\yolla-workspace-minimal-v1\MINIMAL_V1_LAUNCHER_REPAIR_RECEIPT.json
```

Target PC 실행 전에는 Live PASS를 주장하지 않는다.
