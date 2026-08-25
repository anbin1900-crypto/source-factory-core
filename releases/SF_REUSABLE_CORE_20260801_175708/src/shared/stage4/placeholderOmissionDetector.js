'use strict';

const OMISSION_RECOMMENDED_STATUS = Object.freeze({
  GREEN: 'GREEN_NO_OMISSION',
  YELLOW: 'YELLOW_REVIEW_REQUIRED',
  RED: 'RED_FIX_REQUIRED'
});

const OMISSION_SEVERITY = Object.freeze({
  NONE: 'none',
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  BLOCKING: 'blocking'
});

const BLOCKING_PHRASE_RULES = Object.freeze([
  {
    ruleId: 'KO_REST_SAME',
    label: 'korean_rest_same_omission',
    severity: OMISSION_SEVERITY.BLOCKING,
    pattern: /나머지는\s*(?:기존과\s*)?(?:동일|같음)/i
  },
  {
    ruleId: 'KO_OMITTED',
    label: 'korean_omitted_content',
    severity: OMISSION_SEVERITY.BLOCKING,
    pattern: /(?:이하|아래|나머지)?\s*(?:생략|생략함|생략합니다|생략됨)/i
  },
  {
    ruleId: 'KO_SAME_AS_EXISTING',
    label: 'korean_same_as_existing',
    severity: OMISSION_SEVERITY.BLOCKING,
    pattern: /(?:기존|위|앞)\s*(?:과|와)?\s*(?:동일|같음)/i
  },
  {
    ruleId: 'EN_REST_SAME',
    label: 'english_rest_same_omission',
    severity: OMISSION_SEVERITY.BLOCKING,
    pattern: /\b(?:rest|remaining|remainder)\b.{0,24}\b(?:same|unchanged)\b/i
  },
  {
    ruleId: 'EN_SAME_AS_ABOVE',
    label: 'english_same_as_above',
    severity: OMISSION_SEVERITY.BLOCKING,
    pattern: /\b(?:same\s+as\s+(?:above|before|previous|existing)|as\s+above)\b/i
  },
  {
    ruleId: 'EN_IMPLEMENTATION_OMITTED',
    label: 'english_implementation_omitted',
    severity: OMISSION_SEVERITY.BLOCKING,
    pattern: /\b(?:implementation|code|content|body)\s+(?:is\s+)?(?:omitted|skipped|excluded)\b/i
  },
  {
    ruleId: 'EN_BREVITY_OMISSION',
    label: 'english_brevity_omission',
    severity: OMISSION_SEVERITY.BLOCKING,
    pattern: /\bomitted\s+for\s+brevity\b/i
  },
  {
    ruleId: 'EN_PLACEHOLDER_ONLY',
    label: 'english_placeholder_only',
    severity: OMISSION_SEVERITY.BLOCKING,
    pattern: /\b(?:placeholder|stub|skeleton|todo)\s+only\b/i
  }
]);

