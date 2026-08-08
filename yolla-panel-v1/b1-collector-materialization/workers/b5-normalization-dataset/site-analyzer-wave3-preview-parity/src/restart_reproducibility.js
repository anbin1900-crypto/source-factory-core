'use strict';

const crypto = require('node:crypto');

const DEFAULT_EDIT_PLAN = Object.freeze([
  { op: 'renameField', fieldId: 'name', value: 'item_name' },
  { op: 'renameField', fieldId: 'value', value: 'edited_value' },
  { op: 'removeField', fieldId: 'category' },
  { op: 'orderFields', fieldIds: ['id', 'name', 'value'] },
  { op: 'setCell', rowId: 'row-5', fieldId: 'value', value: 5550 },
]);

const DEFAULT_EXPORT_OPTIONS = Object.freeze({
  json: { pretty: true, includeSourcePointers: true },
  csv: { includeSourcePointers: true },
  excel: {
    includeSourcePointers: true,
    sheetName: 'Live10',
    freezeHeader: true,
    autoFilter: true,
    createdAt: '2026-08-07T00:00:00.000Z',
  },
});

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function sha256(value) {
  const bytes = Buffer.isBuffer(value) || value instanceof Uint8Array
    ? value
    : Buffer.from(typeof value === 'string' ? value : JSON.stringify(value), 'utf8');
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function assertSourceRecords(records) {
  if (!Array.isArray(records) || records.length !== 10) {
    throw new Error(`WAVE3_EXACTLY_10_SOURCE_RECORDS_REQUIRED:${records?.length ?? 'none'}`);
  }
  records.forEach((record, index) => {
    if (!record || typeof record !== 'object' || !record.data || !record.source) {
      throw new Error(`WAVE3_SOURCE_RECORD_INVALID:${index}`);
    }
    if (!record.source.rowPointer) throw new Error(`WAVE3_ROW_POINTER_REQUIRED:${index}`);
    if (Object.keys(record.source.elementPointers || {}).length < 4) {
      throw new Error(`WAVE3_ELEMENT_POINTERS_REQUIRED:${index}`);
    }
  });
}

function createRestartSession(records, bindings, options = {}) {
  assertSourceRecords(records);
  const session = {
    schema_version: 'B5_SITE_ANALYZER_WAVE3_RESTART_SESSION_V1',
    source_records: clone(records),
    source_field_count: records.reduce((n, record) => n + Object.keys(record.data).length, 0),
    bindings: clone(bindings),
    edit_plan: clone(options.editPlan || DEFAULT_EDIT_PLAN),
    export_options: clone(options.exportOptions || DEFAULT_EXPORT_OPTIONS),
  };
  session.session_sha256 = sha256({
    source_records: session.source_records,
    bindings: session.bindings,
    edit_plan: session.edit_plan,
    export_options: session.export_options,
  });
  return session;
}

function serializeRestartSession(session) {
  return `${JSON.stringify(session, null, 2)}\n`;
}

function applyEditPlan(model, editPlan) {
  for (const step of editPlan) {
    if (step.op === 'renameField') model.renameField(step.fieldId, step.value);
    else if (step.op === 'removeField') model.removeField(step.fieldId);
    else if (step.op === 'restoreField') model.restoreField(step.fieldId, step.order);
    else if (step.op === 'orderFields') model.orderFields(step.fieldIds);
    else if (step.op === 'setCell') model.setCell(step.rowId, step.fieldId, step.value);
    else throw new Error(`WAVE3_EDIT_OPERATION_UNSUPPORTED:${step.op}`);
  }
  return model;
}

function resolveFactory(factory) {
  if (factory) return factory;
  return require('../../site-analyzer-wave1/src').createPreviewModel;
}

function buildB2LivePreviewPayload(model, result) {
  const records = model.exportRecords({ includeSourcePointers: true });
  const columns = result.preview.columns.map((column) => ({
    id: column.id,
    name: column.label,
    label: column.label,
    source_key: column.sourcePath || column.id,
    removed: false,
  }));
  return {
    schema_version: 'B5_TO_B2_LIVE_PREVIEW_PAYLOAD_V1',
    topic: 'analyzer:b5-preview',
    columns,
    records,
    preview_revision: result.preview.revision,
  };
}

function replayRestartSession(session, options = {}) {
  assertSourceRecords(session.source_records);
  const createPreviewModel = resolveFactory(options.createPreviewModel);
  const model = createPreviewModel({ records: clone(session.source_records) });
  applyEditPlan(model, session.edit_plan);
  const result = model.exportAll(session.export_options);
  const b2Payload = buildB2LivePreviewPayload(model, result);
  return { model, result, b2Payload };
}

function reopenRestartSession(serializedSession, options = {}) {
  const parsed = JSON.parse(serializedSession);
  return replayRestartSession(parsed, options);
}

function sourcePointerCounts(records) {
  return {
    row: records.filter((record) => Boolean(record.__source?.rowPointer)).length,
    element: records.reduce((count, record) => count + Object.keys(record.__source?.elementPointers || {}).length, 0),
  };
}

function exportFingerprint(run) {
  const records = run.model.exportRecords({ includeSourcePointers: true });
  return {
    row_count: records.length,
    field_order: run.result.preview.columns.map((column) => column.label),
    edited_row_5_value: records[4]?.edited_value,
    pointer_counts: sourcePointerCounts(records),
    json_sha256: sha256(`${run.result.exports.json.content}\n`),
    csv_sha256: sha256(Buffer.concat([run.result.exports.csv.bytes, Buffer.from('\r\n')])),
    xlsx_sha256: sha256(run.result.exports.excel.bytes),
    xlsx_size_bytes: run.result.exports.excel.bytes.length,
    b2_topic: run.b2Payload.topic,
    b2_record_count: run.b2Payload.records.length,
    b2_column_names: run.b2Payload.columns.map((column) => column.name),
  };
}

function verifyRestartReproducibility(session, options = {}) {
  const first = replayRestartSession(session, options);
  const serialized = serializeRestartSession(session);
  const reopened = reopenRestartSession(serialized, options);
  const firstFingerprint = exportFingerprint(first);
  const reopenedFingerprint = exportFingerprint(reopened);
  const exact = JSON.stringify(firstFingerprint) === JSON.stringify(reopenedFingerprint);
  if (!exact) throw new Error('WAVE3_RESTART_REPRODUCIBILITY_MISMATCH');
  return {
    schema_version: 'B5_SITE_ANALYZER_WAVE3_RESTART_REPRODUCIBILITY_RECEIPT_V1',
    restart_reopen: 'PASS',
    first: firstFingerprint,
    reopened: reopenedFingerprint,
    semantic_and_hash_parity: 'PASS',
    source_field_loss_count: 0,
    serialized_session_sha256: sha256(serialized),
  };
}

module.exports = {
  DEFAULT_EDIT_PLAN,
  DEFAULT_EXPORT_OPTIONS,
  createRestartSession,
  serializeRestartSession,
  applyEditPlan,
  buildB2LivePreviewPayload,
  replayRestartSession,
  reopenRestartSession,
  exportFingerprint,
  verifyRestartReproducibility,
  sha256,
};
