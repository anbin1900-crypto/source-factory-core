'use strict';
const assert = require('assert');
const {
  classifyArtifactContent,
  evaluateTechnicalAcceptance,
  collectWaveWithCarryover,
  fetchAllPages,
} = require('./artifact_content_completion_gate.cjs');

const metadataBat = `@echo off
powershell -Command "$items=@(@{Path='w1/RESULT.json'},@{Path='w2/RESULT.json'});foreach($i in $items){Invoke-WebRequest $i.Path};Compress-Archive -Path *.json -DestinationPath output.zip;$meta=@{rollback_required=true}"
`;
const verdict = classifyArtifactContent({ content: metadataBat, sizeBytes: 2652, targetPcAccepted: false });
assert.equal(verdict.BYTE_EXISTS, true);
assert.equal(verdict.METADATA_ONLY_ARCHIVE, true);
assert.equal(verdict.EXECUTABLE_SOURCE_PRESENT, false);
assert.equal(verdict.INSTALL_ACTION_PRESENT, false);
assert.equal(verdict.SMOKE_AND_ROLLBACK_PRESENT, false);
assert.equal(verdict.INSTALLABLE_RUNTIME, false);
assert.equal(verdict.TARGET_PC_ACCEPTED, false);

const acceptance = evaluateTechnicalAcceptance('PASS', verdict);
assert.equal(acceptance.report_state, 'REPORTED');
assert.equal(acceptance.effective_outcome, 'BLOCKED');
assert.equal(acceptance.outcome_override_applied, true);

const rows = [1, 2, 4, 5, 6].map((n) => ({ role: `AUTOMATION-C-W${n}`, resultKey: `K${n}` }));
const comments = rows.map((row, index) => ({ role: row.role, resultKey: row.resultKey, id: 200 + index, outcome: 'PASS' }));
let wave = collectWaveWithCarryover({
  currentRows: rows,
  currentComments: comments,
  carryover: { role: 'AUTOMATION-C-W3', wave: 'V1-C-MODE-6W-WAVE-009', resultKey: '519440526200' },
  carryoverComments: [],
  artifactByRole: { 'AUTOMATION-C-W5': verdict },
});
assert.equal(wave.summary.reported, 5);
assert.equal(wave.summary.missing, 0);
assert.equal(wave.carryover.status, 'ACTIVE_CARRYOVER');
assert.match(wave.commanderOutput, /AUTOMATION-C-W5.*TECHNICAL=ARTIFACT_CONTENT_REJECTED/);
assert.equal(wave.commanderFooter, '작업완료 결과수집 완료');

wave = collectWaveWithCarryover({
  currentRows: rows,
  currentComments: comments.slice(0, 4),
  carryover: { role: 'AUTOMATION-C-W3', wave: 'V1-C-MODE-6W-WAVE-009', resultKey: '519440526200' },
  carryoverComments: [{ role: 'AUTOMATION-C-W3', resultKey: '519440526200', id: 999, outcome: 'PASS' }],
});
assert.equal(wave.summary.missing, 1);
assert.equal(wave.commanderFooter, null);
assert.equal(wave.carryover.attributedWave, 'V1-C-MODE-6W-WAVE-009');
assert.throws(() => collectWaveWithCarryover({ currentRows: rows, currentComments: [comments[0], comments[0]], carryover: { role: 'AUTOMATION-C-W3', resultKey: '519440526200' }, carryoverComments: [] }), /DUPLICATE_RESULT/);

(async () => {
  let calls = 0;
  const fetched = await fetchAllPages(async (page, attempt) => {
    calls += 1;
    if (page === 1 && attempt < 3) throw new Error('TEMPORARY');
    return page === 1 ? { items: [{ id: 1 }, { id: 2 }], has_next: true } : { items: [{ id: 2 }, { id: 3 }], has_next: false };
  }, { restartState: { collectedCommentIds: [1] } });
  assert.equal(calls, 4);
  assert.deepEqual(fetched.items.map((x) => x.id), [2, 3]);
  assert.deepEqual(fetched.restartState.collectedCommentIds, [1, 2, 3]);
  console.log('PASS_21_OF_21');
})().catch((error) => { console.error(error); process.exit(1); });
