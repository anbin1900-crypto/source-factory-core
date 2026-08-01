'use strict';

const STATUS_GREEN = 'GREEN_BINDING_CONSISTENT';
const STATUS_YELLOW = 'YELLOW_BINDING_REVIEW_REQUIRED';
const STATUS_RED = 'RED_BLANK_BINDING_NAME';
const UNKNOWN_NAME = '__UNKNOWN_DYNAMIC_NAME__';
const BLANK_NAME = '__BLANK_NAME__';

function checkApiIpcBindingConsistency(sourceUnits, options) {
  const opts = normalizeOptions(options);
  const units = Array.isArray(sourceUnits) ? sourceUnits : [];

  const apiCalls = [];
  const apiExposures = [];
  const ipcInvokes = [];
  const ipcHandlers = [];
  const buttonBindings = [];
  const blankNames = [];

  for (let index = 0; index < units.length; index += 1) {
    const unit = normalizeSourceUnit(units[index], index);

    if (!unit.content) {
      continue;
    }

    appendMany(apiCalls, scanWindowSfApiCalls(unit, blankNames));
    appendMany(apiExposures, scanSfApiExposures(unit, blankNames));
    appendMany(ipcInvokes, scanIpcRendererInvokes(unit, blankNames));
    appendMany(ipcHandlers, scanIpcMainHandlers(unit, blankNames));
    appendMany(buttonBindings, scanButtonBindings(unit, blankNames));
  }

  const missingPairs = buildMissingPairs({
    apiCalls,
    apiExposures,
    ipcInvokes,
    ipcHandlers,
    buttonBindings,
    options: opts,
  });

  const recommendedStatus = getRecommendedStatus(blankNames, missingPairs);

  return {
    apiCalls,
    apiExposures,
    ipcInvokes,
    ipcHandlers,
    buttonBindings,
    missingPairs,
    blankNames,
    recommendedStatus,
    commanderDecisionNeeded: recommendedStatus !== STATUS_GREEN,
    summary: {
      apiCallCount: apiCalls.length,
      apiExposureCount: apiExposures.length,
      ipcInvokeCount: ipcInvokes.length,
      ipcHandlerCount: ipcHandlers.length,
      buttonBindingCount: buttonBindings.length,
      missingPairCount: missingPairs.length,
      blankNameCount: blankNames.length,
    },
  };
}

