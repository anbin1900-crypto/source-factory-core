from __future__ import annotations
import hashlib, json, os, re
from pathlib import Path
from typing import Any, Mapping

EVIDENCE_CLASSES={"OBSERVED","INFERRED","UNKNOWN"}
EVIDENCE_KINDS={"DOM","NETWORK_REQUEST","NETWORK_RESPONSE","ACTION","PAGE_STATE","PRODUCT_SEMANTIC","WRITE_SEMANTIC","DERIVED"}
SEMANTIC_KINDS={"PRODUCT","WRITE"}
SHA_RE=re.compile(r"^[0-9a-f]{64}$")
FORBIDDEN_KEYS={"authorization","cookie","cookies","token","access_token","refresh_token","api_key","apikey","secret","password","raw_bytes","response_body","dom_html","raw_html","headers","set_cookie","request_headers","response_headers","email","phone","mobile","rrn","ssn","resident_registration_number"}
SECRET_RE=re.compile(r"(?i)\b(bearer\s+[A-Za-z0-9._~+/=-]{6,}|api[_-]?key\s*[:=]\s*\S+|password\s*[:=]\s*\S+|token\s*[:=]\s*\S+)")
EMAIL_RE=re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b",re.I)
PHONE_RE=re.compile(r"(?:\+?82[- .]?)?0(?:10|11|16|17|18|19)[- .]?\d{3,4}[- .]?\d{4}")
RRN_RE=re.compile(r"\b\d{6}[- ]?[1-4]\d{6}\b")

class EvidenceLineageError(ValueError): pass

def cjson(v:Any)->bytes:
    return json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(",",":")).encode("utf-8")
def sha(v:Any)->str:
    data=v if isinstance(v,(bytes,bytearray)) else cjson(v)
    return hashlib.sha256(data).hexdigest()

def reject_raw_sensitive(v:Any,path="$"):
    if isinstance(v,Mapping):
        for k,x in v.items():
            if str(k).lower() in FORBIDDEN_KEYS:
                raise EvidenceLineageError(f"raw/sensitive field prohibited at {path}.{k}")
            reject_raw_sensitive(x,f"{path}.{k}")
    elif isinstance(v,list):
        for i,x in enumerate(v): reject_raw_sensitive(x,f"{path}[{i}]")
    elif isinstance(v,str):
        if v in {"<REDACTED>","UNKNOWN"}: return
        if SECRET_RE.search(v) or EMAIL_RE.search(v) or PHONE_RE.search(v) or RRN_RE.search(v):
            raise EvidenceLineageError(f"secret/PII-like value prohibited at {path}")

