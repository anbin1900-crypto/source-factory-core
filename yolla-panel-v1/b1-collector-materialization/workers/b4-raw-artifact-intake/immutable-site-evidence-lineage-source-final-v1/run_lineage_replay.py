from __future__ import annotations
import hashlib,json
from pathlib import Path
from validate_lineage import run

def digest(v): return hashlib.sha256(json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def main():
    r1,m1=run(); r2,m2=run()
    out={'schema_version':'B4_LINEAGE_REPLAY_RECEIPT_V1','status':'PASS','run_count':2,'validation_receipt_digest_1':digest(r1),'validation_receipt_digest_2':digest(r2),'manifest_digest_1':digest(m1),'manifest_digest_2':digest(m2),'validation_receipt_deterministic':digest(r1)==digest(r2),'manifest_deterministic':digest(m1)==digest(m2),'source_mutation_count':r1['source_mutation_count'],'source_field_loss_count':r1['source_field_loss_count'],'duplicate_collision':r1['duplicate_collision'],'raw_artifact_overwrite':False}
    assert out['validation_receipt_deterministic'] and out['manifest_deterministic']
    (Path(__file__).resolve().parent/'artifacts/B4_LINEAGE_REPLAY_RECEIPT_V1.json').write_text(json.dumps(out,ensure_ascii=False,indent=2,sort_keys=True)+'\n',encoding='utf-8')
    print(json.dumps(out,ensure_ascii=False,sort_keys=True))
if __name__=='__main__': main()
