'use strict';
const assert=require('node:assert/strict');
const {project,counts,STATES}=require('./registry_authority_truth_model.cjs');
const ctx={current_registry_id:'REG-7'};
const fixtures=[
 {registry_id:'REG-7',result_comment_id:7001,result_key:'rk1',status:'PASS'},
 {registry_id:'REG-6',result_comment_id:6001,result_key:'rk2',status:'PASS'},
 {registry_id:'REG-7',result_commit:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',result_key:'rk3'},
 {registry_id:'REG-7',result_comment_id:7004,result_key:'rk4',duplicate_count:2},
 {registry_id:'REG-7',result_comment_id:7005,result_key:'rk5',status:'ERROR'},
 {registry_id:'REG-7',result_comment_id:7006,result_key:'rk6',status:'END'},
 {profile_status:'RUNNING'}
];
assert.equal(project(fixtures[0],ctx).state,STATES.CURRENT);
assert.equal(project(fixtures[0],ctx).display_ref,'7001');
assert.equal(project(fixtures[1],ctx).state,STATES.HISTORICAL);
assert.equal(project(fixtures[2],ctx).state,STATES.MISSING);
assert.equal(project(fixtures[3],ctx).state,STATES.DUPLICATE);
assert.equal(project(fixtures[4],ctx).state,STATES.ERROR);
assert.equal(project(fixtures[5],ctx).state,STATES.END);
assert.equal(project(fixtures[6],ctx).state,STATES.IDLE);
const c=counts(fixtures,ctx);
assert.deepEqual(c,{working:1,current:1,historical:1,missing:1,duplicate:1,error:1,end:1,idle:1});
assert.equal(counts([{profile_status:'RUNNING'}],ctx).working,0);
console.log(JSON.stringify({status:'PASS',assertions:10,counters:c}));
