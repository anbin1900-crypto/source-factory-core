'use strict';

/**
 * Stage 4 Worker Report and Error Extractor
 *
 * Purpose:
 * - Extract WORKER_REPORT marker blocks from LAO panel output.
 * - Parse report fields into structured objects.
 * - Detect efficiency error candidates related to syntax, parse, missing markers, omitted code, and incomplete output.
 * - This helper does not perform final Gate judgment, execute code, write files, or modify runtime bindings.
 *
 * Usage example:
 *
 * const { extractWorkerReportsAndErrors } = require('./workerReportErrorExtractor');
 *
 * const result = extractWorkerReportsAndErrors(workerOutputText, { terminalRole: 'LAO' });
 * console.log(result.reports);
 * console.log(result.errorCandidates);
 */

const REPORT_MARKERS = Object.freeze({
  start: 'WORKER_REPORT_' + 'START',
  end: 'WORKER_REPORT_' + 'END'
});

const REQUIRED_REPORT_FIELDS = Object.freeze([
  'worker_id',
  'task_id',
  'worker_function_class',
  'files_created',
  'files_modified',
  'patch_requests_created',
  'report_only_artifacts',
  'tests_run',
  'tests_not_run',
  'class_contract_status',
  'priority_0_status',
  'known_risks',
  'next_needed'
]);

const ERROR_TYPES = Object.freeze({
  SYNTAX_ERROR: 'SYNTAX_ERROR',
  PARSE_ERROR: 'PARSE_ERROR',
  MISSING_MARKER: 'MISSING_MARKER',
  OMITTED_CODE: 'OMITTED_CODE',
  INCOMPLETE_OUTPUT: 'INCOMPLETE_OUTPUT',
  INVALID_REPORT_FORMAT: 'INVALID_REPORT_FORMAT',
  FALSE_PASS_CLAIM_CANDIDATE: 'FALSE_PASS_CLAIM_CANDIDATE'
});

const ROUTE_HINTS = Object.freeze({
  ERROR_REPORT: 'ERROR_REPORT',
  PANEL_RECORD: 'PANEL_RECORD',
  VALIDATION_STATION: 'VALIDATION_STATION',
  REPORT_STATION: 'REPORT_STATION',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED'
});

function normalizeRawText(rawText) {
  if (rawText === null || rawText === undefined) {
    return '';
  }

  if (typeof rawText === 'string') {
    return rawText;
  }

  if (typeof rawText === 'object') {
    try {
      return JSON.stringify(rawText, null, 2);
    } catch (error) {
      return String(rawText);
    }
  }

  return String(rawText);
}

function normalizeFieldName(value) {
  return String(value || '')
    .trim()
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
}

function compactUniqueList(items) {
  const seen = new Set();
  const output = [];

  for (const item of items) {
    if (!item) {
      continue;
    }

    if (seen.has(item)) {
      continue;
    }

    seen.add(item);
    output.push(item);
  }

  return output;
}

function countOccurrences(text, marker) {
  if (!text || !marker) {
    return 0;
  }

  let count = 0;
  let cursor = 0;

  while (cursor !== -1) {
    cursor = text.indexOf(marker, cursor);

    if (cursor !== -1) {
      count += 1;
      cursor += marker.length;
    }
  }

  return count;
}

function parseFieldValue(rawValue) {
  const value = String(rawValue || '').trim();

  if (!value) {
    return '';
  }

  if (/^(none|null|n\/a)$/i.test(value)) {
    return [];
  }

  return value;
}

function appendFieldLine(fields, fieldName, lineValue) {
  if (!fieldName) {
    return;
  }

  const value = String(lineValue || '').trim();

  if (!Object.prototype.hasOwnProperty.call(fields, fieldName)) {
    fields[fieldName] = [];
  }

  if (!Array.isArray(fields[fieldName])) {
    fields[fieldName] = fields[fieldName] ? [fields[fieldName]] : [];
  }

  if (value) {
    fields[fieldName].push(value.replace(/^[-*]\s*/, ''));
  }
}

