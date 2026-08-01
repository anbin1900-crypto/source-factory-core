'use strict';

const ESCAPE_STATUS = Object.freeze({
  GREEN_ESCAPE_OK: 'GREEN_ESCAPE_OK',
  YELLOW_ESCAPE_REVIEW: 'YELLOW_ESCAPE_REVIEW',
  RED_ESCAPE_SYNTAX_RISK: 'RED_ESCAPE_SYNTAX_RISK'
});

const ESCAPE_SEVERITY = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
});

const WINDOWS_DRIVE_RAW_PATTERN = /(?:^|[^A-Za-z0-9_])([A-Za-z]:\\)/;
const WINDOWS_UNC_RAW_PATTERN = /(?:^|[^\\])\\\\[A-Za-z0-9_.-]+\\[A-Za-z0-9_.-]+/;
const REGEXP_ESCAPE_CHARS = Object.freeze(['d', 'D', 's', 'S', 'w', 'W', 'b', 'B', 'p', 'P', 'k']);

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

function computeLineStarts(text) {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text.charAt(index) === '\n') {
      starts.push(index + 1);
    }
  }
  return starts;
}

function lineColumnFromIndex(lineStarts, index) {
  let low = 0;
  let high = lineStarts.length - 1;
  let lineIndex = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= index) {
      lineIndex = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return {
    line: lineIndex + 1,
    column: index - lineStarts[lineIndex] + 1
  };
}

function getLineByNumber(lines, lineNumber) {
  if (lineNumber < 1 || lineNumber > lines.length) {
    return '';
  }
  return lines[lineNumber - 1];
}

function trimSnippet(value, limit) {
  const safeLimit = typeof limit === 'number' && limit > 20 ? Math.floor(limit) : 180;
  const text = toText(value).replace(/\s+/g, ' ').trim();
  if (text.length <= safeLimit) {
    return text;
  }
  return text.slice(0, safeLimit - 1) + '…';
}

function makeIssue(ruleId, severity, position, snippet, reason) {
  return {
    ruleId: ruleId,
    severity: severity,
    line: position && position.line ? position.line : 1,
    column: position && position.column ? position.column : 1,
    snippet: trimSnippet(snippet, 180),
    reason: reason
  };
}

function isHex(value) {
  return /^[0-9a-fA-F]+$/.test(value);
}

function scanStringLiterals(text) {
  const lineStarts = computeLineStarts(text);
  const tokens = [];
  const issues = [];
  let state = 'normal';
  let quote = '';
  let startIndex = -1;
  let rawStart = -1;
  let index = 0;

  while (index < text.length) {
    const char = text.charAt(index);
    const next = text.charAt(index + 1);

    if (state === 'lineComment') {
      if (char === '\n') {
        state = 'normal';
      }
      index += 1;
      continue;
    }

    if (state === 'blockComment') {
      if (char === '*' && next === '/') {
        state = 'normal';
        index += 2;
        continue;
      }
      index += 1;
      continue;
    }

    if (state === 'string') {
      if (char === '\\') {
        index += 2;
        continue;
      }
      if (char === quote) {
        tokens.push({
          quote: quote,
          startIndex: startIndex,
          endIndex: index,
          raw: text.slice(rawStart, index)
        });
        state = 'normal';
        quote = '';
        startIndex = -1;
        rawStart = -1;
        index += 1;
        continue;
      }
      if (quote !== '`' && char === '\n') {
        const position = lineColumnFromIndex(lineStarts, startIndex);
        issues.push(makeIssue(
          'STRING_LITERAL_NEWLINE_SYNTAX_RISK',
          ESCAPE_SEVERITY.HIGH,
          position,
          text.slice(startIndex, index),
          'single or double quoted string contains a raw newline before the closing quote.'
        ));
        state = 'normal';
        quote = '';
        startIndex = -1;
        rawStart = -1;
        index += 1;
        continue;
      }
      index += 1;
      continue;
    }

    if (char === '/' && next === '/') {
      state = 'lineComment';
      index += 2;
      continue;
    }
    if (char === '/' && next === '*') {
      state = 'blockComment';
      index += 2;
      continue;
    }
    if (char === '\'' || char === '"' || char === '`') {
      state = 'string';
      quote = char;
      startIndex = index;
      rawStart = index + 1;
      index += 1;
      continue;
    }
    index += 1;
  }

  if (state === 'string' && startIndex >= 0) {
    const position = lineColumnFromIndex(lineStarts, startIndex);
    issues.push(makeIssue(
      'UNTERMINATED_STRING_LITERAL',
      ESCAPE_SEVERITY.HIGH,
      position,
      text.slice(startIndex, Math.min(text.length, startIndex + 120)),
      'string literal was opened but no closing quote was found.'
    ));
  }

  return { tokens: tokens, issues: issues };
}

