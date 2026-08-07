from __future__ import annotations
import hashlib, json, os
from pathlib import Path
from typing import Any, Mapping

CLASSES={"OBSERVED","INFERRED","UNKNOWN"}; TYPES={"NODE","EDGE"}
class SemanticEvidenceError(ValueError): pass

def cjson(v:Any)->bytes: return json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(",",":")).encode("utf-8")
def digest(v:Any)->str: return hashlib.sha256(cjson(v)).hexdigest()

class SemanticEvidenceIndex:
    def __init__(self, root:Path, raw_evidence_catalog:Mapping[str,str]):
        self.root=Path(root); self.root.mkdir(parents=True,exist_ok=True)
        self.log=self.root/'semantic-evidence.jsonl'; self.side=self.root/'semantic-side-records.jsonl'; self.projection=self.root/'SEMANTIC_EVIDENCE_INDEX_V1.json'
        self.raw_catalog=dict(raw_evidence_catalog)
    def _rows(self):
        if not self.log.exists(): return []
        return [json.loads(x) for x in self.log.read_text(encoding='utf-8').splitlines() if x.strip()]
    def _append(self,path:Path,row:dict):
        with path.open('a',encoding='utf-8',newline='\n') as f: f.write(json.dumps(row,ensure_ascii=False,sort_keys=True)+'\n'); f.flush(); os.fsync(f.fileno())
    def append_assertion(self,*,semantic_id:str,entity_type:str,producer_id:str,producer_assertion:Mapping[str,Any],evidence_class:str,confidence:float,raw_evidence_pointers:list[str],derived_evidence_pointers:list[str],derivation_reference:str|None,created_at:str):
        if entity_type not in TYPES: raise SemanticEvidenceError('invalid entity_type')
        if evidence_class not in CLASSES: raise SemanticEvidenceError('invalid evidence_class')
        if not (0.0<=float(confidence)<=1.0): raise SemanticEvidenceError('confidence out of range')
        if evidence_class=='INFERRED' and not derivation_reference: raise SemanticEvidenceError('INFERRED requires derivation_reference')
        if not raw_evidence_pointers and not derived_evidence_pointers: raise SemanticEvidenceError('evidence pointer required')
        missing=[p for p in raw_evidence_pointers if p not in self.raw_catalog]
        if missing: raise SemanticEvidenceError(f'unknown raw evidence pointer: {missing[0]}')
        rows=self._rows(); prev=rows[-1]['semantic_pointer'] if rows else None
        assertion_sha=digest(dict(producer_assertion))
        identity=digest({"semantic_id":semantic_id,"entity_type":entity_type,"producer_id":producer_id,"producer_assertion":dict(producer_assertion),"evidence_class":evidence_class,"confidence":float(confidence),"raw_evidence_pointers":raw_evidence_pointers,"derived_evidence_pointers":derived_evidence_pointers,"derivation_reference":derivation_reference})
        for r in rows:
            if r['identity_sha256']==identity:
                self._append(self.side,{"schema_version":"SEMANTIC_EVIDENCE_SIDE_RECORD_V1","disposition":"DUPLICATE_IDENTICAL_SUPPRESSED","semantic_id":semantic_id,"existing_semantic_pointer":r['semantic_pointer'],"identity_sha256":identity})
                return {"disposition":"DUPLICATE_IDENTICAL_SUPPRESSED","entry":r}
        seq=len(rows)+1; ptr=f"semantic://{seq:06d}/{identity[:16]}"
        entry={"schema_version":"SEMANTIC_EVIDENCE_ENTRY_V1","semantic_id":semantic_id,"entity_type":entity_type,"producer_id":producer_id,"producer_assertion":dict(producer_assertion),"evidence_class":evidence_class,"confidence":float(confidence),"raw_evidence_pointers":list(raw_evidence_pointers),"raw_evidence_sha256":{p:self.raw_catalog[p] for p in raw_evidence_pointers},"derived_evidence_pointers":list(derived_evidence_pointers),"derivation_reference":derivation_reference,"created_at":created_at,"assertion_sha256":assertion_sha,"identity_sha256":identity,"semantic_pointer":ptr,"previous_semantic_pointer":prev}
        self._append(self.log,entry); self.rebuild_projection(); return {"disposition":"APPENDED", "entry":entry}
    def rebuild_projection(self):
        rows=self._rows(); payload={"schema_version":"SEMANTIC_EVIDENCE_INDEX_V1","entry_count":len(rows),"node_count":sum(r['entity_type']=='NODE' for r in rows),"edge_count":sum(r['entity_type']=='EDGE' for r in rows),"classification_counts":{c:sum(r['evidence_class']==c for r in rows) for c in sorted(CLASSES)},"entries":rows,"raw_artifact_overwrite":False,"semantic_decision_by_b4":False}
        tmp=self.projection.with_suffix('.tmp'); tmp.write_text(json.dumps(payload,ensure_ascii=False,indent=2,sort_keys=True),encoding='utf-8'); os.replace(tmp,self.projection); return payload
    def lookup(self,semantic_id:str): return [r for r in self._rows() if r['semantic_id']==semantic_id]
    def reverse_trace(self,semantic_id:str):
        rows=self.lookup(semantic_id)
        return {"schema_version":"SEMANTIC_EVIDENCE_REVERSE_TRACE_V1","semantic_id":semantic_id,"entries":[{"semantic_pointer":r['semantic_pointer'],"evidence_class":r['evidence_class'],"confidence":r['confidence'],"raw_evidence_pointers":r['raw_evidence_pointers'],"raw_evidence_sha256":r['raw_evidence_sha256'],"derived_evidence_pointers":r['derived_evidence_pointers'],"derivation_reference":r['derivation_reference'],"producer_id":r['producer_id']} for r in rows]}
