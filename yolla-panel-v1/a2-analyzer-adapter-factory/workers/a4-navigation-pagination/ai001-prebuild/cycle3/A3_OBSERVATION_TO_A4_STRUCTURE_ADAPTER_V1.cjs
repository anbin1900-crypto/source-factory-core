'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {runRequest:runStructure}=require('../cycle2/SUCCESSOR_STRUCTURE_INFERENCE_RUNNER_V1.cjs');

function canonicalize(v){
  if(Array.isArray(v)) return v.map(canonicalize);
  if(v&&typeof v==='object') return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonicalize(v[k])]));
  return v;
}
function stableStringify(v){return JSON.stringify(canonicalize(v));}
function sha256(v){return crypto.createHash('sha256').update(typeof v==='string'?v:stableStringify(v)).digest('hex');}
function readJson(p){return JSON.parse(fs.readFileSync(path.resolve(p),'utf8'));}
function resolvePointer(pointer, receiptPath){
  if(!pointer) throw new Error('MISSING_DOM_SNAPSHOT_POINTER');
  if(pointer.inline_payload){
    const actual=sha256(pointer.inline_payload);
    if(pointer.sha256&&pointer.sha256!==actual) throw new Error(`DOM_EVIDENCE_SHA256_MISMATCH expected=${pointer.sha256} actual=${actual}`);
    return {payload:pointer.inline_payload,pointer:{...pointer,sha256:actual}};
  }
  if(!pointer.path) throw new Error('UNRESOLVED_DOM_SNAPSHOT_POINTER');
  const base=path.dirname(path.resolve(receiptPath));
  const target=path.isAbsolute(pointer.path)?pointer.path:path.resolve(base,pointer.path);
  const payload=readJson(target);
  const actual=sha256(payload);
  if(pointer.sha256&&pointer.sha256!==actual) throw new Error(`DOM_EVIDENCE_SHA256_MISMATCH expected=${pointer.sha256} actual=${actual}`);
  return {payload,pointer:{...pointer,sha256:actual}};
}
function observationToRunRequest(observationReceipt,domEvidence,evidencePointer){
  if(!observationReceipt||observationReceipt.schema_version!=='CDP_OBSERVATION_RUN_RECEIPT_V1') throw new Error('INVALID_A3_OBSERVATION_RECEIPT');
  if(observationReceipt.status!=='PASS') throw new Error('A3_OBSERVATION_RECEIPT_NOT_PASS');
  const page=observationReceipt.page_identity||{};
  if(!page.page_id||!page.url) throw new Error('A3_PAGE_IDENTITY_INCOMPLETE');
  return {
    schema_version:'STRUCTURE_INFERENCE_RUN_REQUEST_V1',
    request_id:`A4-COMPOSITE-${observationReceipt.run_id}`,
    page_identity:{page_id:page.page_id,url:page.url,title:page.title||null,target_type:page.target_type||null},
    dom_snapshot:domEvidence,
    evidence_pointer:{...evidencePointer,source_worker:'A-3',observation_run_id:observationReceipt.run_id},
    selected_element:observationReceipt.selected_element||domEvidence.selectedElement||domEvidence.selected_element||null,
    network_hints:observationReceipt.network_hints||domEvidence.networkHints||domEvidence.network_hints||[],
    runtime_hints:observationReceipt.runtime_hints||domEvidence.runtimeHints||domEvidence.runtime_hints||{},
    snapshot_id:observationReceipt.snapshot_id||domEvidence.snapshotId||domEvidence.snapshot_id||null
  };
}
function deriveFallback(structureReceipt,domEvidence){
  const h=domEvidence.runtimeHints||domEvidence.runtime_hints||{};
  const virtualized=!!(h.virtualized||(h.totalItemCount&&h.renderedItemCount&&Number(h.totalItemCount)>Number(h.renderedItemCount)*2));
  const dynamic=!!(h.domMutationCount||h.lazyLoaded);
  const spa=!!(h.spaNavigation||h.historyApiNavigation);
  const reasons=[];
  if(virtualized) reasons.push('VIRTUALIZED_LIST_RENDER_WINDOW');
  if(dynamic) reasons.push('DYNAMIC_DOM_MUTATION_OR_LAZY_LOAD');
  if(spa) reasons.push('SPA_NAVIGATION_STATE');
  if(!(structureReceipt.repeated_regions||[]).length) reasons.push('NO_REPEAT_REGION_FROM_CURRENT_SNAPSHOT');
  const detected=reasons.length>0;
  return {
    detected,
    confidence:detected?0.82:0.96,
    fallback_reason:reasons.length?reasons:['NONE'],
    recapture_after_mutation:virtualized||dynamic||spa,
    prefer_stable_locator_order:['semantic','data','role','text','css']
  };
}
function buildBundle({observationReceipt,domEvidence,structureReceipt,lifecycleEvent=null}){
  const page=observationReceipt.page_identity||{};
  const provenance={
    page_id:page.page_id||null,
    action_id:observationReceipt.action_id||domEvidence.action_id||domEvidence.selectedElement?.action_id||null,
    command_id:observationReceipt.command_id||lifecycleEvent?.command_id||null,
    observation_run_id:observationReceipt.run_id||null,
    observation_request_sha256:observationReceipt.request_sha256||null
  };
  const lifecycleMetadata=lifecycleEvent?{
    event_type:lifecycleEvent.event_type||lifecycleEvent.type||'BROWSER_WORKER_COMPLETION_EVENT',
    command_id:lifecycleEvent.command_id||null,
    status:lifecycleEvent.status||null,
    worker_id:lifecycleEvent.worker_id||null,
    completion_event_sha256:sha256(lifecycleEvent),
    analysis_input_mixed:false
  }:null;
  const fallback=deriveFallback(structureReceipt,domEvidence);
  const core={
    schema_version:'STRUCTURE_EVIDENCE_BUNDLE_V1',
    producer:{worker:'A-4',binding:'A3_OBSERVATION_TO_A4_STRUCTURE_ADAPTER_V1'},
    provenance,
    page_identity:structureReceipt.page_identity,
    evidence_pointer:structureReceipt.evidence_pointer,
    repeated_regions:structureReceipt.repeated_regions||[],
    fields:structureReceipt.fields||[],
    locator_candidates:structureReceipt.locator_candidates||[],
    pagination_candidates:structureReceipt.pagination_candidates||[],
    confidence:Number(structureReceipt.confidence||0),
    fallback,
    source_structure_receipt_sha256:structureReceipt.receipt_sha256||null,
    analysis_input_sha256:sha256({observation_receipt:observationReceipt,dom_evidence:domEvidence}),
    command_lifecycle_metadata:lifecycleMetadata,
    consumers:['A-5','A-6']
  };
  return {...core,bundle_sha256:sha256(core)};
}
function runComposite(observationReceiptPath,lifecycleEventPath=null){
  const observationReceipt=readJson(observationReceiptPath);
  const domResolved=resolvePointer(observationReceipt.artifacts?.dom_snapshot_pointer,observationReceiptPath);
  const runRequest=observationToRunRequest(observationReceipt,domResolved.payload,domResolved.pointer);
  const structureReceipt=runStructure(runRequest,observationReceiptPath);
  const lifecycleEvent=lifecycleEventPath&&lifecycleEventPath!=='-'?readJson(lifecycleEventPath):null;
  return buildBundle({observationReceipt,domEvidence:domResolved.payload,structureReceipt,lifecycleEvent});
}
if(require.main===module){
  const [observationReceiptPath,lifecycleEventPath,outPath]=process.argv.slice(2);
  if(!observationReceiptPath||!outPath){
    console.error('usage: node A3_OBSERVATION_TO_A4_STRUCTURE_ADAPTER_V1.cjs <CDP_OBSERVATION_RUN_RECEIPT_V1.json> <BROWSER_WORKER_COMPLETION_EVENT_OR_-> <STRUCTURE_EVIDENCE_BUNDLE_V1.json>');
    process.exit(2);
  }
  const bundle=runComposite(observationReceiptPath,lifecycleEventPath);
  fs.writeFileSync(path.resolve(outPath),JSON.stringify(canonicalize(bundle),null,2)+'\n');
}
module.exports={runComposite,buildBundle,observationToRunRequest,deriveFallback,canonicalize,stableStringify,sha256};
