from __future__ import annotations
from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path
from typing import Any

CANONICAL_STATES=("DRAFT","VALIDATION_ERROR","SUBMITTED","PUBLISHED","REJECTED","PAUSED","CLOSED","DELETED")
CAPABILITIES=("PUBLIC_READ","CREATE","MY_LISTING","EDIT","DELETE_OR_CLOSE")
TRANSITIONS=[
{"transition_id":"tr-public-view","capability":"PUBLIC_READ","action":"VIEW_PUBLIC","from_state":"PUBLISHED","to_state":"PUBLISHED","requires_auth":False,"requires_ownership":False},
{"transition_id":"tr-create-start","capability":"CREATE","action":"START_OR_CONTINUE_DRAFT","from_state":"DRAFT","to_state":"DRAFT","requires_auth":True,"requires_ownership":False},
{"transition_id":"tr-create-validation-error","capability":"CREATE","action":"VALIDATE_DRAFT_FAIL","from_state":"DRAFT","to_state":"VALIDATION_ERROR","requires_auth":True,"requires_ownership":False},
{"transition_id":"tr-create-fix","capability":"CREATE","action":"FIX_VALIDATION_ERROR","from_state":"VALIDATION_ERROR","to_state":"DRAFT","requires_auth":True,"requires_ownership":False},
{"transition_id":"tr-create-submit","capability":"CREATE","action":"SUBMIT_FOR_REVIEW","from_state":"DRAFT","to_state":"SUBMITTED","requires_auth":True,"requires_ownership":False},
{"transition_id":"tr-my-draft","capability":"MY_LISTING","action":"VIEW_OWN","from_state":"DRAFT","to_state":"DRAFT","requires_auth":True,"requires_ownership":True},
{"transition_id":"tr-my-submitted","capability":"MY_LISTING","action":"VIEW_OWN","from_state":"SUBMITTED","to_state":"SUBMITTED","requires_auth":True,"requires_ownership":True},
{"transition_id":"tr-my-published","capability":"MY_LISTING","action":"VIEW_OWN","from_state":"PUBLISHED","to_state":"PUBLISHED","requires_auth":True,"requires_ownership":True},
{"transition_id":"tr-my-rejected","capability":"MY_LISTING","action":"VIEW_OWN","from_state":"REJECTED","to_state":"REJECTED","requires_auth":True,"requires_ownership":True},
{"transition_id":"tr-my-paused","capability":"MY_LISTING","action":"VIEW_OWN","from_state":"PAUSED","to_state":"PAUSED","requires_auth":True,"requires_ownership":True},
{"transition_id":"tr-my-closed","capability":"MY_LISTING","action":"VIEW_OWN","from_state":"CLOSED","to_state":"CLOSED","requires_auth":True,"requires_ownership":True},
{"transition_id":"tr-edit-draft","capability":"EDIT","action":"EDIT_FIELDS","from_state":"DRAFT","to_state":"DRAFT","requires_auth":True,"requires_ownership":True},
{"transition_id":"tr-edit-rejected","capability":"EDIT","action":"EDIT_REJECTED","from_state":"REJECTED","to_state":"DRAFT","requires_auth":True,"requires_ownership":True},
{"transition_id":"tr-edit-published","capability":"EDIT","action":"EDIT_FIELDS","from_state":"PUBLISHED","to_state":"PUBLISHED","requires_auth":True,"requires_ownership":True},
{"transition_id":"tr-edit-paused","capability":"EDIT","action":"EDIT_FIELDS","from_state":"PAUSED","to_state":"PAUSED","requires_auth":True,"requires_ownership":True},
{"transition_id":"tr-edit-pause","capability":"EDIT","action":"PAUSE_PUBLICATION","from_state":"PUBLISHED","to_state":"PAUSED","requires_auth":True,"requires_ownership":True},
{"transition_id":"tr-edit-resume","capability":"EDIT","action":"RESUME_PUBLICATION","from_state":"PAUSED","to_state":"PUBLISHED","requires_auth":True,"requires_ownership":True},
{"transition_id":"tr-delete-draft","capability":"DELETE_OR_CLOSE","action":"DELETE","from_state":"DRAFT","to_state":"DELETED","requires_auth":True,"requires_ownership":True},
{"transition_id":"tr-delete-rejected","capability":"DELETE_OR_CLOSE","action":"DELETE","from_state":"REJECTED","to_state":"DELETED","requires_auth":True,"requires_ownership":True},
{"transition_id":"tr-close-published","capability":"DELETE_OR_CLOSE","action":"CLOSE","from_state":"PUBLISHED","to_state":"CLOSED","requires_auth":True,"requires_ownership":True},
{"transition_id":"tr-close-paused","capability":"DELETE_OR_CLOSE","action":"CLOSE","from_state":"PAUSED","to_state":"CLOSED","requires_auth":True,"requires_ownership":True},
{"transition_id":"tr-delete-closed","capability":"DELETE_OR_CLOSE","action":"DELETE","from_state":"CLOSED","to_state":"DELETED","requires_auth":True,"requires_ownership":True},
{"transition_id":"tr-withdraw-submitted","capability":"DELETE_OR_CLOSE","action":"WITHDRAW","from_state":"SUBMITTED","to_state":"CLOSED","requires_auth":True,"requires_ownership":True}]

