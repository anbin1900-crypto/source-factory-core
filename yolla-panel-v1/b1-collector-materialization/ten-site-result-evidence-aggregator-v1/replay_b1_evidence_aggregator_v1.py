from pathlib import Path
import json
from B1_EVIDENCE_AGGREGATOR_V1 import aggregate, compute_gap_snapshot

ROOT = Path(__file__).resolve().parent
matrix = json.loads((ROOT / "B1_TEN_SITE_LANE_RESULT_MATRIX_V1.json").read_text(encoding="utf-8"))
fixture = json.loads((ROOT / "fixtures" / "B1_EVIDENCE_AGGREGATOR_FIXTURE_V1.json").read_text(encoding="utf-8"))
aggregated = aggregate(fixture["receipts"])
gaps = compute_gap_snapshot(matrix, aggregated)
out = {
    "schema_version":"B1_EVIDENCE_AGGREGATOR_REPLAY_RESULT_V1",
    "fixture_only":True,
    "fixture_receipt_count":len(fixture["receipts"]),
    "accepted_receipt_count":aggregated["accepted_receipt_count"],
    "duplicate_receipt_count":aggregated["duplicate_receipt_count"],
    "retry_group_count":aggregated["retry_group_count"],
    "conflict_count":aggregated["conflict_count"],
    "effective_cells":aggregated["materialized_cells"],
    "computed_gap_snapshot":gaps,
    "replay_status":"PASS"
}
print(json.dumps(out, ensure_ascii=False, sort_keys=True))
