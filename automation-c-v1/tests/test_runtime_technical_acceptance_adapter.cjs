'use strict';
const assert = require('assert');
const { technicalAcceptance, collectRuntimeTechnicalAcceptance, fetchAllPagesWithRestart } = require('../result_watcher/runtime_technical_acceptance_adapter.cjs');

const negative = technicalAcceptance('PASS', {
  byteExists: true,
  sizeBytes: 2652,
  archiveActionPresent: true,
  payloadPaths: ['WAVE7_REGISTRY_AUTHORITY_RESULT_V8.json','C6W2_WAVE7_RESULT_WATCHER_COLLECTOR_RESULT_V1.json','WAVE7_RESULT.json'],
  executableSourcePresent: false,
  installActionPresent: false,
  smokePresent: false,
  rollbackPresent: false,
});
assert.equal(negative.report_state, 'REPORTED');
assert.equal(negative.technical_state, 'METADATA_ONLY_REJECTED');
assert.equal(negative.statuses.INSTALLABLE_RUNTIME, false);
assert.equal(negative.effective_outcome, 'BLOCKED');
assert.equal(negative.pass_does_not_override_gate, true);

const w3Partial = technicalAcceptance('PASS', {
  runtimeFiles: [
    { package_path: 'runtime-files/automation-c-v1/workspace_ui_truth_bridge.cjs' },
    { package_path: 'runtime-files/workspace_c_mode_rc4_truth.css' },
    { package_path: 'runtime-files/workspace_c_mode_rc4_truth.js' },
  ],
  executableSourcePresent: true,
  installActionPresent: false,
  smokePresent: true,
  rollbackPresent: true,
  targetPcAccepted: false,
});
assert.equal(w3Partial.statuses.EXECUTABLE_SOURCE_MISSING, false);
assert.equal(w3Partial.technical_state, 'INSTALL_ACTION_MISSING');
assert.equal(w3Partial.statuses.INSTALLABLE_RUNTIME, false);

const positive = technicalAcceptance('PASS', {
  runtimeFiles: ['runtime-files/c_mode_runtime.cjs', 'install/INSTALL_RC4.ps1', 'test/SMOKE_RC4.cjs', 'rollback/ROLLBACK_RC4.ps1'],
  executableSourcePresent: true,
  installActionPresent: true,
  smokePresent: true,
  rollbackPresent: true,
  targetPcAccepted: false,
});
assert.equal(positive.statuses.TECHNICALLY_ACCEPTED, true);
assert.equal(positive.statuses.INSTALLABLE_RUNTIME, true);
assert.equal(positive.statuses.TARGET_PC_PENDING, true);
assert.equal(positive.effective_outcome, 'PASS');

const accepted = technicalAcceptance('PASS', {
  runtimeFiles: ['runtime-files/c_mode_runtime.cjs'], executableSourcePresent: true,
  installActionPresent: true, smokePresent: true, rollbackPresent: true, targetPcAccepted: true,
});
assert.equal(accepted.technical_state, 'TARGET_PC_ACCEPTED');
assert.equal(accepted.statuses.TARGET_PC_ACCEPTED, true);

const registry = {
  schema: 'C_MODE_WAVE_V2', control_id: 'V1-C-MODE-6W-VALIDATION-CYCLE-002', wave_id: 'V1-C-MODE-6W-WAVE-012', registry_sequence: 12,
  workers: [
    { role: 'AUTOMATION-C-W2', pr: 60, directive_comment: 5195170358, result_key: '519517035800' },
    { role: 'AUTOMATION-C-W5', pr: 63, directive_comment: 5195177693, result_key: '519517769300' },
  ],
};
const comments = [{ id: 5195600001, pr: 60, body: 'C_RESULT|RESULT_KEY=519517035800|ROLE=AUTOMATION-C-W2|OUTCOME=PASS|STATUS=END|RESULT_COMMIT=1111111111111111111111111111111111111111' }];
const collected = collectRuntimeTechnicalAcceptance({
  registry, comments,
  artifactEvidenceByRole: { 'AUTOMATION-C-W2': { runtimeFiles: ['automation-c-v1/result_watcher/runtime_technical_acceptance_adapter.cjs'], executableSourcePresent: true, installActionPresent: true, smokePresent: true, rollbackPresent: true } },
  partialFixtures: [{ fixture_id: 'W3_RC4_UI_PAYLOAD', role: 'AUTOMATION-C-W3', result_comment: 5195394714, result_commit: '40023163e8faf0f918e1fa55d1dae4741a3bb7e7', outcome: 'PASS', evidence: { runtimeFiles: ['runtime-files/workspace_c_mode_rc4_truth.js','runtime-files/workspace_c_mode_rc4_truth.css','runtime-files/automation-c-v1/workspace_ui_truth_bridge.cjs'], executableSourcePresent: true, installActionPresent: false, smokePresent: true, rollbackPresent: true } }],
});
assert.equal(collected.reported, 1);
assert.equal(collected.missing, 1);
assert.equal(collected.results[0].technical_state, 'TARGET_PC_PENDING');
assert.equal(collected.results[1].report_state, 'MISSING');
assert.equal(collected.supplemental[0].technical_acceptance.technical_state, 'INSTALL_ACTION_MISSING');
assert.ok(collected.commander_output.includes('RESULT_COMMENT=5195394714'));

assert.throws(() => collectRuntimeTechnicalAcceptance({ registry, comments: [comments[0], { ...comments[0], id: 5195600002 }] }), /DUPLICATE_RESULT/);

(async () => {
  let calls = 0;
  const fetched = await fetchAllPagesWithRestart(async (page, attempt) => {
    calls += 1;
    if (page === 1 && attempt < 3) throw new Error('TEMP');
    return page === 1 ? { items: [{ id: 1 }, { id: 2 }], has_next: true } : { items: [{ id: 2 }, { id: 3 }], has_next: false };
  }, { restartState: { collected_comment_ids: [1] } });
  assert.equal(calls, 4);
  assert.deepEqual(fetched.items.map(x => x.id), [2,3]);
  assert.deepEqual(fetched.restart_state.collected_comment_ids, [1,2,3]);
  console.log('PASS_24_OF_24');
})().catch((error) => { console.error(error); process.exit(1); });
