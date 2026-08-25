
/* ST4_W40_TAEO_STORAGE_SERVICE_BINDING_PHASE2_START */
var __st4W40Fs = require('fs');
var __st4W40Path = require('path');

var __st4W40TaeoRawOutputStore = null;
var __st4W40PanelRecordExecutionStore = null;
var __st4W40WorkerOutputBatchStore = null;
var __st4W40StorageHashRegistry = global.__sfStage4TaeoStorageHashRegistry || (global.__sfStage4TaeoStorageHashRegistry = new Map());

function __st4W40RequireStore(relativeParts) {
  try {
    return require(__st4W40Path.join.apply(__st4W40Path, [__dirname, '..', '..'].concat(relativeParts)));
  } catch (_error) {
    return null;
  }
}

__st4W40TaeoRawOutputStore = __st4W40RequireStore(['src', 'shared', 'stage4', 'stores', 'taeoRawOutputStore']);
__st4W40PanelRecordExecutionStore = __st4W40RequireStore(['src', 'shared', 'stage4', 'stores', 'panelRecordExecutionStore']);
__st4W40WorkerOutputBatchStore = __st4W40RequireStore(['src', 'shared', 'stage4', 'stores', 'workerOutputBatchStore']);

function __st4W40NowIso() {
  return new Date().toISOString();
}

function __st4W40EnsureDir(dirPath) {
  __st4W40Fs.mkdirSync(dirPath, { recursive: true });
}

function __st4W40AppendJsonl(filePath, record) {
  __st4W40EnsureDir(__st4W40Path.dirname(filePath));
  __st4W40Fs.appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf8');
  return record;
}

function __st4W40CreateStoragePaths(options) {
  var source = options && typeof options === 'object' ? options : {};
  var baseRoot = source.storageRoot ||
    source.stage4StorageRoot ||
    __st4W40Path.join(__dirname, '..', '..', '_STAGE4_LOGS', 'stage4_station_records');

  return {
    baseRoot: baseRoot,
    taeoRawOutputPath: __st4W40Path.join(baseRoot, 'taeo_raw_outputs.jsonl'),
    panelRecordPath: __st4W40Path.join(baseRoot, 'panel_records.jsonl'),
    workerOutputBatchPath: __st4W40Path.join(baseRoot, 'worker_output_batches.jsonl')
  };
}

function __st4W40Value(source, names, fallback) {
  var obj = source && typeof source === 'object' ? source : {};
  for (var i = 0; i < names.length; i += 1) {
    var name = names[i];
    if (obj[name] !== undefined && obj[name] !== null && obj[name] !== '') {
      return obj[name];
    }
  }
  return fallback;
}

function __st4W40HashText(value) {
  var text = String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  var hash = 2166136261;
  for (var index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function __st4W40NormalizeAutosavePayload(payloadInput) {
  var source = payloadInput && typeof payloadInput === 'object' ? payloadInput : {};
  var rawText = String(__st4W40Value(source, ['raw_text', 'rawText', 'output_text', 'outputText', 'text', 'content'], ''));
  var outputText = String(__st4W40Value(source, ['output_text', 'outputText', 'text', 'content'], rawText));
  var now = __st4W40NowIso();
  var textHash = String(__st4W40Value(source, ['text_hash', 'textHash'], '')) ||
    __st4W40HashText([
      __st4W40Value(source, ['prompt_package_id', 'promptPackageId'], ''),
      __st4W40Value(source, ['prompt_package_version', 'promptPackageVersion'], ''),
      __st4W40Value(source, ['prompt_id', 'promptId'], ''),
      __st4W40Value(source, ['worker_slot', 'workerSlot'], ''),
      __st4W40Value(source, ['worker_id', 'workerId'], ''),
      __st4W40Value(source, ['source_terminal', 'sourceTerminal'], 'TAEO'),
      outputText || rawText
    ].join('::'));

  var workerSlot = String(__st4W40Value(source, ['worker_slot', 'workerSlot'], 'TAEO_AUTOSAVE'));
  var outputId = String(__st4W40Value(source, ['output_id', 'outputId'], 'OUT_' + now.replace(/[-:.TZ]/g, '') + '_' + workerSlot + '_' + textHash));

  return {
    output_id: outputId,
    prompt_id: String(__st4W40Value(source, ['prompt_id', 'promptId'], 'TAEO_AUTOSAVE_UNLINKED_PROMPT')),
    prompt_package_id: String(__st4W40Value(source, ['prompt_package_id', 'promptPackageId'], 'TAEO_AUTOSAVE_RUNTIME_PACKAGE')),
    prompt_package_version: String(__st4W40Value(source, ['prompt_package_version', 'promptPackageVersion'], '20260704.1')),
    worker_slot: workerSlot,
    worker_id: String(__st4W40Value(source, ['worker_id', 'workerId'], 'WORKER_TAEO_AUTOSAVE_RUNTIME')),
    source_terminal: String(__st4W40Value(source, ['source_terminal', 'sourceTerminal'], 'TAEO')),
    target_terminal: String(__st4W40Value(source, ['target_terminal', 'targetTerminal'], 'COLLECTOR')),
    raw_text: rawText,
    output_text: outputText || rawText,
    text_hash: textHash,
    captured_at: String(__st4W40Value(source, ['captured_at', 'capturedAt'], now)),
    autosave_at: String(__st4W40Value(source, ['autosave_at', 'autosaveAt'], now)),
    autosave_reason: String(__st4W40Value(source, ['autosave_reason', 'autosaveReason'], 'MANUAL_CAPTURE')),
    duplicate_skipped: Boolean(__st4W40Value(source, ['duplicate_skipped', 'duplicateSkipped'], false)),
    collector_status: String(__st4W40Value(source, ['collector_status', 'collectorStatus'], 'COLLECTED')),
    storage_status: String(__st4W40Value(source, ['storage_status', 'storageStatus'], 'PENDING')),
    storage_record_id: String(__st4W40Value(source, ['storage_record_id', 'storageRecordId', 'recordId'], '')),
    source_selector: String(__st4W40Value(source, ['source_selector', 'sourceSelector'], ''))
  };
}

function __st4W40IsTaeoAutosavePayload(payloadInput) {
  var source = payloadInput && typeof payloadInput === 'object' ? payloadInput : {};
  var text = JSON.stringify(source).toLowerCase();
  return text.indexOf('taeo') >= 0 ||
    text.indexOf('autosave') >= 0 ||
    Boolean(source.output_id || source.outputId || source.text_hash || source.textHash) ||
    Boolean(source.raw_text || source.rawText || source.output_text || source.outputText);
}

function __st4W40CallStoreOrManual(normalized, paths, options) {
  var appendResults = [];
  var primaryRecord = null;

  var rawRecord = {
    recordId: normalized.output_id,
    output_id: normalized.output_id,
    prompt_id: normalized.prompt_id,
    prompt_package_id: normalized.prompt_package_id,
    prompt_package_version: normalized.prompt_package_version,
    worker_slot: normalized.worker_slot,
    worker_id: normalized.worker_id,
    terminal: normalized.source_terminal,
    receivedAt: normalized.autosave_at,
    rawText: normalized.raw_text || normalized.output_text,
    outputText: normalized.output_text || normalized.raw_text,
    text_hash: normalized.text_hash,
    captured_at: normalized.captured_at,
    autosave_at: normalized.autosave_at,
    autosave_reason: normalized.autosave_reason,
    duplicate_skipped: false,
    collector_status: 'COLLECTED',
    storage_status: 'APPENDED',
    classification: {
      status: 'COLLECTED',
      labels: ['TAEO_AUTOSAVE_PHASE2'],
      confidence: 1,
      reason: normalized.autosave_reason
    },
    panelCommandSummary: {
      hasPanelCommand: false,
      route: 'STATION_04_STORAGE',
      action: 'appendStationRecords',
      commandId: normalized.prompt_id,
      summaryText: 'Taeo autosave raw output stored'
    }
  };

  try {
    if (__st4W40TaeoRawOutputStore && typeof __st4W40TaeoRawOutputStore.appendTaeoRawOutputRecord === 'function') {
      primaryRecord = __st4W40TaeoRawOutputStore.appendTaeoRawOutputRecord(paths.taeoRawOutputPath, rawRecord);
    } else if (__st4W40TaeoRawOutputStore && typeof __st4W40TaeoRawOutputStore.createTaeoRawOutputRecord === 'function') {
      primaryRecord = __st4W40TaeoRawOutputStore.createTaeoRawOutputRecord(rawRecord);
      __st4W40AppendJsonl(paths.taeoRawOutputPath, primaryRecord);
    } else {
      primaryRecord = __st4W40AppendJsonl(paths.taeoRawOutputPath, rawRecord);
    }
  } catch (_error) {
    primaryRecord = __st4W40AppendJsonl(paths.taeoRawOutputPath, rawRecord);
  }

  appendResults.push({
    store: 'taeoRawOutputStore',
    ok: true,
    recordId: (primaryRecord && (primaryRecord.recordId || primaryRecord.record_id)) || normalized.output_id
  });

  var panelRecordInput = {
    recordId: 'panel_record_' + normalized.output_id,
    recordType: 'PANEL_RECORD',
    terminal: normalized.source_terminal,
    createdAt: normalized.autosave_at,
    promptId: normalized.prompt_id,
    outputId: normalized.output_id,
    routeTarget: 'STATION_04_STORAGE',
    eventName: 'TAEO_AUTOSAVE_PHASE2_STORAGE_APPEND',
    status: 'COLLECTED',
    title: 'Taeo Autosave Phase 2',
    message: 'Taeo autosave payload appended to storage service',
    payload: normalized,
    panelCommandSummary: {
      hasPanelCommand: false,
      route: 'STATION_04_STORAGE',
      action: 'appendStationRecords',
      commandId: normalized.prompt_id,
      summaryText: 'Taeo autosave panel record stored'
    }
  };

  try {
    var panelRecord = null;
    if (__st4W40PanelRecordExecutionStore && typeof __st4W40PanelRecordExecutionStore.appendPanelRecord === 'function') {
      panelRecord = __st4W40PanelRecordExecutionStore.appendPanelRecord(paths.panelRecordPath, panelRecordInput);
    } else if (__st4W40PanelRecordExecutionStore && typeof __st4W40PanelRecordExecutionStore.createPanelRecord === 'function') {
      panelRecord = __st4W40PanelRecordExecutionStore.createPanelRecord(panelRecordInput);
      __st4W40AppendJsonl(paths.panelRecordPath, panelRecord);
    } else {
      panelRecord = __st4W40AppendJsonl(paths.panelRecordPath, panelRecordInput);
    }
    appendResults.push({ store: 'panelRecordExecutionStore', ok: true, recordId: panelRecord && panelRecord.recordId ? panelRecord.recordId : panelRecordInput.recordId });
  } catch (panelError) {
    appendResults.push({ store: 'panelRecordExecutionStore', ok: false, error: panelError && panelError.message ? panelError.message : String(panelError) });
  }

  if (options && options.batchId) {
    try {
      var workerBatchRecord = null;
      var batchInput = {
        batchId: options.batchId,
        terminal: normalized.target_terminal,
        receivedAt: normalized.autosave_at,
        workerId: normalized.worker_id,
        promptId: normalized.prompt_id,
        outputId: normalized.output_id,
        status: 'COLLECTED',
        rawText: normalized.raw_text || normalized.output_text,
        notes: 'Taeo autosave Phase 2 worker output batch append'
      };
      if (__st4W40WorkerOutputBatchStore && typeof __st4W40WorkerOutputBatchStore.addWorkerOutputToBatch === 'function') {
        workerBatchRecord = __st4W40WorkerOutputBatchStore.addWorkerOutputToBatch(paths.workerOutputBatchPath, batchInput);
      } else {
        workerBatchRecord = __st4W40AppendJsonl(paths.workerOutputBatchPath, batchInput);
      }
      appendResults.push({ store: 'workerOutputBatchStore', ok: true, recordId: workerBatchRecord && workerBatchRecord.recordId ? workerBatchRecord.recordId : '' });
    } catch (workerError) {
      appendResults.push({ store: 'workerOutputBatchStore', ok: false, error: workerError && workerError.message ? workerError.message : String(workerError) });
    }
  }

  return { primaryRecord: primaryRecord, appendResults: appendResults };
}

function __st4W40AppendTaeoAutosaveStorageRecord(payloadInput, optionsInput) {
  var options = optionsInput && typeof optionsInput === 'object' ? optionsInput : {};
  var normalized = __st4W40NormalizeAutosavePayload(payloadInput);
  var paths = __st4W40CreateStoragePaths(options);

  if (!String(normalized.raw_text || normalized.output_text || '').trim()) {
    return {
      ok: true,
      appended: false,
      duplicate_skipped: false,
      storage_status: 'SKIPPED_EMPTY',
      reason: 'EMPTY_AUTOSAVE_TEXT',
      payload: normalized
    };
  }

  var scopeKey = [
    normalized.prompt_package_id,
    normalized.prompt_package_version,
    normalized.prompt_id,
    normalized.worker_slot,
    normalized.worker_id,
    normalized.source_terminal,
    normalized.text_hash
  ].join('::');

  if (__st4W40StorageHashRegistry.has(scopeKey)) {
    var existing = __st4W40StorageHashRegistry.get(scopeKey);
    return {
      ok: true,
      appended: false,
      duplicate_skipped: true,
      storage_status: 'SKIPPED_DUPLICATE',
      collector_status: 'SKIPPED_DUPLICATE',
      storage_record_id: existing.storage_record_id || existing.recordId || normalized.output_id,
      recordId: existing.storage_record_id || existing.recordId || normalized.output_id,
      reason: 'DUPLICATE_TEXT_HASH',
      payload: Object.assign({}, normalized, {
        duplicate_skipped: true,
        storage_status: 'SKIPPED_DUPLICATE',
        collector_status: 'SKIPPED_DUPLICATE'
      })
    };
  }

  var stored = __st4W40CallStoreOrManual(normalized, paths, options);
  var primaryId = (stored.primaryRecord && (stored.primaryRecord.recordId || stored.primaryRecord.record_id)) ||
    normalized.output_id;

  var storageResult = {
    ok: true,
    appended: true,
    duplicate_skipped: false,
    storage_status: 'APPENDED',
    collector_status: 'COLLECTED',
    storage_record_id: primaryId,
    recordId: primaryId,
    text_hash: normalized.text_hash,
    payload: Object.assign({}, normalized, {
      storage_status: 'APPENDED',
      storage_record_id: primaryId,
      collector_status: 'COLLECTED'
    }),
    appendResults: stored.appendResults,
    storage_paths: paths
  };

  __st4W40StorageHashRegistry.set(scopeKey, storageResult);
  return storageResult;
}

async function __st4W40HandleAppendStationRecordsPhase2(event, payload, deps, originalHandler) {
  var sourcePayload = payload && typeof payload === 'object' ? payload :
    (event && typeof event === 'object' && !event.sender && !event.senderFrame ? event : {});
  var dataPayload = sourcePayload.payload && typeof sourcePayload.payload === 'object' ? sourcePayload.payload : sourcePayload;
  var station = sourcePayload.station || 'STATION_04_STORAGE';
  var action = sourcePayload.action || 'append_station_records';

  if (__st4W40IsTaeoAutosavePayload(dataPayload)) {
    try {
      var storageResult = __st4W40AppendTaeoAutosaveStorageRecord(dataPayload, {
        storageRoot: sourcePayload.storageRoot,
        stage4StorageRoot: sourcePayload.stage4StorageRoot,
        batchId: sourcePayload.batchId || sourcePayload.batch_id
      });

      return {
        ok: true,
        station: station,
        action: action,
        data: Object.assign({
          appended: storageResult.appended === true,
          storage_status: storageResult.storage_status || (storageResult.appended ? 'APPENDED' : 'NO_STORAGE_SERVICE_BOUND'),
          storage_record_id: storageResult.storage_record_id || storageResult.recordId || '',
          recordId: storageResult.recordId || storageResult.storage_record_id || '',
          duplicate_skipped: storageResult.duplicate_skipped === true,
          collector_status: storageResult.collector_status || 'COLLECTED'
        }, storageResult),
        error: null
      };
    } catch (error) {
      return {
        ok: true,
        station: station,
        action: action,
        data: {
          appended: false,
          storage_status: 'APPEND_ERROR_RECORDED',
          reason: 'TAEO_AUTOSAVE_STORAGE_APPEND_ERROR'
        },
        error: {
          code: 'TAEO_AUTOSAVE_STORAGE_APPEND_ERROR',
          message: error && error.message ? error.message : String(error)
        }
      };
    }
  }

  if (typeof originalHandler === 'function') {
    return await originalHandler(event, payload, deps);
  }

  return {
    ok: true,
    station: station,
    action: action,
    data: {
      appended: false,
      storage_status: 'NO_STORAGE_SERVICE_BOUND',
      reason: 'NO_STORAGE_SERVICE_BOUND'
    },
    error: null
  };
}
/* ST4_W40_TAEO_STORAGE_SERVICE_BINDING_PHASE2_END */


'use strict';


/* ST4_W45_VERSION_HANDLER_BINDING_START */
function __st4W45HandlerPick(source, names, fallback) {
  const obj = source && typeof source === 'object' ? source : {};
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    if (obj[name] !== undefined && obj[name] !== null && obj[name] !== '') {
      return obj[name];
    }
  }
  return fallback;
}

function __st4W45ReadHandlerVersionFields(payload, data) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const nested = source.payload && typeof source.payload === 'object' ? source.payload : {};
  const responseData = data && typeof data === 'object' ? data : {};

  function pick(names, fallback) {
    return __st4W45HandlerPick(responseData, names, undefined) !== undefined
      ? __st4W45HandlerPick(responseData, names, fallback)
      : __st4W45HandlerPick(source, names, __st4W45HandlerPick(nested, names, fallback));
  }

  return {
    prompt_package_id: pick(['prompt_package_id', 'promptPackageId'], ''),
    prompt_package_version: pick(['prompt_package_version', 'promptPackageVersion'], ''),
    target_stage: pick(['target_stage', 'targetStage'], ''),
    commander_function_class: pick(['commander_function_class', 'commanderFunctionClass'], ''),
    worker_function_class: pick(['worker_function_class', 'workerFunctionClass'], ''),
    api_ipc_button_contract_id: pick(['api_ipc_button_contract_id', 'apiIpcButtonContractId'], ''),
    source_factory_constitution_version: pick(['source_factory_constitution_version', 'sourceFactoryConstitutionVersion'], ''),
    prompt_id: pick(['prompt_id', 'promptId'], ''),
    task_id: pick(['task_id', 'taskId'], ''),
    worker_id: pick(['worker_id', 'workerId'], ''),
    worker_slot: pick(['worker_slot', 'workerSlot'], ''),
    send_order: pick(['send_order', 'sendOrder'], ''),
    dedupe_key: pick(['dedupe_key', 'dedupeKey'], ''),
    old_prompt_reuse_candidate: Boolean(source.old_prompt_reuse_candidate || source.oldPromptReuseCandidate || nested.old_prompt_reuse_candidate || nested.oldPromptReuseCandidate || source.already_sent || source.alreadySent),
    expected_prompt_package_id: __st4W45HandlerPick(source, ['expected_prompt_package_id', 'expectedPromptPackageId'], __st4W45HandlerPick(nested, ['expected_prompt_package_id', 'expectedPromptPackageId'], '')),
    expected_prompt_package_version: __st4W45HandlerPick(source, ['expected_prompt_package_version', 'expectedPromptPackageVersion'], __st4W45HandlerPick(nested, ['expected_prompt_package_version', 'expectedPromptPackageVersion'], ''))
  };
}

