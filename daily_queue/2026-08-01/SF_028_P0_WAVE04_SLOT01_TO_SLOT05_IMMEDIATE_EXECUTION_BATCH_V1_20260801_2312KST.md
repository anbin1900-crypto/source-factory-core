# SF_028 P0 WAVE 04 — SLOT 01~05 IMMEDIATE EXECUTION BATCH

BATCH_ID: `SF_028_P0_WAVE04_SLOT01_TO_SLOT05_IMMEDIATE_EXECUTION_BATCH_V1_20260801_2312KST`
CONSTITUTION_VERSION: `2.1.2-COMPACT`
CURRENT_STATUS: `START_NOW`
PIPELINE_MODE: `MAX_PARALLEL_OVERLAP`

## Authority

- maximum-parallel policy: `8b90fb4f9ded9a9f03875b6d01f05c37c15b250d`
- Wave 3 Commander intake: `dcd7a410c1a2cd4105049719d13733185ba42dde`
- Wave 3 SLOT 06 integration prompt: `b95cebc69e7fb52b859b75d49fd92b1cdd1e36e8`
- Wave 4 read-only classification is independent of Wave 3 closure.
- Wave 4 integrated closure and promotion remain gated.

## Slot packages

| SLOT | Drive file ID | ZIP SHA-256 | Size | Count |
|---|---|---|---:|---:|
| 01 | `1OtaH7K-GvONtTXvLLpBqtaFcmOgfQWMt` | `018e62d52a313588dc16ca7f3bf2e6fc25b306c2125a17328b731ed52e6d79ed` | 43964 | 12 |
| 02 | `12GtYgmvcNkKbu3i6wiykNpQAEosxB7jT` | `b910906f62ae520071b49f0e6b521386e5169b4bb3e1da7559cf71a2ace8af42` | 50196 | 12 |
| 03 | `1ODzXGrP9RVeRLBPnP8MXZw-SpouI-SC8` | `1421cec489e6ddde1e047bf5471371aef848173b48589f36b78852b4b1a68bf4` | 61644 | 12 |
| 04 | `17c9mZgizzX2d2OuskgS4CmAGhhZ7IKuw` | `6b925225013eaa3639032eba69cfff2833e05084f1492fbf3d0680951157f24a` | 57184 | 12 |
| 05 | `1ymGgYjIyveH191lI6ugaRDN229ew5tpM` | `575a2ce19c504ee25a214b86fc7a51d99a3d4b126e6c15d5534b92c7bf3dfecc` | 46095 | 12 |

## Common work

Each worker must:

1. download only its assigned ZIP;
2. verify ZIP filename, size, SHA-256 and embedded `SLOT_MANIFEST.json`;
3. verify exactly 12 unique assigned Source IDs and all per-source hashes;
4. read actual source contents;
5. assign exactly one primary classification per candidate;
6. record actual function, I/O, symbols, dependencies, external effects, coupling, lineage, verification level, evidence, risks and next action;
7. publish one result JSON and one terminal WORKER_REPORT.

Allowed classifications:

```text
DIRECT_REUSE
ADAPTER_REQUIRED
REFERENCE_ONLY
PROJECT_BOUND
EXACT_DUPLICATE
SUPERSEDED
SANITIZE_REQUIRED
REJECTED
REINSPECTION_REQUIRED
```

## Boundaries

- static inspection only
- no source execution
- no source modification
- no dependency installation
- no runtime/service/browser/external API/middleware start
- no official promotion, Ready or Merge
- no OLD_ROOT deletion

## Output paths

```text
reports/sf028_p0_wave04_slot0X_<timestamp>/CLASSIFICATION_RESULTS_SLOT_0X.json
reports/sf028_p0_wave04_slot0X_<timestamp>/WORKER_REPORT_SLOT_0X.md
```

Failure or inability must still publish a terminal report with the exact reason. Wave 4 is the last 60-candidate classification wave for this 240-candidate package.
