from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from src.trace_artifact_store import AppendOnlyTraceArtifactStore, TraceArtifactError
from run_artifact_resume_smoke import run_smoke


class TraceArtifactStoreTest(unittest.TestCase):
    def test_smoke(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = run_smoke(Path(tmp))
            self.assertEqual(result["status"], "PASS")
            self.assertEqual(result["record_count_response_total"], 10)
            self.assertTrue(result["partial_write_not_promoted"])

    def test_secret_raw_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = AppendOnlyTraceArtifactStore(Path(tmp))
            with self.assertRaises(TraceArtifactError):
                store.stage_partial(
                    artifact_type="TRACE",
                    raw_bytes=b"Authorization: Bearer abcdefghijklmnop",
                    page_id="p", action_id="a", request_id="r", command_id="c",
                    source_url="fixture://x", captured_at="2026-08-07T00:00:00Z",
                    record_count=0, pagination_cursor=None, retry_count=0, resume_cursor=None,
                    redaction_metadata={"secret_scan": "PASS"},
                )

    def test_secret_metadata_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = AppendOnlyTraceArtifactStore(Path(tmp))
            with self.assertRaises(TraceArtifactError):
                store.stage_partial(
                    artifact_type="TRACE",
                    raw_bytes=b"safe",
                    page_id="p", action_id="a", request_id="r", command_id="c",
                    source_url="fixture://x", captured_at="2026-08-07T00:00:00Z",
                    record_count=0, pagination_cursor=None, retry_count=0, resume_cursor=None,
                    redaction_metadata={"token": "x"},
                )

    def test_partial_never_last_confirmed(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = AppendOnlyTraceArtifactStore(Path(tmp))
            store.stage_partial(
                artifact_type="TRACE", raw_bytes=b"safe", page_id="p", action_id="a",
                request_id="r", command_id="c", source_url="fixture://x",
                captured_at="2026-08-07T00:00:00Z", record_count=0,
                pagination_cursor="page:1", retry_count=0, resume_cursor="page:1",
                redaction_metadata={"secret_scan": "PASS"},
            )
            state = store.recovery_state()
            self.assertIsNone(state["last_confirmed_artifact_id"])
            self.assertEqual(state["partial_artifact_count"], 1)

    def test_overwrite_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = AppendOnlyTraceArtifactStore(Path(tmp))
            kwargs = dict(
                artifact_type="TRACE", raw_bytes=b"same", page_id="p", action_id="a",
                request_id="r", command_id="c", source_url="fixture://x",
                captured_at="2026-08-07T00:00:00Z", record_count=0,
                pagination_cursor=None, retry_count=0, resume_cursor=None,
                redaction_metadata={"secret_scan": "PASS"},
            )
            store.stage_partial(**kwargs)
            with self.assertRaises(TraceArtifactError):
                store.stage_partial(**kwargs)

    def test_ledger_tamper_detected(self):
        with tempfile.TemporaryDirectory() as tmp:
            run_smoke(Path(tmp))
            ledger = Path(tmp) / "lineage.jsonl"
            rows = ledger.read_text(encoding="utf-8").splitlines()
            first = json.loads(rows[0])
            first["event"] = "TAMPERED"
            rows[0] = json.dumps(first)
            ledger.write_text("\n".join(rows) + "\n", encoding="utf-8")
            store = AppendOnlyTraceArtifactStore(Path(tmp))
            with self.assertRaises(TraceArtifactError):
                store.verify_ledger()


if __name__ == "__main__":
    unittest.main()
