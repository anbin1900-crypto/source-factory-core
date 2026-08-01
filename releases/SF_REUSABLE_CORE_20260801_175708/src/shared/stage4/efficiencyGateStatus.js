'use strict';

const EFFICIENCY_GATE_STATUS = Object.freeze({
  GREEN: 'GREEN',
  YELLOW: 'YELLOW',
  RED: 'RED',
  BLACK: 'BLACK'
});

const EFFICIENCY_GATE_MEANING = Object.freeze({
  GREEN: 'immediate_execution_allowed',
  YELLOW: 'fast_combination_check_needed',
  RED: 'syntax_or_structure_execution_blocked',
  BLACK: 'explicit_current_user_instruction_violation'
});

const EXACT_GREEN_TOKENS = Object.freeze([
  'GREEN',
  'GREEN_FORMAT',
  'GREEN_NO_OMISSION',
  'GREEN_ESCAPE_OK',
  'PASS',
  'OK'
]);

const EXACT_YELLOW_TOKENS = Object.freeze([
  'YELLOW',
  'YELLOW_FORMAT_WARNING',
  'YELLOW_REVIEW_REQUIRED',
  'YELLOW_ESCAPE_REVIEW',
  'SKIP',
  'TOOL_MISSING'
]);

const EXACT_RED_TOKENS = Object.freeze([
  'RED',
  'RED_FORMAT_MISSING_FIELD',
  'RED_FORMAT_INVALID_MARKER',
  'RED_FORMAT_INVALID_OPERATION',
  'RED_FIX_REQUIRED',
  'RED_ESCAPE_SYNTAX_RISK',
  'FAIL'
]);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toText(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (value === null || typeof value === 'undefined') {
    return '';
  }
  return String(value);
}

function normalizeToken(value) {
  return toText(value).trim().toUpperCase();
}

function arrayHasItems(value) {
  return Array.isArray(value) && value.length > 0;
}

function makeReason(source, token, message) {
  return {
    source: source || 'input',
    token: token || '',
    message: message || ''
  };
}

function selectNextAction(status) {
  if (status === EFFICIENCY_GATE_STATUS.GREEN) {
    return 'proceed_to_next_assembly_or_execution_step';
  }
  if (status === EFFICIENCY_GATE_STATUS.YELLOW) {
    return 'run_fast_combination_check_or_commander_review';
  }
  if (status === EFFICIENCY_GATE_STATUS.RED) {
    return 'create_small_red_hotfix_request';
  }
  return 'separate_black_item_and_request_current_user_instruction_confirmation';
}

function makeGateResult(status, reasons, blockers, warnings, inputSummary) {
  return {
    status: status,
    color: status,
    meaning: EFFICIENCY_GATE_MEANING[status],
    immediate_execution_allowed: status === EFFICIENCY_GATE_STATUS.GREEN,
    fast_combination_check_needed: status === EFFICIENCY_GATE_STATUS.YELLOW,
    syntax_or_structure_execution_blocked: status === EFFICIENCY_GATE_STATUS.RED,
    explicit_current_user_instruction_violation: status === EFFICIENCY_GATE_STATUS.BLACK,
    isBlocked: status === EFFICIENCY_GATE_STATUS.RED || status === EFFICIENCY_GATE_STATUS.BLACK,
    reasons: reasons,
    blockers: blockers,
    warnings: warnings,
    inputSummary: inputSummary || {},
    nextAction: selectNextAction(status)
  };
}

function collectTokens(input) {
  const tokens = [];

  if (!isPlainObject(input)) {
    return tokens;
  }

  [
    'status',
    'color',
    'recommendedStatus',
    'formatStatus',
    'syntaxStatus',
    'omissionStatus',
    'escapeStatus',
    'gateStatus'
  ].forEach(function collectField(field) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      const token = normalizeToken(input[field]);
      if (token) {
        tokens.push({ field: field, token: token });
      }
    }
  });

  if (isPlainObject(input.result)) {
    collectTokens(input.result).forEach(function appendNested(token) {
      tokens.push({ field: 'result.' + token.field, token: token.token });
    });
  }

  if (Array.isArray(input.results)) {
    input.results.forEach(function collectResult(result, index) {
      collectTokens(result).forEach(function appendResultToken(token) {
        tokens.push({ field: 'results[' + index + '].' + token.field, token: token.token });
      });
    });
  }

  return tokens;
}

function isExplicitBlackViolation(input, options) {
  if (isPlainObject(options) && options.currentUserExplicitInstructionViolation === true) {
    return true;
  }
  if (!isPlainObject(input)) {
    return false;
  }
  if (input.currentUserExplicitInstructionViolation === true) {
    return true;
  }
  if (input.explicitCurrentUserInstructionViolation === true) {
    return true;
  }
  return isPlainObject(input.flags) && input.flags.currentUserExplicitInstructionViolation === true;
}