function __st4W45ComputeVersionBindingStatus(fields) {
  const issues = [];
  if (!fields.prompt_package_id) {
    issues.push({
      status: 'YELLOW_VERSION_FIELD_MISSING',
      field: 'prompt_package_id',
      reason: 'prompt_package_id is missing; do not create a default value'
    });
  }
  if (!fields.prompt_package_version) {
    issues.push({
      status: 'YELLOW_VERSION_FIELD_MISSING',
      field: 'prompt_package_version',
      reason: 'prompt_package_version is missing; do not create a default value'
    });
  }
  if (fields.expected_prompt_package_id && fields.prompt_package_id && fields.expected_prompt_package_id !== fields.prompt_package_id) {
    issues.push({
      status: 'RED_VERSION_MISMATCH_CANDIDATE',
      field: 'prompt_package_id',
      expected: fields.expected_prompt_package_id,
      actual: fields.prompt_package_id,
      reason: 'prompt_package_id mismatch'
    });
  }
  if (fields.expected_prompt_package_version && fields.prompt_package_version && fields.expected_prompt_package_version !== fields.prompt_package_version) {
    issues.push({
      status: 'RED_VERSION_MISMATCH_CANDIDATE',
      field: 'prompt_package_version',
      expected: fields.expected_prompt_package_version,
      actual: fields.prompt_package_version,
      reason: 'prompt_package_version mismatch'
    });
  }
  if (fields.old_prompt_reuse_candidate) {
    issues.push({
      status: fields.expected_prompt_package_version && fields.prompt_package_version && fields.expected_prompt_package_version !== fields.prompt_package_version
        ? 'RED_OLD_PROMPT_REUSE_CANDIDATE'
        : 'YELLOW_OLD_PROMPT_REUSE_CANDIDATE',
      field: 'prompt_id',
      prompt_id: fields.prompt_id,
      reason: 'old prompt reuse candidate detected'
    });
  }
  const hasRed = issues.some(function isRed(issue) { return String(issue.status).indexOf('RED_') === 0; });
  const hasYellow = issues.some(function isYellow(issue) { return String(issue.status).indexOf('YELLOW_') === 0; });
  return {
    version_binding_status: hasRed ? 'RED_VERSION_MISMATCH_CANDIDATE' : hasYellow ? 'YELLOW_VERSION_FIELD_MISSING' : 'GREEN_VERSION_FIELDS_BOUND',
    version_binding_issues: issues,
    version_binding_issue_count: issues.length
  };
}

function __st4W45EnhanceVersionBindingResponse(response, payload) {
  if (!response || typeof response !== 'object') {
    return response;
  }

  const data = Object.assign({}, response.data || {});
  const fields = __st4W45ReadHandlerVersionFields(payload, data);
  const status = __st4W45ComputeVersionBindingStatus(fields);

  [
    'prompt_package_id',
    'prompt_package_version',
    'target_stage',
    'commander_function_class',
    'worker_function_class',
    'api_ipc_button_contract_id',
    'source_factory_constitution_version',
    'prompt_id',
    'task_id',
    'worker_id',
    'worker_slot',
    'send_order',
    'dedupe_key'
  ].forEach(function copyField(field) {
    if (fields[field] !== undefined && fields[field] !== null && fields[field] !== '') {
      data[field] = fields[field];
    } else if (!Object.prototype.hasOwnProperty.call(data, field)) {
      data[field] = '';
    }
  });

  data.version_binding_status = status.version_binding_status;
  data.version_binding_issues = status.version_binding_issues;
  data.version_binding_issue_count = status.version_binding_issue_count;

  if (data.gate_handoff && typeof data.gate_handoff === 'object') {
    data.gate_handoff.source = Object.assign({}, data.gate_handoff.source || {}, {
      prompt_package_id: data.prompt_package_id,
      prompt_package_version: data.prompt_package_version,
      target_stage: data.target_stage,
      commander_function_class: data.commander_function_class,
      worker_function_class: data.worker_function_class,
      api_ipc_button_contract_id: data.api_ipc_button_contract_id,
      source_factory_constitution_version: data.source_factory_constitution_version,
      prompt_id: data.prompt_id || (data.gate_handoff.source ? data.gate_handoff.source.prompt_id : null),
      task_id: data.task_id || (data.gate_handoff.source ? data.gate_handoff.source.task_id : null),
      worker_id: data.worker_id || (data.gate_handoff.source ? data.gate_handoff.source.worker_id : null),
      worker_slot: data.worker_slot || (data.gate_handoff.source ? data.gate_handoff.source.worker_slot : null),
      send_order: data.send_order,
      dedupe_key: data.dedupe_key,
      batchId: data.batchId || data.batch_id || '',
      batch_record_id: data.batch_record_id || data.batchRecordId || data.recordId || ''
    });

    data.gate_handoff.version_binding_status = data.version_binding_status;
    data.gate_handoff.version_binding_issues = data.version_binding_issues;
    data.gate_handoff.version_binding_issue_count = data.version_binding_issue_count;
    data.gate_handoff.gate_inputs = Object.assign({}, data.gate_handoff.gate_inputs || {}, {
      prompt_package_id: data.prompt_package_id,
      prompt_package_version: data.prompt_package_version,
      version_binding_status: data.version_binding_status,
      version_binding_issues: data.version_binding_issues,
      version_binding_issue_count: data.version_binding_issue_count
    });

    if (!data.gate_handoff.next_commander_action || typeof data.gate_handoff.next_commander_action !== 'object') {
      data.gate_handoff.next_commander_action = data.next_commander_action && typeof data.next_commander_action === 'object'
        ? data.next_commander_action
        : {};
    }

    data.gate_handoff.next_commander_action.version_context = {
      prompt_package_id: data.prompt_package_id,
      prompt_package_version: data.prompt_package_version,
      prompt_id: data.prompt_id,
      task_id: data.task_id,
      worker_id: data.worker_id,
      worker_slot: data.worker_slot,
      send_order: data.send_order,
      dedupe_key: data.dedupe_key,
      batchId: data.batchId || data.batch_id || '',
      batch_record_id: data.batch_record_id || data.batchRecordId || data.recordId || '',
      version_binding_status: data.version_binding_status,
      version_binding_issue_count: data.version_binding_issue_count
    };

    data.next_commander_action = data.gate_handoff.next_commander_action;
    data.commander_gate_handoff = data.gate_handoff;
  }

  return Object.assign({}, response, { data: data });
}
/* ST4_W45_VERSION_HANDLER_BINDING_END */




/* ST4_W44_GATE_ADAPTER_HANDLER_BINDING_START */
var __st4W44Path = require('path');
var __st4W44CollectorCommanderGateHandoffAdapter = null;

try {
  __st4W44CollectorCommanderGateHandoffAdapter = require(__st4W44Path.join(__dirname, '..', '..', 'src', 'shared', 'stage4', 'collectorCommanderGateHandoffAdapter'));
} catch (_error) {
  __st4W44CollectorCommanderGateHandoffAdapter = null;
}

