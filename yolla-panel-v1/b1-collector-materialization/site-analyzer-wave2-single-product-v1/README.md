# YOLLA Site Analyzer Wave2 — B-1 Single Product

GitHub is the Source/Manifest/Binding/Report authority for this B-1 product. The immutable runnable package bytes are stored in Google Drive as file ID `1peeypCRTIzWjaIQzWOQrpv9dv8ZX8H7c`.

Package: `B1_SITE_ANALYZER_WAVE2_SINGLE_PRODUCT_V1.zip` — 58,272 bytes — SHA-256 `6cc052b0693ca60a44ac2be640b41c4445612d2555dde4fe524302552a884317` — 46 entries — raw-download and ZIP CRC readback PASS.

After extracting the ZIP, canonical launcher is `launcher.cjs`; `RUN_SITE_ANALYZER_WAVE2.bat` is only a Windows shim.

- `node launcher.cjs auto`: Electron when installed; otherwise actual Node + system Chromium runtime.
- `node launcher.cjs sample`: local HTTP test site → HTTP bridge → Chromium CDP → inference → recipe → adapter → exactly 10 records → preview/export.
- `node launcher.cjs electron`: one Electron app process with dashboard and target windows on one persistent partition.
- `node launcher.cjs verify`: immutable member hash verification.
- `node launcher.cjs test`: product/runtime tests.

`MODULE_BINDINGS.json` separates current worker Evidence Heads from exact packaged byte lineage. The first GitHub binary-copy attempt was detected as truncated by Remote Readback and was removed rather than promoted.

Boundaries: no database work, Production, Ready transition, or Merge.
