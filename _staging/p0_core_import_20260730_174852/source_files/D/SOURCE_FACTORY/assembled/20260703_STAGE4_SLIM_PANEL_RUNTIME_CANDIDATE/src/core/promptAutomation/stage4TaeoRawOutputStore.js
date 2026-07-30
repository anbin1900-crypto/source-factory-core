'use strict';

const STORE_SCHEMA = 'stage4.taeo.raw_output_store.v1';
const RECORD_SCHEMA = 'stage4.taeo.raw_output_store_record.v1';

function nowIsoString() {
  return new Date().toISOString();
}

function normalizeString(value, fallback) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || fallback;
  }

  if (value === null || value === undefined) {
    return fallback;
  }

  const converted = String(value).trim();
  return converted || fallback;
}

function normalizeNullableString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }

  return String(value);
}

function normalizeNumber(value, fallback) {
  const numberValue = Number(value);
  if (Number.isFinite(numberValue)) {
    return numberValue;
  }

  return fallback;
}

function normalizeNonNegativeInteger(value, fallback) {
  const numberValue = normalizeNumber(value, fallback);
  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.max(0, Math.floor(numberValue));
}

function normalizePlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.assign({}, value);
}

function normalizeArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.slice();
}

function normalizeTrace(trace) {
  return normalizeArray(trace)
    .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry) => Object.assign({}, entry));
}

function createSafeId(prefix, seed) {
  const safePrefix = normalizeString(prefix, 'id');
  const safeSeed = normalizeString(seed, nowIsoString()).replace(/[^0-9A-Za-z]/g, '');
  return `${safePrefix}_${safeSeed || Date.now()}`;
}

function createTraceEntry(type, data) {
  return Object.freeze({
    type: normalizeString(type, 'unknown'),
    at: nowIsoString(),
    data: normalizePlainObject(data),
  });
}

function estimateTokenCount(rawText) {
  const text = normalizeString(rawText, '');
  if (!text) {
    return 0;
  }

  const compact = text.replace(/\s+/g, ' ').trim();
  if (!compact) {
    return 0;
  }

  const roughByCharacters = Math.ceil(compact.length / 4);
  const roughByWords = compact.split(' ').filter(Boolean).length;
  return Math.max(roughByCharacters, roughByWords);
}

function getRecordTime(record) {
  const source = normalizePlainObject(record);
  return normalizeNullableString(
    source.captured_at ||
    source.created_at ||
    source.updated_at ||
    source.saved_at
  );
}

function normalizeRawOutputRecord(record) {
  const source = normalizePlainObject(record);
  const createdAt = normalizeNullableString(source.created_at) || nowIsoString();

  const projectId = normalizeString(source.project_id, 'unknown_project');
  const panelId = normalizeString(source.panel_id, 'unknown_panel');
  const slotId = normalizeString(source.slot_id, 'unknown_slot');
  const promptId = normalizeString(source.prompt_id, 'unknown_prompt');
  const taeoOutputId = normalizeString(
    source.taeo_output_id || source.output_id,
    createSafeId('taeo_output', `${slotId}_${promptId}_${createdAt}`)
  );

  const rawText = normalizeString(source.raw_text || source.text || source.output_text, '');

  const normalized = {
    schema: normalizeString(source.schema, RECORD_SCHEMA),
    project_id: projectId,
    panel_id: panelId,
    slot_id: slotId,
    prompt_id: promptId,
    taeo_output_id: taeoOutputId,
    raw_text: rawText,
    captured_at: normalizeNullableString(source.captured_at) || createdAt,
    created_at: createdAt,
    updated_at: normalizeNullableString(source.updated_at),
    response_status: normalizeString(source.response_status || source.status, rawText ? 'captured' : 'empty'),
    token_estimate: normalizeNonNegativeInteger(source.token_estimate, estimateTokenCount(rawText)),
    source_candidate_count: normalizeNonNegativeInteger(source.source_candidate_count, 0),
    content_hash_candidate: normalizeNullableString(source.content_hash_candidate),
    prompt_log_ref: normalizeNullableString(source.prompt_log_ref),
    response_log_ref: normalizeNullableString(source.response_log_ref),
    autosave_record_ref: normalizeNullableString(source.autosave_record_ref),
    metadata: normalizePlainObject(source.metadata),
    trace: normalizeTrace(source.trace),
  };

  if (normalized.trace.length === 0) {
    normalized.trace.push(createTraceEntry('raw_output_record_normalized', {
      taeo_output_id: normalized.taeo_output_id,
      slot_id: normalized.slot_id,
      prompt_id: normalized.prompt_id,
    }));
  }

  return Object.freeze(normalized);
}

function normalizeStore(store) {
  const source = normalizePlainObject(store);
  const records = normalizeArray(source.records).map(normalizeRawOutputRecord);

  return Object.freeze({
    schema: normalizeString(source.schema, STORE_SCHEMA),
    created_at: normalizeNullableString(source.created_at) || nowIsoString(),
    updated_at: normalizeNullableString(source.updated_at),
    records: Object.freeze(records),
    metadata: normalizePlainObject(source.metadata),
  });
}

function createTaeoRawOutputStore(initialRecords) {
  const records = normalizeArray(initialRecords).map(normalizeRawOutputRecord);
  const createdAt = nowIsoString();

  return Object.freeze({
    schema: STORE_SCHEMA,
    created_at: createdAt,
    updated_at: createdAt,
    records: Object.freeze(records),
    metadata: {},
  });
}

