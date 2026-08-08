import json, hashlib

def canonical(obj):
    return json.dumps(obj, sort_keys=True, separators=(",",":"), ensure_ascii=False)

def generate(contract_bundle):
    unresolved=sorted([k for k,v in contract_bundle.get("source_pointers",{}).items() if not v])
    package={
      "version":"1.0",
      "verification_status":"VERIFIED" if not unresolved else "BLOCKED_UNRESOLVED_INPUTS",
      "unresolved_inputs":unresolved,
      "components":contract_bundle.get("components",{}),
      "entrypoint":"entrypoint.py",
      "input_schema":"input_schema.json",
      "output_schema":"output_schema.json",
      "fixture_location":"fixture_bundle.json",
      "failure_codes":"failure_codes.json",
      "source_pointers":"source_pointers.json"
    }
    return package, hashlib.sha256(canonical(package).encode()).hexdigest()
