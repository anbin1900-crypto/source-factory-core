'use strict';

const RESULT_RE = /C_RESULT\|RESULT_KEY=(\d+)\|ROLE=([^|\s]+)\|OUTCOME=(PASS|FAIL|BLOCKED|NO_WORK)\|STATUS=END\|RESULT_COMMIT=([0-9a-f]{40}|NONE)/g;

function normalizeComment(c) {
  return { id: Number(c.id), body: String(c.body || ''), created_at: c.created_at || null, pr: Number(c.pr || 0), registry_id: c.registry_id || null };
}

function parseResults(comment) {
  const out = [];
  RESULT_RE.lastIndex = 0;
  let m;
  while ((m = RESULT_RE.exec(comment.body)) !== null) {
    out.push({
      result_key: m[1], role: m[2], outcome: m[3], status: 'END', result_commit: m[4],
      result_comment: comment.id, pr: comment.pr, created_at: comment.created_at, registry_id: comment.registry_id || null
    });
  }
  return out;
}

function classifyResultKey({ comments, directiveCommentId, resultKey, currentRegistryId, supersededRegistryIds = [] }) {
  const normalized = comments.map(normalizeComment).sort((a, b) => a.id - b.id);
  const incremental = normalized.filter(c => c.id > Number(directiveCommentId));
  const matches = incremental.flatMap(parseResults).filter(r => r.result_key === String(resultKey));
  const current = matches.filter(r => !supersededRegistryIds.includes(r.registry_id));
  const historical = matches.filter(r => supersededRegistryIds.includes(r.registry_id));
  const count = current.length;
  return {
    schema: 'C_MODE_WAVE_RESULT_V1', result_key: String(resultKey), directive_comment: Number(directiveCommentId),
    current_registry_id: currentRegistryId, classification: count === 0 ? 'MISSING' : count === 1 ? 'REPORTED' : 'DUPLICATE',
    count, result_comments: current.map(r => r.result_comment), records: current,
    historical: historical.map(r => ({ ...r, classification: 'HISTORICAL_NOT_CURRENT' }))
  };
}

async function fetchAllPages(fetchPage, { maxRetries = 5, startPage = 1 } = {}) {
  const all = [];
  let page = startPage;
  while (true) {
    let rows;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try { rows = await fetchPage(page, attempt); break; }
      catch (error) { if (attempt === maxRetries) throw error; }
    }
    if (!Array.isArray(rows) || rows.length === 0) break;
    all.push(...rows);
    page += 1;
  }
  return { comments: all, next_page: page, restart_state: { last_completed_page: page - 1 } };
}

function buildExportManifest(entries) {
  return {
    schema: 'C_MODE_WAVE_RESULT_EXPORT_V1', generated_at: new Date(0).toISOString(),
    consumers: ['AUTOMATION-C-W1', 'AUTOMATION-C-W5'],
    entries: entries.map(e => ({ result_key: e.result_key, classification: e.classification, count: e.count,
      result_comments: e.result_comments, result_commit: e.records?.[0]?.result_commit || 'NONE' }))
  };
}

module.exports = { parseResults, classifyResultKey, fetchAllPages, buildExportManifest };
