'use strict';
const assert = require('node:assert/strict');
const { parsePanelReports, correlateReports } = require('../report_parser/index.cjs');
const { collectIssueComments, evaluateGithubReports } = require('../github_comment_client.cjs');

const E = { role: 'AUTOMATION-C-W2', wave: 'WAVE-1', command_id: 'CMD-2' };
const panel = () => 'PANEL | ROLE=AUTOMATION-C-W2 | WAVE=WAVE-1 | COMMAND_ID=CMD-2 | STATUS=REPORTED';
const c = (id, body, created_at = '2026-08-05T08:00:00Z') => ({ id, post_id: id, body, created_at });

(async () => {
  assert.equal(parsePanelReports(panel(), { id: 11 }).length, 1);
  assert.deepEqual(correlateReports([c(1, panel())], E).post_ids, [1]);
  assert.equal(correlateReports([c(1, panel().replace('AUTOMATION-C-W2', 'AUTOMATION-C-W1'))], E).accepted.length, 0);
  assert.equal(correlateReports([c(1, panel().replace('WAVE-1', 'WAVE-0'))], E).rejected[0].reasons.includes('WAVE_MISMATCH'), true);
  assert.equal(correlateReports([c(1, panel().replace('CMD-2', 'OLD'))], E).rejected[0].reasons.includes('COMMAND_ID_MISMATCH'), true);
  assert.equal(correlateReports([c(1, panel(), '2026-08-05T07:00:00Z')], E, { not_before: '2026-08-05T07:30:00Z' }).rejected[0].reasons.includes('STALE_REPORT'), true);
  const dup = correlateReports([c(1, panel(), '2026-08-05T08:00:00Z'), c(2, panel(), '2026-08-05T08:01:00Z')], E);
  assert.equal(dup.accepted.length, 1); assert.equal(dup.post_ids[0], 2);
  assert.equal(correlateReports([c(1, 'PANEL | ROLE=AUTOMATION-C-W2 | STATUS=REPORTED')], E).accepted.length, 0);
  assert.deepEqual(correlateReports([], E, { expected_roles: ['AUTOMATION-C-W2', 'AUTOMATION-C-W3'] }).missing_roles, ['AUTOMATION-C-W2', 'AUTOMATION-C-W3']);
  const pages = { 1: [c(1, panel()), c(2, 'noise')], 2: [c(3, panel().replace('STATUS=REPORTED', 'STATUS=END'))] };
  const got = await collectIssueComments(async ({ page }) => pages[page] || [], { per_page: 2 });
  assert.equal(got.length, 3);
  let tries = 0;
  const retry = await collectIssueComments(async () => { tries += 1; if (tries < 3) throw new Error('temporary'); return []; }, { max_attempts: 5 });
  assert.deepEqual(retry, []); assert.equal(tries, 3);
  const result = await evaluateGithubReports(async () => [c(9, panel())], E, { per_page: 100, expected_roles: ['AUTOMATION-C-W2'] });
  assert.equal(result.missing_count, 0); assert.deepEqual(result.post_ids, [9]);
  await assert.rejects(() => collectIssueComments(async () => ({ bad: true }), { max_attempts: 2 }), /MALFORMED_GITHUB_PAGE/);
  console.log('PASS 12/12 github report correlation tests');
})().catch((error) => { console.error(error); process.exit(1); });
