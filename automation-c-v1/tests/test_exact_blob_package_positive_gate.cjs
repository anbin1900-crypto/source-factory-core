'use strict';

const assert = require('assert');
const {
  evaluateExactBlobPackage,
  evaluateReportedExactBlobState,
  collectExactBlobWave,
  fetchAllPagesWithRestart,
} = require('../result_watcher/exact_blob_package_positive_gate.cjs');

let assertions = 0;
function eq(actual, expected, message) { assert.deepStrictEqual(actual, expected, message); assertions += 1; }
function ok(value, message) { assert.ok(value, message); assertions += 1; }
function throws(fn, pattern) { assert.throws(fn, pattern); assertions += 1; }

const members = Array.from({ length: 17 }, (_, index) => ({
  package_path: `automation-c-v1/component-${index + 1}.cjs`,
  blob_sha1: String(index + 1).padStart(40, 'a').slice(-40),
  sha256: String(index + 1).padStart(64, 'b').slice(-64),
  size_bytes: 1000 + index,
}));
const authority = {
  target_version: '5.10.2.4.2-rc6',
  required_member_count: 17,
  members,
  required_runtime_hooks: ['automation-c-v1/component-1.cjs', 'automation-c-v1/component-2.cjs'],
  required_renderer_hooks: ['automation-c-v1/component-16.cjs', 'automation-c-v1/component-17.cjs'],
};
const positive = {
  target_version: '5.10.2.4.2-rc6',
  members: members.map((x) => ({ ...x })),
  baseline_resolver_validated: true,
  baseline_recursive_clone: true,
  target_time_launcher_backup: true,
  runtime_hooks: authority.required_runtime_hooks,
  renderer_hooks: authority.required_renderer_hooks,
  smoke_status: 'PASS',
  smoke_loaded_components: members.map((x) => x.package_path),
  rollback_readback_verified: true,
  preservation_readback_verified: true,
  target_pc_accepted: false,
};

let gate = evaluateExactBlobPackage({ authority, candidate: positive, targetVersion: '5.10.2.4.2-rc6' });
eq(gate.REPORTED, true);
eq(gate.TECHNICALLY_ACCEPTED, true);
eq(gate.INSTALLABLE_RUNTIME, true);
eq(gate.TARGET_PC_PENDING, true);
eq(gate.TARGET_PC_ACCEPTED, false);
eq(gate.TARGET_VERSION_MATCH, true);
eq(gate.FAILED_CHECKS, []);
eq(gate.CHECKS.IMMUTABLE_BLOB_SHA_17_OF_17, true);
eq(gate.CHECKS.EXACT_SOURCE_SHA256_AND_SIZE_17_OF_17, true);
eq(gate.CHECKS.BASELINE_RESOLVER_VALIDATED, true);
eq(gate.CHECKS.BASELINE_RECURSIVE_CLONE, true);
eq(gate.CHECKS.TARGET_TIME_LAUNCHER_BACKUP, true);
eq(gate.CHECKS.RUNTIME_AND_RENDERER_HOOKS_COMPLETE, true);
eq(gate.CHECKS.FULL_COMPONENT_SMOKE, true);
eq(gate.CHECKS.ROLLBACK_AND_PRESERVATION_READBACK, true);

const live = { ...positive, target_pc_accepted: true };
gate = evaluateExactBlobPackage({ authority, candidate: live, targetVersion: '5.10.2.4.2-rc6' });
eq(gate.TECHNICALLY_ACCEPTED, true);
eq(gate.TARGET_PC_PENDING, false);
eq(gate.TARGET_PC_ACCEPTED, true);

