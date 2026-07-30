'use strict';

/**
 * Stage 4 prompt retry policy.
 * Pure helper only: no file IO, no IPC, no renderer binding, no timers, no command execution.
 */

const SCHEMA_VERSION = 'stage4.prompt_retry_policy.v1';
const RETRY_POLICY_OBJECT_TYPE = 'STAGE4_PROMPT_RETRY_POLICY';
const RETRY_DECISION_OBJECT_TYPE = 'STAGE4_PROMPT_RETRY_DECISION';
const RETRY_SUMMARY_OBJECT_TYPE = 'STAGE4_PROMPT_RETRY_POLICY_SUMMARY';

const RETRY_DECISION = Object.freeze({
  RETRY: 'retry',
  DO_NOT_RETRY: 'do_not_retry',
  MANUAL_REVIEW: 'manual_review',
  GIVE_UP: 'give_up'
});

const RETRY_STATUS = Object.freeze({
  FAILED: 'failed',
  TIMEOUT: 'timeout',
  INCOMPLETE: 'incomplete',
  PARTIAL: 'partial',
  STABLE_INCOMPLETE: 'stable_incomplete',
  BLOCKED: 'blocked',
  HELD: 'held',
  UNKNOWN: 'unknown'
});

const NON_RETRY_STATUS = Object.freeze({
  COMPLETE: 'complete',
  COMPLETED: 'completed',
  SENT: 'sent',
  RUNNING: 'running',
  SKIPPED: 'skipped',
  CANCELLED: 'cancelled',
  STOPPED: 'stopped'
});

