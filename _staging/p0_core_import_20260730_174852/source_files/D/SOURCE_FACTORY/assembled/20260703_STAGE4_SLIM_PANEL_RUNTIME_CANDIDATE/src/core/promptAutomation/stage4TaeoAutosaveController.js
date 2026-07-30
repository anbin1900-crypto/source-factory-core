'use strict';

const crypto = require('crypto');

const AUTOSAVE_DECISION_STATUS = Object.freeze({
  SAVE_REQUIRED: 'save_required',
  DUPLICATE_SKIPPED: 'duplicate_skipped',
  HOLD: 'hold',
  ERROR: 'error',
});

const AUTOSAVE_REQUEST_STATUS = Object.freeze({
  READY: 'ready',
  NOT_CREATED: 'not_created',
});

const DEFAULT_POLICY = Object.freeze({
  enabled: true,
  requirePromptLog: true,
  requireResponseLog: true,
  requireCaptureResult: true,
  requireStableResponse: false,
  blockNextPromptOnError: true,
  blockNextPromptOnHold: true,
  blockNextPromptOnSaveRequired: false,
  duplicateCheckEnabled: true,
  defaultSaveReason: 'taeo_raw_output_autosave',
  autoSaveTarget: '{PROJECT_DATA}/records/taeo/raw_outputs/',
});

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

function normalizeBoolean(value, fallback) {
  if (typeof value === 'boolean') {
    return value;
  }

  return fallback;
}

function createSafeId(prefix, seed) {
  const safePrefix = normalizeString(prefix, 'id');
  const safeSeed = normalizeString(seed, nowIsoString()).replace(/[^0-9A-Za-z]/g, '');
  return `${safePrefix}_${safeSeed || Date.now()}`;
}

function createContentHashCandidate(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const explicit = normalizeNullableString(source.content_hash_candidate);

  if (explicit) {
    return explicit;
  }

  const hashPayload = JSON.stringify({
    project_id: normalizeString(source.project_id, 'unknown_project'),
    slot_id: normalizeString(source.slot_id, 'unknown_slot'),
    prompt_id: normalizeString(source.prompt_id, 'unknown_prompt'),
    taeo_output_id: normalizeString(source.taeo_output_id, 'unknown_taeo_output'),
    raw_prompt_text: normalizeString(source.raw_prompt_text, ''),
    raw_response_text: normalizeString(source.raw_response_text, ''),
    captured_text: normalizeString(source.captured_text, ''),
  });

  return crypto.createHash('sha256').update(hashPayload, 'utf8').digest('hex');
}

function normalizePolicy(policy) {
  const source = normalizePlainObject(policy);
  const slotPolicies = normalizePlainObject(source.slotPolicies);
  const projectPolicies = normalizePlainObject(source.projectPolicies);

  return Object.freeze(Object.assign({}, DEFAULT_POLICY, source, {
    enabled: normalizeBoolean(source.enabled, DEFAULT_POLICY.enabled),
    requirePromptLog: normalizeBoolean(source.requirePromptLog, DEFAULT_POLICY.requirePromptLog),
    requireResponseLog: normalizeBoolean(source.requireResponseLog, DEFAULT_POLICY.requireResponseLog),
    requireCaptureResult: normalizeBoolean(source.requireCaptureResult, DEFAULT_POLICY.requireCaptureResult),
    requireStableResponse: normalizeBoolean(source.requireStableResponse, DEFAULT_POLICY.requireStableResponse),
    blockNextPromptOnError: normalizeBoolean(source.blockNextPromptOnError, DEFAULT_POLICY.blockNextPromptOnError),
    blockNextPromptOnHold: normalizeBoolean(source.blockNextPromptOnHold, DEFAULT_POLICY.blockNextPromptOnHold),
    blockNextPromptOnSaveRequired: normalizeBoolean(
      source.blockNextPromptOnSaveRequired,
      DEFAULT_POLICY.blockNextPromptOnSaveRequired
    ),
    duplicateCheckEnabled: normalizeBoolean(source.duplicateCheckEnabled, DEFAULT_POLICY.duplicateCheckEnabled),
    defaultSaveReason: normalizeString(source.defaultSaveReason, DEFAULT_POLICY.defaultSaveReason),
    autoSaveTarget: normalizeString(source.autoSaveTarget, DEFAULT_POLICY.autoSaveTarget),
    slotPolicies,
    projectPolicies,
  }));
}