function scanWindowSfApiCalls(unit, blankNames) {
  const records = [];
  const content = stripComments(unit.content);

  collectMatches(content, /window\s*\.\s*sfApi\s*\.\s*([A-Za-z_$][\w$]*)\s*\(/g, function onDotCall(match) {
    const apiName = cleanName(match[1]);
    records.push(createRecord(unit, 'api_call', apiName, match.index, match[0], {
      source: 'window.sfApi.method',
    }));
  });

  collectMatches(content, /window\s*\.\s*sfApi\s*\[\s*(['"`])([\s\S]*?)\1\s*\]\s*\(/g, function onBracketCall(match) {
    const apiName = cleanName(match[2]);
    const record = createRecord(unit, 'api_call', apiName || BLANK_NAME, match.index, match[0], {
      source: 'window.sfApi[method]',
    });

    records.push(record);

    if (!apiName) {
      blankNames.push(createBlankNameRecord(unit, 'api_call', match.index, match[0], 'Blank window.sfApi bracket method name.'));
    }
  });

  collectMatches(content, /window\s*\.\s*sfApi\s*\[\s*([^\]'"\s][^\]]*?)\s*\]\s*\(/g, function onDynamicBracketCall(match) {
    records.push(createRecord(unit, 'api_call', UNKNOWN_NAME, match.index, match[0], {
      source: 'window.sfApi[dynamic]',
      dynamicExpression: cleanSnippet(match[1]),
    }));
  });

  return uniqueRecords(records, ['path', 'name', 'line', 'column', 'source']);
}

function scanSfApiExposures(unit, blankNames) {
  const records = [];
  const content = stripComments(unit.content);

  collectMatches(content, /contextBridge\s*\.\s*exposeInMainWorld\s*\(\s*(['"`])sfApi\1\s*,\s*\{([\s\S]*?)\}\s*\)/g, function onExposeObject(match) {
    const objectBody = match[2];
    const objectStart = match.index + match[0].indexOf(objectBody);
    appendMany(records, scanObjectKeysAsApiExposures(unit, objectBody, objectStart, 'contextBridge.exposeInMainWorld'));
  });

  collectMatches(content, /window\s*\.\s*sfApi\s*=\s*\{([\s\S]*?)\}/g, function onWindowAssign(match) {
    const objectBody = match[1];
    const objectStart = match.index + match[0].indexOf(objectBody);
    appendMany(records, scanObjectKeysAsApiExposures(unit, objectBody, objectStart, 'window.sfApi.assignment'));
  });

  collectMatches(content, /contextBridge\s*\.\s*exposeInMainWorld\s*\(\s*(['"`])\s*\1\s*,/g, function onBlankExposure(match) {
    blankNames.push(createBlankNameRecord(unit, 'api_exposure', match.index, match[0], 'Blank exposeInMainWorld API namespace.'));
  });

  return uniqueRecords(records, ['path', 'name', 'line', 'column', 'source']);
}

function scanObjectKeysAsApiExposures(unit, objectBody, objectStart, source) {
  const records = [];

  collectMatches(objectBody, /(?:^|[,{\n\r])\s*([A-Za-z_$][\w$]*)\s*:/g, function onIdentifierKey(match) {
    const apiName = cleanName(match[1]);
    const absoluteIndex = objectStart + match.index + match[0].lastIndexOf(match[1]);

    records.push(createRecord(unit, 'api_exposure', apiName, absoluteIndex, match[0], {
      source,
    }));
  });

  collectMatches(objectBody, /(?:^|[,{\n\r])\s*(['"`])([\s\S]*?)\1\s*:/g, function onStringKey(match) {
    const apiName = cleanName(match[2]);
    const absoluteIndex = objectStart + match.index + match[0].lastIndexOf(match[2]);

    records.push(createRecord(unit, 'api_exposure', apiName || BLANK_NAME, absoluteIndex, match[0], {
      source,
    }));
  });

  return records;
}

function scanIpcRendererInvokes(unit, blankNames) {
  const records = [];
  const content = stripComments(unit.content);

  collectMatches(content, /ipcRenderer\s*\.\s*invoke\s*\(\s*(['"`])([\s\S]*?)\1/g, function onInvoke(match) {
    const channelName = cleanName(match[2]);
    const record = createRecord(unit, 'ipc_invoke', channelName || BLANK_NAME, match.index, match[0], {
      source: 'ipcRenderer.invoke',
      channel: channelName || BLANK_NAME,
    });

    records.push(record);

    if (!channelName) {
      blankNames.push(createBlankNameRecord(unit, 'ipc_invoke', match.index, match[0], 'Blank ipcRenderer.invoke channel name.'));
    }
  });

  collectMatches(content, /ipcRenderer\s*\.\s*invoke\s*\(\s*([A-Za-z_$][\w$]*)/g, function onDynamicInvoke(match) {
    records.push(createRecord(unit, 'ipc_invoke', UNKNOWN_NAME, match.index, match[0], {
      source: 'ipcRenderer.invoke.dynamic',
      dynamicExpression: cleanSnippet(match[1]),
    }));
  });

  return uniqueRecords(records, ['path', 'name', 'line', 'column', 'source']);
}

function scanIpcMainHandlers(unit, blankNames) {
  const records = [];
  const content = stripComments(unit.content);

  collectMatches(content, /ipcMain\s*\.\s*handle\s*\(\s*(['"`])([\s\S]*?)\1/g, function onHandle(match) {
    const channelName = cleanName(match[2]);
    const record = createRecord(unit, 'ipc_handler', channelName || BLANK_NAME, match.index, match[0], {
      source: 'ipcMain.handle',
      channel: channelName || BLANK_NAME,
    });

    records.push(record);

    if (!channelName) {
      blankNames.push(createBlankNameRecord(unit, 'ipc_handler', match.index, match[0], 'Blank ipcMain.handle channel name.'));
    }
  });

  collectMatches(content, /ipcMain\s*\.\s*handle\s*\(\s*([A-Za-z_$][\w$]*)/g, function onDynamicHandle(match) {
    records.push(createRecord(unit, 'ipc_handler', UNKNOWN_NAME, match.index, match[0], {
      source: 'ipcMain.handle.dynamic',
      dynamicExpression: cleanSnippet(match[1]),
    }));
  });

  return uniqueRecords(records, ['path', 'name', 'line', 'column', 'source']);
}

function scanButtonBindings(unit, blankNames) {
  const records = [];
  const content = stripComments(unit.content);

  collectMatches(
    content,
    /document\s*\.\s*getElementById\s*\(\s*(['"`])([\s\S]*?)\1\s*\)\s*\.\s*addEventListener\s*\(\s*(['"`])([\s\S]*?)\3/g,
    function onInlineGetElementBinding(match) {
      const buttonId = cleanName(match[2]);
      const eventName = cleanName(match[4]);
      const record = createButtonRecord(unit, buttonId || BLANK_NAME, eventName || BLANK_NAME, match.index, match[0], {
        source: 'getElementById.addEventListener',
      });

      records.push(record);

      if (!buttonId) {
        blankNames.push(createBlankNameRecord(unit, 'button_binding', match.index, match[0], 'Blank getElementById button id.'));
      }

      if (!eventName) {
        blankNames.push(createBlankNameRecord(unit, 'button_binding', match.index, match[0], 'Blank addEventListener event name.'));
      }
    }
  );

  collectMatches(content, /document\s*\.\s*getElementById\s*\(\s*(['"`])([\s\S]*?)\1\s*\)/g, function onGetElement(match) {
    const buttonId = cleanName(match[2]);

    records.push(createButtonRecord(unit, buttonId || BLANK_NAME, '', match.index, match[0], {
      source: 'getElementById',
    }));

    if (!buttonId) {
      blankNames.push(createBlankNameRecord(unit, 'button_binding', match.index, match[0], 'Blank getElementById button id.'));
    }
  });

  collectMatches(content, /\.addEventListener\s*\(\s*(['"`])([\s\S]*?)\1/g, function onAddEventListener(match) {
    const eventName = cleanName(match[2]);

    records.push(createButtonRecord(unit, '', eventName || BLANK_NAME, match.index, match[0], {
      source: 'addEventListener',
    }));

    if (!eventName) {
      blankNames.push(createBlankNameRecord(unit, 'button_binding', match.index, match[0], 'Blank addEventListener event name.'));
    }
  });

  return uniqueRecords(records, ['path', 'buttonId', 'eventName', 'line', 'column', 'source']);
}

function buildMissingPairs(input) {
  const missingPairs = [];
  const apiCallNames = toKnownNameSet(input.apiCalls);
  const apiExposureNames = toKnownNameSet(input.apiExposures);
  const invokeChannels = toKnownNameSet(input.ipcInvokes);
  const handlerChannels = toKnownNameSet(input.ipcHandlers);

  for (const apiName of Object.keys(apiCallNames).sort()) {
    if (!apiExposureNames[apiName]) {
      missingPairs.push({
        status: 'YELLOW_API_EXPOSURE_MISSING',
        type: 'api_call_without_exposure',
        name: apiName,
        sideA: 'window.sfApi call',
        sideB: 'contextBridge/window.sfApi exposure',
        records: apiCallNames[apiName],
        reason: 'Renderer uses window.sfApi name but matching preload exposure was not detected.',
        commanderDecisionNeeded: true,
      });
    }
  }

  for (const apiName of Object.keys(apiExposureNames).sort()) {
    if (!apiCallNames[apiName] && input.options.includeUnusedExposures === true) {
      missingPairs.push({
        status: 'YELLOW_API_CALL_MISSING',
        type: 'api_exposure_without_call',
        name: apiName,
        sideA: 'contextBridge/window.sfApi exposure',
        sideB: 'window.sfApi call',
        records: apiExposureNames[apiName],
        reason: 'Preload exposes window.sfApi name but matching renderer call was not detected.',
        commanderDecisionNeeded: true,
      });
    }
  }

  for (const channelName of Object.keys(invokeChannels).sort()) {
    if (!handlerChannels[channelName]) {
      missingPairs.push({
        status: 'YELLOW_IPC_HANDLER_MISSING',
        type: 'ipc_invoke_without_handler',
        name: channelName,
        sideA: 'ipcRenderer.invoke',
        sideB: 'ipcMain.handle',
        records: invokeChannels[channelName],
        reason: 'Renderer/preload invokes an IPC channel but matching main handler was not detected.',
        commanderDecisionNeeded: true,
      });
    }
  }

  for (const channelName of Object.keys(handlerChannels).sort()) {
    if (!invokeChannels[channelName] && input.options.includeUnusedHandlers === true) {
      missingPairs.push({
        status: 'YELLOW_IPC_INVOKE_MISSING',
        type: 'ipc_handler_without_invoke',
        name: channelName,
        sideA: 'ipcMain.handle',
        sideB: 'ipcRenderer.invoke',
        records: handlerChannels[channelName],
        reason: 'Main handles an IPC channel but matching renderer/preload invoke was not detected.',
        commanderDecisionNeeded: true,
      });
    }
  }

  appendMany(missingPairs, detectButtonBindingReviewNeeds(input.buttonBindings));

  return missingPairs;
}

function detectButtonBindingReviewNeeds(buttonBindings) {
  const reviewItems = [];

  for (const binding of buttonBindings) {
    if (!binding.buttonId && binding.eventName) {
      reviewItems.push({
        status: 'YELLOW_BUTTON_ID_REVIEW_REQUIRED',
        type: 'event_listener_without_detected_button_id',
        name: binding.eventName,
        sideA: 'addEventListener',
        sideB: 'getElementById',
        records: [binding],
        reason: 'An addEventListener candidate was detected without a nearby getElementById button id.',
        commanderDecisionNeeded: true,
      });
    }

    if (binding.buttonId && !binding.eventName) {
      reviewItems.push({
        status: 'YELLOW_BUTTON_EVENT_REVIEW_REQUIRED',
        type: 'button_id_without_detected_event_listener',
        name: binding.buttonId,
        sideA: 'getElementById',
        sideB: 'addEventListener',
        records: [binding],
        reason: 'A getElementById candidate was detected without inline addEventListener event name.',
        commanderDecisionNeeded: true,
      });
    }
  }

  return reviewItems;
}

function toKnownNameSet(records) {
  const output = Object.create(null);

  for (const record of records) {
    const name = cleanName(record.name || record.channel);

    if (!name || name === BLANK_NAME || name === UNKNOWN_NAME) {
      continue;
    }

    if (!output[name]) {
      output[name] = [];
    }

    output[name].push(record);
  }

  return output;
}

function createRecord(unit, type, name, absoluteIndex, snippet, extra) {
  const position = getLineColumn(unit.content, absoluteIndex);
  const record = {
    type,
    name: cleanName(name),
    path: unit.path,
    normalizedPath: unit.normalizedPath,
    unitIndex: unit.index,
    owner_worker: unit.owner_worker,
    operation: unit.operation,
    line: position.line,
    column: position.column,
    snippet: cleanSnippet(snippet),
  };

  return Object.assign(record, extra || {});
}

function createButtonRecord(unit, buttonId, eventName, absoluteIndex, snippet, extra) {
  const position = getLineColumn(unit.content, absoluteIndex);
  const record = {
    type: 'button_binding',
    buttonId: cleanName(buttonId),
    eventName: cleanName(eventName),
    path: unit.path,
    normalizedPath: unit.normalizedPath,
    unitIndex: unit.index,
    owner_worker: unit.owner_worker,
    operation: unit.operation,
    line: position.line,
    column: position.column,
    snippet: cleanSnippet(snippet),
  };

  return Object.assign(record, extra || {});
}

function createBlankNameRecord(unit, type, absoluteIndex, snippet, reason) {
  const position = getLineColumn(unit.content, absoluteIndex);

  return {
    status: STATUS_RED,
    type,
    path: unit.path,
    normalizedPath: unit.normalizedPath,
    unitIndex: unit.index,
    owner_worker: unit.owner_worker,
    operation: unit.operation,
    line: position.line,
    column: position.column,
    snippet: cleanSnippet(snippet),
    reason,
    commanderDecisionNeeded: true,
  };
}

function getRecommendedStatus(blankNames, missingPairs) {
  if (blankNames.length > 0) {
    return STATUS_RED;
  }

  if (missingPairs.length > 0) {
    return STATUS_YELLOW;
  }

  return STATUS_GREEN;
}

function normalizeSourceUnit(unit, index) {
  const normalized = unit && typeof unit === 'object' ? unit : {};

  return {
    index,
    path: readFirstStringField(normalized, ['path', 'file_path', 'target_path']),
    normalizedPath: normalizePath(readFirstStringField(normalized, ['path', 'file_path', 'target_path'])),
    language: readFirstStringField(normalized, ['language', 'lang']),
    operation: normalizeOperation(readFirstStringField(normalized, ['operation', 'op'])),
    owner_worker: readFirstStringField(normalized, ['owner_worker', 'ownerWorker', 'worker_id', 'workerId']),
    content: readFirstStringField(normalized, ['content', 'body', 'source', 'text']),
  };
}

function normalizeOperation(operation) {
  const text = cleanName(operation).toLowerCase().replace(/-/g, '_').replace(/\s+/g, '_');

  if (!text) {
    return 'unknown';
  }

  if (text === 'patchrequest') {
    return 'patch_request';
  }

  if (text === 'reportonly') {
    return 'report_only';
  }

  if (
    text === 'create' ||
    text === 'replace' ||
    text === 'modify' ||
    text === 'patch_request' ||
    text === 'report_only'
  ) {
    return text;
  }

  return 'unknown';
}

function normalizeOptions(options) {
  const raw = options && typeof options === 'object' ? options : {};

  return {
    includeUnusedExposures: raw.includeUnusedExposures === true,
    includeUnusedHandlers: raw.includeUnusedHandlers === true,
  };
}

function normalizePath(pathValue) {
  return cleanName(pathValue).replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\.\//, '').toLowerCase();
}

function readFirstStringField(unit, fieldNames) {
  if (!unit || typeof unit !== 'object') {
    return '';
  }

  for (const fieldName of fieldNames) {
    const value = readField(unit, fieldName);

    if (value !== undefined && value !== null && cleanName(value) !== '') {
      return cleanName(value);
    }
  }

  return '';
}

function readField(unit, fieldName) {
  if (!unit || typeof unit !== 'object') {
    return undefined;
  }

  if (Object.prototype.hasOwnProperty.call(unit, fieldName)) {
    return unit[fieldName];
  }

  const nestedContainers = ['metadata', 'sourceFile', 'source_file', 'header'];

  for (const containerName of nestedContainers) {
    const container = unit[containerName];

    if (
      container &&
      typeof container === 'object' &&
      Object.prototype.hasOwnProperty.call(container, fieldName)
    ) {
      return container[fieldName];
    }
  }

  return undefined;
}

function stripComments(content) {
  return String(content)
    .replace(/\/\*[\s\S]*?\*\//g, function replaceBlock(match) {
      return preserveNewlines(match);
    })
    .replace(/(^|[^:])\/\/.*$/gm, function replaceLine(match, prefix) {
      return prefix;
    });
}

function preserveNewlines(value) {
  return String(value).replace(/[^\n\r]/g, ' ');
}

function collectMatches(content, regex, callback) {
  let match;
  regex.lastIndex = 0;

  while ((match = regex.exec(content)) !== null) {
    callback(match);

    if (match[0] === '') {
      regex.lastIndex += 1;
    }
  }
}

function getLineColumn(content, absoluteIndex) {
  const safeIndex = Math.max(0, Math.min(absoluteIndex, content.length));
  const before = content.slice(0, safeIndex);
  const lines = before.split(/\r\n|\r|\n/);
  const line = lines.length;
  const column = lines[lines.length - 1].length + 1;

  return {
    line,
    column,
  };
}

function cleanName(value) {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).replace(/\0/g, '').trim();
}

function cleanSnippet(value) {
  return cleanName(value).replace(/\s+/g, ' ').slice(0, 240);
}

function appendMany(target, values) {
  if (!Array.isArray(values)) {
    return;
  }

  for (const value of values) {
    target.push(value);
  }
}

function uniqueRecords(records, fields) {
  const seen = Object.create(null);
  const output = [];

  for (const record of records) {
    const key = fields.map(function mapField(field) {
      return record[field] || '';
    }).join('|');

    if (seen[key]) {
      continue;
    }

    seen[key] = true;
    output.push(record);
  }

  return output;
}

module.exports = {
  checkApiIpcBindingConsistency,
};