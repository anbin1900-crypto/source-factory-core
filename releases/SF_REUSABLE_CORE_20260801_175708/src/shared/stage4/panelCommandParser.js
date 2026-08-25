'use strict';

/**
 * Stage 4 Panel Command Parser
 *
 * Purpose:
 * - Extract one or more @@@ ... @@@ panel command blocks from TAEO raw text.
 * - Normalize command_type and route_target for downstream queue, storage, validation, execution, download, and report flows.
 * - This parser does not execute commands, write files, call IPC, or modify runtime bindings.
 *
 * Usage example:
 *
 * const { parsePanelCommands } = require('./panelCommandParser');
 *
 * const result = parsePanelCommands(`
 * @@@
 * command_type: STORE
 * route_target: STORAGE_STATION
 * payload_id: example_001
 * @@@
 * `, { terminalRole: 'TAEO' });
 *
 * console.log(result.commands[0].command_type);
 * console.log(result.commands[0].route_target);
 */

const COMMAND_TYPES = Object.freeze({
  STORE: 'STORE',
  CLASSIFY: 'CLASSIFY',
  VALIDATE: 'VALIDATE',
  EXECUTE: 'EXECUTE',
  DISPATCH: 'DISPATCH',
  DOWNLOAD: 'DOWNLOAD',
  REPORT: 'REPORT',
  ERROR: 'ERROR',
  UNKNOWN: 'UNKNOWN'
});

const ROUTE_TARGETS = Object.freeze({
  STORAGE_STATION: 'STORAGE_STATION',
  CLASSIFICATION_STATION: 'CLASSIFICATION_STATION',
  VALIDATION_STATION: 'VALIDATION_STATION',
  EXECUTION_STATION: 'EXECUTION_STATION',
  SENDER_STATION: 'SENDER_STATION',
  DOWNLOAD_STATION: 'DOWNLOAD_STATION',
  REPORT_STATION: 'REPORT_STATION',
  CONTROL_STATION: 'CONTROL_STATION',
  COMMAND_QUEUE: 'COMMAND_QUEUE',
  ERROR_REVIEW: 'ERROR_REVIEW',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  UNKNOWN: 'UNKNOWN'
});

const DEFAULT_ROUTE_BY_COMMAND_TYPE = Object.freeze({
  STORE: ROUTE_TARGETS.STORAGE_STATION,
  CLASSIFY: ROUTE_TARGETS.CLASSIFICATION_STATION,
  VALIDATE: ROUTE_TARGETS.VALIDATION_STATION,
  EXECUTE: ROUTE_TARGETS.EXECUTION_STATION,
  DISPATCH: ROUTE_TARGETS.SENDER_STATION,
  DOWNLOAD: ROUTE_TARGETS.DOWNLOAD_STATION,
  REPORT: ROUTE_TARGETS.REPORT_STATION,
  ERROR: ROUTE_TARGETS.ERROR_REVIEW,
  UNKNOWN: ROUTE_TARGETS.REVIEW_REQUIRED
});

const EXECUTABLE_COMMAND_TYPES = Object.freeze([
  COMMAND_TYPES.STORE,
  COMMAND_TYPES.CLASSIFY,
  COMMAND_TYPES.VALIDATE,
  COMMAND_TYPES.EXECUTE,
  COMMAND_TYPES.DISPATCH,
  COMMAND_TYPES.DOWNLOAD,
  COMMAND_TYPES.REPORT
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

function normalizeToken(value) {
  return String(value || '')
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/[\s-]+/g, '_')
    .toUpperCase();
}

function normalizeCommandType(value) {
  const token = normalizeToken(value);

  if (Object.prototype.hasOwnProperty.call(COMMAND_TYPES, token)) {
    return COMMAND_TYPES[token];
  }

  return COMMAND_TYPES.UNKNOWN;
}

function normalizeRouteTarget(value) {
  const token = normalizeToken(value);

  if (!token) {
    return ROUTE_TARGETS.UNKNOWN;
  }

  if (Object.prototype.hasOwnProperty.call(ROUTE_TARGETS, token)) {
    return ROUTE_TARGETS[token];
  }

  const aliases = {
    STORE: ROUTE_TARGETS.STORAGE_STATION,
    STORAGE: ROUTE_TARGETS.STORAGE_STATION,
    SAVE: ROUTE_TARGETS.STORAGE_STATION,
    CLASSIFY: ROUTE_TARGETS.CLASSIFICATION_STATION,
    CLASSIFIER: ROUTE_TARGETS.CLASSIFICATION_STATION,
    VALIDATE: ROUTE_TARGETS.VALIDATION_STATION,
    VALIDATION: ROUTE_TARGETS.VALIDATION_STATION,
    EXECUTE: ROUTE_TARGETS.EXECUTION_STATION,
    EXECUTION: ROUTE_TARGETS.EXECUTION_STATION,
    RUN: ROUTE_TARGETS.EXECUTION_STATION,
    DISPATCH: ROUTE_TARGETS.SENDER_STATION,
    SEND: ROUTE_TARGETS.SENDER_STATION,
    SENDER: ROUTE_TARGETS.SENDER_STATION,
    COMMAND_SEND: ROUTE_TARGETS.SENDER_STATION,
    DOWNLOAD: ROUTE_TARGETS.DOWNLOAD_STATION,
    FILE: ROUTE_TARGETS.DOWNLOAD_STATION,
    RESOURCE: ROUTE_TARGETS.DOWNLOAD_STATION,
    REPORT: ROUTE_TARGETS.REPORT_STATION,
    LOG: ROUTE_TARGETS.REPORT_STATION,
    CONTROL: ROUTE_TARGETS.CONTROL_STATION,
    COMMAND: ROUTE_TARGETS.COMMAND_QUEUE,
    QUEUE: ROUTE_TARGETS.COMMAND_QUEUE,
    COMMAND_QUEUE: ROUTE_TARGETS.COMMAND_QUEUE,
    ERROR: ROUTE_TARGETS.ERROR_REVIEW,
    RED: ROUTE_TARGETS.ERROR_REVIEW,
    REVIEW: ROUTE_TARGETS.REVIEW_REQUIRED,
    REVIEW_REQUIRED: ROUTE_TARGETS.REVIEW_REQUIRED
  };

  return aliases[token] || ROUTE_TARGETS.UNKNOWN;
}

function firstNonEmptyLine(text) {
  const lines = String(text || '').split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed) {
      return trimmed;
    }
  }

  return '';
}

