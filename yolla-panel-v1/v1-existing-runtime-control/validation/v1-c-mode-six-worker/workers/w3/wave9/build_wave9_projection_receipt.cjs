'use strict';
const fs = require('node:fs');
const path = require('node:path');

const LABELS = Object.freeze({
  C_ACTIVE: 'C 실행',
  REPEAT_ACTIVE: '명령 실행',
  CURRENT_REGISTRY_RESULT: '현재 Registry 결과',
  HISTORICAL_REGISTRY_RESULT: '과거 Registry 결과',
  AWAITING: '결과 대기',
  REPORT_MISSING: '미보고',
  DUPLICATE_REPORT: '중복 결과',
  ERROR: '오류',
  END: 'END',
  IDLE: '쉬는 중'
});

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--') || argv[i + 1] == null) throw new Error(`BAD_ARG:${argv[i] || ''}`);
    out[argv[i].slice(2)] = argv[i + 1];
  }
  for (const key of ['bridge','expected','out']) if (!out[key]) throw new Error(`MISSING_ARG:${key}`);
  return out;
}
function deriveCounts(base, projections) {
  return {
    ...base,
    c: projections.filter(x => x.state === 'C_ACTIVE').length,
    command: projections.filter(x => x.state === 'REPEAT_ACTIVE').length
  };
}
function equalObject(actual, expected) {
  return Object.keys(expected).every(key => actual[key] === expected[key]);
}
function buildReceipt(bridgePath, expectedPath) {
  const bridge = require(path.resolve(bridgePath));
  const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
  const scenarios = expected.scenarios.map(scenario => {
    const projected = bridge.project(scenario.entries, scenario.options);
    const counts = deriveCounts(projected.counts, projected.projections);
    const projections = projected.projections.map(item => ({...item, label: LABELS[item.state] || item.state}));
    const labels = projections.map(item => item.label);
    const resultCommentPreferred = projections
      .filter(item => item.result_comment_id)
      .every(item => item.display_result_reference === `RESULT_COMMENT #${item.result_comment_id}`);
    const assertions = {
      counts_match: equalObject(counts, scenario.expected_counts),
      labels_match: JSON.stringify(labels) === JSON.stringify(scenario.expected_labels),
      result_comment_preferred: resultCommentPreferred,
      legacy_a_e_excluded: projections.every(item => item.legacy_profile_status_ignored === true),
      disabled_working_zero: scenario.options.c_enabled || scenario.options.command_enabled || counts.working === 0
    };
    return {name: scenario.name, options: scenario.options, counts, projections, labels, assertions, pass: Object.values(assertions).every(Boolean)};
  });
  return {
    schema_version: 'W3_WAVE9_UI_PROJECTION_RECEIPT_V1',
    control_id: expected.control_id,
    wave_id: expected.wave_id,
    registry_sequence: expected.registry_sequence,
    result_key: expected.result_key,
    target_version: expected.target_version,
    scenarios,
    assertions_all_pass: scenarios.every(s => s.pass),
    live_pass_claimed: false
  };
}
if (require.main === module) {
  const args = parseArgs(process.argv);
  const receipt = buildReceipt(args.bridge, args.expected);
  fs.mkdirSync(path.dirname(path.resolve(args.out)), {recursive: true});
  fs.writeFileSync(args.out, JSON.stringify(receipt, null, 2) + '\n');
  if (!receipt.assertions_all_pass) throw new Error('W3_WAVE9_PROJECTION_ASSERTION_FAILED');
  console.log(`W3_WAVE9_PROJECTION_PASS scenarios=${receipt.scenarios.length}`);
}
module.exports = {LABELS, buildReceipt, deriveCounts};
