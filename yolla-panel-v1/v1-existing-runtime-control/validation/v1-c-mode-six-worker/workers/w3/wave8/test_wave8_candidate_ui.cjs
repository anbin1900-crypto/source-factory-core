'use strict';
const assert = require('node:assert/strict');
const {project} = require('./candidate_ui_truth_bridge.cjs');
const rows = [
 {role:'W1',registry_relation:'CURRENT',result_comment_id:111,result_key:'k1'},
 {role:'W2',registry_relation:'HISTORICAL',result_comment_id:99,result_key:'k2'},
 {role:'W3',awaiting_result:true,result_key:'k3'},
 {role:'W4',result_commit:'a'.repeat(40),result_key:'k4'},
 {role:'W5',duplicate_report:true,result_comment_id:5,result_key:'k5'},
 {role:'W6',error:true,result_key:'k6'},
 {role:'W7',end:true,result_key:'k7'},
 {role:'W8',profile_status:'RUNNING'}
];
const on = project(rows,{c_enabled:true,command_enabled:true});
assert.equal(on.counts.current,1);
assert.equal(on.counts.historical,1);
assert.equal(on.counts.awaiting,1);
assert.equal(on.counts.missing,1);
assert.equal(on.counts.duplicate,1);
assert.equal(on.counts.error,1);
assert.equal(on.counts.end,1);
assert.equal(on.counts.idle,1);
assert.equal(on.projections[0].display_result_reference,'RESULT_COMMENT #111');
assert.equal(on.projections[3].state,'REPORT_MISSING');
assert.equal(on.projections[7].state,'IDLE');
const off = project(rows,{c_enabled:false,command_enabled:false});
assert.equal(off.counts.working,0);
console.log('W3_WAVE8_PASS assertions=13');
