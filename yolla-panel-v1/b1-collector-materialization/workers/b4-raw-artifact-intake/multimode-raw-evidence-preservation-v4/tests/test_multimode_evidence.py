import sys, tempfile
from pathlib import Path
import pytest
ROOT=Path(__file__).resolve().parents[1]; sys.path.insert(0,str(ROOT))
from src.multimode_evidence_store import MultiModeEvidenceStore, EvidenceError

def store(): return MultiModeEvidenceStore(Path(tempfile.mkdtemp()))
def mat(s,raw=b'{"x":1}',kind='PAGE_STATE'): return s.materialize_raw(raw_bytes=raw,evidence_kind=kind,source_pointer='fixture://x',observed_at='2026-08-08T00:50:00+09:00',mode='DATA',redaction_metadata={'policy':'REDACTED'})
def test_exact_sha_readback():
 s=store(); r=mat(s); assert s.readback(r['evidence']['evidence_id'])==b'{"x":1}'
def test_duplicate_does_not_materialize():
 s=store(); a=mat(s); n1=len(list(s.raw_dir.glob('*.bin'))); b=mat(s); n2=len(list(s.raw_dir.glob('*.bin'))); assert b['disposition']=='DUPLICATE_REUSED' and n1==n2==1 and a['evidence']['evidence_id']==b['evidence']['evidence_id']
def test_secret_raw_rejected():
 s=store()
 with pytest.raises(EvidenceError): mat(s,b'Authorization: Bearer abcdefghijklmnop')
def test_pii_raw_rejected():
 s=store()
 with pytest.raises(EvidenceError): mat(s,b'{"email":"person@example.com"}')
def test_secret_metadata_rejected():
 s=store()
 with pytest.raises(EvidenceError): s.materialize_raw(raw_bytes=b'{}',evidence_kind='TRACE',source_pointer='x',observed_at='t',mode='DATA',redaction_metadata={'token':'secretvalue'})
def test_action_trace_cross_refs():
 s=store(); ids={}
 for k,kind in [('p','PAGE_STATE'),('d','DOM'),('q','NETWORK_REQUEST'),('r','NETWORK_RESPONSE'),('f','FORM_STRUCTURE'),('b','PRODUCT_BLUEPRINT')]: ids[k]=mat(s,('{"'+k+'":1}').encode(),kind)['evidence']['evidence_id']
 ref=s.bind_action(action_id='a1',mode='PRODUCT',page_id='p1',page_state_evidence_id=ids['p'],dom_evidence_ids=[ids['d']],network_request_evidence_ids=[ids['q']],network_response_evidence_ids=[ids['r']],form_structure_evidence_ids=[ids['f']],product_blueprint_evidence_ids=[ids['b']],source_record_envelope_pointer='source://env',command_checkpoint_pointer='checkpoint://cmd',worker_state_checkpoint_pointer='checkpoint://worker')
 tr=s.trace_action('a1'); assert tr['evidence_count']==6 and ref['product_blueprint_source_evidence_index']['evidence_ids']==[ids['b']]
def test_action_ref_overwrite_rejected():
 s=store(); ids={}
 for k,kind in [('p','PAGE_STATE'),('d','DOM'),('q','NETWORK_REQUEST'),('r','NETWORK_RESPONSE'),('f','FORM_STRUCTURE'),('b','PRODUCT_BLUEPRINT')]: ids[k]=mat(s,('{"'+k+'":1}').encode(),kind)['evidence']['evidence_id']
 kw=dict(action_id='a1',mode='PRODUCT',page_id='p1',page_state_evidence_id=ids['p'],dom_evidence_ids=[ids['d']],network_request_evidence_ids=[ids['q']],network_response_evidence_ids=[ids['r']],form_structure_evidence_ids=[ids['f']],product_blueprint_evidence_ids=[ids['b']],source_record_envelope_pointer='s',command_checkpoint_pointer='c',worker_state_checkpoint_pointer='w')
 s.bind_action(**kw); kw['mode']='EDIT'
 with pytest.raises(EvidenceError): s.bind_action(**kw)
def test_compatibility_pointers_preserved():
 s=store(); s.set_compatibility_pointers(source_record_envelope_pointer='s',command_artifact_checkpoint_pointer='c',worker_state_checkpoint_pointer='w'); m=s._manifest(); assert m['compatibility']['source_record_envelope_pointer']=='s' and m['compatibility']['command_artifact_checkpoint_pointer']=='c'
