'use strict';

/**
 * Source Factory Stage 4 GREEN/YELLOW output assembly queue helper.
 *
 * This module only classifies assembly candidates into an in-memory queue.
 * It never applies patches, writes files, deletes files, or mutates production code.
 */

const STATUS = Object.freeze({
  GREEN: 'GREEN',
  YELLOW: 'YELLOW',
  RED: 'RED',
  BLACK: 'BLACK',
  UNKNOWN: 'UNKNOWN'
});

const OPERATION = Object.freeze({
  CREATE: 'create',
  MODIFY: 'modify',
  REPLACE: 'replace',
  PATCH_REQUEST: 'patch_request',
  REPORT_ONLY: 'report_only',
  UNKNOWN: 'unknown'
});

const QUEUE_GROUPS = Object.freeze({
  READY_CREATE_FILES: 'readyCreateFiles',
  READY_PATCH_REQUESTS: 'readyPatchRequests',
  READY_REPORT_ONLY_ARTIFACTS: 'readyReportOnlyArtifacts',
  YELLOW_NEEDS_COMMANDER_CHECK: 'yellowNeedsCommanderCheck',
  BLOCKED_RED: 'blockedRed',
  EXCLUDED_BLACK: 'excludedBlack'
});

function buildGreenOutputAssemblyQueue(input, options) {
  const queue = createEmptyAssemblyQueue(options);
  const candidates = collectCandidates(input);

  for (const candidate of candidates) {
    addAssemblyCandidate(queue, candidate, options);
  }

  queue.summary = summarizeAssemblyQueue(queue);
  return queue;
}

function addAssemblyCandidate(queue, candidate, options) {
  const targetQueue = isPlainObject(queue) ? queue : createEmptyAssemblyQueue(options);
  ensureQueueShape(targetQueue);

  const normalized = normalizeCandidate(candidate, options);
  const groupName = resolveQueueGroup(normalized);

  targetQueue[groupName].push(normalized);
  targetQueue.summary = summarizeAssemblyQueue(targetQueue);

  return targetQueue;
}

function summarizeAssemblyQueue(queue) {
  const shapedQueue = ensureQueueShape(queue || createEmptyAssemblyQueue());

  const summary = {
    totalCandidates:
      shapedQueue.readyCreateFiles.length +
      shapedQueue.readyPatchRequests.length +
      shapedQueue.readyReportOnlyArtifacts.length +
      shapedQueue.yellowNeedsCommanderCheck.length +
      shapedQueue.blockedRed.length +
      shapedQueue.excludedBlack.length,
    readyCreateFiles: shapedQueue.readyCreateFiles.length,
    readyPatchRequests: shapedQueue.readyPatchRequests.length,
    readyReportOnlyArtifacts: shapedQueue.readyReportOnlyArtifacts.length,
    yellowNeedsCommanderCheck: shapedQueue.yellowNeedsCommanderCheck.length,
    blockedRed: shapedQueue.blockedRed.length,
    excludedBlack: shapedQueue.excludedBlack.length,
    readyForCommanderAssembly:
      shapedQueue.readyCreateFiles.length +
      shapedQueue.readyPatchRequests.length +
      shapedQueue.readyReportOnlyArtifacts.length,
    requiresCommanderCheck: shapedQueue.yellowNeedsCommanderCheck.length,
    blockedOrExcluded: shapedQueue.blockedRed.length + shapedQueue.excludedBlack.length,
    hasBlockingRed: shapedQueue.blockedRed.length > 0,
    hasExplicitInstructionViolation: shapedQueue.excludedBlack.length > 0
  };

  summary.nextRecommendedAction = resolveNextRecommendedAction(summary);
  return summary;
}

