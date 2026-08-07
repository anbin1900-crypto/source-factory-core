# B-5 Blueprint Ontology Binding Dataset V4

`A0-TO-B5-BLUEPRINT-ONTOLOGY-BINDING-DATASET-V4-20260808-001`의 fixture-first 구현이다.

## 구현 범위

- `AI_PRODUCT_BLUEPRINT_DATASET_V1`
- `REAL_ESTATE_LISTING_FIELD_ONTOLOGY_V1`
- `SITE_LISTING_FIELD_BINDING_V1`
- `REAL_ESTATE_SITE_CAPABILITY_PROFILE_V1`
- `YOLLA_LISTING_LEDGER_SCHEMA_CANDIDATE_V1`
- source field → canonical candidate → site field 관계
- `read_transform`·`write_transform`·evidence pointer 무손실 보존
- `UNKNOWN`·`CANDIDATE` 유지와 근거 없는 `CANONICAL` 거부
- 동일 Result 또는 Blueprint 재수신 idempotency
- `COMPLETE_RESULT_PENDING → RESULT_AVAILABLE`
- append-only checkpoint, contextless resume, JSON·CSV·XLSX export roundtrip

## 실행

```text
python3 -m unittest discover -s tests -v
python3 cli/b5_blueprint_ontology_binding_cli.py smoke \
  --workdir <isolated-workdir> \
  --fixture fixtures/blueprint_ontology_fixture_v1.json
```

## 경계

```text
TARGET_PC_EXECUTION=false
LIVE_SITE_CALL=false
TUNNEL_CHANGE=false
D_CANONICAL_DB_WRITE=false
PRODUCTION=false
READY=false
MERGE=false
```
