'use strict';

const STABILITY_STATUS = Object.freeze({
  UNKNOWN: 'unknown',
  EMPTY: 'empty',
  CHANGING: 'changing',
  LIKELY_STREAMING: 'likely_streaming',
  LIKELY_STABLE: 'likely_stable',
  COMPLETE_MARKER_FOUND: 'complete_marker_found',
  WORKER_REPORT_COMPLETE: 'worker_report_complete',
  SOURCE_FILE_BLOCK_COMPLETE: 'source_file_block_complete',
});

const DEFAULT_OPTIONS = Object.freeze({
  minStableAgeMs: 2500,
  minSamplesForStableDecision: 2,
  maxLengthDeltaForStable: 0,
  markerConfidence: 0.9,
  sourceFileConfidence: 0.82,
  workerReportConfidence: 0.88,
  stableConfidence: 0.72,
  changingConfidence: 0.35,
});

const COMPLETION_MARKERS = Object.freeze([
  'WORKER_REPORT_END',
  '=== SOURCE_FILE_END ===',
  'FINAL_WORKER_RULE:',
]);

function nowIsoString() {
  return new Date().toISOString();
}

function normalizeString(value, fallback) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || fallback;
  }

  if (value === null || value === undefined) {
    return fallback;
  }

  const converted = String(value).trim();
  return converted || fallback;
}

function normalizeRawText(rawText) {
  if (rawText === null || rawText === undefined) {
    return '';
  }

  return String(rawText)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}

function normalizeOptions(options) {
  const source = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
  return Object.assign({}, DEFAULT_OPTIONS, source);
}

function parseTimeMs(value) {
  const fallback = Date.now();

  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : fallback;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function clampConfidence(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return 0;
  }

  if (numberValue < 0) {
    return 0;
  }

  if (numberValue > 1) {
    return 1;
  }

  return Number(numberValue.toFixed(3));
}

function countMarker(rawText, marker) {
  const text = normalizeRawText(rawText);
  if (!text || !marker) {
    return 0;
  }

  return text.split(marker).length - 1;
}

function hasAnyCompletionMarker(rawText) {
  const text = normalizeRawText(rawText);
  return COMPLETION_MARKERS.some((marker) => text.includes(marker));
}

function buildDecision(status, confidence, reason, details) {
  return Object.freeze({
    status,
    confidence: clampConfidence(confidence),
    reason: normalizeString(reason, 'stability_reason_not_provided'),
    is_stable: [
      STABILITY_STATUS.LIKELY_STABLE,
      STABILITY_STATUS.COMPLETE_MARKER_FOUND,
      STABILITY_STATUS.WORKER_REPORT_COMPLETE,
      STABILITY_STATUS.SOURCE_FILE_BLOCK_COMPLETE,
    ].includes(status),
    details: details && typeof details === 'object' && !Array.isArray(details) ? Object.assign({}, details) : {},
    decided_at: nowIsoString(),
  });
}

function createStabilitySample(rawText, capturedAt) {
  const text = normalizeRawText(rawText);
  const capturedAtValue = capturedAt || nowIsoString();
  const capturedAtMs = parseTimeMs(capturedAtValue);

  return Object.freeze({
    schema: 'stage4.taeo.stability_sample.v1',
    raw_text: text,
    text_length: text.length,
    captured_at: new Date(capturedAtMs).toISOString(),
    captured_at_ms: capturedAtMs,
    has_completion_marker: hasAnyCompletionMarker(text),
    has_worker_report_completion: detectWorkerReportCompletion(text).complete,
    has_source_file_block_completion: detectSourceFileBlockCompletion(text).complete,
  });
}

function compareStabilitySamples(previous, current, options) {
  const normalizedOptions = normalizeOptions(options);
  const previousSample = previous && typeof previous === 'object' && !Array.isArray(previous)
    ? previous
    : createStabilitySample('');
  const currentSample = current && typeof current === 'object' && !Array.isArray(current)
    ? current
    : createStabilitySample('');

  const previousLength = Number(previousSample.text_length || 0);
  const currentLength = Number(currentSample.text_length || 0);
  const lengthDelta = currentLength - previousLength;
  const absoluteLengthDelta = Math.abs(lengthDelta);
  const elapsedMs = Math.max(0, Number(currentSample.captured_at_ms || 0) - Number(previousSample.captured_at_ms || 0));
  const unchanged = absoluteLengthDelta <= normalizedOptions.maxLengthDeltaForStable;

  if (!currentLength) {
    return buildDecision(STABILITY_STATUS.EMPTY, 0.2, 'current_sample_has_no_text', {
      previous_length: previousLength,
      current_length: currentLength,
      length_delta: lengthDelta,
      elapsed_ms: elapsedMs,
    });
  }

  if (!unchanged) {
    return buildDecision(STABILITY_STATUS.CHANGING, normalizedOptions.changingConfidence, 'response_text_length_changed', {
      previous_length: previousLength,
      current_length: currentLength,
      length_delta: lengthDelta,
      elapsed_ms: elapsedMs,
    });
  }

  if (elapsedMs >= normalizedOptions.minStableAgeMs) {
    return buildDecision(STABILITY_STATUS.LIKELY_STABLE, normalizedOptions.stableConfidence, 'text_length_unchanged_for_minimum_stable_age', {
      previous_length: previousLength,
      current_length: currentLength,
      length_delta: lengthDelta,
      elapsed_ms: elapsedMs,
      min_stable_age_ms: normalizedOptions.minStableAgeMs,
    });
  }

  return buildDecision(STABILITY_STATUS.LIKELY_STREAMING, 0.45, 'text_unchanged_but_stable_age_not_reached', {
    previous_length: previousLength,
    current_length: currentLength,
    length_delta: lengthDelta,
    elapsed_ms: elapsedMs,
    min_stable_age_ms: normalizedOptions.minStableAgeMs,
  });
}