function resolveEffectivePolicy(context, policy) {
  const basePolicy = normalizePolicy(policy);
  const source = normalizePlainObject(context);
  const projectId = normalizeString(source.project_id, 'unknown_project');
  const slotId = normalizeString(source.slot_id, 'unknown_slot');

  const projectPolicy = normalizePlainObject(basePolicy.projectPolicies[projectId]);
  const slotPolicy = normalizePlainObject(basePolicy.slotPolicies[slotId]);

  return normalizePolicy(Object.assign({}, basePolicy, projectPolicy, slotPolicy, {
    projectPolicies: basePolicy.projectPolicies,
    slotPolicies: basePolicy.slotPolicies,
  }));
}

function extractPromptLog(context) {
  const source = normalizePlainObject(context);
  return normalizePlainObject(source.prompt_log || source.promptLog);
}

function extractResponseLog(context) {
  const source = normalizePlainObject(context);
  return normalizePlainObject(source.response_log || source.responseLog);
}

function extractCaptureResult(context) {
  const source = normalizePlainObject(context);
  return normalizePlainObject(source.capture_result || source.captureResult);
}

function extractExistingRecords(context) {
  const source = normalizePlainObject(context);
  return normalizeArray(source.existing_records || source.records || source.autosave_records);
}

function extractStability(context, responseLog) {
  const source = normalizePlainObject(context);
  return normalizePlainObject(source.stability || responseLog.stability);
}

function getRawResponseText(context, responseLog, captureResult) {
  const source = normalizePlainObject(context);
  return normalizeString(
    source.raw_response_text || responseLog.raw_text || captureResult.raw_text,
    ''
  );
}

function getRawPromptText(context, promptLog) {
  const source = normalizePlainObject(context);
  return normalizeString(
    source.raw_prompt_text || promptLog.raw_prompt || promptLog.prompt_text,
    ''
  );
}

function hasRequiredObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0);
}

function isStableEnough(stability, responseLog, policy) {
  if (!policy.requireStableResponse) {
    return true;
  }

  if (stability && stability.is_stable === true) {
    return true;
  }

  const responseStatus = normalizeString(responseLog.response_status, '');
  return responseStatus === 'stable';
}

function findDuplicateRecord(contentHashCandidate, records) {
  if (!contentHashCandidate) {
    return null;
  }

  return records.find((record) => {
    const safeRecord = normalizePlainObject(record);
    return normalizeNullableString(safeRecord.content_hash_candidate) === contentHashCandidate;
  }) || null;
}

function createDecisionBase(context, policy) {
  const source = normalizePlainObject(context);
  const promptLog = extractPromptLog(source);
  const responseLog = extractResponseLog(source);
  const captureResult = extractCaptureResult(source);
  const rawPromptText = getRawPromptText(source, promptLog);
  const rawResponseText = getRawResponseText(source, responseLog, captureResult);
  const createdAt = nowIsoString();

  const projectId = normalizeString(
    source.project_id || promptLog.project_id || responseLog.project_id || captureResult.project_id,
    'unknown_project'
  );
  const panelId = normalizeString(
    source.panel_id || promptLog.panel_id || responseLog.panel_id || captureResult.panel_id,
    'unknown_panel'
  );
  const slotId = normalizeString(
    source.slot_id || promptLog.slot_id || responseLog.slot_id || captureResult.slot_id,
    'unknown_slot'
  );
  const promptId = normalizeString(
    source.prompt_id || promptLog.prompt_id || responseLog.prompt_id || captureResult.prompt_id,
    'unknown_prompt'
  );
  const taeoOutputId = normalizeString(
    source.taeo_output_id || responseLog.taeo_output_id || captureResult.taeo_output_id,
    'unknown_taeo_output'
  );

  const contentHashCandidate = createContentHashCandidate({
    project_id: projectId,
    slot_id: slotId,
    prompt_id: promptId,
    taeo_output_id: taeoOutputId,
    raw_prompt_text: rawPromptText,
    raw_response_text: rawResponseText,
    captured_text: normalizeString(captureResult.raw_text, ''),
    content_hash_candidate: source.content_hash_candidate,
  });

  return {
    schema: 'stage4.taeo.autosave_decision.v1',
    autosave_decision_id: createSafeId('taeo_autosave_decision', `${slotId}_${promptId}_${taeoOutputId}_${createdAt}`),
    project_id: projectId,
    panel_id: panelId,
    slot_id: slotId,
    prompt_id: promptId,
    taeo_output_id: taeoOutputId,
    prompt_log_ref: normalizeNullableString(source.prompt_log_ref || promptLog.prompt_id),
    response_log_ref: normalizeNullableString(source.response_log_ref || responseLog.taeo_output_id),
    capture_request_id: normalizeNullableString(source.capture_request_id || captureResult.capture_request_id),
    content_hash_candidate: contentHashCandidate,
    save_reason: normalizeString(source.save_reason, policy.defaultSaveReason),
    auto_save_target: normalizeString(source.auto_save_target || policy.autoSaveTarget, policy.autoSaveTarget),
    created_at: createdAt,
    blocking_next_prompt: false,
    reasons: [],
    details: {
      has_prompt_log: hasRequiredObject(promptLog),
      has_response_log: hasRequiredObject(responseLog),
      has_capture_result: hasRequiredObject(captureResult),
      raw_prompt_length: rawPromptText.length,
      raw_response_length: rawResponseText.length,
      policy: {
        enabled: policy.enabled,
        requirePromptLog: policy.requirePromptLog,
        requireResponseLog: policy.requireResponseLog,
        requireCaptureResult: policy.requireCaptureResult,
        requireStableResponse: policy.requireStableResponse,
        duplicateCheckEnabled: policy.duplicateCheckEnabled,
      },
    },
  };
}