class RealSiteEvidenceLineageStore:
    def __init__(self,root:Path):
        self.root=Path(root); self.root.mkdir(parents=True,exist_ok=True)
        self.ledger=self.root/"events.jsonl"
        self.evidence_projection=self.root/"REAL_SITE_EVIDENCE_MANIFEST_V1.json"
        self.semantic_projection=self.root/"REAL_SITE_SEMANTIC_LINEAGE_INDEX_V1.json"
        self.receipt_projection=self.root/"REAL_SITE_RECEIPT_INDEX_V1.json"

    def _rows(self):
        if not self.ledger.exists(): return []
        return [json.loads(x) for x in self.ledger.read_text(encoding="utf-8").splitlines() if x.strip()]

    def _append(self,event):
        rows=self._rows(); prev=rows[-1]["entry_hash"] if rows else "GENESIS"
        payload=dict(event); payload["previous_entry_hash"]=prev
        h=sha(payload); row={**payload,"entry_hash":h}
        with self.ledger.open("a",encoding="utf-8") as f:
            f.write(json.dumps(row,ensure_ascii=False,sort_keys=True)+"\n"); f.flush(); os.fsync(f.fileno())
        self.rebuild()
        return row

    def verify_chain(self):
        prev="GENESIS"
        for row in self._rows():
            p=dict(row); h=p.pop("entry_hash")
            if p["previous_entry_hash"]!=prev or sha(p)!=h: raise EvidenceLineageError("ledger chain mismatch")
            prev=h
        return True

    def ingest_receipt(self,bundle:Mapping[str,Any],*,allow_fixture=False):
        reject_raw_sensitive(bundle)
        if bundle.get("schema_version")!="REAL_SITE_RECEIPT_BUNDLE_V1": raise EvidenceLineageError("REAL_SITE_RECEIPT_BUNDLE_V1 required")
        sk=bundle.get("source_kind")
        if sk not in {"ACTUAL_SITE","TEST_FIXTURE"}: raise EvidenceLineageError("invalid source_kind")
        if sk=="TEST_FIXTURE" and not allow_fixture: raise EvidenceLineageError("fixture receipt rejected outside test mode")
        required=["receipt_id","receipt_pointer","receipt_sha256","command_id","page_id","action_id","received_at"]
        for k in required:
            if not bundle.get(k): raise EvidenceLineageError(f"missing {k}")
        if not SHA_RE.fullmatch(str(bundle["receipt_sha256"])): raise EvidenceLineageError("receipt_sha256 must be exact sha256")
        evidence=bundle.get("evidence")
        if not isinstance(evidence,list) or not evidence: raise EvidenceLineageError("evidence required")
        for e in evidence:
            for k in ["evidence_id","evidence_kind","evidence_pointer","sha256","producer_id","evidence_class","observed_at"]:
                if not e.get(k): raise EvidenceLineageError(f"evidence missing {k}")
            if e["evidence_kind"] not in EVIDENCE_KINDS: raise EvidenceLineageError("invalid evidence_kind")
            if e["evidence_class"] not in EVIDENCE_CLASSES: raise EvidenceLineageError("invalid evidence_class")
            if not SHA_RE.fullmatch(str(e["sha256"])): raise EvidenceLineageError("evidence sha256 invalid")
            for k in ["command_id","page_id","action_id"]:
                if e.get(k,bundle[k])!=bundle[k]: raise EvidenceLineageError(f"{k} correlation mismatch")
        semantic=bundle.get("semantic_results",[])
        for s in semantic:
            if s.get("semantic_kind") not in SEMANTIC_KINDS: raise EvidenceLineageError("invalid semantic_kind")
            if s.get("evidence_class") not in EVIDENCE_CLASSES: raise EvidenceLineageError("invalid semantic evidence_class")
            c=float(s.get("confidence",-1))
            if c<0 or c>1: raise EvidenceLineageError("confidence out of range")
            if s["evidence_class"]=="INFERRED" and not s.get("derivation_reference"): raise EvidenceLineageError("INFERRED requires derivation_reference")
            if not s.get("raw_evidence_pointers") and not s.get("derived_evidence_pointers"): raise EvidenceLineageError("semantic evidence pointer required")
        identity=sha({"receipt_id":bundle["receipt_id"],"receipt_sha256":bundle["receipt_sha256"],"command_id":bundle["command_id"],"page_id":bundle["page_id"],"action_id":bundle["action_id"]})
        for row in self._rows():
            if row.get("event")=="RECEIPT_BOUND" and row.get("identity_sha256")==identity:
                return {"disposition":"DUPLICATE_IDENTICAL_SUPPRESSED","identity_sha256":identity}
        event={"schema_version":"REAL_SITE_LINEAGE_EVENT_V1","event":"RECEIPT_BOUND","source_kind":sk,"identity_sha256":identity,
               "receipt":{k:bundle[k] for k in required+["source_kind"]},
               "evidence":[{**e,"command_id":bundle["command_id"],"page_id":bundle["page_id"],"action_id":bundle["action_id"]} for e in evidence],
               "semantic_results":semantic,
               "cycle6_composite_pointer":bundle.get("cycle6_composite_pointer")}
        self._append(event); self.verify_chain()
        return {"disposition":"BOUND","identity_sha256":identity}

    def rebuild(self):
        receipts=[]; evidence=[]; semantic=[]
        for row in self._rows():
            if row.get("event")!="RECEIPT_BOUND": continue
            r=row["receipt"]; receipts.append({**r,"identity_sha256":row["identity_sha256"],"evidence_ids":[e["evidence_id"] for e in row["evidence"]]})
            evidence.extend(row["evidence"])
            semantic.extend(row.get("semantic_results",[]))
        self._atomic(self.receipt_projection,{"schema_version":"REAL_SITE_RECEIPT_INDEX_V1","receipts":receipts,"receipt_count":len(receipts),"actual_site_receipt_count":sum(1 for r in receipts if r["source_kind"]=="ACTUAL_SITE")})
        self._atomic(self.evidence_projection,{"schema_version":"REAL_SITE_EVIDENCE_MANIFEST_V1","evidence":evidence,"evidence_count":len(evidence),"raw_artifact_overwrite":False,"raw_payload_storage":False})
        self._atomic(self.semantic_projection,{"schema_version":"REAL_SITE_SEMANTIC_LINEAGE_INDEX_V1","entries":semantic,"entry_count":len(semantic),"producer_assertion_reinterpreted":False})
    def _atomic(self,path,payload):
        tmp=path.with_suffix(path.suffix+".tmp"); tmp.write_text(json.dumps(payload,ensure_ascii=False,indent=2,sort_keys=True),encoding="utf-8"); os.replace(tmp,path)
    def status(self):
        self.rebuild()
        r=json.loads(self.receipt_projection.read_text())
        return {"schema_version":"B4_REAL_SITE_LINEAGE_STATUS_V1","actual_site_receipt_count":r["actual_site_receipt_count"],"status":"LIVE_BOUND" if r["actual_site_receipt_count"] else "WAITING_INPUT","raw_artifact_overwrite":False,"raw_secret_storage":False}
