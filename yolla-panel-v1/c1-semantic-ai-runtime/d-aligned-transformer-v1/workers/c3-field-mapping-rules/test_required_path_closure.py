import json
from pathlib import Path
ROOT=Path(__file__).resolve().parent
from validate_required_path_closure import validate,load,load_shards
r=validate(ROOT)
assert r["status"]=="PASS"
assert r["check_count"]==29,r["check_count"]
m=load(ROOT/"PR188_REQUIRED_SOURCE_PATH_CLOSURE_MATRIX_V1.json")
rows=load_shards(ROOT,m)
assert len(rows)==22
assert len({x["RULE_ID"] for x in rows})==22
assert all(x["RESOLUTION_OWNER"] for x in rows)
assert all(x["MINIMUM_REQUIRED_CHANGE"] for x in rows)
assert all(x["C4_PACKAGE_BEHAVIOR"] for x in rows)
assert all(x["RETRY_TRIGGER"] for x in rows)
assert sum(1 for x in rows if x["RESOLUTION_CLASS"]=="UNRESOLVED_EXTERNAL_AUTHORITY")==0
print(json.dumps({"status":"PASS","validator_checks":r["check_count"],"independent_assertions":8,"total_checks":r["check_count"]+8,"deterministic_bundle_sha256":r["deterministic_bundle_sha256"]},indent=2))