function buildAutosaveDecision(context, policy) {
  const effectivePolicy = resolveEffectivePolicy(context, policy);
  const source = normalizePlainObject(context);
  const promptLog = extractPromptLog(source);
  const responseLog = extractResponseLog(source);
  const captureResult = extractCaptureResult(source);
  const stability = extractStability(source, responseLog);
  const records = extractExistingRecords(source);
  const base = createDecisionBase(source, effectivePolicy);

  if (!effectivePolicy.enabled) {
    base.status = AUTOSAVE_DECISION_STATUS.HOLD;
    base.reasons.push('autosave_policy_disabled');
    base.blocking_next_prompt = false;
    return Object.freeze(base);
  }

  if (effectivePolicy.requirePromptLog && !hasRequiredObject(promptLog)) {
    base.status = AUTOSAVE_DECISION_STATUS.ERROR;
    base.reasons.push('prompt_log_required_but_missing');
    base.blocking_next_prompt = effectivePolicy.blockNextPromptOnError;
    return Object.freeze(base);
  }

  if (effectivePolicy.requireResponseLog && !hasRequiredObject(responseLog)) {
    base.status = AUTOSAVE_DECISION_STATUS.ERROR;
    base.reasons.push('response_log_required_but_missing');
    base.blocking_next_prompt = effectivePolicy.blockNextPromptOnError;
    return Object.freeze(base);
  }

  if (effectivePolicy.requireCaptureResult && !hasRequiredObject(captureResult)) {
    base.status = AUTOSAVE_DECISION_STATUS.HOLD;
    base.reasons.push('capture_result_required_but_missing');
    base.blocking_next_prompt = effectivePolicy.blockNextPromptOnHold;
    return Object.freeze(base);
  }

  const rawResponseText = getRawResponseText(source, responseLog, captureResult);
  if (!rawResponseText) {
    base.status = AUTOSAVE_DECISION_STATUS.HOLD;
    base.reasons.push('raw_response_text_empty');
    base.blocking_next_prompt = effectivePolicy.blockNextPromptOnHold;
    return Object.freeze(base);
  }

  if (!isStableEnough(stability, responseLog, effectivePolicy)) {
    base.status = AUTOSAVE_DECISION_STATUS.HOLD;
    base.reasons.push('response_stability_required_but_not_confirmed');
    base.blocking_next_prompt = effectivePolicy.blockNextPromptOnHold;
    base.details.stability = stability;
    return Object.freeze(base);
  }

  const duplicateRecord = effectivePolicy.duplicateCheckEnabled
    ? findDuplicateRecord(base.content_hash_candidate, records)
    : null;

  if (duplicateRecord) {
    base.status = AUTOSAVE_DECISION_STATUS.DUPLICATE_SKIPPED;
    base.reasons.push('duplicate_content_hash_candidate_found');
    base.blocking_next_prompt = false;
    base.details.duplicate_record_id = normalizeNullableString(duplicateRecord.autosave_record_id);
    return Object.freeze(base);
  }

  base.status = AUTOSAVE_DECISION_STATUS.SAVE_REQUIRED;
  base.reasons.push('autosave_required_for_new_taeo_raw_output');
  base.blocking_next_prompt = effectivePolicy.blockNextPromptOnSaveRequired;
  return Object.freeze(base);
}

