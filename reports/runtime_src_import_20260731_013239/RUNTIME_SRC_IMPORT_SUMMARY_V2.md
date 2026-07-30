# Source Factory Runtime SRC Import V2

generated_at: 2026-07-31T01:32:39.6210833+09:00
review_dir: E:\YOLLA\source-factory-core\src_candidate\p0_runtime_review_20260731_012842
runtime_dest_root: E:\YOLLA\source-factory-core\src\runtime_import\p0_runtime_import_20260731_013239
ops_dest_root: E:\YOLLA\source-factory-core\ops_import\p0_ops_import_20260731_013239

## Summary

| Item | Count |
|---|---:|
| Runtime candidates | 9 |
| Runtime copied | 9 |
| OPS candidates | 2 |
| OPS copied | 2 |
| Runtime SHA mismatch | 0 |
| OPS SHA mismatch | 0 |

## Status

PASS_RUNTIME_SRC_IMPORT_READY_FOR_010

## Policy

- This V2 script is compatible with Windows PowerShell 5.x.
- It does not use System.IO.Path.GetRelativePath.
- Runtime candidates are copied to src/runtime_import/, not merged into existing production modules.
- OPS candidates are copied to ops_import/.
- Final integration into stable src modules requires 010 static verify and Commander approval.