const CODE_PLACEHOLDER_RULES = Object.freeze([
  {
    ruleId: 'JS_THROW_NOT_IMPLEMENTED',
    label: 'javascript_not_implemented_throw',
    severity: OMISSION_SEVERITY.BLOCKING,
    pattern: /throw\s+new\s+Error\s*\(\s*['"`]\s*(?:not\s+implemented|implementation\s+omitted|stub|todo)\s*['"`]/i
  },
  {
    ruleId: 'PY_NOT_IMPLEMENTED_ERROR',
    label: 'python_not_implemented_error',
    severity: OMISSION_SEVERITY.BLOCKING,
    pattern: /\braise\s+NotImplementedError\b/i
  },
  {
    ruleId: 'PY_PASS_TODO',
    label: 'python_pass_todo_placeholder',
    severity: OMISSION_SEVERITY.HIGH,
    pattern: /^\s*pass\s*(?:#.*\b(?:todo|placeholder|stub|implement)\b.*)?$/i
  }
]);

const TODO_WARNING_RULE = Object.freeze({
  ruleId: 'TODO_COMMENT_LINE',
  label: 'todo_or_fixme_comment_line',
  severity: OMISSION_SEVERITY.MEDIUM,
  pattern: /^\s*(?:(?:\/\/|#|\/\*|\*|<!--|-->)\s*)?(?:TODO|FIXME|TBD)\b/i
});

const PLACEHOLDER_ONLY_LINE_PATTERN = /^(?:(?:TODO|FIXME|TBD)\b.*|(?:placeholder|stub|skeleton)(?:\s+only)?|(?:implementation|code|content|body)\s+(?:is\s+)?(?:omitted|skipped|excluded)|omitted\s+for\s+brevity|same\s+as\s+(?:above|before|previous|existing)|as\s+above|rest\s+(?:is\s+)?(?:same|unchanged)|나머지는\s*(?:기존과\s*)?(?:동일|같음)|(?:이하|아래|나머지)?\s*(?:생략|생략함|생략합니다|생략됨)|(?:기존|위|앞)\s*(?:과|와)?\s*(?:동일|같음)|\.\.\.|…|pass)$/i;

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

function normalizeNewlines(value) {
  return toText(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function firstNonEmpty(values) {
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return '';
}

function trimExcerpt(value, limit) {
  const safeLimit = typeof limit === 'number' && limit > 20 ? Math.floor(limit) : 160;
  const singleLine = toText(value).replace(/\s+/g, ' ').trim();
  if (singleLine.length <= safeLimit) {
    return singleLine;
  }
  return singleLine.slice(0, safeLimit - 1) + '…';
}

function cleanContextLine(line) {
  return toText(line)
    .replace(/^\s*(?:\/\/|#|\/\*+|\*+\/|\*|<!--|-->|;)+\s*/, '')
    .replace(/^\s*(?:[-*+]\s+|>\s*)/, '')
    .trim();
}

function isNegatedInstructionContext(line) {
  const context = cleanContextLine(line).toLowerCase();
  if (!context) {
    return false;
  }
  return /(?:금지|하지\s*않|하면\s*안|사용하지\s*말|쓰지\s*말)/.test(context) ||
    /\b(?:do\s+not|don't|must\s+not|no|without|avoid|forbid|forbidden)\b.{0,40}\b(?:omit|omission|omitted|placeholder|todo|stub|same\s+as\s+above)\b/i.test(context);
}

function isRuleDefinitionOrDetectorSourceLine(line) {
  const text = toText(line).trim();
  if (!text) {
    return false;
  }
  return /\b(?:ruleId|pattern|BLOCKING_PHRASE_RULES|CODE_PLACEHOLDER_RULES|PLACEHOLDER_ONLY_LINE_PATTERN|TODO_WARNING_RULE)\b/.test(text) ||
    /new\s+RegExp\b/.test(text);
}

function shouldSkipPhraseScan(line, options) {
  if (options && options.allowNegatedInstructionContext !== false && isNegatedInstructionContext(line)) {
    return true;
  }
  return isRuleDefinitionOrDetectorSourceLine(line);
}

function lineLooksLikeCommentOrText(line) {
  const trimmed = toText(line).trim();
  if (!trimmed) {
    return false;
  }
  if (/^(?:\/\/|#|\/\*|\*|<!--|-->|[-*+]\s+|>\s*)/.test(trimmed)) {
    return true;
  }
  if (/^(?:const|let|var|function|class|if|for|while|return|module\.exports|exports\.|import\s|export\s)\b/.test(trimmed)) {
    return false;
  }
  if (/[{};]/.test(trimmed) && !/[가-힣]/.test(trimmed)) {
    return false;
  }
  return true;
}

function makeMatch(rule, lineNumber, line, matchedText) {
  return {
    ruleId: rule.ruleId,
    label: rule.label,
    severity: rule.severity,
    line: lineNumber,
    excerpt: trimExcerpt(line, 160),
    matchedText: trimExcerpt(matchedText || '', 80)
  };
}

function scanBlockingPhraseRules(lines, options) {
  const matches = [];
  lines.forEach(function scanLine(line, lineIndex) {
    if (!lineLooksLikeCommentOrText(line) || shouldSkipPhraseScan(line, options)) {
      return;
    }
    BLOCKING_PHRASE_RULES.forEach(function scanRule(rule) {
      const matched = line.match(rule.pattern);
      if (matched) {
        matches.push(makeMatch(rule, lineIndex + 1, line, matched[0]));
      }
    });
  });
  return matches;
}

function scanCodePlaceholderRules(lines, options) {
  const matches = [];
  lines.forEach(function scanLine(line, lineIndex) {
    if (shouldSkipPhraseScan(line, options)) {
      return;
    }
    CODE_PLACEHOLDER_RULES.forEach(function scanRule(rule) {
      const matched = line.match(rule.pattern);
      if (matched) {
        matches.push(makeMatch(rule, lineIndex + 1, line, matched[0]));
      }
    });
  });
  return matches;
}

function scanTodoWarnings(lines, options) {
  if (options && options.ignoreTodoWarning === true) {
    return [];
  }
  const matches = [];
  lines.forEach(function scanLine(line, lineIndex) {
    if (shouldSkipPhraseScan(line, options)) {
      return;
    }
    const matched = line.match(TODO_WARNING_RULE.pattern);
    if (matched) {
      matches.push(makeMatch(TODO_WARNING_RULE, lineIndex + 1, line, matched[0]));
    }
  });
  return matches;
}

function normalizeLineForOnlyCheck(line) {
  return cleanContextLine(line)
    .replace(/^`{3,}.*$/, '')
    .replace(/^\s*[{}()[\],;]+\s*$/, '')
    .trim();
}

function detectPlaceholderOnlyContent(content, options) {
  const lines = normalizeNewlines(content).split('\n');
  const meaningfulLines = lines
    .map(normalizeLineForOnlyCheck)
    .filter(function keepMeaningfulLine(line) {
      return line.length > 0;
    });

  if (meaningfulLines.length === 0) {
    return {
      isPlaceholderOnly: false,
      warning: {
        ruleId: 'EMPTY_CONTENT',
        label: 'empty_content_for_omission_detector',
        severity: OMISSION_SEVERITY.LOW,
        line: null,
        excerpt: '',
        matchedText: ''
      }
    };
  }

  if (options && options.disablePlaceholderOnlyCheck === true) {
    return { isPlaceholderOnly: false, warning: null };
  }

  const allPlaceholder = meaningfulLines.every(function isPlaceholderLine(line) {
    return PLACEHOLDER_ONLY_LINE_PATTERN.test(line);
  });

  if (!allPlaceholder) {
    return { isPlaceholderOnly: false, warning: null };
  }

  return {
    isPlaceholderOnly: true,
    match: {
      ruleId: 'PLACEHOLDER_ONLY_CONTENT',
      label: 'content_contains_only_placeholder_or_omission_text',
      severity: OMISSION_SEVERITY.BLOCKING,
      line: null,
      excerpt: trimExcerpt(meaningfulLines.join(' | '), 160),
      matchedText: 'placeholder-only-content'
    }
  };
}

function getMetadataValue(metadata, key) {
  if (!isPlainObject(metadata)) {
    return '';
  }
  return toText(metadata[key]).trim();
}

function selectRecommendedStatus(hasBlockingOmission, warningMatches) {
  if (hasBlockingOmission) {
    return OMISSION_RECOMMENDED_STATUS.RED;
  }
  if (warningMatches.length > 0) {
    return OMISSION_RECOMMENDED_STATUS.YELLOW;
  }
  return OMISSION_RECOMMENDED_STATUS.GREEN;
}

function selectSeverity(hasBlockingOmission, warningMatches) {
  if (hasBlockingOmission) {
    return OMISSION_SEVERITY.BLOCKING;
  }
  if (warningMatches.some(function hasMediumWarning(match) { return match.severity === OMISSION_SEVERITY.MEDIUM; })) {
    return OMISSION_SEVERITY.MEDIUM;
  }
  if (warningMatches.length > 0) {
    return OMISSION_SEVERITY.LOW;
  }
  return OMISSION_SEVERITY.NONE;
}

function makeShortReason(recommendedStatus, matches, warnings) {
  if (recommendedStatus === OMISSION_RECOMMENDED_STATUS.RED) {
    return 'blocking omission placeholder found: ' + matches[0].label;
  }
  if (recommendedStatus === OMISSION_RECOMMENDED_STATUS.YELLOW) {
    return 'possible omission warning found: ' + warnings[0].label;
  }
  return 'no placeholder, TODO-only, or omitted-content marker found.';
}

function detectPlaceholderOmissions(content, metadata, options) {
  const safeMetadata = isPlainObject(metadata) ? metadata : {};
  const safeOptions = isPlainObject(options) ? options : {};
  const text = normalizeNewlines(content);
  const lines = text.split('\n');

  const blockingMatches = [];
  const phraseMatches = scanBlockingPhraseRules(lines, safeOptions);
  const codeMatches = scanCodePlaceholderRules(lines, safeOptions);
  blockingMatches.push.apply(blockingMatches, phraseMatches);
  blockingMatches.push.apply(blockingMatches, codeMatches);

  const placeholderOnlyResult = detectPlaceholderOnlyContent(text, safeOptions);
  if (placeholderOnlyResult.isPlaceholderOnly) {
    blockingMatches.unshift(placeholderOnlyResult.match);
  }

  const warnings = scanTodoWarnings(lines, safeOptions);
  if (placeholderOnlyResult.warning) {
    warnings.push(placeholderOnlyResult.warning);
  }

  const hasBlockingOmission = blockingMatches.length > 0;
  const recommendedStatus = selectRecommendedStatus(hasBlockingOmission, warnings);
  const severity = selectSeverity(hasBlockingOmission, warnings);

  return {
    success: true,
    hasBlockingOmission: hasBlockingOmission,
    severity: severity,
    recommendedStatus: recommendedStatus,
    shortReason: makeShortReason(recommendedStatus, blockingMatches, warnings),
    matches: blockingMatches,
    warnings: warnings,
    counts: {
      blockingMatches: blockingMatches.length,
      warnings: warnings.length,
      totalLines: lines.length
    },
    metadata: {
      path: getMetadataValue(safeMetadata, 'path'),
      language: getMetadataValue(safeMetadata, 'language'),
      owner_worker: getMetadataValue(safeMetadata, 'owner_worker'),
      target_stage: getMetadataValue(safeMetadata, 'target_stage')
    }
  };
}

function sourceUnitToContentAndMetadata(unit) {
  if (typeof unit === 'string') {
    return { content: unit, metadata: {} };
  }
  if (!isPlainObject(unit)) {
    return { content: '', metadata: { input_type: typeof unit } };
  }

  const content = firstNonEmpty([
    typeof unit.content === 'string' ? unit.content : '',
    typeof unit.body === 'string' ? unit.body : '',
    typeof unit.text === 'string' ? unit.text : ''
  ]);

  return {
    content: content,
    metadata: {
      path: toText(unit.path).trim(),
      language: toText(unit.language).trim(),
      owner_worker: toText(unit.owner_worker).trim(),
      target_stage: toText(unit.target_stage).trim(),
      operation: toText(unit.operation).trim(),
      index: typeof unit.index === 'number' ? unit.index : null
    }
  };
}

function detectOmissionBatch(sourceUnits, options) {
  if (!Array.isArray(sourceUnits)) {
    return {
      success: false,
      hasBlockingOmission: true,
      severity: OMISSION_SEVERITY.BLOCKING,
      recommendedStatus: OMISSION_RECOMMENDED_STATUS.RED,
      shortReason: 'sourceUnits must be an array.',
      counts: { total: 0, green: 0, yellow: 0, red: 1 },
      results: [],
      errors: [{ code: 'SOURCE_UNITS_NOT_ARRAY', message: 'sourceUnits must be an array.' }],
      warnings: []
    };
  }

  const results = sourceUnits.map(function detectUnit(unit, index) {
    const converted = sourceUnitToContentAndMetadata(unit);
    const result = detectPlaceholderOmissions(converted.content, converted.metadata, options);
    result.index = index;
    return result;
  });

  const counts = results.reduce(function reduceCounts(accumulator, result) {
    accumulator.total += 1;
    if (result.recommendedStatus === OMISSION_RECOMMENDED_STATUS.RED) {
      accumulator.red += 1;
    } else if (result.recommendedStatus === OMISSION_RECOMMENDED_STATUS.YELLOW) {
      accumulator.yellow += 1;
    } else {
      accumulator.green += 1;
    }
    return accumulator;
  }, { total: 0, green: 0, yellow: 0, red: 0 });

  const hasBlockingOmission = counts.red > 0;
  const warningResults = results.filter(function isWarning(result) {
    return result.recommendedStatus === OMISSION_RECOMMENDED_STATUS.YELLOW;
  });
  const recommendedStatus = hasBlockingOmission
    ? OMISSION_RECOMMENDED_STATUS.RED
    : (warningResults.length > 0 ? OMISSION_RECOMMENDED_STATUS.YELLOW : OMISSION_RECOMMENDED_STATUS.GREEN);
  const severity = hasBlockingOmission
    ? OMISSION_SEVERITY.BLOCKING
    : (warningResults.length > 0 ? OMISSION_SEVERITY.MEDIUM : OMISSION_SEVERITY.NONE);

  return {
    success: !hasBlockingOmission,
    hasBlockingOmission: hasBlockingOmission,
    severity: severity,
    recommendedStatus: recommendedStatus,
    shortReason: hasBlockingOmission
      ? counts.red + ' unit(s) contain blocking omission placeholders.'
      : (counts.yellow > 0 ? counts.yellow + ' unit(s) contain omission warnings.' : 'no omission placeholders found in batch.'),
    counts: counts,
    results: results,
    errors: [],
    warnings: warningResults.map(function toWarningSummary(result) {
      return {
        index: result.index,
        path: result.metadata.path,
        shortReason: result.shortReason
      };
    })
  };
}

module.exports = {
  OMISSION_RECOMMENDED_STATUS: OMISSION_RECOMMENDED_STATUS,
  OMISSION_SEVERITY: OMISSION_SEVERITY,
  detectPlaceholderOmissions: detectPlaceholderOmissions,
  detectOmissionBatch: detectOmissionBatch
};