function buildAutosaveRequest(decision) {
  const source = normalizePlainObject(decision);

  if (source.status !== AUTOSAVE_DECISION_STATUS.SAVE_REQUIRED) {
    return Object.freeze({
      schema: 'stage4.taeo.autosave_request.v1',
      request_status: AUTOSAVE_REQUEST_STATUS.NOT_CREATED,
      reason: 'decision_status_is_not_save_required',
      decision_status: normalizeString(source.status, 'unknown'),
      autosave_decision_id: normalizeNullableString(source.autosave_decision_id),
      created_at: nowIsoString(),
    });
  }

  const createdAt = nowIsoString();

  return Object.freeze({
    schema: 'stage4.taeo.autosave_request.v1',
    request_status: AUTOSAVE_REQUEST_STATUS.READY,
    autosave_request_id: createSafeId(
      'taeo_autosave_request',
      `${source.slot_id || ''}_${source.prompt_id || ''}_${source.taeo_output_id || ''}_${createdAt}`
    ),
    autosave_decision_id: normalizeString(source.autosave_decision_id, 'unknown_autosave_decision'),
    project_id: normalizeString(source.project_id, 'unknown_project'),
    panel_id: normalizeString(source.panel_id, 'unknown_panel'),
    slot_id: normalizeString(source.slot_id, 'unknown_slot'),
    prompt_id: normalizeString(source.prompt_id, 'unknown_prompt'),
    taeo_output_id: normalizeString(source.taeo_output_id, 'unknown_taeo_output'),
    prompt_log_ref: normalizeNullableString(source.prompt_log_ref),
    response_log_ref: normalizeNullableString(source.response_log_ref),
    capture_request_id: normalizeNullableString(source.capture_request_id),
    content_hash_candidate: normalizeString(source.content_hash_candidate, ''),
    save_reason: normalizeString(source.save_reason, DEFAULT_POLICY.defaultSaveReason),
    target_dir: normalizeString(source.auto_save_target, DEFAULT_POLICY.autoSaveTarget),
    write_mode: 'request_only_no_file_write',
    created_at: createdAt,
    payload: {
      decision: {
        status: source.status,
        reasons: normalizeArray(source.reasons),
        blocking_next_prompt: Boolean(source.blocking_next_prompt),
      },
    },
  });
}

function shouldBlockNextPrompt(decision) {
  const source = normalizePlainObject(decision);
  return Boolean(source.blocking_next_prompt);
}

function summarizeAutosaveState(records) {
  const safeRecords = normalizeArray(records);
  const summary = {
    schema: 'stage4.taeo.autosave_summary.v1',
    total: safeRecords.length,
    created: 0,
    requested: 0,
    committed: 0,
    skipped: 0,
    failed: 0,
    unknown: 0,
    latest_record_id: null,
    latest_at: null,
  };

  safeRecords.forEach((record) => {
    const safeRecord = normalizePlainObject(record);
    const state = normalizeString(safeRecord.saved_state || safeRecord.status, 'unknown');

    if (Object.prototype.hasOwnProperty.call(summary, state)) {
      summary[state] += 1;
    } else {
      summary.unknown += 1;
    }

    const candidateTime = normalizeNullableString(
      safeRecord.committed_at ||
      safeRecord.requested_at ||
      safeRecord.skipped_at ||
      safeRecord.failed_at ||
      safeRecord.created_at
    );

    if (candidateTime && (!summary.latest_at || Date.parse(candidateTime) >= Date.parse(summary.latest_at))) {
      summary.latest_at = candidateTime;
      summary.latest_record_id = normalizeNullableString(safeRecord.autosave_record_id);
    }
  });

  return Object.freeze(summary);
}

function createTaeoAutosaveController(policy) {
  const controllerPolicy = normalizePolicy(policy);

  return Object.freeze({
    policy: controllerPolicy,
    buildAutosaveDecision(context) {
      return buildAutosaveDecision(context, controllerPolicy);
    },
    buildAutosaveRequest(decision) {
      return buildAutosaveRequest(decision);
    },
    shouldBlockNextPrompt(decision) {
      return shouldBlockNextPrompt(decision);
    },
    summarizeAutosaveState(records) {
      return summarizeAutosaveState(records);
    },
  });
}

module.exports = {
  AUTOSAVE_DECISION_STATUS,
  AUTOSAVE_REQUEST_STATUS,
  createTaeoAutosaveController,
  buildAutosaveDecision,
  buildAutosaveRequest,
  shouldBlockNextPrompt,
  summarizeAutosaveState,
};