function __st4W44BuildCollectorCommanderGateHandoffSafe(response, payload) {
  var data = response && response.data && typeof response.data === 'object' ? response.data : {};
  var sourcePayload = payload && typeof payload === 'object' ? payload : {};
  var nestedPayload = sourcePayload.payload && typeof sourcePayload.payload === 'object' ? sourcePayload.payload : {};

  if (!__st4W44CollectorCommanderGateHandoffAdapter ||
      typeof __st4W44CollectorCommanderGateHandoffAdapter.normalizeCollectorResponseToGateHandoff !== 'function') {
    return {
      ok: false,
      status: 'YELLOW_GATE_HANDOFF_ADAPTER_NOT_BOUND',
      gate_handoff: null,
      gate_recommendation: null,
      next_commander_action: null,
      error: {
        code: 'YELLOW_GATE_HANDOFF_ADAPTER_NOT_BOUND',
        message: 'collectorCommanderGateHandoffAdapter.normalizeCollectorResponseToGateHandoff is not available'
      }
    };
  }

  try {
    var handoff = __st4W44CollectorCommanderGateHandoffAdapter.normalizeCollectorResponseToGateHandoff(response, {
      source: 'collectWorkerOutput',
      targetStage: 'STAGE4_CLASSIFIER_VALIDATION_PANEL_AUTOMATION',
      baseline: 'STAGE4_PRODUCTION_BASELINE_GREEN_20260704_PLUS_W33_PROMPT_QUEUE_PATCH_PLUS_W39_TAEO_AUTOSAVE_RENDERER_PLUS_W40_TAEO_STORAGE_BINDING_PLUS_W42_COLLECTOR_EXTRACTOR_BINDING_PLUS_W43_COLLECTOR_BATCH_STORE_BINDING_PLUS_W44_GATE_ADAPTER_HELPER',
      prompt_id: data.prompt_id || data.promptId || sourcePayload.prompt_id || sourcePayload.promptId || nestedPayload.prompt_id || nestedPayload.promptId || null,
      prompt_package_id: data.prompt_package_id || data.promptPackageId || sourcePayload.prompt_package_id || sourcePayload.promptPackageId || nestedPayload.prompt_package_id || nestedPayload.promptPackageId || null,
      prompt_package_version: data.prompt_package_version || data.promptPackageVersion || sourcePayload.prompt_package_version || sourcePayload.promptPackageVersion || nestedPayload.prompt_package_version || nestedPayload.promptPackageVersion || null,
      worker_slot: data.worker_slot || data.workerSlot || sourcePayload.worker_slot || sourcePayload.workerSlot || nestedPayload.worker_slot || nestedPayload.workerSlot || null,
      worker_id: data.worker_id || data.workerId || sourcePayload.worker_id || sourcePayload.workerId || nestedPayload.worker_id || nestedPayload.workerId || null,
      task_id: data.task_id || data.taskId || sourcePayload.task_id || sourcePayload.taskId || nestedPayload.task_id || nestedPayload.taskId || null
    });

    return {
      ok: true,
      status: 'GATE_HANDOFF_ADAPTER_APPENDED',
      gate_handoff: handoff,
      gate_recommendation: handoff && handoff.gate_recommendation ? handoff.gate_recommendation : (handoff && handoff.gateRecommendation ? handoff.gateRecommendation : null),
      next_commander_action: handoff && handoff.next_commander_action ? handoff.next_commander_action : (handoff && handoff.nextCommanderAction ? handoff.nextCommanderAction : null),
      error: null
    };
  } catch (error) {
    return {
      ok: false,
      status: 'YELLOW_GATE_HANDOFF_ADAPTER_FAILED',
      gate_handoff: null,
      gate_recommendation: null,
      next_commander_action: null,
      error: {
        code: 'YELLOW_GATE_HANDOFF_ADAPTER_FAILED',
        message: error && error.message ? error.message : String(error)
      }
    };
  }
}

function __st4W44EnhanceCollectWorkerOutputGateHandoff(response, payload) {
  if (!response || typeof response !== 'object') {
    return response;
  }

  var data = Object.assign({}, response.data || {});
  var responseForAdapter = Object.assign({}, response, { data: data });
  var handoffResult = __st4W44BuildCollectorCommanderGateHandoffSafe(responseForAdapter, payload);

  data.gate_handoff = handoffResult.gate_handoff;
  data.commander_gate_handoff = handoffResult.gate_handoff;
  data.gate_handoff_status = handoffResult.status;
  data.gate_recommendation = handoffResult.gate_recommendation;
  data.next_commander_action = handoffResult.next_commander_action;

  if (handoffResult.ok === false) {
    data.gate_handoff_error = handoffResult.error;
  }

  return Object.assign({}, response, {
    data: data,
    error: response.error || null
  });
}
/* ST4_W44_GATE_ADAPTER_HANDLER_BINDING_END */




/* ST4_W43_COLLECTOR_BATCH_STORE_BINDING_START */
var __st4W43Path = require('path');
var __st4W43Fs = require('fs');
var __st4W43WorkerOutputBatchStore = null;
var __st4W43BatchRegistry = global.__sfStage4CollectorBatchRegistry || (global.__sfStage4CollectorBatchRegistry = new Map());

try {
  __st4W43WorkerOutputBatchStore = require(__st4W43Path.join(__dirname, '..', '..', 'src', 'shared', 'stage4', 'stores', 'workerOutputBatchStore'));
} catch (_error) {
  __st4W43WorkerOutputBatchStore = null;
}

function __st4W43NowIso() {
  return new Date().toISOString();
}

function __st4W43String(value) {
  return value === undefined || value === null ? '' : String(value);
}

function __st4W43Array(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null || value === '') {
    return [];
  }
  return [value];
}

