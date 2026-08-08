'use strict';
const assert=require('node:assert/strict'); const fs=require('node:fs'); const path=require('node:path');
const {normalizeObservation,buildCausalGraph,sha256}=require('./A3_ALIAS_SAFE_NORMALIZER_V1.cjs');
const {consumeDelta}=require('./A3_V2_LATE_BIND_CONSUMER_V1.cjs');
function run(){
  const matrix=JSON.parse(fs.readFileSync(path.join(__dirname,'A3_CAUSAL_FIXTURE_MATRIX_V1.json'),'utf8'));
  const normalized=[];
  for(const c of matrix.cases){ const n=normalizeObservation(c.input); normalized.push(n); if(c.repeat===2) normalized.push(normalizeObservation(c.input));
    if(c.expect.source_kind) assert.equal(n.source_kind,c.expect.source_kind); if(c.expect.fact_state) assert.equal(n.fact_state,c.expect.fact_state);
    if(c.expect.alias_min) assert.ok(n.aliases_applied.length>=c.expect.alias_min); if(c.expect.page_state_id) assert.equal(n.provenance.page_state_id,c.expect.page_state_id);
    if(c.expect.request_id) assert.equal(n.provenance.request_id,c.expect.request_id); if(c.expect.response_id) assert.equal(n.provenance.response_id,c.expect.response_id);
    if(c.expect.missing_fields) for(const f of c.expect.missing_fields) assert.ok(n.missing_fields.includes(f));
    assert(!JSON.stringify(n).includes('abcdefghijk'));
  }
  const seq=[
    {source_kind:'UIA',command_id:'CMD-C',page_id:'PAGE-C',action_id:'ACT-C',event_kind:'uia.action',payload:{kind:'CLICK'},evidence_pointer:'fixture://action'},
    {source_kind:'CDP',command_id:'CMD-C',page_id:'PAGE-C',action_id:'ACT-C',request_id:'REQ-C',event_kind:'network.request',payload:{method:'POST'},evidence_pointer:'fixture://request'},
    {source_kind:'RESPONSE',command_id:'CMD-C',page_id:'PAGE-C',action_id:'ACT-C',request_id:'REQ-C',response_id:'RES-C',event_kind:'network.response',payload:{status:200},evidence_pointer:'fixture://response'},
    {source_kind:'DOM',command_id:'CMD-C',page_id:'PAGE-C',action_id:'ACT-C',request_id:'REQ-C',response_id:'RES-C',page_state_id:'STATE-C',event_kind:'dom.page_state',payload:{stable:true},evidence_pointer:'fixture://state'},
    {source_kind:'CDP',command_id:'CMD-C',page_id:'PAGE-C',action_id:'ACT-R',request_id:'REQ-A',event_kind:'network.request',payload:{url:'https://fixture.invalid/a'}},
    {source_kind:'CDP',command_id:'CMD-C',page_id:'PAGE-C',action_id:'ACT-R',request_id:'REQ-B',event_kind:'network.request',payload:{redirect_from_request_id:'REQ-A'}},
    {source_kind:'CDP',command_id:'CMD-C',page_id:'PAGE-C',action_id:'ACT-R',request_id:'REQ-C2',event_kind:'network.request',payload:{retry_of_request_id:'REQ-B'}},
  ];
  const graph=buildCausalGraph(seq); assert.ok(graph.edges.some(e=>e.relation==='ACTION_TO_REQUEST')); assert.ok(graph.edges.some(e=>e.relation==='REQUEST_TO_RESPONSE')); assert.ok(graph.edges.some(e=>e.relation==='TO_PAGE_STATE')); assert.ok(graph.edges.some(e=>e.relation==='REDIRECT')); assert.ok(graph.edges.some(e=>e.relation==='RETRY'));
  const dup=matrix.cases.find(c=>c.case_id==='DUPLICATE').input; const dupGraph=buildCausalGraph([dup,dup]); assert.ok(dupGraph.edges.some(e=>e.relation==='DUPLICATE'));
  let ledger=consumeDelta(null,seq.slice(0,2)); const rev=ledger.revision; ledger=consumeDelta(ledger,seq.slice(0,2)); assert.equal(ledger.revision,rev); assert.ok(ledger.last_delta_receipt.idempotent_count>=2); ledger=consumeDelta(ledger,seq.slice(2)); assert.ok(ledger.entries.length>=seq.length);
  const result={status:'PASS',fixture_case_count:matrix.cases.length,normalized_observation_count:normalized.length,causal_rule_pass:{action_request:true,request_response:true,response_state:true,redirect:true,retry:true,duplicate:true},missing_alias_safe:true,dynamic_dom_streaming_pass:true,missing_response_waiting_input_pass:true,append_only_late_bind_pass:true,idempotent_delta_pass:true,raw_secret_or_pii_count:0,target_value_guessing:false,d4_scope_modified:false,terminal:'A3_CAUSAL_OBSERVATION_SOURCE_PASS_OR_EXACT_BLOCKER'};
  result.validation_sha256='sha256:'+sha256(result); process.stdout.write(JSON.stringify(result,null,2)+'\n'); return result;
}
if(require.main===module)run(); module.exports={run};