function tokenIsGreen(token) {
  if (EXACT_GREEN_TOKENS.indexOf(token) !== -1) {
    return true;
  }
  return token.indexOf('GREEN_') === 0;
}

function tokenIsYellow(token) {
  if (EXACT_YELLOW_TOKENS.indexOf(token) !== -1) {
    return true;
  }
  return token.indexOf('YELLOW_') === 0;
}

function tokenIsRed(token) {
  if (EXACT_RED_TOKENS.indexOf(token) !== -1) {
    return true;
  }
  return token.indexOf('RED_') === 0 || token.indexOf('_FAIL') !== -1;
}

function summarizeInput(input) {
  if (!isPlainObject(input)) {
    return { input_type: typeof input };
  }
  return {
    path: toText(input.path || input.file_path || input.unit_path).trim(),
    worker_id: toText(input.worker_id || input.owner_worker).trim(),
    task_id: toText(input.task_id).trim(),
    status: toText(input.status || input.recommendedStatus || input.color).trim()
  };
}

function collectImplicitFlags(input, options) {
  const redFlags = [];
  const yellowFlags = [];

  if (!isPlainObject(input)) {
    redFlags.push(makeReason('input', 'INVALID_INPUT', 'gate input must be an object.'));
    return { redFlags: redFlags, yellowFlags: yellowFlags };
  }

  const primaryStatus = normalizeToken(input.status || input.recommendedStatus || input.color);

  if (input.hasBlockingOmission === true) {
    redFlags.push(makeReason('input.hasBlockingOmission', 'true', 'blocking omission requires small RED hotfix.'));
  }
  if (input.hasSyntaxRisk === true) {
    redFlags.push(makeReason('input.hasSyntaxRisk', 'true', 'syntax risk blocks immediate execution.'));
  }
  if (input.syntax_or_structure_execution_blocked === true) {
    redFlags.push(makeReason('input.syntax_or_structure_execution_blocked', 'true', 'syntax or structure blocker is true.'));
  }
  if (input.success === false && primaryStatus !== 'TOOL_MISSING' && primaryStatus !== 'SKIP') {
    redFlags.push(makeReason('input.success', 'false', 'validator reported unsuccessful result.'));
  }
  if (input.ok === false && primaryStatus !== 'TOOL_MISSING' && primaryStatus !== 'SKIP') {
    redFlags.push(makeReason('input.ok', 'false', 'validator reported ok=false.'));
  }
  if (arrayHasItems(input.errors)) {
    redFlags.push(makeReason('input.errors', String(input.errors.length), 'errors array is not empty.'));
  }
  if (arrayHasItems(input.blockers)) {
    redFlags.push(makeReason('input.blockers', String(input.blockers.length), 'blockers array is not empty.'));
  }

  if (input.hasReviewItems === true) {
    yellowFlags.push(makeReason('input.hasReviewItems', 'true', 'review item requires fast combination check.'));
  }
  if (input.fast_combination_check_needed === true) {
    yellowFlags.push(makeReason('input.fast_combination_check_needed', 'true', 'fast combination check flag is true.'));
  }
  if (arrayHasItems(input.warnings)) {
    yellowFlags.push(makeReason('input.warnings', String(input.warnings.length), 'warnings array is not empty.'));
  }
  if (primaryStatus === 'TOOL_MISSING') {
    if (isPlainObject(options) && options.toolMissingIsRed === true) {
      redFlags.push(makeReason('tool_missing', 'TOOL_MISSING', 'tool missing is configured as RED by options.toolMissingIsRed.'));
    } else {
      yellowFlags.push(makeReason('tool_missing', 'TOOL_MISSING', 'tool missing requires fast check, not security RED.'));
    }
  }
  if (primaryStatus === 'SKIP') {
    yellowFlags.push(makeReason('skip', 'SKIP', 'skipped check requires Commander review if this check was expected.'));
  }

  return { redFlags: redFlags, yellowFlags: yellowFlags };
}

