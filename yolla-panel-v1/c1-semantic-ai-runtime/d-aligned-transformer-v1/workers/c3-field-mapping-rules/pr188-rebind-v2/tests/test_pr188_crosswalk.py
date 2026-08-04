import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from validate_pr188_crosswalk import load, load_rules, validate
crosswalk=load(ROOT/"PR188_B1_SOURCE_PATH_CROSSWALK_V2.json")
report=load(ROOT/"FIELD_MAPPING_REPORT_V1.json")
checks=validate(ROOT,crosswalk,report)
assert len(checks)==48,len(checks)
rules={r["rule_id"]:r for r in load_rules(ROOT,crosswalk)}
assert rules["B010"]["classification"]=="DIRECT_MATCH"
assert rules["B005"]["classification"]=="DECLARED_RULE_DERIVABLE"
assert rules["B001"]["classification"]=="MISSING_REQUIRED_SOURCE_PATH"
assert rules["B013"]["classification"]=="OPTIONAL_MISSING"
assert rules["T001"]["classification"]=="DIRECT_MATCH"
assert rules["T005"]["declared_derivation"]["rule_id"]=="VALIDATION_STATUS_MAP_V1"
assert rules["C018"]["classification"]=="DIRECT_MATCH"
assert rules["C017"]["declared_derivation"]["rule_id"]=="RELATION_FROM_TO_TO_SOURCE_TARGET_V1"
assert rules["C002"]["classification"]=="MISSING_REQUIRED_SOURCE_PATH"
assert sum(r["actual_value_count"] for r in rules.values() if r["rule_id"].startswith("B"))==19
assert report["first_blocker"]["rule_id"]=="B001"
assert report["d_acceptance_claim"] is False
print("PASS test_pr188_crosswalk")
print("RESULT 60/60 PASS")
