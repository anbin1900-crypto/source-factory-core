'use strict';

const FORMAT_STATUS = Object.freeze({
  GREEN_FORMAT: 'GREEN_FORMAT',
  RED_FORMAT_MISSING_FIELD: 'RED_FORMAT_MISSING_FIELD',
  RED_FORMAT_INVALID_MARKER: 'RED_FORMAT_INVALID_MARKER',
  RED_FORMAT_INVALID_OPERATION: 'RED_FORMAT_INVALID_OPERATION',
  YELLOW_FORMAT_WARNING: 'YELLOW_FORMAT_WARNING'
});

const SOURCE_FILE_MARKERS = Object.freeze({
  start: '=== SOURCE_FILE_' + 'START ===',
  contentStart: '=== CONTENT_' + 'START ===',
  contentEnd: '=== CONTENT_' + 'END ===',
  end: '=== SOURCE_FILE_' + 'END ==='
});

const REQUIRED_FIELDS = Object.freeze([
  'path',
  'language',
  'purpose',
  'operation',
  'owner_worker',
  'target_stage',
  'content'
]);

const REQUIRED_TEXT_FIELDS = Object.freeze([
  'path',
  'language',
  'purpose',
  'operation',
  'owner_worker',
  'target_stage'
]);

const VALID_OPERATIONS = Object.freeze([
  'create',
  'modify',
  'replace',
  'patch_request',
  'report_only'
]);

const DEFAULT_KNOWN_LANGUAGES = Object.freeze([
  'javascript',
  'python',
  'json',
  'markdown',
  'text',
  'bat',
  'powershell'
]);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
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