function createEmptyAssemblyQueue(options) {
  const normalizedOptions = normalizeOptions(options);

  return {
    queueType: 'GREEN_OUTPUT_ASSEMBLY_QUEUE',
    targetStage: normalizedOptions.targetStage,
    createdBy: normalizedOptions.createdBy,
    createdAt: normalizedOptions.createdAt || new Date().toISOString(),
    applyWrites: false,
    groups: {
      readyCreateFiles: QUEUE_GROUPS.READY_CREATE_FILES,
      readyPatchRequests: QUEUE_GROUPS.READY_PATCH_REQUESTS,
      readyReportOnlyArtifacts: QUEUE_GROUPS.READY_REPORT_ONLY_ARTIFACTS,
      yellowNeedsCommanderCheck: QUEUE_GROUPS.YELLOW_NEEDS_COMMANDER_CHECK,
      blockedRed: QUEUE_GROUPS.BLOCKED_RED,
      excludedBlack: QUEUE_GROUPS.EXCLUDED_BLACK
    },
    readyCreateFiles: [],
    readyPatchRequests: [],
    readyReportOnlyArtifacts: [],
    yellowNeedsCommanderCheck: [],
    blockedRed: [],
    excludedBlack: [],
    summary: {
      totalCandidates: 0,
      readyCreateFiles: 0,
      readyPatchRequests: 0,
      readyReportOnlyArtifacts: 0,
      yellowNeedsCommanderCheck: 0,
      blockedRed: 0,
      excludedBlack: 0,
      readyForCommanderAssembly: 0,
      requiresCommanderCheck: 0,
      blockedOrExcluded: 0,
      hasBlockingRed: false,
      hasExplicitInstructionViolation: false,
      nextRecommendedAction: 'NO_CANDIDATES'
    }
  };
}

function ensureQueueShape(queue) {
  if (!isPlainObject(queue)) {
    throw new TypeError('assembly queue must be an object');
  }

  if (!Array.isArray(queue.readyCreateFiles)) {
    queue.readyCreateFiles = [];
  }

  if (!Array.isArray(queue.readyPatchRequests)) {
    queue.readyPatchRequests = [];
  }

  if (!Array.isArray(queue.readyReportOnlyArtifacts)) {
    queue.readyReportOnlyArtifacts = [];
  }

  if (!Array.isArray(queue.yellowNeedsCommanderCheck)) {
    queue.yellowNeedsCommanderCheck = [];
  }

  if (!Array.isArray(queue.blockedRed)) {
    queue.blockedRed = [];
  }

  if (!Array.isArray(queue.excludedBlack)) {
    queue.excludedBlack = [];
  }

  if (!isPlainObject(queue.groups)) {
    queue.groups = {
      readyCreateFiles: QUEUE_GROUPS.READY_CREATE_FILES,
      readyPatchRequests: QUEUE_GROUPS.READY_PATCH_REQUESTS,
      readyReportOnlyArtifacts: QUEUE_GROUPS.READY_REPORT_ONLY_ARTIFACTS,
      yellowNeedsCommanderCheck: QUEUE_GROUPS.YELLOW_NEEDS_COMMANDER_CHECK,
      blockedRed: QUEUE_GROUPS.BLOCKED_RED,
      excludedBlack: QUEUE_GROUPS.EXCLUDED_BLACK
    };
  }

  queue.applyWrites = false;
  return queue;
}

function collectCandidates(input) {
  if (!input) {
    return [];
  }

  if (Array.isArray(input)) {
    return input;
  }

  if (!isPlainObject(input)) {
    return [input];
  }

  const candidateKeys = [
    'candidates',
    'outputs',
    'sourceFiles',
    'source_file_blocks',
    'sourceFileBlocks',
    'items',
    'files'
  ];

  for (const key of candidateKeys) {
    if (Array.isArray(input[key])) {
      return input[key];
    }
  }

  return [input];
}

