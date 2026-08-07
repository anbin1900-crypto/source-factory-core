from __future__ import annotations
from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path

FLOW_BY_FEATURE={"Search":"PUBLIC_READ","List":"PUBLIC_READ","Detail":"PUBLIC_READ","Create":"CREATE","MyListing":"MY_LISTING","Edit":"EDIT"}

def _canon(v): return json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(",",":"))
def _digest(v): return sha256(_canon(v).encode()).hexdigest()
def state_id(name): return "state-"+_digest({"ui_state":name})[:16]

def transition_id(a):
    return "trans-"+_digest({
        "from":state_id(a["ui_state_before"]),"to":state_id(a["ui_state_after"]),
        "flow":FLOW_BY_FEATURE[a["feature"]],"feature":a["feature"],"page_role":a["page_role"],
        "action_type":a["action_type"],"target_family":a.get("target_family"),"structure_signature":a.get("structure_signature")
    })[:16]

class UserJourneyStateMachine:
    schema_version="USER_JOURNEY_STATE_MACHINE_V1"
    def __init__(self,mission_id,session_id,state=None):
        self.mission_id=mission_id; self.session_id=session_id
        self.state=deepcopy(state) if state else {
            "schema_version":self.schema_version,"mission_id":mission_id,"session_id":session_id,
            "states":{},"transitions":{},"flow_index":{"PUBLIC_READ":[],"CREATE":[],"MY_LISTING":[],"EDIT":[]},
            "branches":{},"action_index":{},"idempotency_index":{},"worker_lifecycle_side_stream":[],"unobserved_paths":[],
            "next_sequence_no":1,"journey_checkpoints":{}}
        self._refresh()
    def _idem(self,a):
        return _digest({k:a.get(k) for k in ["command_id","page_id","action_id","ui_state_before","ui_state_after","structure_signature"]})
    def _ensure_state(self,name,flow,page_role):
        sid=state_id(name); r=self.state["states"].setdefault(sid,{"state_id":sid,"ui_state":name,"identity_key":name,"flows":[],"page_roles":[],"observed":True})
        if flow not in r["flows"]: r["flows"].append(flow); r["flows"].sort()
        if page_role not in r["page_roles"]: r["page_roles"].append(page_role); r["page_roles"].sort()
        return sid
    def record_action(self,a):
        if a["feature"] not in FLOW_BY_FEATURE: raise ValueError("unsupported feature")
        idem=self._idem(a)
        if idem in self.state["idempotency_index"]: return deepcopy(self.state["action_index"][self.state["idempotency_index"][idem]]),True
        x=deepcopy(a); x["mission_id"]=self.mission_id; x["session_id"]=self.session_id; x["flow"]=FLOW_BY_FEATURE[x["feature"]]
        x["sequence_no"]=self.state["next_sequence_no"]; x["event_domain"]="PRODUCT_USER_JOURNEY"; x["idempotency_key"]=idem
        x["evidence_pointer"]=f"fixture://user_journey_state_machine_fixture_v5.json#action_id={x['action_id']}"
        before=self._ensure_state(x["ui_state_before"],x["flow"],x["page_role"]); after=self._ensure_state(x["ui_state_after"],x["flow"],x["page_role"])
        tid=transition_id(x); t=self.state["transitions"].get(tid)
        if not t:
            t={"transition_id":tid,"flow":x["flow"],"feature":x["feature"],"from_state_id":before,"to_state_id":after,
               "precondition":{"state_id":before,"ui_state":x["ui_state_before"]},"postcondition":{"state_id":after,"ui_state":x["ui_state_after"]},
               "page_role":x["page_role"],"action_type":x["action_type"],"target_family":x.get("target_family"),"structure_signature":x.get("structure_signature"),
               "representative_action_id":x["action_id"],"evidence_pointer":x["evidence_pointer"],"occurrence_count":0,"observed_action_ids":[],"suppressed_equivalent_action_ids":[]}
            self.state["transitions"][tid]=t; self.state["flow_index"][x["flow"]].append(tid)
        else: t["suppressed_equivalent_action_ids"].append(x["action_id"])
        t["occurrence_count"]+=1; t["observed_action_ids"].append(x["action_id"])
        self.state["action_index"][x["action_id"]]=x; self.state["idempotency_index"][idem]=x["action_id"]; self.state["next_sequence_no"]+=1
        self._refresh(); return deepcopy(x),False
    def record_worker_lifecycle(self,e):
        r=deepcopy(e); r["event_domain"]="WORKER_LIFECYCLE"; self.state["worker_lifecycle_side_stream"].append(r)
    def add_unobserved_path(self,from_state,to_state,flow):
        self.state["unobserved_paths"].append({"from_state_id":state_id(from_state),"from_state":from_state,"to_state_id":state_id(to_state),"to_state":to_state,"flow":flow,"status":"UNKNOWN_UNOBSERVED","materialized_transition":False})
    def _refresh(self):
        outgoing={}
        for t in self.state.get("transitions",{}).values(): outgoing.setdefault(t["from_state_id"],[]).append(t["transition_id"])
        self.state["branches"]={"branch-"+_digest({"from":sid,"to":sorted(tids)})[:16]:{"from_state_id":sid,"representative_transition_ids":sorted(tids),"observed_branch_count":len(tids)} for sid,tids in outgoing.items()}
        journeys={}
        for a in self.state.get("action_index",{}).values(): journeys.setdefault(a["journey_id"],[]).append(a)
        cps={}
        for jid,rows in journeys.items():
            rows=sorted(rows,key=lambda r:r["sequence_no"]); completed=[r for r in rows if r["status"]=="COMPLETED"]; last=completed[-1] if completed else None
            cp={"journey_id":jid,"last_completed_action_id":last["action_id"] if last else None,"last_completed_sequence_no":last["sequence_no"] if last else 0,"pending_action_ids":[r["action_id"] for r in rows if r["status"]!="COMPLETED"]}
            cp["resume_token"]=_digest({"mission_id":self.mission_id,"session_id":self.session_id,**cp})
            cps[jid]=cp
        self.state["journey_checkpoints"]=cps
    def materialize(self):
        self._refresh(); flows={}
        for f,tids in self.state["flow_index"].items():
            flows[f]={"flow":f,"representative_transition_ids":list(tids),"state_ids":sorted({sid for tid in tids for sid in [self.state["transitions"][tid]["from_state_id"],self.state["transitions"][tid]["to_state_id"]]})}
        return {"schema_version":self.schema_version,"mission_id":self.mission_id,"session_id":self.session_id,"states":deepcopy(self.state["states"]),"representative_transitions":deepcopy(self.state["transitions"]),"branches":deepcopy(self.state["branches"]),"flows":flows,"unobserved_paths":deepcopy(self.state["unobserved_paths"]),"worker_lifecycle_side_stream":deepcopy(self.state["worker_lifecycle_side_stream"]),"journey_checkpoints":deepcopy(self.state["journey_checkpoints"])}
    def next_actions_after_resume(self,journey_id,token):
        self._refresh(); cp=self.state["journey_checkpoints"].get(journey_id)
        if not cp: raise KeyError(journey_id)
        if token!=cp["resume_token"]: raise ValueError("resume token mismatch")
        last=cp["last_completed_sequence_no"]
        return [deepcopy(x) for x in sorted(self.state["action_index"].values(),key=lambda r:r["sequence_no"]) if x["journey_id"]==journey_id and x["sequence_no"]>last]
    def representative_transition_count(self): return len(self.state["transitions"])
    def equivalent_action_suppressed_count(self): return sum(len(t["suppressed_equivalent_action_ids"]) for t in self.state["transitions"].values())
    def save(self,path): Path(path).write_text(json.dumps(self.state,ensure_ascii=False,sort_keys=True,indent=2)+"\n",encoding="utf-8")
    @classmethod
    def load(cls,path):
        s=json.loads(Path(path).read_text(encoding="utf-8")); return cls(s["mission_id"],s["session_id"],s)
