'use strict';

/**
 * Stage 4 SOURCE_FILE Block Extractor
 *
 * Purpose:
 * - Extract complete SOURCE_FILE blocks from LAO panel output.
 * - Return header, content, rawBlock, startIndex, endIndex, and parseWarnings.
 * - Separate malformed, missing-marker, and nested-marker candidates into invalidBlocks.
 * - This helper does not assemble files, write files, execute code, or replace existing assemblers.
 *
 * Usage example:
 *
 * const { extractSourceFileBlocks } = require('./sourceFileBlockExtractor');
 *
 * const result = extractSourceFileBlocks(laoOutputText, { terminalRole: 'LAO' });
 * console.log(result.blocks.length);
 * console.log(result.invalidBlocks.length);
 */

const MARKERS = Object.freeze({
  sourceStart: '=== SOURCE_FILE_' + 'START ===',
  sourceEnd: '=== SOURCE_FILE_' + 'END ===',
  contentStart: '=== CONTENT_' + 'START ===',
  contentEnd: '=== CONTENT_' + 'END ==='
});

const ALLOWED_OPERATIONS = Object.freeze([
  'create',
  'modify',
  'replace',
  'patch_request',
  'report_only'
]);

const REQUIRED_HEADER_FIELDS = Object.freeze([
  'path',
  'language',
  'purpose',
  'operation',
  'owner_worker',
  'target_stage'
]);

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

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
}

function normalizeOperation(value) {
  return String(value || '').trim().toLowerCase();
}

function countOccurrences(text, marker) {
  if (!text || !marker) {
    return 0;
  }

  let count = 0;
  let index = 0;

  while (index !== -1) {
    index = text.indexOf(marker, index);

    if (index !== -1) {
      count += 1;
      index += marker.length;
    }
  }

  return count;
}

function parseHeader(headerText) {
  const header = {};
  const headerLines = String(headerText || '').split(/\r?\n/);
  const parseWarnings = [];

  for (const line of headerLines) {
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/);

    if (!match) {
      parseWarnings.push({
        type: 'header_line_not_key_value',
        line: trimmed
      });
      continue;
    }

    const key = normalizeKey(match[1]);
    const value = match[2].trim();

    if (Object.prototype.hasOwnProperty.call(header, key)) {
      parseWarnings.push({
        type: 'duplicate_header_field',
        field: key
      });
      continue;
    }

    header[key] = value;
  }

  for (const field of REQUIRED_HEADER_FIELDS) {
    if (!header[field]) {
      parseWarnings.push({
        type: 'missing_required_header_field',
        field: field
      });
    }
  }

  const operation = normalizeOperation(header.operation);

  if (operation && ALLOWED_OPERATIONS.indexOf(operation) === -1) {
    parseWarnings.push({
      type: 'invalid_operation',
      field: 'operation',
      value: header.operation,
      allowed: ALLOWED_OPERATIONS.slice()
    });
  }

  if (operation && ALLOWED_OPERATIONS.indexOf(operation) !== -1) {
    header.operation = operation;
  }

  return {
    header,
    parseWarnings
  };
}

function buildInvalidBlock(reason, startIndex, endIndex, rawBlock, details) {
  return {
    reason: reason,
    startIndex: Number.isInteger(startIndex) ? startIndex : -1,
    endIndex: Number.isInteger(endIndex) ? endIndex : -1,
    rawBlock: rawBlock || '',
    details: details || {}
  };
}

function findNextMarkerPosition(text, fromIndex) {
  const markerEntries = [
    ['sourceStart', MARKERS.sourceStart],
    ['sourceEnd', MARKERS.sourceEnd],
    ['contentStart', MARKERS.contentStart],
    ['contentEnd', MARKERS.contentEnd]
  ];

  let nearest = null;

  for (const entry of markerEntries) {
    const markerName = entry[0];
    const marker = entry[1];
    const index = text.indexOf(marker, fromIndex);

    if (index === -1) {
      continue;
    }

    if (!nearest || index < nearest.index) {
      nearest = {
        markerName,
        marker,
        index
      };
    }
  }

  return nearest;
}