function __st4W43StableHash(value) {
  var text = __st4W43String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  var hash = 2166136261;
  for (var index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function __st4W43Pick(source, names, fallback) {
  var obj = source && typeof source === 'object' ? source : {};
  for (var i = 0; i < names.length; i += 1) {
    var name = names[i];
    if (obj[name] !== undefined && obj[name] !== null && obj[name] !== '') {
      return obj[name];
    }
  }
  return fallback;
}

function __st4W43RawText(payload, data) {
  var source = payload && typeof payload === 'object' ? payload : {};
  var nested = source.payload && typeof source.payload === 'object' ? source.payload : {};
  var responseData = data && typeof data === 'object' ? data : {};

  return __st4W43String(
    __st4W43Pick(source, ['rawText', 'raw_text', 'outputText', 'output_text', 'text', 'content'], '') ||
    __st4W43Pick(nested, ['rawText', 'raw_text', 'outputText', 'output_text', 'text', 'content'], '') ||
    __st4W43Pick(responseData, ['rawText', 'raw_text', 'outputText', 'output_text', 'text', 'workerReport'], '')
  );
}

function __st4W43DeriveBatchId(payload, data) {
  var source = payload && typeof payload === 'object' ? payload : {};
  var nested = source.payload && typeof source.payload === 'object' ? source.payload : {};
  var merged = Object.assign({}, nested, source);
  var responseData = data && typeof data === 'object' ? data : {};

  var explicitBatchId = __st4W43Pick(merged, ['batchId', 'batch_id', 'worker_output_batch_id', 'workerOutputBatchId'], '');
  if (explicitBatchId) {
    return __st4W43String(explicitBatchId);
  }

  var promptPackageId = __st4W43Pick(merged, ['prompt_package_id', 'promptPackageId'], '');
  var promptPackageVersion = __st4W43Pick(merged, ['prompt_package_version', 'promptPackageVersion'], '');
  var promptId = __st4W43Pick(merged, ['prompt_id', 'promptId'], '');
  var workerSlot = __st4W43Pick(merged, ['worker_slot', 'workerSlot'], '');
  var workerId = __st4W43Pick(merged, ['worker_id', 'workerId'], '');
  var taskId = __st4W43Pick(merged, ['task_id', 'taskId'], '');

  if (promptPackageId || promptPackageVersion || promptId || workerSlot) {
    return 'collector_batch_' + __st4W43StableHash([
      promptPackageId,
      promptPackageVersion,
      promptId,
      workerSlot,
      workerId,
      taskId
    ].join('::'));
  }

  var outputId = __st4W43Pick(merged, ['output_id', 'outputId'], '');
  if (outputId) {
    return 'collector_output_batch_' + __st4W43StableHash(outputId);
  }

  var textHash = __st4W43Pick(merged, ['text_hash', 'textHash'], '');
  if (textHash) {
    return 'collector_text_batch_' + __st4W43StableHash(textHash);
  }

  return 'collector_ad_hoc_batch_' + __st4W43StableHash([
    workerId,
    taskId,
    responseData.sourceFileCount || __st4W43Array(responseData.sourceFiles).length,
    responseData.workerReportCount || __st4W43Array(responseData.workerReports).length,
    responseData.errorCandidateCount || __st4W43Array(responseData.errorCandidates).length,
    __st4W43RawText(merged, responseData)
  ].join('::'));
}

function __st4W43StorageRoot(payload) {
  var source = payload && typeof payload === 'object' ? payload : {};
  var nested = source.payload && typeof source.payload === 'object' ? source.payload : {};
  var explicitRoot =
    __st4W43Pick(source, ['storageRoot', 'stage4StorageRoot', 'workerOutputStorageRoot'], '') ||
    __st4W43Pick(nested, ['storageRoot', 'stage4StorageRoot', 'workerOutputStorageRoot'], '');

  return explicitRoot || __st4W43Path.join(__dirname, '..', '..', '_STAGE4_LOGS', 'stage4_station_records');
}

function __st4W43StoragePath(payload) {
  return __st4W43Path.join(__st4W43StorageRoot(payload), 'worker_output_batches.jsonl');
}

function __st4W43NormalizeSourceFileCandidate(item, index) {
  if (typeof item === 'string') {
    return {
      path: '',
      language: '',
      purpose: '',
      operation: '',
      ownerWorker: '',
      targetStage: '',
      contentLength: item.length,
      blockIndex: index,
      rawBlock: item
    };
  }

  var source = item && typeof item === 'object' ? item : {};
  var header = source.header && typeof source.header === 'object' ? source.header : source;

  return {
    path: __st4W43String(__st4W43Pick(header, ['path', 'target_path', 'targetPath'], '')),
    language: __st4W43String(__st4W43Pick(header, ['language', 'lang'], '')),
    purpose: __st4W43String(__st4W43Pick(header, ['purpose'], '')),
    operation: __st4W43String(__st4W43Pick(header, ['operation', 'op'], '')),
    ownerWorker: __st4W43String(__st4W43Pick(header, ['owner_worker', 'ownerWorker', 'worker_id', 'workerId'], '')),
    targetStage: __st4W43String(__st4W43Pick(header, ['target_stage', 'targetStage'], '')),
    contentLength: typeof source.content === 'string' ? source.content.length : 0,
    blockIndex: Number.isFinite(Number(source.index)) ? Number(source.index) : index,
    rawBlock: source.rawBlock || source.raw_block || ''
  };
}

function __st4W43NormalizeWorkerReport(item) {
  if (typeof item === 'string') {
    return { rawReportText: item };
  }

  var source = item && typeof item === 'object' ? item : {};
  var fields = source.fields && typeof source.fields === 'object' ? source.fields : source;

  return {
    worker_id: __st4W43Pick(fields, ['worker_id', 'workerId'], ''),
    task_id: __st4W43Pick(fields, ['task_id', 'taskId'], ''),
    worker_function_class: __st4W43Pick(fields, ['worker_function_class', 'workerFunctionClass'], ''),
    files_created: __st4W43Pick(fields, ['files_created', 'filesCreated'], ''),
    files_modified: __st4W43Pick(fields, ['files_modified', 'filesModified'], ''),
    patch_requests_created: __st4W43Pick(fields, ['patch_requests_created', 'patchRequestsCreated'], ''),
    report_only_artifacts: __st4W43Pick(fields, ['report_only_artifacts', 'reportOnlyArtifacts'], ''),
    tests_run: __st4W43Pick(fields, ['tests_run', 'testsRun'], ''),
    tests_not_run: __st4W43Pick(fields, ['tests_not_run', 'testsNotRun'], ''),
    class_contract_status: __st4W43Pick(fields, ['class_contract_status', 'classContractStatus'], ''),
    priority_0_status: __st4W43Pick(fields, ['priority_0_status', 'priority0Status'], ''),
    known_risks: __st4W43Pick(fields, ['known_risks', 'knownRisks'], ''),
    next_needed: __st4W43Pick(fields, ['next_needed', 'nextNeeded'], ''),
    rawReportText: source.rawReportText || source.rawBlock || source.raw_block || ''
  };
}

function __st4W43BuildBatchPayload(payload, data, batchId) {
  var source = payload && typeof payload === 'object' ? payload : {};
  var nested = source.payload && typeof source.payload === 'object' ? source.payload : {};
  var merged = Object.assign({}, nested, source);
  var sourceFiles = __st4W43Array(data.sourceFiles);
  var workerReports = __st4W43Array(data.workerReports);
  var errorCandidates = __st4W43Array(data.errorCandidates);
  var rawText = __st4W43RawText(merged, data);

  return {
    batchId: batchId,
    terminal: __st4W43Pick(merged, ['target_terminal', 'targetTerminal', 'terminal'], 'LAO'),
    receivedAt: __st4W43Pick(merged, ['autosave_at', 'autosaveAt', 'captured_at', 'capturedAt', 'receivedAt'], __st4W43NowIso()),
    workerId: __st4W43Pick(merged, ['worker_id', 'workerId'], ''),
    taskId: __st4W43Pick(merged, ['task_id', 'taskId'], ''),
    promptId: __st4W43Pick(merged, ['prompt_id', 'promptId'], ''),
    outputId: __st4W43Pick(merged, ['output_id', 'outputId'], ''),
    status: 'READY_FOR_GATE',
    rawText: rawText,
    sourceFileCandidates: sourceFiles.map(__st4W43NormalizeSourceFileCandidate),
    workerReport: __st4W43NormalizeWorkerReport(workerReports[0] || data.workerReport || {}),
    panelCommandSummary: {
      hasPanelCommand: false,
      route: 'STATION_03_COLLECTION',
      action: 'collectWorkerOutput',
      commandId: __st4W43Pick(merged, ['prompt_id', 'promptId'], ''),
      summaryText: 'Worker output collected and appended to batch store'
    },
    notes: JSON.stringify({
      collector_status: data.collector_status || '',
      classContractStatus: data.classContractStatus || '',
      sourceFileCount: data.sourceFileCount || sourceFiles.length,
      workerReportCount: data.workerReportCount || workerReports.length,
      errorCandidateCount: data.errorCandidateCount || errorCandidates.length,
      errorCandidates: errorCandidates
    })
  };
}

function __st4W43AppendCollectorBatch(payload, data) {
  var batchId = __st4W43DeriveBatchId(payload, data);
  var rawText = __st4W43RawText(payload, data);
  var duplicateKey = [
    batchId,
    __st4W43StableHash(rawText),
    data.sourceFileCount || 0,
    data.workerReportCount || 0,
    data.errorCandidateCount || 0
  ].join('::');

  if (__st4W43BatchRegistry.has(duplicateKey)) {
    var previous = __st4W43BatchRegistry.get(duplicateKey);
    return {
      ok: true,
      appended: false,
      duplicate_skipped: true,
      batch_record_id: previous.batch_record_id,
      recordId: previous.batch_record_id,
      batchId: batchId,
      batch_status: 'SKIPPED_DUPLICATE',
      batch_store_status: 'SKIPPED_DUPLICATE',
      batch_appended: false,
      batch_store_appended: false,
      collector_status: 'SKIPPED_DUPLICATE',
      storage_path: previous.storage_path
    };
  }

  if (!__st4W43WorkerOutputBatchStore ||
      typeof __st4W43WorkerOutputBatchStore.addWorkerOutputToBatch !== 'function') {
    return {
      ok: true,
      appended: false,
      duplicate_skipped: false,
      batch_record_id: null,
      recordId: null,
      batchId: batchId,
      batch_status: 'YELLOW_BATCH_STORE_NOT_BOUND',
      batch_store_status: 'YELLOW_BATCH_STORE_NOT_BOUND',
      batch_appended: false,
      batch_store_appended: false,
      collector_status: data.collector_status || 'COLLECTED_NO_BATCH',
      reason: 'workerOutputBatchStore.addWorkerOutputToBatch_not_available'
    };
  }

  try {
    var storagePath = __st4W43StoragePath(payload);
    __st4W43Fs.mkdirSync(__st4W43Path.dirname(storagePath), { recursive: true });
    var batchPayload = __st4W43BuildBatchPayload(payload, data, batchId);
    var appendedRecord = __st4W43WorkerOutputBatchStore.addWorkerOutputToBatch(storagePath, batchPayload);
    var recordId = appendedRecord && appendedRecord.recordId ? appendedRecord.recordId : '';

    var success = {
      ok: true,
      appended: true,
      duplicate_skipped: false,
      batch_record_id: recordId,
      recordId: recordId,
      batchId: batchId,
      batch_status: 'APPENDED',
      batch_store_status: 'APPENDED',
      batch_appended: true,
      batch_store_appended: true,
      collector_status: 'BATCH_STORE_APPENDED',
      storage_path: storagePath,
      append_record: appendedRecord
    };

    __st4W43BatchRegistry.set(duplicateKey, success);
    return success;
  } catch (error) {
    return {
      ok: true,
      appended: false,
      duplicate_skipped: false,
      batch_record_id: null,
      recordId: null,
      batchId: batchId,
      batch_status: 'YELLOW_BATCH_STORE_APPEND_FAILED',
      batch_store_status: 'YELLOW_BATCH_STORE_APPEND_FAILED',
      batch_appended: false,
      batch_store_appended: false,
      collector_status: 'YELLOW_BATCH_STORE_APPEND_FAILED',
      reason: error && error.message ? error.message : String(error),
      error: {
        code: 'YELLOW_BATCH_STORE_APPEND_FAILED',
        message: error && error.message ? error.message : String(error)
      }
    };
  }
}

function __st4W43EnhanceCollectorBatchResponse(response, payload) {
  if (!response || typeof response !== 'object') {
    return response;
  }

  var data = Object.assign({}, response.data || {});
  var batchResult = __st4W43AppendCollectorBatch(payload, data);

  data.batch_record_id = batchResult.batch_record_id || batchResult.recordId || data.batch_record_id || null;
  data.batchRecordId = data.batch_record_id;
  data.recordId = data.recordId || data.batch_record_id || null;
  data.batchId = batchResult.batchId || data.batchId || '';
  data.batch_status = batchResult.batch_status || data.batch_status || '';
  data.batch_store_status = batchResult.batch_store_status || data.batch_store_status || '';
  data.batch_appended = batchResult.batch_appended === true;
  data.batch_store_appended = batchResult.batch_store_appended === true;
  data.duplicate_skipped = data.duplicate_skipped === true || batchResult.duplicate_skipped === true;
  data.batch_result = batchResult;

  if (batchResult.collector_status === 'BATCH_STORE_APPENDED' || batchResult.collector_status === 'SKIPPED_DUPLICATE') {
    data.collector_status = batchResult.collector_status;
  } else if (!data.collector_status) {
    data.collector_status = batchResult.collector_status || 'COLLECTED_NO_BATCH';
  }

  return Object.assign({}, response, {
    data: data,
    error: batchResult && batchResult.error ? batchResult.error : (response.error || null)
  });
}
/* ST4_W43_COLLECTOR_BATCH_STORE_BINDING_END */




/* ST4_W42_COLLECTOR_EXTRACTOR_BINDING_START */
var __st4W42Path = require('path');
var __st4W42WorkerReportErrorExtractor = null;

try {
  __st4W42WorkerReportErrorExtractor = require(__st4W42Path.join(__dirname, '..', '..', 'src', 'shared', 'stage4', 'workerReportErrorExtractor'));
} catch (_error) {
  __st4W42WorkerReportErrorExtractor = null;
}

function __st4W42String(value) {
  return value === undefined || value === null ? '' : String(value);
}

function __st4W42ReadRawText(payload, response) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const nested = source.payload && typeof source.payload === 'object' ? source.payload : {};
  const data = response && response.data && typeof response.data === 'object' ? response.data : {};

  return __st4W42String(
    source.rawText || source.raw_text || source.output_text || source.outputText || source.text || source.content ||
    nested.rawText || nested.raw_text || nested.output_text || nested.outputText || nested.text || nested.content ||
    data.rawText || data.raw_text || data.output_text || data.outputText || data.text || data.workerReport || ''
  );
}

function __st4W42NormalizeWorkerReport(report) {
  if (!report || typeof report !== 'object') {
    return report;
  }

  const fields = report.fields && typeof report.fields === 'object' ? report.fields : report;
  return Object.assign({}, report, {
    worker_id: fields.worker_id || report.worker_id || '',
    task_id: fields.task_id || report.task_id || '',
    worker_function_class: fields.worker_function_class || report.worker_function_class || '',
    class_contract_status: fields.class_contract_status || report.class_contract_status || '',
    priority_0_status: fields.priority_0_status || report.priority_0_status || '',
    next_needed: fields.next_needed || report.next_needed || '',
    rawReportText: report.rawReportText || report.raw || report.rawText || ''
  });
}

function __st4W42CollectWorkerReportAndErrorCandidates(rawText) {
  const text = __st4W42String(rawText);

  if (!text.trim()) {
    return {
      workerReports: [],
      workerReportCount: 0,
      errorCandidates: [],
      errorCandidateCount: 0,
      classContractStatus: '',
      collector_status: 'NO_WORKER_REPORT_TEXT'
    };
  }

  if (!__st4W42WorkerReportErrorExtractor ||
      typeof __st4W42WorkerReportErrorExtractor.extractWorkerReportsAndErrors !== 'function') {
    return {
      workerReports: [],
      workerReportCount: 0,
      errorCandidates: [],
      errorCandidateCount: 0,
      classContractStatus: '',
      collector_status: 'WORKER_REPORT_EXTRACTOR_NOT_BOUND'
    };
  }

  try {
    const extracted = __st4W42WorkerReportErrorExtractor.extractWorkerReportsAndErrors(text, { terminalRole: 'LAO' }) || {};
    const reports = Array.isArray(extracted.reports) ? extracted.reports.map(__st4W42NormalizeWorkerReport) : [];
    const errorCandidates = Array.isArray(extracted.errorCandidates) ? extracted.errorCandidates : [];
    const firstStatus = reports
      .map(function mapStatus(report) {
        return report.class_contract_status ||
          (report.fields && report.fields.class_contract_status) ||
          '';
      })
      .filter(Boolean)[0] || '';

    return {
      workerReports: reports,
      workerReportCount: reports.length,
      errorCandidates: errorCandidates,
      errorCandidateCount: errorCandidates.length,
      classContractStatus: firstStatus || 'UNKNOWN',
      collector_status: reports.length > 0 ? 'WORKER_REPORT_EXTRACTED' : 'COLLECTED_NO_WORKER_REPORT'
    };
  } catch (error) {
    return {
      workerReports: [],
      workerReportCount: 0,
      errorCandidates: [{
        source: 'WORKER_REPORT_EXTRACTOR',
        severity: 'YELLOW',
        code: 'WORKER_REPORT_EXTRACTOR_ERROR',
        message: error && error.message ? error.message : String(error)
      }],
      errorCandidateCount: 1,
      classContractStatus: 'UNKNOWN',
      collector_status: 'WORKER_REPORT_EXTRACTOR_ERROR'
    };
  }
}

function __st4W42EnhanceCollectWorkerOutputResponse(response, payload) {
  if (!response || typeof response !== 'object') {
    return response;
  }

  const rawText = __st4W42ReadRawText(payload, response);
  const extraction = __st4W42CollectWorkerReportAndErrorCandidates(rawText);
  const data = Object.assign({}, response.data || {});

  if (!Array.isArray(data.workerReports)) {
    data.workerReports = extraction.workerReports;
  }

  if (data.workerReportCount === undefined || data.workerReportCount === null) {
    data.workerReportCount = Array.isArray(data.workerReports) ? data.workerReports.length : extraction.workerReportCount;
  }

  if (!Array.isArray(data.errorCandidates)) {
    data.errorCandidates = extraction.errorCandidates;
  }

  if (data.errorCandidateCount === undefined || data.errorCandidateCount === null) {
    data.errorCandidateCount = Array.isArray(data.errorCandidates) ? data.errorCandidates.length : extraction.errorCandidateCount;
  }

  if (!data.classContractStatus) {
    data.classContractStatus = extraction.classContractStatus || 'UNKNOWN';
  }

  if (!data.collector_status) {
    data.collector_status = extraction.collector_status || 'COLLECTED';
  }

  if (!Object.prototype.hasOwnProperty.call(data, 'batch_record_id')) {
    data.batch_record_id = data.batch_record_id || data.batchRecordId || null;
  }

  return Object.assign({}, response, { data: data });
}
/* ST4_W42_COLLECTOR_EXTRACTOR_BINDING_END */



/**

Source Factory Stage 4 station IPC handler draft.
HOTFIX_02 scope:
Keep this file as a handler module only.
Do not call ipcMain.handle() here.
Keep the 11 contract IPC channel names in sf:stage4:<station>:<action> form.
Keep helper and prompt path specs as valid JavaScript strings.
*/

const H = '../../shared/stage4';
const P = '../../../prompts/stage4';

function spec(path, exportNames, station, purpose) {
return Object.freeze({
path,
exportNames: Array.isArray(exportNames) ? exportNames.slice() : [],
station,
purpose: purpose || ''
});
}

const STAGE4_STATION_IPC_CHANNELS = Object.freeze({
CLASSIFY_PANEL_INPUT: 'sf:stage4:classification:classify-panel-input',
VALIDATE_SOURCE_UNITS: 'sf:stage4:validation:validate-source-units',
COLLECT_WORKER_OUTPUT: 'sf:stage4:collection:collect-worker-output',
APPEND_STATION_RECORDS: 'sf:stage4:storage:append-station-records',
GENERATE_NEXT_INSTRUCTION: 'sf:stage4:instruction:generate-next-instruction',
DISPATCH_NEXT_PROMPT: 'sf:stage4:sender:dispatch-next-prompt',
RUN_EXECUTION_CHECK: 'sf:stage4:execution:run-check',
MANAGE_DOWNLOAD_RESOURCE: 'sf:stage4:download:manage-resource',
BUILD_ASSEMBLY_PLAN: 'sf:stage4:assembly:build-plan',
GENERATE_DONE_LIGHT_REPORT: 'sf:stage4:report:generate-done-light',
REFRESH_CONTROL_STATE: 'sf:stage4:control:refresh-state'
});

const STAGE4_STATION_NAMES = Object.freeze({
CLASSIFICATION: 'STATION_01_CLASSIFICATION',
VALIDATION: 'STATION_02_VALIDATION',
COLLECTION: 'STATION_03_COLLECTION',
STORAGE: 'STATION_04_STORAGE',
INSTRUCTION: 'STATION_05_INSTRUCTION',
SENDER: 'STATION_06_SENDER',
EXECUTION: 'STATION_07_EXECUTION',
DOWNLOAD: 'STATION_08_DOWNLOAD',
ASSEMBLY: 'STATION_09_ASSEMBLY',
REPORT: 'STATION_10_REPORT',
CONTROL: 'STATION_11_CONTROL'
});

const SOURCE_FILE_START_MARKER = '=== SOURCE_FILE_' + 'START ===';
const SOURCE_FILE_END_MARKER = '=== SOURCE_FILE_' + 'END ===';
const CONTENT_START_MARKER = '=== CONTENT_' + 'START ===';
const CONTENT_END_MARKER = '=== CONTENT_' + 'END ===';
const WORKER_REPORT_START_MARKER = 'WORKER_REPORT_' + 'START';
const WORKER_REPORT_END_MARKER = 'WORKER_REPORT_' + 'END';

const HELPERS = Object.freeze({
panelInputClassifier: spec(
H + '/panelInputClassifier.js',
['classifyPanelInput', 'classifyInput', 'classify'],
STAGE4_STATION_NAMES.CLASSIFICATION,
'Classify Taeo/Lao/Taera panel input.'
),
panelCommandParser: spec(
H + '/panelCommandParser.js',
['parsePanelCommand', 'parseCommand', 'parse'],
STAGE4_STATION_NAMES.CLASSIFICATION,
'Parse panel command text.'
),
sourceFileBlockExtractor: spec(
H + '/sourceFileBlockExtractor.js',
['extractSourceFileBlocks', 'extractBlocks', 'extract'],
STAGE4_STATION_NAMES.COLLECTION,
'Extract SOURCE_FILE blocks from Worker output.'
),
downloadResourceExtractor: spec(
H + '/downloadResourceExtractor.js',
['extractDownloadResources', 'extractResources', 'extract'],
STAGE4_STATION_NAMES.DOWNLOAD,
'Extract download resource candidates.'
),
workerReportErrorExtractor: spec(
H + '/workerReportErrorExtractor.js',
['extractWorkerReportAndErrors', 'extractWorkerReport', 'extractReport', 'extract'],
STAGE4_STATION_NAMES.COLLECTION,
'Extract WORKER_REPORT and error candidates.'
),
sourceFileFormatValidator: spec(
H + '/sourceFileFormatValidator.js',
['validateSourceFileFormat', 'validateSourceFile', 'validate'],
STAGE4_STATION_NAMES.VALIDATION,
'Validate SOURCE_FILE output contract.'
),
placeholderOmissionDetector: spec(
H + '/placeholderOmissionDetector.js',
['detectPlaceholderOmissions', 'detectOmissions', 'detect'],
STAGE4_STATION_NAMES.VALIDATION,
'Detect omitted or placeholder-only source content.'
),
windowsRegexEscapeChecker: spec(
H + '/windowsRegexEscapeChecker.js',
['checkWindowsRegexEscapes', 'checkEscapes', 'check'],
STAGE4_STATION_NAMES.VALIDATION,
'Check Windows path and regex escaping risk.'
),
efficiencyGateStatus: spec(
H + '/efficiencyGateStatus.js',
['calculateEfficiencyGateStatus', 'getGateStatus', 'status'],
STAGE4_STATION_NAMES.VALIDATION,
'Calculate GREEN/YELLOW/RED/BLACK gate status.'
),
duplicatePathConflictDetector: spec(
H + '/duplicatePathConflictDetector.js',
['detectDuplicatePathConflicts', 'detectConflicts', 'detect'],
STAGE4_STATION_NAMES.ASSEMBLY,
'Detect duplicate target path conflicts.'
),
workerFileOwnershipChecker: spec(
H + '/workerFileOwnershipChecker.js',
['checkWorkerFileOwnership', 'checkOwnership', 'check'],
STAGE4_STATION_NAMES.CONTROL,
'Check Worker ownership metadata.'
),
apiIpcBindingConsistencyChecker: spec(
H + '/apiIpcBindingConsistencyChecker.js',
['checkApiIpcBindingConsistency', 'checkBindingConsistency', 'check'],
STAGE4_STATION_NAMES.CONTROL,
'Check API/IPC/Button binding consistency.'
),
runtimePartialAssemblyClassifier: spec(
H + '/runtimePartialAssemblyClassifier.js',
['classifyRuntimePartialAssembly', 'classifyAssembly', 'classify'],
STAGE4_STATION_NAMES.ASSEMBLY,
'Classify runtime versus partial assembly targets.'
),
patchRequestConflictSorter: spec(
H + '/patchRequestConflictSorter.js',
['sortPatchRequestConflicts', 'sortPatchRequests', 'sort'],
STAGE4_STATION_NAMES.ASSEMBLY,
'Sort patch request application candidates.'
),
taeoRawOutputStore: spec(
H + '/stores/taeoRawOutputStore.js',
['appendTaeoRawOutput', 'appendRawOutput', 'append'],
STAGE4_STATION_NAMES.STORAGE,
'Store Taeo raw output.'
),
laoSourceUnitStore: spec(
H + '/stores/laoSourceUnitStore.js',
['appendLaoSourceUnit', 'appendSourceUnit', 'append'],
STAGE4_STATION_NAMES.STORAGE,
'Store Lao SOURCE_FILE units.'
),
taeraDownloadResourceStore: spec(
H + '/stores/taeraDownloadResourceStore.js',
['appendTaeraDownloadResource', 'appendDownloadResource', 'append'],
STAGE4_STATION_NAMES.STORAGE,
'Store Taera download resource candidates.'
),
workerOutputBatchStore: spec(
H + '/stores/workerOutputBatchStore.js',
['appendWorkerOutputBatch', 'storeWorkerOutputBatch', 'append'],
STAGE4_STATION_NAMES.STORAGE,
'Store Worker output batches.'
),
panelRecordExecutionStore: spec(
H + '/stores/panelRecordExecutionStore.js',
['appendPanelRecordExecution', 'appendRecord', 'append'],
STAGE4_STATION_NAMES.STORAGE,
'Store panel record and execution events.'
),
executionResultCollector: spec(
H + '/executionResultCollector.js',
['collectExecutionResult', 'collectResult', 'collect'],
STAGE4_STATION_NAMES.EXECUTION,
'Collect execution results.'
),
executionErrorReporter: spec(
H + '/executionErrorReporter.js',
['reportExecutionError', 'createExecutionErrorReport', 'report'],
STAGE4_STATION_NAMES.EXECUTION,
'Create execution error reports.'
),
promptQueueManager: spec(
H + '/promptQueueManager.js',
['enqueuePrompt', 'addPrompt', 'enqueue'],
STAGE4_STATION_NAMES.SENDER,
'Manage prompt queue items.'
),
sequentialPromptSender: spec(
H + '/sequentialPromptSender.js',
['dispatchNextPrompt', 'selectNextPrompt', 'next'],
STAGE4_STATION_NAMES.SENDER,
'Select and dispatch the next prompt.'
),
fileBatchDispatcher: spec(
H + '/fileBatchDispatcher.js',
['buildFileBatchDispatch', 'dispatchFileBatch', 'dispatch'],
STAGE4_STATION_NAMES.ASSEMBLY,
'Prepare file batch dispatch payloads.'
),
downloadResourceManager: spec(
H + '/downloadResourceManager.js',
['manageDownloadResource', 'queueDownloadResource', 'enqueueResource'],
STAGE4_STATION_NAMES.DOWNLOAD,
'Manage download resource queue.'
),
promptPackageVersionManager: spec(
H + '/promptPackageVersionManager.js',
['checkPromptPackageVersion', 'normalizePromptPackageVersion', 'check'],
STAGE4_STATION_NAMES.SENDER,
'Check prompt package versions.'
),
greenOutputAssemblyQueue: spec(
H + '/greenOutputAssemblyQueue.js',
['buildAssemblyPlan', 'enqueueGreenOutput', 'enqueue'],
STAGE4_STATION_NAMES.ASSEMBLY,
'Build or enqueue GREEN output assembly plan.'
),
redFixRequestGenerator: spec(
H + '/redFixRequestGenerator.js',
['generateNextInstruction', 'createRedFixRequest', 'generate'],
STAGE4_STATION_NAMES.INSTRUCTION,
'Generate next instruction or RED hotfix request.'
)
});

const PROMPTS = Object.freeze({
doneLightReportGenerator: spec(
P + '/DONE_LIGHT_REPORT_GENERATOR_PROMPT.txt',
[],
STAGE4_STATION_NAMES.REPORT,
'DONE_LIGHT report generator prompt.'
),
nextCommanderHandoffGenerator: spec(
P + '/NEXT_COMMANDER_HANDOFF_GENERATOR_PROMPT.txt',
[],
STAGE4_STATION_NAMES.INSTRUCTION,
'Next Commander handoff generator prompt.'
)
});

function isPlainObject(value) {
return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizePayload(payload) {
return isPlainObject(payload) ? payload : {};
}

function firstText(payload) {
return String(
payload.rawText ||
payload.text ||
payload.sourceText ||
payload.content ||
payload.workerOutput ||
payload.output ||
''
);
}

function firstArray(payload, keys) {
for (const key of keys) {
if (Array.isArray(payload[key])) {
return payload[key];
}
}
return [];
}

function ok(station, action, data) {
return {
ok: true,
station,
action,
data: isPlainObject(data) ? data : { value: data },
error: null
};
}

function fail(station, action, code, error, details) {
const message = error && error.message ? error.message : String(error || 'Stage 4 IPC handler failed.');
return {
ok: false,
station,
action,
data: {},
error: {
code: code || 'STAGE4_IPC_HANDLER_FAILED',
message,
details: isPlainObject(details) ? details : {}
}
};
}

function pickFunction(container, names) {
if (!container) {
return null;
}

if (typeof container === 'function') {
return container;
}

for (const name of names) {
if (typeof container[name] === 'function') {
return container[name].bind(container);
}
}

return null;
}


function escapeRegExp(value) {
return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchBetweenMarkers(text, startMarker, endMarker) {
const source = String(text || '');
const pattern = new RegExp(escapeRegExp(startMarker) + '[\\s\\S]*?' + escapeRegExp(endMarker), 'g');
return source.match(pattern) || [];
}

function resolveService(deps, directNames, helperKey) {
const services = normalizePayload(deps);

for (const name of directNames) {
if (typeof services[name] === 'function') {
return services[name];
}
}

const helperSpec = HELPERS[helperKey];
if (!helperSpec) {
return null;
}

return pickFunction(services[helperKey], helperSpec.exportNames);
}

async function invokeService(deps, directNames, helperKey, args, fallback) {
const fn = resolveService(deps, directNames, helperKey);
if (fn) {
return fn.apply(null, args);
}
return typeof fallback === 'function' ? fallback() : fallback;
}

async function handleStage4ClassifyPanelInput(event, payload, deps) {
const input = normalizePayload(payload);
const text = firstText(input);

try {
const data = await invokeService(
deps,
['classifyPanelInput', 'classifyInput'],
'panelInputClassifier',
[text, input, event],
function fallbackClassifyPanelInput() {
return {
input_kind: text.trim() ? 'TEXT_INPUT' : 'EMPTY_INPUT',
rawText: text,
source: input.source || 'ipc'
};
}
);
return ok(STAGE4_STATION_NAMES.CLASSIFICATION, 'classify_panel_input', data);
} catch (error) {
return fail(STAGE4_STATION_NAMES.CLASSIFICATION, 'classify_panel_input', 'CLASSIFY_PANEL_INPUT_FAILED', error, {
rawTextLength: text.length
});
}
}

async function handleStage4ValidateSourceUnits(event, payload, deps) {
const input = normalizePayload(payload);
const text = firstText(input);

try {
const formatResult = await invokeService(
deps,
['validateSourceUnits', 'validateSourceFileFormat', 'validateSourceFile'],
'sourceFileFormatValidator',
[text, input, event],
function fallbackValidateSourceUnits() {
const hasStart = text.includes(SOURCE_FILE_START_MARKER);
const hasContentStart = text.includes(CONTENT_START_MARKER);
const hasContentEnd = text.includes(CONTENT_END_MARKER);
const hasEnd = text.includes(SOURCE_FILE_END_MARKER);
return {
valid: hasStart && hasContentStart && hasContentEnd && hasEnd,
checks: { hasStart, hasContentStart, hasContentEnd, hasEnd }
};
}
);

const omissionResult = await invokeService(
  deps,
  ['detectPlaceholderOmissions', 'detectOmissions'],
  'placeholderOmissionDetector',
  [text, input, event],
  function fallbackDetectOmissions() {
    const lowered = text.toLowerCase();
    const risky = ['todo only', 'placeholder only', 'same as above', 'omitted', '나머지 동일'].some(function includesToken(token) {
      return lowered.includes(token);
    });
    return { risky };
  }
);

return ok(STAGE4_STATION_NAMES.VALIDATION, 'validate_source_units', {
  format: formatResult,
  omissions: omissionResult
});

} catch (error) {
return fail(STAGE4_STATION_NAMES.VALIDATION, 'validate_source_units', 'VALIDATE_SOURCE_UNITS_FAILED', error, {
rawTextLength: text.length
});
}
}

async function handleStage4CollectWorkerOutput__ST4W42_ORIGINAL(event, payload, deps) {
const input = normalizePayload(payload);
const text = firstText(input);

try {
const sourceFiles = await invokeService(
deps,
['extractSourceFileBlocks', 'extractBlocks'],
'sourceFileBlockExtractor',
[text, input, event],
function fallbackExtractSourceFiles() {
return matchBetweenMarkers(text, SOURCE_FILE_START_MARKER, SOURCE_FILE_END_MARKER);
}
);

const report = await invokeService(
  deps,
  ['extractWorkerReportAndErrors', 'extractWorkerReport', 'extractReport'],
  'workerReportErrorExtractor',
  [text, input, event],
  function fallbackExtractWorkerReport() {
    const match = matchBetweenMarkers(text, WORKER_REPORT_START_MARKER, WORKER_REPORT_END_MARKER)[0];
    return match || '';
  }
);

return ok(STAGE4_STATION_NAMES.COLLECTION, 'collect_worker_output', {
  rawTextLength: text.length,
  sourceFileCount: Array.isArray(sourceFiles) ? sourceFiles.length : 0,
  sourceFiles,
  workerReport: report
});

} catch (error) {
return fail(STAGE4_STATION_NAMES.COLLECTION, 'collect_worker_output', 'COLLECT_WORKER_OUTPUT_FAILED', error, {
rawTextLength: text.length
});
}
}

async function handleStage4CollectWorkerOutput__ST4W43_ORIGINAL(event, payload, deps) {
  const originalResponse = await handleStage4CollectWorkerOutput__ST4W42_ORIGINAL(event, payload, deps);
  return __st4W42EnhanceCollectWorkerOutputResponse(originalResponse, payload);
}

async function handleStage4CollectWorkerOutput__ST4W44_GATE_ORIGINAL(event, payload, deps) {
  const originalResponse = await handleStage4CollectWorkerOutput__ST4W43_ORIGINAL(event, payload, deps);
  return __st4W43EnhanceCollectorBatchResponse(originalResponse, payload);
}

async function handleStage4CollectWorkerOutput__ST4W45_VERSION_ORIGINAL(event, payload, deps) {
  const originalResponse = await handleStage4CollectWorkerOutput__ST4W44_GATE_ORIGINAL(event, payload, deps);
  return __st4W44EnhanceCollectWorkerOutputGateHandoff(originalResponse, payload);
}

async function handleStage4CollectWorkerOutput(event, payload, deps) {
  const originalResponse = await handleStage4CollectWorkerOutput__ST4W45_VERSION_ORIGINAL(event, payload, deps);
  return __st4W45EnhanceVersionBindingResponse(originalResponse, payload);
}





async function handleStage4AppendStationRecords__ST4W40_ORIGINAL(event, payload, deps) {
const input = normalizePayload(payload);

try {
const data = await invokeService(
deps,
['appendStationRecords', 'appendPanelRecordExecution', 'appendRecord'],
'panelRecordExecutionStore',
[input, event],
function fallbackAppendStationRecords() {
return {
appended: false,
reason: 'NO_STORAGE_SERVICE_BOUND',
recordType: input.recordType || input.type || ''
};
}
);
return ok(STAGE4_STATION_NAMES.STORAGE, 'append_station_records', data);
} catch (error) {
return fail(STAGE4_STATION_NAMES.STORAGE, 'append_station_records', 'APPEND_STATION_RECORDS_FAILED', error, {
recordType: input.recordType || input.type || null
});
}
}

async function handleStage4AppendStationRecords(event, payload, deps) {
  return __st4W40HandleAppendStationRecordsPhase2(event, payload, deps, handleStage4AppendStationRecords__ST4W40_ORIGINAL);
}


async function handleStage4GenerateNextInstruction(event, payload, deps) {
const input = normalizePayload(payload);

try {
const data = await invokeService(
deps,
['generateNextInstruction', 'createRedFixRequest', 'generateRedFixRequest'],
'redFixRequestGenerator',
[input, event],
function fallbackGenerateNextInstruction() {
return {
instruction_type: input.instruction_type || input.instructionType || 'STAGE4_NEXT_ACTION',
target: input.target || '',
message: input.message || input.reason || '',
next_needed: input.next_needed || input.nextNeeded || ''
};
}
);
return ok(STAGE4_STATION_NAMES.INSTRUCTION, 'generate_next_instruction', data);
} catch (error) {
return fail(STAGE4_STATION_NAMES.INSTRUCTION, 'generate_next_instruction', 'GENERATE_NEXT_INSTRUCTION_FAILED', error, {
target: input.target || null
});
}
}

async function handleStage4DispatchNextPrompt(event, payload, deps) {
const input = normalizePayload(payload);

try {
const versionResult = await invokeService(
deps,
['checkPromptPackageVersion', 'normalizePromptPackageVersion'],
'promptPackageVersionManager',
[input, event],
function fallbackPromptVersionCheck() {
return {
checked: false,
prompt_package_id: input.prompt_package_id || input.promptPackageId || '',
prompt_package_version: input.prompt_package_version || input.promptPackageVersion || ''
};
}
);

const dispatchResult = await invokeService(
  deps,
  ['dispatchNextPrompt', 'selectNextPrompt', 'enqueuePrompt'],
  'sequentialPromptSender',
  [input, event],
  function fallbackDispatchNextPrompt() {
    return {
      dispatched: false,
      reason: 'NO_SEQUENTIAL_SENDER_SERVICE_BOUND',
      prompt_package_id: input.prompt_package_id || input.promptPackageId || '',
      prompt_package_version: input.prompt_package_version || input.promptPackageVersion || ''
    };
  }
);

return ok(STAGE4_STATION_NAMES.SENDER, 'dispatch_next_prompt', {
  version: versionResult,
  dispatch: dispatchResult
});

} catch (error) {
return fail(STAGE4_STATION_NAMES.SENDER, 'dispatch_next_prompt', 'DISPATCH_NEXT_PROMPT_FAILED', error, {
prompt_package_id: input.prompt_package_id || input.promptPackageId || null
});
}
}

async function handleStage4RunCheck(event, payload, deps) {
const input = normalizePayload(payload);

try {
const data = await invokeService(
deps,
['runExecutionCheck', 'runStage4Execution', 'runNodeCheck'],
'executionResultCollector',
[input, event],
function fallbackRunCheck() {
return {
executed: false,
reason: 'NO_EXECUTION_SERVICE_BOUND',
command: input.command || '',
args: firstArray(input, ['args', 'arguments'])
};
}
);
return ok(STAGE4_STATION_NAMES.EXECUTION, 'run_execution_check', data);
} catch (error) {
return fail(STAGE4_STATION_NAMES.EXECUTION, 'run_execution_check', 'RUN_EXECUTION_CHECK_FAILED', error, {
command: input.command || null
});
}
}

async function handleStage4ManageResource(event, payload, deps) {
const input = normalizePayload(payload);
const text = firstText(input);

try {
const data = await invokeService(
deps,
['manageDownloadResource', 'queueDownloadResource', 'enqueueResource'],
'downloadResourceManager',
[input, event],
function fallbackManageResource() {
const resources = text.match(/(?:sandbox:\/mnt\/data\/[^\s)]+|https?:\/\/[^\s)]+)/g) || [];
return {
managed: false,
reason: 'NO_DOWNLOAD_RESOURCE_SERVICE_BOUND',
resourceCount: resources.length,
resources
};
}
);
return ok(STAGE4_STATION_NAMES.DOWNLOAD, 'manage_download_resource', data);
} catch (error) {
return fail(STAGE4_STATION_NAMES.DOWNLOAD, 'manage_download_resource', 'MANAGE_DOWNLOAD_RESOURCE_FAILED', error, {
rawTextLength: text.length
});
}
}

async function handleStage4BuildPlan(event, payload, deps) {
const input = normalizePayload(payload);

try {
const duplicateResult = await invokeService(
deps,
['detectDuplicatePathConflicts', 'detectConflicts'],
'duplicatePathConflictDetector',
[input, event],
function fallbackDuplicateCheck() {
const files = firstArray(input, ['files', 'sourceFiles', 'candidates']);
const paths = files.map(function getPath(file) {
return isPlainObject(file) ? file.path : '';
}).filter(Boolean);
const duplicates = paths.filter(function isDuplicate(path, index) {
return paths.indexOf(path) !== index;
});
return { duplicatePaths: Array.from(new Set(duplicates)) };
}
);

const assemblyPlan = await invokeService(
  deps,
  ['buildAssemblyPlan', 'enqueueGreenOutput', 'enqueueGreenOutputAssembly'],
  'greenOutputAssemblyQueue',
  [input, event],
  function fallbackBuildPlan() {
    return {
      planned: false,
      reason: 'NO_ASSEMBLY_SERVICE_BOUND',
      candidates: firstArray(input, ['candidates', 'sourceFiles', 'files'])
    };
  }
);

return ok(STAGE4_STATION_NAMES.ASSEMBLY, 'build_assembly_plan', {
  duplicateCheck: duplicateResult,
  assemblyPlan
});

} catch (error) {
return fail(STAGE4_STATION_NAMES.ASSEMBLY, 'build_assembly_plan', 'BUILD_ASSEMBLY_PLAN_FAILED', error, {
candidateCount: firstArray(input, ['candidates', 'sourceFiles', 'files']).length
});
}
}

async function handleStage4GenerateDoneLight(event, payload, deps) {
const input = normalizePayload(payload);

try {
const data = await invokeService(
deps,
['generateDoneLightReport', 'generateStage4Report'],
'efficiencyGateStatus',
[input, event],
function fallbackGenerateDoneLight() {
return {
report_type: 'DONE_LIGHT',
result: input.result || '',
files_changed: input.files_changed || input.filesChanged || [],
run_or_use: input.run_or_use || input.runOrUse || '',
gate_status: input.gate_status || input.gateStatus || '',
next_action: input.next_action || input.nextAction || ''
};
}
);
return ok(STAGE4_STATION_NAMES.REPORT, 'generate_done_light_report', data);
} catch (error) {
return fail(STAGE4_STATION_NAMES.REPORT, 'generate_done_light_report', 'GENERATE_DONE_LIGHT_REPORT_FAILED', error, {
gate_status: input.gate_status || input.gateStatus || null
});
}
}

async function handleStage4RefreshState(event, payload, deps) {
const input = normalizePayload(payload);

try {
const ownershipResult = await invokeService(
deps,
['checkWorkerFileOwnership', 'checkOwnership'],
'workerFileOwnershipChecker',
[input, event],
function fallbackOwnershipCheck() {
return {
checked: false,
reason: 'NO_OWNERSHIP_SERVICE_BOUND'
};
}
);

const bindingResult = await invokeService(
  deps,
  ['checkApiIpcBindingConsistency', 'checkBindingConsistency'],
  'apiIpcBindingConsistencyChecker',
  [input, event],
  function fallbackBindingCheck() {
    return {
      checked: false,
      reason: 'NO_BINDING_CHECKER_SERVICE_BOUND'
    };
  }
);

return ok(STAGE4_STATION_NAMES.CONTROL, 'refresh_control_state', {
  refreshed: true,
  ownership: ownershipResult,
  binding: bindingResult
});

} catch (error) {
return fail(STAGE4_STATION_NAMES.CONTROL, 'refresh_control_state', 'REFRESH_CONTROL_STATE_FAILED', error, {
action: input.action || input.event_name || input.eventName || null
});
}
}

function createStage4StationBindingHandlers(deps) {
const services = normalizePayload(deps);

return Object.freeze({
[STAGE4_STATION_IPC_CHANNELS.CLASSIFY_PANEL_INPUT]: function classifyPanelInput(event, payload) {
return handleStage4ClassifyPanelInput(event, payload, services);
},
[STAGE4_STATION_IPC_CHANNELS.VALIDATE_SOURCE_UNITS]: function validateSourceUnits(event, payload) {
return handleStage4ValidateSourceUnits(event, payload, services);
},
[STAGE4_STATION_IPC_CHANNELS.COLLECT_WORKER_OUTPUT]: function collectWorkerOutput(event, payload) {
return handleStage4CollectWorkerOutput(event, payload, services);
},
[STAGE4_STATION_IPC_CHANNELS.APPEND_STATION_RECORDS]: function appendStationRecords(event, payload) {
return handleStage4AppendStationRecords(event, payload, services);
},
[STAGE4_STATION_IPC_CHANNELS.GENERATE_NEXT_INSTRUCTION]: function generateNextInstruction(event, payload) {
return handleStage4GenerateNextInstruction(event, payload, services);
},
[STAGE4_STATION_IPC_CHANNELS.DISPATCH_NEXT_PROMPT]: function dispatchNextPrompt(event, payload) {
return handleStage4DispatchNextPrompt(event, payload, services);
},
[STAGE4_STATION_IPC_CHANNELS.RUN_EXECUTION_CHECK]: function runExecutionCheck(event, payload) {
return handleStage4RunCheck(event, payload, services);
},
[STAGE4_STATION_IPC_CHANNELS.MANAGE_DOWNLOAD_RESOURCE]: function manageDownloadResource(event, payload) {
return handleStage4ManageResource(event, payload, services);
},
[STAGE4_STATION_IPC_CHANNELS.BUILD_ASSEMBLY_PLAN]: function buildAssemblyPlan(event, payload) {
return handleStage4BuildPlan(event, payload, services);
},
[STAGE4_STATION_IPC_CHANNELS.GENERATE_DONE_LIGHT_REPORT]: function generateDoneLightReport(event, payload) {
return handleStage4GenerateDoneLight(event, payload, services);
},
[STAGE4_STATION_IPC_CHANNELS.REFRESH_CONTROL_STATE]: function refreshControlState(event, payload) {
return handleStage4RefreshState(event, payload, services);
}
});
}

module.exports = {
H,
P,
HELPERS,
PROMPTS,
STAGE4_STATION_IPC_CHANNELS,
STAGE4_STATION_NAMES,
createStage4StationBindingHandlers,
handleStage4ClassifyPanelInput,
handleStage4ValidateSourceUnits,
handleStage4CollectWorkerOutput,
handleStage4AppendStationRecords,
handleStage4GenerateNextInstruction,
handleStage4DispatchNextPrompt,
handleStage4RunCheck,
handleStage4ManageResource,
handleStage4BuildPlan,
handleStage4GenerateDoneLight,
handleStage4RefreshState,
handleClassifyPanelInput: handleStage4ClassifyPanelInput,
handleValidateSourceUnits: handleStage4ValidateSourceUnits,
handleCollectWorkerOutput: handleStage4CollectWorkerOutput,
handleAppendStationRecords: handleStage4AppendStationRecords,
handleGenerateNextInstruction: handleStage4GenerateNextInstruction,
handleDispatchNextPrompt: handleStage4DispatchNextPrompt,
handleRunExecutionCheck: handleStage4RunCheck,
handleManageDownloadResource: handleStage4ManageResource,
handleBuildAssemblyPlan: handleStage4BuildPlan,
handleGenerateDoneLightReport: handleStage4GenerateDoneLight,
handleRefreshControlState: handleStage4RefreshState
};

/* W57_GETTER_MISSING_IPC_BRIDGE_V57_1_2_START */
const __W57_PROJECT_PANEL_IDENTITY_CHANNEL_V57_1_2 = 'sf:stage4-get-project-panel-identity';

function __w57ProjectPanelIdentityIsObject(value) {
  return value !== null && typeof value === 'object';
}

function __w57ProjectPanelIdentityGet(obj, names) {
  if (!__w57ProjectPanelIdentityIsObject(obj)) return undefined;
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    try {
      if (Object.prototype.hasOwnProperty.call(obj, name)) return obj[name];
    } catch (_error) {
      // keep lookup read-only and non-throwing
    }
  }
  return undefined;
}

