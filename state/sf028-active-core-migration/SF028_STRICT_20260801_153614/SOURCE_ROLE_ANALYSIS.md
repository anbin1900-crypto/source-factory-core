# SF_028 Strict Source Role Analysis

Run: `SF028_STRICT_20260801_153614`

Only runtime execution files selected from the local D: source authority are listed below.

| Path | Role | Why retained |
|---|---|---|
| `20260701/STAGE2_ALL_WORKERS_OUTPUT_REPAIRED_v1.txt` | RUNTIME_DATA_OR_CONFIG | dependency:explicit_file_literal |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/package-lock.json` | DEPENDENCY_INSTALL_SEED | runtime_package_seed |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/package.json` | DEPENDENCY_INSTALL_SEED | runtime_package_seed |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/safe_panel_v10/ipc/safePanelV0106RecoveryHandlers.js` | IPC_HANDLER_RUNTIME | dependency:js_require, safe_panel_live_bundle |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/safe_panel_v10/ipc/stage4StationBindingHandlers.js` | IPC_HANDLER_RUNTIME | dependency:js_require, safe_panel_live_bundle |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/safe_panel_v10/safe_panel.css` | RENDERER_UI_ASSET | dependency:web_asset, safe_panel_live_bundle |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/safe_panel_v10/safe_panel.html` | RENDERER_UI_ASSET | dependency:path_join_dirname, safe_panel_live_bundle |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/safe_panel_v10/safe_panel_main.js` | ELECTRON_MAIN_ENTRY | electron_main_entry, safe_panel_live_bundle |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/safe_panel_v10/safe_panel_preload.js` | ELECTRON_PRELOAD_BRIDGE | dependency:path_join_dirname, safe_panel_live_bundle |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/safe_panel_v10/safe_panel_renderer.js` | RENDERER_RUNTIME | dependency:web_asset, safe_panel_live_bundle |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/safe_panel_v10/safe_terminal.css` | RENDERER_UI_ASSET | dependency:web_asset, safe_panel_live_bundle |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/safe_panel_v10/safe_terminal.html` | RENDERER_UI_ASSET | dependency:path_join_dirname, safe_panel_live_bundle |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/safe_panel_v10/safe_terminal_preload.js` | ELECTRON_PRELOAD_BRIDGE | dependency:path_join_dirname, safe_panel_live_bundle |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/safe_panel_v10/safe_terminal_renderer.js` | RENDERER_RUNTIME | dependency:web_asset, safe_panel_live_bundle |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/core/commanderReportController.js` | JAVASCRIPT_RUNTIME_MODULE | dependency:js_require |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/core/constitutionLoader.js` | JAVASCRIPT_RUNTIME_MODULE | dependency:js_require |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/core/promptBuilder.js` | JAVASCRIPT_RUNTIME_MODULE | dependency:js_require |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/core/stage2Finalizer.js` | JAVASCRIPT_RUNTIME_MODULE | dependency:js_require |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/core/taskInstructionManager.js` | JAVASCRIPT_RUNTIME_MODULE | dependency:js_require |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/main/main.js` | JAVASCRIPT_RUNTIME_MODULE | dependency:package_main |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/main/stage2IpcHandlers.js` | JAVASCRIPT_RUNTIME_MODULE | dependency:js_require |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/main/stage3IpcHandlers.js` | JAVASCRIPT_RUNTIME_MODULE | dependency:js_require |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/main/stage4HardWindowControl.js` | JAVASCRIPT_RUNTIME_MODULE | dependency:js_require |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/main/stage4PanelIpcHandlers.js` | JAVASCRIPT_RUNTIME_MODULE | dependency:js_require |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/main/stage4PanelLaunchControlV07Main.js` | JAVASCRIPT_RUNTIME_MODULE | dependency:js_require |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/main/stage4PanelLaunchControlV08Main.js` | JAVASCRIPT_RUNTIME_MODULE | dependency:js_require |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/main/stage4ProjectPanelV04MainInjection.js` | JAVASCRIPT_RUNTIME_MODULE | dependency:js_require |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/main/stage4ProjectPanelV06AutoFixMain.js` | JAVASCRIPT_RUNTIME_MODULE | dependency:js_require |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/main/stage4StandaloneLaunchPanelV09Main.js` | JAVASCRIPT_RUNTIME_MODULE | dependency:js_require |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/main/windowManager.js` | JAVASCRIPT_RUNTIME_MODULE | dependency:js_require |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/preload/gptPreload.js` | ELECTRON_PRELOAD_BRIDGE | dependency:path_join_dirname |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/renderer/buttonHandlers.js` | JAVASCRIPT_RUNTIME_MODULE | dependency:web_asset |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/renderer/index.html` | RENDERER_UI_ASSET | dependency:explicit_file_literal, dependency:path_join_dirname |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/renderer/koreanLabels.js` | JAVASCRIPT_RUNTIME_MODULE | dependency:web_asset |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/renderer/stage2MenuView.js` | JAVASCRIPT_RUNTIME_MODULE | dependency:web_asset |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/renderer/stage3CommanderPanel.css` | RENDERER_UI_ASSET | dependency:web_asset |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/renderer/stage3CommanderPanel.js` | JAVASCRIPT_RUNTIME_MODULE | dependency:web_asset |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/renderer/stage3CommanderReturnInboxPanel.css` | RENDERER_UI_ASSET | dependency:web_asset |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/renderer/stage3CommanderReturnInboxPanel.js` | JAVASCRIPT_RUNTIME_MODULE | dependency:web_asset |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/renderer/stage3PanelAttach.js` | JAVASCRIPT_RUNTIME_MODULE | dependency:web_asset |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/renderer/stage3WorkerDispatchInboxPanel.css` | RENDERER_UI_ASSET | dependency:web_asset |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/renderer/stage3WorkerDispatchInboxPanel.js` | JAVASCRIPT_RUNTIME_MODULE | dependency:web_asset |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/renderer/stage3WorkerReturnPanel.css` | RENDERER_UI_ASSET | dependency:web_asset |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/renderer/stage3WorkerReturnPanel.js` | JAVASCRIPT_RUNTIME_MODULE | dependency:web_asset |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/renderer/stage4PanelAttach.js` | JAVASCRIPT_RUNTIME_MODULE | dependency:web_asset |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/renderer/stage4PanelLaunchControlV07.css` | RENDERER_UI_ASSET | dependency:web_asset |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/renderer/stage4PanelLaunchControlV07.js` | JAVASCRIPT_RUNTIME_MODULE | dependency:web_asset |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/renderer/stage4PanelLaunchControlV08.css` | RENDERER_UI_ASSET | dependency:web_asset |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/renderer/stage4PanelLaunchControlV08.js` | JAVASCRIPT_RUNTIME_MODULE | dependency:web_asset |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/renderer/stage4ProjectPanel.css` | RENDERER_UI_ASSET | dependency:explicit_file_literal, dependency:web_asset |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/renderer/stage4ProjectPanel.html` | RENDERER_UI_ASSET | dependency:explicit_file_literal |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/renderer/stage4ProjectPanel.js` | JAVASCRIPT_RUNTIME_MODULE | dependency:web_asset |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/renderer/stage4ProjectPanelPipelineV02.js` | JAVASCRIPT_RUNTIME_MODULE | dependency:web_asset |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/renderer/stage4ProjectPanelPipelineV03.js` | JAVASCRIPT_RUNTIME_MODULE | dependency:web_asset |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/renderer/stage4ProjectPanelPipelineV04.js` | JAVASCRIPT_RUNTIME_MODULE | dependency:web_asset |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/renderer/stage4ProjectPanelPipelineV05Cleanup.css` | RENDERER_UI_ASSET | dependency:web_asset |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/renderer/stage4ProjectPanelPipelineV05Cleanup.js` | JAVASCRIPT_RUNTIME_MODULE | dependency:web_asset |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/renderer/stage4ProjectPanelV06AutoFix.css` | RENDERER_UI_ASSET | dependency:web_asset |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/renderer/stage4ProjectPanelV06AutoFix.js` | JAVASCRIPT_RUNTIME_MODULE | dependency:web_asset |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/renderer/stage4ProjectPanelV06TopFix.css` | RENDERER_UI_ASSET | dependency:web_asset |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/renderer/stage4ProjectPanelV06TopFix.js` | JAVASCRIPT_RUNTIME_MODULE | dependency:web_asset |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/renderer/stage4StandaloneLaunchPanelV09.css` | RENDERER_UI_ASSET | dependency:explicit_file_literal, dependency:web_asset |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/renderer/stage4StandaloneLaunchPanelV09.html` | RENDERER_UI_ASSET | dependency:explicit_file_literal |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/renderer/stage4StandaloneLaunchPanelV09.js` | JAVASCRIPT_RUNTIME_MODULE | dependency:web_asset |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/renderer/statusView.js` | JAVASCRIPT_RUNTIME_MODULE | dependency:web_asset |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/renderer/styles.css` | RENDERER_UI_ASSET | dependency:web_asset |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/src/shared/windowRegistry.js` | JAVASCRIPT_RUNTIME_MODULE | dependency:js_require |
| `assembled/20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE/tools/stage4_verify_candidate.js` | JAVASCRIPT_RUNTIME_MODULE | dependency:package_script |
