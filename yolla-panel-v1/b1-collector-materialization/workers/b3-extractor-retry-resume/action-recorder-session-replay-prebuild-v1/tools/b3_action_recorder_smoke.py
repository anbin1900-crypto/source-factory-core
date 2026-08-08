from __future__ import annotations

import argparse
from hashlib import sha256
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from action_recorder_session_replay import RecorderContinuity


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="B-3 action recorder/session replay fixture smoke")
    parser.add_argument("--fixture", default=str(ROOT / "fixtures" / "record_replay_smoke_v1.json"))
    parser.add_argument("--state", default=str(ROOT / "generated" / "B3_ACTION_RECORDER_STATE_V1.json"))
    parser.add_argument("--receipt", default=str(ROOT / "generated" / "B3_RECORD_REPLAY_SMOKE_RECEIPT_V1.json"))
    args = parser.parse_args()

    fixture = json.loads(Path(args.fixture).read_text(encoding="utf-8"))
    state_path = Path(args.state)
    receipt_path = Path(args.receipt)

    recorder = RecorderContinuity(fixture["session_id"])
    duplicate_suppressed_count = 0
    for item in fixture["actions_before_restart"]:
        action, duplicate = recorder.record_action(
            command_id=item["command_id"], page_id=item["page_id"], action_type=item["action_type"],
            payload=item["payload"], status=item["status"],
        )
        duplicate_suppressed_count += int(duplicate)
        if not duplicate:
            recorder.bind_cdp_evidence(action_id=action["action_id"], evidence=item.get("cdp_evidence", []))

    dup = fixture["duplicate_action"]
    _, duplicate = recorder.record_action(
        command_id=dup["command_id"], page_id=dup["page_id"], action_type=dup["action_type"],
        payload=dup["payload"], status=dup["status"],
    )
    duplicate_suppressed_count += int(duplicate)
    recorder.save(state_path)
    before_digest = recorder.state["resume_cursor"]["state_digest"]
    before_last_completed = recorder.state["last_completed_action_id"]
    before_pending = list(recorder.state["pending_action_ids"])

    resumed = RecorderContinuity.load(state_path)
    restored_ok = (
        resumed.state["last_completed_action_id"] == before_last_completed
        and resumed.state["pending_action_ids"] == before_pending
        and resumed.state["resume_cursor"]["state_digest"] == before_digest
    )
    for action_id in list(resumed.state["pending_action_ids"]):
        resumed.set_status(action_id, "COMPLETED")
    for item in fixture["actions_after_restart"]:
        action, duplicate = resumed.record_action(
            command_id=item["command_id"], page_id=item["page_id"], action_type=item["action_type"],
            payload=item["payload"], status=item["status"],
        )
        duplicate_suppressed_count += int(duplicate)
        if not duplicate:
            resumed.bind_cdp_evidence(action_id=action["action_id"], evidence=item.get("cdp_evidence", []))
    resumed.save(state_path)

    actions = resumed.state["actions"]
    fingerprints = [a["fingerprint"] for a in actions]
    no_duplicates = len(fingerprints) == len(set(fingerprints))
    replay = resumed.session_replay_binding()
    correlation = resumed.command_action_correlation()
    required_types = {"click", "input", "scroll", "navigation", "wait"}
    observed_types = {a["action_type"] for a in actions}
    cdp_bound_count = sum(1 for _, evs in resumed.state["cdp_evidence_index"].items() if evs)

    receipt = {
        "schema_version": "B3_RECORD_REPLAY_SMOKE_RECEIPT_V1",
        "session_id": fixture["session_id"],
        "status": "PASS" if all([
            restored_ok,
            no_duplicates,
            required_types.issubset(observed_types),
            duplicate_suppressed_count >= 1,
            not resumed.state["pending_action_ids"],
            len(replay["events"]) == len(actions),
            cdp_bound_count >= 2,
        ]) else "FAIL",
        "action_count": len(actions),
        "action_types": sorted(observed_types),
        "duplicate_suppressed_count": duplicate_suppressed_count,
        "restart_restore": "PASS" if restored_ok else "FAIL",
        "last_completed_action_id": resumed.state["last_completed_action_id"],
        "pending_action_ids": resumed.state["pending_action_ids"],
        "resume_cursor": resumed.state["resume_cursor"],
        "replay_event_count": len(replay["events"]),
        "command_count": len(correlation["command_action_index"]),
        "cdp_bound_action_count": cdp_bound_count,
        "contextless_resume": True,
        "state_sha256": sha256(state_path.read_bytes()).hexdigest(),
        "state_digest": resumed.state["resume_cursor"]["state_digest"],
    }
    write_json(receipt_path, receipt)
    print(json.dumps(receipt, ensure_ascii=False, sort_keys=True))
    return 0 if receipt["status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
