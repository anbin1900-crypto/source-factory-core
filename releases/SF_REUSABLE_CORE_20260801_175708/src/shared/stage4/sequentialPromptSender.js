'use strict';

const base = require('./sequentialPromptSender.base');
const correlation = require('./p1CommandCorrelationContract');

function getQueueItems(queueInput) {
  if (Array.isArray(queueInput)) return queueInput;
  if (queueInput && Array.isArray(queueInput.items)) return queueInput.items;
  if (queueInput && queueInput.queue && Array.isArray(queueInput.queue.items)) {
    return queueInput.queue.items;
  }
  return [];
}

function decorateObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }
  const sources = Array.prototype.slice.call(arguments, 1);
  let output = correlation.attachCorrelation.apply(null, [value].concat(sources));
  ['payload', 'selectedPrompt', 'prompt', 'dispatch', 'record'].forEach((key) => {
    if (output[key] && typeof output[key] === 'object' && !Array.isArray(output[key])) {
      output[key] = correlation.attachCorrelation.apply(
        null,
        [output[key], output].concat(sources)
      );
    }
  });
  return output;
}

function preventDuplicateSend(candidate, sentItems) {
  const result = base.preventDuplicateSend(candidate, sentItems);
  const output = decorateObject(result, candidate, ...(Array.isArray(sentItems) ? sentItems : []));
  if (!result.ok && correlation.containsDuplicateSuppressionEvidence(result)) {
    output.terminal = 'DUPLICATE_PROMPT_SUPPRESSED';
    output.terminal_status = 'DUPLICATE_PROMPT_SUPPRESSED';
    output.command_correlation.terminal_status = 'DUPLICATE_PROMPT_SUPPRESSED';
    output.second_execution_performed = false;
    output.execution_delta = 0;
  }
  return output;
}

function findDuplicateResult(queueInput, optionsInput) {
  const items = getQueueItems(queueInput);
  const options = optionsInput && typeof optionsInput === 'object' ? optionsInput : {};
  const sentItems = Array.isArray(options.sentItems)
    ? options.sentItems
    : Array.isArray(options.sent_items)
      ? options.sent_items
      : items;

  for (const item of items) {
    const result = preventDuplicateSend(item, sentItems);
    if (result.terminal_status === 'DUPLICATE_PROMPT_SUPPRESSED') {
      return result;
    }
  }
  return null;
}

function selectNextPrompt(queueInput, optionsInput) {
  const result = base.selectNextPrompt(queueInput, optionsInput);
  let output = decorateObject(result, ...getQueueItems(queueInput));
  if (!result.ok) {
    const duplicate = findDuplicateResult(queueInput, optionsInput);
    if (duplicate) {
      output = Object.assign({}, output, {
        reason: duplicate.reason,
        terminal: 'DUPLICATE_PROMPT_SUPPRESSED',
        terminal_status: 'DUPLICATE_PROMPT_SUPPRESSED',
        second_execution_performed: false,
        execution_delta: 0
      });
      output = decorateObject(output, duplicate);
    }
  }
  return output;
}

function buildSequentialPromptDispatch(queueItemInput, optionsInput) {
  const result = base.buildSequentialPromptDispatch(queueItemInput, optionsInput);
  let output = decorateObject(result, queueItemInput, optionsInput);
  if (correlation.containsDuplicateSuppressionEvidence(result)) {
    output.terminal = 'DUPLICATE_PROMPT_SUPPRESSED';
    output.terminal_status = 'DUPLICATE_PROMPT_SUPPRESSED';
    output.second_execution_performed = false;
    output.execution_delta = 0;
    output = decorateObject(output, queueItemInput, optionsInput);
  }
  return output;
}

function getNextDispatchPayload(queueInput, optionsInput) {
  const result = base.getNextDispatchPayload(queueInput, optionsInput);
  let output = decorateObject(result, ...getQueueItems(queueInput), optionsInput);
  if (!result.ok) {
    const duplicate = findDuplicateResult(queueInput, optionsInput);
    if (duplicate) {
      output = Object.assign({}, output, {
        terminal: 'DUPLICATE_PROMPT_SUPPRESSED',
        terminal_status: 'DUPLICATE_PROMPT_SUPPRESSED',
        duplicate_prompt_key: duplicate.duplicate_prompt_key || duplicate.dedupe_key || '',
        second_execution_performed: false,
        execution_delta: 0
      });
      output = decorateObject(output, duplicate);
    }
  }
  return output;
}

function markPromptSent(queueItem, patchInput) {
  return decorateObject(base.markPromptSent(queueItem, patchInput), queueItem, patchInput);
}

module.exports = Object.assign({}, base, {
  buildSequentialPromptDispatch,
  getNextDispatchPayload,
  selectNextPrompt,
  markPromptSent,
  preventDuplicateSend,
  __a4P1CorrelationRepair: {
    version: 'A4_P1_PANEL_WORKER_CORRELATION_REPAIR_V2',
    duplicate_terminal: 'DUPLICATE_PROMPT_SUPPRESSED',
    new_runtime: false,
    new_transport: false
  }
});
