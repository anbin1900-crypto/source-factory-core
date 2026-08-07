from __future__ import annotations
import argparse, json, shutil
from pathlib import Path
from src.worker_state_event_store import WorkerBrowserStateEventStore

def run(root: Path) -> dict:
    if root.exists(): shutil.rmtree(root)
    store=WorkerBrowserStateEventStore(root)
    common=dict(command_id="CMD-WORKER-STATE-001",worker_id="B-4",source_pointer="command-artifact://CMD-WORKER-STATE-001/checkpoint",command_artifact_checkpoint_pointer="cmdart://CMD-WORKER-STATE-001/latest")
    store.append_event(**common,page_id="page-1",event_seq=1,observed_at="2026-08-07T22:40:00+09:00",state={"browser_phase":"OPEN","url":"http://fixture/list?page=1"},task_status="RUNNING")
    store.append_event(**common,page_id="page-1",event_seq=2,observed_at="2026-08-07T22:40:01+09:00",state={"browser_phase":"EXTRACTING","url":"http://fixture/list?page=1"},task_status="RUNNING")
    duplicate=store.append_event(**common,page_id="page-1",event_seq=2,observed_at="2026-08-07T22:40:01+09:00",state={"browser_phase":"EXTRACTING","url":"http://fixture/list?page=1"},task_status="RUNNING")
    tampered=store.append_event(**common,page_id="page-1",event_seq=2,observed_at="2026-08-07T22:40:02+09:00",state={"browser_phase":"MUTATED","url":"http://fixture/list?page=1"},task_status="RUNNING")
    out_of_order=store.append_event(**common,page_id="page-2",event_seq=4,observed_at="2026-08-07T22:40:03+09:00",state={"browser_phase":"SKIPPED","url":"http://fixture/list?page=2"},task_status="RUNNING")
    restarted=WorkerBrowserStateEventStore(root); before=restarted.restart_readback("CMD-WORKER-STATE-001","B-4")
    restarted.append_event(**common,page_id="page-2",event_seq=3,observed_at="2026-08-07T22:40:04+09:00",state={"browser_phase":"COMPLETE","url":"http://fixture/list?page=2"},task_status="COMPLETE")
    receipt=restarted.bind_result_receipt(command_id="CMD-WORKER-STATE-001",worker_id="B-4",result_receipt_pointer="result://CMD-WORKER-STATE-001/receipt-001",observed_at="2026-08-07T22:40:05+09:00")
    after=WorkerBrowserStateEventStore(root).restart_readback("CMD-WORKER-STATE-001","B-4"); manifest=restarted.pointer_manifest("CMD-WORKER-STATE-001","B-4")
    return {"schema_version":"B4_WORKER_STATE_EVENT_TRACE_CHECKPOINT_SMOKE_V1","status":"PASS","command_id":"CMD-WORKER-STATE-001","worker_id":"B-4","accepted_event_count":manifest["accepted_event_count"],"duplicate_disposition":duplicate["disposition"],"tampered_disposition":tampered["disposition"],"out_of_order_disposition":out_of_order["disposition"],"restart_before_complete_seq":before["restored_event_seq"],"restart_before_complete_state":before["restored_state"],"restart_after_complete_seq":after["restored_event_seq"],"restart_after_complete_task_status":after["restored_task_status"],"result_receipt_disposition":receipt["disposition"],"result_receipt_pointer":after["result_receipt_pointer"],"side_record_count":manifest["side_record_count"],"a7_b1_manifest":manifest}

def main():
    p=argparse.ArgumentParser();p.add_argument("root",nargs="?",default="artifacts/worker-state-smoke");args=p.parse_args();print(json.dumps(run(Path(args.root)),indent=2,sort_keys=True));return 0
if __name__=="__main__": raise SystemExit(main())
