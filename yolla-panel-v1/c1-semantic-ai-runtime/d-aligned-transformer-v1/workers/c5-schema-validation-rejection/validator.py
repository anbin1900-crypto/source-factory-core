from __future__ import annotations
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime
from hashlib import sha256
import json,re
from typing import Any,Iterable,Mapping,Optional,Sequence

REJECTION_REASONS=("MISSING_REQUIRED_VALUE","TYPE_ERROR","RANGE_ERROR","UNMAPPED_FIELD","INVALID_CODE","FORMAT_ERROR","UNIT_CONVERSION_ERROR","IDENTIFIER_NORMALIZATION_ERROR","RELATION_TARGET_MISSING","PROVENANCE_REF_MISSING","EVIDENCE_REF_MISSING")
IDS={"schema_profile":"D_CANONICAL_SCHEMA_PROFILE_V1","field_mapping":"D_INBOUND_FIELD_MAPPING_CONTRACT_V1","validation_ruleset":"D_INTAKE_VALIDATION_RULESET_V1"}
class ContractFailClosedError(ValueError):
 def __init__(self,findings:Sequence[str]): super().__init__("FAIL_CLOSED:"+",".join(findings));self.findings=list(findings);self.decision="FAIL_CLOSED"
@dataclass(frozen=True)
class ClassificationResult:
 status:str;record_id:str;reasons:tuple[str,...];mapped_record:Optional[dict[str,Any]];source_record_sha256:str;findings:tuple[str,...]
 def to_dict(self): return {"status":self.status,"record_id":self.record_id,"reasons":list(self.reasons),"mapped_record":self.mapped_record,"source_record_sha256":self.source_record_sha256,"findings":list(self.findings)}
def canonical_json(v): return json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(",",":"))
def digest(v): return sha256(canonical_json(v).encode()).hexdigest()
def _text(v): return v.strip() if isinstance(v,str) else ""
def _id(c,k):
 for n in {"schema_profile":("schema_profile_id","contract_id"),"field_mapping":("mapping_contract_id","contract_id"),"validation_ruleset":("ruleset_id","contract_id")}[k]:
  if _text(c.get(n)): return _text(c[n])
 return ""
def _ver(c,k):
 for n in {"schema_profile":("schema_version","contract_version"),"field_mapping":("mapping_version","contract_version"),"validation_ruleset":("ruleset_version","contract_version")}[k]:
  if _text(c.get(n)): return _text(c[n])
 return ""
def _norm(v): return v.replace("-","_").upper()
def validate_contract_set(p,m,r,expected_versions):
 f=[];cs={"schema_profile":p,"field_mapping":m,"validation_ruleset":r}
 for k,eid in IDS.items():
  if _norm(_id(cs[k],k))!=_norm(eid): f.append(f"CONTRACT_ID_MISMATCH:{k}")
  if _ver(cs[k],k)!=expected_versions.get(k): f.append(f"CONTRACT_VERSION_MISMATCH:{k}")
 ph=_text(p.get("profile_sha256"));mh=_text(m.get("contract_sha256"))
 if ph:
  if _text(m.get("schema_profile_ref",{}).get("profile_sha256"))!=ph:f.append("MAPPING_SCHEMA_PROFILE_HASH_MISMATCH")
  if _text(r.get("schema_profile_ref"))!=ph:f.append("RULESET_SCHEMA_PROFILE_HASH_MISMATCH")
  if _text(r.get("mapping_contract_ref"))!=mh:f.append("RULESET_MAPPING_CONTRACT_HASH_MISMATCH")
 else:
  if _text(m.get("schema_profile_version"))!=_ver(p,"schema_profile"):f.append("MAPPING_SCHEMA_PROFILE_VERSION_MISMATCH")
  if _text(r.get("field_mapping_version"))!=_ver(m,"field_mapping"):f.append("RULESET_FIELD_MAPPING_VERSION_MISMATCH")
 catalog=r.get("reason_code_catalog",r.get("rejection_reasons"))
 if not isinstance(catalog,list) or not set(REJECTION_REASONS)<=set(catalog):f.append("REQUIRED_REJECTION_REASON_SUBSET_MISSING")
 if "reason_code_catalog" not in r and tuple(catalog or [])!=REJECTION_REASONS:f.append("FIXTURE_REJECTION_REASON_ORDER_MISMATCH")
 if "fail_closed" in r and r.get("fail_closed") is not True:f.append("RULESET_FAIL_CLOSED_FALSE")
 if "silent_drop" in r and r.get("silent_drop") is not False:f.append("RULESET_SILENT_DROP_TRUE")
 u=m.get("unmapped_field_policy")
 if isinstance(u,Mapping) and (u.get("silent_drop") is not False or u.get("reason_code")!="UNMAPPED_FIELD"):f.append("UNMAPPED_FIELD_POLICY_MISMATCH")
 c1=m.get("producer_boundaries",{}).get("C-1",{})
 if c1 and (c1.get("direct_canonical_db_write") is not False or c1.get("may_change_d_schema") is not False):f.append("C1_AUTHORITY_BOUNDARY_MISMATCH")
 if f: raise ContractFailClosedError(f)
 return {"decision":"PASS","contract_ids":{k:_id(v,k) for k,v in cs.items()},"contract_versions":{k:_ver(v,k) for k,v in cs.items()},"contract_set_sha256":digest(cs),"profile_sha256":ph or None,"mapping_contract_sha256":mh or None,"ruleset_sha256":r.get("ruleset_sha256"),"findings":[]}
