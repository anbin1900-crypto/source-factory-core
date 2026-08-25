'use strict';

/**
 * Project Panel Identity Helper
 * Standalone helper for Source Factory Stage 4 Project Panel identity.
 *
 * This helper does not connect itself to renderer, preload, IPC, queue,
 * autosave, collector, gate/report, clipboard/export, Lao command parser,
 * or runtime flow.
 *
 * Core rule:
 * One Project Panel = one independent project context.
 */

const PROJECT_PANEL_IDENTITY_VERSION = '1.0.1';

const PROJECT_PANEL_REQUIRED_IDENTITY_FIELDS = Object.freeze([
  'project_id',
  'project_name',
  'panel_id',
  'panel_instance_id',
  'commander_window_ids',
  'worker_slot_ids',
  'active_worker_count',
  'taeo_window_id',
  'rao_window_id',
  'tara_window_id',
  'stage4_baseline_id',
  'last_gate_status',
  'last_next_action'
]);

const PROJECT_PANEL_DEFAULT_STAGE4_BASELINE_ID = 'STAGE4_PROJECT_PANEL_IDENTITY_HELPER_STANDALONE';

const PROJECT_PANEL_LEGACY_FALLBACK = Object.freeze({
  legacy_project_name: 'Legacy Project',
  legacy_project_id_prefix: 'sf_project_legacy',
  legacy_panel_id_prefix: 'sf_panel_legacy',
  legacy_panel_instance_id_prefix: 'sf_panel_instance_legacy'
});

function toIsoTimestamp(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date();
  return date.toISOString();
}