function normalizeCandidate(candidate, options) {
  const normalizedOptions = normalizeOptions(options);
  const source = isPlainObject(candidate) ? candidate : { raw: candidate };

  const status = normalizeStatus(
    firstNonEmpty([
      source.gateStatus,
      source.gate_status,
      source.status,
      source.color,
      source.decision,
      source.commanderStatus,
      source.commander_status
    ])
  );

  const operation = normalizeOperation(
    firstNonEmpty([
      source.operation,
      source.sourceOperation,
      source.source_operation,
      source.op
    ])
  );

  const path = toTrimmedString(
    firstNonEmpty([
      source.path,
      source.filePath,
      source.file_path,
      source.targetPath,
      source.target_path,
      source.relativePath,
      source.relative_path
    ])
  );

  const ownerWorker = toTrimmedString(
    firstNonEmpty([
      source.owner_worker,
      source.ownerWorker,
      source.worker_id,
      source.workerId,
      source.worker
    ])
  );

  const targetStage = toTrimmedString(
    firstNonEmpty([
      source.target_stage,
      source.targetStage,
      normalizedOptions.targetStage
    ])
  );

  const language = toTrimmedString(
    firstNonEmpty([
      source.language,
      source.lang
    ])
  );

  const purpose = toTrimmedString(
    firstNonEmpty([
      source.purpose,
      source.description,
      source.summary
    ])
  );

  const reasons = buildCandidateReasons(source, status, operation, path);
  const route = resolvePanelRoute(source, status);

  return {
    id: toTrimmedString(
      firstNonEmpty([
        source.id,
        source.outputId,
        source.output_id,
        source.sourceFileId,
        source.source_file_id,
        buildStableCandidateId({ status, operation, path, ownerWorker, targetStage, purpose })
      ])
    ),
    status,
    operation,
    path,
    language,
    purpose,
    owner_worker: ownerWorker,
    target_stage: targetStage,
    route,
    commanderQueueEligible: route === 'COMMANDER_QUEUE',
    source: source.source || source.rawSource || source.raw_source || null,
    content: typeof source.content === 'string' ? source.content : null,
    patch_request: source.patch_request || source.patchRequest || null,
    report: source.report || source.workerReport || source.worker_report || null,
    reasons,
    original: normalizedOptions.includeOriginal === true ? source : undefined
  };
}

function normalizeOptions(options) {
  const input = isPlainObject(options) ? options : {};

  return {
    targetStage: toTrimmedString(input.targetStage || input.target_stage || 'STAGE4_CLASSIFIER_VALIDATION_PANEL_AUTOMATION'),
    createdBy: toTrimmedString(input.createdBy || input.created_by || 'WORKER_07'),
    createdAt: toTrimmedString(input.createdAt || input.created_at || ''),
    includeOriginal: input.includeOriginal === true
  };
}

function resolveQueueGroup(candidate) {
  if (candidate.status === STATUS.BLACK) {
    return QUEUE_GROUPS.EXCLUDED_BLACK;
  }

  if (candidate.status === STATUS.RED) {
    return QUEUE_GROUPS.BLOCKED_RED;
  }

  if (candidate.status === STATUS.YELLOW || candidate.status === STATUS.UNKNOWN) {
    return QUEUE_GROUPS.YELLOW_NEEDS_COMMANDER_CHECK;
  }

  if (candidate.operation === OPERATION.PATCH_REQUEST) {
    return QUEUE_GROUPS.READY_PATCH_REQUESTS;
  }

  if (candidate.operation === OPERATION.REPORT_ONLY) {
    return QUEUE_GROUPS.READY_REPORT_ONLY_ARTIFACTS;
  }

  if (
    candidate.operation === OPERATION.CREATE ||
    candidate.operation === OPERATION.MODIFY ||
    candidate.operation === OPERATION.REPLACE
  ) {
    return QUEUE_GROUPS.READY_CREATE_FILES;
  }

  return QUEUE_GROUPS.YELLOW_NEEDS_COMMANDER_CHECK;
}

function normalizeStatus(value) {
  const text = toTrimmedString(value).toUpperCase();

  if (text === STATUS.GREEN) {
    return STATUS.GREEN;
  }

  if (text === STATUS.YELLOW) {
    return STATUS.YELLOW;
  }

  if (text === STATUS.RED) {
    return STATUS.RED;
  }

  if (text === STATUS.BLACK) {
    return STATUS.BLACK;
  }

  if (text === 'PASS' || text === 'READY' || text === 'OK') {
    return STATUS.GREEN;
  }

  if (text === 'WARN' || text === 'WARNING' || text === 'NEEDS_CHECK') {
    return STATUS.YELLOW;
  }

  if (text === 'FAIL' || text === 'BLOCKED' || text === 'ERROR') {
    return STATUS.RED;
  }

  if (text === 'EXCLUDE' || text === 'EXCLUDED' || text === 'VIOLATION') {
    return STATUS.BLACK;
  }

  return STATUS.UNKNOWN;
}

