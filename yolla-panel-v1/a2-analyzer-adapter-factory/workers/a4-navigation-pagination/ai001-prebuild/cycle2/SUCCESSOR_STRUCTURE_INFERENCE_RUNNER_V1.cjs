#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {infer:inferStructure}=require('../STRUCTURE_INFERENCE_ENGINE_V1.cjs');

function canonicalize(v){
  if(Array.isArray(v)) return v.map(canonicalize);
  if(v&&typeof v==='object') return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonicalize(v[k])]));
  return v;
}
function stableStringify(v){return JSON.stringify(canonicalize(v));}
function sha256(v){return crypto.createHash('sha256').update(typeof v==='string'?v:stableStringify(v)).digest('hex');}
function readJson(p){return JSON.parse(fs.readFileSync(path.resolve(p),'utf8'));
}
function resolveEvidence(req, requestPath){
  if(req.dom_snapshot) return {payload:req.dom_snapshot,pointer:req.evidence_pointer||{kind:'INLINE_DOM_SNAPSHOT',sha256:sha256(req.dom_snapshot)}};
  const ep=req.evidence_pointer;
  if(!ep) throw new Error('MISSING_DOM_SNAPSHOT_OR_EVIDENCE_POINTER');
  if(ep.inline_payload) return {payload:ep.inline_payload,pointer:ep};
  if(!ep.path) throw new Error('UNRESOLVED_EVIDENCE_POINTER');
  const base=path.dirname(path.resolve(requestPath));
  const target=path.isAbsolute(ep.path)?ep.path:path.resolve(base,ep.path);
  const payload=readJson(target);
  const actual=sha256(payload);
  if(ep.sha256&&ep.sha256!==actual) throw new Error(`EVIDENCE_SHA256_MISMATCH expected=${ep.sha256} actual=${actual}`);
  return {payload,pointer:{...ep,sha256:actual}};
}
function locatorPriority(strategy){return ({semantic:0,data:1,role:2,text:3,css:4})[String(strategy||'').toLowerCase()]??9;}
function normalizeLocators(items){return [...(items||[])].map(x=>({
  field_id:x.fieldId||x.field_id||null,
  strategy:(x.strategy==='label'?'semantic':(/data-(testid|test|qa)/.test(String(x.locator||''))?'data':(x.strategy==='testid'?'data':x.strategy)))||'css',
  locator:x.locator,
  stability_score:Number(x.stability?.score??x.confidence??0),
  stability_metadata:{reasons:[...(x.stability?.reasons||[])],selected:!!x.selected,coverage:Number(x.coverage??0)}
})).sort((a,b)=>locatorPriority(a.strategy)-locatorPriority(b.strategy)||b.stability_score-a.stability_score||String(a.locator).localeCompare(String(b.locator)));
}
function paginationCandidates(primary){
  const p=primary||{type:'NONE',detected:false,explicitNone:true,confidence:.75,source:'NEGATIVE_EVIDENCE'};
  const type=String(p.type||'NONE').toUpperCase();
  const stopByType={NEXT:'NEXT_LINK_ABSENT_OR_DISABLED',LOAD_MORE:'LOAD_MORE_ABSENT_DISABLED_OR_NO_ITEM_GROWTH',PAGE_NUMBER:'LAST_PAGE_OR_PAGE_REPEAT',PAGE:'LAST_PAGE_OR_PAGE_REPEAT',OFFSET:'EMPTY_RESULT_OR_OFFSET_REPEAT',CURSOR:'EMPTY_RESULT_NULL_CURSOR_OR_CURSOR_REPEAT',INFINITE_SCROLL:'NO_ITEM_GROWTH_AFTER_SCROLL_STABILITY_WINDOW',NONE:'NO_PAGINATION_SIGNAL'};
  return [{type,detected:!!p.detected,confidence:Number(p.confidence??0),source:p.source||null,evidence:p.evidence??p.href??p.nodeId??p.nodeIds??null,stop_condition:stopByType[type]||'NO_PROGRESS_OR_REPEAT_GUARD'}];
}
function normalizeField(f){
  const loc=String(f.sourceLocator||f.relativeCss||'').toLowerCase();
  const rawName=String(f.name||'').toLowerCase();
  let name=f.name;
  if(/address|addr|location/.test(loc)) name='address';
  else if(/price|amount|cost/.test(loc)) name='price';
  else if(/title|name/.test(loc)||/^h[1-6]/.test(loc)) name='title';
  else if(/^img|image/.test(loc)||rawName==='image') name='image';
  else if(/detail/.test(loc)||rawName==='detail_url') name='detail_url';
  else if(/record.?id|data-field=.?id|(^|[^a-z])id([^a-z]|$)/.test(loc)) name='id';
  let value_type=f.valueType;
  if(name==='price') value_type='price';
  else if(name==='image') value_type='image';
  else if(name==='detail_url') value_type='url_or_text';
  else value_type='text';
  return {field_id:f.fieldId,name,value_type,source_node_id:f.sourceNodeId,source_locator:f.sourceLocator||f.relativeCss||null,sample_values:f.sampleValues||[],coverage:Number(f.coverage??0),confidence:Number(f.confidence??0)};
}
function runRequest(req,requestPath='<memory>'){
  if(!req||req.schema_version!=='STRUCTURE_INFERENCE_RUN_REQUEST_V1') throw new Error('INVALID_RUN_REQUEST_SCHEMA_VERSION');
  if(!req.page_identity||!req.page_identity.url) throw new Error('MISSING_PAGE_IDENTITY_URL');
  const ev=resolveEvidence(req,requestPath);
  const input={...ev.payload,url:req.page_identity.url,documentUrl:req.page_identity.url,selectedElement:req.selected_element||null,networkHints:req.network_hints||[],runtimeHints:req.runtime_hints||{},snapshotId:req.snapshot_id||undefined};
  const raw=inferStructure(input);
  const repeated_regions=(raw.repeatedRegions||[]).map(r=>({region_id:r.regionId,parent_node_id:r.parentNodeId,item_node_ids:r.itemNodeIds,item_count:r.itemCount,confidence:Number(r.confidence??0)}));
  const fields=(raw.fieldCandidates||[]).map(normalizeField);
  const locator_candidates=normalizeLocators(raw.locatorCandidates||[]);
  const pagination_candidates=paginationCandidates(raw.pagination);
  const confidences=[...repeated_regions.map(x=>x.confidence),...fields.map(x=>x.confidence),...locator_candidates.map(x=>x.stability_score),...pagination_candidates.map(x=>x.confidence)].filter(Number.isFinite);
  const confidence=confidences.length?Number((confidences.reduce((a,b)=>a+b,0)/confidences.length).toFixed(6)):0;
  const core={schema_version:'STRUCTURE_INFERENCE_RUN_RECEIPT_V1',request_id:req.request_id,page_identity:req.page_identity,evidence_pointer:ev.pointer,repeated_regions,fields,locator_candidates,pagination_candidates,confidence,source_result_sha256:raw.resultSha256||null,producer:{worker:'A-4',runner:'SUCCESSOR_STRUCTURE_INFERENCE_RUNNER_V1'}};
  return {...core,receipt_sha256:sha256(core)};
}
if(require.main===module){
  const requestPath=process.argv[2],outPath=process.argv[3];
  if(!requestPath){console.error('usage: node SUCCESSOR_STRUCTURE_INFERENCE_RUNNER_V1.cjs <STRUCTURE_INFERENCE_RUN_REQUEST_V1.json> [STRUCTURE_INFERENCE_RUN_RECEIPT_V1.json]');process.exit(2);}
  const receipt=runRequest(readJson(requestPath),requestPath);
  const text=JSON.stringify(canonicalize(receipt),null,2)+'\n';
  if(outPath) fs.writeFileSync(path.resolve(outPath),text); else process.stdout.write(text);
}
module.exports={runRequest,canonicalize,stableStringify,sha256};
