'use strict';
const assert = require('assert');
const { evaluateReportCompleteness, buildLedger, discoverPending } = require('../report_parser/report_completeness_gate.cjs');
let passed = 0;
function test(name, fn) { fn(); passed += 1; }
const d = (o = {}) => ({ role: 'AUTOMATION-C-W2', wave: 'W3', command_id: 'CMD', post_id: 10, order: 10, ...o });
const r = (o = {}) => ({ commit: 'abc', order: 11, ...o });
const t = (o = {}) => ({ role: 'AUTOMATION-C-W2', command_id: 'CMD', result_commit: 'abc', post_id: 12, order: 12, ...o });

test('result only is report missing', () => assert.equal(evaluateReportCompleteness({ directive: d(), result: r() }).status, 'REPORT_MISSING'));
test('terminal only is incomplete', () => assert.equal(evaluateReportCompleteness({ directive: d(), terminal: t() }).status, 'REPORT_INCOMPLETE'));
test('exact triplet reported', () => assert.equal(evaluateReportCompleteness({ directive: d(), result: r(), terminal: t() }).status, 'REPORTED'));
test('commit mismatch rejected', () => assert.ok(evaluateReportCompleteness({ directive: d(), result: r(), terminal: t({ result_commit: 'bad' }) }).reasons.includes('RESULT_COMMIT_MISMATCH')));
test('older terminal rejected', () => assert.ok(evaluateReportCompleteness({ directive: d(), result: r(), terminal: t({ post_id: 9 }) }).reasons.includes('TERMINAL_NOT_NEWER_THAN_DIRECTIVE')));
test('wrong command rejected', () => assert.ok(evaluateReportCompleteness({ directive: d(), result: r(), terminal: t({ command_id: 'OLD' }) }).reasons.includes('COMMAND_ID_MISMATCH')));
test('no pending cannot hide latest directive', () => assert.equal(discoverPending([{ directive: d({ command_id: 'NEW', post_id: 20, order: 20 }), result: null, terminal: { role: 'AUTOMATION-C-W2', command_id: 'OLD', result_commit: 'old', post_id: 21, order: 21 } }]).length, 1));
test('consecutive missing increments', () => { const ledger = buildLedger([{ directive: d({ command_id: 'A', order: 1, post_id: 1 }) }, { directive: d({ command_id: 'B', order: 2, post_id: 2 }) }]); assert.deepEqual(ledger.map((x) => x.consecutive_missing_count), [1, 2]); });
test('reported resets missing count', () => { const ledger = buildLedger([{ directive: d({ command_id: 'A', order: 1, post_id: 1 }) }, { directive: d({ command_id: 'CMD', order: 10, post_id: 10 }), result: r(), terminal: t() }]); assert.equal(ledger[1].consecutive_missing_count, 0); });
test('terminal order follows result', () => assert.ok(evaluateReportCompleteness({ directive: d(), result: r({ order: 13 }), terminal: t({ order: 12 }) }).reasons.includes('TERMINAL_NOT_AFTER_RESULT')));
test('role mismatch rejected', () => assert.ok(evaluateReportCompleteness({ directive: d(), result: r(), terminal: t({ role: 'AUTOMATION-C-W6' }) }).reasons.includes('ROLE_MISMATCH')));
test('W2 correction receipt is reported', () => assert.equal(evaluateReportCompleteness({ directive: d({ command_id: 'C6W-W3-W2-LIVE-LEDGER-DIRECTIVE-DISCOVERY', post_id: 5191921150, order: 1 }), result: r({ commit: 'e7fa30621f6d99d28f9c63e25833da6fc1e12619', order: 2 }), terminal: t({ command_id: 'C6W-W3-W2-LIVE-LEDGER-DIRECTIVE-DISCOVERY', result_commit: 'e7fa30621f6d99d28f9c63e25833da6fc1e12619', post_id: 5192450954, order: 3 }) }).status, 'REPORTED'));
console.log(`PASS_${passed}_OF_${passed}`);