function buildMaskedCode(text) {
  let output = '';
  let state = 'normal';
  let quote = '';
  let index = 0;

  while (index < text.length) {
    const char = text.charAt(index);
    const next = text.charAt(index + 1);

    if (state === 'lineComment') {
      output += char === '\n' ? '\n' : ' ';
      if (char === '\n') {
        state = 'normal';
      }
      index += 1;
      continue;
    }

    if (state === 'blockComment') {
      output += char === '\n' ? '\n' : ' ';
      if (char === '*' && next === '/') {
        output += ' ';
        state = 'normal';
        index += 2;
        continue;
      }
      index += 1;
      continue;
    }

    if (state === 'string') {
      output += char === '\n' ? '\n' : ' ';
      if (char === '\\') {
        if (index + 1 < text.length) {
          output += next === '\n' ? '\n' : ' ';
          index += 2;
        } else {
          index += 1;
        }
        continue;
      }
      if (char === quote) {
        state = 'normal';
        quote = '';
      }
      index += 1;
      continue;
    }

    if (char === '/' && next === '/') {
      output += '  ';
      state = 'lineComment';
      index += 2;
      continue;
    }
    if (char === '/' && next === '*') {
      output += '  ';
      state = 'blockComment';
      index += 2;
      continue;
    }
    if (char === '\'' || char === '"' || char === '`') {
      output += ' ';
      state = 'string';
      quote = char;
      index += 1;
      continue;
    }

    output += char;
    index += 1;
  }

  return output;
}

function isWindowsPathLikeRaw(raw) {
  return WINDOWS_DRIVE_RAW_PATTERN.test(raw) || WINDOWS_UNC_RAW_PATTERN.test(raw);
}

function findWindowsPathEscapeIssues(token, text, lineStarts, lines) {
  const issues = [];
  const raw = token.raw;
  if (!isWindowsPathLikeRaw(raw)) {
    return issues;
  }

  for (let offset = 0; offset < raw.length; offset += 1) {
    if (raw.charAt(offset) !== '\\') {
      continue;
    }

    const next = raw.charAt(offset + 1);
    const absoluteIndex = token.startIndex + 1 + offset;
    const position = lineColumnFromIndex(lineStarts, absoluteIndex);
    const lineText = getLineByNumber(lines, position.line);

    if (!next) {
      issues.push(makeIssue(
        'WINDOWS_PATH_TRAILING_BACKSLASH_LITERAL',
        ESCAPE_SEVERITY.HIGH,
        position,
        lineText,
        'path-like string has a trailing backslash before the closing quote; this can escape the quote and break syntax.'
      ));
      continue;
    }

    if (next === 'u') {
      if (raw.charAt(offset + 2) === '{') {
        const closeIndex = raw.indexOf('}', offset + 3);
        const body = closeIndex === -1 ? '' : raw.slice(offset + 3, closeIndex);
        if (closeIndex === -1 || !body || !isHex(body)) {
          issues.push(makeIssue(
            'WINDOWS_PATH_INVALID_UNICODE_BRACE_ESCAPE',
            ESCAPE_SEVERITY.HIGH,
            position,
            lineText,
            'path-like string contains an invalid unicode brace escape after \\u.'
          ));
        }
      } else if (!isHex(raw.slice(offset + 2, offset + 6)) || raw.slice(offset + 2, offset + 6).length < 4) {
        issues.push(makeIssue(
          'WINDOWS_PATH_INVALID_UNICODE_ESCAPE',
          ESCAPE_SEVERITY.HIGH,
          position,
          lineText,
          'path-like string contains \\u that is not followed by four hexadecimal characters.'
        ));
      }
      continue;
    }

    if (next === 'x') {
      if (!isHex(raw.slice(offset + 2, offset + 4)) || raw.slice(offset + 2, offset + 4).length < 2) {
        issues.push(makeIssue(
          'WINDOWS_PATH_INVALID_HEX_ESCAPE',
          ESCAPE_SEVERITY.HIGH,
          position,
          lineText,
          'path-like string contains \\x that is not followed by two hexadecimal characters.'
        ));
      }
      continue;
    }

    if (/^[1-9]$/.test(next)) {
      issues.push(makeIssue(
        'WINDOWS_PATH_NUMERIC_ESCAPE_SYNTAX_RISK',
        ESCAPE_SEVERITY.HIGH,
        position,
        lineText,
        'path-like string contains a numeric escape candidate that can break strict JavaScript syntax.'
      ));
      continue;
    }

    if (/^[nrtbfv0]$/.test(next)) {
      issues.push(makeIssue(
        'WINDOWS_PATH_CONTROL_ESCAPE_REVIEW',
        ESCAPE_SEVERITY.MEDIUM,
        position,
        lineText,
        'path-like string contains a JavaScript control escape such as \\n or \\t; the actual path may be changed.'
      ));
      continue;
    }

    if (/^[A-Za-z]$/.test(next)) {
      issues.push(makeIssue(
        'WINDOWS_PATH_SINGLE_BACKSLASH_REVIEW',
        ESCAPE_SEVERITY.MEDIUM,
        position,
        lineText,
        'path-like string contains a single backslash before a letter; double backslash or forward slash is usually safer.'
      ));
    }
  }

  return issues;
}

