'use strict';

/**
 * Source Factory Stage 4 RED fix request generator.
 *
 * Converts RED output records into compact Worker hotfix prompts.
 * This module only builds request objects/text and never applies patches,
 * writes files, edits existing project files, or performs routing side effects.
 */

const DEFAULT_TARGET_STAGE = 'STAGE4_CLASSIFIER_VALIDATION_PANEL_AUTOMATION';
const DEFAULT_ROUTE = 'WORKER_INBOX';
const RED_FIX_TEMPLATE_VERSION = 'ST4_RED_FIX_REQUEST_v1';

const DEFAULT_CAUSE = '문법오류, 구조오류, 결합실패 중 하나로 인해 현재 결합이 차단되었습니다.';
const DEFAULT_FIX = '문제를 일으킨 최소 범위만 수정하여 다시 제출하십시오.';
const DEFAULT_RESUBMIT_SCOPE = 'RED로 지정된 최소 파일 또는 최소 SOURCE_FILE 블록만 재출력하십시오.';

const EFFICIENCY_ALLOWED_TERMS = [
  'syntax_error',
  'parse_error',
  'json_parse_error',
  'module_export_mismatch',
  'missing_export',
  'missing_required_field',
  'source_file_format_error',
  'worker_report_missing',
  'api_ipc_button_mismatch',
  'combination_failure',
  'structure_error',
  'unexpected token',
  'unterminated',
  'missing',
  'mismatch',
  'undefined',
  'escape',
  'regex',
  'template literal',
  'backtick',
  '문법오류',
  '파싱오류',
  'JSON 파싱오류',
  '구조오류',
  '결합실패',
  '필수 필드 누락',
  'SOURCE_FILE 형식 오류',
  'WORKER_REPORT 누락',
  'export 누락',
  'API IPC Button 불일치'
];

function generateRedFixRequest(input, options) {
  const normalizedOptions = normalizeOptions(options);
  const item = normalizeRedItem(input, normalizedOptions);
  const prompt = buildRedFixPrompt(item, normalizedOptions);

  return {
    requestType: 'RED_FIX_REQUIRED',
    templateVersion: RED_FIX_TEMPLATE_VERSION,
    route: resolveRoute(item, normalizedOptions),
    target: {
      worker_id: item.worker_id,
      task_id: item.task_id,
      target_stage: item.target_stage,
      path: item.path,
      resubmit_scope: item.resubmit_scope
    },
    prompt,
    compact: true,
    longAuditReport: false,
    applyWrites: false,
    createdBy: normalizedOptions.createdBy,
    createdAt: normalizedOptions.createdAt || new Date().toISOString()
  };
}

function generateBatchRedFixRequests(inputs, options) {
  const normalizedOptions = normalizeOptions(options);
  const items = collectRedItems(inputs);
  const requests = items.map(function mapRedItem(item) {
    return generateRedFixRequest(item, normalizedOptions);
  });

  return {
    batchType: 'BATCH_RED_FIX_REQUESTS',
    templateVersion: RED_FIX_TEMPLATE_VERSION,
    route: DEFAULT_ROUTE,
    totalRequests: requests.length,
    requests,
    summary: summarizeBatchRequests(requests),
    compact: true,
    longAuditReport: false,
    applyWrites: false,
    createdBy: normalizedOptions.createdBy,
    createdAt: normalizedOptions.createdAt || new Date().toISOString()
  };
}

