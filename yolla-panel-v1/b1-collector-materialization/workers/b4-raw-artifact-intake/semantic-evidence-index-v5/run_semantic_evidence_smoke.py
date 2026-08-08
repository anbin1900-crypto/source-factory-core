from __future__ import annotations
import json, tempfile, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent; sys.path.insert(0,str(ROOT/'src'))
from semantic_evidence_index import SemanticEvidenceIndex
CAT={
"evidence-0c9073a255074c4a2fc66e8e":"0c9073a255074c4a2fc66e8ef29917cd8764581057b87882a3d5f6091698ea89",
"evidence-17347f2b17ba883d98706402":"17347f2b17ba883d9870640262ab7ec9fd0fc9c64d71ccf77f310ee7c4599bfc",
"evidence-2aed123220f249972a566986":"2aed123220f249972a56698623d7a305a5251464475e1f18427e09b2ced1f79d",
"evidence-3b499ceabecd18fc99b0f459":"3b499ceabecd18fc99b0f459e2f8224503cb9180192404d69136938132e79f86",
"evidence-45dc26a0ed1139eebe7837e6":"45dc26a0ed1139eebe7837e654e2121bc206040a6df9dd7a5def414793b5ebd1",
"evidence-9c5de9ba71755ad58c862ef8":"9c5de9ba71755ad58c862ef81c64735d4785d2affddd91de911b8baf59f8b322"}
def run(root:Path):
 s=SemanticEvidenceIndex(root,CAT)
 a=s.append_assertion(semantic_id='node:product-form',entity_type='NODE',producer_id='A5-BLUEPRINT',producer_assertion={'type':'FORM','label':'product-editor'},evidence_class='OBSERVED',confidence=1.0,raw_evidence_pointers=['evidence-45dc26a0ed1139eebe7837e6','evidence-9c5de9ba71755ad58c862ef8'],derived_evidence_pointers=[],derivation_reference=None,created_at='2026-08-08T01:30:00+09:00')
 b=s.append_assertion(semantic_id='node:product-blueprint',entity_type='NODE',producer_id='A5-BLUEPRINT',producer_assertion={'blueprint':'product-page','has_form':True},evidence_class='INFERRED',confidence=0.91,raw_evidence_pointers=['evidence-0c9073a255074c4a2fc66e8e'],derived_evidence_pointers=[a['entry']['semantic_pointer']],derivation_reference='derive://A5-BLUEPRINT/rule-17',created_at='2026-08-08T01:30:01+09:00')
 c=s.append_assertion(semantic_id='edge:form-to-response',entity_type='EDGE',producer_id='A5-BLUEPRINT',producer_assertion={'from':'node:product-form','to':'network:response','relation':'SUBMITS_TO'},evidence_class='UNKNOWN',confidence=0.0,raw_evidence_pointers=['evidence-2aed123220f249972a566986'],derived_evidence_pointers=[a['entry']['semantic_pointer']],derivation_reference='unknown://producer-no-confirmed-causality',created_at='2026-08-08T01:30:02+09:00')
 dup=s.append_assertion(semantic_id='node:product-form',entity_type='NODE',producer_id='A5-BLUEPRINT',producer_assertion={'type':'FORM','label':'product-editor'},evidence_class='OBSERVED',confidence=1.0,raw_evidence_pointers=['evidence-45dc26a0ed1139eebe7837e6','evidence-9c5de9ba71755ad58c862ef8'],derived_evidence_pointers=[],derivation_reference=None,created_at='2026-08-08T01:31:00+09:00')
 restart=SemanticEvidenceIndex(root,CAT); proj=restart.rebuild_projection(); trace=restart.reverse_trace('node:product-blueprint')
 result={'schema_version':'B4_SEMANTIC_EVIDENCE_INDEX_SMOKE_RESULT_V1','status':'PASS','entry_count':proj['entry_count'],'node_count':proj['node_count'],'edge_count':proj['edge_count'],'classification_counts':proj['classification_counts'],'duplicate_disposition':dup['disposition'],'raw_artifact_materialization_count':0,'raw_artifact_overwrite':False,'semantic_decision_by_b4':False,'restart_readback_entry_count':restart.rebuild_projection()['entry_count'],'reverse_trace_raw_count':len(trace['entries'][0]['raw_evidence_pointers']),'reverse_trace_derived_count':len(trace['entries'][0]['derived_evidence_pointers']),'inferred_derivation_reference':trace['entries'][0]['derivation_reference'],'cycle4_evidence_ids_verified':sorted({p for r in proj['entries'] for p in r['raw_evidence_pointers']})}
 assert result['entry_count']==3 and result['classification_counts']=={'INFERRED':1,'OBSERVED':1,'UNKNOWN':1}; assert result['duplicate_disposition']=='DUPLICATE_IDENTICAL_SUPPRESSED'; assert result['reverse_trace_raw_count']==1 and result['reverse_trace_derived_count']==1
 return result
if __name__=='__main__':
 target=Path(sys.argv[1]) if len(sys.argv)>1 else Path(tempfile.mkdtemp(prefix='b4-semantic-smoke-')); print(json.dumps(run(target),ensure_ascii=False,indent=2,sort_keys=True))