function parseWorkerReportFields(reportBody) {
  const fields = {};
  const parseWarnings = [];
  const lines = String(reportBody || '').split(/\r?\n/);
  let currentField = '';

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    const keyValueMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/);

    if (keyValueMatch) {
      const fieldName = normalizeFieldName(keyValueMatch[1]);
      const fieldValue = parseFieldValue(keyValueMatch[2]);

      currentField = fieldName;

      if (Object.prototype.hasOwnProperty.call(fields, fieldName)) {
        parseWarnings.push({
          type: ERROR_TYPES.INVALID_REPORT_FORMAT,
          reason: 'duplicate_report_field',
          field: fieldName
        });
      }

      fields[fieldName] = fieldValue;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed) && currentField) {
      appendFieldLine(fields, currentField, trimmed);
      continue;
    }

    if (currentField) {
      appendFieldLine(fields, currentField, trimmed);
      continue;
    }

    parseWarnings.push({
      type: ERROR_TYPES.INVALID_REPORT_FORMAT,
      reason: 'report_line_without_field',
      line: trimmed
    });
  }

  for (const requiredField of REQUIRED_REPORT_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(fields, requiredField)) {
      parseWarnings.push({
        type: ERROR_TYPES.INVALID_REPORT_FORMAT,
        reason: 'missing_required_report_field',
        field: requiredField
      });
    }
  }

  return {
    fields: fields,
    parseWarnings: parseWarnings
  };
}

function buildErrorCandidate(type, reason, startIndex, endIndex, evidence, extra) {
  return Object.assign(
    {
      error_type: type,
      reason: reason,
      startIndex: Number.isInteger(startIndex) ? startIndex : -1,
      endIndex: Number.isInteger(endIndex) ? endIndex : -1,
      evidence: String(evidence || '').slice(0, 500),
      routeHints: [
        ROUTE_HINTS.ERROR_REPORT,
        ROUTE_HINTS.VALIDATION_STATION,
        ROUTE_HINTS.REPORT_STATION,
        ROUTE_HINTS.PANEL_RECORD
      ]
    },
    extra || {}
  );
}

function extractWorkerReportBlocks(text) {
  const reports = [];
  const errorCandidates = [];
  let cursor = 0;

  while (cursor < text.length) {
    const startIndex = text.indexOf(REPORT_MARKERS.start, cursor);

    if (startIndex === -1) {
      break;
    }

    const bodyStartIndex = startIndex + REPORT_MARKERS.start.length;
    const nextStartIndex = text.indexOf(REPORT_MARKERS.start, bodyStartIndex);
    const endIndex = text.indexOf(REPORT_MARKERS.end, bodyStartIndex);

    if (endIndex === -1 || (nextStartIndex !== -1 && nextStartIndex < endIndex)) {
      const invalidEnd = nextStartIndex !== -1 ? nextStartIndex : text.length;

      errorCandidates.push(buildErrorCandidate(
        ERROR_TYPES.MISSING_MARKER,
        'worker_report_end_marker_missing',
        startIndex,
        invalidEnd,
        text.slice(startIndex, invalidEnd),
        { marker: REPORT_MARKERS.end }
      ));

      cursor = invalidEnd > startIndex ? invalidEnd : bodyStartIndex;
      continue;
    }

    const rawBlock = text.slice(startIndex, endIndex + REPORT_MARKERS.end.length);
    const reportBody = text.slice(bodyStartIndex, endIndex).trim();
    const parsed = parseWorkerReportFields(reportBody);

    reports.push({
      report_index: reports.length,
      startIndex: startIndex,
      endIndex: endIndex + REPORT_MARKERS.end.length,
      rawBlock: rawBlock,
      reportBody: reportBody,
      fields: parsed.fields,
      parseWarnings: parsed.parseWarnings
    });

    cursor = endIndex + REPORT_MARKERS.end.length;
  }

  const startCount = countOccurrences(text, REPORT_MARKERS.start);
  const endCount = countOccurrences(text, REPORT_MARKERS.end);

  if (endCount > startCount) {
    errorCandidates.push(buildErrorCandidate(
      ERROR_TYPES.MISSING_MARKER,
      'worker_report_start_marker_missing_or_extra_end_marker',
      text.indexOf(REPORT_MARKERS.end),
      text.indexOf(REPORT_MARKERS.end) + REPORT_MARKERS.end.length,
      REPORT_MARKERS.end,
      {
        startMarkerCount: startCount,
        endMarkerCount: endCount
      }
    ));
  }

  return {
    reports: reports,
    errorCandidates: errorCandidates,
    startMarkerCount: startCount,
    endMarkerCount: endCount
  };
}

