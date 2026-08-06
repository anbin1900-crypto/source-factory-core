'use strict';
const assert = require('node:assert/strict');
const {
  correlateLiveness,
  buildCommanderOutput,
  fetchAllPages,
} = require('../result_watcher/liveness_result_correlation.cjs');

let assertions = 0;
function ok(value, message) { assert.ok(value, message); assertions += 1; }
function eq(actual, expected, message) { assert.equal(actual, expected, message); assertions += 1; }

const expected = {
  control_id: 'V1-C-MODE-6W-VALIDATION-CYCLE-002',
  wave_id: 'V1-C-MODE-6W-WAVE-019',
  result_key: '520054481500',
  role: 'AUTOMATION-C-W2',
  pr: 60,
  directive_comment: 5200544815,
  directive_created_at: '2026-08-06T04:55:39Z',
  base_head_sha: 'base',
};
const terminalBody = [
  'WAVE_ID=V1-C-MODE-6W-WAVE-019',
  'C_RESULT|RESULT_KEY=520054481500|ROLE=AUTOMATION-C-W2|OUTCOME=PASS|STATUS=END|RESULT_COMMIT=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
].join('\n');

{
  const r = correlateLiveness({ expected, comments: [{id:5200600000,pr:60,body:terminalBody}] });
  eq(r.status, 'COMPLETED');
  eq(r.current_result_count, 1);
  eq(r.terminal.result_comment, 5200600000);
  eq(r.worker_fault, false);
}
{
  const r = correlateLiveness({ expected, chat:{generating:true} });
  eq(r.status, 'WORKING');
  ok(r.reasons.includes('CHAT_GENERATING'));
}
{
  const r = correlateLiveness({ expected, local:{status:'RUNNING'} });
  eq(r.status, 'WORKING');
  ok(r.reasons.includes('LOCAL_WORKING'));
}
{
  const r = correlateLiveness({ expected, chat:{status:'SETTLED',updated_at:'2026-08-06T05:00:00Z'}, nowMs:Date.parse('2026-08-06T05:20:00Z') });
  eq(r.status, 'RESULT_PENDING');
  eq(r.fault_attribution, 'NEVER_WORKER_FAULT');
  ok(r.reasons.includes('NO_GITHUB_RESULT_ONLY_NEVER_WORKER_FAULT'));
}
{
  const r = correlateLiveness({ expected, chat:{status:'SETTLED',updated_at:'2026-08-06T05:00:00Z'}, nowMs:Date.parse('2026-08-06T05:40:00Z'), refresh:{count:0} });
  eq(r.status, 'RESULT_PENDING');
}
{
  const r = correlateLiveness({ expected, chat:{status:'SETTLED',updated_at:'2026-08-06T05:00:00Z'}, nowMs:Date.parse('2026-08-06T05:40:00Z'), refresh:{count:1,at:'2026-08-06T05:35:00Z'} });
  eq(r.status, 'REVIEW_REQUIRED');
  ok(r.reasons.includes('30_MIN_NO_ACTIVITY_AFTER_ONE_REFRESH'));
}
{
  const staleBody = [
    'WAVE_ID=V1-C-MODE-6W-WAVE-018',
    'C_RESULT|RESULT_KEY=519889840100|ROLE=AUTOMATION-C-W2|OUTCOME=PASS|STATUS=END|RESULT_COMMIT=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  ].join('\n');
  const r = correlateLiveness({ expected, comments:[{id:5200546000,pr:60,body:staleBody}], chat:{status:'SETTLED'} });
  eq(r.status, 'RESULT_PENDING');
  eq(r.historical_result_count, 1);
  ok(r.reasons.includes('STALE_WAVE_RESULT_REJECTED'));
}
{
  const staleBody = 'WAVE_ID=V1-C-MODE-6W-WAVE-018\nC_RESULT|RESULT_KEY=519889840100|ROLE=AUTOMATION-C-W2|OUTCOME=PASS|STATUS=END|RESULT_COMMIT=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const r = correlateLiveness({ expected, comments:[{id:5200546000,pr:60,body:staleBody},{id:5200600000,pr:60,body:terminalBody}] });
  eq(r.status, 'COMPLETED');
  eq(r.historical_result_count, 1);
  eq(r.current_result_count, 1);
}
{
  const r = correlateLiveness({ expected, comments:[{id:5200600000,pr:60,body:terminalBody},{id:5200600001,pr:60,body:terminalBody}] });
  eq(r.status, 'REVIEW_REQUIRED');
  ok(r.reasons.includes('DUPLICATE_EXACT_RESULT'));
}
{
  const r = correlateLiveness({ expected, pr:{head_sha:'new',updated_at:'2026-08-06T05:10:00Z'}, chat:{status:'SETTLED'}, nowMs:Date.parse('2026-08-06T05:20:00Z') });
  eq(r.activity.head_changed, true);
  eq(r.status, 'RESULT_PENDING');
}
{
  const r = correlateLiveness({ expected, comments:[{id:5200540000,pr:60,body:terminalBody}], chat:{status:'SETTLED'} });
  eq(r.status, 'RESULT_PENDING');
  eq(r.current_result_count, 0);
}
{
  const out = buildCommanderOutput(correlateLiveness({ expected, comments:[{id:5200600000,pr:60,body:terminalBody}] }));
  ok(out.includes('STATUS=COMPLETED'));
  ok(out.includes('RESULT_COMMENT=5200600000'));
  ok(out.includes('WORKER_FAULT=false'));
}

(async () => {
  let attempts = 0;
  const pages = await fetchAllPages(async (page, attempt) => {
    attempts += 1;
    if (page === 1 && attempt < 5) throw new Error('TEMP');
    if (page === 1) return {items:[{id:1},{id:2}],has_next:true};
    return {items:[{id:2},{id:3}],has_next:false};
  });
  eq(attempts, 6);
  eq(pages.items.length, 3);
  eq(pages.restart_state.last_page, 2);
  eq(pages.restart_state.collected_ids.length, 3);

  const resumed = await fetchAllPages(async () => ({items:[{id:3},{id:4}],has_next:false}), {restartState:pages.restart_state});
  eq(resumed.items.length, 1);
  eq(resumed.items[0].id, 4);

  let failed = false;
  try {
    await fetchAllPages(async () => { throw new Error('TEMP'); });
  } catch (error) {
    failed = error.message === 'TEMP';
  }
  eq(failed, true);

  console.log(`PASS_${assertions}_OF_${assertions}`);
})().catch((error) => { console.error(error); process.exit(1); });
