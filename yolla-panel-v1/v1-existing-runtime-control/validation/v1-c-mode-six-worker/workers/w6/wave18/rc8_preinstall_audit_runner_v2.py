#!/usr/bin/env python3
import json, sys
from pathlib import Path

REQUIRED_WORKERS = {"W1", "W2", "W3", "W4", "W5"}
REQUIRED_FIXTURES = {
    "STALE_W5_HEAD", "MANIFEST_MISMATCH", "MISSING_LIVE_RECEIPT",
    "SYNTHETIC_SCREENSHOT", "MISSING_RESTART_EVIDENCE", "ROLLBACK_READBACK_LOSS"
}

def main(matrix_path: str, receipt_path: str) -> int:
    matrix = json.loads(Path(matrix_path).read_text(encoding="utf-8"))
    receipt = json.loads(Path(receipt_path).read_text(encoding="utf-8"))
    workers = matrix.get("worker_results", {})
    if set(workers) != REQUIRED_WORKERS:
        raise SystemExit("WORKER_SET_MISMATCH")
    for role in ("W1", "W2", "W3", "W4"):
        if workers[role].get("status") != "PASS":
            raise SystemExit(f"{role}_NOT_PASS")
    if workers["W5"].get("status") != "NOT_EVALUATED":
        raise SystemExit("W5_MUST_BE_NOT_EVALUATED")
    fixtures = {x.get("name"): x for x in receipt.get("fixtures", [])}
    if set(fixtures) != REQUIRED_FIXTURES:
        raise SystemExit("FIXTURE_SET_MISMATCH")
    if any(x.get("status") != "PASS" for x in fixtures.values()):
        raise SystemExit("FAILURE_FIXTURE_FAILURE")
    if matrix.get("target_pc_pass_claimed") is not False:
        raise SystemExit("PREMATURE_TARGET_PC_PASS")
    print("RC8_PREINSTALL_AUDIT_V2_PASS_PREPARATION_ONLY")
    return 0

if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: runner matrix.json receipt.json")
    raise SystemExit(main(sys.argv[1], sys.argv[2]))
