'use strict';

const crypto = require('crypto');

function sha256(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}

function requireText(value, name) {
  const text = String(value == null ? '' : value).trim();
  if (!text) throw new Error(`${name}_REQUIRED`);
  return text;
}

function normalizeHandoff(raw = {}) {
  const binding = raw.binding || raw;
  return Object.freeze({
    role_id: requireText(binding.ROLE_ID || binding.role_id, 'ROLE_ID'),
    context_id: requireText(binding.CONTEXT_ID || binding.context_id, 'CONTEXT_ID'),
    context_name: requireText(binding.CONTEXT_NAME || binding.context_name, 'CONTEXT_NAME'),
    page_id: requireText(binding.PAGE_ID || binding.page_id, 'PAGE_ID'),
    last_seen_at: requireText(binding.LAST_SEEN_AT || binding.last_seen_at, 'LAST_SEEN_AT'),
    binding_method: requireText(binding.binding_method || raw.binding_method || 'EXISTING_WINDOWS_UI_AUTOMATION', 'BINDING_METHOD'),
  });
}

function normalizeCommand(raw = {}) {
  const commandId = requireText(raw.command_id, 'COMMAND_ID');
  const replyToken = requireText(raw.expected_reply_contains || raw.reply_token, 'EXPECTED_REPLY_CONTAINS');
  const message = requireText(raw.message, 'MESSAGE');
  if (!message.includes(commandId)) throw new Error('MESSAGE_COMMAND_ID_MISMATCH');
  if (!message.includes(replyToken)) throw new Error('MESSAGE_REPLY_TOKEN_MISSING');
  return Object.freeze({
    command_id: commandId,
    message,
    message_marker: requireText(raw.message_marker || `COMMAND_ID=${commandId}`, 'MESSAGE_MARKER'),
    expected_reply_contains: replyToken,
    command_type: requireText(raw.command_type || 'C_MODE_COMMAND', 'COMMAND_TYPE'),
  });
}

function buildLiveInput({ cycleId, handoff, command, contextUrl, requireRoleMarker = false }) {
  const h = normalizeHandoff(handoff);
  const c = normalizeCommand(command);
  const input = {
    schema_version: 'D3_C3_REUSABLE_LIVE_INPUT_V1',
    cycle_id: requireText(cycleId, 'CYCLE_ID'),
    command_id: c.command_id,
    command_type: c.command_type,
    context_id: h.context_id,
    context_name: h.context_name,
    page_id: h.page_id,
    context_url: requireText(contextUrl, 'CONTEXT_URL'),
    message: c.message,
    message_marker: c.message_marker,
    expected_reply_contains: c.expected_reply_contains,
    binding_method: 'EXACT_CONTEXT_URL_AND_UIA_PAGE_ID_REVALIDATION_NO_ALTERNATE_CONTEXT',
    allow_d2_receipt_binding_after_refresh: true,
    visibility_polls: 40,
    reply_polls: 600,
    stable_polls: 3,
    return_target: 'D-1_OR_SUCCESSOR_AND_D-6',
    production: false,
  };
  if (requireRoleMarker) input.role_marker = `ROLE=${h.role_id}`;
  return Object.freeze(input);
}

function eventIndex(events, type) {
  return events.findIndex((event) => event && event.event_type === type);
}