function parseKeyValueLines(blockText) {
  const fields = {};
  const lines = String(blockText || '').split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z0-9_.-]+)\s*[:=]\s*(.+)$/);

    if (!match) {
      continue;
    }

    const key = normalizeToken(match[1]).toLowerCase();
    const value = match[2].trim();

    if (!Object.prototype.hasOwnProperty.call(fields, key)) {
      fields[key] = value;
    }
  }

  return fields;
}

function inferCommandType(blockText, fields) {
  const fieldCandidates = [
    fields.command_type,
    fields.command,
    fields.type,
    fields.action,
    fields.panel_command
  ];

  for (const candidate of fieldCandidates) {
    const normalized = normalizeCommandType(candidate);

    if (normalized !== COMMAND_TYPES.UNKNOWN) {
      return {
        commandType: normalized,
        reason: 'field_command_type'
      };
    }
  }

  const firstLine = firstNonEmptyLine(blockText);
  const firstToken = firstLine.split(/\s+/)[0];
  const firstTokenCommand = normalizeCommandType(firstToken.replace(/[:=]+$/g, ''));

  if (firstTokenCommand !== COMMAND_TYPES.UNKNOWN) {
    return {
      commandType: firstTokenCommand,
      reason: 'first_line_command_token'
    };
  }

  const upperText = String(blockText || '').toUpperCase();

  const keywordChecks = [
    { type: COMMAND_TYPES.ERROR, patterns: ['RED_FIX_REQUIRED', 'SYNTAXERROR', 'TYPEERROR', 'REFERENCEERROR', 'ERROR'] },
    { type: COMMAND_TYPES.DOWNLOAD, patterns: ['SANDBOX:/', 'DOWNLOAD', '다운로드', 'FILE_RESOURCE'] },
    { type: COMMAND_TYPES.REPORT, patterns: ['WORKER_REPORT', 'COMMANDER_REPORT', 'GATE_REPORT', 'REPORT_PATH'] },
    { type: COMMAND_TYPES.VALIDATE, patterns: ['VALIDATE', 'VALIDATION', 'GATE', 'CHECK'] },
    { type: COMMAND_TYPES.CLASSIFY, patterns: ['CLASSIFY', 'CLASSIFICATION', '분류'] },
    { type: COMMAND_TYPES.DISPATCH, patterns: ['DISPATCH', 'SEND_PROMPT', 'SENDER', '전송'] },
    { type: COMMAND_TYPES.EXECUTE, patterns: ['EXECUTE', 'RUN', '실행'] },
    { type: COMMAND_TYPES.STORE, patterns: ['STORE', 'SAVE', 'STORAGE', '저장'] }
  ];

  for (const check of keywordChecks) {
    for (const pattern of check.patterns) {
      if (upperText.indexOf(pattern) !== -1) {
        return {
          commandType: check.type,
          reason: 'keyword_' + pattern.toLowerCase().replace(/[^a-z0-9]+/g, '_')
        };
      }
    }
  }

  return {
    commandType: COMMAND_TYPES.UNKNOWN,
    reason: 'no_command_type_detected'
  };
}