def _missing(v): return v is None or isinstance(v,str) and not v.strip()
def _date(v):
 try:return datetime.strptime(v,"%Y-%m-%d").date().isoformat() if isinstance(v,str) else None
 except ValueError:return None
def _ident(v):
 if not isinstance(v,str):return None
 x=v.strip().upper().replace("_","-");return x if re.fullmatch(r"[A-Z0-9]+(?:-[A-Z0-9]+)*",x) else None
def classify_record(record,p,m,r,versions):
 validate_contract_set(p,m,r,versions);s=deepcopy(dict(record));rid=str(s.get("source_record_id") or "UNRESOLVED");rs=[];fs=[]
 known=set(m.get("source_fields",{}));unknown=sorted(set(s)-known-set(r.get("ignored_source_fields",[])))
 if any(_missing(s.get(x)) for x in r.get("required_source_fields",[])):rs.append("MISSING_REQUIRED_VALUE");fs.append("REQUIRED_VALUE_MISSING")
 q=s.get("source_quantity");ql=None
 if q is not None and (isinstance(q,bool) or not isinstance(q,(int,float))):rs.append("TYPE_ERROR");fs.append("QUANTITY_TYPE")
 if isinstance(q,(int,float)) and not isinstance(q,bool):
  u=_text(s.get("source_quantity_unit")).lower();ql=q/1000 if u in {"ml","milliliter","milliliters"} else float(q) if u in {"l","liter","liters"} else None
  if ql is None:rs.append("UNIT_CONVERSION_ERROR");fs.append("UNIT")
  elif not p["fields"]["quantity_l"]["minimum"]<=ql<=p["fields"]["quantity_l"]["maximum"]:rs.append("RANGE_ERROR");fs.append("RANGE")
 if unknown:rs.append("UNMAPPED_FIELD");fs.append("UNMAPPED:"+",".join(unknown))
 status=m.get("code_maps",{}).get("source_status",{}).get(s.get("source_status"))
 if not _missing(s.get("source_status")) and status is None:rs.append("INVALID_CODE");fs.append("CODE")
 dt=_date(s.get("source_effective_date"))
 if not _missing(s.get("source_effective_date")) and dt is None:rs.append("FORMAT_ERROR");fs.append("DATE")
 bid=_ident(s.get("source_business_id"))
 if not _missing(s.get("source_business_id")) and bid is None:rs.append("IDENTIFIER_NORMALIZATION_ERROR");fs.append("IDENTIFIER")
 if not _missing(s.get("source_relation_type")) and _missing(s.get("source_relation_target")):rs.append("RELATION_TARGET_MISSING");fs.append("RELATION")
 if _missing(s.get("source_provenance_ref")):rs.append("PROVENANCE_REF_MISSING");fs.append("PROVENANCE")
 if _missing(s.get("source_evidence_ref")):rs.append("EVIDENCE_REF_MISSING");fs.append("EVIDENCE")
 order={v:i for i,v in enumerate(REJECTION_REASONS)};rs=sorted(set(rs),key=order.get)
 if rs:return ClassificationResult("REJECTED",rid,tuple(rs),None,digest(s),tuple(fs))
 mapped={"record_id":rid.strip(),"title":_text(s["source_title"]),"quantity_l":ql,"status":status,"effective_date":dt,"business_id":bid,"relation_type":s.get("source_relation_type") or None,"relation_target":s.get("source_relation_target") or None,"provenance_ref":_text(s["source_provenance_ref"]),"evidence_ref":_text(s["source_evidence_ref"]),"source_record_sha256":digest(s)}
 return ClassificationResult("VALID",rid,(),mapped,digest(s),())
def classify_records(records:Iterable[Mapping[str,Any]],p,m,r,versions,*,source_kind:str):
 results=[classify_record(x,p,m,r,versions) for x in records];counts={x:0 for x in REJECTION_REASONS};valid=[];rejected=[]
 for x in results:
  if x.status=="VALID":valid.append(x.mapped_record)
  else:
   rejected.append(x.to_dict())
   for reason in x.reasons:counts[reason]+=1
 silent=len(results)-len(valid)-len(rejected)
 if silent:raise AssertionError("SILENT_DROP_DETECTED")
 return {"classification_mode":source_kind,"input_record_count":len(results),"valid_count":len(valid),"rejected_count":len(rejected),"pending_count":0,"silent_drop_count":silent,"rejection_reason_counts":counts,"valid_records":valid,"rejected_records":rejected,"actual_d_accepted_data":False}