function toCompactTimestamp(dateValue) {
  return toIsoTimestamp(dateValue).replace(/[-:.TZ]/g, '').slice(0, 14);
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function firstValue(primary, secondary, fallback) {
  if (hasValue(primary)) return primary;
  if (hasValue(secondary)) return secondary;
  return fallback;
}

function sanitizeIdToken(value, fallback) {
  const source = value === undefined || value === null ? '' : String(value);
  const normalized = source
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized || fallback;
}

function createRandomToken(length) {
  const safeLength = Number.isFinite(Number(length)) && Number(length) > 0 ? Number(length) : 6;
  return Math.random().toString(36).slice(2, 2 + safeLength).padEnd(safeLength, '0');
}

function ensureArray(value) {
  if (Array.isArray(value)) {
    return value
      .filter(function filterNonEmpty(item) {
        return item !== undefined && item !== null && String(item).trim() !== '';
      })
      .map(function mapString(item) {
        return String(item).trim();
      });
  }

  if (!hasValue(value)) {
    return [];
  }

  return [String(value).trim()];
}

function uniqueArray(values) {
  const seen = Object.create(null);
  return ensureArray(values).filter(function filterUnique(value) {
    if (seen[value]) {
      return false;
    }
    seen[value] = true;
    return true;
  });
}

function normalizeCount(value, fallback) {
  const numberValue = Number(value);
  if (Number.isFinite(numberValue) && numberValue >= 0) {
    return Math.floor(numberValue);
  }
  return fallback;
}

function hasOwn(objectValue, key) {
  return Object.prototype.hasOwnProperty.call(objectValue, key);
}

function createProjectPanelId(projectName, options) {
  const safeOptions = options && typeof options === 'object' ? options : {};
  const timestamp = safeOptions.timestamp || toCompactTimestamp(safeOptions.date);
  const slug = sanitizeIdToken(projectName || safeOptions.project_name, 'project');
  const random = safeOptions.random || createRandomToken(6);

  return 'sf_project_' + timestamp + '_' + slug + '_' + random;
}

function createPanelInstanceId(projectId, options) {
  const safeOptions = options && typeof options === 'object' ? options : {};
  const timestamp = safeOptions.timestamp || toCompactTimestamp(safeOptions.date);
  const projectToken = sanitizeIdToken(projectId, 'project');
  const random = safeOptions.random || createRandomToken(6);

  return 'sf_panel_instance_' + timestamp + '_' + projectToken + '_' + random;
}

function createPanelId(projectId, panelIndex) {
  const projectToken = sanitizeIdToken(projectId, 'project');
  const indexNumber = normalizeCount(panelIndex, 1);
  const indexToken = String(indexNumber || 1).padStart(2, '0');

  return 'sf_panel_' + projectToken + '_' + indexToken;
}

function createWindowId(prefix, panelInstanceId) {
  const safePrefix = sanitizeIdToken(prefix, 'window');
  const safePanelInstanceId = sanitizeIdToken(panelInstanceId, 'panel_instance');
  return 'sf_' + safePrefix + '_' + safePanelInstanceId;
}

function normalizeProjectPanelIdentity(input) {
  const source = input && typeof input === 'object' ? input : {};
  const now = toIsoTimestamp();

  const projectName = firstValue(source.project_name, source.projectName, PROJECT_PANEL_LEGACY_FALLBACK.legacy_project_name);
  const projectId = firstValue(source.project_id, source.projectId, createProjectPanelId(projectName));
  const panelId = firstValue(source.panel_id, source.panelId, createPanelId(projectId, firstValue(source.panel_index, source.panelIndex, 1)));
  const panelInstanceId = firstValue(source.panel_instance_id, source.panelInstanceId, createPanelInstanceId(projectId));

  const commanderWindowIds = uniqueArray(source.commander_window_ids || source.commanderWindowIds);
  const workerSlotIds = uniqueArray(source.worker_slot_ids || source.workerSlotIds);
  const activeWorkerCount = normalizeCount(
    source.active_worker_count === undefined ? source.activeWorkerCount : source.active_worker_count,
    workerSlotIds.length
  );

  return {
    project_id: String(projectId),
    project_name: String(projectName),
    panel_id: String(panelId),
    panel_instance_id: String(panelInstanceId),
    commander_window_ids: commanderWindowIds,
    worker_slot_ids: workerSlotIds,
    active_worker_count: activeWorkerCount,
    taeo_window_id: String(firstValue(source.taeo_window_id, source.taeoWindowId, createWindowId('taeo', panelInstanceId))),
    rao_window_id: String(firstValue(source.rao_window_id, source.raoWindowId, createWindowId('rao', panelInstanceId))),
    tara_window_id: String(firstValue(source.tara_window_id, source.taraWindowId, createWindowId('tara', panelInstanceId))),
    stage4_baseline_id: String(firstValue(source.stage4_baseline_id, source.stage4BaselineId, PROJECT_PANEL_DEFAULT_STAGE4_BASELINE_ID)),
    last_gate_status: source.last_gate_status === undefined ? null : source.last_gate_status,
    last_next_action: source.last_next_action === undefined ? null : source.last_next_action,
    identity_version: String(source.identity_version || PROJECT_PANEL_IDENTITY_VERSION),
    created_at: String(source.created_at || now),
    updated_at: String(source.updated_at || now)
  };
}

function createDefaultProjectPanelIdentity(options) {
  const safeOptions = options && typeof options === 'object' ? options : {};

  return normalizeProjectPanelIdentity({
    project_name: safeOptions.project_name || safeOptions.projectName || 'Source Factory Project',
    project_id: safeOptions.project_id || safeOptions.projectId,
    panel_id: safeOptions.panel_id || safeOptions.panelId,
    panel_instance_id: safeOptions.panel_instance_id || safeOptions.panelInstanceId,
    panel_index: safeOptions.panel_index || safeOptions.panelIndex || 1,
    commander_window_ids: safeOptions.commander_window_ids || safeOptions.commanderWindowIds || [],
    worker_slot_ids: safeOptions.worker_slot_ids || safeOptions.workerSlotIds || [],
    active_worker_count: safeOptions.active_worker_count === undefined ? safeOptions.activeWorkerCount : safeOptions.active_worker_count,
    stage4_baseline_id: safeOptions.stage4_baseline_id || safeOptions.stage4BaselineId,
    last_gate_status: safeOptions.last_gate_status === undefined ? null : safeOptions.last_gate_status,
    last_next_action: safeOptions.last_next_action === undefined ? null : safeOptions.last_next_action
  });
}

function isProjectPanelIdentityComplete(identity) {
  if (!identity || typeof identity !== 'object') {
    return false;
  }

  return PROJECT_PANEL_REQUIRED_IDENTITY_FIELDS.every(function requiredFieldExists(field) {
    if (!hasOwn(identity, field)) {
      return false;
    }

    if (field === 'last_gate_status' || field === 'last_next_action') {
      return true;
    }

    if (Array.isArray(identity[field])) {
      return true;
    }

    return identity[field] !== undefined && identity[field] !== null && String(identity[field]).trim() !== '';
  });
}

function attachProjectPanelIdentityToPayload(payload, identity, options) {
  const safePayload = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const safeOptions = options && typeof options === 'object' ? options : {};
  const normalizedIdentity = normalizeProjectPanelIdentity(identity);
  const metadataKey = safeOptions.metadata_key || safeOptions.metadataKey || 'project_panel_identity';

  const result = Object.assign({}, safePayload);

  result.project_id = normalizedIdentity.project_id;
  result.project_name = normalizedIdentity.project_name;
  result.panel_id = normalizedIdentity.panel_id;
  result.panel_instance_id = normalizedIdentity.panel_instance_id;

  if (safeOptions.include_window_ids !== false) {
    result.taeo_window_id = normalizedIdentity.taeo_window_id;
    result.rao_window_id = normalizedIdentity.rao_window_id;
    result.tara_window_id = normalizedIdentity.tara_window_id;
  }

  if (safeOptions.include_full_identity !== false) {
    result[metadataKey] = normalizedIdentity;
  }

  return result;
}

function summarizeProjectPanelIdentity(identity) {
  const normalizedIdentity = normalizeProjectPanelIdentity(identity);

  return {
    identity_version: normalizedIdentity.identity_version,
    project_id: normalizedIdentity.project_id,
    project_name: normalizedIdentity.project_name,
    panel_id: normalizedIdentity.panel_id,
    panel_instance_id: normalizedIdentity.panel_instance_id,
    commander_window_count: normalizedIdentity.commander_window_ids.length,
    worker_slot_count: normalizedIdentity.worker_slot_ids.length,
    active_worker_count: normalizedIdentity.active_worker_count,
    taeo_window_id: normalizedIdentity.taeo_window_id,
    rao_window_id: normalizedIdentity.rao_window_id,
    tara_window_id: normalizedIdentity.tara_window_id,
    stage4_baseline_id: normalizedIdentity.stage4_baseline_id,
    last_gate_status: normalizedIdentity.last_gate_status,
    last_next_action: normalizedIdentity.last_next_action,
    complete: isProjectPanelIdentityComplete(normalizedIdentity)
  };
}

module.exports = {
  PROJECT_PANEL_IDENTITY_VERSION: PROJECT_PANEL_IDENTITY_VERSION,
  PROJECT_PANEL_REQUIRED_IDENTITY_FIELDS: PROJECT_PANEL_REQUIRED_IDENTITY_FIELDS,
  createProjectPanelId: createProjectPanelId,
  createPanelInstanceId: createPanelInstanceId,
  createPanelId: createPanelId,
  createWindowId: createWindowId,
  normalizeProjectPanelIdentity: normalizeProjectPanelIdentity,
  createDefaultProjectPanelIdentity: createDefaultProjectPanelIdentity,
  attachProjectPanelIdentityToPayload: attachProjectPanelIdentityToPayload,
  isProjectPanelIdentityComplete: isProjectPanelIdentityComplete,
  summarizeProjectPanelIdentity: summarizeProjectPanelIdentity
};
