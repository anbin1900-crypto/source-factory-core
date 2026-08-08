# B-5 Ten-Site AI Blueprint Materialization V1

This append-only V8 package extends the V7 real-site materialization layer without rewriting V6 or V7 records.

It provides ten anonymous authority slots, a lossless source-field ontology, eight real-estate product blueprint archetypes, site-specific extension records, and late binding for A-4, A-5, and B-3 evidence.

Actual site names, URLs, sessions, secrets, PII, and observed values are never guessed. Missing producer evidence remains `WAITING_INPUT`; source semantics remain `CANDIDATE`, `UNKNOWN`, or `CONFLICT` until an exact evidence pointer is supplied. D-group canonical schema authority is not exercised.

Local validation:

```text
PYTHONPATH=src python -m unittest discover -s tests -p 'test_*.py' -v
```

Materialization:

```text
python src/ten_site_blueprint_materializer.py fixtures/ten_site_input_v1.json materialized
```
