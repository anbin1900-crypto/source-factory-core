'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { evaluateLiveness, hasExactResultKey, STATES, ACTIONS } = require('./liveness_state_oracle.cjs');

const fixturePath = path.join(__dirname, 'LIVENESS_STATE_ORACLE_FIXTURES_V1.json');
const fixtureDoc = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
let assertions = 0;

for (const fixture of fixtureDoc.fixtures) {
  const actual = evaluateLiveness(fixture.input);
  for (const [key, expectedValue] of Object.entries(fixture.expected)) {
    assert.equal(actual[key], expectedValue, `${fixture.id}:${key}`);
    assertions += 1;
  }
}

assert.equal(hasExactResultKey('520054321000', ['52005432100', '520054321000']), true); assertions += 1;
assert.equal(hasExactResultKey('520054321000', ['52005432100']), false); assertions += 1;
assert.deepEqual(Object.values(STATES), ['WAITING','WORKING','RESULT_PENDING','COMPLETED','REVIEW_REQUIRED']); assertions += 1;
assert.deepEqual(Object.values(ACTIONS), ['NONE','REFRESH_ONCE','RECHECK_AFTER_30_SECONDS']); assertions += 1;
assert.throws(() => evaluateLiveness({nowMs: 1, referenceAtMs: 2, expectedResultKey: 'x'}), /NOW_BEFORE_REFERENCE/); assertions += 1;
assert.throws(() => evaluateLiveness({nowMs: 2, referenceAtMs: 1, expectedResultKey: 'x', refreshCount: 1}), /REFRESH_TIMESTAMP_REQUIRED/); assertions += 1;
assert.throws(() => evaluateLiveness({nowMs: 2, referenceAtMs: 1, expectedResultKey: 'x', refreshCount: 0, refreshAtMs: 1}), /REFRESH_TIMESTAMP_WITH_ZERO_COUNT/); assertions += 1;

console.log(`PASS_${assertions}_ASSERTIONS`);