function normalizeWhitespace(value) {
  return toText(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function isNonEmptyText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function uniqueValues(values) {
  const seen = Object.create(null);
  const result = [];
  values.forEach(function addUnique(value) {
    const key = String(value);
    if (!seen[key]) {
      seen[key] = true;
      result.push(value);
    }
  });
  return result;
}

function makeIssue(code, field, message) {
  return { code: code, field: field || null, message: message };
}

function getKnownLanguages(options) {
  if (options && Array.isArray(options.knownLanguages) && options.knownLanguages.length > 0) {
    return uniqueValues(options.knownLanguages.map(function normalizeLanguage(language) {
      return toText(language).trim().toLowerCase();
    }).filter(Boolean));
  }
  return DEFAULT_KNOWN_LANGUAGES.slice();
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

function validateRawMarkerBlock(rawText) {
  const text = normalizeWhitespace(rawText);
  const errors = [];
  const reasons = [];
  const markerOrder = [
    SOURCE_FILE_MARKERS.start,
    SOURCE_FILE_MARKERS.contentStart,
    SOURCE_FILE_MARKERS.contentEnd,
    SOURCE_FILE_MARKERS.end
  ];

  if (!isNonEmptyText(text)) {
    errors.push(makeIssue('RAW_BLOCK_EMPTY', 'rawText', 'raw SOURCE_FILE marker text is empty.'));
    return { valid: false, errors: errors, reasons: reasons };
  }

  const markerPositions = markerOrder.map(function getMarkerPosition(marker) {
    return text.indexOf(marker);
  });

  markerPositions.forEach(function validatePresence(position, markerIndex) {
    if (position === -1) {
      errors.push(makeIssue('MARKER_MISSING', 'marker', markerOrder[markerIndex] + ' is missing.'));
    }
  });

  markerOrder.forEach(function validateSingleMarker(marker) {
    const count = countOccurrences(text, marker);
    if (count > 1) {
      errors.push(makeIssue('MARKER_DUPLICATED', 'marker', marker + ' appears ' + count + ' times in one unit.'));
    }
  });

  if (errors.length === 0) {
    for (let index = 1; index < markerPositions.length; index += 1) {
      if (markerPositions[index - 1] > markerPositions[index]) {
        errors.push(makeIssue('MARKER_ORDER_INVALID', 'marker', 'SOURCE_FILE markers are not in the expected order.'));
        break;
      }
    }
  }

  if (errors.length === 0) {
    reasons.push('SOURCE_FILE markers are present once and in the expected order.');
  }

  return { valid: errors.length === 0, errors: errors, reasons: reasons };
}

function validateMarkerObject(markers) {
  const errors = [];
  const reasons = [];

  if (!isPlainObject(markers)) {
    errors.push(makeIssue('MARKERS_NOT_OBJECT', 'markers', 'markers must be an object when provided.'));
    return { valid: false, errors: errors, reasons: reasons };
  }

  const expected = [
    ['start', SOURCE_FILE_MARKERS.start],
    ['contentStart', SOURCE_FILE_MARKERS.contentStart],
    ['contentEnd', SOURCE_FILE_MARKERS.contentEnd],
    ['end', SOURCE_FILE_MARKERS.end]
  ];

  expected.forEach(function validateMarkerTuple(tuple) {
    const key = tuple[0];
    const expectedValue = tuple[1];
    const actualValue = markers[key];

    if (actualValue === true) {
      return;
    }

    if (actualValue !== expectedValue) {
      errors.push(makeIssue('MARKER_VALUE_INVALID', 'markers.' + key, 'Expected marker ' + expectedValue + '.'));
    }
  });

  if (errors.length === 0) {
    reasons.push('marker object matches expected SOURCE_FILE marker names.');
  }

  return { valid: errors.length === 0, errors: errors, reasons: reasons };
}

function validateMarkerArray(markers) {
  const errors = [];
  const reasons = [];

  if (!Array.isArray(markers)) {
    errors.push(makeIssue('MARKERS_NOT_ARRAY', 'markers', 'markers must be an array when array validation is selected.'));
    return { valid: false, errors: errors, reasons: reasons };
  }

  const expected = [
    SOURCE_FILE_MARKERS.start,
    SOURCE_FILE_MARKERS.contentStart,
    SOURCE_FILE_MARKERS.contentEnd,
    SOURCE_FILE_MARKERS.end
  ];

  expected.forEach(function validateMarkerAtIndex(expectedMarker, index) {
    if (markers[index] !== expectedMarker) {
      errors.push(makeIssue('MARKER_ARRAY_INVALID', 'markers[' + index + ']', 'Expected marker ' + expectedMarker + '.'));
    }
  });

  if (markers.length !== expected.length) {
    errors.push(makeIssue('MARKER_ARRAY_LENGTH_INVALID', 'markers', 'Expected exactly ' + expected.length + ' markers.'));
  }

  if (errors.length === 0) {
    reasons.push('marker array matches expected SOURCE_FILE marker order.');
  }

  return { valid: errors.length === 0, errors: errors, reasons: reasons };
}

function validateProvidedMarkers(unit, options) {
  const markerSources = [];

  if (hasOwn(unit, 'rawBlock')) {
    markerSources.push({ type: 'rawText', value: unit.rawBlock });
  }
  if (hasOwn(unit, 'rawText')) {
    markerSources.push({ type: 'rawText', value: unit.rawText });
  }
  if (hasOwn(unit, 'sourceText')) {
    markerSources.push({ type: 'rawText', value: unit.sourceText });
  }
  if (hasOwn(unit, 'markers')) {
    markerSources.push({ type: Array.isArray(unit.markers) ? 'array' : 'object', value: unit.markers });
  }

  if (markerSources.length === 0) {
    if (options && options.requireMarkers === true) {
      return {
        valid: false,
        errors: [makeIssue('MARKER_DATA_MISSING', 'markers', 'marker data is required by options.requireMarkers.')],
        reasons: []
      };
    }
    return { valid: true, errors: [], reasons: ['no marker data supplied; marker validation skipped for extracted unit object.'] };
  }

  const errors = [];
  const reasons = [];

  markerSources.forEach(function validateMarkerSource(markerSource) {
    let result;
    if (markerSource.type === 'rawText') {
      result = validateRawMarkerBlock(markerSource.value);
    } else if (markerSource.type === 'array') {
      result = validateMarkerArray(markerSource.value);
    } else {
      result = validateMarkerObject(markerSource.value);
    }

    if (result.errors.length > 0) {
      errors.push.apply(errors, result.errors);
    }
    if (result.reasons.length > 0) {
      reasons.push.apply(reasons, result.reasons);
    }
  });

  return { valid: errors.length === 0, errors: errors, reasons: reasons };
}

function validateRequiredFields(unit) {
  const errors = [];
  const reasons = [];

  REQUIRED_FIELDS.forEach(function validateRequiredField(field) {
    if (!hasOwn(unit, field) || typeof unit[field] === 'undefined' || unit[field] === null) {
      errors.push(makeIssue('MISSING_REQUIRED_FIELD', field, field + ' is required.'));
    }
  });

  REQUIRED_TEXT_FIELDS.forEach(function validateRequiredTextField(field) {
    if (hasOwn(unit, field) && !isNonEmptyText(unit[field])) {
      errors.push(makeIssue('EMPTY_REQUIRED_FIELD', field, field + ' must be a non-empty string.'));
    }
  });

  if (hasOwn(unit, 'content') && typeof unit.content !== 'string') {
    errors.push(makeIssue('CONTENT_NOT_STRING', 'content', 'content must be a string.'));
  }

  if (errors.length === 0) {
    reasons.push('all required SOURCE_FILE unit fields are present.');
  }

  return { valid: errors.length === 0, errors: errors, reasons: reasons };
}

function validateOperation(unit) {
  const operation = toText(unit.operation).trim();
  const isValid = VALID_OPERATIONS.indexOf(operation) !== -1;

  if (isValid) {
    return {
      valid: true,
      errors: [],
      reasons: ['operation is valid: ' + operation + '.']
    };
  }

  return {
    valid: false,
    errors: [makeIssue('INVALID_OPERATION', 'operation', 'operation must be one of: ' + VALID_OPERATIONS.join(', ') + '.')],
    reasons: []
  };
}

function collectWarnings(unit, options) {
  const warnings = [];
  const reasons = [];
  const pathValue = toText(unit.path).trim();
  const languageValue = toText(unit.language).trim().toLowerCase();
  const contentValue = typeof unit.content === 'string' ? unit.content : '';
  const knownLanguages = getKnownLanguages(options);

  if (pathValue.indexOf('\\') !== -1) {
    warnings.push(makeIssue('WINDOWS_BACKSLASH_PATH_WARNING', 'path', 'path contains backslashes; forward slash relative paths reduce combination failures.'));
  }

  if (/^[a-zA-Z]:\//.test(pathValue) || pathValue.charAt(0) === '/') {
    warnings.push(makeIssue('ABSOLUTE_PATH_WARNING', 'path', 'path appears absolute; relative project path is expected for assembly.'));
  }

  if (pathValue.indexOf('..') !== -1) {
    warnings.push(makeIssue('PARENT_SEGMENT_PATH_WARNING', 'path', 'path contains parent directory segment; assembly queue may reject it.'));
  }

  if (languageValue && knownLanguages.indexOf(languageValue) === -1) {
    warnings.push(makeIssue('UNKNOWN_LANGUAGE_WARNING', 'language', 'language is not in known language list: ' + knownLanguages.join(', ') + '.'));
  }

  if (typeof unit.content === 'string' && contentValue.length === 0 && !(options && options.allowEmptyContent === true)) {
    warnings.push(makeIssue('EMPTY_CONTENT_WARNING', 'content', 'content is empty; this may be valid only for special report or placeholder-free empty file cases.'));
  }

  if (warnings.length === 0) {
    reasons.push('no format warnings found.');
  }

  return { warnings: warnings, reasons: reasons };
}

function selectStatus(validationState) {
  if (validationState.missingFieldErrors.length > 0) {
    return FORMAT_STATUS.RED_FORMAT_MISSING_FIELD;
  }
  if (validationState.markerErrors.length > 0) {
    return FORMAT_STATUS.RED_FORMAT_INVALID_MARKER;
  }
  if (validationState.operationErrors.length > 0) {
    return FORMAT_STATUS.RED_FORMAT_INVALID_OPERATION;
  }
  if (validationState.warnings.length > 0) {
    return FORMAT_STATUS.YELLOW_FORMAT_WARNING;
  }
  return FORMAT_STATUS.GREEN_FORMAT;
}

function statusToColor(status) {
  if (status.indexOf('GREEN_') === 0) {
    return 'GREEN';
  }
  if (status.indexOf('YELLOW_') === 0) {
    return 'YELLOW';
  }
  return 'RED';
}

function makeResult(unit, status, reasons, errors, warnings) {
  const color = statusToColor(status);
  return {
    success: color !== 'RED',
    ok: color !== 'RED',
    status: status,
    color: color,
    unit_path: isPlainObject(unit) ? toText(unit.path).trim() : '',
    operation: isPlainObject(unit) ? toText(unit.operation).trim() : '',
    required_fields: REQUIRED_FIELDS.slice(),
    valid_operations: VALID_OPERATIONS.slice(),
    reasons: reasons,
    errors: errors,
    warnings: warnings
  };
}

function validateSourceFileUnit(unit, options) {
  const safeOptions = isPlainObject(options) ? options : {};

  if (!isPlainObject(unit)) {
    return makeResult(
      {},
      FORMAT_STATUS.RED_FORMAT_MISSING_FIELD,
      [],
      [makeIssue('UNIT_NOT_OBJECT', 'unit', 'unit must be an object containing extracted SOURCE_FILE fields.')],
      []
    );
  }

  const requiredResult = validateRequiredFields(unit);
  const markerResult = validateProvidedMarkers(unit, safeOptions);
  const operationResult = requiredResult.valid ? validateOperation(unit) : { valid: true, errors: [], reasons: [] };
  const warningResult = requiredResult.valid && markerResult.valid && operationResult.valid
    ? collectWarnings(unit, safeOptions)
    : { warnings: [], reasons: [] };

  const validationState = {
    missingFieldErrors: requiredResult.errors,
    markerErrors: markerResult.errors,
    operationErrors: operationResult.errors,
    warnings: warningResult.warnings
  };

  const status = selectStatus(validationState);
  const reasons = []
    .concat(requiredResult.reasons)
    .concat(markerResult.reasons)
    .concat(operationResult.reasons)
    .concat(warningResult.reasons);
  const errors = []
    .concat(requiredResult.errors)
    .concat(markerResult.errors)
    .concat(operationResult.errors);

  return makeResult(unit, status, reasons, errors, warningResult.warnings);
}

function validateSourceFileBatch(units, options) {
  const safeUnits = Array.isArray(units) ? units : [];
  const batchErrors = [];
  const batchWarnings = [];
  const unitResults = safeUnits.map(function validateUnit(unit, index) {
    const result = validateSourceFileUnit(unit, options);
    if (result.color === 'RED') {
      batchErrors.push(makeIssue('BATCH_UNIT_RED', String(index), 'unit[' + index + '] returned ' + result.status + '.'));
    }
    if (result.color === 'YELLOW') {
      batchWarnings.push(makeIssue('BATCH_UNIT_YELLOW', String(index), 'unit[' + index + '] returned YELLOW_FORMAT_WARNING.'));
    }
    return result;
  });

  if (!Array.isArray(units)) {
    batchErrors.unshift(makeIssue('BATCH_NOT_ARRAY', 'units', 'units must be an array.'));
  }

  if (Array.isArray(units) && units.length === 0) {
    batchWarnings.push(makeIssue('BATCH_EMPTY_WARNING', 'units', 'units array is empty.'));
  }

  let status = FORMAT_STATUS.GREEN_FORMAT;
  if (batchErrors.length > 0) {
    status = FORMAT_STATUS.RED_FORMAT_MISSING_FIELD;
  } else if (unitResults.some(function hasInvalidMarker(result) { return result.status === FORMAT_STATUS.RED_FORMAT_INVALID_MARKER; })) {
    status = FORMAT_STATUS.RED_FORMAT_INVALID_MARKER;
  } else if (unitResults.some(function hasInvalidOperation(result) { return result.status === FORMAT_STATUS.RED_FORMAT_INVALID_OPERATION; })) {
    status = FORMAT_STATUS.RED_FORMAT_INVALID_OPERATION;
  } else if (batchWarnings.length > 0 || unitResults.some(function hasWarning(result) { return result.color === 'YELLOW'; })) {
    status = FORMAT_STATUS.YELLOW_FORMAT_WARNING;
  }

  if (unitResults.some(function hasInvalidMarker(result) { return result.status === FORMAT_STATUS.RED_FORMAT_INVALID_MARKER; })) {
    status = FORMAT_STATUS.RED_FORMAT_INVALID_MARKER;
  } else if (unitResults.some(function hasInvalidOperation(result) { return result.status === FORMAT_STATUS.RED_FORMAT_INVALID_OPERATION; })) {
    status = FORMAT_STATUS.RED_FORMAT_INVALID_OPERATION;
  }

  const color = statusToColor(status);
  const counts = unitResults.reduce(function countResults(accumulator, result) {
    accumulator.total += 1;
    accumulator[result.color.toLowerCase()] += 1;
    return accumulator;
  }, { total: 0, green: 0, yellow: 0, red: 0 });

  return {
    success: color !== 'RED',
    ok: color !== 'RED',
    status: status,
    color: color,
    counts: counts,
    results: unitResults,
    errors: batchErrors,
    warnings: batchWarnings,
    reasons: [
      'batch validation completed with ' + counts.green + ' GREEN, ' + counts.yellow + ' YELLOW, ' + counts.red + ' RED unit results.'
    ]
  };
}

module.exports = {
  GREEN_FORMAT: FORMAT_STATUS.GREEN_FORMAT,
  RED_FORMAT_MISSING_FIELD: FORMAT_STATUS.RED_FORMAT_MISSING_FIELD,
  RED_FORMAT_INVALID_MARKER: FORMAT_STATUS.RED_FORMAT_INVALID_MARKER,
  RED_FORMAT_INVALID_OPERATION: FORMAT_STATUS.RED_FORMAT_INVALID_OPERATION,
  YELLOW_FORMAT_WARNING: FORMAT_STATUS.YELLOW_FORMAT_WARNING,
  FORMAT_STATUS: FORMAT_STATUS,
  SOURCE_FILE_MARKERS: SOURCE_FILE_MARKERS,
  REQUIRED_FIELDS: REQUIRED_FIELDS,
  VALID_OPERATIONS: VALID_OPERATIONS,
  validateSourceFileUnit: validateSourceFileUnit,
  validateSourceFileBatch: validateSourceFileBatch
};