function normalizeOperation(value) {
  const text = toTrimmedString(value).toLowerCase();

  if (text === OPERATION.CREATE || text === 'new_file' || text === 'new') {
    return OPERATION.CREATE;
  }

  if (text === OPERATION.MODIFY || text === 'update' || text === 'patch') {
    return OPERATION.MODIFY;
  }

  if (text === OPERATION.REPLACE || text === 'rewrite') {
    return OPERATION.REPLACE;
  }

  if (
    text === OPERATION.PATCH_REQUEST ||
    text === 'patchrequest' ||
    text === 'patch-request' ||
    text === 'patch request'
  ) {
    return OPERATION.PATCH_REQUEST;
  }

  if (
    text === OPERATION.REPORT_ONLY ||
    text === 'reportonly' ||
    text === 'report-only' ||
    text === 'report only'
  ) {
    return OPERATION.REPORT_ONLY;
  }

  return OPERATION.UNKNOWN;
}

function resolvePanelRoute(source, status) {
  const route = toTrimmedString(
    firstNonEmpty([
      source.route,
      source.panelRoute,
      source.panel_route,
      source.targetRoute,
      source.target_route
    ])
  ).toUpperCase();

  if (route) {
    return route;
  }

  if (status === STATUS.GREEN || status === STATUS.YELLOW) {
    return 'COMMANDER_QUEUE';
  }

  if (status === STATUS.RED) {
    return 'RED_FIX_QUEUE';
  }

  if (status === STATUS.BLACK) {
    return 'EXCLUDED_QUEUE';
  }

  return 'COMMANDER_REVIEW_QUEUE';
}

function buildCandidateReasons(source, status, operation, path) {
  const reasons = [];

  if (Array.isArray(source.reasons)) {
    for (const reason of source.reasons) {
      const text = toTrimmedString(reason);
      if (text) {
        reasons.push(text);
      }
    }
  }

  if (source.reason) {
    const reason = toTrimmedString(source.reason);
    if (reason) {
      reasons.push(reason);
    }
  }

  if (status === STATUS.UNKNOWN) {
    reasons.push('status_missing_or_unknown');
  }

  if (operation === OPERATION.UNKNOWN) {
    reasons.push('operation_missing_or_unknown');
  }

  if (!path && operation !== OPERATION.REPORT_ONLY) {
    reasons.push('path_missing_for_file_or_patch_candidate');
  }

  if (status === STATUS.YELLOW) {
    reasons.push('commander_fast_check_required');
  }

  if (status === STATUS.RED) {
    reasons.push('blocked_until_small_hotfix');
  }

  if (status === STATUS.BLACK) {
    reasons.push('excluded_due_to_explicit_current_instruction_violation');
  }

  return uniqueStrings(reasons);
}

function resolveNextRecommendedAction(summary) {
  if (summary.totalCandidates === 0) {
    return 'NO_CANDIDATES';
  }

  if (summary.readyForCommanderAssembly > 0 && summary.requiresCommanderCheck === 0 && summary.blockedOrExcluded === 0) {
    return 'COMMANDER_CAN_ASSEMBLE_READY_OUTPUTS';
  }

  if (summary.readyForCommanderAssembly > 0 && summary.requiresCommanderCheck > 0) {
    return 'COMMANDER_ASSEMBLE_GREEN_AND_FAST_CHECK_YELLOW';
  }

  if (summary.readyForCommanderAssembly > 0 && summary.hasBlockingRed) {
    return 'COMMANDER_ASSEMBLE_GREEN_AND_SEND_SMALL_RED_HOTFIX';
  }

  if (summary.requiresCommanderCheck > 0) {
    return 'COMMANDER_FAST_CHECK_YELLOW_OUTPUTS';
  }

  if (summary.hasBlockingRed) {
    return 'SEND_RED_SMALL_HOTFIX_ONLY';
  }

  if (summary.hasExplicitInstructionViolation) {
    return 'EXCLUDE_BLACK_OUTPUTS';
  }

  return 'COMMANDER_REVIEW_REQUIRED';
}

function buildStableCandidateId(parts) {
  const seed = [
    parts.status,
    parts.operation,
    parts.path,
    parts.ownerWorker,
    parts.targetStage,
    parts.purpose
  ].map(toTrimmedString).join('|');

  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(index);
    hash |= 0;
  }

  return `assembly_${Math.abs(hash).toString(36)}`;
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
  STATUS,
  OPERATION,
  QUEUE_GROUPS,
  buildGreenOutputAssemblyQueue,
  addAssemblyCandidate,
  summarizeAssemblyQueue
};