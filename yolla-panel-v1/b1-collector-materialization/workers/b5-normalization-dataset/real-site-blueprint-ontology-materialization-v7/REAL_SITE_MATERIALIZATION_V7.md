# B-5 Real-Site Blueprint Ontology Materialization V7

This layer consumes Cycle7 producer receipts without rewriting the Cycle6 blueprint package.

- `OBSERVED` requires an exact producer head, artifact blob, SHA-256, path and JSON Pointer.
- Missing live receipts remain `EXECUTION_PENDING`; they are never converted into a Live PASS.
- Uncertain mappings remain `UNKNOWN` or `CANDIDATE`.
- All source fields are copied losslessly into a separate append-only V7 binding layer.
- D canonical schema decisions and Production writes are forbidden.

Run:

```text
python -m unittest -v test_real_site_materializer.py
```
