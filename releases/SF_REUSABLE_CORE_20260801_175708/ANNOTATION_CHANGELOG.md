# Reusable Core Annotation Changelog

This file records documentation-oriented annotation updates for `SF_REUSABLE_CORE_20260801_175708`.

## 2026-08-01 — detailed user annotations added

Added and linked detailed usage annotations so future users can understand and safely reuse the Source Factory core assets without reading the entire historical development context.

### Added documents

```text
USER_START_HERE.md
CORE_ASSET_ANNOTATION_GUIDE.md
_USAGE_NOTES/PC_AGENT_BINDING_ADAPTER.usage.md
_USAGE_NOTES/PROJECT_PANEL_IDENTITY.usage.md
ANNOTATION_CHANGELOG.md
```

### Updated documents

```text
README_REUSABLE_CORE.md
```

### Annotation policy

Runtime source files were not modified for large explanatory comments. Instead, detailed comments are provided as guide documents and sidecar usage notes. This keeps executable source stable while making the core easier to reuse.

### Main clarified assets

```text
safe_panel_v10/safe_panel_main.js
safe_panel_v10/safe_panel_preload.js
safe_panel_v10/safe_panel_renderer.js
safe_panel_v10/safe_panel.html
safe_panel_v10/ipc/stage4StationBindingHandlers.js
src/shared/stage4/promptQueueManager.js
src/shared/stage4/sequentialPromptSender.js
src/shared/stage4/executionResultCollector.js
src/shared/stage4/sourceFileBlockExtractor.js
src/shared/stage4/sourceFileFormatValidator.js
src/shared/stage4/stores/*.js
```

### Key binding guidance

```text
PC Agent dispatch target: handleStage4DispatchNextPrompt
PC Agent result target:   handleStage4RunCheck
Storage target:           handleStage4AppendStationRecords
```
