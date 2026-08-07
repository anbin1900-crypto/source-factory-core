from __future__ import annotations
import argparse, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from durable_action_replay_v2 import DurableActionReplay

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fixture", default=str(ROOT / "fixtures" / "record_restart_replay_smoke_v2.json"))
    ap.add_argument("--out-dir", default=str(ROOT / "generated"))
    args = ap.parse_args()
    fixture = json.loads(Path(args.fixture).read_text(encoding="utf-8"))
    out = Path(args.out_dir); out.mkdir(parents=True, exist_ok=True)
    engine = DurableActionReplay(fixture["session_id"], mission_id=fixture["mission_id"])
    duplicate_suppressed = 0
    for item in fixture["actions"]:
        action, duplicate = engine.record_action(command_id=item["command_id"], page_id=item["page_id"], action_type=item["action_type"], payload=item["payload"], timestamp=item["timestamp"], status=item["status"])
        duplicate_suppressed += int(duplicate)
        if item.get("evidence"):
            engine.bind_evidence(action_id=action["action_id"], evidence=item["evidence"])
    first = fixture["actions"][0]
    _, duplicate = engine.record_action(command_id=first["command_id"], page_id=first["page_id"], action_type=first["action_type"], payload=first["payload"], timestamp=first["timestamp"], status=first["status"])
    duplicate_suppressed += int(duplicate)
    state_path = out / "B3_DURABLE_ACTION_STATE_V2.json"
    engine.save(state_path)
    before = engine.replay_checkpoint()
    restored = DurableActionReplay.load(state_path)
    after = restored.replay_checkpoint()
    if before != after: raise SystemExit("checkpoint mismatch after restart")
    minimum_order = restored.reconstruct_minimum_order_from_ledger()
    replay = restored.next_replay_actions(after["resume_token"])
    successor = restored.successor_replay_command(pointer_path="LATEST_B3_ACTION_COMMAND_DURABLE_REPLAY_POINTER_V1.json", state_path="generated/B3_DURABLE_ACTION_STATE_V2.json")
    receipt = {"schema_version":"B3_FIXTURE_RECORD_RESTART_REPLAY_SMOKE_V2","status":"PASS","recorded_action_count":len(restored.state["action_index"]),"duplicate_suppressed_count":duplicate_suppressed,"ledger_record_count":len(restored.state["ledger"]),"ledger_reconstruct_count":len(minimum_order),"last_confirmed_sequence_no":after["last_confirmed_sequence_no"],"resume_action_count":len(replay),"resume_action_ids":[a["action_id"] for a in replay],"contextless_replay_command":successor["requires_chat_context"] is False,"target_pc_execution":False,"production":False,"ready":False,"merge":False}
    (out/"B3_FIXTURE_RECORD_RESTART_REPLAY_SMOKE_RECEIPT_V2.json").write_text(json.dumps(receipt, indent=2, sort_keys=True)+"\n", encoding="utf-8")
    print(json.dumps(receipt, sort_keys=True))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
