#!/usr/bin/env node
'use strict';
const crypto=require('node:crypto');

const SECRET_RE=/(bearer\s+[a-z0-9._~+/=-]{6,}|basic\s+[a-z0-9+/=]{8,}|(?:api[_-]?key|password|secret|token)\s*[:=]\s*(?!<redacted>)[^\s,;}]{6,})/i;
function stable(v){if(Array.isArray(v))return v.map(stable);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));return v;}
function sha256(v){return crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');}
function fail(code,message,evidence=null){const e=new Error(message);e.code=code;e.evidence=evidence;throw e;}
function rejectSecrets(v){if(SECRET_RE.test(JSON.stringify(v)))fail('RAW_SECRET_VALUE_REJECTED','Raw secret-like value detected');}
function ptr(ref,fallback){return ref||fallback||'UNKNOWN';}
function asArray(v){return Array.isArray(v)?v:[];}
function normalizeA3(bundle){
  const r=bundle.a3_observation_receipt;
  if(!r||r.schema_version!=='CDP_OBSERVATION_RUN_RECEIPT_V1'||r.status!=='PASS')fail('A3_RECEIPT_REQUIRED','PASS CDP_OBSERVATION_RUN_RECEIPT_V1 required');
  const artifacts=bundle.a3_resolved_artifacts||{};
  const metadata=asArray(artifacts.request_response_metadata||artifacts.network_events||artifacts.events);
  const requests=metadata.filter(x=>['network.request','network.requestWillBeSent'].includes(x.type)).map((e,i)=>({request_id:e.request_id||e.payload?.request_id||`a3-${i+1}`,url:e.payload?.url||e.payload?.request_url||e.url||'',method:e.payload?.method||e.method||'GET',resource_type:e.payload?.resource_type||e.resource_type||null,headers:e.payload?.headers||e.payload?.request_headers||e.headers||{},action_id:e.action_id||e.payload?.action_id||e.payload?.correlation?.action_id||null,command_id:e.command_id||bundle.command_id||null,page_id:e.page_id||r.page_identity?.page_id||null,evidence_pointer:ptr(bundle.a3_artifact_pointers?.request_response_metadata,r.artifacts?.request_response_metadata_pointer?.path)}));
  const bodies=asArray(artifacts.redacted_response_body||artifacts.response_bodies||artifacts.body_events).filter(e=>!e.type||['network.responseBody','network.response_body'].includes(e.type)).map((e,i)=>({request_id:e.request_id||e.payload?.request_id||`body-${i+1}`,body:e.payload?.redacted_body??e.redacted_body??e.body??e.content,mime_type:e.payload?.mime_type||e.mime_type||null,action_id:e.action_id||e.payload?.action_id||e.payload?.correlation?.action_id||null,command_id:e.command_id||bundle.command_id||null,page_id:e.page_id||r.page_identity?.page_id||null,evidence_pointer:ptr(bundle.a3_artifact_pointers?.redacted_response_body,r.artifacts?.redacted_response_body_pointer?.path)}));
  return {receipt:r,requests,bodies,page_id:r.page_identity?.page_id||null,page_url:r.page_identity?.url||null};
}
function normalizeA4(bundle){
  const r=bundle.a4_structure_receipt;
  if(!r||r.schema_version!=='STRUCTURE_INFERENCE_RUN_RECEIPT_V1')fail('A4_RECEIPT_REQUIRED','STRUCTURE_INFERENCE_RUN_RECEIPT_V1 required');
  const fields=asArray(r.fields).map(f=>({name:f.name,field_id:f.field_id,confidence:f.confidence,source_locator:f.source_locator,value_type:f.value_type}));
  const locators=asArray(r.locator_candidates).map(l=>({field_id:l.field_id,locator:l.locator,strategy:l.strategy,stability_score:l.stability_score}));
  const pagination=asArray(r.pagination_candidates).sort((a,b)=>(b.confidence||0)-(a.confidence||0))[0]||null;
  return {receipt:r,structure:{fields,fieldCandidates:fields,locators,locatorCandidates:locators,repeated_regions:r.repeated_regions||[],repeatedRegions:r.repeated_regions||[],pagination,pageType:r.page_type||null},page_id:r.page_identity?.page_id||null,evidence_pointer:typeof r.evidence_pointer==='string'?r.evidence_pointer:(r.evidence_pointer?.path||'UNKNOWN')};
}
function provenance(bundle,a3,a4){
  const actionIds=[...new Set([...a3.requests,...a3.bodies].map(x=>x.action_id).filter(Boolean))].sort();
  return {command_id:bundle.command_id||'UNKNOWN',page_id:a3.page_id||a4.page_id||'UNKNOWN',action_id:actionIds.length===1?actionIds[0]:(actionIds.length?actionIds:'UNKNOWN'),a3_run_id:a3.receipt.run_id||'UNKNOWN',a4_request_id:a4.receipt.request_id||'UNKNOWN',evidence_pointer:{a3_observation:bundle.a3_observation_pointer||'UNKNOWN',a3_request_response:ptr(bundle.a3_artifact_pointers?.request_response_metadata,a3.receipt.artifacts?.request_response_metadata_pointer?.path),a3_response_body:ptr(bundle.a3_artifact_pointers?.redacted_response_body,a3.receipt.artifacts?.redacted_response_body_pointer?.path),a4_structure:bundle.a4_structure_pointer||a4.evidence_pointer||'UNKNOWN'}};
}
function buildRecipe(bundle,deps={}){
  rejectSecrets(bundle);
  if(bundle?.schema_version!=='A5_A3_A4_EVIDENCE_BUNDLE_V1')fail('INVALID_INPUT_SCHEMA','A5_A3_A4_EVIDENCE_BUNDLE_V1 required');
  const a3=normalizeA3(bundle); const a4=normalizeA4(bundle);
  if(a3.page_id&&a4.page_id&&a3.page_id!==a4.page_id)fail('PAGE_ID_MISMATCH','A3/A4 page_id mismatch',{a3:a3.page_id,a4:a4.page_id});
  const runner=deps.makeReceipt||require('../prebuild-cycle2/successor_endpoint_schema_decision_runner.cjs').makeReceipt;
  const observationPayload={network_request_stream:a3.requests};
  const responsePayload=a3.bodies.filter(x=>x.body!==undefined);
  const req={schema_version:'ENDPOINT_SCHEMA_DECISION_RUN_REQUEST_V1',run_id:bundle.run_id||`A5-C3-${sha256([bundle.command_id,a3.receipt.run_id,a4.receipt.request_id]).slice(0,12)}`,observation_pointer:{uri:bundle.a3_observation_pointer||'a3://observation-receipt',receipt:observationPayload},structure_pointer:{uri:bundle.a4_structure_pointer||'a4://structure-receipt',receipt:a4.structure},...(responsePayload.length?{response_body_pointer:{uri:ptr(bundle.a3_artifact_pointers?.redacted_response_body,'a3://redacted-response-body'),receipt:{response_bodies:responsePayload}}}:{})};
  const decision=runner(req);
  const prov=provenance(bundle,a3,a4);
  const evidenceSufficient=decision.decision_status==='PASS';
  const recipe={schema_version:'RECIPE_DECISION_INPUT_V1',decision_status:evidenceSufficient?'READY':'INSUFFICIENT_EVIDENCE',provenance:prov,endpoint_binding:{candidates:decision.endpoint_candidates,authority:evidenceSufficient?'OBSERVED':'OBSERVED_PARTIAL'},request_binding:{templates:Array.isArray(decision.endpoint_candidates)?decision.endpoint_candidates.map(e=>({endpoint_id:e.endpoint_id,method:e.method,url_template:e.url_template,parameters:e.parameters,evidence_pointer:e.evidence_pointer})):decision.endpoint_candidates},response_binding:{schema_fields:decision.schema_fields,authority:Array.isArray(decision.schema_fields)?'OBSERVED_REDACTED_BODY':'UNKNOWN'},schema_binding:{fields:decision.schema_fields,identifier_map:decision.identifier_map},session_binding:{requirements_reference:decision.session_requirements_reference,raw_values_stored:false},pagination_binding:a4.structure.pagination?{...a4.structure.pagination,evidence_pointer:a4.evidence_pointer}:{status:'UNKNOWN',reason:'PAGINATION_NOT_EVIDENCED',evidence_pointer:a4.evidence_pointer},mode_decision:{scores:decision.mode_scores,recommended_mode:decision.recommended_mode,confidence_state:decision.confidence_state,evidence_pointer:prov.evidence_pointer},unknown_fields:decision.unknown_fields||[],fail_closed:decision.decision_status==='FAIL_CLOSED',a6_direct_consume:{contract:'RECIPE_DECISION_INPUT_V1',consumer:'A-6',requires_additional_inference:false,compile_allowed:evidenceSufficient,reason:evidenceSufficient?'EVIDENCE_COMPLETE':'INSUFFICIENT_EVIDENCE'},raw_secret_value_count:0};
  recipe.decision_digest=sha256(recipe);
  return recipe;
}
module.exports={buildRecipe,normalizeA3,normalizeA4,provenance,sha256};
if(require.main===module){let raw='';process.stdin.setEncoding('utf8');process.stdin.on('data',c=>raw+=c);process.stdin.on('end',()=>{try{const r=buildRecipe(JSON.parse(raw||'{}'));process.stdout.write(JSON.stringify(r,null,2)+'\n');process.exitCode=r.fail_closed?20:(r.decision_status==='READY'?0:10);}catch(e){process.stderr.write(JSON.stringify({status:'ERROR',code:e.code||'INVALID_INPUT',message:e.message,evidence:e.evidence||null})+'\n');process.exitCode=e.code==='RAW_SECRET_VALUE_REJECTED'?40:30;}})}