function countBackslashesBefore(raw, index) {
  let count = 0;
  let cursor = index - 1;
  while (cursor >= 0 && raw.charAt(cursor) === '\\') {
    count += 1;
    cursor -= 1;
  }
  return count;
}

function isRegExpConstructorArgument(token, text) {
  const before = text.slice(Math.max(0, token.startIndex - 80), token.startIndex);
  return /(?:^|[^A-Za-z0-9_$])(?:new\s+)?RegExp\s*\(\s*$/.test(before);
}

function findRegExpStringEscapeIssues(token, text, lineStarts, lines) {
  const issues = [];
  if (!isRegExpConstructorArgument(token, text)) {
    return issues;
  }

  const raw = token.raw;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw.charAt(index);
    if (REGEXP_ESCAPE_CHARS.indexOf(char) === -1) {
      continue;
    }
    const backslashCount = countBackslashesBefore(raw, index);
    if (backslashCount % 2 === 1) {
      const absoluteIndex = token.startIndex + 1 + index - backslashCount;
      const position = lineColumnFromIndex(lineStarts, absoluteIndex);
      issues.push(makeIssue(
        'REGEXP_CONSTRUCTOR_STRING_SINGLE_ESCAPE_REVIEW',
        ESCAPE_SEVERITY.MEDIUM,
        position,
        getLineByNumber(lines, position.line),
        'RegExp constructor string contains a single regex escape; use a double escaped source string such as \\\\d when that escape is intended.'
      ));
    }
  }

  return issues;
}

