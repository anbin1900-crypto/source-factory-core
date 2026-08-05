from __future__ import annotations
import hashlib,json,re
from pathlib import Path
SHA=re.compile(r"^[0-9a-f]{64}$"); BLOB=re.compile(r"^[0-9a-f]{40}$"); MIME=re.compile(r"^[a-z0-9.+-]+/[a-z0-9.+-]+$")
class ManifestValidationError(ValueError): pass
def req(ok,msg):
    if not ok: raise ManifestValidationError(msg)
def load(path): return json.loads(Path(path).read_text(encoding="utf-8"))
def digest(data): return hashlib.sha256(data).hexdigest()
def secret_keys(v):
    out=[]
    if isinstance(v,dict):
        for k,x in v.items():
            if re.search(r"(api.?key|token|password|credential|secret)",str(k),re.I) and k not in {"credential_reference","secret_storage"}: out.append(k)
            out+=secret_keys(x)
    elif isinstance(v,list):
        for x in v: out+=secret_keys(x)
    return out
def validate_entry(e,root):
    fields="artifact_native_key storage_pointer mime_type byte_size sha256 official_source_url captured_at locator redaction_status personal_data_status personal_data_review record_count immutability raw_overwrite secret_storage observation".split()
    req(all(k in e for k in fields),"missing field")
    req(e["mime_type"]=="application/json" and MIME.fullmatch(e["mime_type"]),"mime")
    req(isinstance(e["byte_size"],int) and e["byte_size"]>0,"size"); req(SHA.fullmatch(e["sha256"]),"sha")
    req(e["official_source_url"].startswith("https://"),"url"); req(e["immutability"]=="APPEND_ONLY_NO_OVERWRITE","immutable")
    req(e["raw_overwrite"] is False and e["secret_storage"] is False,"write/secret")
    req(e["personal_data_status"] in {"ALLOW","DENY","REVIEW"},"pii")
    req(e["personal_data_review"]["classification"]==e["personal_data_status"] and e["personal_data_review"]["personal_data_promotion"] is False,"pii review")
    o=e["observation"]; req(o["fixture_bytes_observed"] is True and o["actual_site_response_observed"] is False,"observation")
    req(o["actual_site_mime_type"]=="NOT_OBSERVED" and o["actual_site_sha256"]=="NOT_OBSERVED","promotion")
    loc=e["locator"]; req(BLOB.fullmatch(loc["blob_sha"]) and BLOB.fullmatch(loc["ref"]) and loc["byte_scope"]=="EXACT_GIT_BLOB_BYTES","locator")
    req(o["evidence_pointer"]==loc,"evidence")
    marker="yolla-panel-v1/b1-collector-materialization/workers/b4-raw-artifact-intake/"
    req(loc["path"].startswith(marker),"owned path"); p=root/loc["path"][len(marker):]
    req(p.is_file(),"raw missing"); b=p.read_bytes(); req(len(b)==e["byte_size"] and digest(b)==e["sha256"],"byte parity")
    obj=json.loads(b.decode()); req(len(obj.get("records",[]))==e["record_count"] and not secret_keys(obj),"record/secret")
def validate_manifest(m,root):
    req(m["schema_version"]=="RAW_ARTIFACT_MANIFEST_V2" and m["task_id"]=="RAW_ARTIFACT_MANIFEST_V2","identity")
    req(m["directive_comment_id"]==5196652743,"directive")
    a=m["source_v1_authority"]; req(a["head"]=="6dfe697363a69f83797775aa549f34614aa3748a" and a["manifest_blob"]=="bca1029b2587b4c78f6fdd78df6c9b95031addb1" and a["raw_bytes_modified"] is False,"v1 authority")
    es=m["entries"]; req(m["artifact_count"]==len(es)==2 and len({x["artifact_native_key"] for x in es})==2,"artifact count")
    for e in es: validate_entry(e,root)
    req(m["total_record_count"]==sum(x["record_count"] for x in es)==4,"record count")
    b=m["boundaries"]
    for k in "raw_overwrite secret_storage personal_data_promotion actual_site_extraction d_canonical_db_write production ready merge".split(): req(b[k] is False,k)
    req(b["semantic_transformation_count"]==0,"semantic")
    return {"result":"PASS","artifact_count":2,"total_record_count":4}
def validate_root(root):
    root=Path(root); return validate_manifest(load(root/"RAW_ARTIFACT_MANIFEST_V2.json"),root)
if __name__=="__main__":
    import argparse
    p=argparse.ArgumentParser(); p.add_argument("--root",type=Path,default=Path(__file__).resolve().parents[1]); a=p.parse_args()
    print(json.dumps(validate_root(a.root),sort_keys=True))
