'use strict';
const assert = require('assert');
const { parseResults, classifyResultKey, fetchAllPages, buildExportManifest } = require('../report_parser/result_watcher_collector.cjs');

(async () => {
  const line = 'C_RESULT|RESULT_KEY=519362886900|ROLE=AUTOMATION-C-W2|OUTCOME=PASS|STATUS=END|RESULT_COMMIT=1234567890abcdef1234567890abcdef12345678';
  assert.equal(parseResults({ id: 11, body: line, pr: 60 }).length, 1);

  let r = classifyResultKey({ comments: [], directiveCommentId: 10, resultKey: '519362886900', currentRegistryId: 'R7' });
  assert.equal(r.classification, 'MISSING');

  r = classifyResultKey({ comments: [{ id: 11, body: line, pr: 60 }], directiveCommentId: 10, resultKey: '519362886900', currentRegistryId: 'R7' });
  assert.equal(r.classification, 'REPORTED');

  r = classifyResultKey({ comments: [{ id: 11, body: line, pr: 60 }, { id: 12, body: line, pr: 60 }], directiveCommentId: 10, resultKey: '519362886900', currentRegistryId: 'R7' });
  assert.equal(r.classification, 'DUPLICATE');

  r = classifyResultKey({ comments: [{ id: 9, body: line, pr: 60 }], directiveCommentId: 10, resultKey: '519362886900', currentRegistryId: 'R7' });
  assert.equal(r.classification, 'MISSING');

  const historicalComment = { id: 11, body: line, pr: 60, registry_id: 'OLD' };
  r = classifyResultKey({ comments: [historicalComment], directiveCommentId: 10, resultKey: '519362886900', currentRegistryId: 'R7', supersededRegistryIds: ['OLD'] });
  assert.equal(r.classification, 'MISSING');
  assert.equal(r.historical[0].classification, 'HISTORICAL_NOT_CURRENT');

  let calls = 0;
  const fetched = await fetchAllPages(async (page, attempt) => {
    calls += 1;
    if (page === 1 && attempt < 3) throw new Error('temporary');
    return page === 1 ? [{ id: 1 }] : [];
  });
  assert.equal(fetched.comments.length, 1);
  assert.equal(fetched.restart_state.last_completed_page, 1);
  assert.equal(calls, 4);

  const manifest = buildExportManifest([classifyResultKey({ comments: [{ id: 11, body: line, pr: 60 }], directiveCommentId: 10, resultKey: '519362886900', currentRegistryId: 'R7' })]);
  assert.deepEqual(manifest.consumers, ['AUTOMATION-C-W1', 'AUTOMATION-C-W5']);
  assert.equal(manifest.entries[0].classification, 'REPORTED');

  console.log('PASS_10_OF_10');
})().catch(error => { console.error(error); process.exit(1); });