function extractSourceFileBlocks(rawText, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const text = normalizeRawText(rawText);
  const blocks = [];
  const invalidBlocks = [];
  let cursor = 0;

  while (cursor < text.length) {
    const startIndex = text.indexOf(MARKERS.sourceStart, cursor);

    if (startIndex === -1) {
      const orphanContentStart = text.indexOf(MARKERS.contentStart, cursor);
      const orphanContentEnd = text.indexOf(MARKERS.contentEnd, cursor);
      const orphanSourceEnd = text.indexOf(MARKERS.sourceEnd, cursor);
      const orphanCandidates = [orphanContentStart, orphanContentEnd, orphanSourceEnd]
        .filter(function filterIndex(index) {
          return index !== -1;
        })
        .sort(function sortIndex(a, b) {
          return a - b;
        });

      if (orphanCandidates.length > 0) {
        const orphanStart = orphanCandidates[0];
        invalidBlocks.push(buildInvalidBlock(
          'marker_without_source_file_start',
          orphanStart,
          text.length,
          text.slice(orphanStart),
          { terminalRole: opts.terminalRole || opts.terminal || 'LAO' }
        ));
      }

      break;
    }

    const contentStartIndex = text.indexOf(MARKERS.contentStart, startIndex + MARKERS.sourceStart.length);
    const sourceEndBeforeContent = text.indexOf(MARKERS.sourceEnd, startIndex + MARKERS.sourceStart.length);
    const nextSourceStartBeforeContent = text.indexOf(MARKERS.sourceStart, startIndex + MARKERS.sourceStart.length);

    if (
      contentStartIndex === -1 ||
      (sourceEndBeforeContent !== -1 && sourceEndBeforeContent < contentStartIndex) ||
      (nextSourceStartBeforeContent !== -1 && nextSourceStartBeforeContent < contentStartIndex)
    ) {
      const nextMarker = findNextMarkerPosition(text, startIndex + MARKERS.sourceStart.length);
      const invalidEnd = nextMarker ? nextMarker.index : text.length;

      invalidBlocks.push(buildInvalidBlock(
        'missing_content_start_marker',
        startIndex,
        invalidEnd,
        text.slice(startIndex, invalidEnd),
        {
          foundNextMarker: nextMarker ? nextMarker.markerName : null
        }
      ));

      cursor = invalidEnd > startIndex ? invalidEnd : startIndex + MARKERS.sourceStart.length;
      continue;
    }

    const headerTextStart = startIndex + MARKERS.sourceStart.length;
    const headerText = text.slice(headerTextStart, contentStartIndex).trim();

    const contentTextStart = contentStartIndex + MARKERS.contentStart.length;
    const contentEndIndex = text.indexOf(MARKERS.contentEnd, contentTextStart);

    if (contentEndIndex === -1) {
      invalidBlocks.push(buildInvalidBlock(
        'missing_content_end_marker',
        startIndex,
        text.length,
        text.slice(startIndex),
        {}
      ));
      break;
    }

    const sourceEndIndex = text.indexOf(MARKERS.sourceEnd, contentEndIndex + MARKERS.contentEnd.length);

    if (sourceEndIndex === -1) {
      invalidBlocks.push(buildInvalidBlock(
        'missing_source_file_end_marker',
        startIndex,
        text.length,
        text.slice(startIndex),
        {}
      ));
      break;
    }

    const nextNestedStart = text.indexOf(MARKERS.sourceStart, startIndex + MARKERS.sourceStart.length);

    if (nextNestedStart !== -1 && nextNestedStart < sourceEndIndex) {
      invalidBlocks.push(buildInvalidBlock(
        'nested_source_file_block_detected',
        startIndex,
        sourceEndIndex + MARKERS.sourceEnd.length,
        text.slice(startIndex, sourceEndIndex + MARKERS.sourceEnd.length),
        {
          nestedStartIndex: nextNestedStart
        }
      ));

      cursor = sourceEndIndex + MARKERS.sourceEnd.length;
      continue;
    }

    const content = text.slice(contentTextStart, contentEndIndex);
    const rawBlock = text.slice(startIndex, sourceEndIndex + MARKERS.sourceEnd.length);
    const parsedHeader = parseHeader(headerText);
    const parseWarnings = parsedHeader.parseWarnings.slice();

    const contentStartCount = countOccurrences(rawBlock, MARKERS.contentStart);
    const contentEndCount = countOccurrences(rawBlock, MARKERS.contentEnd);

    if (contentStartCount > 1) {
      parseWarnings.push({
        type: 'nested_content_start_marker_detected',
        count: contentStartCount
      });
    }

    if (contentEndCount > 1) {
      parseWarnings.push({
        type: 'nested_content_end_marker_detected',
        count: contentEndCount
      });
    }

    blocks.push({
      index: blocks.length,
      header: parsedHeader.header,
      content: content,
      rawBlock: rawBlock,
      startIndex: startIndex,
      endIndex: sourceEndIndex + MARKERS.sourceEnd.length,
      parseWarnings: parseWarnings
    });

    cursor = sourceEndIndex + MARKERS.sourceEnd.length;
  }

  return {
    terminalRole: String(opts.terminalRole || opts.terminal || 'LAO').trim().toUpperCase() || 'LAO',
    blocks: blocks,
    invalidBlocks: invalidBlocks,
    blockCount: blocks.length,
    invalidBlockCount: invalidBlocks.length,
    markerSummary: {
      sourceStart: countOccurrences(text, MARKERS.sourceStart),
      sourceEnd: countOccurrences(text, MARKERS.sourceEnd),
      contentStart: countOccurrences(text, MARKERS.contentStart),
      contentEnd: countOccurrences(text, MARKERS.contentEnd)
    },
    allowedOperations: ALLOWED_OPERATIONS.slice()
  };
}

module.exports = {
  extractSourceFileBlocks,
  MARKERS,
  ALLOWED_OPERATIONS,
  REQUIRED_HEADER_FIELDS
};