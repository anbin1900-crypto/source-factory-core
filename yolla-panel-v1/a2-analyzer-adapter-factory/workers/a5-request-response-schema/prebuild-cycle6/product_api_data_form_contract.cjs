#!/usr/bin/env node
'use strict';
const crypto=require('node:crypto');

const SECRET_RE=/(bearer\s+[a-z0-9._~+/=-]{6,}|basic\s+[a-z0-9+/=]{8,}|(?:api[_-]?key|password|secret|token|cookie)\s*[:=]\s*(?!<redacted>)[^\s,;}]{6,})/i;
const EMAIL_RE=/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_RE=/(?:\+?82[- .]?)?0(?:10|11|16|17|18|19)[- .]?\d{3,4}[- .]?\d{4}/;
const RRN_RE=/\b\d{6}[- ]?[1-4]\d{6}\b/;
const PII_KEY_RE=/^(?:email|email_address|phone|phone_number|mobile|mobile_number|rrn|ssn|resident_registration_number)$/i;
function stable(v){if(Array.isArray(v))return v.map(stable);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));return v;}
function sha256(v){return crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');}
function arr(v){return Array.isArray(v)?v:[];}
function ev(v){return Array.isArray(v)?v.filter(Boolean):(v?[v]:[]);}
function uniq(v){return [...new Set(v)].sort();}
function unknown(reason,evidence_pointer='UNKNOWN'){return {status:'UNKNOWN',reason,evidence_pointer};}
function stateOf(authority,status){if(status==='UNKNOWN'||status==='INSUFFICIENT_EVIDENCE')return 'UNKNOWN';const a=String(authority||'').toUpperCase();if(a.includes('OBSERVED'))return 'OBSERVED';if(a.includes('CANDIDATE')||a.includes('INFERRED')||a.includes('APPLICATION'))return 'INFERRED';return 'UNKNOWN';}
function rejectRawRestricted(v,path='$'){
  if(typeof v==='string'){
    if(v==='<REDACTED>'||v==='UNKNOWN')return;
    if(SECRET_RE.test(v))throw Object.assign(new Error(`RAW_SECRET_VALUE_REJECTED at ${path}`),{code:'RAW_SECRET_VALUE_REJECTED'});
    if(EMAIL_RE.test(v)||PHONE_RE.test(v)||RRN_RE.test(v))throw Object.assign(new Error(`RAW_PII_VALUE_REJECTED at ${path}`),{code:'RAW_PII_VALUE_REJECTED'});
    return;
  }
  if(Array.isArray(v)){v.forEach((x,i)=>rejectRawRestricted(x,`${path}[${i}]`));return;}
  if(v&&typeof v==='object')for(const [k,x] of Object.entries(v)){
    if(PII_KEY_RE.test(k)&&typeof x==='string'&&x!=='<REDACTED>'&&x!=='UNKNOWN')throw Object.assign(new Error(`RAW_PII_VALUE_REJECTED at ${path}.${k}`),{code:'RAW_PII_VALUE_REJECTED'});
    rejectRawRestricted(x,`${path}.${k}`);
  }
}
function requireCycle5(input){if(!input||input.schema_version!=='A5_API_UI_STATE_ENTITY_SEMANTIC_BINDING_RESULT_V1')throw Object.assign(new Error('CYCLE5_SEMANTIC_BINDING_RESULT_REQUIRED'),{code:'INVALID_INPUT_SCHEMA'});rejectRawRestricted(input);return input;}
function indexNodes(graph){return new Map(arr(graph?.nodes).map(n=>[n.node_id,n]));}
function buildProductApiContract(c5){
  const g=c5.api_ui_state_binding_graph||{};const nodes=indexNodes(g);const edges=arr(g.edges);const unresolved=arr(g.unresolved_bindings);
  const actionEndpoint=edges.filter(e=>e.relation==='ACTION_TRIGGERS_ENDPOINT');
  const endpointEntity=edges.filter(e=>e.relation==='ENDPOINT_RETURNS_ENTITY');
  const actionState=edges.filter(e=>e.relation==='ACTION_TRANSITIONS_UI_STATE');
  const operations=[];
  for(const edge of actionEndpoint){
    const action=nodes.get(edge.from)||{};const endpoint=nodes.get(edge.to)||{};
    const entityEdges=endpointEntity.filter(e=>e.from===edge.to);const stateEdges=actionState.filter(e=>e.from===edge.from);
    operations.push({
      operation_id:`OP-${sha256([edge.from,edge.to]).slice(0,12).toUpperCase()}`,
      semantic_status:stateOf(edge.authority),authority:edge.authority||'UNKNOWN',confidence:Number(edge.confidence??0),
      action:{node_id:edge.from,command_id:action.command_id||'UNKNOWN',page_id:action.page_id||'UNKNOWN',action_id:action.action_id||'UNKNOWN',action_kind:action.action_kind||'UNKNOWN'},
      request:{endpoint_node_id:edge.to,endpoint_id:endpoint.endpoint_id||'UNKNOWN',request_id:endpoint.request_id||'UNKNOWN',method:endpoint.method||'UNKNOWN',url_template:endpoint.url_template||'UNKNOWN'},
      response_entities:entityEdges.length?entityEdges.map(e=>({entity_node_id:e.to,semantic_status:stateOf(e.authority),authority:e.authority||'UNKNOWN',confidence:Number(e.confidence??0),evidence_pointer:e.evidence_pointer||'UNKNOWN'})):[unknown('ENDPOINT_RESPONSE_ENTITY_NOT_EVIDENCED',edge.evidence_pointer||'UNKNOWN')],
      ui_state_updates:stateEdges.length?stateEdges.map(e=>{const s=nodes.get(e.to)||{};return {state_node_id:e.to,component_id:s.component_id||'UNKNOWN',state_before:s.state_before??'UNKNOWN',state_after:s.state_after??'UNKNOWN',semantic_status:stateOf(e.authority),authority:e.authority||'UNKNOWN',confidence:Number(e.confidence??0),evidence_pointer:e.evidence_pointer||'UNKNOWN'};}):[unknown('ACTION_UI_STATE_UPDATE_NOT_EVIDENCED',edge.evidence_pointer||'UNKNOWN')],
      evidence_pointer:uniq(ev(edge.evidence_pointer).concat(ev(action.evidence_pointer),ev(endpoint.evidence_pointer)))
    });
  }
  return {schema_version:'PRODUCT_API_CONTRACT_V1',operations,unresolved_bindings:unresolved,implementation_policy:{observed_only_for_direct_execution:true,inferred_requires_consumer_validation:true,unknown_fail_closed:true,business_rule_generation_without_evidence:false},raw_secret_value_count:0,raw_pii_value_count:0};
}
function buildDataModelSpec(c5){
  const g=c5.data_entity_graph||{};
  const entities=arr(g.nodes).map(n=>({entity_id:n.entity_id||'UNKNOWN',record_path:n.record_path||'UNKNOWN',request_id:n.request_id||'UNKNOWN',identifier_paths:n.identifier_paths||[],semantic_status:stateOf(n.authority),authority:n.authority||'UNKNOWN',evidence_pointer:n.evidence_pointer||'UNKNOWN',fields:arr(n.application_fields).map(f=>({source_field:f.source_field||'UNKNOWN',json_path:f.json_path||'UNKNOWN',application_canonical_candidate:f.application_canonical_candidate||'UNKNOWN',semantic_status:stateOf(f.authority),authority:f.authority||'UNKNOWN',confidence:Number(f.confidence??0),evidence_pointer:f.evidence_pointer||'UNKNOWN',d_canonical_authority:false}))}));
  return {schema_version:'DATA_MODEL_IMPLEMENTATION_SPEC_V1',entities,relationships:arr(g.edges).map(e=>({...e,semantic_status:stateOf(e.authority,e.status),confidence:Number(e.confidence??0)})),business_rules:g.business_rules||unknown('BUSINESS_RULES_NOT_OBSERVED'),authority_boundary:{application_level_only:true,d_canonical_schema_decision:false,production_db_write:false},unknown_policy:'FAIL_CLOSED'};
}
function buildFormWriteSpec(c5){
  const source=arr(c5.form_field_semantic_candidate?.candidates);
  const bindings=source.map(c=>{
    const cc=c.application_canonical_candidate||unknown('CANONICAL_CANDIDATE_NOT_EVIDENCED');const read=c.read_transform||unknown('READ_TRANSFORM_NOT_EVIDENCED');const write=c.write_transform||unknown('WRITE_TRANSFORM_NOT_EVIDENCED');
    return {form_id:c.form_id||'UNKNOWN',field_name:c.field_name||'UNKNOWN',application_canonical_candidate:cc,canonical_semantic_status:stateOf(cc.authority,cc.status),canonical_confidence:Number(cc.confidence??0),read_transform:{...read,semantic_status:stateOf(read.authority,read.status),confidence:Number(read.confidence??0)},write_transform:{...write,semantic_status:stateOf(write.authority,write.status),confidence:Number(write.confidence??0)},business_rule:c.business_rule||unknown('BUSINESS_RULE_NOT_OBSERVED'),evidence_pointer:uniq(ev(cc.evidence_pointer).concat(ev(read.evidence_pointer),ev(write.evidence_pointer))),d_canonical_authority:false};
  });
  return {schema_version:'FORM_WRITE_BINDING_SPEC_V1',bindings,implementation_policy:{write_allowed_only_when_transform_status:'OBSERVED_OR_VALIDATED_INFERRED',unknown_transform_fail_closed:true,evidence_less_business_rule_generation:false,d_canonical_schema_decision:false,production_db_write:false}};
}
function buildImplementationContract(input){
  const c5=requireCycle5(input);const product=buildProductApiContract(c5);const data=buildDataModelSpec(c5);const form=buildFormWriteSpec(c5);
  const evidence=uniq([...product.operations.flatMap(x=>ev(x.evidence_pointer)),...data.entities.flatMap(x=>ev(x.evidence_pointer)),...form.bindings.flatMap(x=>ev(x.evidence_pointer)),...ev(c5.evidence_pointer)].filter(x=>x&&x!=='UNKNOWN'));
  const unknownCount=product.unresolved_bindings.length+data.relationships.filter(x=>x.semantic_status==='UNKNOWN').length+form.bindings.filter(x=>x.canonical_semantic_status==='UNKNOWN'||x.read_transform.semantic_status==='UNKNOWN'||x.write_transform.semantic_status==='UNKNOWN').length;
  const out={schema_version:'A5_PRODUCT_API_DATA_FORM_IMPLEMENTATION_CONTRACT_RESULT_V1',source_cycle5_digest:c5.semantic_digest||'UNKNOWN',product_api_contract:product,data_model_implementation_spec:data,form_write_binding_spec:form,evidence_pointer:evidence.length?evidence:['UNKNOWN'],decision_status:unknownCount?'READY_WITH_INSUFFICIENT_EVIDENCE':'READY',unknown_binding_count:unknownCount,raw_secret_value_count:0,raw_pii_value_count:0,d_canonical_schema_decision:false,production_db_write:false,production:false,ready:false,merge:false};
  out.implementation_digest=sha256(out);return out;
}
module.exports={buildImplementationContract,buildProductApiContract,buildDataModelSpec,buildFormWriteSpec,stateOf,sha256};
if(require.main===module){let raw='';process.stdin.setEncoding('utf8');process.stdin.on('data',c=>raw+=c);process.stdin.on('end',()=>{try{process.stdout.write(JSON.stringify(buildImplementationContract(JSON.parse(raw||'{}')),null,2)+'\n');}catch(e){process.stderr.write(JSON.stringify({status:'ERROR',code:e.code||'IMPLEMENTATION_CONTRACT_FAILED',message:e.message})+'\n');process.exitCode=['RAW_SECRET_VALUE_REJECTED','RAW_PII_VALUE_REJECTED'].includes(e.code)?40:30;}});}