function decideEfficiencyGateStatus(input, options) {
  const safeOptions = isPlainObject(options) ? options : {};
  const reasons = [];
  const blockers = [];
  const warnings = [];
  const inputSummary = summarizeInput(input);

  if (isExplicitBlackViolation(input, safeOptions)) {
    reasons.push(makeReason('explicit_instruction', 'BLACK', 'BLACK is returned only for explicit current user instruction violation.'));
    blockers.push(makeReason('explicit_instruction', 'currentUserExplicitInstructionViolation', 'current user instruction violation flag is true.'));
    return makeGateResult(EFFICIENCY_GATE_STATUS.BLACK, reasons, blockers, warnings, inputSummary);
  }

  const tokens = collectTokens(input);
  tokens.forEach(function classifyToken(item) {
    if (item.token === 'BLACK' || item.token.indexOf('BLACK_') === 0) {
      warnings.push(makeReason(item.field, item.token, 'BLACK-like token ignored because explicit violation flag is not true.'));
      return;
    }
    if (tokenIsRed(item.token)) {
      blockers.push(makeReason(item.field, item.token, 'syntax or structure status blocks execution.'));
      return;
    }
    if (tokenIsYellow(item.token)) {
      warnings.push(makeReason(item.field, item.token, 'fast combination check is needed.'));
      return;
    }
    if (tokenIsGreen(item.token)) {
      reasons.push(makeReason(item.field, item.token, 'green-compatible validation token.'));
    }
  });

  const implicit = collectImplicitFlags(input, safeOptions);
  blockers.push.apply(blockers, implicit.redFlags);
  warnings.push.apply(warnings, implicit.yellowFlags);

  if (blockers.length > 0) {
    reasons.push(makeReason('gate', 'RED', 'one or more syntax or structure blockers were found.'));
    return makeGateResult(EFFICIENCY_GATE_STATUS.RED, reasons, blockers, warnings, inputSummary);
  }

  if (warnings.length > 0) {
    reasons.push(makeReason('gate', 'YELLOW', 'no blocker found, but fast combination review is needed.'));
    return makeGateResult(EFFICIENCY_GATE_STATUS.YELLOW, reasons, blockers, warnings, inputSummary);
  }

  if (reasons.length === 0) {
    reasons.push(makeReason('gate', 'GREEN', 'no RED, YELLOW, or BLACK signal found.'));
  }
  return makeGateResult(EFFICIENCY_GATE_STATUS.GREEN, reasons, blockers, warnings, inputSummary);
}

function batchDecideEfficiencyGateStatus(items, options) {
  if (!Array.isArray(items)) {
    const result = decideEfficiencyGateStatus({ status: 'RED', errors: [{ message: 'items must be an array' }] }, options);
    return {
      status: result.status,
      color: result.color,
      meaning: result.meaning,
      success: false,
      counts: { total: 0, GREEN: 0, YELLOW: 0, RED: 1, BLACK: 0 },
      results: [],
      reasons: [makeReason('batch', 'INVALID_ITEMS', 'items must be an array.')],
      blockers: result.blockers,
      warnings: result.warnings,
      nextAction: result.nextAction
    };
  }

  const results = items.map(function decideItem(item, index) {
    const result = decideEfficiencyGateStatus(item, options);
    result.index = index;
    return result;
  });

  const counts = results.reduce(function reduceCounts(accumulator, result) {
    accumulator.total += 1;
    accumulator[result.status] += 1;
    return accumulator;
  }, { total: 0, GREEN: 0, YELLOW: 0, RED: 0, BLACK: 0 });

  let status = EFFICIENCY_GATE_STATUS.GREEN;
  if (counts.BLACK > 0) {
    status = EFFICIENCY_GATE_STATUS.BLACK;
  } else if (counts.RED > 0) {
    status = EFFICIENCY_GATE_STATUS.RED;
  } else if (counts.YELLOW > 0 || counts.total === 0) {
    status = EFFICIENCY_GATE_STATUS.YELLOW;
  }

  const blockers = [];
  const warnings = [];
  const reasons = [];
  results.forEach(function collectResult(result) {
    result.blockers.forEach(function collectBlocker(blocker) {
      blockers.push(Object.assign({ index: result.index }, blocker));
    });
    result.warnings.forEach(function collectWarning(warning) {
      warnings.push(Object.assign({ index: result.index }, warning));
    });
  });

  reasons.push(makeReason('batch', status, 'batch gate completed with GREEN=' + counts.GREEN + ', YELLOW=' + counts.YELLOW + ', RED=' + counts.RED + ', BLACK=' + counts.BLACK + '.'));
  if (counts.total === 0) {
    warnings.push(makeReason('batch', 'EMPTY_BATCH', 'empty batch should receive fast Commander review.'));
  }

  return {
    status: status,
    color: status,
    meaning: EFFICIENCY_GATE_MEANING[status],
    success: status === EFFICIENCY_GATE_STATUS.GREEN || status === EFFICIENCY_GATE_STATUS.YELLOW,
    counts: counts,
    results: results,
    reasons: reasons,
    blockers: blockers,
    warnings: warnings,
    nextAction: selectNextAction(status)
  };
}

module.exports = {
  EFFICIENCY_GATE_STATUS: EFFICIENCY_GATE_STATUS,
  EFFICIENCY_GATE_MEANING: EFFICIENCY_GATE_MEANING,
  decideEfficiencyGateStatus: decideEfficiencyGateStatus,
  batchDecideEfficiencyGateStatus: batchDecideEfficiencyGateStatus
};