function __w57ProjectPanelIdentityText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function __w57ProjectPanelIdentityClone(value, depth, seen) {
  if (value === null || value === undefined) return value;
  const valueType = typeof value;
  if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') return value;
  if (valueType === 'bigint') return String(value);
  if (!__w57ProjectPanelIdentityIsObject(value)) return null;
  if (!seen) seen = new WeakSet();
  if (seen.has(value)) return null;
  seen.add(value);
  if (depth > 3) return null;
  if (Array.isArray(value)) {
    return value.slice(0, 30).map((item) => __w57ProjectPanelIdentityClone(item, depth + 1, seen));
  }
  const out = {};
  let keys;
  try {
    keys = Object.keys(value).slice(0, 80);
  } catch (_error) {
    return null;
  }
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (/password|token|secret|cookie|auth/i.test(key)) continue;
    try {
      const cloned = __w57ProjectPanelIdentityClone(value[key], depth + 1, seen);
      if (cloned !== undefined && cloned !== null) out[key] = cloned;
    } catch (_error) {
      // skip inaccessible getter/property
    }
  }
  return out;
}

function __w57ProjectPanelIdentityObject(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed[0] !== '{') return null;
    try {
      const parsed = JSON.parse(trimmed);
      return __w57ProjectPanelIdentityIsObject(parsed) ? parsed : null;
    } catch (_error) {
      return null;
    }
  }
  if (__w57ProjectPanelIdentityIsObject(value)) {
    const cloned = __w57ProjectPanelIdentityClone(value, 0, new WeakSet());
    return __w57ProjectPanelIdentityIsObject(cloned) ? cloned : null;
  }
  return null;
}