function findLineCandidates(text, patterns, type, reasonPrefix) {
  const output = [];
  const lines = String(text || '').split(/\r?\n/);
  let cursor = 0;

  for (const line of lines) {
    const lineStart = cursor;
    const lineEnd = cursor + line.length;

    for (const pattern of patterns) {
      if (pattern.test(line)) {
        output.push(buildErrorCandidate(
          type,
          reasonPrefix + ':' + String(pattern),
          lineStart,
          lineEnd,
          line.trim()
        ));
        break;
      }
    }

    cursor = lineEnd + 1;
  }

  return output;
}

function detectSyntaxAndParseErrors(text) {
  return findLineCandidates(
    text,
    [
      /\bSyntaxError\b/i,
      /\bTypeError\b/i,
      /\bReferenceError\b/i,
      /\bRangeError\b/i,
      /\bparse\s+error\b/i,
      /\bUnexpected\s+token\b/i,
      /\bUnexpected\s+end\b/i,
      /\bInvalid\s+or\s+unexpected\s+token\b/i,
      /\bJSON\.parse\b/i,
      /\bnode\s+--check\b/i,
      /\bfailed\b.*\bsyntax\b/i,
      /\b오류\b.*\b문법\b/i,
      /\b파싱\b.*\b오류\b/i
    ],
    ERROR_TYPES.SYNTAX_ERROR,
    'syntax_or_parse_error_candidate'
  );
}

function detectOmittedCodeCandidates(text) {
  return findLineCandidates(
    text,
    [
      /나머지는\s*동일/i,
      /생략/i,
      /\bTODO\s*only\b/i,
      /\bplaceholder\b/i,
      /\bomitted\b/i,
      /\bsame\s+as\s+above\b/i,
      /\brest\s+is\s+same\b/i,
      /\.\.\.\s*$/i,
      /파일\s*전체\s*내용\s*생략/i,
      /전체\s*코드가\s*아님/i
    ],
    ERROR_TYPES.OMITTED_CODE,
    'omitted_or_placeholder_code_candidate'
  );
}

function detectMissingMarkerCandidates(text) {
  const candidates = [];
  const sourceStart = '=== SOURCE_FILE_' + 'START ===';
  const sourceEnd = '=== SOURCE_FILE_' + 'END ===';
  const contentStart = '=== CONTENT_' + 'START ===';
  const contentEnd = '=== CONTENT_' + 'END ===';

  const markerPairs = [
    { start: sourceStart, end: sourceEnd, name: 'source_file_marker_pair' },
    { start: contentStart, end: contentEnd, name: 'content_marker_pair' },
    { start: REPORT_MARKERS.start, end: REPORT_MARKERS.end, name: 'worker_report_marker_pair' }
  ];

  for (const pair of markerPairs) {
    const startCount = countOccurrences(text, pair.start);
    const endCount = countOccurrences(text, pair.end);

    if (startCount !== endCount) {
      candidates.push(buildErrorCandidate(
        ERROR_TYPES.MISSING_MARKER,
        pair.name + '_count_mismatch',
        -1,
        -1,
        pair.name,
        {
          startMarker: pair.start,
          endMarker: pair.end,
          startMarkerCount: startCount,
          endMarkerCount: endCount
        }
      ));
    }
  }

  return candidates;
}

function detectIncompleteOutputCandidates(text) {
  return findLineCandidates(
    text,
    [
      /\bincomplete\b/i,
      /\btruncated\b/i,
      /잘림/i,
      /미완성/i,
      /완전하지\s*않/i,
      /누락/i,
      /missing\s+required/i,
      /missing\s+marker/i,
      /invalid\s+operation/i
    ],
    ERROR_TYPES.INCOMPLETE_OUTPUT,
    'incomplete_or_missing_output_candidate'
  );
}

function detectFalsePassClaimCandidates(text) {
  const candidates = [];
  const lines = String(text || '').split(/\r?\n/);
  let cursor = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    const hasPassClaim = /\bPASS\b|\bpassed\b|성공|통과/i.test(trimmed);
    const hasNotRunContext = /not\s+run|tests_not_run|실행하지\s*않|미실행/i.test(trimmed);

    if (hasPassClaim && hasNotRunContext) {
      candidates.push(buildErrorCandidate(
        ERROR_TYPES.FALSE_PASS_CLAIM_CANDIDATE,
        'pass_claim_with_not_run_context',
        cursor,
        cursor + line.length,
        trimmed
      ));
    }

    cursor += line.length + 1;
  }

  return candidates;
}

