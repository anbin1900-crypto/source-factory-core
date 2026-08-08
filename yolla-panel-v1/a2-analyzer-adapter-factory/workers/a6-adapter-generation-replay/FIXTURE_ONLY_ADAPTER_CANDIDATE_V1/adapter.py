from __future__ import annotations
import json, hashlib
REQUIRED_PARAMS=("cortarNo","realEstateType","page")
REQUIRED_RECORD=("listingId","complexNo","price","lat","lng")
class AdapterError(Exception):
    pass
def canonical(obj):
    return json.dumps(obj, sort_keys=True, separators=(",",":"), ensure_ascii=False)
def validate_request(req):
    missing=[k for k in REQUIRED_PARAMS if k not in req or req[k] in (None,"")]
    if missing:
        raise AdapterError("MISSING_REQUIRED_PARAMETER:"+",".join(missing))
    if not isinstance(req["page"], int) or req["page"] < 1:
        raise AdapterError("INVALID_PAGE")
    cursor=req.get("cursor")
    if cursor is not None and not isinstance(cursor,str):
        raise AdapterError("INVALID_CURSOR")
    return True
def validate_record(record):
    missing=[k for k in REQUIRED_RECORD if k not in record]
    if missing:
        raise AdapterError("SCHEMA_DRIFT:"+",".join(missing))
    if not record.get("listingId"):
        raise AdapterError("IDENTIFIER_MISSING")
def should_retry(status):
    return status in (429,500,502,503,504)
def replay(bundle):
    out=[]; seen=set(); stopped=False; stop_reason=None; visited_pages=set()
    pages=sorted(bundle["list_pages"], key=lambda x:x["request"]["page"])
    for page in pages:
        validate_request(page["request"])
        page_no=page["request"]["page"]
        if page_no in visited_pages:
            raise AdapterError("REPEATED_PAGE")
        visited_pages.add(page_no)
        response=page["response"]
        if response.get("status")!=200:
            raise AdapterError("LIST_RESPONSE_ERROR")
        new_count=0
        for record in response.get("items",[]):
            validate_record(record)
            rid=record["listingId"]
            if rid in seen:
                continue
            detail=bundle["details"].get(rid)
            if not detail or detail.get("status")!=200:
                raise AdapterError("DETAIL_RESPONSE_ERROR")
            if detail["item"].get("listingId")!=rid:
                raise AdapterError("IDENTIFIER_MISMATCH")
            normalized={**record, **{k:v for k,v in detail["item"].items() if k!="listingId"}}
            out.append(normalized); seen.add(rid); new_count+=1
        if response.get("lastPage") is True:
            stopped=True; stop_reason="LAST_PAGE_FLAG"; break
        if not response.get("items"):
            stopped=True; stop_reason="EMPTY_RESULT"; break
        if new_count == 0:
            stopped=True; stop_reason="NO_NEW_RECORD_IDS"; break
    out.sort(key=lambda x:x["listingId"])
    payload={"records":out,"record_count":len(out),"pagination_stopped":stopped,"stop_reason":stop_reason}
    payload["output_sha256"]=hashlib.sha256(canonical(payload).encode()).hexdigest()
    return payload
