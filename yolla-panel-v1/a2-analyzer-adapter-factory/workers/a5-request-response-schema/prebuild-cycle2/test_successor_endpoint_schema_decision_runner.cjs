#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const {makeReceipt,EXIT}=require('./successor_endpoint_schema_decision_runner.cjs');

const request={
  schema_version:'ENDPOINT_SCHEMA_DECISION_RUN_REQUEST_V1',
  run_id:'SMOKE-1',
  observation_pointer:{
    uri:'github://a3/receipt.json',
    receipt:{network_request_stream:[
      {request_id:'r1',url:'https://fixture.invalid/api/items?page=1',method:'GET',resource_type:'Fetch',headers:{Accept:'application/json',Cookie:'<REDACTED>'}},
      {request_id:'r2',url:'https://fixture.invalid/api/items?page=2',method:'GET',resource_type:'Fetch',headers:{Accept:'application/json',Cookie:'<REDACTED>'}}
    ]}
  },
  structure_pointer:{
    uri:'github://a4/structure.json',
    receipt:{repeatedRegions:[{kind:'CARD_LIST',itemCount:2}],fieldCandidates:[{name:'record_id'},{name:'name'},{name:'value'},{name:'detail_url'},{name:'category'}],locatorCandidates:[{locator:'.card'},{locator:'.name'},{locator:'.value'},{locator:'a.detail'},{locator:'.category'}]}
  },
  response_body_pointer:{
    uri:'github://a3/body.json',
    receipt:{response_bodies:[{request_id:'r1',body:{records:[{record_id:'R1',name:'Alpha',value:100},{record_id:'R2',name:'Beta',value:200}],page:1}}]}
  }
};
const receipt=makeReceipt(request);
assert.equal(receipt.schema_version,'ENDPOINT_SCHEMA_DECISION_RUN_RECEIPT_V1');
assert.equal(receipt.decision_status,'PASS');
assert.equal(receipt.exit_code,EXIT.PASS_FULL);
assert.equal(receipt.endpoint_candidates.length,1);
assert.ok(Array.isArray(receipt.schema_fields) && receipt.schema_fields.some(f=>f.path==='$.records[].record_id'));
assert.equal(receipt.identifier_map.primary_key.field,'record_id');
assert.equal(receipt.session_requirements_reference.requirements[0].type,'COOKIE_JAR_REFERENCE');
assert.equal(receipt.recommended_mode,'HYBRID');
assert.ok(receipt.mode_scores.DOM>0 && receipt.mode_scores.API>0);
assert.equal(receipt.raw_secret_value_count,0);
assert.match(receipt.receipt_sha256,/^[a-f0-9]{64}$/);

const degraded=makeReceipt({...request,response_body_pointer:undefined,run_id:'SMOKE-1-DEGRADED'});
assert.equal(degraded.decision_status,'PASS_CONFIDENCE_DEGRADED');
assert.equal(degraded.exit_code,EXIT.PASS_CONFIDENCE_DEGRADED);
assert.equal(degraded.schema_fields.status,'UNKNOWN');
assert.equal(degraded.recommended_mode,'DOM');

const failed=makeReceipt({...request,structure_pointer:{uri:'github://a4/structure.json'},run_id:'SMOKE-1-FAILCLOSED'});
assert.equal(failed.decision_status,'FAIL_CLOSED');
assert.equal(failed.exit_code,EXIT.FAIL_CLOSED_CORE_EVIDENCE);
assert.equal(failed.identifier_map.primary_key.status,'UNKNOWN');

assert.throws(()=>makeReceipt({...request,run_id:'SECRET',observation_pointer:{uri:'x',receipt:{network_request_stream:[{url:'https://x',headers:{Authorization:'Bearer abcdefghijk'}}]}}}),/raw secret-like value/i);

console.log(JSON.stringify({status:'PASS',fixture_smoke_count:1,assertions:17,full_mode:receipt.recommended_mode,degraded_mode:degraded.recommended_mode,receipt_sha256:receipt.receipt_sha256}));
