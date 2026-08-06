'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { createPreviewModel, stableStringify } = require('./preview_export_engine');
const { crc32, writeXlsx } = require('./xlsx_writer');

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture.json'), 'utf8'));

function model() {
  return createPreviewModel(fixture, { includeSourcePointers: true });
}

test('01 auto-shapes records and rows', () => {
  const preview = model().preview();
  assert.equal(preview.rowCount, 3);
  assert.ok(preview.columnCount >= 8);
});

test('02 nested fields become stable table columns', () => {
  const preview = model().preview();
  assert.ok(preview.columns.some((field) => field.id === 'address.city'));
  assert.ok(preview.columns.some((field) => field.id === 'extra.memo'));
});

test('03 source parity passes before edits', () => assert.equal(model().assertSourceParity(), true));

test('04 source row pointers are preserved', () => {
  const preview = model().preview();
  assert.equal(preview.rows[1].sourceRowPointer.artifactId, 'raw-page-1');
  assert.equal(preview.rows[1].sourceRowPointer.rowIndex, 1);
});

test('05 source element pointers are attached to cells', () => {
  const preview = model().preview();
  const title = preview.rows[0].cells.find((cell) => cell.fieldId === 'title');
  assert.equal(title.sourceElementPointer.nodeId, 101);
});

test('06 field rename updates preview and export', () => {
  const current = model().renameField('title', 'listing_title');
  assert.ok(current.preview().columns.some((field) => field.label === 'listing_title'));
  assert.equal(current.exportRecords()[0].listing_title, 'Alpha, "Seoul"');
});

test('07 duplicate field labels are rejected', () => {
  const current = model().renameField('title', 'listing_title');
  assert.throws(() => current.renameField('price', 'listing_title'), /unique/);
});

test('08 reserved source label is rejected', () => assert.throws(() => model().renameField('title', '__source'), /reserved/));

test('09 field removal hides preview and export field', () => {
  const current = model().removeField('active');
  assert.ok(!current.preview().columns.some((field) => field.id === 'active'));
  assert.equal(Object.hasOwn(current.exportRecords()[0], 'active'), false);
});

test('10 field restore returns hidden field', () => {
  const current = model().removeField('active').restoreField('active');
  assert.ok(current.preview().columns.some((field) => field.id === 'active'));
});

test('11 field ordering is exact', () => {
  const current = model();
  const ids = current.visibleColumns().map((item) => item.id).reverse();
  current.orderFields(ids);
  assert.deepEqual(current.visibleColumns().map((item) => item.id), ids);
});

test('12 invalid order is rejected', () => assert.throws(() => model().orderFields(['title']), /every visible field/));

test('13 cell editing is visible without source mutation', () => {
  const current = model();
  current.setCell('row-1', 'price', 111);
  assert.equal(current.exportRecords()[0].price, 111);
  assert.equal(current.originalRecords[0].data.price, 100);
});

test('14 audit trail records edit sequence', () => {
  const current = model().renameField('title', 'name').removeField('active').setCell('row-1', 'price', 111);
  assert.deepEqual(current.preview().auditTrail.map((entry) => entry.action), ['renameField', 'removeField', 'setCell']);
});

test('15 JSON export matches edited preview', () => {
  const current = model().renameField('title', 'name').setCell('row-2', 'price', 250);
  const parsed = JSON.parse(current.exportJSON().content);
  assert.equal(parsed[1].name, 'Beta\nBusan');
  assert.equal(parsed[1].price, 250);
});

test('16 JSON export preserves source pointers', () => {
  const parsed = JSON.parse(model().exportJSON().content);
  assert.equal(parsed[2].__source.rowPointer.artifactId, 'raw-page-2');
  assert.equal(parsed[2].__source.elementPointers.title.nodeId, 301);
});

test('17 JSON can omit source pointers explicitly', () => {
  const parsed = JSON.parse(model().exportJSON({ includeSourcePointers: false }).content);
  assert.equal(Object.hasOwn(parsed[0], '__source'), false);
});

test('18 CSV quotes commas and quotes', () => {
  const csv = model().exportCSV().content;
  assert.match(csv, /"Alpha, ""Seoul"""/);
});

test('19 CSV preserves newlines inside quoted cells', () => {
  const csv = model().exportCSV().content;
  assert.match(csv, /"Beta\nBusan"/);
});

test('20 CSV includes source pointer columns', () => {
  const csv = model().exportCSV().content;
  assert.ok(csv.includes('__source_row_pointer'));
  assert.ok(csv.includes('__source_element_pointers'));
});

test('21 CSV BOM is present by default', () => assert.equal(model().exportCSV().content.charCodeAt(0), 0xFEFF));

test('22 CSV BOM can be disabled', () => assert.notEqual(model().exportCSV({ bom: false }).content.charCodeAt(0), 0xFEFF));

