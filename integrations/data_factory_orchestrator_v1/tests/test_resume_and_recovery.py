from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from integrations.data_factory_orchestrator_v1.event_router_and_queue_adapter import DataFactoryOrchestrator


class ResumeAndRecoveryTests(unittest.TestCase):
    def test_resume_after_split_complete_and_duplicate_exclusion(self) -> None:
        with tempfile.TemporaryDirectory(prefix="a6-resume-") as temp:
            root = Path(temp)
            source = root / "input.txt"
            source.write_text("alpha beta gamma delta", encoding="utf-8")
            first = DataFactoryOrchestrator(root / "runtime", package_root=Path.cwd())
            state = first.start(source, project_id="project-a", source_id="source-001", execution_id="exec-001")
            state = first.run(project_id="project-a", execution_id="exec-001", fixture=True, stop_after="SPLIT_COMPLETE")
            self.assertEqual(state["state"], "SPLIT_COMPLETE")

            restarted = DataFactoryOrchestrator(root / "runtime", package_root=Path.cwd())
            recovered = restarted.recover_all(fixture=True)
            self.assertEqual(len(recovered), 1)
            self.assertEqual(recovered[0]["state"], "SEARCH_READBACK_PASS")

            final = json.loads((root / "runtime/projects/project-a/executions/exec-001/state.json").read_text(encoding="utf-8"))
            self.assertEqual(final["state"], "SEARCH_READBACK_PASS")
            required = {"project_id", "source_id", "execution_id", "idempotency_key", "artifact_pointer"}
            for event_path in sorted((root / "runtime/projects/project-a/executions/exec-001/events").glob("*.json")):
                event = json.loads(event_path.read_text(encoding="utf-8"))
                self.assertTrue(required.issubset(event))
                self.assertEqual(event["project_id"], "project-a")

            duplicate = restarted.start(source, project_id="project-a", source_id="source-001", execution_id="exec-002")
            self.assertEqual(duplicate["state"], "DUPLICATE_EXCLUDED")
            self.assertEqual(duplicate["duplicate_of_execution_id"], "exec-001")

    def test_deterministic_request_recovery(self) -> None:
        with tempfile.TemporaryDirectory(prefix="a6-request-recovery-") as temp:
            root = Path(temp)
            source = root / "input.txt"
            source.write_text("recover request", encoding="utf-8")
            orchestrator = DataFactoryOrchestrator(root / "runtime", package_root=Path.cwd())
            state = orchestrator.start(source, project_id="project-a", source_id="source-002", execution_id="exec-003")
            state = orchestrator.run(project_id="project-a", execution_id="exec-003", fixture=False)
            self.assertEqual(state["state"], "SPLIT_QUEUED")
            requests = list((root / "runtime/source-factory-bridge-v1/requests").glob("*.json"))
            self.assertEqual(len(requests), 1)
            original = json.loads(requests[0].read_text(encoding="utf-8"))
            requests[0].unlink()

            restarted = DataFactoryOrchestrator(root / "runtime", package_root=Path.cwd())
            state = restarted.run(project_id="project-a", execution_id="exec-003", fixture=False)
            self.assertEqual(state["state"], "SPLIT_QUEUED")
            recreated = list((root / "runtime/source-factory-bridge-v1/requests").glob("*.json"))
            self.assertEqual(len(recreated), 1)
            self.assertEqual(json.loads(recreated[0].read_text(encoding="utf-8"))["work_id"], original["work_id"])


if __name__ == "__main__":
    unittest.main()
