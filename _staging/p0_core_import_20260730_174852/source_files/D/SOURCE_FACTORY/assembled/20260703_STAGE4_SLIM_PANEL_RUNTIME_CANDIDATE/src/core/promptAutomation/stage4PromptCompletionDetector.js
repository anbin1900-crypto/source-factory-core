'use strict';

/**
 * Stage 4 prompt completion detector.
 * Pure helper only: no file IO, no IPC, no renderer binding, no command execution.
 */

const SCHEMA_VERSION = 'stage4.prompt_completion_detector.v1';
const COMPLETION_RULE_OBJECT_TYPE = 'STAGE4_PROMPT_COMPLETION_RULE';
const COMPLETION_DECISION_OBJECT_TYPE = 'STAGE4_PROMPT_COMPLETION_DECISION';
const COMPLETION_SIGNAL_OBJECT_TYPE = 'STAGE4_PROMPT_COMPLETION_SIGNAL';

const COMPLETION_STATUS = Object.freeze({
  UNKNOWN: 'unknown',
  INCOMPLETE: 'incomplete',
  PARTIAL: 'partial',
  COMPLETE: 'complete',
  COMPLETE_WITH_WARNINGS: 'complete_with_warnings',
  STABLE_INCOMPLETE: 'stable_incomplete'
});

const SIGNAL_STATUS = Object.freeze({
  PASS: 'pass',
  FAIL: 'fail',
  WARN: 'warn',
  UNKNOWN: 'unknown'
});