function inferRouteTarget(commandType, blockText, fields) {
  const fieldCandidates = [
    fields.route_target,
    fields.route,
    fields.target,
    fields.station,
    fields.to,
    fields.next_station
  ];

  for (const candidate of fieldCandidates) {
    const normalized = normalizeRouteTarget(candidate);

    if (normalized !== ROUTE_TARGETS.UNKNOWN) {
      return {
        routeTarget: normalized,
        reason: 'field_route_target'
      };
    }
  }

  const upperText = String(blockText || '').toUpperCase();
  const routeTokens = Object.keys(ROUTE_TARGETS);

  for (const token of routeTokens) {
    if (upperText.indexOf(token) !== -1) {
      return {
        routeTarget: ROUTE_TARGETS[token],
        reason: 'route_token_' + token.toLowerCase()
      };
    }
  }

  return {
    routeTarget: DEFAULT_ROUTE_BY_COMMAND_TYPE[commandType] || ROUTE_TARGETS.REVIEW_REQUIRED,
    reason: 'default_route_by_command_type'
  };
}

function extractPanelCommandBlocks(text) {
  const rawText = normalizeRawText(text);
  const commands = [];
  const invalidBlocks = [];
  const pattern = /@@@([\s\S]*?)@@@/g;
  let match;
  let blockIndex = 0;

  while ((match = pattern.exec(rawText)) !== null) {
    const rawBlock = match[0];
    const blockBody = String(match[1] || '').trim();
    const startIndex = match.index;
    const endIndex = pattern.lastIndex;

    if (!blockBody) {
      invalidBlocks.push({
        block_index: blockIndex,
        start_index: startIndex,
        end_index: endIndex,
        reason: 'empty_panel_command_block',
        raw_block: rawBlock
      });
      blockIndex += 1;
      continue;
    }

    commands.push({
      block_index: blockIndex,
      start_index: startIndex,
      end_index: endIndex,
      raw_block: rawBlock,
      block_body: blockBody
    });

    blockIndex += 1;
  }

  const markerCount = (rawText.match(/@@@/g) || []).length;

  if (markerCount % 2 !== 0) {
    invalidBlocks.push({
      block_index: blockIndex,
      start_index: rawText.lastIndexOf('@@@'),
      end_index: rawText.length,
      reason: 'unclosed_panel_command_block',
      raw_block: rawText.slice(rawText.lastIndexOf('@@@'))
    });
  }

  return {
    commands,
    invalidBlocks,
    markerCount
  };
}

function summarizeRoutes(commands) {
  const routeSummary = {};

  for (const command of commands) {
    const routeTarget = command.route_target || ROUTE_TARGETS.UNKNOWN;

    if (!Object.prototype.hasOwnProperty.call(routeSummary, routeTarget)) {
      routeSummary[routeTarget] = {
        route_target: routeTarget,
        count: 0,
        command_types: []
      };
    }

    routeSummary[routeTarget].count += 1;

    if (routeSummary[routeTarget].command_types.indexOf(command.command_type) === -1) {
      routeSummary[routeTarget].command_types.push(command.command_type);
    }
  }

  return routeSummary;
}

function parsePanelCommands(rawText, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const text = normalizeRawText(rawText);
  const extracted = extractPanelCommandBlocks(text);

  const commands = extracted.commands.map(function mapCommand(block) {
    const fields = parseKeyValueLines(block.block_body);
    const commandInference = inferCommandType(block.block_body, fields);
    const routeInference = inferRouteTarget(commandInference.commandType, block.block_body, fields);
    const executable = EXECUTABLE_COMMAND_TYPES.indexOf(commandInference.commandType) !== -1;

    return {
      block_index: block.block_index,
      start_index: block.start_index,
      end_index: block.end_index,
      raw_block: block.raw_block,
      command_text: block.block_body,
      command_type: commandInference.commandType,
      route_target: routeInference.routeTarget,
      has_executable_panel_command: executable,
      fields: fields,
      confidence: commandInference.commandType === COMMAND_TYPES.UNKNOWN ? 0.45 : 0.86,
      reasons: [
        commandInference.reason,
        routeInference.reason
      ]
    };
  });

  const invalidBlocks = extracted.invalidBlocks;
  const routeSummary = summarizeRoutes(commands);
  const hasExecutablePanelCommand = commands.some(function hasExecutable(command) {
    return command.has_executable_panel_command === true;
  });

  return {
    terminalRole: String(opts.terminalRole || opts.terminal || 'TAEO').trim().toUpperCase() || 'TAEO',
    commandBlockMarker: '@@@',
    commandBlockCount: commands.length,
    invalidBlockCount: invalidBlocks.length,
    markerCount: extracted.markerCount,
    commands: commands,
    invalidBlocks: invalidBlocks,
    routeSummary: routeSummary,
    hasExecutablePanelCommand: hasExecutablePanelCommand
  };
}

module.exports = {
  parsePanelCommands,
  COMMAND_TYPES,
  ROUTE_TARGETS,
  DEFAULT_ROUTE_BY_COMMAND_TYPE
};