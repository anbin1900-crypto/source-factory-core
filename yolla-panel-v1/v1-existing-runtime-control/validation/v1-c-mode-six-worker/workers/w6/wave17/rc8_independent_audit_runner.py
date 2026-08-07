#!/usr/bin/env python3
import json, hashlib, sys
from pathlib import Path

REQUIRED = {
  "single_immutable_artifact", "exact_runtime_members", "resolver_invoked",
  "baseline_full_clone", "ui_hook_and_rollback", "fixed_profile_partition",
  "full_component_smoke", "launcher_backup_switch", "exact_rollback",
  "state_log_receipt_profile_preservation", "legacy_a_e_zero"
}

def main(path: str) -> int:
    p = Path(path)
    data = p.read_bytes()
    obj = json.loads(data)
    present = set(obj.get("passed_gates", []))
    missing = sorted(REQUIRED - present)
    result = {
      "artifact": str(p),
      "sha256": hashlib.sha256(data).hexdigest(),
      "missing_gates": missing,
      "offline_acceptance": "PASS" if not missing else "FAIL",
      "target_pc_live_gate": "PENDING_RECEIPT"
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if not missing else 2

if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: rc8_independent_audit_runner.py <candidate-manifest.json>")
    raise SystemExit(main(sys.argv[1]))
