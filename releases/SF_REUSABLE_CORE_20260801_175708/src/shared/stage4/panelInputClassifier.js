'use strict';

/**
 * Stage 4 Panel Input Classifier
 *
 * Purpose:
 * - Classify raw text captured from TAEO, LAO, and TAERA panels.
 * - Return route hints for downstream validation, collection, storage, reporting, or download handling.
 * - This helper does not execute code, write files, validate security, or modify runtime bindings.
 *
 * Usage example:
 *
 * const { classifyPanelInput } = require('./panelInputClassifier');
 *
 * const result = classifyPanelInput(workerOutputText, { terminalRole: 'LAO' });
 * console.log(result.inputClass);
 * console.log(result.routeHints);
 */

const PANEL_TERMINALS = Object.freeze({
  TAEO: 'TAEO',
  LAO: 'LAO',
  TAERA: 'TAERA',
  UNKNOWN: 'UNKNOWN'
});

const PANEL_INPUT_CLASSES = Object.freeze({
  TAEO_RAW_TEXT: 'TAEO_RAW_TEXT',
  TAEO_PANEL_COMMAND_CANDIDATE: 'TAEO_PANEL_COMMAND_CANDIDATE',
  LAO_SOURCE_FILE_OUTPUT: 'LAO_SOURCE_FILE_OUTPUT',
  LAO_WORKER_REPORT: 'LAO_WORKER_REPORT',
  LAO_ERROR_REPORT: 'LAO_ERROR_REPORT',
  TAERA_DOWNLOAD_RESOURCE: 'TAERA_DOWNLOAD_RESOURCE',
  UNKNOWN_PANEL_INPUT: 'UNKNOWN_PANEL_INPUT'
});

const ROUTE_HINTS = Object.freeze({
  PANEL_RECORD: 'PANEL_RECORD',
  CLASSIFICATION_STATION: 'CLASSIFICATION_STATION',
  VALIDATION_STATION: 'VALIDATION_STATION',
  COLLECTION_STATION: 'COLLECTION_STATION',
  STORAGE_STATION: 'STORAGE_STATION',
  INSTRUCTION_STATION: 'INSTRUCTION_STATION',
  DOWNLOAD_STATION: 'DOWNLOAD_STATION',
  REPORT_STATION: 'REPORT_STATION',
  CONTROL_STATION: 'CONTROL_STATION',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED'
});

function normalizeTerminalRole(value) {
  const normalized = String(value || '').trim().toUpperCase();

  if (normalized === PANEL_TERMINALS.TAEO) {
    return PANEL_TERMINALS.TAEO;
  }

  if (normalized === PANEL_TERMINALS.LAO) {
    return PANEL_TERMINALS.LAO;
  }

  if (normalized === PANEL_TERMINALS.TAERA) {
    return PANEL_TERMINALS.TAERA;
  }

  return PANEL_TERMINALS.UNKNOWN;
}

function normalizeRawInput(rawInput) {
  if (rawInput === null || rawInput === undefined) {
    return '';
  }

  if (typeof rawInput === 'string') {
    return rawInput;
  }

  if (typeof rawInput === 'object') {
    try {
      return JSON.stringify(rawInput, null, 2);
    } catch (error) {
      return String(rawInput);
    }
  }

  return String(rawInput);
}

function hasSourceFileBlock(text) {
  return (
    text.indexOf('=== SOURCE_FILE_' + 'START ===') !== -1 ||
    text.indexOf('=== CONTENT_' + 'START ===') !== -1 ||
    text.indexOf('=== SOURCE_FILE_' + 'END ===') !== -1
  );
}

function hasWorkerReport(text) {
  return (
    text.indexOf('WORKER_REPORT_' + 'START') !== -1 ||
    text.indexOf('WORKER_REPORT_' + 'END') !== -1 ||
    /^worker_id:/im.test(text) ||
    /^task_id:/im.test(text) ||
    /^worker_function_class:/im.test(text)
  );
}

function hasErrorReport(text) {
  return (
    text.indexOf('RED_FIX_REQUIRED') !== -1 ||
    text.indexOf('ERROR') !== -1 ||
    text.indexOf('SyntaxError') !== -1 ||
    text.indexOf('TypeError') !== -1 ||
    text.indexOf('ReferenceError') !== -1 ||
    text.indexOf('node --check') !== -1 ||
    text.indexOf('tests_not_run') !== -1 ||
    text.indexOf('known_risks') !== -1
  );
}

function hasDownloadResource(text) {
  return (
    /sandbox:\/mnt\/data\/[^\s)]+/i.test(text) ||
    /https?:\/\/[^\s)]+/i.test(text) ||
    /\bdownload\b/i.test(text) ||
    /다운로드/.test(text) ||
    /첨부파일/.test(text) ||
    /파일\s*자원/.test(text) ||
    /\b[A-Za-z]:\\[^<>:"|?*\r\n]+/.test(text)
  );
}

function hasPanelCommandCandidate(text) {
  return (
    /PANEL_COMMAND/i.test(text) ||
    /route_to_station/i.test(text) ||
    /button_id_or_selector/i.test(text) ||
    /ipc_channel_name/i.test(text) ||
    /renderer_api_name/i.test(text) ||
    /preload_exposed_name/i.test(text) ||
    /COMMANDER_ID/i.test(text) ||
    /WORKER_ID/i.test(text) ||
    /TASK_ID/i.test(text) ||
    /전달\s*지시문/.test(text) ||
    /다음\s*지시/.test(text)
  );
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

function clampConfidence(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value < 0) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  return Number(value.toFixed(2));
}

