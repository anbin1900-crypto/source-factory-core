#!/usr/bin/env python3
import hashlib, json, re
from pathlib import Path
HEX64=re.compile(r"^[0-9a-f]{64}$")
def sha(s): return hashlib.sha256(s.encode("utf-8")).hexdigest()
def validate_record(record, source_text, contract):
    reasons=[]
    required=contract["record_contract"]["required_fields"]
    for key in required:
        if key not in record: reasons.append("REQUIRED_FIELD_MISSING")
    if reasons: return sorted(set(reasons))
    for key in ("source_record_id","document_native_ref","document_version_ref"):
        if not isinstance(record[key],str) or not record[key]: reasons.append("EMPTY_NATIVE_REFERENCE")
    if not isinstance(record["raw_text"],str) or not record["raw_text"]: reasons.append("RAW_TEXT_EMPTY")
    loc=record["locator"]; allowed=contract["record_contract"]["field_definitions"]["locator"]["allowed_locator_types"]
    if not isinstance(loc,dict) or loc.get("locator_type") not in allowed or not isinstance(loc.get("native_locator"),str) or not loc.get("native_locator"): reasons.append("LOCATOR_INVALID")
    if not isinstance(record["content_hash"],str) or not HEX64.fullmatch(record["content_hash"]) or record["content_hash"]!=sha(record["raw_text"]): reasons.append("CONTENT_HASH_MISMATCH")
    if not isinstance(record["source_sha256"],str) or not HEX64.fullmatch(record["source_sha256"]): reasons.append("SOURCE_SHA256_INVALID")
    span=record["source_span"]
    if not isinstance(span,dict) or span.get("span_unit")!="UNICODE_CODE_POINT" or not isinstance(span.get("start_inclusive"),int) or not isinstance(span.get("end_exclusive"),int) or span.get("start_inclusive",-1)<0 or span.get("end_exclusive",0)<=span.get("start_inclusive",0): reasons.append("SOURCE_SPAN_INVALID")
    else:
        s,e=span["start_inclusive"],span["end_exclusive"]
        if e>len(source_text): reasons.append("SOURCE_SPAN_OUT_OF_BOUNDS")
        else:
            if source_text[s:e]!=span.get("span_text") or span.get("span_text")!=record["raw_text"]: reasons.append("SOURCE_SPAN_TEXT_MISMATCH")
            if span.get("span_text_hash")!=sha(span.get("span_text","")): reasons.append("SPAN_TEXT_HASH_MISMATCH")
    refs=record["evidence_refs"]
    if not isinstance(refs,list) or not refs: reasons.append("EVIDENCE_REF_MISSING")
    else:
        for ev in refs:
            if ev.get("source_record_id")!=record["source_record_id"] or ev.get("quote")!=record["raw_text"]: reasons.append("QUOTE_TEXT_MISMATCH")
            if ev.get("source_sha256")!=record["source_sha256"]: reasons.append("SOURCE_SHA256_EVIDENCE_MISMATCH")
            if ev.get("quote_hash")!=sha(ev.get("quote","")): reasons.append("QUOTE_HASH_MISMATCH")
    db=record["d_binding"]
    if not isinstance(db,dict) or db.get("fragment_id") is not None or db.get("document_version_id") is not None or db.get("generation_authority")!="D-1_ONLY": reasons.append("D_CANONICAL_ID_GENERATION_FORBIDDEN")
    if any(k in record for k in ("semantic_label","semantic_class","assertion","inferred_relation")): reasons.append("SEMANTIC_INFERENCE_FIELD_FORBIDDEN")
    return sorted(set(reasons))
def main():
    root=Path(__file__).resolve().parent
    contract=json.loads((root/"C2_D_FRAGMENT_LOCATOR_CONTRACT_V1.json").read_text(encoding="utf-8"))
    fixture=json.loads((root/"C2_D_FRAGMENT_LOCATOR_FIXTURE_V1.json").read_text(encoding="utf-8"))
    failures=[]
    for i,record in enumerate(fixture["records"]):
        reasons=validate_record(record,fixture["source_document_text"],contract)
        if reasons: failures.append({"record_index":i,"reasons":reasons})
    print(json.dumps({"status":"PASS" if not failures else "FAIL","record_count":len(fixture["records"]),"failures":failures},ensure_ascii=False,indent=2))
    return 0 if not failures else 1
if __name__=="__main__": raise SystemExit(main())