const rc5 = {
  target_version: '5.10.2.4.2-rc5',
  members: members.slice(0, 12).map((x, index) => ({ ...x, blob_sha1: 'f'.repeat(40), sha256: 'e'.repeat(64), size_bytes: 100 + index })),
  baseline_resolver_validated: false,
  baseline_recursive_clone: false,
  target_time_launcher_backup: false,
  runtime_hooks: [],
  renderer_hooks: [],
  smoke_status: 'PASS',
  smoke_loaded_components: members.slice(0, 7).map((x) => x.package_path),
  rollback_readback_verified: false,
  preservation_readback_verified: false,
  target_pc_accepted: false,
};
const negative = evaluateReportedExactBlobState({ reportedOutcome: 'PASS', authority, candidate: rc5, targetVersion: '5.10.2.4.2-rc6' });
eq(negative.REPORTED, true);
eq(negative.REPORTED_OUTCOME, 'PASS');
eq(negative.TECHNICALLY_ACCEPTED, false);
eq(negative.INSTALLABLE_RUNTIME, false);
eq(negative.TARGET_PC_ACCEPTED, false);
eq(negative.EFFECTIVE_OUTCOME, 'BLOCKED');
eq(negative.PASS_DOES_NOT_OVERRIDE_TECHNICAL_GATE, true);
ok(negative.FAILED_CHECKS.includes('IMMUTABLE_BLOB_SHA_17_OF_17'));
ok(negative.FAILED_CHECKS.includes('EXACT_SOURCE_SHA256_AND_SIZE_17_OF_17'));
ok(negative.FAILED_CHECKS.includes('BASELINE_RESOLVER_VALIDATED'));
ok(negative.FAILED_CHECKS.includes('BASELINE_RECURSIVE_CLONE'));
ok(negative.FAILED_CHECKS.includes('TARGET_TIME_LAUNCHER_BACKUP'));
ok(negative.FAILED_CHECKS.includes('RUNTIME_AND_RENDERER_HOOKS_COMPLETE'));
ok(negative.FAILED_CHECKS.includes('FULL_COMPONENT_SMOKE'));
ok(negative.FAILED_CHECKS.includes('ROLLBACK_AND_PRESERVATION_READBACK'));
ok(negative.FAILED_CHECKS.includes('TARGET_VERSION_MISMATCH'));

const registry = {
  schema: 'C_MODE_WAVE_V2', control_id: 'C', wave_id: 'W15', registry_sequence: 15,
  workers: [{ role: 'AUTOMATION-C-W5', pr: 63, directive_comment: 100, result_key: '500' }],
};
const comments = [{ id: 101, pr: 63, body: 'C_RESULT|RESULT_KEY=500|ROLE=AUTOMATION-C-W5|OUTCOME=PASS|STATUS=END|RESULT_COMMIT=' + '1'.repeat(40) }];
let wave = collectExactBlobWave({ registry, comments, packageByRole: { 'AUTOMATION-C-W5': positive }, authorityByRole: { 'AUTOMATION-C-W5': authority }, targetVersion: '5.10.2.4.2-rc6' });
eq(wave.reported, 1);
eq(wave.missing, 0);
eq(wave.results[0].technical_state, 'TARGET_PC_PENDING');
ok(wave.commander_output.includes('RESULT_COMMENT=101'));
ok(wave.commander_output.includes('TECHNICAL=TARGET_PC_PENDING'));

wave = collectExactBlobWave({ registry, comments: [], packageByRole: {}, authorityByRole: {}, targetVersion: '5.10.2.4.2-rc6' });
eq(wave.reported, 0);
eq(wave.missing, 1);
eq(wave.results[0].technical_state, 'NOT_EVALUATED');
throws(() => collectExactBlobWave({ registry, comments: [comments[0], { ...comments[0], id: 102 }], packageByRole: {}, authorityByRole: {}, targetVersion: '5.10.2.4.2-rc6' }), /DUPLICATE_RESULT/);

(async () => {
  let calls = 0;
  const fetched = await fetchAllPagesWithRestart(async (page, attempt) => {
    calls += 1;
    if (page === 1 && attempt < 3) throw new Error('TEMP');
    if (page === 1) return { items: [{ id: 1 }, { id: 2 }], has_next: true };
    return { items: [{ id: 2 }, { id: 3 }], has_next: false };
  }, { maxRetries: 5, restartState: { collected_comment_ids: [1] } });
  eq(calls, 4);
  eq(fetched.items.map((x) => x.id), [2, 3]);
  eq(fetched.restart_state.collected_comment_ids, [1, 2, 3]);
  eq(fetched.restart_state.last_page, 2);
  console.log(`PASS_${assertions}_OF_${assertions}`);
})().catch((error) => { console.error(error); process.exit(1); });
