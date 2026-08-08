from __future__ import annotations
from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path

TERM={"COMPLETED","FAILED","CANCELLED"}
def canon(x): return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(",",":"))
def dg(x): return sha256(canon(x).encode()).hexdigest()

class UserJourneyStateRecorder:
    schema_version="B3_USER_JOURNEY_STATE_RECORDER_V4"
    def __init__(self,session_id,mission_id,state=None):
        self.session_id=session_id; self.mission_id=mission_id
        self.state=deepcopy(state) if state is not None else {
          "schema_version":self.schema_version,"session_id":session_id,"mission_id":mission_id,
          "next_sequence_no":1,"journey_ledger":[],"idempotency_index":{},"journey_index":{},
          "worker_lifecycle_side_stream":[],"coverage_family_index":{},"coverage_suppressed_event_ids":[],"checkpoint":{}}
        if state is not None: self._validate()
        self._checkpoint()
    def _validate(self):
        if self.state.get("schema_version")!=self.schema_version: raise ValueError("schema")
        if self.state.get("session_id")!=self.session_id or self.state.get("mission_id")!=self.mission_id: raise ValueError("identity")
        prev="GENESIS"; seq=set(); ids=set()
        for r in self.state["journey_ledger"]:
            if r["sequence_no"] in seq or r["journey_event_id"] in ids: raise ValueError("duplicate")
            seq.add(r["sequence_no"]); ids.add(r["journey_event_id"])
            if r["prev_hash"]!=prev: raise ValueError("chain")
            if r["record_hash"]!=dg({k:deepcopy(v) for k,v in r.items() if k!="record_hash"}): raise ValueError("hash")
            prev=r["record_hash"]
    def record_worker_lifecycle_event(self,e):
        x={"event_domain":"WORKER_LIFECYCLE","worker_id":str(e.get("worker_id","")),"command_id":str(e.get("command_id","")),
           "state":str(e.get("state","UNKNOWN")),"timestamp":str(e.get("timestamp",""))}
        x["side_event_id"]="worker-side-"+dg(x)[:20]
        if x["side_event_id"] not in {z["side_event_id"] for z in self.state["worker_lifecycle_side_stream"]}: self.state["worker_lifecycle_side_stream"].append(x)
        return deepcopy(x)
    def record_product_action(self,**a):
        req=("journey_id","feature","ui_state_before","ui_state_after","command_id","page_id","action_id","action_type","timestamp","payload","page_role","target_family","structure_signature")
        for k in req:
            if k not in a: raise ValueError(k)
        idem=dg({"mission_id":self.mission_id,"session_id":self.session_id,**{k:a[k] for k in ("command_id","page_id","action_id","feature","action_type","payload")}})
        prior=self.state["idempotency_index"].get(idem)
        if prior:
            return deepcopy(next(r for r in self.state["journey_ledger"] if r["journey_event_id"]==prior)),True
        seq=self.state["next_sequence_no"]; fam=dg({k:a[k] for k in ("feature","action_type","page_role","target_family","structure_signature")})
        eid="journey-"+dg({"session_id":self.session_id,"sequence_no":seq,"action_id":a["action_id"],"idempotency_key":idem})[:20]
        r={"schema_version":"USER_JOURNEY_EVENT_V1","event_domain":"PRODUCT_USER_ACTION","journey_event_id":eid,
           "mission_id":self.mission_id,"session_id":self.session_id,"sequence_no":seq,"status":a.get("status","PENDING"),
           "coverage_family_key":fam,"idempotency_key":idem,**{k:deepcopy(a[k]) for k in req}}
        r["prev_hash"]=self.state["journey_ledger"][-1]["record_hash"] if self.state["journey_ledger"] else "GENESIS"; r["record_hash"]=dg(r)
        self.state["journey_ledger"].append(r); self.state["idempotency_index"][idem]=eid
        self.state["journey_index"].setdefault(a["journey_id"],[]).append(eid)
        f=self.state["coverage_family_index"].get(fam)
        if f is None:
            self.state["coverage_family_index"][fam]={"representative_event_id":eid,**{k:a[k] for k in ("feature","action_type","page_role","target_family","structure_signature")},"suppressed_equivalent_event_ids":[]}
        else:
            f["suppressed_equivalent_event_ids"].append(eid); self.state["coverage_suppressed_event_ids"].append(eid)
        self.state["next_sequence_no"]=seq+1; self._checkpoint(); return deepcopy(r),False
    def set_action_status(self,action_id,status):
        found=False
        for r in self.state["journey_ledger"]:
            if r["action_id"]==action_id: r["status"]=status; found=True
        if not found: raise KeyError(action_id)
        prev="GENESIS"
        for r in self.state["journey_ledger"]:
            r["prev_hash"]=prev; r["record_hash"]=dg({k:deepcopy(v) for k,v in r.items() if k!="record_hash"}); prev=r["record_hash"]
        self._checkpoint()
    def _checkpoint(self):
        ev=sorted(self.state["journey_ledger"],key=lambda x:x["sequence_no"]); done=[x for x in ev if x["status"]=="COMPLETED"]; last=done[-1] if done else None
        p=[x["action_id"] for x in ev if x["status"] not in TERM]
        b={"last_completed_sequence_no":last["sequence_no"] if last else 0,"last_completed_action_id":last["action_id"] if last else None,"pending_action_ids":p}
        b["resume_token"]=dg({"mission_id":self.mission_id,"session_id":self.session_id,"tail":ev[-1]["record_hash"] if ev else "GENESIS",**b}); self.state["checkpoint"]=b
    def next_resume_actions(self,token):
        c=self.state["checkpoint"]
        if token!=c["resume_token"]: raise ValueError("resume token")
        return [deepcopy(x) for x in sorted(self.state["journey_ledger"],key=lambda x:x["sequence_no"]) if x["sequence_no"]>c["last_completed_sequence_no"] and x["status"] not in TERM]
    def user_journey_event_stream(self):
        return {"schema_version":"USER_JOURNEY_EVENT_STREAM_V1","session_id":self.session_id,"mission_id":self.mission_id,
                "events":[deepcopy(x) for x in sorted(self.state["journey_ledger"],key=lambda x:x["sequence_no"])],"worker_lifecycle_events_included":False}
    def user_journey_graph(self):
        out={}
        for jid,ids in self.state["journey_index"].items():
            ev=sorted([next(x for x in self.state["journey_ledger"] if x["journey_event_id"]==i) for i in ids],key=lambda x:x["sequence_no"]); nodes={}; edges=[]
            for e in ev:
                nodes[e["ui_state_before"]]={"state_id":e["ui_state_before"]}; nodes[e["ui_state_after"]]={"state_id":e["ui_state_after"]}
                edges.append({"from_state":e["ui_state_before"],"to_state":e["ui_state_after"],**{k:e[k] for k in ("action_id","command_id","page_id","feature","action_type","sequence_no")}})
            out[jid]={"nodes":list(nodes.values()),"edges":edges,"start_state":ev[0]["ui_state_before"],"last_state":ev[-1]["ui_state_after"]}
        return {"schema_version":"USER_JOURNEY_GRAPH_V1","journeys":out}
    def ui_state_transition_trace(self):
        return {"schema_version":"UI_STATE_TRANSITION_TRACE_V1","transitions":[{"transition_id":f"ui-transition-{e['sequence_no']:04d}","journey_id":e["journey_id"],
          "from_state":e["ui_state_before"],"to_state":e["ui_state_after"],**{k:e[k] for k in ("sequence_no","action_id","command_id","session_id","page_id","status")}}
          for e in sorted(self.state["journey_ledger"],key=lambda x:x["sequence_no"])]}
    def feature_action_sequence(self):
        f={}
        for e in sorted(self.state["journey_ledger"],key=lambda x:x["sequence_no"]):
            f.setdefault(e["feature"],[]).append({k:e[k] for k in ("sequence_no","journey_id","action_id","command_id","page_id","action_type","ui_state_before","ui_state_after","status")})
        return {"schema_version":"FEATURE_ACTION_SEQUENCE_V1","features":f}
    def coverage_plan(self):
        fam=[]
        for k,v in self.state["coverage_family_index"].items(): fam.append({"coverage_family_key":k,**deepcopy(v),"equivalent_event_count":1+len(v["suppressed_equivalent_event_ids"])})
        return {"schema_version":"REPRESENTATIVE_STATE_COVERAGE_PLAN_V1","strategy":"GROUP_SAME_STRUCTURE_FILTER_COMBINATIONS_BY_ACTION_FAMILY",
                "families":fam,"representative_family_count":len(fam),"suppressed_equivalent_event_count":len(self.state["coverage_suppressed_event_ids"])}
    def checkpoint(self): return {"schema_version":"USER_JOURNEY_RESUME_CHECKPOINT_V1","mission_id":self.mission_id,"session_id":self.session_id,**deepcopy(self.state["checkpoint"])}
    def export_state(self): self._checkpoint(); return deepcopy(self.state)
    def save(self,path): self._checkpoint(); Path(path).write_text(json.dumps(self.state,ensure_ascii=False,sort_keys=True,indent=2)+"\n",encoding="utf-8")
    @classmethod
    def load(cls,path):
        s=json.loads(Path(path).read_text(encoding="utf-8")); return cls(s["session_id"],s["mission_id"],s)