function cloneStoreWithRecords(store, records, metadataPatch) {
  const safeStore = normalizeStore(store);
  const normalizedRecords = normalizeArray(records).map(normalizeRawOutputRecord);

  return Object.freeze({
    schema: STORE_SCHEMA,
    created_at: safeStore.created_at,
    updated_at: nowIsoString(),
    records: Object.freeze(normalizedRecords),
    metadata: Object.assign({}, safeStore.metadata, normalizePlainObject(metadataPatch)),
  });
}

function appendRawOutput(store, record) {
  const safeStore = normalizeStore(store);
  const nextRecord = normalizeRawOutputRecord(record);
  const existingIndex = safeStore.records.findIndex((item) => item.taeo_output_id === nextRecord.taeo_output_id);

  if (existingIndex >= 0) {
    const replacedRecords = safeStore.records.slice();
    replacedRecords[existingIndex] = Object.freeze(Object.assign({}, nextRecord, {
      updated_at: nowIsoString(),
      trace: normalizeTrace(nextRecord.trace).concat([createTraceEntry('raw_output_replaced_in_store', {
        taeo_output_id: nextRecord.taeo_output_id,
      })]),
    }));

    return cloneStoreWithRecords(safeStore, replacedRecords, {
      last_operation: 'replace_existing_raw_output',
      last_taeo_output_id: nextRecord.taeo_output_id,
    });
  }

  return cloneStoreWithRecords(safeStore, safeStore.records.concat([nextRecord]), {
    last_operation: 'append_raw_output',
    last_taeo_output_id: nextRecord.taeo_output_id,
  });
}

function updateRawOutput(store, taeoOutputId, patch) {
  const safeStore = normalizeStore(store);
  const targetId = normalizeString(taeoOutputId, '');
  const patchObject = normalizePlainObject(patch);

  if (!targetId) {
    return cloneStoreWithRecords(safeStore, safeStore.records, {
      last_operation: 'update_raw_output_skipped',
      last_reason: 'missing_taeo_output_id',
    });
  }

  let updated = false;
  const nextRecords = safeStore.records.map((record) => {
    if (record.taeo_output_id !== targetId) {
      return record;
    }

    updated = true;
    return normalizeRawOutputRecord(Object.assign({}, record, patchObject, {
      taeo_output_id: record.taeo_output_id,
      updated_at: nowIsoString(),
      trace: normalizeTrace(record.trace).concat([createTraceEntry('raw_output_updated_in_store', {
        taeo_output_id: record.taeo_output_id,
        patch_keys: Object.keys(patchObject),
      })]),
    }));
  });

  return cloneStoreWithRecords(safeStore, nextRecords, {
    last_operation: updated ? 'update_raw_output' : 'update_raw_output_not_found',
    last_taeo_output_id: targetId,
  });
}

function findRawOutputById(store, taeoOutputId) {
  const safeStore = normalizeStore(store);
  const targetId = normalizeString(taeoOutputId, '');

  if (!targetId) {
    return null;
  }

  return safeStore.records.find((record) => record.taeo_output_id === targetId) || null;
}

function listRawOutputsBySlot(store, slotId) {
  const safeStore = normalizeStore(store);
  const targetSlotId = normalizeString(slotId, '');

  if (!targetSlotId) {
    return [];
  }

  return safeStore.records
    .filter((record) => record.slot_id === targetSlotId)
    .slice()
    .sort((left, right) => {
      const leftTime = Date.parse(getRecordTime(left) || '') || 0;
      const rightTime = Date.parse(getRecordTime(right) || '') || 0;
      return leftTime - rightTime;
    });
}

function listRawOutputsByPrompt(store, promptId) {
  const safeStore = normalizeStore(store);
  const targetPromptId = normalizeString(promptId, '');

  if (!targetPromptId) {
    return [];
  }

  return safeStore.records.filter((record) => record.prompt_id === targetPromptId);
}

function listRawOutputsByProject(store, projectId) {
  const safeStore = normalizeStore(store);
  const targetProjectId = normalizeString(projectId, '');

  if (!targetProjectId) {
    return [];
  }

  return safeStore.records.filter((record) => record.project_id === targetProjectId);
}

function summarizeRawOutputStore(store) {
  const safeStore = normalizeStore(store);

  const summary = {
    schema: 'stage4.taeo.raw_output_store_summary.v1',
    total: safeStore.records.length,
    by_project_id: {},
    by_slot_id: {},
    by_response_status: {},
    total_token_estimate: 0,
    total_source_candidate_count: 0,
    latest_taeo_output_id: null,
    latest_captured_at: null,
    updated_at: safeStore.updated_at,
  };

  safeStore.records.forEach((record) => {
    summary.by_project_id[record.project_id] = (summary.by_project_id[record.project_id] || 0) + 1;
    summary.by_slot_id[record.slot_id] = (summary.by_slot_id[record.slot_id] || 0) + 1;
    summary.by_response_status[record.response_status] = (summary.by_response_status[record.response_status] || 0) + 1;
    summary.total_token_estimate += normalizeNonNegativeInteger(record.token_estimate, 0);
    summary.total_source_candidate_count += normalizeNonNegativeInteger(record.source_candidate_count, 0);

    const recordCapturedAt = normalizeNullableString(record.captured_at);
    const currentLatest = summary.latest_captured_at;

    if (recordCapturedAt && (!currentLatest || Date.parse(recordCapturedAt) >= Date.parse(currentLatest))) {
      summary.latest_captured_at = recordCapturedAt;
      summary.latest_taeo_output_id = record.taeo_output_id;
    }
  });

  return Object.freeze(summary);
}

module.exports = {
  createTaeoRawOutputStore,
  appendRawOutput,
  updateRawOutput,
  findRawOutputById,
  listRawOutputsBySlot,
  listRawOutputsByPrompt,
  listRawOutputsByProject,
  summarizeRawOutputStore,
};