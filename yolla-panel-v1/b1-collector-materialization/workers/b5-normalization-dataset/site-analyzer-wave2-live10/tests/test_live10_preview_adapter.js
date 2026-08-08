'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const {
  collectB4Live10,
  buildLive10PreviewExports,
  toPreviewRecord,
} = require('../src/live10_preview_adapter');

function makeServer() {
  const items = Array.from({ length: 10 }, (_, i) => ({
    id: i + 1,
    name: `Fixture Item ${String(i + 1).padStart(2, '0')}`,
    category: (i + 1) % 2 ? 'odd' : 'even',
    value: (i + 1) * 100,
  }));
  const failed = new Set();
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const page = Number(url.searchParams.get('page') || '1');
    const runId = url.searchParams.get('run_id') || 'default';
    const key = `${runId}:${page}`;
    if (page === 2 && !failed.has(key)) {
      failed.add(key);
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ retryable: true }));
      return;
    }
    const start = (page - 1) * 5;
    const payload = {
      records: items.slice(start, start + 5),
      page,
      next_page: start + 5 < items.length ? page + 1 : null,
      total: 10,
    };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(payload));
  });
}

function fakeModelFactory(input) {
  const state = {
    records: input.records,
    renames: new Map(),
    hidden: new Set(),
    order: [],
    edits: new Map(),
  };
  const model = {
    renameField(id, label) { state.renames.set(id, label); return model; },
    removeField(id) { state.hidden.add(id); return model; },
    orderFields(ids) { state.order = [...ids]; return model; },
    setCell(rowId, fieldId, value) { state.edits.set(`${rowId}:${fieldId}`, value); return model; },
    preview() {
      return {
        rowCount: state.records.length,
        rows: state.records.map((record, index) => ({
          rowId: `row-${index + 1}`,
          sourceRowPointer: record.source.rowPointer,
          cells: state.order.map((id) => ({
            fieldId: id,
            label: state.renames.get(id) || id,
            value: state.edits.get(`row-${index + 1}:${id}`) ?? record.data[id],
            sourceElementPointer: record.source.elementPointers[id],
          })),
        })),
      };
    },
    exportAll() {
      const rowCount = state.records.length;
      return {
        preview: model.preview(),
        exports: { json: { rowCount }, csv: { rowCount }, excel: { rowCount } },
        manifest: { rowCount },
      };
    },
  };
  return model;
}

let server;
let baseUrl;
test.before(async () => {
  server = makeServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => new Promise((resolve) => server.close(resolve)));

test('01 source pointer conversion', () => {
  const record = toPreviewRecord(
    { id: 1, name: 'A', category: 'odd', value: 100 },
    { runId: 'r', page: 1, rowIndex: 0, pageUrl: 'u' },
  );
  assert.equal(record.source.rowPointer.provider, 'B-4');
});
test('02 four element pointers', () => {
  const record = toPreviewRecord(
    { id: 1, name: 'A', category: 'odd', value: 100 },
    { runId: 'r', page: 1, rowIndex: 0, pageUrl: 'u' },
  );
  assert.equal(Object.keys(record.source.elementPointers).length, 4);
});
test('03 live collect exactly 10', async () => {
  const result = await collectB4Live10(baseUrl, { runId: 'collect10' });
  assert.equal(result.records.length, 10);
});
test('04 two pages', async () => {
  const result = await collectB4Live10(baseUrl, { runId: 'pages' });
  assert.deepEqual(result.fetchAttempts.map((item) => item.page), [1, 2]);
});
test('05 transient retry happened', async () => {
  const result = await collectB4Live10(baseUrl, { runId: 'retry' });
  assert.equal(result.retryCount, 1);
});
test('06 order preserved 1..10', async () => {
  const result = await collectB4Live10(baseUrl, { runId: 'order' });
  assert.deepEqual(result.records.map((item) => item.data.id), [1,2,3,4,5,6,7,8,9,10]);
});
test('07 names preserved', async () => {
  const result = await collectB4Live10(baseUrl, { runId: 'names' });
  assert.equal(result.records[9].data.name, 'Fixture Item 10');
});
test('08 row pointers preserved', async () => {
  const result = await collectB4Live10(baseUrl, { runId: 'rows' });
  assert.equal(result.records.filter((item) => item.source.rowPointer).length, 10);
});
test('09 element pointers preserved', async () => {
  const result = await collectB4Live10(baseUrl, { runId: 'elements' });
  assert.equal(result.records.reduce((n, item) => n + Object.keys(item.source.elementPointers).length, 0), 40);
});
test('10 preview 10', async () => {
  const result = await buildLive10PreviewExports(baseUrl, { runId: 'preview', createPreviewModel: fakeModelFactory });
  assert.equal(result.preview.rowCount, 10);
});
test('11 json 10', async () => {
  const result = await buildLive10PreviewExports(baseUrl, { runId: 'json', createPreviewModel: fakeModelFactory });
  assert.equal(result.exports.json.rowCount, 10);
});
test('12 csv 10', async () => {
  const result = await buildLive10PreviewExports(baseUrl, { runId: 'csv', createPreviewModel: fakeModelFactory });
  assert.equal(result.exports.csv.rowCount, 10);
});
test('13 excel 10', async () => {
  const result = await buildLive10PreviewExports(baseUrl, { runId: 'excel', createPreviewModel: fakeModelFactory });
  assert.equal(result.exports.excel.rowCount, 10);
});
test('14 edited value row5', async () => {
  const result = await buildLive10PreviewExports(baseUrl, { runId: 'edit', createPreviewModel: fakeModelFactory });
  assert.equal(result.preview.rows[4].cells.find((item) => item.fieldId === 'value').value, 5550);
});
test('15 name renamed', async () => {
  const result = await buildLive10PreviewExports(baseUrl, { runId: 'rename', createPreviewModel: fakeModelFactory });
  assert.equal(result.preview.rows[0].cells.find((item) => item.fieldId === 'name').label, 'item_name');
});
test('16 value renamed', async () => {
  const result = await buildLive10PreviewExports(baseUrl, { runId: 'rename2', createPreviewModel: fakeModelFactory });
  assert.equal(result.preview.rows[0].cells.find((item) => item.fieldId === 'value').label, 'edited_value');
});
test('17 category removed', async () => {
  const result = await buildLive10PreviewExports(baseUrl, { runId: 'remove', createPreviewModel: fakeModelFactory });
  assert.equal(result.preview.rows[0].cells.some((item) => item.fieldId === 'category'), false);
});
test('18 field order', async () => {
  const result = await buildLive10PreviewExports(baseUrl, { runId: 'fieldorder', createPreviewModel: fakeModelFactory });
  assert.deepEqual(result.preview.rows[0].cells.map((item) => item.fieldId), ['id', 'name', 'value']);
});
test('19 preview pointers 10', async () => {
  const result = await buildLive10PreviewExports(baseUrl, { runId: 'pointers', createPreviewModel: fakeModelFactory });
  assert.equal(result.preview.rows.filter((item) => item.sourceRowPointer).length, 10);
});
test('20 row5 source identity', async () => {
  const result = await buildLive10PreviewExports(baseUrl, { runId: 'identity', createPreviewModel: fakeModelFactory });
  assert.equal(result.preview.rows[4].sourceRowPointer.jsonPointer, '/records/4');
});
