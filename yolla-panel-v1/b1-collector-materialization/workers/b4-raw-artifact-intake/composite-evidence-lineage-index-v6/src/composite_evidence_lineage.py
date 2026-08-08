from __future__ import annotations
import hashlib, json, os
from pathlib import Path
from typing import Any, Mapping

MODES={"DATA","PRODUCT","WRITE","MY_LISTING","EDIT"}
ENTITY_TYPES={"NODE","EDGE"}

class CompositeEvidenceError(ValueError): pass
def cjson(v:Any)->bytes: return json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(",",":")).encode("utf-8")
def sha(v:bytes)->str: return hashlib.sha256(v).hexdigest()

class CompositeEvidenceLineageIndex:
    def __init__(self, root:Path, semantic_fixture:Mapping[str,Any], cycle4_raw_ids:set[str]):
        self.root=Path(root); self.root.mkdir(parents=True,exist_ok=True)
        self.log=self.root/"composite-lineage.jsonl"
        self.projection=self.root/"COMPOSITE_EVIDENCE_LINEAGE_INDEX_FIXTURE_V1.json"
        self.semantic_by_pointer={e["semantic_pointer"]:dict(e) for e in semantic_fixture["entries"]}
        self.cycle4_raw_ids=set(cycle4_raw_ids)

    def _rows(self):
        if not self.log.exists(): return []
        return [json.loads(x) for x in self.log.read_text(encoding="utf-8").splitlines() if x.strip()]

    def _resolve(self, semantic_pointers:list[str]):
        raw=[]; derived=[]; semantic=[]
        for ptr in semantic_pointers:
            if ptr not in self.semantic_by_pointer:
                raise CompositeEvidenceError("semantic pointer not found")
            e=self.semantic_by_pointer[ptr]; semantic.append(e)
            for r in e.get("raw_evidence_pointers",[]):
                if r not in self.cycle4_raw_ids:
                    raise CompositeEvidenceError("raw pointer not found in Cycle4 immutable evidence")
                if r not in raw: raw.append(r)
            for d in e.get("derived_evidence_pointers",[]):
                if d not in self.semantic_by_pointer:
                    raise CompositeEvidenceError("derived semantic pointer not found")
                if d not in derived: derived.append(d)
        if not raw and not derived:
            raise CompositeEvidenceError("composite must resolve to raw or derived evidence")
        return semantic,raw,derived

    def append(self, *, composite_id:str, composite_entity_type:str, mode:str, producer_id:str,
               producer_assertion:Mapping[str,Any], semantic_evidence_pointers:list[str], created_at:str):
        if mode not in MODES: raise CompositeEvidenceError("invalid mode")
        if composite_entity_type not in ENTITY_TYPES: raise CompositeEvidenceError("invalid entity type")
        _, raw, derived=self._resolve(semantic_evidence_pointers)
        assertion_sha=sha(cjson(dict(producer_assertion)))
        identity_payload={"composite_id":composite_id,"entity_type":composite_entity_type,"mode":mode,"producer_id":producer_id,"producer_assertion":dict(producer_assertion),"semantic_evidence_pointers":semantic_evidence_pointers}
        identity_sha=sha(cjson(identity_payload))
        for row in self._rows():
            if row["entry"]["identity_sha256"]==identity_sha:
                return {"disposition":"DUPLICATE_IDENTICAL_SUPPRESSED","entry":row["entry"]}
        rows=self._rows(); seq=len(rows)+1
        prev_ptr=rows[-1]["entry"]["composite_pointer"] if rows else None
        ptr=f"composite://{seq:06d}/{identity_sha[:16]}"
        entry={"schema_version":"COMPOSITE_EVIDENCE_LINEAGE_ENTRY_V1","composite_id":composite_id,"composite_entity_type":composite_entity_type,"mode":mode,"producer_id":producer_id,"producer_assertion":dict(producer_assertion),"semantic_evidence_pointers":list(semantic_evidence_pointers),"resolved_raw_evidence_pointers":raw,"resolved_derived_evidence_pointers":derived,"created_at":created_at,"assertion_sha256":assertion_sha,"identity_sha256":identity_sha,"composite_pointer":ptr,"previous_composite_pointer":prev_ptr}
        prev_hash=rows[-1]["entry_hash"] if rows else "GENESIS"
        payload={"event":"COMPOSITE_EVIDENCE_APPENDED","entry":entry,"previous_entry_hash":prev_hash}
        row=dict(payload); row["entry_hash"]=sha(cjson(payload))
        with self.log.open("a",encoding="utf-8") as f:
            f.write(json.dumps(row,ensure_ascii=False,sort_keys=True)+"\n"); f.flush(); os.fsync(f.fileno())
        self.rebuild_projection()
        return {"disposition":"NEW_APPEND_ONLY_ENTRY","entry":entry}

    def verify(self):
        prev="GENESIS"
        for row in self._rows():
            h=row["entry_hash"]
            payload={k:v for k,v in row.items() if k!="entry_hash"}
            if payload["previous_entry_hash"]!=prev or sha(cjson(payload))!=h:
                raise CompositeEvidenceError("lineage chain mismatch")
            self._resolve(row["entry"]["semantic_evidence_pointers"])
            prev=h
        return True

    def reverse_trace(self, composite_pointer:str):
        for row in self._rows():
            e=row["entry"]
            if e["composite_pointer"]==composite_pointer:
                semantic,raw,derived=self._resolve(e["semantic_evidence_pointers"])
                return {"schema_version":"COMPOSITE_EVIDENCE_REVERSE_TRACE_V1","composite_entry":e,"semantic_entries":semantic,"raw_evidence_pointers":raw,"derived_evidence_pointers":derived}
        raise CompositeEvidenceError("composite pointer not found")

    def rebuild_projection(self):
        entries=[r["entry"] for r in self._rows()]
        payload={"schema_version":"COMPOSITE_EVIDENCE_LINEAGE_INDEX_V1","entry_count":len(entries),"modes":sorted({e["mode"] for e in entries}),"entries":entries,"raw_artifact_materialization_count":0,"raw_artifact_overwrite":False,"semantic_decision_by_b4":False}
        tmp=self.projection.with_suffix(".tmp")
        tmp.write_text(json.dumps(payload,ensure_ascii=False,indent=2,sort_keys=True),encoding="utf-8")
        os.replace(tmp,self.projection)
        return payload