function __w57ProjectPanelIdentitySignalScore(obj) {
  if (!__w57ProjectPanelIdentityIsObject(obj)) return 0;
  const keys = [
    'project_id', 'projectId', 'projectID',
    'project_name', 'projectName',
    'panel_id', 'panelId', 'panelID',
    'panel_instance_id', 'panelInstanceId', 'panelInstanceID',
    'project_panel_identity', 'projectPanelIdentity', 'panelIdentity'
  ];
  let score = 0;
  for (let index = 0; index < keys.length; index += 1) {
    try {
      if (Object.prototype.hasOwnProperty.call(obj, keys[index])) score += 1;
    } catch (_error) {
      // ignore
    }
  }
  return score;
}

function __w57ProjectPanelIdentityScan(rootValue, rootSource) {
  if (!__w57ProjectPanelIdentityIsObject(rootValue)) return null;
  const queue = [{ value: rootValue, source: rootSource, depth: 0 }];
  const seen = new WeakSet();
  let visited = 0;
  while (queue.length && visited < 180) {
    const item = queue.shift();
    visited += 1;
    if (!__w57ProjectPanelIdentityIsObject(item.value)) continue;
    if (seen.has(item.value)) continue;
    seen.add(item.value);
    if (__w57ProjectPanelIdentitySignalScore(item.value) > 0) {
      return { value: item.value, source: item.source };
    }
    if (item.depth >= 4) continue;
    let keys;
    try {
      keys = Object.keys(item.value).slice(0, 70);
    } catch (_error) {
      continue;
    }
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (/password|token|secret|cookie|auth/i.test(key)) continue;
      try {
        const child = item.value[key];
        if (__w57ProjectPanelIdentityIsObject(child)) {
          queue.push({ value: child, source: item.source + '.' + key, depth: item.depth + 1 });
        }
      } catch (_error) {
        // skip
      }
    }
  }
  return null;
}

