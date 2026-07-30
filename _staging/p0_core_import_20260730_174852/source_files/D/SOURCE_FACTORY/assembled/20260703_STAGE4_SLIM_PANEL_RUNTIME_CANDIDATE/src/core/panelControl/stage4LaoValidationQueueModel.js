'use strict';

const crypto = require('crypto');

const LAO_VALIDATION_QUEUE_STATUS = Object.freeze({
  QUEUED: 'queued',
  READY: 'ready',
  DUPLICATE_SKIPPED: 'duplicate_skipped',
  REVIEWED: 'reviewed',
  PASSED: 'passed',
  WARNING: 'warning',
  FAILED: 'failed',
  ERROR: 'error',
  CANCELLED: 'cancelled'
});

function createLaoValidationQueueItem(input) {
  const source = asObject(input);
  const queuedAt = iso(source.queued_at) || new Date().toISOString();
  const units = normalizeUnits(source.source_units || source.sourceUnits);
  const sourceUnitIds = unique(flatten(source.source_unit_ids, source.sourceUnitIds, units.map((u) => u.source_unit_id)));
  const batch = normalizeBatch(source.record_batch || source.recordBatch);
  const recordBatchId = nullable(firstDefined(source.record_batch_id, batch.record_batch_id));
  const targetType = token(source.target_type, recordBatchId && sourceUnitIds.length ? 'mixed' : recordBatchId ? 'lao_record_batch' : 'source_units');
  const projectId = nullable(firstDefined(source.project_id, batch.project_id, firstValue(units, 'project_id')));
  const validationProfile = token(source.validation_profile, 'stage4_lao_source_validation');
  const queueKey = token(source.queue_key, '') || createValidationQueueKey({ project_id: projectId, target_type: targetType, source_unit_ids: sourceUnitIds, record_batch_id: recordBatchId, validation_profile: validationProfile });
  const validationQueueId = token(source.validation_queue_id || source.validationQueueId, '') || createValidationQueueId({ queue_key: queueKey, queued_at: queuedAt, id_hint: source.id_hint });
  const readiness = buildValidationReadinessSummary({ source_unit_ids: sourceUnitIds, source_units: units, record_batch_id: recordBatchId, record_batch: batch, target_type: targetType });
  const status = normalizeStatus(source.status, readiness.ready ? LAO_VALIDATION_QUEUE_STATUS.QUEUED : LAO_VALIDATION_QUEUE_STATUS.ERROR);
  return serializeItem({ object_type: 'LAO_VALIDATION_QUEUE_ITEM', version: 'stage4.lao_validation_queue.v1', validation_queue_id: validationQueueId, queue_key: queueKey, target_type: targetType, project_id: projectId, source_unit_ids: sourceUnitIds, source_units: units, record_batch_id: recordBatchId, record_batch_summary: summarizeBatch(batch), queued_at: queuedAt, status, requested_by: normalizeRequestedBy(source.requested_by, source), validation_profile: validationProfile, priority: integer(source.priority, 100), readiness, review_result: source.review_result ? normalizeReviewResult(source.review_result) : null, trace: serializable(source.trace), timeline: normalizeTimeline(source.timeline, { at: queuedAt, status, event: 'lao_validation_queue_item_created' }), reviewed_at: iso(source.reviewed_at), created_at: iso(source.created_at) || queuedAt, updated_at: iso(source.updated_at) || queuedAt });
}

function queueSourceUnitsForValidation(units, options) {
  const config = normalizeOptions(options);
  const item = createLaoValidationQueueItem({ project_id: config.project_id, source_units: normalizeUnits(units), target_type: 'source_units', requested_by: config.requested_by, validation_profile: config.validation_profile, priority: config.priority, queued_at: config.queued_at, trace: config.trace });
  return applyDuplicatePolicy(item, config.existing_items, config.allow_duplicate);
}

function queueLaoRecordBatchForValidation(batch, options) {
  const config = normalizeOptions(options);
  const normalizedBatch = normalizeBatch(batch);
  const item = createLaoValidationQueueItem({ project_id: firstDefined(config.project_id, normalizedBatch.project_id), source_units: normalizedBatch.source_units, record_batch_id: normalizedBatch.record_batch_id, record_batch: normalizedBatch, target_type: 'lao_record_batch', requested_by: config.requested_by, validation_profile: config.validation_profile, priority: config.priority, queued_at: config.queued_at, trace: config.trace });
  return applyDuplicatePolicy(item, config.existing_items, config.allow_duplicate);
}

