# YOLLA Site Analyzer Wave 1

공통 `AnalyzerCore`, 내장 Analyzer Workspace, 독립 `BrowserWindow`가 동일 Browser Partition, Analyzer State, Adapter Registry, Run History를 공유하는 실행형 통합 Source입니다.

## 실행

```bash
npm test
npm run demo
```

Windows에서는 `RUN_ANALYZER_TESTS.bat`과 `RUN_ANALYZER_DEMO.bat`을 사용할 수 있습니다.

## 통합

```js
import { installSiteAnalyzer } from './src/integration-entry.mjs';
const analyzer = installSiteAnalyzer({ BrowserWindow, ipcMain, session });
const embedded = analyzer.createEmbeddedAnalyzer();
const standalone = analyzer.openStandaloneAnalyzer();
```

A-3~A-7 및 B-2~B-6 Port는 `AnalyzerCore.registerModule(name, module)`로 실제 워커 구현으로 교체할 수 있으며, 기본 구현만으로도 등록→관찰→구조·Endpoint 분석→Adapter 생성→Replay→1~20개 샘플 추출→Preview·Package 흐름을 실행합니다.

`Production`, `Ready`, `Merge` 상태를 선언하지 않습니다. 실제 Target-PC Electron 실행과 외부 사이트 호출은 별도 Live Receipt가 필요합니다.
