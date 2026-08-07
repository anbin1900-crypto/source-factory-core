'use strict';

const assert = require('node:assert/strict');
const { discoverPendingDirectives } = require('../report_parser/directive_discovery.cjs');

let assertions = 0;
function ok(value, message) { assert.ok(value, message); assertions += 1; }
function equal(a, b, message) { assert.equal(a, b, message); assertions += 1; }

const w6Regression = [
  { id: 5189537363, body: 'COMMAND_ID=C6W-W1-W6-ACCEPTANCE\nTERMINAL=C6W6_EXACT_BLOCKER\nSTATUS=END' },
  { id: 5189701057, body: 'COMMAND_ID=C6W-W2-W6-FAILURE-AUDIT\nPANEL | ROLE=AUTOMATION-C-W6 | WAVE=V1-C-MODE-6W-WAVE-002 | COMMAND_ID=C6W-W2-W6-FAILURE-AUDIT | STATUS=ASSIGNED' },
  { id: 5189877834, body: 'STATUS=NO_PENDING_DIRECTIVE\nLATEST_TERMINAL_COMMENT=5189537363' }
];

const result = discoverPendingDirectives(w6Regression);
equal(result.pending_count, 1, 'new directive remains pending');
equal(result.pending[0].directive_post_id, 5189701057, 'correct directive post captured');
equal(result.pending[0].command_id, 'C6W-W2-W6-FAILURE-AUDIT', 'correct command captured');
ok(result.false_no_pending_claim_post_ids.includes(5189877834), 'false NO_PENDING detected');
ok(result.fail_closed, 'discovery fails closed');
equal(result.latest_directive.post_id, 5189701057, 'latest directive is not hidden by older terminal');

const completed = discoverPendingDirectives([
  ...w6Regression,
  { id: 5189900000, body: 'COMMAND_ID=C6W-W2-W6-FAILURE-AUDIT\nTERMINAL=C6W6_WAVE2_AUDIT_BLOCKED\nSTATUS=END' }
]);
equal(completed.pending_count, 0, 'matching newer terminal closes directive');
equal(completed.c_result_schema, 'ROLE+WAVE+COMMAND_ID+STATUS', 'C schema retained');
equal(completed.repeat_result_schema, 'ROLE+COMMAND_ID+DISPATCH_ID+STATUS', 'repeat schema retained');

const duplicateDirective = discoverPendingDirectives([
  { id: 10, body: 'COMMAND_ID=CMD-1\nSTATUS=ASSIGNED' },
  { id: 11, body: 'COMMAND_ID=CMD-1\nSTATUS=ASSIGNED' },
  { id: 12, body: 'COMMAND_ID=CMD-1\nTERMINAL=T\nSTATUS=END' }
]);
equal(duplicateDirective.pending_count, 0, 'latest duplicate directive closed by later terminal');
equal(duplicateDirective.latest_directive.post_id, 11, 'latest duplicate directive retained');

console.log(`PASS_${assertions}_OF_${assertions}`);