function buildResult(inputClass, terminalRole, routeHints, confidence, reasons, extra) {
  return Object.assign(
    {
      inputClass,
      terminalRole,
      routeHints: compactUniqueList(routeHints),
      confidence: clampConfidence(confidence),
      reasons: compactUniqueList(reasons)
    },
    extra || {}
  );
}

function classifyPanelInput(rawInput, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const text = normalizeRawInput(rawInput);
  const trimmed = text.trim();
  const terminalRole = normalizeTerminalRole(opts.terminalRole || opts.terminal || opts.sourcePane);

  const markers = {
    sourceFileBlock: hasSourceFileBlock(trimmed),
    workerReport: hasWorkerReport(trimmed),
    errorReport: hasErrorReport(trimmed),
    downloadResource: hasDownloadResource(trimmed),
    panelCommandCandidate: hasPanelCommandCandidate(trimmed)
  };

  if (!trimmed) {
    return buildResult(
      PANEL_INPUT_CLASSES.UNKNOWN_PANEL_INPUT,
      terminalRole,
      [ROUTE_HINTS.REVIEW_REQUIRED],
      0.2,
      ['empty_input'],
      { markers }
    );
  }

  if (terminalRole === PANEL_TERMINALS.TAERA || markers.downloadResource) {
    if (markers.downloadResource) {
      return buildResult(
        PANEL_INPUT_CLASSES.TAERA_DOWNLOAD_RESOURCE,
        terminalRole === PANEL_TERMINALS.UNKNOWN ? PANEL_TERMINALS.TAERA : terminalRole,
        [ROUTE_HINTS.DOWNLOAD_STATION, ROUTE_HINTS.STORAGE_STATION, ROUTE_HINTS.PANEL_RECORD],
        terminalRole === PANEL_TERMINALS.TAERA ? 0.95 : 0.86,
        ['download_or_file_resource_marker_detected'],
        { markers }
      );
    }
  }

  if (markers.sourceFileBlock) {
    return buildResult(
      PANEL_INPUT_CLASSES.LAO_SOURCE_FILE_OUTPUT,
      terminalRole === PANEL_TERMINALS.UNKNOWN ? PANEL_TERMINALS.LAO : terminalRole,
      [ROUTE_HINTS.VALIDATION_STATION, ROUTE_HINTS.COLLECTION_STATION, ROUTE_HINTS.PANEL_RECORD],
      terminalRole === PANEL_TERMINALS.LAO ? 0.96 : 0.9,
      ['source_file_block_marker_detected'],
      { markers }
    );
  }

  if (markers.workerReport) {
    return buildResult(
      PANEL_INPUT_CLASSES.LAO_WORKER_REPORT,
      terminalRole === PANEL_TERMINALS.UNKNOWN ? PANEL_TERMINALS.LAO : terminalRole,
      [ROUTE_HINTS.REPORT_STATION, ROUTE_HINTS.COLLECTION_STATION, ROUTE_HINTS.PANEL_RECORD],
      terminalRole === PANEL_TERMINALS.LAO ? 0.94 : 0.87,
      ['worker_report_marker_detected'],
      { markers }
    );
  }

  if (markers.errorReport) {
    return buildResult(
      PANEL_INPUT_CLASSES.LAO_ERROR_REPORT,
      terminalRole === PANEL_TERMINALS.UNKNOWN ? PANEL_TERMINALS.LAO : terminalRole,
      [ROUTE_HINTS.VALIDATION_STATION, ROUTE_HINTS.REPORT_STATION, ROUTE_HINTS.PANEL_RECORD],
      0.84,
      ['error_or_red_fix_marker_detected'],
      { markers }
    );
  }

  if (terminalRole === PANEL_TERMINALS.TAEO && markers.panelCommandCandidate) {
    return buildResult(
      PANEL_INPUT_CLASSES.TAEO_PANEL_COMMAND_CANDIDATE,
      PANEL_TERMINALS.TAEO,
      [ROUTE_HINTS.INSTRUCTION_STATION, ROUTE_HINTS.CONTROL_STATION, ROUTE_HINTS.PANEL_RECORD],
      0.88,
      ['taeo_panel_command_candidate_marker_detected'],
      { markers }
    );
  }

  if (markers.panelCommandCandidate) {
    return buildResult(
      PANEL_INPUT_CLASSES.TAEO_PANEL_COMMAND_CANDIDATE,
      terminalRole === PANEL_TERMINALS.UNKNOWN ? PANEL_TERMINALS.TAEO : terminalRole,
      [ROUTE_HINTS.INSTRUCTION_STATION, ROUTE_HINTS.CONTROL_STATION, ROUTE_HINTS.PANEL_RECORD],
      0.72,
      ['panel_command_candidate_marker_detected_without_taeo_terminal'],
      { markers }
    );
  }

  if (terminalRole === PANEL_TERMINALS.TAEO) {
    return buildResult(
      PANEL_INPUT_CLASSES.TAEO_RAW_TEXT,
      PANEL_TERMINALS.TAEO,
      [ROUTE_HINTS.CLASSIFICATION_STATION, ROUTE_HINTS.PANEL_RECORD],
      0.7,
      ['taeo_terminal_plain_text'],
      { markers }
    );
  }

  return buildResult(
    PANEL_INPUT_CLASSES.UNKNOWN_PANEL_INPUT,
    terminalRole,
    [ROUTE_HINTS.CLASSIFICATION_STATION, ROUTE_HINTS.REVIEW_REQUIRED, ROUTE_HINTS.PANEL_RECORD],
    0.45,
    ['no_strong_marker_detected'],
    { markers }
  );
}

module.exports = {
  classifyPanelInput,
  PANEL_TERMINALS,
  PANEL_INPUT_CLASSES,
  ROUTE_HINTS
};