function buildRedFixPrompt(item, options) {
  const lines = [
    `${item.worker_id} RED_FIX_REQUIRED`,
    `task_id: ${item.task_id || 'UNKNOWN_TASK'}`,
    '',
    `문제: ${item.cause}`,
    '',
    `수정 지시: ${item.fix}`,
    '',
    `재출력 범위: ${item.resubmit_scope}`,
    '',
    '필수 조건:',
    '1. 지정된 최소 범위만 재출력한다.',
    '2. 기존 정상 산출물은 다시 출력하지 않는다.',
    '3. SOURCE_FILE 블록 구조를 유지한다.',
    '4. 생략, placeholder, “나머지는 동일”을 쓰지 않는다.',
    '5. 실제 실행하지 않은 검증을 PASS라고 쓰지 않는다.',
    '6. WORKER_REPORT의 tests_run / tests_not_run을 정직하게 적는다.',
    '7. 수정 목적은 문법오류, 결합실패, 시간지연 감소에 한정한다.'
  ];

  if (item.path) {
    lines.splice(7, 0, `대상 경로: ${item.path}`, '');
  }

  const body = lines.join('\n');

  if (options.includeCopyMarkers === true) {
    return [
      `===== COPY_PROMPT_START ${item.request_id} =====`,
      body,
      `===== COPY_PROMPT_END ${item.request_id} =====`
    ].join('\n');
  }

  return body;
}

function normalizeRedItem(input, options) {
  const source = isPlainObject(input) ? input : { cause: input };

  const workerId = normalizeWorkerId(firstNonEmpty([
    source.worker_id,
    source.workerId,
    source.owner_worker,
    source.ownerWorker,
    source.worker,
    options.defaultWorkerId
  ]));

  const taskId = toTrimmedString(firstNonEmpty([
    source.task_id,
    source.taskId,
    source.task,
    options.defaultTaskId
  ]));

  const path = toTrimmedString(firstNonEmpty([
    source.path,
    source.filePath,
    source.file_path,
    source.targetPath,
    source.target_path,
    source.resubmit_path,
    source.resubmitPath
  ]));

  const targetStage = toTrimmedString(firstNonEmpty([
    source.target_stage,
    source.targetStage,
    options.targetStage
  ]));

  const cause = normalizeCause(firstNonEmpty([
    source.cause,
    source.problem,
    source.error,
    source.reason,
    source.red_reason,
    source.redReason
  ]));

  const fix = normalizeFix(firstNonEmpty([
    source.fix,
    source.fix_instruction,
    source.fixInstruction,
    source.instruction,
    source.required_fix,
    source.requiredFix
  ]));

  const resubmitScope = normalizeResubmitScope(firstNonEmpty([
    source.resubmit_scope,
    source.resubmitScope,
    source.scope,
    source.minimum_scope,
    source.minimumScope,
    path
  ]));

  const requestId = buildRequestId({
    worker_id: workerId,
    task_id: taskId,
    path,
    cause
  });

  return {
    request_id: requestId,
    worker_id: workerId,
    task_id: taskId,
    target_stage: targetStage,
    path,
    cause,
    fix,
    resubmit_scope: resubmitScope,
    route: toTrimmedString(firstNonEmpty([
      source.route,
      source.panelRoute,
      source.panel_route,
      options.route,
      DEFAULT_ROUTE
    ])).toUpperCase()
  };
}

function collectRedItems(inputs) {
  if (!inputs) {
    return [];
  }

  if (Array.isArray(inputs)) {
    return inputs;
  }

  if (!isPlainObject(inputs)) {
    return [inputs];
  }

  const candidateKeys = [
    'redItems',
    'red_items',
    'blockedRed',
    'blocked_red',
    'items',
    'outputs',
    'candidates',
    'errors'
  ];

  for (const key of candidateKeys) {
    if (Array.isArray(inputs[key])) {
      return inputs[key];
    }
  }

  return [inputs];
}

function summarizeBatchRequests(requests) {
  const byWorker = {};
  const byTask = {};
  const resubmitScopes = [];

  for (const request of requests) {
    const target = request && request.target ? request.target : {};
    const workerId = toTrimmedString(target.worker_id);
    const taskId = toTrimmedString(target.task_id);
    const scope = toTrimmedString(target.resubmit_scope);

    if (workerId) {
      byWorker[workerId] = (byWorker[workerId] || 0) + 1;
    }

    if (taskId) {
      byTask[taskId] = (byTask[taskId] || 0) + 1;
    }

    if (scope) {
      resubmitScopes.push(scope);
    }
  }

  return {
    total: requests.length,
    byWorker,
    byTask,
    resubmitScopes: uniqueStrings(resubmitScopes),
    nextRecommendedAction: requests.length > 0 ? 'SEND_HOTFIX_PROMPTS_TO_WORKERS' : 'NO_RED_FIX_REQUESTS'
  };
}

