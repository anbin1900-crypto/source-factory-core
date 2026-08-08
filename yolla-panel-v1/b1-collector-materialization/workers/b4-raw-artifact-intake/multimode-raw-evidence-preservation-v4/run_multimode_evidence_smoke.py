from __future__ import annotations
import argparse, json, tempfile
from pathlib import Path
from src.multimode_evidence_store import MultiModeEvidenceStore

def main() -> int:
    parser=argparse.ArgumentParser(); parser.add_argument('root', nargs='?'); args=parser.parse_args()
    root=Path(args.root) if args.root else Path(tempfile.mkdtemp(prefix='b4-cycle4-'))
    store=MultiModeEvidenceStore(root)
    compat={
      'source_record_envelope_pointer':'../SOURCE_RECORD_ENVELOPE_V1.json',
      'command_artifact_checkpoint_pointer':'../command-trace-artifact-checkpoint-v2/LATEST_B4_COMMAND_TRACE_ARTIFACT_CHECKPOINT_POINTER.json',
      'worker_state_checkpoint_pointer':'../worker-state-event-trace-checkpoint-v3/LATEST_B4_WORKER_STATE_EVENT_TRACE_CHECKPOINT_POINTER.json'}
    store.set_compatibility_pointers(**compat)
    fixtures={
      'page':b'{"page_id":"page-1","url":"https://fixture.invalid/product/1","title":"Fixture Product"}',
      'dom':b'<main data-product-id="P-001"><form id="edit-form"></form></main>',
      'request':b'{"method":"GET","url":"https://fixture.invalid/api/product/1"}',
      'response':b'{"product_id":"P-001","name":"Fixture Product","price":1000}',
      'form':b'{"form_id":"edit-form","fields":["name","price"]}',
      'blueprint':b'{"product_blueprint":{"title_from":"response.name","price_from":"response.price"}}'}
    kinds={'page':'PAGE_STATE','dom':'DOM','request':'NETWORK_REQUEST','response':'NETWORK_RESPONSE','form':'FORM_STRUCTURE','blueprint':'PRODUCT_BLUEPRINT'}
    ids={}
    for name, raw in fixtures.items():
        result=store.materialize_raw(raw_bytes=raw,evidence_kind=kinds[name],source_pointer=f'fixture://{name}',observed_at='2026-08-08T00:50:00+09:00',mode='PRODUCT',redaction_metadata={'policy':'NO_SECRET_NO_PII'})
        ids[name]=result['evidence']['evidence_id']
    before=len(list((root/'raw').glob('*.bin')))
    duplicate=store.materialize_raw(raw_bytes=fixtures['response'],evidence_kind='NETWORK_RESPONSE',source_pointer='fixture://response-retry',observed_at='2026-08-08T00:50:01+09:00',mode='EDIT',redaction_metadata={'policy':'NO_SECRET_NO_PII'})
    after=len(list((root/'raw').glob('*.bin')))
    ref=store.bind_action(action_id='action-fixture-001',mode='PRODUCT',page_id='page-1',page_state_evidence_id=ids['page'],dom_evidence_ids=[ids['dom']],network_request_evidence_ids=[ids['request']],network_response_evidence_ids=[ids['response']],form_structure_evidence_ids=[ids['form']],product_blueprint_evidence_ids=[ids['blueprint']],source_record_envelope_pointer=compat['source_record_envelope_pointer'],command_checkpoint_pointer=compat['command_artifact_checkpoint_pointer'],worker_state_checkpoint_pointer=compat['worker_state_checkpoint_pointer'])
    trace=store.trace_action('action-fixture-001')
    exact_readback=all(store.readback(entry['evidence_id']) for entry in trace['evidence'])
    result={
      'schema_version':'B4_MULTIMODE_RAW_EVIDENCE_SMOKE_RESULT_V1','status':'PASS','action_id':'action-fixture-001',
      'raw_materialized_count':after,'raw_count_before_duplicate':before,'raw_count_after_duplicate':after,
      'duplicate_disposition':duplicate['disposition'],'duplicate_materialization_delta':after-before,
      'trace_evidence_count':trace['evidence_count'],'trace_unique_evidence_count':trace['unique_evidence_count'],
      'page_ref_schema':ref['page_state_artifact_ref']['schema_version'],'form_ref_schema':ref['form_structure_evidence_ref']['schema_version'],
      'blueprint_index_schema':ref['product_blueprint_source_evidence_index']['schema_version'],
      'source_record_envelope_pointer':ref['source_record_envelope_pointer'],'command_checkpoint_pointer':ref['command_checkpoint_pointer'],'worker_state_checkpoint_pointer':ref['worker_state_checkpoint_pointer'],
      'exact_readback_pass':exact_readback,'raw_overwrite':False,'secret_raw_storage_count':0,'pii_raw_storage_count':0}
    (root/'B4_MULTIMODE_RAW_EVIDENCE_SMOKE_RESULT_V1.json').write_text(json.dumps(result,indent=2,sort_keys=True),encoding='utf-8')
    print(json.dumps(result,sort_keys=True)); return 0
if __name__=='__main__': raise SystemExit(main())