function markValidationQueueItemReviewed(item, result) {
  const serialized = serializeItem(item);
  const reviewResult = normalizeReviewResult(result);
  const status = mapReviewStatus(reviewResult.status);
  const now = new Date().toISOString();
  const timeline = serialized.timeline.slice();
  timeline.push({ at: now, status, event: 'lao_validation_queue_item_reviewed', result_status: reviewResult.status, report_id: reviewResult.report_id });
  return serializeItem(Object.assign({}, serialized, { status, reviewed_at: now, review_result: reviewResult, timeline, updated_at: now }));
}

function summarizeLaoValidationQueue(items) {
  const list = Array.isArray(items) ? items : items ? [items] : [];
  const summary = { object_type: 'LAO_VALIDATION_QUEUE_SUMMARY', version: 'stage4.lao_validation_queue.v1', item_count: list.length, ready_count: 0, not_ready_count: 0, queued_count: 0, reviewed_count: 0, passed_count: 0, warning_count: 0, failed_count: 0, error_count: 0, duplicate_skipped_count: 0, source_unit_count: 0, record_batch_count: 0, by_status: {}, by_target_type: {}, validation_queue_ids: [], queue_keys: [], duplicate_queue_keys: [], project_ids: [], record_batch_ids: [], ready_item_ids: [], blocked_item_ids: [], next_ready_item_id: null };
  const allKeys = [];
  for (const raw of list) {
    const item = serializeItem(raw);
    inc(summary.by_status, item.status); inc(summary.by_target_type, item.target_type);
    if (item.readiness.ready) { summary.ready_count += 1; push(summary.ready_item_ids, item.validation_queue_id); } else { summary.not_ready_count += 1; push(summary.blocked_item_ids, item.validation_queue_id); }
    if ([LAO_VALIDATION_QUEUE_STATUS.QUEUED, LAO_VALIDATION_QUEUE_STATUS.READY].includes(item.status)) summary.queued_count += 1;
    if (item.status === LAO_VALIDATION_QUEUE_STATUS.REVIEWED) summary.reviewed_count += 1;
    if (item.status === LAO_VALIDATION_QUEUE_STATUS.PASSED) summary.passed_count += 1;
    if (item.status === LAO_VALIDATION_QUEUE_STATUS.WARNING) summary.warning_count += 1;
    if (item.status === LAO_VALIDATION_QUEUE_STATUS.FAILED) summary.failed_count += 1;
    if (item.status === LAO_VALIDATION_QUEUE_STATUS.ERROR) summary.error_count += 1;
    if (item.status === LAO_VALIDATION_QUEUE_STATUS.DUPLICATE_SKIPPED) summary.duplicate_skipped_count += 1;
    summary.source_unit_count += item.source_unit_ids.length;
    if (item.record_batch_id) summary.record_batch_count += 1;
    push(summary.validation_queue_ids, item.validation_queue_id); push(summary.queue_keys, item.queue_key); push(allKeys, item.queue_key); push(summary.project_ids, item.project_id); push(summary.record_batch_ids, item.record_batch_id);
  }
  summary.validation_queue_ids = unique(summary.validation_queue_ids); summary.queue_keys = unique(summary.queue_keys); summary.duplicate_queue_keys = duplicates(allKeys); summary.project_ids = unique(summary.project_ids); summary.record_batch_ids = unique(summary.record_batch_ids); summary.ready_item_ids = unique(summary.ready_item_ids); summary.blocked_item_ids = unique(summary.blocked_item_ids); summary.next_ready_item_id = summary.ready_item_ids[0] || null;
  return summary;
}

