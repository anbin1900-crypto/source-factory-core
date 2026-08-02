'use strict';

const fs = require('fs');
const path = require('path');
const base = require('./taeoRawOutputStore.base');
const correlation = require('../p1CommandCorrelationContract');

function createTaeoRawOutputRecord(input) {
  const record = base.createTaeoRawOutputRecord(input);
  return correlation.attachCorrelation(
    record,
    input,
    input && input.metadata,
    input && input.panelCommandSummary,
    input && input.panel_command_summary
  );
}

function appendTaeoRawOutputRecord(filePath, input) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('appendTaeoRawOutputRecord requires a non-empty filePath string.');
  }
  const record = createTaeoRawOutputRecord(input);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
  return record;
}

module.exports = Object.assign({}, base, {
  createTaeoRawOutputRecord,
  appendTaeoRawOutputRecord,
  __a4P1CorrelationRepair: {
    version: 'A4_P1_PANEL_WORKER_CORRELATION_REPAIR_V2',
    storage_layer: 'TAEO_RAW_OUTPUT_STORE',
    new_runtime: false
  }
});