function detectWorkerReportCompletion(rawText) {
  const text = normalizeRawText(rawText);
  const startCount = countMarker(text, 'WORKER_REPORT_START');
  const endCount = countMarker(text, 'WORKER_REPORT_END');
  const complete = startCount > 0 && endCount >= startCount;

  return Object.freeze({
    complete,
    start_count: startCount,
    end_count: endCount,
    status: complete ? STABILITY_STATUS.WORKER_REPORT_COMPLETE : STABILITY_STATUS.UNKNOWN,
    reason: complete ? 'worker_report_start_and_end_markers_found' : 'worker_report_markers_not_complete',
  });
}

function detectSourceFileBlockCompletion(rawText) {
  const text = normalizeRawText(rawText);

  const sourceStartCount = countMarker(text, '=== SOURCE_FILE_START ===');
  const sourceEndCount = countMarker(text, '=== SOURCE_FILE_END ===');
  const contentStartCount = countMarker(text, '=== CONTENT_START ===');
  const contentEndCount = countMarker(text, '=== CONTENT_END ===');

  const hasAtLeastOneBlock = sourceStartCount > 0;
  const sourceMarkersBalanced = sourceEndCount >= sourceStartCount;
  const contentMarkersBalanced = contentStartCount > 0 && contentEndCount >= contentStartCount;
  const complete = hasAtLeastOneBlock && sourceMarkersBalanced && contentMarkersBalanced;

  return Object.freeze({
    complete,
    source_start_count: sourceStartCount,
    source_end_count: sourceEndCount,
    content_start_count: contentStartCount,
    content_end_count: contentEndCount,
    status: complete ? STABILITY_STATUS.SOURCE_FILE_BLOCK_COMPLETE : STABILITY_STATUS.UNKNOWN,
    reason: complete ? 'source_file_and_content_markers_balanced' : 'source_file_block_markers_not_complete',
  });
}

function buildStabilityDecision(samples, options) {
  const normalizedOptions = normalizeOptions(options);
  const safeSamples = Array.isArray(samples) ? samples.filter(Boolean) : [];

  if (safeSamples.length === 0) {
    return buildDecision(STABILITY_STATUS.UNKNOWN, 0, 'no_samples_provided', {
      sample_count: 0,
    });
  }

  const normalizedSamples = safeSamples.map((sample) => {
    if (sample && typeof sample === 'object' && !Array.isArray(sample) && typeof sample.raw_text === 'string') {
      return Object.freeze(Object.assign({}, sample, {
        text_length: Number(sample.text_length || sample.raw_text.length || 0),
        captured_at_ms: Number(sample.captured_at_ms || parseTimeMs(sample.captured_at)),
      }));
    }

    return createStabilitySample(sample);
  });

  const latest = normalizedSamples[normalizedSamples.length - 1];
  const latestText = normalizeRawText(latest.raw_text);

  if (!latestText) {
    return buildDecision(STABILITY_STATUS.EMPTY, 0.2, 'latest_sample_has_no_text', {
      sample_count: normalizedSamples.length,
    });
  }

  const workerReport = detectWorkerReportCompletion(latestText);
  if (workerReport.complete) {
    return buildDecision(STABILITY_STATUS.WORKER_REPORT_COMPLETE, normalizedOptions.workerReportConfidence, workerReport.reason, {
      sample_count: normalizedSamples.length,
      worker_report: workerReport,
    });
  }

  const sourceFileBlock = detectSourceFileBlockCompletion(latestText);
  if (sourceFileBlock.complete) {
    return buildDecision(STABILITY_STATUS.SOURCE_FILE_BLOCK_COMPLETE, normalizedOptions.sourceFileConfidence, sourceFileBlock.reason, {
      sample_count: normalizedSamples.length,
      source_file_block: sourceFileBlock,
    });
  }

  if (hasAnyCompletionMarker(latestText)) {
    return buildDecision(STABILITY_STATUS.COMPLETE_MARKER_FOUND, normalizedOptions.markerConfidence, 'generic_completion_marker_found', {
      sample_count: normalizedSamples.length,
      markers: COMPLETION_MARKERS.filter((marker) => latestText.includes(marker)),
    });
  }

  if (normalizedSamples.length < normalizedOptions.minSamplesForStableDecision) {
    return buildDecision(STABILITY_STATUS.UNKNOWN, 0.3, 'not_enough_samples_for_stability_decision', {
      sample_count: normalizedSamples.length,
      min_samples_for_stable_decision: normalizedOptions.minSamplesForStableDecision,
    });
  }

  const previous = normalizedSamples[normalizedSamples.length - 2];
  return compareStabilitySamples(previous, latest, normalizedOptions);
}

module.exports = {
  STABILITY_STATUS,
  createStabilitySample,
  compareStabilitySamples,
  detectWorkerReportCompletion,
  detectSourceFileBlockCompletion,
  buildStabilityDecision,
};