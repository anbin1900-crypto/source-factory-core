from __future__ import annotations
import copy,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'src')); sys.path.insert(0,str(ROOT))
from immutable_evidence_ledger import AppendOnlyEvidenceLedger,build_ten_site_manifest,hash_object,make_record,validate_source_preservation
from validate_lineage import run

def base_record(source=None):
    source=source or {'a':1,'nested':{'b':2}}
    return make_record(site_slot='SITE_SLOT_01',lane='DATA',evidence_kind='response',source_pointer='fixture://response/1',source_sha256=hash_object(source),observation_time='2026-08-08T13:30:00+09:00',source_reference_time='2026-08-08T13:29:00+09:00',capture_method='FIXTURE',redaction_state='NONE',confidence=1.0,source_fields=source)

def test_manifest_is_10_by_5():
    m=build_ten_site_manifest(); assert m['site_count']==10 and m['total_site_lane_slots']==50

def test_record_separates_times_and_capture_metadata():
    r=base_record(); assert r['observation_time']!=r['source_reference_time'] and r['capture_method']=='FIXTURE' and r['confidence']==1.0

def test_source_fields_preserved_without_mutation():
    src={'a':1,'nested':{'b':2}}; before=copy.deepcopy(src); r=base_record(src); ok,loss=validate_source_preservation(src,r); assert ok and not loss and src==before

def test_duplicate_identical_suppressed():
    l=AppendOnlyEvidenceLedger(); r=base_record(); assert l.append(r).disposition=='APPENDED'; assert l.append(copy.deepcopy(r)).disposition=='DUPLICATE_IDENTICAL_SUPPRESSED'; assert len(l.records)==1

def test_duplicate_collision_rejected():
    l=AppendOnlyEvidenceLedger(); r=base_record(); l.append(r); bad=copy.deepcopy(r); bad['source_fields']={'a':999}; bad['record_hash']=hash_object({k:v for k,v in bad.items() if k!='record_hash'})
    try: l.append(bad)
    except ValueError as e: assert str(e)=='DUPLICATE_COLLISION'
    else: raise AssertionError('collision not rejected')

def test_drift_delta_appends_and_links():
    l=AppendOnlyEvidenceLedger(); r=base_record(); l.append(r); src={'a':2}; d=l.append_delta(r,source_sha256=hash_object(src),observation_time='2026-08-08T13:31:00+09:00',source_reference_time='2026-08-08T13:30:30+09:00',source_fields=src); assert d.record['delta_kind']=='DRIFT_DELTA' and d.record['drift_from_hash']==r['record_hash'] and l.verify_chain()

def test_required_evidence_kind_fixture_coverage():
    fixture=json.loads((ROOT/'fixtures/B4_LINEAGE_FIXTURE_V1.json').read_text()); assert {x['evidence_kind'] for x in fixture['records']}=={'site','page','action','request','response','entity','form','adapter','receipt'}

def test_validation_receipt_passes_all_invariants():
    receipt,_=run(); assert receipt['status']=='PASS' and receipt['source_mutation_count']==0 and receipt['source_field_loss_count']==0 and receipt['duplicate_collision']=='PASS_REJECTED'