def canonical_json(v:Any)->str:return json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(",",":"))
def digest(v:Any)->str:return sha256(canonical_json(v).encode()).hexdigest()
def transition_index():return {(t["capability"],t["action"],t["from_state"],t["to_state"]):t for t in TRANSITIONS}

class ListingLifecycleCoverage:
 schema_version="B3_LISTING_LIFECYCLE_RUNTIME_STATE_V1"
 def __init__(self,state=None):
  if state is None:self.state={"schema_version":self.schema_version,"sequence_no":0,"events":[],"idempotency_index":{},"last_applied_sequence_no":0,"resume_checkpoint":None,"raw_site_variants":[],"unknown_gaps":[]};self._refresh_checkpoint()
  else:self.state=deepcopy(state);self._refresh_checkpoint()
 @staticmethod
 def idempotency_key(e):return digest({k:e.get(k) for k in ("capability","action","listing_ref_hash","command_id","page_id","action_id","from_state","to_state")})
 @staticmethod
 def ownership_decision(e):
  c=e["capability"]
  if c=="PUBLIC_READ":return {"authorized":True,"reason":"PUBLIC_READ_NO_AUTH_REQUIRED"}
  if not e.get("authenticated_session"):return {"authorized":False,"reason":"AUTH_REQUIRED"}
  if c=="CREATE":return {"authorized":True,"reason":"AUTHENTICATED_SELF_ACCOUNT_CREATE"}
  if c in {"EDIT","DELETE_OR_CLOSE","MY_LISTING"}:
   x=e.get("ownership_evidence") or {};r={"listing_ref_hash","actor_ref_hash","owner_ref_hash","evidence_pointer"}
   if not r.issubset(x) or not x.get("evidence_pointer"):return {"authorized":False,"reason":"OWNERSHIP_EVIDENCE_MISSING"}
   if x["actor_ref_hash"]!=x["owner_ref_hash"]:return {"authorized":False,"reason":"OWNERSHIP_MISMATCH"}
   if x["listing_ref_hash"]!=e.get("listing_ref_hash"):return {"authorized":False,"reason":"LISTING_EVIDENCE_MISMATCH"}
   return {"authorized":True,"reason":"AUTH_AND_OWNERSHIP_EVIDENCED"}
  return {"authorized":False,"reason":"UNKNOWN_CAPABILITY"}
 def apply(self,e):
  for f in ("capability","action","from_state","to_state","listing_ref_hash","action_id","command_id","page_id"):
   if not e.get(f):raise ValueError("missing "+f)
  if e["capability"] not in CAPABILITIES:raise ValueError("unknown capability")
  if e["from_state"] not in CANONICAL_STATES or e["to_state"] not in CANONICAL_STATES:raise ValueError("unknown canonical state")
  t=transition_index().get((e["capability"],e["action"],e["from_state"],e["to_state"]))
  if not t:raise ValueError("transition not defined")
  idem=self.idempotency_key(e)
  if idem in self.state["idempotency_index"]:return {"status":"DUPLICATE_SUPPRESSED","event_id":self.state["idempotency_index"][idem],"idempotency_key":idem}
  d=self.ownership_decision(e)
  if not d["authorized"]:return {"status":"BLOCKED","reason":d["reason"],"idempotency_key":idem}
  if e.get("final_submit") is True:return {"status":"BLOCKED","reason":"FINAL_SUBMIT_PROHIBITED_THIS_CYCLE","idempotency_key":idem}
  self.state["sequence_no"]+=1;s=self.state["sequence_no"];eid="life-"+digest({"seq":s,"idem":idem})[:20]
  r={"event_id":eid,"sequence_no":s,"idempotency_key":idem,"capability":e["capability"],"action":e["action"],"transition_id":t["transition_id"],"from_state":e["from_state"],"to_state":e["to_state"],"listing_ref_hash":e["listing_ref_hash"],"command_id":e["command_id"],"page_id":e["page_id"],"action_id":e["action_id"],"evidence_pointer":e.get("evidence_pointer"),"raw_site_state_before":e.get("raw_site_state_before"),"raw_site_state_after":e.get("raw_site_state_after"),"site_variant_namespace":e.get("site_variant_namespace"),"auth_reason":d["reason"],"dry_run":bool(e.get("dry_run",True))}
  self.state["events"].append(r);self.state["idempotency_index"][idem]=eid
  if r["raw_site_state_before"] or r["raw_site_state_after"]:self.state["raw_site_variants"].append({"event_id":eid,"site_variant_namespace":r["site_variant_namespace"] or "UNKNOWN","canonical_before":r["from_state"],"raw_before":r["raw_site_state_before"],"canonical_after":r["to_state"],"raw_after":r["raw_site_state_after"],"evidence_pointer":r["evidence_pointer"]})
  self.state["last_applied_sequence_no"]=s;self._refresh_checkpoint();return {"status":"APPLIED","event_id":eid,"idempotency_key":idem}
 def _refresh_checkpoint(self):
  t=self.state["events"][-1] if self.state["events"] else None;b={"last_applied_sequence_no":int(self.state.get("last_applied_sequence_no",0)),"last_event_id":t["event_id"] if t else None,"last_action_id":t["action_id"] if t else None};b["resume_token"]=digest(b);self.state["resume_checkpoint"]=b
 def replay(self,events):
  rs=[self.apply(e) for e in events];return {"results":rs,"applied_count":sum(r["status"]=="APPLIED" for r in rs),"duplicate_suppressed_count":sum(r["status"]=="DUPLICATE_SUPPRESSED" for r in rs),"blocked_count":sum(r["status"]=="BLOCKED" for r in rs),"checkpoint":deepcopy(self.state["resume_checkpoint"])}
 def gap_receipt(self,live_inputs=None):
  x=live_inputs or {};g=[{"gap_id":"gap-site-state-variants","status":"WAITING_INPUT" if not x.get("site_state_variants") else "COVERED","required_input":"site_state_variants"},{"gap_id":"gap-auth-session-shape","status":"WAITING_INPUT" if not x.get("auth_session_shape") else "COVERED","required_input":"auth_session_shape"},{"gap_id":"gap-ownership-evidence-shape","status":"WAITING_INPUT" if not x.get("ownership_evidence_shape") else "COVERED","required_input":"ownership_evidence_shape"},{"gap_id":"gap-delete-close-semantics","status":"UNKNOWN" if not x.get("delete_close_semantics") else "COVERED","required_input":"delete_close_semantics"},{"gap_id":"gap-final-submit-semantics","status":"UNKNOWN_PROHIBITED_THIS_CYCLE","required_input":"future_authorized_live_cycle"}];self.state["unknown_gaps"]=g;return {"schema_version":"B3_STATE_GAP_VALIDATION_RECEIPT_V1","required_canonical_states":list(CANONICAL_STATES),"required_capabilities":list(CAPABILITIES),"canonical_state_coverage_count":len(CANONICAL_STATES),"capability_coverage_count":len(CAPABILITIES),"representative_transition_count":len(TRANSITIONS),"gaps":g,"waiting_or_unknown_count":sum(q["status"]!="COVERED" for q in g),"target_value_guessing":False,"final_write_or_edit_submit":False}
 def export_state(self):self._refresh_checkpoint();return deepcopy(self.state)
 def save(self,path):Path(path).write_text(json.dumps(self.export_state(),ensure_ascii=False,sort_keys=True,indent=2)+"\n",encoding="utf-8")
 @classmethod
 def load(cls,path):return cls(json.loads(Path(path).read_text(encoding="utf-8")))
