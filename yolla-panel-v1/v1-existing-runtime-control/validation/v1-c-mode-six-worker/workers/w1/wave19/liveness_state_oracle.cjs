'use strict';

const STATES = Object.freeze({
  WAITING: 'WAITING',
  WORKING: 'WORKING',
  RESULT_PENDING: 'RESULT_PENDING',
  COMPLETED: 'COMPLETED',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED'
});

const ACTIONS = Object.freeze({
  NONE: 'NONE',
  REFRESH_ONCE: 'REFRESH_ONCE',
  RECHECK_AFTER_30_SECONDS: 'RECHECK_AFTER_30_SECONDS'
});

const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const THIRTY_SECONDS_MS = 30 * 1000;

function assertFiniteNumber(value, name) {
  if (!Number.isFinite(value)) throw new TypeError(`${name}_MUST_BE_FINITE_NUMBER`);
}

function normalizeKeys(keys) {
  if (!Array.isArray(keys)) return [];
  return [...new Set(keys.map(value => String(value || '').trim()).filter(Boolean))];
}

function hasExactResultKey(expectedResultKey, observedResultKeys) {
  const expected = String(expectedResultKey || '').trim();
  return Boolean(expected) && normalizeKeys(observedResultKeys).includes(expected);
}

function normalizeReviewReasons(reasons) {
  if (!Array.isArray(reasons)) return [];
  return [...new Set(reasons.map(value => String(value || '').trim()).filter(Boolean))];
}

function evaluateLiveness(input = {}) {
  const nowMs = input.nowMs;
  const referenceAtMs = input.referenceAtMs;
  assertFiniteNumber(nowMs, 'NOW_MS');
  assertFiniteNumber(referenceAtMs, 'REFERENCE_AT_MS');
  if (nowMs < referenceAtMs) throw new RangeError('NOW_BEFORE_REFERENCE');

  const expectedResultKey = String(input.expectedResultKey || '').trim();
  if (!expectedResultKey) throw new TypeError('EXPECTED_RESULT_KEY_REQUIRED');

  const observedResultKeys = normalizeKeys(input.observedResultKeys);
  const exactResultFound = hasExactResultKey(expectedResultKey, observedResultKeys);
  const generationActive = input.generationActive === true;
  const workObserved = input.workObserved === true;
  const explicitReviewReasons = normalizeReviewReasons(input.explicitReviewReasons);
  const refreshCount = Number.isInteger(input.refreshCount) && input.refreshCount >= 0 ? input.refreshCount : 0;
  const refreshAtMs = input.refreshAtMs == null ? null : Number(input.refreshAtMs);
  if (refreshAtMs != null) assertFiniteNumber(refreshAtMs, 'REFRESH_AT_MS');
  if (refreshCount === 0 && refreshAtMs != null) throw new Error('REFRESH_TIMESTAMP_WITH_ZERO_COUNT');
  if (refreshCount > 0 && refreshAtMs == null) throw new Error('REFRESH_TIMESTAMP_REQUIRED');
  if (refreshAtMs != null && refreshAtMs > nowMs) throw new RangeError('REFRESH_TIMESTAMP_IN_FUTURE');

  const elapsedMs = nowMs - referenceAtMs;

  if (exactResultFound) {
    return {
      state: STATES.COMPLETED,
      action: ACTIONS.NONE,
      exactResultFound: true,
      refreshRequested: false,
      nextEvaluationAfterMs: 0,
      reason: 'EXACT_RESULT_KEY_FOUND'
    };
  }

  if (explicitReviewReasons.length > 0) {
    return {
      state: STATES.REVIEW_REQUIRED,
      action: ACTIONS.NONE,
      exactResultFound: false,
      refreshRequested: false,
      nextEvaluationAfterMs: 0,
      reason: 'EXPLICIT_REVIEW_SIGNAL',
      reviewReasons: explicitReviewReasons
    };
  }

  if (generationActive) {
    return {
      state: STATES.WORKING,
      action: ACTIONS.NONE,
      exactResultFound: false,
      refreshRequested: false,
      nextEvaluationAfterMs: Math.max(0, THIRTY_MINUTES_MS - elapsedMs),
      reason: 'GENERATION_ACTIVE'
    };
  }

  if (elapsedMs < THIRTY_MINUTES_MS) {
    return {
      state: workObserved ? STATES.WORKING : STATES.WAITING,
      action: ACTIONS.NONE,
      exactResultFound: false,
      refreshRequested: false,
      nextEvaluationAfterMs: THIRTY_MINUTES_MS - elapsedMs,
      reason: workObserved ? 'WORK_OBSERVED_BEFORE_THRESHOLD' : 'BEFORE_30_MINUTE_THRESHOLD'
    };
  }

  if (refreshCount === 0) {
    return {
      state: workObserved ? STATES.RESULT_PENDING : STATES.WAITING,
      action: ACTIONS.REFRESH_ONCE,
      exactResultFound: false,
      refreshRequested: true,
      nextEvaluationAfterMs: THIRTY_SECONDS_MS,
      reason: 'THRESHOLD_ELAPSED_REFRESH_REQUIRED_ONCE'
    };
  }

  const sinceRefreshMs = nowMs - refreshAtMs;
  if (sinceRefreshMs < THIRTY_SECONDS_MS) {
    return {
      state: STATES.RESULT_PENDING,
      action: ACTIONS.RECHECK_AFTER_30_SECONDS,
      exactResultFound: false,
      refreshRequested: false,
      nextEvaluationAfterMs: THIRTY_SECONDS_MS - sinceRefreshMs,
      reason: 'WAITING_FOR_30_SECOND_REEVALUATION'
    };
  }

  return {
    state: STATES.RESULT_PENDING,
    action: ACTIONS.NONE,
    exactResultFound: false,
    refreshRequested: false,
    nextEvaluationAfterMs: 0,
    reason: 'NO_EXACT_RESULT_AFTER_SINGLE_REFRESH_NOT_PROOF_OF_NON_EXECUTION'
  };
}

module.exports = {
  STATES,
  ACTIONS,
  THIRTY_MINUTES_MS,
  THIRTY_SECONDS_MS,
  hasExactResultKey,
  evaluateLiveness
};