function buildValidationReadinessSummary(input) { const source = asObject(input); const units = normalizeUnits(source.source_units); const ids = unique(flatten(source.source_unit_ids, units.map((u) => u.source_unit_id))); const recordBatchId = nullable(source.record_batch_id || (source.record_batch && source.record_batch.record_batch_id)); const blockers = []; const warnings = []; if (!ids.length && !recordBatchId) blockers.push(issue('error', 'validation_target_missing', 'Validation queue item needs SOURCE_UNIT ids or a record_batch_id.')); for (const [index, unit] of units.entries()) { if (!unit.source_unit_id) blockers.push(issue('error', 'source_unit_id_missing', 'A SOURCE_UNIT is missing source_unit_id.', { index })); if (!unit.path) blockers.push(issue('error', 'source_unit_path_missing', 'A SOURCE_UNIT is missing path.', { index })); } const dupIds = duplicates(ids); if (dupIds.length) blockers.push(issue('error', 'duplicate_source_unit_id_in_queue', 'Duplicate source_unit_id values were found.', { duplicate_source_unit_ids: dupIds })); const dupPaths = duplicates(units.map((u) => u.path)); if (dupPaths.length) warnings.push(issue('warning', 'duplicate_source_paths_need_gate_review', 'Duplicate SOURCE_UNIT paths should be reviewed by validation gate.', { duplicate_paths: dupPaths })); return { ready: blockers.length === 0, target_type: token(source.target_type, recordBatchId ? 'lao_record_batch' : 'source_units'), source_unit_count: ids.length, record_batch_id: recordBatchId, has_record_batch: Boolean(recordBatchId), blocker_count: blockers.length, warning_count: warnings.length, blockers, warnings, next_action: blockers.length === 0 ? 'worker_06_validation_gate_can_review_queue_item' : 'fix_validation_queue_target_before_review' }; }
function serializeItem(item) { const s = asObject(item); const units = normalizeUnits(s.source_units); const ids = unique(flatten(s.source_unit_ids, units.map((u) => u.source_unit_id))); const readiness = s.readiness || buildValidationReadinessSummary({ source_unit_ids: ids, source_units: units, record_batch_id: s.record_batch_id, target_type: s.target_type }); return { object_type: s.object_type || 'LAO_VALIDATION_QUEUE_ITEM', version: s.version || 'stage4.lao_validation_queue.v1', validation_queue_id: token(s.validation_queue_id, ''), queue_key: token(s.queue_key, ''), duplicate_of: nullable(s.duplicate_of), duplicate_queue_key: nullable(s.duplicate_queue_key), target_type: token(s.target_type, 'source_units'), project_id: nullable(s.project_id), source_unit_ids: ids, source_units: units, record_batch_id: nullable(s.record_batch_id), record_batch_summary: asObject(s.record_batch_summary), queued_at: iso(s.queued_at) || new Date().toISOString(), status: normalizeStatus(s.status, readiness.ready ? 'queued' : 'error'), requested_by: normalizeRequestedBy(s.requested_by, s), validation_profile: token(s.validation_profile, 'stage4_lao_source_validation'), priority: integer(s.priority, 100), readiness, review_result: s.review_result || null, trace: serializable(s.trace), timeline: normalizeTimeline(s.timeline), reviewed_at: iso(s.reviewed_at), created_at: iso(s.created_at) || iso(s.queued_at) || new Date().toISOString(), updated_at: iso(s.updated_at) || iso(s.queued_at) || new Date().toISOString() }; }
function applyDuplicatePolicy(item, existing, allow) { const duplicate = (Array.isArray(existing) ? existing : []).find((x) => x && x.queue_key === item.queue_key); if (!duplicate || allow) return item; return serializeItem(Object.assign({}, item, { status: 'duplicate_skipped', duplicate_of: duplicate.validation_queue_id || null, duplicate_queue_key: item.queue_key })); }
function createValidationQueueKey(c) { return `lvq_key_${hash([c.project_id, c.target_type, unique(c.source_unit_ids).sort().join(','), c.record_batch_id, c.validation_profile].join('|')).slice(0, 32)}`; }
function createValidationQueueId(c) { return `${token(c.id_hint, 'lvq')}_${hash([c.queue_key, c.queued_at, crypto.randomBytes(8).toString('hex')].join('|')).slice(0, 24)}`; }
function normalizeReviewResult(r) { const s = asObject(r); const errors = Array.isArray(s.errors) ? s.errors : []; const warnings = Array.isArray(s.warnings) ? s.warnings : []; return { object_type: 'LAO_VALIDATION_REVIEW_RESULT', status: token(s.status || s.validation_status, errors.length ? 'failed' : warnings.length ? 'warning' : 'passed'), ok: s.ok !== false && errors.length === 0, report_id: nullable(s.report_id || s.validation_report_id || s.id), errors, warnings, summary: serializable(s.summary), reviewed_at: iso(s.reviewed_at) || new Date().toISOString() }; }
function mapReviewStatus(status) { const s = token(status, 'reviewed'); if (['pass', 'passed', 'green'].includes(s)) return 'passed'; if (['warning', 'yellow'].includes(s)) return 'warning'; if (['fail', 'failed', 'red'].includes(s)) return 'failed'; if (s === 'error') return 'error'; return 'reviewed'; }
function normalizeOptions(options) { const s = asObject(options); return { project_id: nullable(s.project_id), requested_by: normalizeRequestedBy(s.requested_by, s), validation_profile: token(s.validation_profile, 'stage4_lao_source_validation'), priority: integer(s.priority, 100), existing_items: Array.isArray(s.existing_items) ? s.existing_items : Array.isArray(s.existingItems) ? s.existingItems : [], allow_duplicate: Boolean(s.allow_duplicate), queued_at: s.queued_at, trace: serializable(s.trace) }; }
function normalizeBatch(batch) { const s = asObject(batch); const units = normalizeUnits(s.source_units || s.sourceUnits); return { record_batch_id: nullable(s.record_batch_id || s.recordBatchId || s.id), project_id: nullable(s.project_id), purpose: s.purpose || '', status: nullable(s.status), source_count: integer(s.source_count, units.length), source_units: units, recorded_at: iso(s.recorded_at), saved_path: s.saved_path || null }; }
function summarizeBatch(batch) { const b = normalizeBatch(batch); return b.record_batch_id ? b : {}; }
function normalizeUnits(value) { return (Array.isArray(value) ? value : value ? [value] : []).filter((v) => v && typeof v === 'object').map((u) => ({ object_type: 'SOURCE_UNIT', source_unit_id: token(u.source_unit_id || u.sourceUnitId || u.id, ''), project_id: nullable(u.project_id), slot_id: nullable(u.slot_id), prompt_id: nullable(u.prompt_id), taeo_output_id: nullable(u.taeo_output_id), worker_output_id: nullable(u.worker_output_id), path: pathLike(u.path), language: nullable(u.language), validation_status: nullable(u.validation_status), source_unit_status: nullable(u.source_unit_status) })); }
function normalizeRequestedBy(value, fallback) { const s = asObject(value); const f = asObject(fallback); return { source: nullable(firstDefined(s.source, f.source, 'PANEL')), actor_id: nullable(firstDefined(s.actor_id, f.actor_id)), worker_id: nullable(firstDefined(s.worker_id, f.worker_id)), commander_id: nullable(firstDefined(s.commander_id, f.commander_id)), request_id: nullable(firstDefined(s.request_id, f.request_id)), route: nullable(firstDefined(s.route, f.route, 'LAO_RECORD')) }; }
function normalizeStatus(value, fallback) { return Object.values(LAO_VALIDATION_QUEUE_STATUS).includes(value) ? value : fallback; }
function issue(severity, code, message, details) { return { severity, code, message, details }; }
function normalizeTimeline(value, fallback) { const out = (Array.isArray(value) ? value : []).filter((v) => v && typeof v === 'object'); if (!out.length && fallback) out.push(fallback); return out; }
function asObject(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function serializable(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) return {}; return JSON.parse(JSON.stringify(value)); }
function firstValue(list, field) { for (const x of Array.isArray(list) ? list : []) if (x && x[field]) return x[field]; return null; }
function flatten() { const out = []; for (const arg of arguments) { if (Array.isArray(arg)) out.push(...arg); else if (arg !== undefined && arg !== null) out.push(arg); } return out; }
function unique(values) { return Array.from(new Set((Array.isArray(values) ? values : []).map((v) => String(v || '').trim()).filter(Boolean))); }
function duplicates(values) { const seen = new Set(); const dup = new Set(); for (const v of Array.isArray(values) ? values : []) { const s = String(v || '').trim(); if (!s) continue; if (seen.has(s)) dup.add(s); seen.add(s); } return Array.from(dup); }
function inc(target, key) { target[key || 'unknown'] = (target[key || 'unknown'] || 0) + 1; }
function push(target, value) { if (value) target.push(value); }
function token(value, fallback) { const raw = value === null || value === undefined ? '' : String(value).trim(); return raw ? raw.replace(/\s+/g, '_') : fallback; }
function nullable(value) { const t = token(value, ''); return t || null; }
function pathLike(value) { return token(value, '').replace(/\\/g, '/').replace(/[\/]+/g, '/').replace(/^\.\//, ''); }
function iso(value) { const raw = value === null || value === undefined ? '' : String(value).trim(); if (!raw) return null; const parsed = Date.parse(raw); return Number.isNaN(parsed) ? null : new Date(parsed).toISOString(); }
function integer(value, fallback) { const number = Number(value); return Number.isInteger(number) ? number : fallback; }
function firstDefined() { for (let i = 0; i < arguments.length; i += 1) if (arguments[i] !== undefined && arguments[i] !== null) return arguments[i]; return undefined; }
function hash(value) { return crypto.createHash('sha256').update(String(value || '')).digest('hex'); }

module.exports = { LAO_VALIDATION_QUEUE_STATUS, createLaoValidationQueueItem, queueSourceUnitsForValidation, queueLaoRecordBatchForValidation, markValidationQueueItemReviewed, summarizeLaoValidationQueue };