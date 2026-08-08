'use strict';

function defaultModelFactory(input, options) {
  return require('../../site-analyzer-wave1/src').createPreviewModel(input, options);
}

async function fetchJsonWithRetry(url, { attempts = 3, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required');
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url);
      if (response.ok) return { payload: await response.json(), attempt };
      const body = await response.text();
      const error = new Error(`HTTP ${response.status}: ${body}`);
      error.status = response.status;
      if (response.status < 500 || attempt === attempts) throw error;
      lastError = error;
    } catch (error) {
      lastError = error;
      if (attempt === attempts) throw error;
    }
  }
  throw lastError;
}

function toPreviewRecord(record, { runId, page, rowIndex, pageUrl }) {
  const basePointer = `/records/${rowIndex}`;
  return {
    data: {
      id: record.id,
      name: record.name,
      category: record.category,
      value: record.value,
    },
    source: {
      rowPointer: {
        provider: 'B-4',
        runId,
        page,
        rowIndex,
        pageUrl,
        jsonPointer: basePointer,
      },
      elementPointers: {
        id: { kind: 'json-pointer', pointer: `${basePointer}/id` },
        name: { kind: 'json-pointer', pointer: `${basePointer}/name` },
        category: { kind: 'json-pointer', pointer: `${basePointer}/category` },
        value: { kind: 'json-pointer', pointer: `${basePointer}/value` },
      },
    },
  };
}

async function collectB4Live10(baseUrl, options = {}) {
  const runId = options.runId || `b5-live10-${Date.now()}`;
  const records = [];
  const fetchAttempts = [];
  let page = 1;
  while (page !== null) {
    const pageUrl = `${baseUrl}/api/items?page=${page}&run_id=${encodeURIComponent(runId)}&fail_once=1`;
    const { payload, attempt } = await fetchJsonWithRetry(pageUrl, {
      attempts: options.attempts || 3,
      fetchImpl: options.fetchImpl || globalThis.fetch,
    });
    fetchAttempts.push({ page, attempt, pageUrl });
    if (!Array.isArray(payload.records)) throw new Error(`page ${page} missing records array`);
    payload.records.forEach((record, rowIndex) => {
      records.push(toPreviewRecord(record, { runId, page, rowIndex, pageUrl }));
    });
    page = payload.next_page ?? null;
  }
  if (records.length !== 10) throw new Error(`B4 live result must contain exactly 10 records; got ${records.length}`);
  return {
    runId,
    records,
    fetchAttempts,
    retryCount: fetchAttempts.reduce((count, item) => count + item.attempt - 1, 0),
  };
}

async function buildLive10PreviewExports(baseUrl, options = {}) {
  const live = await collectB4Live10(baseUrl, options);
  const createPreviewModel = options.createPreviewModel || defaultModelFactory;
  const model = createPreviewModel({ records: live.records });
  model.renameField('name', 'item_name');
  model.renameField('value', 'edited_value');
  model.removeField('category');
  model.orderFields(['id', 'name', 'value']);
  model.setCell('row-5', 'value', 5550);
  const result = model.exportAll({
    json: { pretty: true, includeSourcePointers: true },
    csv: { includeSourcePointers: true },
    excel: {
      includeSourcePointers: true,
      sheetName: 'Live10',
      freezeHeader: true,
      autoFilter: true,
    },
  });
  const preview = model.preview();
  if (preview.rowCount !== 10) throw new Error(`preview row count mismatch: ${preview.rowCount}`);
  if (
    result.exports.json.rowCount !== 10 ||
    result.exports.csv.rowCount !== 10 ||
    result.exports.excel.rowCount !== 10
  ) {
    throw new Error('export row count mismatch');
  }
  return { ...live, model, preview, ...result };
}

module.exports = {
  fetchJsonWithRetry,
  collectB4Live10,
  buildLive10PreviewExports,
  toPreviewRecord,
};