const DEFAULT_POLICY = Object.freeze({
  policy_id: 'stage4_default_prompt_retry_policy',
  max_attempts: 3,
  retry_delay_ms: 1500,
  max_retry_delay_ms: 60000,
  backoff_multiplier: 1,
  retry_on_statuses: [
    RETRY_STATUS.FAILED,
    RETRY_STATUS.TIMEOUT,
    RETRY_STATUS.INCOMPLETE,
    RETRY_STATUS.PARTIAL,
    RETRY_STATUS.STABLE_INCOMPLETE
  ],
  retry_on_error_types: [
    'timeout',
    'network_error',
    'send_failed',
    'completion_incomplete',
    'panel_command_parse_error'
  ],
  do_not_retry_statuses: [
    NON_RETRY_STATUS.COMPLETE,
    NON_RETRY_STATUS.COMPLETED,
    NON_RETRY_STATUS.SKIPPED,
    NON_RETRY_STATUS.CANCELLED,
    NON_RETRY_STATUS.STOPPED
  ],
  manual_review_required: {
    enabled: true,
    after_attempts: 3,
    statuses: [RETRY_STATUS.BLOCKED, RETRY_STATUS.HELD],
    error_types: ['schema_error', 'user_instruction_violation', 'panel_command_schema_error'],
    gate_statuses: ['RED', 'BLACK'],
    completion_statuses: [],
    require_on_unknown_status: false
  }
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asObject(value) {
  return isPlainObject(value) ? value : {};
}

function trimText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function textOr(value, fallback) {
  const text = trimText(value);
  return text || fallback;
}

function numberOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function integerOr(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function booleanOr(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function clampNumber(value, min, max, fallback) {
  const parsed = numberOr(value, fallback);
  return Math.max(min, Math.min(max, parsed));
}

function cloneJson(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  try {
    const cloned = JSON.parse(JSON.stringify(value));
    return cloned === undefined ? fallback : cloned;
  } catch (error) {
    return fallback;
  }
}

function normalizeToken(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeUpperToken(value) {
  return String(value || '').trim().toUpperCase();
}

function uniqueTokens(value, options) {
  const settings = asObject(options);
  const input = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[#,]/g)
      : [];
  const seen = new Set();
  const result = [];

  input.forEach((entry) => {
    const normalized = settings.uppercase ? normalizeUpperToken(entry) : normalizeToken(entry);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    result.push(normalized);
  });

  return result;
}

function stableHash(value) {
  const source = String(value || '');
  let hash = 0;

  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36).padStart(6, '0');
}

function stableId(prefix, parts) {
  const source = Array.isArray(parts) ? parts.filter(Boolean).join('|') : String(parts || '');
  return `${prefix}_${stableHash(source || prefix)}`;
}

function finiteAttemptLimit(value, fallback) {
  const parsed = integerOr(value, fallback);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.max(1, Math.min(20, parsed));
}

function normalizeManualReviewRule(value, maxAttempts) {
  if (value === true) {
    return {
      ...cloneJson(DEFAULT_POLICY.manual_review_required, {}),
      enabled: true,
      after_attempts: maxAttempts
    };
  }

  if (value === false) {
    return {
      ...cloneJson(DEFAULT_POLICY.manual_review_required, {}),
      enabled: false,
      after_attempts: maxAttempts
    };
  }

  const source = asObject(value);
  const defaults = DEFAULT_POLICY.manual_review_required;

  return {
    enabled: booleanOr(source.enabled, defaults.enabled),
    after_attempts: finiteAttemptLimit(source.after_attempts || source.afterAttempts, maxAttempts),
    statuses: uniqueTokens(source.statuses || defaults.statuses),
    error_types: uniqueTokens(source.error_types || source.errorTypes || defaults.error_types),
    gate_statuses: uniqueTokens(source.gate_statuses || source.gateStatuses || defaults.gate_statuses, { uppercase: true }),
    completion_statuses: uniqueTokens(source.completion_statuses || source.completionStatuses || defaults.completion_statuses),
    require_on_unknown_status: booleanOr(source.require_on_unknown_status || source.requireOnUnknownStatus, defaults.require_on_unknown_status)
  };
}

function createPromptRetryPolicy(input) {
  const source = asObject(input);
  const maxAttempts = finiteAttemptLimit(source.max_attempts || source.maxAttempts, DEFAULT_POLICY.max_attempts);
  const retryDelay = Math.max(0, integerOr(source.retry_delay_ms || source.retryDelayMs, DEFAULT_POLICY.retry_delay_ms));
  const maxRetryDelay = Math.max(retryDelay, integerOr(source.max_retry_delay_ms || source.maxRetryDelayMs, DEFAULT_POLICY.max_retry_delay_ms));
  const backoffMultiplier = clampNumber(source.backoff_multiplier || source.backoffMultiplier, 1, 10, DEFAULT_POLICY.backoff_multiplier);

  return {
    object_type: RETRY_POLICY_OBJECT_TYPE,
    schema_version: SCHEMA_VERSION,
    policy_id: textOr(source.policy_id || source.id, stableId('retry_policy', [maxAttempts, retryDelay])),
    max_attempts: maxAttempts,
    retry_delay_ms: retryDelay,
    max_retry_delay_ms: maxRetryDelay,
    backoff_multiplier: backoffMultiplier,
    retry_on_statuses: uniqueTokens(source.retry_on_statuses || source.retryOnStatuses || DEFAULT_POLICY.retry_on_statuses),
    retry_on_error_types: uniqueTokens(source.retry_on_error_types || source.retryOnErrorTypes || DEFAULT_POLICY.retry_on_error_types),
    do_not_retry_statuses: uniqueTokens(source.do_not_retry_statuses || source.doNotRetryStatuses || DEFAULT_POLICY.do_not_retry_statuses),
    manual_review_required: normalizeManualReviewRule(source.manual_review_required || source.manualReviewRequired, maxAttempts),
    metadata: cloneJson(source.metadata, {}),
    infinite_retry_blocked: true
  };
}

function normalizeContext(context) {
  const source = asObject(context);
  const item = asObject(source.item || source.queue_item || source.queueItem);
  const detector = asObject(source.detector || source.completion || source.completion_decision || source.completionDecision);
  const gate = asObject(source.gate || source.gate_decision || source.gateDecision);
  const policy = createPromptRetryPolicy(source.policy || source.retry_policy || source.retryPolicy || item.retry_policy || item.retryPolicy);
  const attempts = Math.max(0, integerOr(source.attempts !== undefined ? source.attempts : item.attempts, 0));
  const status = normalizeToken(source.status || source.send_status || source.sendStatus || item.send_status || item.sendStatus || item.status || detector.status);
  const completionStatus = normalizeToken(source.completion_status || source.completionStatus || detector.status);
  const errorType = normalizeToken(source.error_type || source.errorType || source.error_code || source.errorCode || item.error_type || item.errorType);
  const gateStatus = normalizeUpperToken(source.gate_status || source.gateStatus || gate.status || gate.color);
  const now = trimText(source.now);

  return {
    policy,
    item,
    attempts,
    status,
    completion_status: completionStatus,
    error_type: errorType,
    gate_status: gateStatus,
    reason: cloneJson(source.reason || source.failure_reason || source.failureReason || item.failure_reason || item.failureReason, null),
    now,
    metadata: cloneJson(source.metadata, {})
  };
}

function shouldRequireManualReview(context) {
  const normalized = normalizeContext(context);
  const rule = normalized.policy.manual_review_required;

  if (!rule.enabled) {
    return false;
  }

  if (normalized.attempts >= rule.after_attempts) {
    return true;
  }

  if (normalized.status && rule.statuses.includes(normalized.status)) {
    return true;
  }

  if (normalized.error_type && rule.error_types.includes(normalized.error_type)) {
    return true;
  }

  if (normalized.gate_status && rule.gate_statuses.includes(normalized.gate_status)) {
    return true;
  }

  if (normalized.completion_status && rule.completion_statuses.includes(normalized.completion_status)) {
    return true;
  }

  if (rule.require_on_unknown_status && (!normalized.status || normalized.status === RETRY_STATUS.UNKNOWN)) {
    return true;
  }

  return false;
}

function manualReviewReasons(context) {
  const normalized = normalizeContext(context);
  const rule = normalized.policy.manual_review_required;
  const reasons = [];

  if (!rule.enabled) {
    return reasons;
  }

  if (normalized.attempts >= rule.after_attempts) {
    reasons.push(`attempt count reached manual review threshold: ${normalized.attempts}/${rule.after_attempts}`);
  }
  if (normalized.status && rule.statuses.includes(normalized.status)) {
    reasons.push(`status requires manual review: ${normalized.status}`);
  }
  if (normalized.error_type && rule.error_types.includes(normalized.error_type)) {
    reasons.push(`error type requires manual review: ${normalized.error_type}`);
  }
  if (normalized.gate_status && rule.gate_statuses.includes(normalized.gate_status)) {
    reasons.push(`gate status requires manual review: ${normalized.gate_status}`);
  }
  if (normalized.completion_status && rule.completion_statuses.includes(normalized.completion_status)) {
    reasons.push(`completion status requires manual review: ${normalized.completion_status}`);
  }
  if (rule.require_on_unknown_status && (!normalized.status || normalized.status === RETRY_STATUS.UNKNOWN)) {
    reasons.push('unknown status requires manual review');
  }

  return reasons;
}

function retryableReasons(context) {
  const normalized = normalizeContext(context);
  const policy = normalized.policy;
  const reasons = [];

  if (normalized.status && policy.retry_on_statuses.includes(normalized.status)) {
    reasons.push(`status is retryable: ${normalized.status}`);
  }

  if (normalized.completion_status && policy.retry_on_statuses.includes(normalized.completion_status)) {
    reasons.push(`completion status is retryable: ${normalized.completion_status}`);
  }

  if (normalized.error_type && policy.retry_on_error_types.includes(normalized.error_type)) {
    reasons.push(`error type is retryable: ${normalized.error_type}`);
  }

  return reasons;
}

function doNotRetryReasons(context) {
  const normalized = normalizeContext(context);
  const policy = normalized.policy;
  const reasons = [];

  if (normalized.status && policy.do_not_retry_statuses.includes(normalized.status)) {
    reasons.push(`status is non-retryable: ${normalized.status}`);
  }

  if (normalized.completion_status && policy.do_not_retry_statuses.includes(normalized.completion_status)) {
    reasons.push(`completion status is non-retryable: ${normalized.completion_status}`);
  }

  return reasons;
}

function calculateRetryDelayMs(policy, attempts) {
  const baseDelay = Math.max(0, integerOr(policy.retry_delay_ms, DEFAULT_POLICY.retry_delay_ms));
  const multiplier = numberOr(policy.backoff_multiplier, 1);
  const attemptIndex = Math.max(0, attempts);
  const delayed = Math.round(baseDelay * Math.pow(multiplier, attemptIndex));
  return Math.min(Math.max(0, delayed), policy.max_retry_delay_ms);
}

function addDelayToNow(now, delayMs) {
  const source = trimText(now);
  if (!source) {
    return '';
  }

  const parsed = Date.parse(source);
  if (!Number.isFinite(parsed)) {
    return '';
  }

  return new Date(parsed + delayMs).toISOString();
}

function buildRetryDecision(context) {
  const normalized = normalizeContext(context);
  const policy = normalized.policy;
  const attempts = normalized.attempts;
  const remainingAttempts = Math.max(0, policy.max_attempts - attempts);
  const nextAttempt = attempts + 1;
  const manualReasons = manualReviewReasons(normalized);
  const stopReasons = doNotRetryReasons(normalized);
  const retryReasons = retryableReasons(normalized);
  const retryDelayMs = calculateRetryDelayMs(policy, attempts);
  const common = {
    object_type: RETRY_DECISION_OBJECT_TYPE,
    schema_version: SCHEMA_VERSION,
    policy_id: policy.policy_id,
    max_attempts: policy.max_attempts,
    attempts,
    next_attempt: nextAttempt,
    remaining_attempts: remainingAttempts,
    retry_delay_ms: retryDelayMs,
    next_retry_at: addDelayToNow(normalized.now, retryDelayMs),
    status: normalized.status,
    completion_status: normalized.completion_status,
    error_type: normalized.error_type,
    gate_status: normalized.gate_status,
    reason: normalized.reason,
    policy_snapshot: policy
  };

  if (manualReasons.length > 0) {
    return {
      ...common,
      decision: RETRY_DECISION.MANUAL_REVIEW,
      should_retry: false,
      manual_review_required: true,
      infinite_retry_blocked: true,
      reasons: manualReasons
    };
  }

  if (stopReasons.length > 0) {
    return {
      ...common,
      decision: RETRY_DECISION.DO_NOT_RETRY,
      should_retry: false,
      manual_review_required: false,
      infinite_retry_blocked: true,
      reasons: stopReasons
    };
  }

  if (attempts >= policy.max_attempts) {
    return {
      ...common,
      decision: RETRY_DECISION.GIVE_UP,
      should_retry: false,
      manual_review_required: false,
      infinite_retry_blocked: true,
      reasons: [`max attempts reached: ${attempts}/${policy.max_attempts}`]
    };
  }

  if (retryReasons.length > 0) {
    return {
      ...common,
      decision: RETRY_DECISION.RETRY,
      should_retry: true,
      manual_review_required: false,
      infinite_retry_blocked: true,
      reasons: retryReasons
    };
  }

  if (!normalized.status && !normalized.completion_status && !normalized.error_type) {
    return {
      ...common,
      decision: RETRY_DECISION.DO_NOT_RETRY,
      should_retry: false,
      manual_review_required: false,
      infinite_retry_blocked: true,
      reasons: ['no retryable status, completion status, or error type supplied']
    };
  }

  return {
    ...common,
    decision: RETRY_DECISION.DO_NOT_RETRY,
    should_retry: false,
    manual_review_required: false,
    infinite_retry_blocked: true,
    reasons: ['context does not match retry policy']
  };
}

function incrementPromptAttempt(item) {
  const source = asObject(item);
  const attempts = Math.max(0, integerOr(source.attempts, 0));
  const maxAttempts = source.max_attempts !== undefined
    ? finiteAttemptLimit(source.max_attempts, DEFAULT_POLICY.max_attempts)
    : source.maxAttempts !== undefined
      ? finiteAttemptLimit(source.maxAttempts, DEFAULT_POLICY.max_attempts)
      : undefined;

  return {
    ...cloneJson(source, {}),
    attempts: attempts + 1,
    max_attempts: maxAttempts || source.max_attempts || source.maxAttempts || DEFAULT_POLICY.max_attempts,
    retry_exhausted: maxAttempts ? attempts + 1 >= maxAttempts : false
  };
}

function summarizeRetryPolicy(policy) {
  const normalized = createPromptRetryPolicy(policy);

  return {
    object_type: RETRY_SUMMARY_OBJECT_TYPE,
    schema_version: SCHEMA_VERSION,
    policy_id: normalized.policy_id,
    max_attempts: normalized.max_attempts,
    retry_delay_ms: normalized.retry_delay_ms,
    max_retry_delay_ms: normalized.max_retry_delay_ms,
    backoff_multiplier: normalized.backoff_multiplier,
    retry_on_statuses: normalized.retry_on_statuses,
    retry_on_error_types: normalized.retry_on_error_types,
    do_not_retry_statuses: normalized.do_not_retry_statuses,
    manual_review_enabled: normalized.manual_review_required.enabled,
    manual_review_after_attempts: normalized.manual_review_required.after_attempts,
    manual_review_statuses: normalized.manual_review_required.statuses,
    manual_review_error_types: normalized.manual_review_required.error_types,
    manual_review_gate_statuses: normalized.manual_review_required.gate_statuses,
    infinite_retry_blocked: normalized.infinite_retry_blocked,
    notes: `Retries are capped at ${normalized.max_attempts} attempts and timers are not executed by this model.`
  };
}

module.exports = {
  SCHEMA_VERSION,
  RETRY_POLICY_OBJECT_TYPE,
  RETRY_DECISION_OBJECT_TYPE,
  RETRY_SUMMARY_OBJECT_TYPE,
  RETRY_DECISION,
  RETRY_STATUS,
  NON_RETRY_STATUS,
  createPromptRetryPolicy,
  buildRetryDecision,
  incrementPromptAttempt,
  shouldRequireManualReview,
  summarizeRetryPolicy
};