function __w57ProjectPanelIdentityNormalize(candidate, source) {
  const identityRaw = __w57ProjectPanelIdentityGet(candidate, [
    'project_panel_identity', 'projectPanelIdentity', 'panelIdentity'
  ]);
  const identityObj = __w57ProjectPanelIdentityObject(identityRaw);
  const projectId = __w57ProjectPanelIdentityText(
    __w57ProjectPanelIdentityGet(candidate, ['project_id', 'projectId', 'projectID']) ||
    (identityObj ? __w57ProjectPanelIdentityGet(identityObj, ['project_id', 'projectId', 'projectID']) : undefined)
  );
  const projectName = __w57ProjectPanelIdentityText(
    __w57ProjectPanelIdentityGet(candidate, ['project_name', 'projectName']) ||
    (identityObj ? __w57ProjectPanelIdentityGet(identityObj, ['project_name', 'projectName']) : undefined)
  );
  const panelId = __w57ProjectPanelIdentityText(
    __w57ProjectPanelIdentityGet(candidate, ['panel_id', 'panelId', 'panelID']) ||
    (identityObj ? __w57ProjectPanelIdentityGet(identityObj, ['panel_id', 'panelId', 'panelID']) : undefined)
  );
  const panelInstanceId = __w57ProjectPanelIdentityText(
    __w57ProjectPanelIdentityGet(candidate, ['panel_instance_id', 'panelInstanceId', 'panelInstanceID']) ||
    (identityObj ? __w57ProjectPanelIdentityGet(identityObj, ['panel_instance_id', 'panelInstanceId', 'panelInstanceID']) : undefined)
  );
  let projectPanelIdentity = identityObj;
  if (!projectPanelIdentity && (projectId || projectName || panelId || panelInstanceId)) {
    projectPanelIdentity = {};
    if (projectId) projectPanelIdentity.project_id = projectId;
    if (projectName) projectPanelIdentity.project_name = projectName;
    if (panelId) projectPanelIdentity.panel_id = panelId;
    if (panelInstanceId) projectPanelIdentity.panel_instance_id = panelInstanceId;
  }
  const warnings = [];
  if (!projectId) warnings.push('project_id not found in selected source.');
  if (!projectName) warnings.push('project_name not found in selected source.');
  if (!panelId) warnings.push('panel_id not found in selected source.');
  if (!panelInstanceId) warnings.push('panel_instance_id not found in selected source.');
  if (!projectPanelIdentity) warnings.push('project_panel_identity object not found in selected source.');
  const hasAnyValue = Boolean(projectId || projectName || panelId || panelInstanceId || (projectPanelIdentity && Object.keys(projectPanelIdentity).length > 0));
  return {
    ok: hasAnyValue,
    project_id: projectId,
    project_name: projectName,
    panel_id: panelId,
    panel_instance_id: panelInstanceId,
    project_panel_identity: projectPanelIdentity || null,
    source: source || 'unknown',
    warnings
  };
}

function __w57ProjectPanelIdentityBuildResponse() {
  try {
    const roots = [
      { source: 'globalThis.__SF_STAGE4_PROJECT_PANEL_IDENTITY__', value: typeof globalThis !== 'undefined' ? globalThis.__SF_STAGE4_PROJECT_PANEL_IDENTITY__ : undefined },
      { source: 'globalThis.__SF_PROJECT_PANEL_IDENTITY__', value: typeof globalThis !== 'undefined' ? globalThis.__SF_PROJECT_PANEL_IDENTITY__ : undefined },
      { source: 'globalThis.SF_PROJECT_PANEL_IDENTITY', value: typeof globalThis !== 'undefined' ? globalThis.SF_PROJECT_PANEL_IDENTITY : undefined },
      { source: 'globalThis.__SF_STAGE4_STATE__', value: typeof globalThis !== 'undefined' ? globalThis.__SF_STAGE4_STATE__ : undefined },
      { source: 'globalThis.__SF_STAGE4_STATUS__', value: typeof globalThis !== 'undefined' ? globalThis.__SF_STAGE4_STATUS__ : undefined },
      { source: 'globalThis.__SF_STAGE4_RUNTIME_STATE__', value: typeof globalThis !== 'undefined' ? globalThis.__SF_STAGE4_RUNTIME_STATE__ : undefined },
      { source: 'globalThis.__SF_STAGE4_CONTROL_STATE__', value: typeof globalThis !== 'undefined' ? globalThis.__SF_STAGE4_CONTROL_STATE__ : undefined },
      { source: 'globalThis.__SF_STAGE4_LAST_CONTROL_STATE__', value: typeof globalThis !== 'undefined' ? globalThis.__SF_STAGE4_LAST_CONTROL_STATE__ : undefined },
      { source: 'globalThis.__SF_STAGE4_LAST_GATE_RESULT__', value: typeof globalThis !== 'undefined' ? globalThis.__SF_STAGE4_LAST_GATE_RESULT__ : undefined },
      { source: 'globalThis.__SF_STAGE4_SELECTED_PROMPT__', value: typeof globalThis !== 'undefined' ? globalThis.__SF_STAGE4_SELECTED_PROMPT__ : undefined },
      { source: 'globalThis.__SF_SELECTED_PROMPT__', value: typeof globalThis !== 'undefined' ? globalThis.__SF_SELECTED_PROMPT__ : undefined },
      { source: 'globalThis.sfStage4State', value: typeof globalThis !== 'undefined' ? globalThis.sfStage4State : undefined },
      { source: 'globalThis.stage4State', value: typeof globalThis !== 'undefined' ? globalThis.stage4State : undefined },
      { source: 'globalThis.safePanelState', value: typeof globalThis !== 'undefined' ? globalThis.safePanelState : undefined }
    ];
    for (let index = 0; index < roots.length; index += 1) {
      const root = roots[index];
      if (root.value === undefined || root.value === null) continue;
      const found = __w57ProjectPanelIdentityScan(root.value, root.source);
      if (found) return __w57ProjectPanelIdentityNormalize(found.value, found.source);
    }
    return {
      ok: false,
      project_id: null,
      project_name: null,
      panel_id: null,
      panel_instance_id: null,
      project_panel_identity: null,
      source: 'not_found',
      warnings: [
        'No Project Panel identity value source was found in current main-process candidates.',
        'No fake or hardcoded Project Panel value was generated.'
      ]
    };
  } catch (error) {
    return {
      ok: false,
      project_id: null,
      project_name: null,
      panel_id: null,
      panel_instance_id: null,
      project_panel_identity: null,
      source: 'error',
      warnings: ['Project Panel identity lookup failed.'],
      error: String(error && error.message ? error.message : error)
    };
  }
}

(function __w57ProjectPanelIdentityAutoRegister() {
  try {
    const electron = require('electron');
    const ipcMain = electron && electron.ipcMain;
    if (!ipcMain || typeof ipcMain.handle !== 'function') return;
    if (typeof ipcMain.removeHandler === 'function') {
      try {
        ipcMain.removeHandler(__W57_PROJECT_PANEL_IDENTITY_CHANNEL_V57_1_2);
      } catch (_removeError) {
        // keep registration idempotent
      }
    }
    ipcMain.handle(__W57_PROJECT_PANEL_IDENTITY_CHANNEL_V57_1_2, async function w57GetProjectPanelIdentityHandler() {
      return __w57ProjectPanelIdentityBuildResponse();
    });
  } catch (error) {
    try {
      if (console && typeof console.warn === 'function') {
        console.warn('[W57] Project Panel Identity IPC bridge registration skipped:', error && error.message ? error.message : String(error));
      }
    } catch (_consoleError) {
      // no-op
    }
  }
}());
/* W57_GETTER_MISSING_IPC_BRIDGE_V57_1_2_END */

