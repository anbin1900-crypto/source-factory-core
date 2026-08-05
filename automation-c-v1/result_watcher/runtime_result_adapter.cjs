'use strict';

const RESULT_RE = /^C_RESULT\|RESULT_KEY=(\d+)\|ROLE=(AUTOMATION-C-W[1-6])\|OUTCOME=(PASS|FAIL|BLOCKED|NO_WORK)\|STATUS=END\|RESULT_COMMIT=([0-9a-f]{40}|NONE)$/m;

function parseResultComment(comment) {
  const match = String(comment.body || '').match(RESULT_RE);
  if (!match) return null;
  return {
    result_key: match[1],
    role: match[2],
    outcome: match[3],
    status: 'END',
    result_commit: match[4],
    result_comment: Number(comment.id),
    pr: Number(comment.pr),
    created_at: comment.created_at || null
  };
}

function collectWaveResults({ registry, comments }) {
  if (!registry || registry.schema !== 'C_MODE_WAVE_V2') throw new Error('INVALID_REGISTRY');
  const rows = registry.workers || [];
  const parsed = comments.map(parseResultComment).filter(Boolean);
  const results = [];
  for (const row of rows) {
    const matches = parsed.filter((x) => x.result_key === String(row.result_key) && x.role === row.role && x.pr === row.pr && x.result_comment > row.directive_comment);
    if (matches.length === 0) results.push({ ...row, report_state: 'MISSING', result_comment: null });
    else if (matches.length > 1) results.push({ ...row, report_state: 'DUPLICATE', result_comments: matches.map((x) => x.result_comment) });
    else results.push({ ...row, ...matches[0], report_state: 'REPORTED' });
  }
  return {
    schema: 'C_MODE_WAVE_RESULT_V1',
    control_id: registry.control_id,
    wave_id: registry.wave_id,
    registry_comment: registry.registry_comment,
    reported: results.filter((x) => x.report_state === 'REPORTED').length,
    missing: results.filter((x) => x.report_state === 'MISSING').length,
    duplicate: results.filter((x) => x.report_state === 'DUPLICATE').length,
    results
  };
}

async function fetchAllPages(fetchPage, { maxRetries = 5, startPage = 1 } = {}) {
  const all = [];
  for (let page = startPage; ; page += 1) {
    let response;
    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      try { response = await fetchPage(page); break; } catch (error) { if (attempt === maxRetries) throw error; }
    }
    const items = response.items || [];
    all.push(...items);
    if (!response.has_next) break;
  }
  return all;
}

function exportRestartState(waveResult) {
  return { schema: 'C_MODE_RESULT_WATCHER_RESTART_V1', registry_comment: waveResult.registry_comment, wave_id: waveResult.wave_id, collected_comment_ids: waveResult.results.filter((x) => x.result_comment).map((x) => x.result_comment) };
}

module.exports = { parseResultComment, collectWaveResults, fetchAllPages, exportRestartState };
