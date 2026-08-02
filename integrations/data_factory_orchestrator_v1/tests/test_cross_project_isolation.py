from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from integrations.data_factory_orchestrator_v1.event_router_and_queue_adapter import (
    DataFactoryOrchestrator,
    IsolationViolation,
)


class CrossProjectIsolationTests(unittest.TestCase):
    def test_same_bytes_are_isolated_by_project(self) -> None:
        with tempfile.TemporaryDirectory(prefix="a6-isolation-") as temp:
            root = Path(temp)
            source = root / "same.txt"
            source.write_text("same bytes", encoding="utf-8")
            orchestrator = DataFactoryOrchestrator(root / "runtime", package_root=Path.cwd())
            a = orchestrator.start(source, project_id="project-a", source_id="source-001", execution_id="exec-a")
            b = orchestrator.start(source, project_id="project-b", source_id="source-001", execution_id="exec-b")
            self.assertEqual(a["state"], "ARCHIVED")
            self.assertEqual(b["state"], "ARCHIVED")
            a = orchestrator.run(project_id="project-a", execution_id="exec-a", fixture=True)
            b = orchestrator.run(project_id="project-b", execution_id="exec-b", fixture=True)
            self.assertEqual(a["state"], "SEARCH_READBACK_PASS")
            self.assertEqual(b["state"], "SEARCH_READBACK_PASS")
            self.assertNotEqual(a["idempotency_key"], b["idempotency_key"])
            self.assertIn("projects/project-a", a["artifact_pointer"].replace("\\", "/"))
            self.assertIn("projects/project-b", b["artifact_pointer"].replace("\\", "/"))

    def test_cross_project_result_is_quarantined(self) -> None:
        with tempfile.TemporaryDirectory(prefix="a6-result-isolation-") as temp:
            root = Path(temp)
            source = root / "input.txt"
            source.write_text("result isolation", encoding="utf-8")
            orchestrator = DataFactoryOrchestrator(root / "runtime", package_root=Path.cwd())
            state = orchestrator.start(source, project_id="project-a", source_id="source-002", execution_id="exec-a2")
            state = orchestrator.run(project_id="project-a", execution_id="exec-a2", fixture=False)
            self.assertEqual(state["state"], "SPLIT_QUEUED")
            request = json.loads(next((root / "runtime/source-factory-bridge-v1/requests").glob("*.json")).read_text(encoding="utf-8"))
            bad = {
                "schema_version": request["schema_version"],
                "object_type": "WORK_RESULT",
                "work_id": request["work_id"],
                "project_id": "project-b",
                "execution_id": request["execution_id"],
                "final_status": "PASS",
                "exit_code": 0,
                "production": False,
            }
            result_path = root / "runtime/source-factory-bridge-v1/results" / f"{request['work_id']}.json"
            result_path.write_text(json.dumps(bad), encoding="utf-8")
            with self.assertRaises(IsolationViolation):
                orchestrator.run(project_id="project-a", execution_id="exec-a2", fixture=False)
            self.assertFalse(result_path.exists())
            self.assertEqual(len(list((root / "runtime/source-factory-bridge-v1/quarantine").glob("*.json"))), 1)


if __name__ == "__main__":
    unittest.main()
