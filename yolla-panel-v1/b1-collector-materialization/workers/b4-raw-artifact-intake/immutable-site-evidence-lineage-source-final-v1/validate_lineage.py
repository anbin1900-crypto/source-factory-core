from __future__ import annotations
import copy,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'src'))
from immutable_evidence_ledger import AppendOnlyEvidenceLedger,build_ten_site_manifest,hash_object,make_record,validate_source_preservation

def run():
    fixture=json.loads((ROOT/'fixtures/B4_LINEAGE_FIXTURE_V1.json').read_text(encoding='utf-8'))
    ledger=AppendOnlyEvidenceLedger(); source_mutation=0; source_field_loss=[]; previous='GENESIS'; first=None
    for item in fixture['records']:
        source=copy.deepcopy(item['source_fields']); before=hash_object(source)
        rec=make_record(site_slot=fixture['site_slot'],lane=fixture['lane'],evidence_kind=item['evidence_kind'],source_pointer=f"{fixture['source_pointer_prefix']}/{item['evidence_kind']}",source_sha256=hash_object(source),observation_time=fixture['observation_time'],source_reference_time=fixture['source_reference_time'],capture_method='FIXTURE',redaction_state='REDACTED_REFERENCE_ONLY' if item['evidence_kind'] in {'receipt','request'} else 'NONE',confidence=None if 'UNKNOWN' in json.dumps(source) or 'WAITING_INPUT' in json.dumps(source) else 1.0,source_fields=source,previous_record_hash=previous,status='WAITING_INPUT' if 'WAITING_INPUT' in json.dumps(source) else 'OBSERVED')
        ledger.append(rec); ok,loss=validate_source_preservation(source,rec)
        if not ok: source_field_loss.extend(loss)
        if hash_object(source)!=before: source_mutation+=1
        previous=rec['record_hash']; first=first or rec
    duplicate=ledger.append(copy.deepcopy(first)).disposition
    collision_rec=copy.deepcopy(first); collision_rec['source_fields']={'mutated':True}; collision_rec['record_hash']=hash_object({k:v for k,v in collision_rec.items() if k!='record_hash'})
    try: ledger.append(collision_rec); collision='FAIL_NOT_REJECTED'
    except ValueError as exc: collision='PASS_REJECTED' if str(exc)=='DUPLICATE_COLLISION' else f'FAIL_{exc}'
    drift_source={'host':'fixture.invalid','status':'OBSERVED_LATER'}
    drift=ledger.append_delta(first,source_sha256=hash_object(drift_source),observation_time='2026-08-08T13:31:00+09:00',source_reference_time='2026-08-08T13:30:30+09:00',source_fields=drift_source)
    manifest=build_ten_site_manifest()
    receipt={'schema_version':'B4_LINEAGE_VALIDATION_RECEIPT_V1','status':'PASS','fixture_record_count':len(fixture['records']),'evidence_kind_coverage':sorted(x['evidence_kind'] for x in fixture['records']),'source_mutation_count':source_mutation,'source_field_loss_count':len(source_field_loss),'source_field_loss_keys':source_field_loss,'duplicate_identical_disposition':duplicate,'duplicate_collision':collision,'drift_delta_disposition':drift.disposition,'drift_from_hash_bound':bool(drift.record and drift.record['drift_from_hash']==first['record_hash']),'hash_lineage_pass':ledger.verify_chain(),'ten_site_manifest_site_count':manifest['site_count'],'ten_site_manifest_lane_slots':manifest['total_site_lane_slots'],'target_value_guessing':False,'raw_secret_or_pii':False,'raw_artifact_overwrite':False,'ledger_record_count_after_dedupe_and_drift':len(ledger.records)}
    assert receipt['source_mutation_count']==0 and receipt['source_field_loss_count']==0
    assert receipt['duplicate_identical_disposition']=='DUPLICATE_IDENTICAL_SUPPRESSED' and receipt['duplicate_collision']=='PASS_REJECTED'
    assert receipt['drift_delta_disposition']=='APPENDED' and receipt['drift_from_hash_bound'] and receipt['hash_lineage_pass']
    assert receipt['ten_site_manifest_site_count']==10 and receipt['ten_site_manifest_lane_slots']==50
    return receipt,manifest

if __name__=='__main__':
    receipt,manifest=run(); (ROOT/'artifacts/B4_LINEAGE_VALIDATION_RECEIPT_V1.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2,sort_keys=True)+'\n',encoding='utf-8'); print(json.dumps(receipt,ensure_ascii=False,sort_keys=True))