function normalizeOptions(options) {
  const input = isPlainObject(options) ? options : {};

  return {
    targetStage: toTrimmedString(input.targetStage || input.target_stage || DEFAULT_TARGET_STAGE),
    createdBy: toTrimmedString(input.createdBy || input.created_by || 'WORKER_07'),
    createdAt: toTrimmedString(input.createdAt || input.created_at || ''),
    route: toTrimmedString(input.route || input.panelRoute || input.panel_route || DEFAULT_ROUTE),
    defaultWorkerId: toTrimmedString(input.defaultWorkerId || input.default_worker_id || 'WORKER_XX'),
    defaultTaskId: toTrimmedString(input.defaultTaskId || input.default_task_id || ''),
    includeCopyMarkers: input.includeCopyMarkers === true
  };
}

function normalizeWorkerId(value) {
  const text = toTrimmedString(value).toUpperCase();

  if (!text) {
    return 'WORKER_XX';
  }

  if (/^WORKER_\d{2}$/.test(text)) {
    return text;
  }

  if (/^\d+$/.test(text)) {
    return `WORKER_${text.padStart(2, '0')}`;
  }

  return text;
}

function normalizeCause(value) {
  const text = normalizeEfficiencyText(value, DEFAULT_CAUSE, 240);
  return text || DEFAULT_CAUSE;
}

function normalizeFix(value) {
  const text = normalizeEfficiencyText(value, DEFAULT_FIX, 320);
  return text || DEFAULT_FIX;
}

function normalizeResubmitScope(value) {
  const text = collapseWhitespace(value);

  if (!text) {
    return DEFAULT_RESUBMIT_SCOPE;
  }

  return limitText(text, 260) || DEFAULT_RESUBMIT_SCOPE;
}

function normalizeEfficiencyText(value, fallback, maxLength) {
  const text = collapseWhitespace(value);

  if (!text) {
    return fallback;
  }

  if (containsEfficiencyAllowedTerm(text)) {
    return limitText(text, maxLength);
  }

  return fallback;
}

function containsEfficiencyAllowedTerm(value) {
  const lower = toTrimmedString(value).toLowerCase();

  for (const term of EFFICIENCY_ALLOWED_TERMS) {
    if (lower.indexOf(toTrimmedString(term).toLowerCase()) !== -1) {
      return true;
    }
  }

  return false;
}

function resolveRoute(item, options) {
  const route = toTrimmedString(item.route || options.route || DEFAULT_ROUTE).toUpperCase();

  if (route === 'PANEL_COMMAND' || route === 'COMMANDER_QUEUE') {
    return DEFAULT_ROUTE;
  }

  return route || DEFAULT_ROUTE;
}

function buildRequestId(parts) {
  const seed = [
    parts.worker_id,
    parts.task_id,
    parts.path,
    parts.cause
  ].map(toTrimmedString).join('|');

  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(index);
    hash |= 0;
  }

  return `red_fix_${Math.abs(hash).toString(36)}`;
}

function firstNonEmpty(values) {
  for (const value of values) {
    if (value === 0) {
      return value;
    }

    if (typeof value === 'string' && value.trim() !== '') {
      return value;
    }

    if (value !== null && value !== undefined && typeof value !== 'string') {
      return value;
    }
  }

  return '';
}

function toTrimmedString(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function collapseWhitespace(value) {
  return toTrimmedString(value).replace(/\s+/g, ' ');
}

function limitText(value, maxLength) {
  const text = toTrimmedString(value);

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const text = toTrimmedString(value);

    if (!text || seen.has(text)) {
      continue;
    }

    seen.add(text);
    result.push(text);
  }

  return result;
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

module.exports = {
  RED_FIX_TEMPLATE_VERSION,
  generateRedFixRequest,
  generateBatchRedFixRequests
};