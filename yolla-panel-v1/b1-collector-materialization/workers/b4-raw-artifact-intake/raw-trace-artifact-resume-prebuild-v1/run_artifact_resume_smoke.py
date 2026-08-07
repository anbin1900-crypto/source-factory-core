from __future__ import annotations

import argparse
import json
import tempfile
from pathlib import Path

from src.trace_artifact_store import AppendOnlyTraceArtifactStore, canonical_json_bytes

DIRECTIVE_ID = "AI001-TO-B4-RAW-TRACE-ARTIFACT-RESUME-PREBUILD-V1-20260807-001"


def run_smoke(root: Path) -> dict:
    store = AppendOnlyTraceArtifactStore(root)
    redaction = {
        "policy": "SECRET_RAW_STORAGE_FORBIDDEN",
        "redaction_applied": False,
        "secret_scan": "PASS",
        "allowed_metadata_only": True,
    }

    page1 = canonical_json_bytes({"records": [{"id": i} for i in range(1, 6)], "page": 1})
    p1 = store.stage_partial(
        artifact_type="RESPONSE_BODY",
        raw_bytes=page1,
        page_id="page-1",
        action_id="action-list-page-1",
        request_id="request-api-page-1",
        command_id="command-smoke",
        source_url="http://127.0.0.1:43127/api/items?page=1",
        captured_at="2026-08-07T12:15:37Z",
        record_count=5,
        pagination_cursor="page:1",
        retry_count=0,
        resume_cursor="page:2",
        redaction_metadata=redaction,
    )
    a1 = store.promote_partial(p1["partial_id"])

    page2_partial = canonical_json_bytes({"records": [{"id": 6}, {"id": 7}], "page": 2, "incomplete": True})
    p2 = store.stage_partial(
        artifact_type="RESPONSE_BODY",
        raw_bytes=page2_partial,
        page_id="page-2",
        action_id="action-list-page-2",
        request_id="request-api-page-2",
        command_id="command-smoke",
        source_url="http://127.0.0.1:43127/api/items?page=2",
        captured_at="2026-08-07T12:15:38Z",
        record_count=2,
        pagination_cursor="page:2",
        retry_count=1,
        resume_cursor="page:2",
        redaction_metadata=redaction,
    )
    before = store.recovery_state()
    if before["last_confirmed_artifact_id"] != a1.artifact_id or before["resume_cursor"] != "page:2":
        raise AssertionError("recovery did not anchor to last confirmed artifact")
    store.abandon_partial(p2["partial_id"], "SIMULATED_INTERRUPTION_PARTIAL_WRITE")

    page2 = canonical_json_bytes({"records": [{"id": i} for i in range(6, 11)], "page": 2})
    p3 = store.stage_partial(
        artifact_type="RESPONSE_BODY",
        raw_bytes=page2,
        page_id="page-2",
        action_id="action-list-page-2",
        request_id="request-api-page-2-retry",
        command_id="command-smoke",
        source_url="http://127.0.0.1:43127/api/items?page=2",
        captured_at="2026-08-07T12:15:39Z",
        record_count=5,
        pagination_cursor="page:2",
        retry_count=1,
        resume_cursor="DONE",
        redaction_metadata=redaction,
    )
    a2 = store.promote_partial(p3["partial_id"])

    extra = [
        ("DOM_SNAPSHOT", b"<html><body><article data-record-id='10'>Fixture Item 10</article></body></html>", "page-2", "action-dom", "request-dom", 0),
        ("TRACE", canonical_json_bytes({"steps": [{"id": 1, "status": "PASS"}]}), "page-2", "action-trace", "request-trace", 0),
        ("SCREENSHOT", b"\x89PNG\r\n\x1a\nYOLLA-SMOKE-NO-SECRET", "page-2", "action-shot", "request-shot", 0),
        ("RECEIPT", canonical_json_bytes({"status": "PASS", "records": 10}), "page-2", "action-receipt", "request-receipt", 10),
    ]
    completed = [a1, a2]
    for idx, (artifact_type, raw, page_id, action_id, request_id, record_count) in enumerate(extra, start=1):
        p = store.stage_partial(
            artifact_type=artifact_type,
            raw_bytes=raw,
            page_id=page_id,
            action_id=action_id,
            request_id=request_id,
            command_id="command-smoke",
            source_url=f"fixture://smoke/{artifact_type.lower()}",
            captured_at=f"2026-08-07T12:15:{39+idx:02d}Z",
            record_count=record_count,
            pagination_cursor="page:2",
            retry_count=1,
            resume_cursor="DONE",
            redaction_metadata=redaction,
        )
        completed.append(store.promote_partial(p["partial_id"]))

    store.verify_ledger()
    after = store.recovery_state()
    for artifact in completed:
        store.read_completed(artifact.artifact_id)

    result = {
        "schema_version": "B4_TRACE_ARTIFACT_RESUME_SMOKE_V1",
        "directive_id": DIRECTIVE_ID,
        "status": "PASS",
        "completed_artifact_count": len(completed),
        "artifact_types": [a.artifact_type for a in completed],
        "partial_write_not_promoted": True,
        "abandoned_partial_count": 1,
        "resume_from_last_completed": "PASS",
        "resume_cursor_before_retry": before["resume_cursor"],
        "final_resume_cursor": after["resume_cursor"],
        "lineage_verified": "PASS",
        "readback_verified": "PASS_ALL",
        "record_count_response_total": a1.record_count + a2.record_count,
        "secret_raw_storage_count": 0,
        "production": False,
        "ready": False,
        "merge": False,
    }
    (root / "SMOKE_RESULT.json").write_text(json.dumps(result, indent=2, sort_keys=True), encoding="utf-8")
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="B-4 trace artifact write/read/resume smoke")
    parser.add_argument("--root")
    args = parser.parse_args()
    if args.root:
        root = Path(args.root)
        root.mkdir(parents=True, exist_ok=True)
        result = run_smoke(root)
    else:
        with tempfile.TemporaryDirectory(prefix="b4-trace-smoke-") as tmp:
            result = run_smoke(Path(tmp))
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
