'use strict';

const RESULT_RE = /C_RESULT\|RESULT_KEY=(\d+)\|ROLE=([^|\s]+)\|OUTCOME=(PASS|FAIL|BLOCKED|NO_WORK)\|STATUS=END\|RESULT_COMMIT=([0-9a-f]{40}|NONE)/g;
const WAVE_RE = /\bWAVE_ID\s*=\s*([^\s`|]+)/;
const DEFAULT_INACTIVITY_MS = 30 * 60 * 1000;

function asMs(value) {
  if (value === null || value === undefined || value === '') return null;
  if (Number.isFinite(value)) return Number(value);
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function maxMs(values) {
  const valid = values.map(asMs).filter(Number.isFinite);
  return valid.length ? Math.max(...valid) : null;
}

function normalizeComment(comment) {
  return {
    id: Number(comment?.id || 0),
    pr: Number(comment?.pr || 0),
    body: String(comment?.body || ''),
    created_at: comment?.created_at || null,
    updated_at: comment?.updated_at || null,
  };
}

function parseResultComments(comments = []) {
  const parsed = [];
  for (const raw of comments.map(normalizeComment)) {
    RESULT_RE.lastIndex = 0;
    let match;
    while ((match = RESULT_RE.exec(raw.body)) !== null) {
      const wave = raw.body.match(WAVE_RE);
      parsed.push({
        result_key: match[1],
        role: match[2],
        outcome: match[3],
        result_commit: match[4],
        result_comment: raw.id,
        pr: raw.pr,
        wave_id: wave ? wave[1] : null,
        created_at: raw.created_at,
        updated_at: raw.updated_at,
      });
    }
  }
  return parsed.sort((a, b) => a.result_comment - b.result_comment);
}

function resultMatchesScope(result, expected) {
  if (result.role !== expected.role) return false;
  if (expected.pr && result.pr && result.pr !== Number(expected.pr)) return false;
  if (result.result_comment <= Number(expected.directive_comment || 0)) return false;
  return true;
}

function classifyResults(results, expected) {
  const scoped = results.filter((item) => resultMatchesScope(item, expected));
  const exact = scoped.filter((item) => item.result_key === String(expected.result_key));
  const current = exact.filter((item) => !item.wave_id || item.wave_id === expected.wave_id);
  const stale = scoped.filter((item) =>
    item.result_key !== String(expected.result_key) ||
    (item.wave_id && item.wave_id !== expected.wave_id));
  return { scoped, exact, current, stale };
}

function activitySnapshot({ chat = {}, pr = {}, local = {}, expected = {}, nowMs = Date.now() }) {
  const lastActivityMs = maxMs([
    chat.last_activity_at,
    chat.updated_at,
    pr.head_updated_at,
    pr.updated_at,
    local.last_activity_at,
    local.updated_at,
    expected.directive_created_at,
  ]);
  const idleMs = lastActivityMs === null ? null : Math.max(0, Number(nowMs) - lastActivityMs);
  const headChanged = Boolean(expected.base_head_sha && pr.head_sha && expected.base_head_sha !== pr.head_sha);
  return {
    last_activity_ms: lastActivityMs,
    idle_ms: idleMs,
    head_changed: headChanged,
    chat_generating: chat.generating === true || chat.status === 'GENERATING',
    local_working: local.working === true || ['RUNNING', 'WORKING', 'GENERATING'].includes(local.status),
  };
}

function correlateLiveness({
  expected,
  comments = [],
  chat = {},
  pr = {},
  local = {},
  refresh = {},
  nowMs = Date.now(),
  inactivityMs = DEFAULT_INACTIVITY_MS,
} = {}) {
  if (!expected || !expected.result_key || !expected.role || !expected.wave_id) {
    throw new Error('EXPECTED_SCOPE_REQUIRED');
  }

  const results = parseResultComments(comments);
  const classified = classifyResults(results, expected);
  const activity = activitySnapshot({ chat, pr, local, expected, nowMs });
  const exactCount = classified.current.length;
  const refreshedAfterActivity = Number(refresh.count || 0) >= 1 &&
    (activity.last_activity_ms === null || (asMs(refresh.at) ?? asMs(refresh.at_ms) ?? -Infinity) >= activity.last_activity_ms);

  let status;
  const reasons = [];
  if (exactCount === 1) {
    status = 'COMPLETED';
    reasons.push('EXACT_RESULT_KEY_TERMINAL');
  } else if (exactCount > 1) {
    status = 'REVIEW_REQUIRED';
    reasons.push('DUPLICATE_EXACT_RESULT');
  } else if (activity.chat_generating || activity.local_working) {
    status = 'WORKING';
    reasons.push(activity.chat_generating ? 'CHAT_GENERATING' : 'LOCAL_WORKING');
  } else if (activity.idle_ms !== null && activity.idle_ms >= inactivityMs && refreshedAfterActivity) {
    status = 'REVIEW_REQUIRED';
    reasons.push('30_MIN_NO_ACTIVITY_AFTER_ONE_REFRESH');
  } else {
    status = 'RESULT_PENDING';
    reasons.push('CHAT_SETTLED_AND_NO_TERMINAL');
  }

  if (classified.stale.length) reasons.push('STALE_WAVE_RESULT_REJECTED');
  if (exactCount === 0) reasons.push('NO_GITHUB_RESULT_ONLY_NEVER_WORKER_FAULT');

  const terminal = exactCount === 1 ? classified.current[0] : null;
  return {
    schema_version: 'C_MODE_LIVENESS_RESULT_CORRELATION_V1',
    control_id: expected.control_id || null,
    wave_id: expected.wave_id,
    result_key: String(expected.result_key),
    role: expected.role,
    status,
    worker_fault: false,
    fault_attribution: exactCount === 0 ? 'NEVER_WORKER_FAULT' : 'NOT_APPLICABLE',
    terminal,
    current_result_count: exactCount,
    historical_result_count: classified.stale.length,
    stale_results_rejected: classified.stale,
    activity,
    refresh: {
      count: Number(refresh.count || 0),
      at_ms: asMs(refresh.at) ?? asMs(refresh.at_ms),
      refreshed_after_activity: refreshedAfterActivity,
    },
    reasons,
    current_wave_priority: true,
  };
}

function buildCommanderOutput(result) {
  return [
    `ROLE=${result.role}`,
    `WAVE=${result.wave_id}`,
    `RESULT_KEY=${result.result_key}`,
    `STATUS=${result.status}`,
    `RESULT_COMMENT=${result.terminal?.result_comment || 'MISSING'}`,
    `WORKER_FAULT=${result.worker_fault}`,
    `FAULT_ATTRIBUTION=${result.fault_attribution}`,
    `STALE_REJECTED=${result.historical_result_count}`,
    `HEAD_CHANGED=${result.activity.head_changed}`,
    `LAST_ACTIVITY_MS=${result.activity.last_activity_ms ?? 'UNKNOWN'}`,
  ].join('|');
}

async function fetchAllPages(fetchPage, { maxRetries = 5, startPage = 1, restartState = null } = {}) {
  if (typeof fetchPage !== 'function') throw new Error('FETCH_PAGE_REQUIRED');
  const items = [];
  const seen = new Set(restartState?.collected_ids || []);
  let lastPage = startPage - 1;
  for (let page = startPage; ; page += 1) {
    let response;
    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      try {
        response = await fetchPage(page, attempt);
        if (!response || !Array.isArray(response.items)) throw new Error('MALFORMED_PAGE');
        break;
      } catch (error) {
        if (attempt === maxRetries) throw error;
      }
    }
    for (const item of response.items) {
      const id = Number(item.id);
      if (seen.has(id)) continue;
      seen.add(id);
      items.push(item);
    }
    lastPage = page;
    if (!response.has_next) break;
  }
  return {
    items,
    restart_state: {
      schema_version: 'C_MODE_LIVENESS_RESULT_CORRELATION_RESTART_V1',
      last_page: lastPage,
      collected_ids: [...seen],
    },
  };
}

module.exports = {
  DEFAULT_INACTIVITY_MS,
  parseResultComments,
  classifyResults,
  correlateLiveness,
  buildCommanderOutput,
  fetchAllPages,
};