function validateLiveResult({ input, result }) {
  if (!result || typeof result !== 'object') throw new Error('RESULT_REQUIRED');
  const reasons = [];
  if (result.command_id !== input.command_id) reasons.push('COMMAND_ID_MISMATCH');
  if (result.context_id !== input.context_id) reasons.push('CONTEXT_ID_MISMATCH');
  if (!result.page_id) reasons.push('PAGE_ID_MISSING');
  if (result.page_id !== input.page_id && result.d2_observed_page_id !== input.page_id) reasons.push('PAGE_LINEAGE_MISMATCH');
  if (result.message_sent !== true) reasons.push('MESSAGE_NOT_VISIBLE_SENT');
  if (result.assistant_reply_completed !== true) reasons.push('ASSISTANT_REPLY_NOT_COMPLETED');
  const reply = String(result.assistant_reply_raw || '');
  if (!reply.includes(input.expected_reply_contains)) reasons.push('EXPECTED_REPLY_TOKEN_MISSING');
  if (reply.includes(input.message_marker)) reasons.push('USER_MESSAGE_ECHO_AS_REPLY');
  if (result.assistant_reply_sha256 !== sha256(reply)) reasons.push('ASSISTANT_REPLY_SHA256_MISMATCH');
  const events = Array.isArray(result.events) ? result.events : [];
  const submitted = eventIndex(events, 'DISPATCH_SUBMITTED');
  const sent = eventIndex(events, 'MESSAGE_SENT');
  const replyCollected = eventIndex(events, 'REPLY_COLLECTED');
  const returnReady = eventIndex(events, 'RESULT_RETURN_READY');
  if (submitted < 0 || sent < 0 || replyCollected < 0 || returnReady < 0) reasons.push('EVENT_SEQUENCE_INCOMPLETE');
  if (!(submitted < sent && sent < replyCollected && replyCollected < returnReady)) reasons.push('EVENT_SEQUENCE_INVALID');
  return Object.freeze({
    accepted: reasons.length === 0,
    reasons,
    command_id: input.command_id,
    context_id: input.context_id,
    page_id: result.page_id || null,
    assistant_reply_raw: reply || null,
    assistant_reply_sha256: reply ? sha256(reply) : null,
  });
}

class CommandIdempotencyLedger {
  constructor(initial = []) {
    this.completed = new Map();
    for (const row of initial) {
      if (row && row.command_id) this.completed.set(String(row.command_id), Object.freeze({ ...row }));
    }
  }

  beforeDispatch(command) {
    const c = normalizeCommand(command);
    const existing = this.completed.get(c.command_id);
    if (!existing) return Object.freeze({ allowed: true, duplicate: false, command_id: c.command_id });
    return Object.freeze({
      allowed: false,
      duplicate: true,
      command_id: c.command_id,
      duplicate_send_count: 0,
      duplicate_result_return_count: 0,
      existing_result: existing,
      terminal: 'DUPLICATE_COMMAND_ID_SUPPRESSED',
    });
  }

  recordAccepted(acceptedResult) {
    if (!acceptedResult || acceptedResult.accepted !== true) throw new Error('ONLY_ACCEPTED_RESULT_CAN_BE_RECORDED');
    const commandId = requireText(acceptedResult.command_id, 'COMMAND_ID');
    if (this.completed.has(commandId)) throw new Error('DUPLICATE_ACCEPTED_RESULT_RECORD');
    const frozen = Object.freeze({ ...acceptedResult });
    this.completed.set(commandId, frozen);
    return frozen;
  }
}

function classifyNegativeResult({ input, result }) {
  const terminal = String(result?.terminal || '');
  const blocker = String(result?.blocker_code || '');
  const duplicateSuppressed = terminal.includes('BLOCKED') && blocker === 'EXPECTED_REPLY_MARKER_PRESENT_BEFORE_DISPATCH' && result?.message_sent === false;
  return Object.freeze({
    duplicate_suppressed: duplicateSuppressed,
    duplicate_send_count: duplicateSuppressed ? 0 : null,
    duplicate_result_return_count: duplicateSuppressed ? 0 : null,
    command_id_match: String(result?.command_id || '') === String(input?.command_id || ''),
    context_id_match: String(result?.context_id || '') === String(input?.context_id || ''),
    page_id_match: String(result?.page_id || '') === String(input?.page_id || ''),
  });
}

module.exports = {
  sha256,
  normalizeHandoff,
  normalizeCommand,
  buildLiveInput,
  validateLiveResult,
  CommandIdempotencyLedger,
  classifyNegativeResult,
};
