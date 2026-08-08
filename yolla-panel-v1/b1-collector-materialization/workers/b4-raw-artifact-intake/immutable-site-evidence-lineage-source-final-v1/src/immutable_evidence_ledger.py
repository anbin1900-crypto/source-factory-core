from __future__ import annotations

import copy
import hashlib
import json
from dataclasses import dataclass
from typing import Any

EVIDENCE_KINDS = ("site","page","action","request","response","entity","form","adapter","receipt")
LANES = ("DATA","PRODUCT","WRITE","MY_LISTING","EDIT")
REDACTION_STATES = ("NONE","REDACTED_REFERENCE_ONLY","REJECTED_SECRET_OR_PII")
CAPTURE_METHODS = ("FIXTURE","BROWSER_DOM","CDP_NETWORK","HTTP_RESPONSE","DERIVED_REFERENCE","SUCCESSOR_RECEIPT","UNKNOWN")

def cjson(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")

def sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()

def hash_object(value: Any) -> str:
    return sha256(cjson(value))

def dedupe_key(record: dict[str, Any]) -> str:
    identity = {"site_slot":record["site_slot"],"lane":record["lane"],"evidence_kind":record["evidence_kind"],"source_pointer":record["source_pointer"],"source_sha256":record["source_sha256"],"source_reference_time":record["source_reference_time"]}
    return hash_object(identity)

def record_hash(record: dict[str, Any]) -> str:
    return hash_object({k:v for k,v in record.items() if k!="record_hash"})

def make_record(*,site_slot:str,lane:str,evidence_kind:str,source_pointer:str,source_sha256:str,observation_time:str,source_reference_time:str,capture_method:str,redaction_state:str,confidence:float|None,source_fields:dict[str,Any],previous_record_hash:str="GENESIS",status:str="OBSERVED",delta_kind:str="BASE",drift_from_hash:str|None=None)->dict[str,Any]:
    if evidence_kind not in EVIDENCE_KINDS: raise ValueError("unsupported evidence_kind")
    if lane not in LANES: raise ValueError("unsupported lane")
    if redaction_state not in REDACTION_STATES: raise ValueError("unsupported redaction_state")
    if capture_method not in CAPTURE_METHODS: raise ValueError("unsupported capture_method")
    if confidence is not None and not (0.0<=confidence<=1.0): raise ValueError("confidence out of range")
    record={"schema_version":"B4_IMMUTABLE_EVIDENCE_RECORD_V1","site_slot":site_slot,"lane":lane,"evidence_kind":evidence_kind,"status":status,"source_pointer":source_pointer,"source_sha256":source_sha256,"observation_time":observation_time,"source_reference_time":source_reference_time,"capture_method":capture_method,"redaction_state":redaction_state,"confidence":confidence,"source_fields":copy.deepcopy(source_fields),"previous_record_hash":previous_record_hash,"delta_kind":delta_kind,"drift_from_hash":drift_from_hash}
    record["dedupe_key"]=dedupe_key(record); record["record_hash"]=record_hash(record); return record

@dataclass
class AppendResult:
    disposition:str
    record:dict[str,Any]|None

class AppendOnlyEvidenceLedger:
    def __init__(self): self.records=[]; self.by_dedupe={}
    def append(self,record:dict[str,Any])->AppendResult:
        if record_hash(record)!=record["record_hash"]: raise ValueError("record hash mismatch")
        key=record["dedupe_key"]; existing=self.by_dedupe.get(key)
        if existing:
            if existing["source_sha256"]==record["source_sha256"] and existing["source_fields"]==record["source_fields"]: return AppendResult("DUPLICATE_IDENTICAL_SUPPRESSED",existing)
            raise ValueError("DUPLICATE_COLLISION")
        if self.records and record["previous_record_hash"]!=self.records[-1]["record_hash"]: raise ValueError("lineage previous hash mismatch")
        if not self.records and record["previous_record_hash"]!="GENESIS": raise ValueError("first record must start at GENESIS")
        self.records.append(copy.deepcopy(record)); self.by_dedupe[key]=copy.deepcopy(record); return AppendResult("APPENDED",record)
    def append_delta(self,previous:dict[str,Any],*,source_sha256:str,observation_time:str,source_reference_time:str,source_fields:dict[str,Any])->AppendResult:
        rec=make_record(site_slot=previous["site_slot"],lane=previous["lane"],evidence_kind=previous["evidence_kind"],source_pointer=previous["source_pointer"],source_sha256=source_sha256,observation_time=observation_time,source_reference_time=source_reference_time,capture_method=previous["capture_method"],redaction_state=previous["redaction_state"],confidence=previous["confidence"],source_fields=source_fields,previous_record_hash=self.records[-1]["record_hash"] if self.records else "GENESIS",status=previous["status"],delta_kind="DRIFT_DELTA",drift_from_hash=previous["record_hash"])
        return self.append(rec)
    def verify_chain(self)->bool:
        prev="GENESIS"
        for rec in self.records:
            if rec["previous_record_hash"]!=prev or record_hash(rec)!=rec["record_hash"]: return False
            prev=rec["record_hash"]
        return True

def build_ten_site_manifest()->dict[str,Any]:
    sites=[]
    for idx in range(1,11):
        slot=f"SITE_SLOT_{idx:02d}"; lanes=[]
        for lane in LANES: lanes.append({"lane":lane,"status":"WAITING_INPUT","site_authority_name":"UNKNOWN","source_pointer":"WAITING_INPUT","latest_record_hash":None,"evidence_counts":{kind:0 for kind in EVIDENCE_KINDS}})
        sites.append({"site_slot":slot,"status":"WAITING_INPUT","authority_site_id":"UNKNOWN","lanes":lanes})
    return {"schema_version":"B4_TEN_SITE_EVIDENCE_MANIFEST_V1","site_count":10,"lane_count_per_site":5,"total_site_lane_slots":50,"lanes":list(LANES),"sites":sites,"target_value_guessing":False,"append_rule":"ONLY_NEW_EVIDENCE_OR_DRIFT_DELTA_APPENDED","missing_input_policy":"WAITING_INPUT_OR_UNKNOWN_NO_GUESS"}

def validate_source_preservation(source:dict[str,Any],record:dict[str,Any])->tuple[bool,list[str]]:
    losses=[k for k,v in source.items() if k not in record["source_fields"] or record["source_fields"][k]!=v]
    return (len(losses)==0,losses)
