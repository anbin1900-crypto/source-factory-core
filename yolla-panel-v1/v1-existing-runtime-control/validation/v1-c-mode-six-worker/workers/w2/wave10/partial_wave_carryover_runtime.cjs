'use strict';

const REPORTED_OUTCOMES = new Set(['PASS','BLOCKED','FAIL','NO_WORK']);

function collectPartialWave({ currentRows, currentComments, carryover, carryoverComments }) {
  const byKey = new Map();
  for (const comment of currentComments || []) {
    if (!REPORTED_OUTCOMES.has(comment.outcome)) continue;
    const key = `${comment.role}:${comment.resultKey}`;
    if (byKey.has(key)) throw new Error('DUPLICATE_RESULT');
    byKey.set(key, comment);
  }
  const current = currentRows.map((row) => {
    const hit = byKey.get(`${row.role}:${row.resultKey}`);
    return hit ? { ...row, status: 'REPORTED', resultComment: hit.id, outcome: hit.outcome }
      : { ...row, status: 'MISSING', resultComment: null, outcome: null };
  });

  const carryMatches = (carryoverComments || []).filter((x) =>
    x.role === carryover.role && x.resultKey === carryover.resultKey && REPORTED_OUTCOMES.has(x.outcome));
  if (carryMatches.length > 1) throw new Error('DUPLICATE_CARRYOVER_RESULT');
  const carry = carryMatches.length === 1
    ? { ...carryover, status: 'REPORTED', resultComment: carryMatches[0].id, outcome: carryMatches[0].outcome }
    : { ...carryover, status: 'ACTIVE_CARRYOVER', resultComment: null, outcome: null };

  const reported = current.filter((x) => x.status === 'REPORTED').length;
  const complete = reported === currentRows.length;
  return {
    schema: 'C_MODE_PARTIAL_WAVE_RESULT_V1',
    current,
    carryover: carry,
    summary: { expected: currentRows.length, reported, missing: currentRows.length - reported, duplicate: 0 },
    commanderFooter: complete ? '작업완료 결과수집 완료' : null,
  };
}

module.exports = { collectPartialWave };
