from __future__ import annotations
import json, queue, sys, threading
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

_UPSTREAM = Path(__file__).resolve().parents[3] / "src"
if _UPSTREAM.exists() and str(_UPSTREAM) not in sys.path:
    sys.path.insert(0, str(_UPSTREAM))
try:
    from worker_state_event_store import WorkerBrowserStateEventStore
except ImportError:
    from upstream.worker_state_event_store import WorkerBrowserStateEventStore

PROJECTION_STATUS = {"BLOCKED_EXTERNAL","CLAIM_STALLED","ADAPTER_UNAVAILABLE","LIVE_RESUMED"}
IMPROVEMENT = {
    "CLAIM_STALLED":"PC_EXECUTOR_CLAIM_LOOP_RECOVERY",
    "ADAPTER_UNAVAILABLE":"TARGET_PC_BROWSER_AGENT_ROUTE_BINDING",
    "BLOCKED_EXTERNAL":"APPROVED_EXECUTOR_TUNNEL_INVOKE_SURFACE_RECOVERY",
}

def ts(v:str)->datetime:
    return datetime.fromisoformat(v.replace("Z","+00:00"))

@dataclass(frozen=True)
class Receipt:
    command_id:str
    context_id:str
    worker_id:str
    observed_at:str
    status:str
    detail_code:str
    source_receipt_pointer:str
    source_pr:int
    result_commit:str
    terminal:str

    def common_event(self)->dict[str,Any]:
        return {
            "command_id":self.command_id,
            "context_id":self.context_id,
            "worker_id":self.worker_id,
            "event_type":"RESULT_RECEIPT",
            "observed_at":self.observed_at,
            "status":self.status,
            "detail_code":self.detail_code,
            "source_receipt_pointer":self.source_receipt_pointer,
        }

class RealReceiptIngestion:
    def __init__(self, root:Path):
        self.root=Path(root)
        self.backend=WorkerBrowserStateEventStore(self.root/"event-store")
        self.q:queue.Queue[Receipt|None]=queue.Queue()
        self.results:list[dict[str,Any]]=[]
        self.lock=threading.Lock()
        self.closed=False
        self.t=threading.Thread(target=self._loop,daemon=True,name="d5-cycle2-receipt-writer")
        self.t.start()

    def _rows(self):
        rows=self.backend._jsonl_rows(self.backend.events_path)
        out=[]
        for row in rows:
            state=row.get("state")
            if isinstance(state,dict) and set(state)=={
                "command_id","context_id","worker_id","event_type","observed_at","status","detail_code","source_receipt_pointer"
            } and state.get("event_type")=="RESULT_RECEIPT":
                out.append(row)
        return out

    def _same_pointer(self,pointer:str):
        for row in self._rows():
            if row["state"]["source_receipt_pointer"]==pointer:
                return row
        return None

    def _stream_rows(self,command_id:str,context_id:str):
        return [r for r in self._rows() if r["command_id"]==command_id and r["worker_id"]==context_id]

    def ingest(self,r:Receipt)->dict[str,Any]:
        if r.status not in PROJECTION_STATUS:
            raise ValueError("unsupported status")
        common=r.common_event()
        if len(common)!=8:
            raise AssertionError("common event must be exactly 8 fields")
        existing=self._same_pointer(r.source_receipt_pointer)
        if existing:
            return {"disposition":"DUPLICATE_SUPPRESSED","event":existing}
        stream=self._stream_rows(r.command_id,r.context_id)
        if stream and ts(r.observed_at) < ts(stream[-1]["state"]["observed_at"]):
            return {"disposition":"ORDER_REVERSED_REJECTED","event":None}
        cp=self.backend.restart_readback(r.command_id,r.context_id)
        seq=int(cp["restored_event_seq"])+1
        task_status="COMPLETE" if r.status=="LIVE_RESUMED" else "ERROR"
        return self.backend.append_event(
            command_id=r.command_id,
            worker_id=r.context_id,
            page_id=f"PR-{r.source_pr}",
            event_seq=seq,
            observed_at=r.observed_at,
            state=common,
            task_status=task_status,
            source_pointer=r.source_receipt_pointer,
            metadata={
                "projection_owner":"D-5_AUTOMATION_EVENT_LOG_AND_IMPROVEMENT_OWNER",
                "result_commit":r.result_commit,
                "terminal":r.terminal,
            }
        )

    def ingest_nonblocking(self,r:Receipt):
        if self.closed: raise RuntimeError("closed")
        self.q.put_nowait(r)
        return {"disposition":"QUEUED_NON_BLOCKING","source_receipt_pointer":r.source_receipt_pointer}

    def _loop(self):
        while True:
            r=self.q.get()
            try:
                if r is None: return
                try:
                    out=self.ingest(r)
                except Exception as e:
                    out={"disposition":"BACKGROUND_LOG_ERROR","error_type":type(e).__name__,"error":str(e)}
                with self.lock: self.results.append(out)
            finally:
                self.q.task_done()

    def flush(self):
        self.q.join()
        with self.lock:
            out=list(self.results); self.results.clear()
        return out

    def close(self):
        if self.closed:return
        self.flush(); self.closed=True; self.q.put_nowait(None); self.t.join(2)

    def restart_readback(self,command_id:str,context_id:str):
        return self.backend.restart_readback(command_id,context_id)

    def metrics(self,as_of:str,expected_workers=("D-2","D-4","D-6")):
        now=ts(as_of)
        rows=self._rows()
        by_worker={}
        for row in rows:
            s=row["state"]
            by_worker.setdefault(s["worker_id"],[]).append(s)
        workers={}
        for worker, events in by_worker.items():
            events=sorted(events,key=lambda e:ts(e["observed_at"]))
            latest=events[-1]
            wall=max(0.0,(now-ts(latest["observed_at"])).total_seconds())
            blocked=None; resumed=None
            for e in events:
                if e["status"] in {"BLOCKED_EXTERNAL","CLAIM_STALLED","ADAPTER_UNAVAILABLE"}:
                    blocked=e
                elif e["status"]=="LIVE_RESUMED" and blocked is not None:
                    resumed=e
            if blocked:
                end=ts(resumed["observed_at"]) if resumed else now
                blocker=max(0.0,(end-ts(blocked["observed_at"])).total_seconds())
            else:
                blocker=0.0
            recovery=(ts(resumed["observed_at"])-ts(blocked["observed_at"])).total_seconds() if blocked and resumed else None
            workers[worker]={
                "wall_clock_lag_seconds":wall,
                "blocker_duration_seconds":blocker,
                "blocker_duration_is_lower_bound":bool(blocked and resumed is None),
                "recovery_latency_seconds":recovery,
                "retry_to_recovery_seconds":recovery,
                "latest_status":latest["status"],
                "improvement_item":IMPROVEMENT.get(latest["status"]),
            }
        expected=set(expected_workers)
        ingested=expected & set(by_worker)
        return {
            "schema_version":"D5_CYCLE2_BLOCKER_METRICS_V1",
            "actual_receipt_count":len(rows),
            "actual_worker_receipt_count":len(ingested),
            "expected_actual_worker_receipt_count":len(expected),
            "d3_independent_progress":len(ingested)/len(expected) if expected else 1.0,
            "workers":workers,
            "open_blocker_count":sum(1 for w in workers.values() if w["blocker_duration_is_lower_bound"]),
            "recovered_worker_count":sum(1 for w in workers.values() if w["recovery_latency_seconds"] is not None),
        }

def load_receipts(path:Path):
    data=json.loads(Path(path).read_text(encoding="utf-8"))
    return [Receipt(**x) for x in data["receipts"]]
