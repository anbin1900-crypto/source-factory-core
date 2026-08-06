# YOLLA Site Analyzer Wave2 — B-1 Single Product

Full runnable bytes: `B1_SITE_ANALYZER_WAVE2_SINGLE_PRODUCT_V1.zip`.

Extract the ZIP, then use the canonical launcher `launcher.cjs`; `RUN_SITE_ANALYZER_WAVE2.bat` is only a Windows shim.

- `node launcher.cjs auto`: Electron when installed; otherwise actual Node + system Chromium runtime.
- `node launcher.cjs sample`: local HTTP test site → HTTP bridge → Chromium CDP → inference → recipe → adapter → exactly 10 records → preview/export.
- `node launcher.cjs electron`: one Electron app process with dashboard and analyzer target windows on one persistent partition.
- `node launcher.cjs verify`: immutable member hash verification.
- `node launcher.cjs test`: package/product tests.

`MODULE_BINDINGS.json` deliberately separates each worker's current Evidence Head from the exact bytes packaged. A newer PR Head is never silently promoted as vendored code.

Boundaries: no database work, Production, Ready transition, or Merge.
