from __future__ import annotations
import queue
import threading
from dataclasses import dataclass
from datetime import datetime
from typing import Any

D2_LINEAGE_COMMAND="D1-CONTEXT-AWARE-MESSAGE-LOOP-CYCLE1-20260807-001:D-2"
D2_LINEAGE_CONTEXT="UNRESOLVED:D-2"
D2_RESOLVED_CONTEXT="6a72e288-7f24-83ee-b357-3e327cf6d877"
PAGE_ID="UIA-TAB-42.198100.4.0.0.5287"
D3_COMMAND="D3-C1-LIVE-DISPATCH-RETURN-20260808-030500-001"
REPLY_SHA256="2ba4efbee5d42a71be9e9ae28db1b1145fed04b9657efef63a2bcce02e3b347a"

def ts(v:str)->datetime:
    return datetime.fromisoformat(v.replace("Z","+00:00"))

@dataclass(frozen=True)
class ProjectionEvent:
    command_id:str
    context_id:str
    page_id:str
    event_type:str
    observed_at:str
    source_pointer:str
    state:dict[str,Any]

class Cycle4EventIngestion:
    def __init__(self, backend):
        self.backend=backend
        self.q:queue.Queue[ProjectionEvent|None]=queue.Queue()
        self.results:list[dict[str,Any]]=[]
        self.lock=threading.Lock()
        self.closed=False
        self.t=threading.Thread(target=self._loop,daemon=True,name="d5-cycle4-event-writer")
        self.t.start()

    def _accepted(self, command_id:str, context_id:str):
        if hasattr(self.backend,"accepted_events"):
            return self.backend.accepted_events(command_id,context_id)
        return self.backend._accepted_events(command_id,context_id)

    def _ingest(self,e:ProjectionEvent):
        accepted=self._accepted(e.command_id,e.context_id)
        for row in accepted:
            if row["source_pointer"]==e.source_pointer:
                return {"disposition":"DUPLICATE_SUPPRESSED","event":row}
        if accepted and ts(e.observed_at) < ts(accepted[-1]["observed_at"]):
            return {"disposition":"ORDER_REVERSED_REJECTED","event":None}
        seq=self.backend.restart_readback(e.command_id,e.context_id)["restored_event_seq"]+1
        return self.backend.append_event(
            command_id=e.command_id,
            worker_id=e.context_id,
            page_id=e.page_id,
            event_seq=seq,
            observed_at=e.observed_at,
            state=e.state,
            task_status="COMPLETE" if e.event_type in {"FRESHNESS_CONFIRMED","ASSISTANT_REPLY_RECOVERED"} else "RUNNING",
            source_pointer=e.source_pointer,
            metadata={"projection_owner":"D-5_AUTOMATION_EVENT_LOG_AND_IMPROVEMENT_OWNER"},
        )

    def ingest(self,e:ProjectionEvent): return self._ingest(e)

    def ingest_nonblocking(self,e:ProjectionEvent):
        if self.closed: raise RuntimeError("closed")
        self.q.put_nowait(e)
        return {"disposition":"QUEUED_NON_BLOCKING","event_type":e.event_type,"source_pointer":e.source_pointer}

    def _loop(self):
        while True:
            e=self.q.get()
            try:
                if e is None: return
                try: out=self._ingest(e)
                except Exception as exc:
                    out={"disposition":"BACKGROUND_LOG_ERROR","error_type":type(exc).__name__,"error":str(exc)}
                with self.lock: self.results.append(out)
            finally: self.q.task_done()

    def flush(self):
        self.q.join()
        with self.lock:
            out=list(self.results); self.results.clear()
        return out

    def close(self):
        if self.closed:return
        self.flush(); self.closed=True; self.q.put_nowait(None); self.t.join(2)

    def d2_freshness_event(self):
        return ProjectionEvent(
            command_id=D2_LINEAGE_COMMAND,context_id=D2_LINEAGE_CONTEXT,page_id=PAGE_ID,
            event_type="FRESHNESS_CONFIRMED",observed_at="2026-08-07T18:16:52.4077010Z",
            source_pointer="github://source-factory-core/pr81/comment/5220605238",
            state={"schema_version":"D5_CYCLE4_EVENT_V1","event_type":"FRESHNESS_CONFIRMED","worker_id":"D-2","resolved_context_id":D2_RESOLVED_CONTEXT,"page_id":PAGE_ID,"role_marker_match":True,"cycle_marker_match":True,"page_reselected":True,"target_pc_live_readback":True,"misbinding_count":0,"stale_after_seconds":300,"result_commit":"0264206865159f9ca928ffc4264859d9218f81f0"})

    def d3_events(self):
        common={"schema_version":"D5_CYCLE4_EVENT_V1","worker_id":"D-3","context_id":D2_RESOLVED_CONTEXT,"page_id":PAGE_ID,"result_commit":"500a9a318fdc3d61032319ca70960d8114e244b5"}
        sent=ProjectionEvent(command_id=D3_COMMAND,context_id=D2_RESOLVED_CONTEXT,page_id=PAGE_ID,event_type="MESSAGE_SENT",observed_at="2026-08-07T18:26:03.8615229Z",source_pointer="github://source-factory-core/pr82/live-result/9fb367331e9341314ff4abafb3b959efd038e548#MESSAGE_SENT",state={**common,"event_type":"MESSAGE_SENT","message_sent":True,"message_sent_basis":"USER_MESSAGE_OBSERVED_IN_BOUND_CHATGPT_CONVERSATION_OUTSIDE_COMPOSER"})
        reply=ProjectionEvent(command_id=D3_COMMAND,context_id=D2_RESOLVED_CONTEXT,page_id=PAGE_ID,event_type="ASSISTANT_REPLY_RECOVERED",observed_at="2026-08-07T18:26:41.9977282Z",source_pointer="github://source-factory-core/pr82/comment/5220688575#ASSISTANT_REPLY_RECOVERED",state={**common,"event_type":"ASSISTANT_REPLY_RECOVERED","assistant_reply_recovered":True,"assistant_reply_raw":"D3_MESSAGE_DISPATCH_RESULT_ACK_V1","assistant_reply_sha256":REPLY_SHA256,"cross_context_reply_count":0,"duplicate_execution_count":0})
        return sent,reply

    def metrics(self):
        freshness_at=ts("2026-08-07T18:16:52.4077010Z")
        sent_at=ts("2026-08-07T18:26:03.8615229Z")
        reply_at=ts("2026-08-07T18:26:41.9977282Z")
        freshness_latency=(sent_at-freshness_at).total_seconds(); message_reply=(reply_at-sent_at).total_seconds(); threshold=300.0
        return {"schema_version":"D5_CYCLE4_DISPATCH_METRICS_V1","freshness_latency_seconds":freshness_latency,"freshness_stale_after_seconds":threshold,"freshness_guard_valid_at_dispatch":freshness_latency<=threshold,"freshness_guard_breach_seconds":max(0.0,freshness_latency-threshold),"message_to_reply_latency_seconds":message_reply,"dispatch_success_rate":1.0,"message_sent_count":1,"assistant_reply_recovered_count":1,"remaining_open_blocker_count":2,"remaining_open_workers":["D-4","D-6"],"d4_d6_completion_inference_count":0,"upstream_event_store_mutation_count":0}
