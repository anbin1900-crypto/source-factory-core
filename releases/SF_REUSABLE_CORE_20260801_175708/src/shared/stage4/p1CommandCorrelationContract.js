'use strict';

const crypto = require('crypto');

const CORRELATION_FIELDS = Object.freeze([
  'command_id',
  'worker_slot_uid',
  'cycle_id',
  'wave_id',
  'directive_registered_at_kst',
  'result_published_at_kst',
  'terminal_status',
  'duplicate_prompt_key',
  'remote_pointer'
]);

const FIELD_ALIASES = Object.freeze({
  command_id: ['command_id', 'commandId'],
  worker_slot_uid: ['worker_slot_uid', 'workerSlotUid', 'worker_slot', 'workerSlot'],
  cycle_id: ['cycle_id', 'cycleId'],
  wave_id: ['wave_id', 'waveId'],
  directive_registered_at_kst: [
    'directive_registered_at_kst',
    'directiveRegisteredAtKst',
    'registered_at_kst',
    'registeredAtKst'
  ],
  result_published_at_kst: [
    'result_published_at_kst',
    'resultPublishedAtKst',
    'published_at_kst',
    'publishedAtKst'
  ],
  terminal_status: ['terminal_status', 'terminalStatus', 'terminal', 'status'],
  duplicate_prompt_key: [
    'duplicate_prompt_key',
    'duplicatePromptKey',
    'dedupe_key',
    'dedupeKey'
  ],
  remote_pointer: ['remote_pointer', 'remotePointer']
});

const NESTED_SOURCE_KEYS = Object.freeze([
  'command_correlation',
  'commandCorrelation',
  'metadata',
  'payload',
  'receipt',
  'result',
  'data',
  'panelCommandSummary',
  'panel_command_summary',
  'source',
  'gate_inputs',
  'gateInputs',
  'next_commander_action',
  'version_context'
]);

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneJsonValue);
  }
  if (isObject(value)) {
    const output = {};
    Object.keys(value).forEach((key) => {
      output[key] = cloneJsonValue(value[key]);
    });
    return output;
  }
  return value;
}

function isPresent(value) {
  if (value === 0 || value === false) {
    return true;
  }
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function expandSources(values) {
  const queue = Array.isArray(values) ? values.slice() : [values];
  const output = [];
  const seen = new Set();

  while (queue.length > 0) {
    const candidate = queue.shift();
    if (!isObject(candidate) || seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    output.push(candidate);
    NESTED_SOURCE_KEYS.forEach((key) => {
      if (isObject(candidate[key])) {
        queue.push(candidate[key]);
      }
    });
  }
  return output;
}

function pickFromSources(sources, aliases) {
  for (const source of sources) {
    for (const alias of aliases) {
      if (Object.prototype.hasOwnProperty.call(source, alias) && isPresent(source[alias])) {
        return cloneJsonValue(source[alias]);
      }
    }
  }
  return '';
}

function containsDuplicateSuppressionEvidence(value, seen) {
  const visited = seen || new Set();
  if (typeof value === 'string') {
    const text = value.toLowerCase();
    return text.includes('duplicate_dedupe_key_already_sent') ||
      text.includes('duplicate_prompt_suppressed');
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsDuplicateSuppressionEvidence(item, visited));
  }
  if (!isObject(value) || visited.has(value)) {
    return false;
  }
  visited.add(value);
  if (value.duplicate_detected === true && value.second_execution_performed === false) {
    return true;
  }
  return Object.keys(value).some((key) => {
    return containsDuplicateSuppressionEvidence(key, visited) ||
      containsDuplicateSuppressionEvidence(value[key], visited);
  });
}

function normalizeTerminalStatus(value, sources) {
  const allSources = Array.isArray(sources) ? sources : [sources];
  if (containsDuplicateSuppressionEvidence([value].concat(allSources))) {
    return 'DUPLICATE_PROMPT_SUPPRESSED';
  }

  if (!isPresent(value)) {
    return '';
  }
  return String(value).trim().toUpperCase();
}

function buildIdempotencyKey(correlationInput) {
  const correlation = isObject(correlationInput) ? correlationInput : {};
  const components = [
    correlation.command_id,
    correlation.worker_slot_uid,
    correlation.cycle_id,
    correlation.wave_id
  ].map((value) => isPresent(value) ? String(value) : '');

  if (components.some((value) => value === '')) {
    return '';
  }

  const preimage = JSON.stringify(components);
  return `a5-p1-command-${crypto.createHash('sha256').update(preimage, 'utf8').digest('hex')}`;
}

function extractCorrelation() {
  const sources = expandSources(Array.prototype.slice.call(arguments));
  const output = {};

  CORRELATION_FIELDS.forEach((field) => {
    output[field] = pickFromSources(sources, FIELD_ALIASES[field]);
  });

  output.terminal_status = normalizeTerminalStatus(output.terminal_status, sources);
  output.idempotency_key = buildIdempotencyKey(output);
  return output;
}

function attachCorrelation(record) {
  if (!isObject(record)) {
    return record;
  }
  const sources = Array.prototype.slice.call(arguments, 1).concat([record]);
  const correlation = extractCorrelation.apply(null, sources);
  const output = Object.assign({}, record);

  CORRELATION_FIELDS.forEach((field) => {
    output[field] = cloneJsonValue(correlation[field]);
  });
  if (correlation.idempotency_key) {
    output.idempotency_key = correlation.idempotency_key;
  }
  output.command_correlation = {};
  CORRELATION_FIELDS.forEach((field) => {
    output.command_correlation[field] = cloneJsonValue(correlation[field]);
  });
  if (correlation.idempotency_key) {
    output.command_correlation.idempotency_key = correlation.idempotency_key;
  }

  if (correlation.terminal_status === 'DUPLICATE_PROMPT_SUPPRESSED') {
    output.second_execution_performed = false;
    output.execution_delta = 0;
  }
  return output;
}

function missingCorrelationFields(record) {
  const correlation = extractCorrelation(record);
  return CORRELATION_FIELDS.filter((field) => !isPresent(correlation[field]));
}

module.exports = {
  CORRELATION_FIELDS,
  FIELD_ALIASES,
  extractCorrelation,
  attachCorrelation,
  normalizeTerminalStatus,
  containsDuplicateSuppressionEvidence,
  buildIdempotencyKey,
  missingCorrelationFields
};
