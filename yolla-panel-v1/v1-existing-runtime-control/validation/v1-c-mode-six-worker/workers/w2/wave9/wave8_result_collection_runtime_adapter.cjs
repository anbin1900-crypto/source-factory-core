'use strict';

const REPORTED_OUTCOMES = new Set(['PASS', 'BLOCKED', 'FAIL', 'NO_WORK']);
const NEXT_WAVE_TRIGGER = '작업완료 결과수집 완료. 위 결과게시물을 검토하고 다음 WAVE의 워커별 지시를 게시하라.';

function collectWaveResults(registryRows, comments) {
  const byKey = new Map();
  for (const comment of comments) {
    const key = String(comment.result_key || '');
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(comment);
  }

  const results = registryRows.map((row) => {
    const matches = byKey.get(String(row.result_key)) || [];
    if (matches.length === 0) return { ...row, state: 'MISSING', result_comment: null };
    if (matches.length > 1) return { ...row, state: 'DUPLICATE', result_comment: null, matches: matches.map(x => x.id) };
    const item = matches[0];
    if (item.role !== row.role || !REPORTED_OUTCOMES.has(item.outcome)) {
      return { ...row, state: 'INVALID', result_comment: item.id };
    }
    return { ...row, state: 'REPORTED', outcome: item.outcome, result_comment: item.id, result_commit: item.result_commit };
  });

  const counts = results.reduce((acc, item) => {
    acc[item.state] = (acc[item.state] || 0) + 1;
    return acc;
  }, { REPORTED: 0, MISSING: 0, DUPLICATE: 0, INVALID: 0 });

  const commanderOutput = [
    ...results.filter(x => x.state === 'REPORTED').map(x => `${x.role}|RESULT_COMMENT=${x.result_comment}|OUTCOME=${x.outcome}`),
    NEXT_WAVE_TRIGGER,
  ].join('\n');

  return { schema: 'C_MODE_WAVE_RESULT_V1', results, counts, commander_output: commanderOutput };
}

module.exports = { collectWaveResults, NEXT_WAVE_TRIGGER, REPORTED_OUTCOMES };