/* W58_GETTER_RESOLVER_STRENGTHEN_V58_1_2_START */
(function registerW58ProjectPanelIdentityResolverV5812() {
  'use strict';
// W60_R13F_H_LIFECYCLE_REGISTRY_START
  const __w60R13fProjectPanelLifecycleRegistry = global.__w60R13fProjectPanelLifecycleRegistry || (global.__w60R13fProjectPanelLifecycleRegistry = new Map());
  const __w60R13fLifecycleCrypto = require('crypto');

  function __w60R13fStringOrNull(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, 256) : null;
  }

  function __w60R13fRuntimeKeyFromEvent(event) {
    const senderId = event && event.sender && typeof event.sender.id !== 'undefined' ? String(event.sender.id) : null;
    return senderId ? 'webContents:' + senderId : null;
  }

  function __w60R13fCreatePanelInstanceId(runtimeKey) {
    const entropy = typeof __w60R13fLifecycleCrypto.randomUUID === 'function'
      ? __w60R13fLifecycleCrypto.randomUUID()
      : String(Date.now()) + ':' + Math.random().toString(36).slice(2);
    return ['project_panel_instance', runtimeKey, entropy].join(':');
  }

  function __w60R13fNormalizeLifecyclePayload(payload) {
    if (!payload || typeof payload !== 'object') return null;
    if (payload.__w60_r13f_project_panel_lifecycle !== true) return null;
    const lifecycle = payload.lifecycle_event && typeof payload.lifecycle_event === 'object' ? payload.lifecycle_event : null;
    if (!lifecycle) return null;
    return {
      event_type: __w60R13fStringOrNull(lifecycle.event_type),
      panel_id: __w60R13fStringOrNull(lifecycle.panel_id),
      project_id: __w60R13fStringOrNull(lifecycle.project_id),
      project_name: __w60R13fStringOrNull(lifecycle.project_name),
      occurred_at: __w60R13fStringOrNull(lifecycle.occurred_at)
    };
  }

  function __w60R13fIdentityResponse(entry) {
    const missingFields = [];
    if (!entry.project_id) missingFields.push('project_id');
    if (!entry.project_name) missingFields.push('project_name');
    const identity = {
      panel_instance_id: entry.panel_instance_id,
      panel_id: entry.panel_id || null,
      project_id: entry.project_id || null,
      project_name: entry.project_name || null,
      lifecycle_event_type: entry.event_type || null,
      source: 'runtime_event_registry',
      source_status: missingFields.length ? 'source_partial' : 'source_found',
      missing_fields: missingFields,
      updated_at: entry.updated_at
    };
    return {
      ok: true,
      source_found: true,
      source: 'runtime_event_registry',
      source_status: identity.source_status,
      project_panel_identity: identity,
      projectPanelIdentity: identity,
      panel_instance_id: identity.panel_instance_id,
      panel_id: identity.panel_id,
      project_id: identity.project_id,
      project_name: identity.project_name,
      missing_fields: missingFields,
      checked_paths: [
        'main_process:global.__w60R13fProjectPanelLifecycleRegistry',
        'ipc_event_sender:webContents.id',
        'existing_checked_paths:preserved_in_not_found_branch'
      ]
    };
  }

  function __w60R13fApplyLifecyclePayload(event, payload) {
    const runtimeKey = __w60R13fRuntimeKeyFromEvent(event);
    const lifecycle = __w60R13fNormalizeLifecyclePayload(payload);
    if (!runtimeKey || !lifecycle) return null;
    const previous = __w60R13fProjectPanelLifecycleRegistry.get(runtimeKey) || {};
    const entry = {
      runtime_key: runtimeKey,
      panel_instance_id: previous.panel_instance_id || __w60R13fCreatePanelInstanceId(runtimeKey),
      panel_id: lifecycle.panel_id || previous.panel_id || null,
      project_id: lifecycle.project_id || previous.project_id || null,
      project_name: lifecycle.project_name || previous.project_name || null,
      event_type: lifecycle.event_type || previous.event_type || null,
      updated_at: new Date().toISOString()
    };
    __w60R13fProjectPanelLifecycleRegistry.set(runtimeKey, entry);
    return __w60R13fIdentityResponse(entry);
  }

  function __w60R13fReadLifecycleRegistry(event) {
    const runtimeKey = __w60R13fRuntimeKeyFromEvent(event);
    if (!runtimeKey || !__w60R13fProjectPanelLifecycleRegistry.has(runtimeKey)) return null;
    return __w60R13fIdentityResponse(__w60R13fProjectPanelLifecycleRegistry.get(runtimeKey));
  }
// W60_R13F_H_LIFECYCLE_REGISTRY_END


  const CHANNEL = 'sf:stage4-get-project-panel-identity';
  const CONFIRMED_SOURCE_PATHS = [
  "src/shared/stage4/projectPanelIdentityHelper.js",
  "src/shared/stage4/sequentialPromptSender.js",
  "src/shared/stage4/stores/taeoRawOutputStore.js",
  "src/shared/stage4/stores/workerOutputBatchStore.js",
  "src/shared/stage4/collectorCommanderGateHandoffAdapter.js",
  "src/shared/stage4/stores/panelRecordExecutionStore.js"
];
  const RECORD_FILE_CANDIDATES = [
  "_STAGE4_LOGS/stage4_station_records/panel_records.jsonl",
  "_STAGE4_LOGS/stage4_station_records/taeo_raw_outputs.jsonl",
  "_STAGE4_LOGS/stage4_station_records/worker_output_batches.jsonl"
];
  const FORBIDDEN_VALUE_SOURCE_RE = /expected|template|probe_result|safe_null_response|response_shape|smoke_project|legacy_project|default_project|hardcoded|fake/i;

  function safeString(value) {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    if (!text || text === '-' || text === '{}' || text === '[]' || text === 'string|null' || text === 'object|null' || text === 'boolean') return null;
    return text;
  }

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function cloneSafe(value, depth, seen) {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    if (!isObject(value) && !Array.isArray(value)) return null;
    if (!seen) seen = new WeakSet();
    if (seen.has(value)) return null;
    seen.add(value);
    if (depth >= 4) return null;
    if (Array.isArray(value)) return value.slice(0, 30).map((item) => cloneSafe(item, depth + 1, seen)).filter((item) => item !== undefined);
    const out = {};
    Object.keys(value).slice(0, 100).forEach((key) => {
      if (/password|token|secret|cookie|auth/i.test(key)) return;
      try {
        const cloned = cloneSafe(value[key], depth + 1, seen);
        if (cloned !== null && cloned !== undefined) out[key] = cloned;
      } catch (_) {}
    });
    return out;
  }

  function own(value, key) {
    return isObject(value) && Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined;
  }

  function firstPresent(sources, keys) {
    for (const source of sources) {
      if (!isObject(source)) continue;
      for (const key of keys) {
        const value = own(source, key);
        const text = safeString(value);
        if (text !== null) return value;
      }
    }
    return undefined;
  }

  function sourceIsForbidden(label) {
    return FORBIDDEN_VALUE_SOURCE_RE.test(String(label || ''));
  }

  function normalizeCandidate(candidate, source, checkedPaths, warnings) {
    if (!isObject(candidate)) return null;
    if (sourceIsForbidden(source)) {
      checkedPaths.push('skip_forbidden_value_source:' + source);
      return null;
    }

    const nested = firstPresent([candidate], [
      'project_panel_identity', 'projectPanelIdentity', 'panelIdentity', 'identity', 'currentProjectPanelIdentity'
    ]);
    const identityObject = isObject(nested) ? cloneSafe(nested, 0, new WeakSet()) || {} : {};

    const sources = [
      candidate,
      identityObject,
      isObject(candidate.metadata) ? candidate.metadata : null,
      isObject(candidate.stage4) ? candidate.stage4 : null,
      isObject(candidate.snapshot) ? candidate.snapshot : null,
      isObject(candidate.state) ? candidate.state : null,
      isObject(candidate.current) ? candidate.current : null,
      isObject(candidate.project) ? candidate.project : null,
      isObject(candidate.panel) ? candidate.panel : null
    ];

    const projectId = firstPresent(sources, ['project_id', 'projectId', 'projectID', 'current_project_id']);
    const projectName = firstPresent(sources, ['project_name', 'projectName', 'current_project_name']);
    const panelId = firstPresent(sources, ['panel_id', 'panelId', 'panelID', 'current_panel_id']);
    const panelInstanceId = firstPresent(sources, ['panel_instance_id', 'panelInstanceId', 'panelInstanceID', 'panel_instance', 'instance_id', 'instanceId']);

    const projectIdText = safeString(projectId);
    const projectNameText = safeString(projectName);
    const panelIdText = safeString(panelId);
    const panelInstanceIdText = safeString(panelInstanceId);

    if (projectIdText !== null && identityObject.project_id === undefined) identityObject.project_id = projectIdText;
    if (projectNameText !== null && identityObject.project_name === undefined) identityObject.project_name = projectNameText;
    if (panelIdText !== null && identityObject.panel_id === undefined) identityObject.panel_id = panelIdText;
    if (panelInstanceIdText !== null && identityObject.panel_instance_id === undefined) identityObject.panel_instance_id = panelInstanceIdText;

    const identityKeys = Object.keys(identityObject).filter((key) => !/version|required|field|metadata|legacy/i.test(key));
    const hasAny = Boolean(projectIdText || projectNameText || panelIdText || panelInstanceIdText || identityKeys.length > 0);
    if (!hasAny) return null;

    const missing = [];
    if (!projectIdText) missing.push('project_id');
    if (!projectNameText) missing.push('project_name');
    if (!panelIdText) missing.push('panel_id');
    if (!panelInstanceIdText) missing.push('panel_instance_id');
    if (missing.length) warnings.push('partial Project Panel Identity source found; missing: ' + missing.join(', '));

    return {
      ok: true,
      project_id: projectIdText,
      project_name: projectNameText,
      panel_id: panelIdText,
      panel_instance_id: panelInstanceIdText,
      project_panel_identity: identityKeys.length ? identityObject : null,
      source,
      warnings: warnings.slice(0, 120),
      checked_paths: checkedPaths.slice(0, 240)
    };
  }

  function scanGraph(root, source, checkedPaths, warnings) {
    const queue = [{ value: root, path: source, depth: 0 }];
    const seen = new WeakSet();
    let visited = 0;
    while (queue.length && visited < 2000) {
      const item = queue.shift();
      visited += 1;
      if (!isObject(item.value) && !Array.isArray(item.value)) continue;
      if (seen.has(item.value)) continue;
      seen.add(item.value);
      const normalized = normalizeCandidate(item.value, item.path, checkedPaths, warnings);
      if (normalized) return normalized;
      if (item.depth >= 6) continue;
      let keys;
      try { keys = Object.keys(item.value).slice(0, 150); } catch (_) { keys = []; }
      for (const key of keys) {
        if (/password|token|secret|cookie|auth/i.test(key)) continue;
        let child;
        try { child = item.value[key]; } catch (_) { continue; }
        if (isObject(child) || Array.isArray(child)) queue.push({ value: child, path: item.path + '.' + key, depth: item.depth + 1 });
      }
    }
    checkedPaths.push('scan_complete_no_identity:' + source + ':visited=' + visited);
    return null;
  }

  function safeRequire(absPath, label, checkedPaths, warnings) {
    checkedPaths.push('require:' + label);
    try {
      const resolved = require.resolve(absPath);
      delete require.cache[resolved];
      return require(absPath);
    } catch (e) {
      warnings.push('require failed for ' + label + ': ' + (e && e.message ? e.message : String(e)));
      return null;
    }
  }

  function callSafeGetters(mod, label, checkedPaths, warnings) {
    const values = [{ value: mod, source: label + '#module_exports' }];
    if (!isObject(mod) && typeof mod !== 'function') return values;
    const keys = typeof mod === 'function' ? [] : Object.keys(mod).slice(0, 200);
    for (const key of keys) {
      if (!/^(get|read|peek|find|select|resolve|current|latest|list)/i.test(key)) continue;
      if (!/(project|panel|identity|snapshot|state|record|metadata|latest|current)/i.test(key)) continue;
      if (/set|save|write|delete|remove|clear|reset|update|patch|apply|install|create|init|start|stop|send|dispatch|materialize|run|execute|migrate|archive|login|logout|register|auth|cookie|token|secret/i.test(key)) continue;
      const fn = mod[key];
      if (typeof fn !== 'function' || fn.length !== 0) continue;
      checkedPaths.push('safe_getter:' + label + '#' + key + '()');
      try {
        const value = fn();
        if (value && typeof value.then === 'function') warnings.push('safe getter returned Promise and was not awaited: ' + label + '#' + key);
        else values.push({ value, source: label + '#' + key + '()' });
      } catch (e) {
        warnings.push('safe getter failed ' + label + '#' + key + ': ' + (e && e.message ? e.message : String(e)));
      }
    }
    return values;
  }

  function readJsonlRecordCandidates(root, checkedPaths, warnings) {
    const fs = require('fs');
    const path = require('path');
    const out = [];
    for (const rel of RECORD_FILE_CANDIDATES) {
      const abs = path.join(root, rel);
      checkedPaths.push('record_jsonl:' + rel);
      try {
        if (!fs.existsSync(abs)) { warnings.push('record jsonl missing: ' + rel); continue; }
        const raw = fs.readFileSync(abs, 'utf8');
        const lines = raw.split(/\r?\n/).filter(Boolean);
        const tail = lines.slice(Math.max(0, lines.length - 250));
        for (let i = tail.length - 1; i >= 0; i -= 1) {
          const line = tail[i];
          if (!/project_id|projectId|project_name|projectName|panel_id|panelId|panel_instance|panelInstance|project_panel_identity|projectPanelIdentity/i.test(line)) continue;
          try { out.push({ value: JSON.parse(line), source: 'record_jsonl:' + rel + ':tail_line_' + i }); } catch (_) {}
        }
      } catch (e) {
        warnings.push('record jsonl read failed ' + rel + ': ' + (e && e.message ? e.message : String(e)));
      }
    }
    return out;
  }

  function collectProbePathEvidence(root, checkedPaths, warnings) {
    const fs = require('fs');
    const path = require('path');
    const rel = 'reports/W58_PROJECT_PANEL_IDENTITY_MAIN_PROCESS_SOURCE_PROBE_RESULT.json';
    const abs = path.join(root, rel);
    checkedPaths.push('probe_evidence:' + rel);
    try {
      if (!fs.existsSync(abs)) { warnings.push('probe result missing; resolver will still check confirmed module paths.'); return; }
      const parsed = JSON.parse(fs.readFileSync(abs, 'utf8'));
      if (parsed && parsed.summary) checkedPaths.push('probe_summary:' + JSON.stringify(parsed.summary).slice(0, 300));
      if (Array.isArray(parsed.strong_candidates_ranked)) {
        parsed.strong_candidates_ranked.slice(0, 20).forEach((c) => {
          if (c && c.source_path && !sourceIsForbidden(c.source_path)) checkedPaths.push('probe_candidate_path:' + c.source_path);
        });
      }
    } catch (e) {
      warnings.push('probe path evidence read failed: ' + (e && e.message ? e.message : String(e)));
    }
  }

  function buildProjectPanelIdentityResponse() {
    const path = require('path');
    const root = path.resolve(__dirname, '..', '..');
    const warnings = [];
    const checkedPaths = [];
    collectProbePathEvidence(root, checkedPaths, warnings);

    const candidateValues = [];
    candidateValues.push(...readJsonlRecordCandidates(root, checkedPaths, warnings));

    for (const relPath of CONFIRMED_SOURCE_PATHS) {
      const label = 'module:' + relPath;
      const mod = safeRequire(path.join(root, relPath), label, checkedPaths, warnings);
      if (mod) candidateValues.push(...callSafeGetters(mod, label, checkedPaths, warnings));
    }

    for (const item of candidateValues) {
      const normalized = scanGraph(item.value, item.source, checkedPaths, warnings);
      if (normalized) {
        normalized.warnings = warnings.slice(0, 120);
        normalized.checked_paths = checkedPaths.slice(0, 240);
        return normalized;
      }
    }

    return {
      ok: false,
      project_id: null,
      project_name: null,
      panel_id: null,
      panel_instance_id: null,
      project_panel_identity: null,
      source: 'not_found',
      warnings: warnings.concat([
        'No live Project Panel identity value source was found after W58 source-path-injected resolver checks.',
        'W54 metadata wrappers were detected, but no current record with project identity values was found.',
        'No fake, default, smoke, template, expected-shape, or hardcoded Project Panel value was generated.'
      ]).slice(0, 120),
      checked_paths: checkedPaths.slice(0, 240),
      error: 'Project Panel Identity source not found'
    };
  }

  function register(ipcMainLike) {
    if (!ipcMainLike || typeof ipcMainLike.handle !== 'function') return;
    if (typeof ipcMainLike.removeHandler === 'function') {
      try { ipcMainLike.removeHandler(CHANNEL); } catch (_) {}
    }
    ipcMainLike.handle(CHANNEL, async function w58GetProjectPanelIdentityHandlerV5812(event, __w60R13fLifecyclePayload) {
      const __w60R13fPayloadResponse = __w60R13fApplyLifecyclePayload(event, __w60R13fLifecyclePayload);
      if (__w60R13fPayloadResponse && __w60R13fPayloadResponse.source_found === true) {
        return __w60R13fPayloadResponse;
      }
      const __w60R13fRegistryResponse = __w60R13fReadLifecycleRegistry(event);
      if (__w60R13fRegistryResponse && __w60R13fRegistryResponse.source_found === true) {
        return __w60R13fRegistryResponse;
      }
      return buildProjectPanelIdentityResponse();
    });
    // W60_R13F_H_HANDLER_BRANCH_PRESENT
  }

  try {
    /* W58_RUNTIME_HANDLER_BINDING_RED_FIX_V58_1_3_START */
    const electron = require('electron');
    const ipcMain = electron && electron.ipcMain;
    register(ipcMain);
    /* W58_RUNTIME_HANDLER_BINDING_RED_FIX_V58_1_3_END */
  } catch (e) {
    try { console.warn('[W58] Project Panel Identity resolver v58.1.2 registration failed:', e && e.message ? e.message : e); } catch (_) {}
  }
}());
/* W58_GETTER_RESOLVER_STRENGTHEN_V58_1_2_END */
