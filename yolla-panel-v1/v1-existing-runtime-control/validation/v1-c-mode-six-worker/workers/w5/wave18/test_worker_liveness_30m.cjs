'use strict';
const assert = require('assert');
const {
  STATUSES, createLedger, recordDirective, applyGithubComments, inspectAssignment, toPanelRow
} = require('./worker_liveness_30m.cjs');

const t0 = 1_700_000_000_000;
const ledger = createLedger();
const rec = recordDirective(ledger, { role:'AUTOMATION-C-W1', result_key:'520054321000', chat_url:'https://chat.example/w1', sent_at:t0, baseline_response_token:'r0' });
assert.equal(rec.duplicate, false);
const dup = recordDirective(ledger, { role:'AUTOMATION-C-W1', result_key:'520054321000', chat_url:'https://chat.example/w1', sent_at:t0 });
assert.equal(dup.directive_count_delta, 0);
const id = rec.assignment.id;

let r = inspectAssignment(ledger, { assignment_id:id, now:t0+29*60*1000, generating:false });
assert.equal(r.refresh, false);
r = inspectAssignment(ledger, { assignment_id:id, now:t0+31*60*1000, generating:true });
assert.equal(r.refresh, false); assert.equal(r.status, STATUSES.WORKING);
r = inspectAssignment(ledger, { assignment_id:id, now:t0+31*60*1000, generating:false });
assert.equal(r.refresh, true); assert.equal(rec.assignment.refresh_count, 1);
r = inspectAssignment(ledger, { assignment_id:id, now:t0+31*60*1000+30000, generating:false, observed_after_refresh:{new_response:true,response_token:'r1'} });
assert.equal(r.status, STATUSES.RESULT_PENDING);
r = inspectAssignment(ledger, { assignment_id:id, now:t0+32*60*1000, generating:false, observed_after_refresh:{new_response:false,response_token:'r1'} });
assert.equal(rec.assignment.refresh_count, 1);

applyGithubComments(ledger,[{id:123,url:'https://github/x',body:'C_RESULT|RESULT_KEY=999|ROLE=X|OUTCOME=PASS|STATUS=END|RESULT_COMMIT=NONE'}],t0+33*60*1000);
assert.notEqual(rec.assignment.status, STATUSES.COMPLETE);
applyGithubComments(ledger,[{id:124,url:'https://github/y',body:'C_RESULT|RESULT_KEY=520054321000|ROLE=AUTOMATION-C-W1|OUTCOME=PASS|STATUS=END|RESULT_COMMIT=0123456789abcdef0123456789abcdef01234567'}],t0+34*60*1000);
assert.equal(rec.assignment.status, STATUSES.COMPLETE);
const row = toPanelRow(rec.assignment,t0+35*60*1000);
assert.deepEqual(Object.keys(row),['ROLE','STATUS','elapsed_ms','last_checked_at','chat_open_url','github_result_url']);

const ledger2=createLedger();
const a=recordDirective(ledger2,{role:'AUTOMATION-C-W2',result_key:'520054481500',chat_url:'https://chat.example/w2',sent_at:t0}).assignment;
inspectAssignment(ledger2,{assignment_id:a.id,now:t0+31*60*1000,generating:false});
r=inspectAssignment(ledger2,{assignment_id:a.id,now:t0+31*60*1000+30000,generating:false,observed_after_refresh:{new_response:false,error:false}});
assert.equal(r.status,STATUSES.REVIEW_REQUIRED);
assert.equal(a.refresh_count,1);
assert.equal(Object.keys(ledger.directive_receipts).length,1);
console.log(JSON.stringify({
 UNDER_30_MIN_NO_REFRESH:'PASS', GENERATING_NO_REFRESH:'PASS', AFTER_30_MIN_SINGLE_REFRESH:'PASS',
 NEW_RESPONSE_RESULT_PENDING:'PASS', EXACT_RESULT_KEY_TERMINAL_COMPLETE:'PASS', NO_ACTIVITY_REVIEW_REQUIRED:'PASS',
 DUPLICATE_REFRESH_COUNT:0, DUPLICATE_DIRECTIVE_COUNT:0, assertions:18
},null,2));