function buildMissingReportWarning(text, reports) {
  const hasWorkerOutputMarker = (
    /WORKER_ID\s*:/i.test(text) ||
    /TASK_ID\s*:/i.test(text) ||
    /worker_id\s*:/i.test(text) ||
    /task_id\s*:/i.test(text) ||
    /=== SOURCE_FILE_/i.test(text)
  );

  if (reports.length > 0) {
    return null;
  }

  if (!String(text || '').trim()) {
    return {
      exists: false,
      reason: 'empty_input'
    };
  }

  if (hasWorkerOutputMarker) {
    return {
      exists: true,
      reason: 'worker_like_output_without_worker_report_block',
      routeHints: [
        ROUTE_HINTS.REPORT_STATION,
        ROUTE_HINTS.REVIEW_REQUIRED,
        ROUTE_HINTS.PANEL_RECORD
      ]
    };
  }

  return {
    exists: false,
    reason: 'no_worker_report_block_detected'
  };
}

function summarize(reports, errorCandidates, missingReportWarning, markerInfo) {
  const errorTypeCounts = {};

  for (const candidate of errorCandidates) {
    if (!Object.prototype.hasOwnProperty.call(errorTypeCounts, candidate.error_type)) {
      errorTypeCounts[candidate.error_type] = 0;
    }

    errorTypeCounts[candidate.error_type] += 1;
  }

  return {
    reportCount: reports.length,
    errorCandidateCount: errorCandidates.length,
    hasWorkerReport: reports.length > 0,
    hasErrorCandidates: errorCandidates.length > 0,
    missingReportWarningExists: Boolean(missingReportWarning && missingReportWarning.exists),
    errorTypeCounts: errorTypeCounts,
    startMarkerCount: markerInfo.startMarkerCount,
    endMarkerCount: markerInfo.endMarkerCount,
    gateJudgmentPerformed: false,
    executionPerformed: false
  };
}

function extractWorkerReportsAndErrors(rawText, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const text = normalizeRawText(rawText);
  const reportExtraction = extractWorkerReportBlocks(text);
  const reports = reportExtraction.reports;
  const errorCandidates = []
    .concat(reportExtraction.errorCandidates)
    .concat(detectSyntaxAndParseErrors(text))
    .concat(detectOmittedCodeCandidates(text))
    .concat(detectMissingMarkerCandidates(text))
    .concat(detectIncompleteOutputCandidates(text))
    .concat(detectFalsePassClaimCandidates(text));

  for (const report of reports) {
    for (const warning of report.parseWarnings) {
      errorCandidates.push(buildErrorCandidate(
        ERROR_TYPES.INVALID_REPORT_FORMAT,
        warning.reason || 'worker_report_parse_warning',
        report.startIndex,
        report.endIndex,
        report.rawBlock,
        {
          report_index: report.report_index,
          warning: warning
        }
      ));
    }
  }

  const missingReportWarning = buildMissingReportWarning(text, reports);
  const uniqueErrorCandidates = compactUniqueList(errorCandidates.map(function makeKey(candidate) {
    return [
      candidate.error_type,
      candidate.reason,
      candidate.startIndex,
      candidate.endIndex,
      candidate.evidence
    ].join('::');
  })).map(function restoreCandidate(key) {
    return errorCandidates.find(function findCandidate(candidate) {
      return [
        candidate.error_type,
        candidate.reason,
        candidate.startIndex,
        candidate.endIndex,
        candidate.evidence
      ].join('::') === key;
    });
  });

  return {
    terminalRole: String(opts.terminalRole || opts.terminal || 'LAO').trim().toUpperCase() || 'LAO',
    reports: reports,
    errorCandidates: uniqueErrorCandidates,
    missingReportWarning: missingReportWarning,
    summary: summarize(
      reports,
      uniqueErrorCandidates,
      missingReportWarning,
      {
        startMarkerCount: reportExtraction.startMarkerCount,
        endMarkerCount: reportExtraction.endMarkerCount
      }
    ),
    supportedErrorTypes: Object.keys(ERROR_TYPES).map(function mapType(key) {
      return ERROR_TYPES[key];
    }),
    notes: [
      'extractor_only_no_gate_judgment',
      'efficiency_error_candidates_only',
      'commander_or_inspector_should_decide_final_status'
    ]
  };
}

module.exports = {
  extractWorkerReportsAndErrors,
  REPORT_MARKERS,
  REQUIRED_REPORT_FIELDS,
  ERROR_TYPES,
  ROUTE_HINTS
};