const DEFAULT_RULE = Object.freeze({
  require_source_file_end: true,
  require_worker_report_end: false,
  require_custom_markers: false,
  require_stability: false,
  min_confidence_for_complete: 0.78,
  min_text_length: 1,
  source_file_weight: 0.42,
  worker_report_weight: 0.18,
  custom_marker_weight: 0.2,
  stability_weight: 0.2,
  incomplete_penalty: 0.35,
  warn_penalty: 0.08,
  custom_markers_all: [],
  custom_markers_any: [],
  incomplete_markers: [
    '나머지는 동일',
    '생략',
    '추후 구현',
    'placeholder',
    'implementation omitted',
    'same as before',
    'to be implemented'
  ],
  stability: {
    previous_text: '',
    previous_length: null,
    stable_cycles: 0,
    min_stable_cycles: 1,
    length_delta_tolerance: 0,
    quiet_ms: 0,
    last_changed_at: '',
    now: ''
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

function booleanOr(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function clamp01(value) {
  const parsed = numberOr(value, 0);
  return Math.max(0, Math.min(1, parsed));
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

function normalizeStringArray(value) {
  const input = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[#,]/g)
      : [];
  const seen = new Set();
  const result = [];

  input.forEach((entry) => {
    const text = trimText(entry);
    const key = text.toLowerCase();
    if (text && !seen.has(key)) {
      seen.add(key);
      result.push(text);
    }
  });

  return result;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countMarker(rawText, marker) {
  const text = String(rawText || '');
  const needle = String(marker || '');

  if (!needle) {
    return 0;
  }

  return (text.match(new RegExp(escapeRegExp(needle), 'g')) || []).length;
}

function containsMarker(rawText, marker) {
  return countMarker(rawText, marker) > 0;
}

function lastNonEmptyLine(rawText) {
  const lines = String(rawText || '').split(/\r?\n/g).map((line) => line.trim()).filter(Boolean);
  return lines.length ? lines[lines.length - 1] : '';
}

function makeSignal(name, status, confidence, reasons, details) {
  return {
    object_type: COMPLETION_SIGNAL_OBJECT_TYPE,
    name: textOr(name, 'unknown_signal'),
    status: Object.values(SIGNAL_STATUS).includes(status) ? status : SIGNAL_STATUS.UNKNOWN,
    confidence: clamp01(confidence),
    reasons: normalizeStringArray(reasons),
    details: cloneJson(details, {})
  };
}

function createCompletionRule(input) {
  const source = asObject(input);
  const stability = {
    ...cloneJson(DEFAULT_RULE.stability, {}),
    ...cloneJson(source.stability, {})
  };

  return {
    object_type: COMPLETION_RULE_OBJECT_TYPE,
    schema_version: SCHEMA_VERSION,
    rule_id: textOr(source.rule_id || source.id, 'stage4_default_completion_rule'),
    require_source_file_end: booleanOr(source.require_source_file_end, DEFAULT_RULE.require_source_file_end),
    require_worker_report_end: booleanOr(source.require_worker_report_end, DEFAULT_RULE.require_worker_report_end),
    require_custom_markers: booleanOr(source.require_custom_markers, DEFAULT_RULE.require_custom_markers),
    require_stability: booleanOr(source.require_stability, DEFAULT_RULE.require_stability),
    min_confidence_for_complete: clamp01(numberOr(source.min_confidence_for_complete, DEFAULT_RULE.min_confidence_for_complete)),
    min_text_length: Math.max(0, numberOr(source.min_text_length, DEFAULT_RULE.min_text_length)),
    source_file_weight: clamp01(numberOr(source.source_file_weight, DEFAULT_RULE.source_file_weight)),
    worker_report_weight: clamp01(numberOr(source.worker_report_weight, DEFAULT_RULE.worker_report_weight)),
    custom_marker_weight: clamp01(numberOr(source.custom_marker_weight, DEFAULT_RULE.custom_marker_weight)),
    stability_weight: clamp01(numberOr(source.stability_weight, DEFAULT_RULE.stability_weight)),
    incomplete_penalty: clamp01(numberOr(source.incomplete_penalty, DEFAULT_RULE.incomplete_penalty)),
    warn_penalty: clamp01(numberOr(source.warn_penalty, DEFAULT_RULE.warn_penalty)),
    custom_markers_all: normalizeStringArray(source.custom_markers_all || source.required_markers || source.custom_markers),
    custom_markers_any: normalizeStringArray(source.custom_markers_any || source.any_markers),
    incomplete_markers: normalizeStringArray(source.incomplete_markers).length
      ? normalizeStringArray(source.incomplete_markers)
      : DEFAULT_RULE.incomplete_markers.slice(),
    stability: {
      previous_text: typeof stability.previous_text === 'string' ? stability.previous_text : '',
      previous_length: Number.isFinite(Number(stability.previous_length)) ? Number(stability.previous_length) : null,
      stable_cycles: Math.max(0, numberOr(stability.stable_cycles, 0)),
      min_stable_cycles: Math.max(0, numberOr(stability.min_stable_cycles, 1)),
      length_delta_tolerance: Math.max(0, numberOr(stability.length_delta_tolerance, 0)),
      quiet_ms: Math.max(0, numberOr(stability.quiet_ms, 0)),
      last_changed_at: trimText(stability.last_changed_at),
      now: trimText(stability.now)
    },
    metadata: cloneJson(source.metadata, {})
  };
}

function detectSourceFileOutputComplete(rawText) {
  const text = String(rawText || '');
  const startCount = countMarker(text, '=== SOURCE_FILE_START ===');
  const endCount = countMarker(text, '=== SOURCE_FILE_END ===');
  const contentStartCount = countMarker(text, '=== CONTENT_START ===');
  const contentEndCount = countMarker(text, '=== CONTENT_END ===');
  const hasSource = startCount > 0;
  const balancedSource = hasSource && startCount === endCount;
  const balancedContent = contentStartCount > 0 && contentStartCount === contentEndCount;
  const endsWithSource = lastNonEmptyLine(text) === '=== SOURCE_FILE_END ===';
  const complete = balancedSource && balancedContent && endCount > 0;
  const reasons = [];

  if (!hasSource) {
    reasons.push('SOURCE_FILE_START not found');
  }
  if (hasSource && !balancedSource) {
    reasons.push('SOURCE_FILE_START and SOURCE_FILE_END counts differ');
  }
  if (hasSource && !balancedContent) {
    reasons.push('CONTENT_START and CONTENT_END counts differ');
  }
  if (complete) {
    reasons.push('SOURCE_FILE block appears complete');
  }
  if (complete && !endsWithSource) {
    reasons.push('SOURCE_FILE block complete but response may include report or trailing text');
  }

  return makeSignal(
    'source_file_output',
    complete ? SIGNAL_STATUS.PASS : SIGNAL_STATUS.FAIL,
    complete ? 0.94 : hasSource ? 0.38 : 0,
    reasons,
    {
      source_file_start_count: startCount,
      source_file_end_count: endCount,
      content_start_count: contentStartCount,
      content_end_count: contentEndCount,
      ends_with_source_file_end: endsWithSource
    }
  );
}

function detectWorkerReportComplete(rawText) {
  const text = String(rawText || '');
  const startCount = countMarker(text, 'WORKER_REPORT_START');
  const endCount = countMarker(text, 'WORKER_REPORT_END');
  const hasReport = startCount > 0;
  const complete = hasReport && startCount === endCount && endCount > 0;
  const endsWithReport = lastNonEmptyLine(text) === 'WORKER_REPORT_END';
  const reasons = [];

  if (!hasReport) {
    reasons.push('WORKER_REPORT_START not found');
  }
  if (hasReport && !complete) {
    reasons.push('WORKER_REPORT_START and WORKER_REPORT_END counts differ');
  }
  if (complete) {
    reasons.push('WORKER_REPORT block appears complete');
  }

  return makeSignal(
    'worker_report',
    complete ? SIGNAL_STATUS.PASS : SIGNAL_STATUS.FAIL,
    complete ? 0.92 : hasReport ? 0.34 : 0,
    reasons,
    {
      worker_report_start_count: startCount,
      worker_report_end_count: endCount,
      ends_with_worker_report_end: endsWithReport
    }
  );
}

function detectCustomMarkers(rawText, rule) {
  const text = String(rawText || '');
  const allMarkers = normalizeStringArray(rule.custom_markers_all);
  const anyMarkers = normalizeStringArray(rule.custom_markers_any);
  const missingAllMarkers = allMarkers.filter((marker) => !containsMarker(text, marker));
  const matchedAnyMarkers = anyMarkers.filter((marker) => containsMarker(text, marker));
  const allPass = missingAllMarkers.length === 0;
  const anyPass = anyMarkers.length === 0 || matchedAnyMarkers.length > 0;
  const markerConfigured = allMarkers.length > 0 || anyMarkers.length > 0;
  const pass = markerConfigured ? allPass && anyPass : !rule.require_custom_markers;
  const reasons = [];

  if (!markerConfigured && !rule.require_custom_markers) {
    reasons.push('custom marker rule not required');
  }
  if (!markerConfigured && rule.require_custom_markers) {
    reasons.push('custom marker rule required but no markers configured');
  }
  if (missingAllMarkers.length > 0) {
    reasons.push(`missing required custom markers: ${missingAllMarkers.join(', ')}`);
  }
  if (anyMarkers.length > 0 && matchedAnyMarkers.length === 0) {
    reasons.push('none of the any-match custom markers were found');
  }
  if (pass && markerConfigured) {
    reasons.push('custom marker rule passed');
  }

  return makeSignal(
    'custom_markers',
    pass ? SIGNAL_STATUS.PASS : SIGNAL_STATUS.FAIL,
    pass ? 0.9 : 0.15,
    reasons,
    {
      required_all: allMarkers,
      required_any: anyMarkers,
      missing_all: missingAllMarkers,
      matched_any: matchedAnyMarkers
    }
  );
}

function detectIncompleteMarkers(rawText, rule) {
  const text = String(rawText || '');
  const found = normalizeStringArray(rule.incomplete_markers).filter((marker) => containsMarker(text, marker));
  const pass = found.length === 0;

  return makeSignal(
    'incomplete_markers',
    pass ? SIGNAL_STATUS.PASS : SIGNAL_STATUS.WARN,
    pass ? 1 : 0.25,
    pass ? ['no incomplete markers found'] : [`incomplete markers found: ${found.join(', ')}`],
    { found_markers: found }
  );
}

function detectStability(rawText, rule) {
  const stability = asObject(rule.stability);
  const currentText = String(rawText || '');
  const currentLength = currentText.length;
  const previousText = typeof stability.previous_text === 'string' ? stability.previous_text : '';
  const previousLength = Number.isFinite(Number(stability.previous_length)) ? Number(stability.previous_length) : previousText.length;
  const lengthDelta = Math.abs(currentLength - previousLength);
  const sameText = previousText.length > 0 && previousText === currentText;
  const stableByLength = lengthDelta <= numberOr(stability.length_delta_tolerance, 0);
  const stableByCycles = numberOr(stability.stable_cycles, 0) >= numberOr(stability.min_stable_cycles, 1);
  let stableByQuietTime = false;

  if (stability.last_changed_at && stability.now && numberOr(stability.quiet_ms, 0) > 0) {
    const lastChangedAt = Date.parse(stability.last_changed_at);
    const now = Date.parse(stability.now);
    stableByQuietTime = Number.isFinite(lastChangedAt) && Number.isFinite(now) && now - lastChangedAt >= numberOr(stability.quiet_ms, 0);
  }

  const stable = sameText || (stableByLength && stableByCycles) || stableByQuietTime;
  const reasons = [];

  if (sameText) {
    reasons.push('current text matches previous text');
  }
  if (stableByLength && stableByCycles) {
    reasons.push('length and stable cycle thresholds satisfied');
  }
  if (stableByQuietTime) {
    reasons.push('quiet time threshold satisfied');
  }
  if (!stable) {
    reasons.push('stability threshold not satisfied');
  }

  return makeSignal(
    'stability',
    stable ? SIGNAL_STATUS.PASS : SIGNAL_STATUS.FAIL,
    stable ? 0.88 : 0.18,
    reasons,
    {
      current_length: currentLength,
      previous_length: previousLength,
      length_delta: lengthDelta,
      stable_cycles: numberOr(stability.stable_cycles, 0),
      min_stable_cycles: numberOr(stability.min_stable_cycles, 1),
      quiet_ms: numberOr(stability.quiet_ms, 0)
    }
  );
}

function normalizeSignals(signals) {
  if (Array.isArray(signals)) {
    return signals.map((signal) => makeSignal(signal.name, signal.status, signal.confidence, signal.reasons, signal.details));
  }

  const source = asObject(signals);
  return Object.keys(source)
    .filter((key) => isPlainObject(source[key]))
    .map((key) => makeSignal(source[key].name || key, source[key].status, source[key].confidence, source[key].reasons, source[key].details));
}

function weightedConfidence(signalMap, rule) {
  const weights = {
    source_file_output: rule.source_file_weight,
    worker_report: rule.worker_report_weight,
    custom_markers: rule.custom_marker_weight,
    stability: rule.stability_weight
  };
  let weightedTotal = 0;
  let weightTotal = 0;

  Object.keys(weights).forEach((name) => {
    const signal = signalMap[name];
    const required = (
      name === 'source_file_output' && rule.require_source_file_end
    ) || (
      name === 'worker_report' && rule.require_worker_report_end
    ) || (
      name === 'custom_markers' && rule.require_custom_markers
    ) || (
      name === 'stability' && rule.require_stability
    );

    if (signal && (required || signal.status === SIGNAL_STATUS.PASS)) {
      weightedTotal += signal.confidence * weights[name];
      weightTotal += weights[name];
    }
  });

  if (weightTotal === 0) {
    return 0;
  }

  return clamp01(weightedTotal / weightTotal);
}

function buildCompletionDecision(signals) {
  const source = asObject(signals);
  const rule = createCompletionRule(source.rule || source.completion_rule || source);
  const signalList = normalizeSignals(source.signals || source);
  const signalMap = signalList.reduce((accumulator, signal) => {
    accumulator[signal.name] = signal;
    return accumulator;
  }, {});
  const reasons = [];
  const blockers = [];
  const warnings = [];
  let confidence = weightedConfidence(signalMap, rule);

  function requireSignal(name, enabled, label) {
    const signal = signalMap[name];
    if (!enabled) {
      return;
    }
    if (!signal || signal.status !== SIGNAL_STATUS.PASS) {
      blockers.push(`${label} not satisfied`);
    }
  }

  requireSignal('source_file_output', rule.require_source_file_end, 'SOURCE_FILE completion');
  requireSignal('worker_report', rule.require_worker_report_end, 'WORKER_REPORT completion');
  requireSignal('custom_markers', rule.require_custom_markers, 'custom marker completion');
  requireSignal('stability', rule.require_stability, 'stability completion');

  signalList.forEach((signal) => {
    signal.reasons.forEach((reason) => reasons.push(`${signal.name}: ${reason}`));
    if (signal.status === SIGNAL_STATUS.WARN) {
      warnings.push(signal.name);
      confidence = Math.max(0, confidence - rule.warn_penalty);
    }
    if (signal.name === 'incomplete_markers' && signal.status === SIGNAL_STATUS.WARN) {
      confidence = Math.max(0, confidence - rule.incomplete_penalty);
    }
  });

  let status = COMPLETION_STATUS.UNKNOWN;
  if (blockers.length > 0) {
    status = confidence > 0.35 ? COMPLETION_STATUS.PARTIAL : COMPLETION_STATUS.INCOMPLETE;
  } else if (confidence >= rule.min_confidence_for_complete) {
    status = warnings.length > 0 ? COMPLETION_STATUS.COMPLETE_WITH_WARNINGS : COMPLETION_STATUS.COMPLETE;
  } else if (signalMap.stability && signalMap.stability.status === SIGNAL_STATUS.PASS) {
    status = COMPLETION_STATUS.STABLE_INCOMPLETE;
  } else {
    status = confidence > 0.25 ? COMPLETION_STATUS.PARTIAL : COMPLETION_STATUS.INCOMPLETE;
  }

  return {
    object_type: COMPLETION_DECISION_OBJECT_TYPE,
    schema_version: SCHEMA_VERSION,
    status,
    is_complete: [COMPLETION_STATUS.COMPLETE, COMPLETION_STATUS.COMPLETE_WITH_WARNINGS].includes(status),
    should_send_next: [COMPLETION_STATUS.COMPLETE, COMPLETION_STATUS.COMPLETE_WITH_WARNINGS].includes(status),
    confidence: clamp01(confidence),
    min_confidence_for_complete: rule.min_confidence_for_complete,
    blockers,
    warnings,
    reasons,
    signals: signalList,
    rule
  };
}

function detectPromptCompletion(rawText, rules) {
  const text = String(rawText || '');
  const rule = createCompletionRule(rules);
  const sourceSignal = detectSourceFileOutputComplete(text);
  const reportSignal = detectWorkerReportComplete(text);
  const customSignal = detectCustomMarkers(text, rule);
  const incompleteSignal = detectIncompleteMarkers(text, rule);
  const stabilitySignal = detectStability(text, rule);
  const lengthSignal = makeSignal(
    'minimum_length',
    text.length >= rule.min_text_length ? SIGNAL_STATUS.PASS : SIGNAL_STATUS.FAIL,
    text.length >= rule.min_text_length ? 1 : 0,
    text.length >= rule.min_text_length ? ['minimum text length satisfied'] : ['minimum text length not satisfied'],
    { length: text.length, min_text_length: rule.min_text_length }
  );

  return buildCompletionDecision({
    rule,
    signals: [
      sourceSignal,
      reportSignal,
      customSignal,
      incompleteSignal,
      stabilitySignal,
      lengthSignal
    ]
  });
}

module.exports = {
  SCHEMA_VERSION,
  COMPLETION_RULE_OBJECT_TYPE,
  COMPLETION_DECISION_OBJECT_TYPE,
  COMPLETION_SIGNAL_OBJECT_TYPE,
  COMPLETION_STATUS,
  SIGNAL_STATUS,
  createCompletionRule,
  detectPromptCompletion,
  detectSourceFileOutputComplete,
  detectWorkerReportComplete,
  buildCompletionDecision
};