function findRegexLiteralCandidates(maskedText) {
  const candidates = [];
  const literalPattern = /(^|[=(:,!?:;\[\{\n\r]\s*)\/((?:\\.|[^/\\\n])+?)\/([a-z]*)/g;
  let match;

  while ((match = literalPattern.exec(maskedText)) !== null) {
    const prefix = match[1] || '';
    const literalStart = match.index + prefix.length;
    candidates.push({
      index: literalStart,
      pattern: match[2],
      flags: match[3] || '',
      raw: match[0].slice(prefix.length)
    });
  }

  return candidates;
}

function findRegexLiteralIssues(text, lineStarts, lines) {
  const masked = buildMaskedCode(text);
  const candidates = findRegexLiteralCandidates(masked);
  const issues = [];

  candidates.forEach(function validateCandidate(candidate) {
    const position = lineColumnFromIndex(lineStarts, candidate.index);
    try {
      new RegExp(candidate.pattern, candidate.flags);
    } catch (error) {
      issues.push(makeIssue(
        'REGEX_LITERAL_SYNTAX_RISK',
        ESCAPE_SEVERITY.HIGH,
        position,
        getLineByNumber(lines, position.line),
        'regex literal candidate cannot be compiled: ' + (error && error.message ? error.message : 'unknown regex error')
      ));
    }
  });

  return issues;
}

function chooseRecommendedStatus(issues) {
  if (issues.some(function hasHigh(issue) { return issue.severity === ESCAPE_SEVERITY.HIGH; })) {
    return ESCAPE_STATUS.RED_ESCAPE_SYNTAX_RISK;
  }
  if (issues.length > 0) {
    return ESCAPE_STATUS.YELLOW_ESCAPE_REVIEW;
  }
  return ESCAPE_STATUS.GREEN_ESCAPE_OK;
}

function chooseOverallSeverity(issues) {
  if (issues.some(function hasHigh(issue) { return issue.severity === ESCAPE_SEVERITY.HIGH; })) {
    return ESCAPE_SEVERITY.HIGH;
  }
  if (issues.some(function hasMedium(issue) { return issue.severity === ESCAPE_SEVERITY.MEDIUM; })) {
    return ESCAPE_SEVERITY.MEDIUM;
  }
  if (issues.length > 0) {
    return ESCAPE_SEVERITY.LOW;
  }
  return 'none';
}

function makeShortReason(status, issues) {
  if (status === ESCAPE_STATUS.RED_ESCAPE_SYNTAX_RISK) {
    return 'syntax-risk escape candidate found: ' + issues[0].ruleId;
  }
  if (status === ESCAPE_STATUS.YELLOW_ESCAPE_REVIEW) {
    return 'escape review candidate found: ' + issues[0].ruleId;
  }
  return 'no Windows path literal or regex escape risk candidates found.';
}

function normalizeMetadata(metadata) {
  const safeMetadata = isPlainObject(metadata) ? metadata : {};
  return {
    path: toText(safeMetadata.path).trim(),
    language: toText(safeMetadata.language).trim(),
    owner_worker: toText(safeMetadata.owner_worker).trim(),
    target_stage: toText(safeMetadata.target_stage).trim()
  };
}

function checkWindowsPathAndRegexEscapes(content, metadata, options) {
  const text = normalizeNewlines(content);
  const safeOptions = isPlainObject(options) ? options : {};
  const lineStarts = computeLineStarts(text);
  const lines = text.split('\n');
  const scanResult = scanStringLiterals(text);
  let issues = [];

  issues = issues.concat(scanResult.issues);
  scanResult.tokens.forEach(function inspectToken(token) {
    issues = issues.concat(findWindowsPathEscapeIssues(token, text, lineStarts, lines));
    issues = issues.concat(findRegExpStringEscapeIssues(token, text, lineStarts, lines));
  });

  if (safeOptions.skipRegexLiteralCheck !== true) {
    issues = issues.concat(findRegexLiteralIssues(text, lineStarts, lines));
  }

  issues.sort(function sortByLocation(left, right) {
    if (left.line !== right.line) {
      return left.line - right.line;
    }
    return left.column - right.column;
  });

  const recommendedStatus = chooseRecommendedStatus(issues);
  return {
    success: recommendedStatus !== ESCAPE_STATUS.RED_ESCAPE_SYNTAX_RISK,
    recommendedStatus: recommendedStatus,
    severity: chooseOverallSeverity(issues),
    hasSyntaxRisk: recommendedStatus === ESCAPE_STATUS.RED_ESCAPE_SYNTAX_RISK,
    hasReviewItems: issues.length > 0,
    shortReason: makeShortReason(recommendedStatus, issues),
    issues: issues,
    counts: {
      totalIssues: issues.length,
      high: issues.filter(function isHigh(issue) { return issue.severity === ESCAPE_SEVERITY.HIGH; }).length,
      medium: issues.filter(function isMedium(issue) { return issue.severity === ESCAPE_SEVERITY.MEDIUM; }).length,
      low: issues.filter(function isLow(issue) { return issue.severity === ESCAPE_SEVERITY.LOW; }).length,
      lines: lines.length
    },
    metadata: normalizeMetadata(metadata),
    note: 'Windows path candidates are reported only to reduce syntax and combination failures; no path security rule is applied.'
  };
}

module.exports = {
  ESCAPE_STATUS: ESCAPE_STATUS,
  ESCAPE_SEVERITY: ESCAPE_SEVERITY,
  checkWindowsPathAndRegexEscapes: checkWindowsPathAndRegexEscapes
};