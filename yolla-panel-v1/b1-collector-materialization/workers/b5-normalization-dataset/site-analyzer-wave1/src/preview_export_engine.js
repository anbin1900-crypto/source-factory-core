'use strict';

const crypto = require('node:crypto');
const { writeXlsx } = require('./xlsx_writer');

const SOURCE_KEY = '__source';

function stableStringify(value) {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function sha256(value) {
  let payload;
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) payload = value;
  else payload = typeof value === 'string' ? value : stableStringify(value);
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function flattenRecord(value, prefix = '', output = {}) {
  if (!isPlainObject(value)) {
    if (prefix) output[prefix] = clone(value);
    return output;
  }
  const keys = Object.keys(value);
  if (keys.length === 0 && prefix) output[prefix] = {};
  for (const key of keys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const child = value[key];
    if (isPlainObject(child)) flattenRecord(child, path, output);
    else output[path] = clone(child);
  }
  return output;
}

function sanitizeFieldLabel(label) {
  const normalized = String(label ?? '').trim();
  if (!normalized) throw new Error('field label must not be empty');
  if (normalized === SOURCE_KEY) throw new Error(`${SOURCE_KEY} is reserved`);
  return normalized;
}

function normalizeSource(source, rowIndex) {
  const input = isPlainObject(source) ? clone(source) : {};
  const rowPointer = isPlainObject(input.rowPointer)
    ? input.rowPointer
    : {
        extractionRowIndex: rowIndex,
        artifactId: input.artifactId ?? null,
        pageUrl: input.pageUrl ?? null,
      };
  const elementPointers = isPlainObject(input.elementPointers) ? input.elementPointers : {};
  return { rowPointer, elementPointers };
}

function normalizeInput(input) {
  const records = Array.isArray(input) ? input : input?.records;
  if (!Array.isArray(records)) throw new TypeError('input must be an array or { records: [] }');
  return records.map((entry, index) => {
    if (isPlainObject(entry) && Object.hasOwn(entry, 'data')) {
      if (!isPlainObject(entry.data)) throw new TypeError(`records[${index}].data must be an object`);
      return {
        data: clone(entry.data),
        source: normalizeSource(entry.source, index),
      };
    }
    if (!isPlainObject(entry)) throw new TypeError(`records[${index}] must be an object`);
    const data = clone(entry);
    const embeddedSource = data[SOURCE_KEY];
    delete data[SOURCE_KEY];
    return {
      data,
      source: normalizeSource(embeddedSource, index),
    };
  });
}

function csvEscape(value, delimiter) {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'string' ? value : stableStringify(value);
  if (text.includes('"')) text = text.replace(/"/g, '""');
  if (text.includes(delimiter) || /["\r\n]/.test(text)) text = `"${text}"`;
  return text;
}

function displayCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return stableStringify(value);
  return value;
}

class DataPreviewModel {
  constructor(input, options = {}) {
    this.options = {
      includeSourcePointers: options.includeSourcePointers !== false,
      sourceRowColumn: options.sourceRowColumn || '__source_row_pointer',
      sourceElementColumn: options.sourceElementColumn || '__source_element_pointers',
    };
    this.originalRecords = normalizeInput(input);
    this.sourceHash = sha256(this.originalRecords);
    this.revision = 0;
    this.auditTrail = [];

    const firstSeen = new Map();
    this.rows = this.originalRecords.map((record, rowIndex) => {
      const flat = flattenRecord(record.data);
      for (const path of Object.keys(flat)) {
        if (!firstSeen.has(path)) firstSeen.set(path, firstSeen.size);
      }
      return {
        rowId: `row-${rowIndex + 1}`,
        extractionRowIndex: rowIndex,
        values: flat,
        source: clone(record.source),
      };
    });
    this.columns = [...firstSeen.entries()].map(([path, order]) => ({
      id: path,
      sourcePath: path,
      label: path,
      order,
      visible: true,
    }));
    this._validateColumnUniqueness();
    this.assertSourceParity();
  }

  _column(id) {
    const column = this.columns.find((item) => item.id === id);
    if (!column) throw new Error(`unknown field: ${id}`);
    return column;
  }

  _validateColumnUniqueness() {
    const labels = this.columns.filter((item) => item.visible).map((item) => item.label);
    if (new Set(labels).size !== labels.length) throw new Error('visible field labels must be unique');
  }

  _recordAudit(action, payload) {
    this.revision += 1;
    this.auditTrail.push({ revision: this.revision, action, payload: clone(payload) });
  }

  visibleColumns() {
    return this.columns.filter((item) => item.visible).sort((a, b) => a.order - b.order).map(clone);
  }

  renameField(fieldId, newLabel) {
    const column = this._column(fieldId);
    const previous = column.label;
    column.label = sanitizeFieldLabel(newLabel);
    try {
      this._validateColumnUniqueness();
    } catch (error) {
      column.label = previous;
      throw error;
    }
    this._recordAudit('renameField', { fieldId, previous, next: column.label });
    return this;
  }

  removeField(fieldId) {
    const column = this._column(fieldId);
    if (!column.visible) return this;
    column.visible = false;
    this._recordAudit('removeField', { fieldId });
    return this;
  }

  restoreField(fieldId, order = undefined) {
    const column = this._column(fieldId);
    column.visible = true;
    if (Number.isInteger(order) && order >= 0) column.order = order;
    this._validateColumnUniqueness();
    this._recordAudit('restoreField', { fieldId, order: column.order });
    return this;
  }

  orderFields(fieldIds) {
    if (!Array.isArray(fieldIds)) throw new TypeError('fieldIds must be an array');
    const visible = this.visibleColumns().map((item) => item.id);
    if (fieldIds.length !== visible.length || new Set(fieldIds).size !== fieldIds.length) {
      throw new Error('field order must contain every visible field exactly once');
    }
    for (const fieldId of fieldIds) {
      const column = this._column(fieldId);
      if (!column.visible) throw new Error(`hidden field cannot be ordered: ${fieldId}`);
    }
    fieldIds.forEach((fieldId, index) => { this._column(fieldId).order = index; });
    this._recordAudit('orderFields', { fieldIds });
    return this;
  }

  setCell(rowId, fieldId, value) {
    const row = this.rows.find((item) => item.rowId === rowId);
    if (!row) throw new Error(`unknown row: ${rowId}`);
    this._column(fieldId);
    const previous = clone(row.values[fieldId]);
    row.values[fieldId] = clone(value);
    this._recordAudit('setCell', { rowId, fieldId, previous, next: value });
    return this;
  }

  assertSourceParity() {
    const reconstructed = this.originalRecords.map((record, index) => ({
      data: clone(record.data),
      source: normalizeSource(record.source, index),
    }));
    if (sha256(reconstructed) !== this.sourceHash) throw new Error('source extraction result was mutated');
    for (const row of this.rows) {
      const originalFlat = flattenRecord(this.originalRecords[row.extractionRowIndex].data);
      for (const [path, value] of Object.entries(originalFlat)) {
        if (!Object.hasOwn(row.values, path)) throw new Error(`preview omitted source field ${path}`);
        if (this.revision === 0 && stableStringify(row.values[path]) !== stableStringify(value)) {
          throw new Error(`preview/source mismatch at ${row.rowId}.${path}`);
        }
      }
    }
    return true;
  }

  _exportRow(row, includeSourcePointers = this.options.includeSourcePointers) {
    const output = {};
    for (const column of this.visibleColumns()) {
      output[column.label] = clone(row.values[column.id]);
    }
    if (includeSourcePointers) {
      output[SOURCE_KEY] = clone(row.source);
    }
    return output;
  }

  preview() {
    const columns = this.visibleColumns();
    return {
      modelVersion: 'ANALYZER_DATA_PREVIEW_MODEL_V1',
      sourceRecordCount: this.originalRecords.length,
      rowCount: this.rows.length,
      columnCount: columns.length,
      revision: this.revision,
      sourceHash: this.sourceHash,
      columns,
      rows: this.rows.map((row) => ({
        rowId: row.rowId,
        extractionRowIndex: row.extractionRowIndex,
        cells: columns.map((column) => ({
          fieldId: column.id,
          label: column.label,
          value: clone(row.values[column.id]),
          sourceElementPointer: clone(row.source.elementPointers[column.sourcePath] ?? null),
        })),
        sourceRowPointer: clone(row.source.rowPointer),
      })),
      auditTrail: clone(this.auditTrail),
    };
  }

  exportRecords(options = {}) {
    const includeSourcePointers = options.includeSourcePointers !== false;
    return this.rows.map((row) => this._exportRow(row, includeSourcePointers));
  }

  exportJSON(options = {}) {
    const records = this.exportRecords(options);
    const body = options.pretty === false ? JSON.stringify(records) : JSON.stringify(records, null, 2);
    return {
      format: 'json',
      mimeType: 'application/json; charset=utf-8',
      extension: '.json',
      rowCount: records.length,
      previewRevision: this.revision,
      content: body,
      bytes: Buffer.from(body, 'utf8'),
      sha256: sha256(body),
    };
  }

  _matrix(options = {}) {
    const includeSourcePointers = options.includeSourcePointers !== false;
    const columns = this.visibleColumns();
    const headers = columns.map((column) => column.label);
    if (includeSourcePointers) headers.push(this.options.sourceRowColumn, this.options.sourceElementColumn);
    const rows = this.rows.map((row) => {
      const values = columns.map((column) => displayCell(row.values[column.id]));
      if (includeSourcePointers) {
        values.push(stableStringify(row.source.rowPointer), stableStringify(row.source.elementPointers));
      }
      return values;
    });
    return [headers, ...rows];
  }

  exportCSV(options = {}) {
    const delimiter = options.delimiter || ',';
    if (typeof delimiter !== 'string' || delimiter.length !== 1) throw new Error('delimiter must be one character');
    const lineEnding = options.lineEnding || '\r\n';
    const matrix = this._matrix(options);
    const content = matrix.map((row) => row.map((value) => csvEscape(value, delimiter)).join(delimiter)).join(lineEnding);
    const withBom = options.bom === false ? content : `\uFEFF${content}`;
    return {
      format: 'csv',
      mimeType: 'text/csv; charset=utf-8',
      extension: '.csv',
      rowCount: this.rows.length,
      previewRevision: this.revision,
      content: withBom,
      bytes: Buffer.from(withBom, 'utf8'),
      sha256: sha256(withBom),
    };
  }

  exportExcel(options = {}) {
    const matrix = this._matrix(options);
    const bytes = writeXlsx(matrix, {
      sheetName: options.sheetName || 'Preview',
      createdAt: options.createdAt || '2026-08-07T00:00:00.000Z',
      freezeHeader: options.freezeHeader,
      autoFilter: options.autoFilter,
    });
    return {
      format: 'xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      extension: '.xlsx',
      rowCount: this.rows.length,
      previewRevision: this.revision,
      bytes,
      sha256: sha256(bytes),
    };
  }

  exportAll(options = {}) {
    const json = this.exportJSON(options.json || {});
    const csv = this.exportCSV(options.csv || {});
    const excel = this.exportExcel(options.excel || {});
    return {
      preview: this.preview(),
      exports: { json, csv, excel },
      manifest: {
        modelVersion: 'ANALYZER_PREVIEW_EXPORT_MANIFEST_V1',
        sourceHash: this.sourceHash,
        previewRevision: this.revision,
        rowCount: this.rows.length,
        visibleFieldCount: this.visibleColumns().length,
        files: [json, csv, excel].map(({ format, mimeType, extension, rowCount, sha256: digest }) => ({
          format, mimeType, extension, rowCount, sha256: digest,
        })),
      },
    };
  }
}

function createPreviewModel(input, options) {
  return new DataPreviewModel(input, options);
}

module.exports = {
  DataPreviewModel,
  createPreviewModel,
  flattenRecord,
  normalizeInput,
  stableStringify,
  sha256,
};