test('23 Excel output is a ZIP/XLSX buffer', () => {
  const bytes = model().exportExcel().bytes;
  assert.equal(bytes.readUInt32LE(0), 0x04034B50);
  assert.ok(bytes.includes(Buffer.from('xl/worksheets/sheet1.xml')));
});

test('24 Excel contains preview headers and edited labels', () => {
  const bytes = model().renameField('title', 'listing_title').exportExcel().bytes;
  assert.ok(bytes.includes(Buffer.from('listing_title')));
  assert.ok(bytes.includes(Buffer.from('__source_row_pointer')));
});

test('25 Excel contains numeric and boolean cells', () => {
  const bytes = model().exportExcel().bytes;
  assert.ok(bytes.includes(Buffer.from('<v>100</v>')));
  assert.ok(bytes.includes(Buffer.from('t="b"><v>1</v>')));
});

test('26 Excel is deterministic for fixed creation time', () => {
  const a = model().exportExcel({ createdAt: '2026-08-07T00:00:00.000Z' });
  const b = model().exportExcel({ createdAt: '2026-08-07T00:00:00.000Z' });
  assert.equal(a.sha256, b.sha256);
  assert.deepEqual(a.bytes, b.bytes);
});

test('27 exportAll manifest matches all export hashes', () => {
  const result = model().exportAll();
  assert.deepEqual(result.manifest.files.map((file) => file.sha256), [
    result.exports.json.sha256,
    result.exports.csv.sha256,
    result.exports.excel.sha256,
  ]);
});

test('28 preview row count matches every export', () => {
  const result = model().exportAll();
  assert.equal(result.preview.rowCount, 3);
  assert.equal(result.exports.json.rowCount, 3);
  assert.equal(result.exports.csv.rowCount, 3);
  assert.equal(result.exports.excel.rowCount, 3);
});

test('29 original extraction input is not mutated', () => {
  const before = stableStringify(fixture);
  model().renameField('title', 'name').removeField('active').setCell('row-1', 'price', 999).exportAll();
  assert.equal(stableStringify(fixture), before);
});

test('30 plain object records are supported with embedded source', () => {
  const current = createPreviewModel([{ id: 1, value: 'a', __source: { rowPointer: { rowIndex: 7 } } }]);
  assert.equal(current.preview().rows[0].sourceRowPointer.rowIndex, 7);
});

test('31 invalid non-object records are rejected', () => assert.throws(() => createPreviewModel([1]), /must be an object/));

test('32 arrays stay as preserved cell values', () => {
  const current = model();
  const tags = current.exportRecords()[0].tags;
  assert.deepEqual(tags, ['featured', 'new']);
});

test('33 empty nested objects remain representable', () => {
  const current = createPreviewModel([{ data: { id: 1, details: {} }, source: {} }]);
  assert.deepEqual(current.exportRecords()[0].details, {});
});

test('34 null values remain null in JSON', () => {
  const parsed = JSON.parse(model().exportJSON().content);
  assert.equal(parsed[2]['address.district'], null);
});

test('35 export hashes change after edits', () => {
  const a = model().exportJSON().sha256;
  const b = model().setCell('row-1', 'price', 999).exportJSON().sha256;
  assert.notEqual(a, b);
});

test('36 source hash is stable across edits', () => {
  const current = model();
  const hash = current.preview().sourceHash;
  current.setCell('row-1', 'price', 999).removeField('active');
  assert.equal(current.preview().sourceHash, hash);
});

test('37 xlsx writer rejects empty rows', () => assert.throws(() => writeXlsx([]), /non-empty/));

test('38 crc32 known vector passes', () => assert.equal(crc32(Buffer.from('123456789')), 0xCBF43926));

test('39 export MIME types are correct', () => {
  const result = model().exportAll();
  assert.equal(result.exports.json.mimeType, 'application/json; charset=utf-8');
  assert.equal(result.exports.csv.mimeType, 'text/csv; charset=utf-8');
  assert.equal(result.exports.excel.mimeType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
});

test('40 preview/export parity remains exact after rename-remove-order-edit', () => {
  const current = model();
  current.renameField('title', 'listing_title');
  current.removeField('active');
  const ids = current.visibleColumns().map((item) => item.id);
  current.orderFields([ids.at(-1), ...ids.slice(0, -1)]);
  current.setCell('row-3', 'price', 333);
  const preview = current.preview();
  const records = current.exportRecords();
  for (let index = 0; index < records.length; index += 1) {
    const expected = Object.fromEntries(preview.rows[index].cells.map((cell) => [cell.label, cell.value]));
    const actual = { ...records[index] };
    delete actual.__source;
    assert.deepEqual(actual, expected);
  }
});

test('41 Excel manifest SHA is the exact binary byte hash', () => {
  const result = model().exportExcel({ createdAt: '2026-08-07T00:00:00.000Z' });
  const actual = crypto.createHash('sha256').update(result.bytes).digest('hex');
  assert.equal(result.sha256, actual);
});
