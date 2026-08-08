#!/usr/bin/env node
'use strict';
const crypto = require('node:crypto');

const SECRET_RE=/(bearer\s+[a-z0-9._~+/=-]{6,}|basic\s+[a-z0-9+/=]{8,}|(?:api[_-]?key|password|secret|token|cookie)\s*[:=]\s*(?!<redacted>)[^\s,;}]{6,})/i;
function stable(v){if(Array.isArray(v))return v.map(stable);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));return v;}
function sha256(v){return crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');}
function uniq(v){return [...new Set(v)].sort();}
function unknown(reason,evidence_pointer='UNKNOWN'){return {status:'UNKNOWN',reason,evidence_pointer};}
function rejectSecrets(v){if(SECRET_RE.test(JSON.stringify(v)))throw Object.assign(new Error('RAW_SECRET_VALUE_REJECTED'),{code:'RAW_SECRET_VALUE_REJECTED'});}
function arr(v){return Array.isArray(v)?v:[];}
function normName(s=''){return String(s).trim().toLowerCase().replace(/[^a-z0-9_]+/g,'_').replace(/^_+|_+$/g,'');}
function leaf(path=''){return String(path).replace(/\[\]/g,'').split('.').pop().replace(/[^A-Za-z0-9_-]/g,'');}
function ev(v){if(Array.isArray(v))return v.filter(Boolean);return v? [v]:[];}
function dedupe(items,keyFn){const m=new Map();for(const item of items){const k=keyFn(item);if(!m.has(k))m.set(k,item);}return [...m.values()];}

function validateCycle4(input){
  if(!input || input.schema_version!=='A5_ACTION_STATE_API_ENTITY_BINDING_RESULT_V1') throw Object.assign(new Error('CYCLE4_BINDING_RESULT_REQUIRED'),{code:'INVALID_INPUT_SCHEMA'});
  rejectSecrets(input);
  return input;
}

function buildApiUiStateGraph(c4){
  const nodes=[]; const edges=[]; const unresolved=[];
  const actionBindings=arr(c4.action_network_binding?.bindings);
  const uiNodes=arr(c4.api_ui_binding_graph?.nodes);
  const uiEdges=arr(c4.api_ui_binding_graph?.edges);
  const transitions=arr(c4.ui_state_transition_graph?.transitions);
  const entities=arr(c4.data_entity_relationship_graph?.nodes);

  for(const b of actionBindings){
    const actionNode=`ACTION:${b.command_id||'UNKNOWN'}:${b.page_id||'UNKNOWN'}:${b.action_id||'UNKNOWN'}`;
    nodes.push({node_id:actionNode,node_type:'ACTION',command_id:b.command_id||'UNKNOWN',page_id:b.page_id||'UNKNOWN',action_id:b.action_id||'UNKNOWN',action_kind:b.action_kind||'UNKNOWN',evidence_pointer:b.evidence_pointer||'UNKNOWN'});
    for(const req of arr(b.network_requests)){
      const endpointNode=`ENDPOINT:${req.endpoint_id||req.request_id||'UNKNOWN'}`;
      nodes.push({node_id:endpointNode,node_type:'API_ENDPOINT',endpoint_id:req.endpoint_id||'UNKNOWN',request_id:req.request_id||'UNKNOWN',method:req.method||'UNKNOWN',url_template:req.url_template||'UNKNOWN',evidence_pointer:req.evidence_pointer||'UNKNOWN'});
      edges.push({from:actionNode,to:endpointNode,relation:'ACTION_TRIGGERS_ENDPOINT',authority:'OBSERVED',confidence:1,evidence_pointer:uniq(ev(b.evidence_pointer).concat(ev(req.evidence_pointer)))});
    }
  }

  for(const n of uiNodes){
    if(n.node_type==='UI_COMPONENT') nodes.push({node_id:`UI:${n.node_id}`,node_type:'UI_COMPONENT',component_id:n.node_id,kind:n.kind||'UNKNOWN',locator:n.locator||null,evidence_pointer:n.evidence_pointer||'UNKNOWN'});
    if(n.node_type==='DATA_ENTITY') nodes.push({node_id:`ENTITY:${n.node_id}`,node_type:'DATA_ENTITY',entity_id:n.node_id,record_path:n.record_path||'UNKNOWN',request_id:n.request_id||'UNKNOWN',evidence_pointer:n.evidence_pointer||'UNKNOWN'});
  }
  for(const e of uiEdges){
    if(e.relation==='ENTITY_FIELD_TO_COMPONENT_CANDIDATE') edges.push({from:`ENTITY:${e.from}`,to:`UI:${e.to}`,relation:'ENTITY_PRESENTED_BY_COMPONENT',authority:'CANDIDATE',confidence:Number(e.confidence||0),evidence_pointer:e.evidence_pointer||'UNKNOWN'});
  }

  for(const t of transitions){
    if(t?.status==='UNKNOWN') { unresolved.push({relation:'ACTION_TO_UI_STATE',status:'INSUFFICIENT_EVIDENCE',reason:t.reason||'STATE_TRANSITION_NOT_OBSERVED',evidence_pointer:t.evidence_pointer||'UNKNOWN'}); continue; }
    if(!t.action_id || t.action_id==='UNKNOWN' || !t.component_id || t.component_id==='UNKNOWN') { unresolved.push({relation:'ACTION_TO_UI_STATE',status:'INSUFFICIENT_EVIDENCE',reason:'ACTION_ID_OR_COMPONENT_ID_NOT_OBSERVED',evidence_pointer:t.evidence_pointer||'UNKNOWN'}); continue; }
    const actionCandidates=nodes.filter(n=>n.node_type==='ACTION'&&n.action_id===t.action_id);
    if(!actionCandidates.length){unresolved.push({relation:'ACTION_TO_UI_STATE',status:'INSUFFICIENT_EVIDENCE',reason:'ACTION_NODE_NOT_BOUND',action_id:t.action_id,evidence_pointer:t.evidence_pointer||'UNKNOWN'});continue;}
    const stateNode=`STATE:${t.component_id}:${sha256([t.state_before,t.state_after]).slice(0,12)}`;
    nodes.push({node_id:stateNode,node_type:'UI_STATE_TRANSITION',component_id:t.component_id,state_before:t.state_before,state_after:t.state_after,evidence_pointer:t.evidence_pointer||'UNKNOWN'});
    for(const a of actionCandidates) edges.push({from:a.node_id,to:stateNode,relation:'ACTION_TRANSITIONS_UI_STATE',authority:'OBSERVED',confidence:1,evidence_pointer:uniq(ev(a.evidence_pointer).concat(ev(t.evidence_pointer)))});
  }

  const reqToEndpoint=new Map();
  for(const n of nodes) if(n.node_type==='API_ENDPOINT'&&n.request_id&&n.request_id!=='UNKNOWN') reqToEndpoint.set(n.request_id,n.node_id);
  for(const ent of entities){
    const entityNode=`ENTITY:${ent.entity_id}`;
    if(!nodes.some(n=>n.node_id===entityNode)) nodes.push({node_id:entityNode,node_type:'DATA_ENTITY',entity_id:ent.entity_id,record_path:ent.record_path||'UNKNOWN',request_id:ent.request_id||'UNKNOWN',evidence_pointer:ent.evidence_pointer||'UNKNOWN'});
    if(ent.request_id && reqToEndpoint.has(ent.request_id)) edges.push({from:reqToEndpoint.get(ent.request_id),to:entityNode,relation:'ENDPOINT_RETURNS_ENTITY',authority:'OBSERVED',confidence:1,evidence_pointer:uniq(ev(ent.evidence_pointer))});
    else unresolved.push({relation:'ENDPOINT_RETURNS_ENTITY',entity_id:ent.entity_id,status:'INSUFFICIENT_EVIDENCE',reason:'REQUEST_ID_NOT_PRESERVED_ON_ENTITY',evidence_pointer:ent.evidence_pointer||'UNKNOWN'});
  }

  return {schema_version:'API_UI_STATE_BINDING_GRAPH_V1',nodes:dedupe(nodes,x=>x.node_id),edges:dedupe(edges,x=>sha256(x)),unresolved_bindings:unresolved,authority_policy:'OBSERVED_EDGES_REQUIRE_EXPLICIT_PROVENANCE_KEY;CANDIDATES_NEVER_PROMOTED'};
}

function buildDataEntityGraph(c4){
  const source=arr(c4.data_entity_relationship_graph?.nodes);
  const sourceEdges=arr(c4.data_entity_relationship_graph?.edges);
  const formCandidates=arr(c4.form_field_canonical_candidate?.candidates);
  const nodes=source.map(e=>({entity_id:e.entity_id,record_path:e.record_path||'UNKNOWN',identifier_paths:e.identifier_paths||[],request_id:e.request_id||'UNKNOWN',authority:e.authority||'OBSERVED_OR_CANDIDATE',evidence_pointer:e.evidence_pointer||'UNKNOWN',application_fields:[]}));
  for(const node of nodes){
    const prefix=String(node.record_path||'');
    const matches=formCandidates.filter(c=>{
      const p=c.canonical_candidate?.json_path; return typeof p==='string' && (p.startsWith(prefix)||prefix==='UNKNOWN');
    });
    node.application_fields=matches.map(c=>({source_field:c.field_name||'UNKNOWN',json_path:c.canonical_candidate?.json_path||'UNKNOWN',application_canonical_candidate:normName(c.field_name||leaf(c.canonical_candidate?.json_path||''))||'UNKNOWN',authority:'APPLICATION_CANDIDATE_ONLY',confidence:Number(c.canonical_candidate?.confidence||0),evidence_pointer:c.canonical_candidate?.evidence_pointer||'UNKNOWN',d_canonical_authority:false}));
  }
  return {schema_version:'DATA_ENTITY_GRAPH_V1',nodes,edges:sourceEdges.map(e=>({...e,authority:e.authority||'CANDIDATE'})),business_rules:c4.data_entity_relationship_graph?.business_rules||unknown('BUSINESS_RULES_NOT_OBSERVED'),canonical_authority_boundary:'APPLICATION_LEVEL_CANDIDATE_ONLY;D_CANONICAL_DB_NOT_ASSIGNED'};
}

function buildFormSemanticCandidates(c4){
  const source=arr(c4.form_field_canonical_candidate?.candidates);
  const candidates=source.map(c=>{
    const cc=c.canonical_candidate||unknown('CANONICAL_FIELD_NOT_EVIDENCED');
    const read=c.read_transform||unknown('READ_TRANSFORM_NOT_EVIDENCED');
    const write=c.write_transform||unknown('WRITE_TRANSFORM_NOT_EVIDENCED');
    const jsonPath=cc.json_path||'UNKNOWN';
    const baseName=normName(c.field_name||leaf(jsonPath));
    const confidences=[cc.confidence,read.confidence,write.confidence].filter(v=>typeof v==='number');
    return {form_id:c.form_id||'UNKNOWN',field_name:c.field_name||'UNKNOWN',application_canonical_candidate:cc.status==='UNKNOWN'?cc:{name:baseName||'UNKNOWN',json_path:jsonPath,authority:'APPLICATION_CANDIDATE_ONLY',confidence:Number(cc.confidence||0),evidence_pointer:cc.evidence_pointer||'UNKNOWN',d_canonical_authority:false},read_transform:read,write_transform:write,semantic_confidence:confidences.length?Number((confidences.reduce((a,b)=>a+b,0)/confidences.length).toFixed(4)):0,business_rule:unknown('BUSINESS_RULE_NOT_OBSERVED',cc.evidence_pointer||'UNKNOWN')};
  });
  return {schema_version:'FORM_FIELD_SEMANTIC_CANDIDATE_V1',candidates,authority_boundary:'APPLICATION_LEVEL_ONLY',unknown_policy:'UNOBSERVED_BUSINESS_RULES_AND_TRANSFORMS_REMAIN_UNKNOWN'};
}

function buildSemanticBinding(input){
  const c4=validateCycle4(input);
  const apiUiState=buildApiUiStateGraph(c4);
  const dataEntity=buildDataEntityGraph(c4);
  const formSemantic=buildFormSemanticCandidates(c4);
  const evidence=uniq([...(apiUiState.nodes.flatMap(n=>ev(n.evidence_pointer))),...(apiUiState.edges.flatMap(e=>ev(e.evidence_pointer))),...(dataEntity.nodes.flatMap(n=>ev(n.evidence_pointer))),...(formSemantic.candidates.flatMap(c=>ev(c.application_canonical_candidate?.evidence_pointer)))].filter(x=>x&&x!=='UNKNOWN'));
  const result={schema_version:'A5_API_UI_STATE_ENTITY_SEMANTIC_BINDING_RESULT_V1',source_cycle4_digest:c4.decision_digest||'UNKNOWN',provenance:c4.provenance||unknown('CYCLE4_PROVENANCE_NOT_PRESENT'),api_ui_state_binding_graph:apiUiState,data_entity_graph:dataEntity,form_field_semantic_candidate:formSemantic,evidence_pointer:evidence.length?evidence:['UNKNOWN'],decision_status:apiUiState.unresolved_bindings.length?'READY_WITH_INSUFFICIENT_EVIDENCE':'READY',raw_secret_value_count:0,production:false,ready:false,merge:false};
  result.semantic_digest=sha256(result); return result;
}

module.exports={buildSemanticBinding,buildApiUiStateGraph,buildDataEntityGraph,buildFormSemanticCandidates,sha256};
if(require.main===module){let raw='';process.stdin.setEncoding('utf8');process.stdin.on('data',c=>raw+=c);process.stdin.on('end',()=>{try{process.stdout.write(JSON.stringify(buildSemanticBinding(JSON.parse(raw||'{}')),null,2)+'\n');}catch(e){process.stderr.write(JSON.stringify({status:'ERROR',code:e.code||'SEMANTIC_BINDING_FAILED',message:e.message})+'\n');process.exitCode=e.code==='RAW_SECRET_VALUE_REJECTED'?40:30;}});}
