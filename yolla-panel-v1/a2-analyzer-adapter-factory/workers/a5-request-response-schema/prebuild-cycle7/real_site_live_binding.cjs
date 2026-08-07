#!/usr/bin/env node
'use strict';
const crypto=require('node:crypto');

const LANES=['PUBLIC_READ','WRITE','MY_LISTING','EDIT'];
const SECRET_RE=/(bearer\s+[a-z0-9._~+/=-]{6,}|basic\s+[a-z0-9+/=]{8,}|(?:api[_-]?key|password|secret|token|cookie)\s*[:=]\s*(?!<redacted>)[^\s,;}]{6,})/i;
const EMAIL_RE=/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_RE=/(?:\+?82[- .]?)?0(?:10|11|16|17|18|19)[- .]?\d{3,4}[- .]?\d{4}/;
const RRN_RE=/\b\d{6}[- ]?[1-4]\d{6}\b/;
const PII_KEY_RE=/^(?:email|email_address|phone|phone_number|mobile|mobile_number|rrn|ssn|resident_registration_number|owner_name|customer_name)$/i;

function stable(v){if(Array.isArray(v))return v.map(stable);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));return v;}
function sha256(v){return crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');}
function arr(v){return Array.isArray(v)?v:[];}
function uniq(v){return [...new Set(v)].sort();}
function ev(v){return Array.isArray(v)?v.filter(Boolean):(v?[v]:[]);}
function unknown(reason,evidence_pointer='UNKNOWN',lane='UNKNOWN'){return {status:'UNKNOWN',reason,lane,evidence_pointer};}
function waiting(relation,reason,lane,evidence_pointer='UNKNOWN',keys={}){return {status:'WAITING_INPUT',relation,reason,lane,evidence_pointer,...keys};}
function rejectRestricted(v,path='$'){
  if(typeof v==='string'){
    if(v==='<REDACTED>'||v==='UNKNOWN')return;
    if(SECRET_RE.test(v))throw Object.assign(new Error(`RAW_SECRET_VALUE_REJECTED at ${path}`),{code:'RAW_SECRET_VALUE_REJECTED'});
    if(EMAIL_RE.test(v)||PHONE_RE.test(v)||RRN_RE.test(v))throw Object.assign(new Error(`RAW_PII_VALUE_REJECTED at ${path}`),{code:'RAW_PII_VALUE_REJECTED'});
    return;
  }
  if(Array.isArray(v)){v.forEach((x,i)=>rejectRestricted(x,`${path}[${i}]`));return;}
  if(v&&typeof v==='object') for(const [k,x] of Object.entries(v)){
    if(PII_KEY_RE.test(k)&&typeof x==='string'&&x!=='<REDACTED>'&&x!=='UNKNOWN'&&x.length>0)throw Object.assign(new Error(`RAW_PII_VALUE_REJECTED at ${path}.${k}`),{code:'RAW_PII_VALUE_REJECTED'});
    rejectRestricted(x,`${path}.${k}`);
  }
}
function requireInput(input){
  if(!input||input.schema_version!=='A5_REAL_SITE_LIVE_EVIDENCE_BUNDLE_V1')throw Object.assign(new Error('A5_REAL_SITE_LIVE_EVIDENCE_BUNDLE_V1 required'),{code:'INVALID_INPUT_SCHEMA'});
  if(!input.cycle6_contract||input.cycle6_contract.schema_version!=='A5_PRODUCT_API_DATA_FORM_IMPLEMENTATION_CONTRACT_RESULT_V1')throw Object.assign(new Error('Cycle6 implementation contract required'),{code:'CYCLE6_CONTRACT_REQUIRED'});
  rejectRestricted(input);
  return input;
}
function normLane(v){return LANES.includes(v)?v:'UNKNOWN';}
function emptyLaneMap(){return Object.fromEntries(LANES.map(l=>[l,[]]));}
function flattenEvents(input){return arr(input.live_causal_events||input.a3_live_causal_events||input.events);}
function eventType(e){return e.type||e.event_type||'';}
function payload(e){return e.payload||e.data||{};}
function get(e,k){const p=payload(e); return e[k]??p[k]??p.correlation?.[k]??null;}
function ptr(e,input){return e.evidence_pointer||payload(e).evidence_pointer||input.a3_live_evidence_pointer||'UNKNOWN';}
function indexEvents(input){
  const actions=[],requests=[],responses=[],bodies=[],states=[],forms=[];
  for(const e of flattenEvents(input)){
    const t=eventType(e), p=payload(e); const common={lane:normLane(e.lane||p.lane),command_id:get(e,'command_id'),page_id:get(e,'page_id'),action_id:get(e,'action_id'),request_id:get(e,'request_id'),evidence_pointer:ptr(e,input),sequence:e.sequence??p.sequence??null};
    if(['action.started','action.completed','ui.action','analyzer.action'].includes(t)) actions.push({...common,type:t,action_kind:p.action_kind||p.kind||e.action_kind||'UNKNOWN',target:p.target||p.locator||e.target||'UNKNOWN'});
    else if(['network.request','network.requestWillBeSent'].includes(t)) requests.push({...common,type:t,method:String(p.method||e.method||'UNKNOWN').toUpperCase(),url_template:p.url_template||p.url||e.url_template||e.url||'UNKNOWN'});
    else if(['network.response','network.responseReceived'].includes(t)) responses.push({...common,type:t,status:p.status??e.status??null,mime_type:p.mime_type||p.content_type||e.mime_type||'UNKNOWN'});
    else if(['network.responseBody','network.response_body'].includes(t)) bodies.push({...common,type:t,entity_ids:arr(p.entity_ids||e.entity_ids),schema_paths:arr(p.schema_paths||e.schema_paths),redacted:true});
    else if(['ui.state','state.transition','component.state'].includes(t)) states.push({...common,type:t,component_id:p.component_id||e.component_id||'UNKNOWN',state_before:p.state_before??e.state_before??'UNKNOWN',state_after:p.state_after??e.state_after??'UNKNOWN'});
    else if(['form.field','form.binding','form.write'].includes(t)) forms.push({...common,type:t,form_id:p.form_id||e.form_id||'UNKNOWN',field_name:p.field_name||e.field_name||'UNKNOWN',canonical_candidate:p.canonical_candidate||e.canonical_candidate||null,read_transform:p.read_transform||e.read_transform||null,write_transform:p.write_transform||e.write_transform||null});
  }
  return {actions,requests,responses,bodies,states,forms};
}
function operationIndex(c6){return arr(c6.product_api_contract?.operations);}
function opLane(op,input){const explicit=input.operation_lane_map?.[op.operation_id]; return normLane(explicit||op.lane||op.implementation_lane);}
function exactMatch(list,pred){return list.filter(pred);}
function buildApiUiState(input,idx){
  const c6=input.cycle6_contract; const byLane=emptyLaneMap(); const waitingEdges=[]; const evidence=[];
  for(const op of operationIndex(c6)){
    const baseLane=opLane(op,input);
    const actionId=op.action?.action_id||'UNKNOWN'; const requestId=op.request?.request_id||'UNKNOWN'; const pageId=op.action?.page_id||'UNKNOWN'; const commandId=op.action?.command_id||'UNKNOWN';
    const action=idx.actions.find(x=>x.action_id===actionId&&x.page_id===pageId&&x.command_id===commandId) || idx.actions.find(x=>x.action_id===actionId&&x.page_id===pageId);
    const request=idx.requests.find(x=>x.request_id===requestId&&x.action_id===actionId) || idx.requests.find(x=>x.request_id===requestId);
    const response=idx.responses.find(x=>x.request_id===requestId);
    const stateMatches=exactMatch(idx.states,x=>x.action_id===actionId&&x.page_id===pageId);
    const lane=normLane(action?.lane||request?.lane||response?.lane||baseLane);
    if(lane==='UNKNOWN') waitingEdges.push(waiting('LANE_CLASSIFICATION','EXPLICIT_LIVE_LANE_NOT_OBSERVED','UNKNOWN',uniq(ev(action?.evidence_pointer).concat(ev(request?.evidence_pointer))),{operation_id:op.operation_id,action_id:actionId,request_id:requestId}));
    const rec={operation_id:op.operation_id,lane,command_id:commandId,page_id:pageId,action_id:actionId,request_id:requestId,action:action?{status:'OBSERVED',action_kind:action.action_kind,target:action.target,evidence_pointer:action.evidence_pointer}:unknown('A3_LIVE_ACTION_NOT_ARRIVED','UNKNOWN',lane),request:request?{status:'OBSERVED',method:request.method,url_template:request.url_template,evidence_pointer:request.evidence_pointer}:unknown('A3_LIVE_REQUEST_NOT_ARRIVED','UNKNOWN',lane),response:response?{status:'OBSERVED',http_status:response.status,mime_type:response.mime_type,evidence_pointer:response.evidence_pointer}:unknown('A3_LIVE_RESPONSE_NOT_ARRIVED','UNKNOWN',lane),ui_state_updates:stateMatches.length?stateMatches.map(s=>({status:'OBSERVED',component_id:s.component_id,state_before:s.state_before,state_after:s.state_after,evidence_pointer:s.evidence_pointer})): [unknown('A3_LIVE_UI_STATE_NOT_ARRIVED','UNKNOWN',lane)],exact_evidence_pointer:uniq([action?.evidence_pointer,request?.evidence_pointer,response?.evidence_pointer,...stateMatches.map(s=>s.evidence_pointer)].filter(Boolean))};
    const targetLane=LANES.includes(lane)?lane:'PUBLIC_READ'; byLane[targetLane].push(rec);
    if(!action) waitingEdges.push(waiting('ACTION_TO_REQUEST','A3_LIVE_ACTION_NOT_ARRIVED',lane,'UNKNOWN',{operation_id:op.operation_id,action_id:actionId,request_id:requestId}));
    if(!request) waitingEdges.push(waiting('ACTION_TO_REQUEST','A3_LIVE_REQUEST_NOT_ARRIVED',lane,action?.evidence_pointer||'UNKNOWN',{operation_id:op.operation_id,action_id:actionId,request_id:requestId}));
    if(!response) waitingEdges.push(waiting('REQUEST_TO_RESPONSE','A3_LIVE_RESPONSE_NOT_ARRIVED',lane,request?.evidence_pointer||'UNKNOWN',{operation_id:op.operation_id,request_id:requestId}));
    if(!stateMatches.length) waitingEdges.push(waiting('ACTION_TO_UI_STATE','A3_LIVE_UI_STATE_NOT_ARRIVED',lane,action?.evidence_pointer||'UNKNOWN',{operation_id:op.operation_id,action_id:actionId}));
    evidence.push(...rec.exact_evidence_pointer);
  }
  return {schema_version:'REAL_SITE_API_UI_STATE_BINDING_V1',lanes:byLane,waiting_input_edges:waitingEdges,evidence_pointer:uniq(evidence),late_binding_policy:'ONLY_MISSING_CAUSAL_EDGE_WAITS;OTHER_OBSERVED_EDGES_REMAIN_USABLE'};
}
function buildEntityBinding(input,idx,apiBinding){
  const c6=input.cycle6_contract; const byLane=emptyLaneMap(); const waitingEdges=[]; const entities=arr(c6.data_model_implementation_spec?.entities);
  for(const op of operationIndex(c6)){
    const laneRecord=LANES.flatMap(l=>apiBinding.lanes[l].map(x=>({lane:l,rec:x}))).find(x=>x.rec.operation_id===op.operation_id); const lane=laneRecord?.rec.lane||opLane(op,input);
    const requestId=op.request?.request_id||'UNKNOWN'; const body=idx.bodies.find(x=>x.request_id===requestId); const opEntities=arr(op.response_entities).filter(x=>x.entity_node_id||x.entity_id); const bound=[];
    for(const ref of opEntities){const entityId=(ref.entity_node_id||ref.entity_id||'').replace(/^ENTITY:/,''); const spec=entities.find(e=>e.entity_id===entityId); if(body){bound.push({entity_id:entityId,status:'OBSERVED',record_path:spec?.record_path||'UNKNOWN',identifier_paths:spec?.identifier_paths||[],fields:spec?.fields||[],request_id:requestId,evidence_pointer:uniq(ev(ref.evidence_pointer).concat(ev(body.evidence_pointer))),redacted_body_only:true});} else {bound.push({entity_id:entityId,status:'WAITING_INPUT',reason:'A3_LIVE_RESPONSE_BODY_OR_ENTITY_EVIDENCE_NOT_ARRIVED',request_id:requestId,evidence_pointer:ref.evidence_pointer||'UNKNOWN'}); waitingEdges.push(waiting('RESPONSE_TO_ENTITY','A3_LIVE_RESPONSE_BODY_OR_ENTITY_EVIDENCE_NOT_ARRIVED',lane,ref.evidence_pointer||'UNKNOWN',{operation_id:op.operation_id,request_id:requestId,entity_id:entityId}));}}
    const targetLane=LANES.includes(lane)?lane:'PUBLIC_READ'; byLane[targetLane].push({operation_id:op.operation_id,lane,request_id:requestId,entities:bound.length?bound:[unknown('CYCLE6_RESPONSE_ENTITY_NOT_DEFINED','UNKNOWN',lane)]});
  }
  return {schema_version:'REAL_SITE_DATA_ENTITY_BINDING_V1',lanes:byLane,waiting_input_edges:waitingEdges,redaction_policy:'NO_RAW_RESPONSE_BODY;ENTITY_BINDING_USES_REDACTED_EVIDENCE_ONLY'};
}
function buildFormBinding(input,idx,apiBinding){
  const c6=input.cycle6_contract; const byLane=emptyLaneMap(); const waitingEdges=[]; const specs=arr(c6.form_write_binding_spec?.bindings);
  for(const spec of specs){
    const live=idx.forms.filter(f=>f.form_id===spec.form_id&&f.field_name===spec.field_name); const explicitLane=normLane(input.form_lane_map?.[`${spec.form_id}:${spec.field_name}`]); const lane=normLane(live[0]?.lane||explicitLane);
    const canonical=spec.application_canonical_candidate||unknown('CANONICAL_CANDIDATE_NOT_AVAILABLE'); const read=spec.read_transform||unknown('READ_TRANSFORM_NOT_AVAILABLE'); const write=spec.write_transform||unknown('WRITE_TRANSFORM_NOT_AVAILABLE');
    const item={form_id:spec.form_id,field_name:spec.field_name,lane,canonical_candidate:{...canonical,authority:canonical.authority||'INFERRED'},read_transform:live[0]?.read_transform?{...live[0].read_transform,status:'OBSERVED',evidence_pointer:live[0].evidence_pointer}:read,write_transform:live[0]?.write_transform?{...live[0].write_transform,status:'OBSERVED',evidence_pointer:live[0].evidence_pointer}:write,business_rule:spec.business_rule||unknown('BUSINESS_RULE_NOT_OBSERVED'),exact_evidence_pointer:uniq(live.map(x=>x.evidence_pointer))};
    const targetLane=LANES.includes(lane)?lane:'WRITE'; byLane[targetLane].push(item);
    if(!live.length) waitingEdges.push(waiting('FORM_FIELD_TO_LIVE_WRITE','A3_LIVE_FORM_CAUSAL_EVIDENCE_NOT_ARRIVED',lane,uniq(ev(canonical.evidence_pointer).concat(ev(write.evidence_pointer))),{form_id:spec.form_id,field_name:spec.field_name}));
  }
  return {schema_version:'REAL_SITE_FORM_FIELD_BINDING_V1',lanes:byLane,waiting_input_edges:waitingEdges,canonical_authority_boundary:'APPLICATION_CANDIDATE_ONLY;D_CANONICAL_NOT_ASSIGNED'};
}
function buildUnknownIndex(input,api,entities,forms){
  const items=[]; for(const e of api.waiting_input_edges)items.push({...e,index_kind:'CAUSAL_WAITING_INPUT'}); for(const e of entities.waiting_input_edges)items.push({...e,index_kind:'ENTITY_WAITING_INPUT'}); for(const e of forms.waiting_input_edges)items.push({...e,index_kind:'FORM_WAITING_INPUT'});
  const c6=input.cycle6_contract;
  if(c6.data_model_implementation_spec?.business_rules?.status==='UNKNOWN')items.push({index_kind:'UNKNOWN_BUSINESS_RULE',status:'UNKNOWN',reason:c6.data_model_implementation_spec.business_rules.reason||'BUSINESS_RULE_NOT_OBSERVED',lane:'UNKNOWN',evidence_pointer:c6.data_model_implementation_spec.business_rules.evidence_pointer||'UNKNOWN'});
  for(const b of arr(c6.form_write_binding_spec?.bindings)) if(b.business_rule?.status==='UNKNOWN')items.push({index_kind:'UNKNOWN_BUSINESS_RULE',status:'UNKNOWN',reason:b.business_rule.reason||'BUSINESS_RULE_NOT_OBSERVED',lane:normLane(input.form_lane_map?.[`${b.form_id}:${b.field_name}`]),form_id:b.form_id,field_name:b.field_name,evidence_pointer:b.business_rule.evidence_pointer||'UNKNOWN'});
  return {schema_version:'UNKNOWN_BUSINESS_RULE_INDEX_V1',items,counts:{total:items.length,waiting_input:items.filter(x=>x.status==='WAITING_INPUT').length,unknown_business_rule:items.filter(x=>x.index_kind==='UNKNOWN_BUSINESS_RULE').length},promotion_policy:'UNKNOWN_OR_WAITING_INPUT_NEVER_PROMOTED_WITHOUT_NEW_EXACT_EVIDENCE'};
}
function build(input){
  requireInput(input); const idx=indexEvents(input); const api=buildApiUiState(input,idx); const entities=buildEntityBinding(input,idx,api); const forms=buildFormBinding(input,idx,api); const unknowns=buildUnknownIndex(input,api,entities,forms);
  const laneReadiness=Object.fromEntries(LANES.map(l=>{const a=api.lanes[l]; const ew=entities.lanes[l]; const fw=forms.lanes[l]; const waiting=unknowns.items.filter(x=>x.lane===l&&x.status==='WAITING_INPUT').length; return [l,{status:waiting?'PARTIAL_WAITING_INPUT':'READY',api_ui_state_count:a.length,data_entity_binding_count:ew.length,form_binding_count:fw.length,waiting_input_count:waiting}];}));
  const handoff={schema_version:'A5_TO_A6_LIVE_EXECUTION_HANDOFF_V1',consumer:'A-6',source_contract:'A5_REAL_SITE_LIVE_BINDING_RESULT_V1',lanes:laneReadiness,direct_consume:{api_ui_state:'REAL_SITE_API_UI_STATE_BINDING_V1',data_entity:'REAL_SITE_DATA_ENTITY_BINDING_V1',form_field:'REAL_SITE_FORM_FIELD_BINDING_V1',unknown_index:'UNKNOWN_BUSINESS_RULE_INDEX_V1'},execution_policy:{consume_ready_edges:true,skip_waiting_input_edges:true,unknown_fail_closed:true,raw_secret_or_pii_allowed:false},evidence_pointer:uniq(ev(api.evidence_pointer).concat(ev(input.a3_live_evidence_pointer),ev(input.a4_live_structure_pointer)))};
  const out={schema_version:'A5_REAL_SITE_LIVE_BINDING_RESULT_V1',source_cycle6_digest:input.cycle6_contract.implementation_digest||'UNKNOWN',real_site_api_ui_state_binding:api,real_site_data_entity_binding:entities,real_site_form_field_binding:forms,unknown_business_rule_index:unknowns,a5_to_a6_live_execution_handoff:handoff,decision_status:unknowns.counts.waiting_input?'READY_WITH_WAITING_INPUT':'READY',raw_secret_value_count:0,raw_pii_value_count:0,production:false,ready:false,merge:false}; out.live_binding_digest=sha256(out); return out;
}
module.exports={build,indexEvents,buildApiUiState,buildEntityBinding,buildFormBinding,buildUnknownIndex,LANES,sha256};
if(require.main===module){let raw='';process.stdin.setEncoding('utf8');process.stdin.on('data',c=>raw+=c);process.stdin.on('end',()=>{try{process.stdout.write(JSON.stringify(build(JSON.parse(raw||'{}')),null,2)+'\n');}catch(e){process.stderr.write(JSON.stringify({status:'ERROR',code:e.code||'LIVE_BINDING_FAILED',message:e.message})+'\n');process.exitCode=['RAW_SECRET_VALUE_REJECTED','RAW_PII_VALUE_REJECTED'].includes(e.code)?40:30;}});}
