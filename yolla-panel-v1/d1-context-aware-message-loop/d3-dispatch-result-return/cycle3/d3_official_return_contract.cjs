'use strict';

const crypto = require('node:crypto');

function text(value, code) {
  const v = String(value == null ? '' : value).trim();
  if (!v) {
    const e = new Error(code);
    e.code = code;
    throw e;
  }
  return v;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function normalizeDispatch(input = {}) {
  return {
    cycle_id: text(input.cycle_id, 'CYCLE_ID_REQUIRED'),
    command_id: text(input.command_id, 'COMMAND_ID_REQUIRED'),
    context_id: text(input.context_id, 'CONTEXT_ID_REQUIRED'),
    page_id: text(input.page_id, 'PAGE_ID_REQUIRED'),
    recipient_role: text(input.recipient_role || 'D-1_OR_SUCCESSOR', 'RECIPIENT_ROLE_REQUIRED'),
    message: text(input.message, 'MESSAGE_REQUIRED'),
  };
}

function classifyUiResponse(dispatch, ui = {}) {
  return {
    schema_version: 'D3_UI_TRANSPORT_TEST_RESPONSE_V1',
    cycle_id: dispatch.cycle_id,
    command_id: dispatch.command_id,
    context_id: dispatch.context_id,
    page_id: dispatch.page_id,
    message_sent: ui.message_sent === true,
    message_visible_in_conversation: ui.message_visible_in_conversation === true,
    composer_contains_marker: ui.composer_contains_marker === true,
    ui_assistant_reply_raw: String(ui.assistant_reply_raw || ''),
    ui_assistant_reply_sha256: ui.assistant_reply_raw ? sha256(ui.assistant_reply_raw) : null,
    classification: 'UI_TRANSPORT_TEST_RESPONSE_ONLY',
    d1_official_return: false,
  };
}

function validateOfficialReturn(dispatch, publication = {}) {
  const channel = text(publication.channel, 'OFFICIAL_RETURN_CHANNEL_REQUIRED');
  if (!['GITHUB', 'YOLLA_DB'].includes(channel)) {
    const e = new Error('OFFICIAL_RETURN_CHANNEL_INVALID');
    e.code = 'OFFICIAL_RETURN_CHANNEL_INVALID';
    throw e;
  }
  const commandId = text(publication.command_id, 'OFFICIAL_RETURN_COMMAND_ID_REQUIRED');
  const contextId = text(publication.context_id, 'OFFICIAL_RETURN_CONTEXT_ID_REQUIRED');
  const sourceRole = text(publication.source_role, 'OFFICIAL_RETURN_SOURCE_ROLE_REQUIRED');
  const publishedAt = text(publication.published_at, 'OFFICIAL_RETURN_PUBLISHED_AT_REQUIRED');
  const resultOrReply = text(publication.result_or_reply, 'OFFICIAL_RETURN_RESULT_REQUIRED');
  if (commandId !== dispatch.command_id) {
    const e = new Error('OFFICIAL_RETURN_COMMAND_MISMATCH'); e.code = e.message; throw e;
  }
  if (contextId !== dispatch.context_id) {
    const e = new Error('OFFICIAL_RETURN_CONTEXT_MISMATCH'); e.code = e.message; throw e;
  }
  if (!/^D-1(?:_|$)|^D-1_OR_SUCCESSOR$|SUCCESSOR/i.test(sourceRole)) {
    const e = new Error('OFFICIAL_RETURN_SOURCE_ROLE_NOT_D1'); e.code = e.message; throw e;
  }
  return {
    schema_version: 'D3_D1_OFFICIAL_RETURN_RECEIPT_V1',
    cycle_id: dispatch.cycle_id,
    command_id: commandId,
    context_id: contextId,
    page_id: dispatch.page_id,
    source_role: sourceRole,
    channel,
    result_or_reply: resultOrReply,
    result_sha256: sha256(resultOrReply),
    published_at: publishedAt,
    publication_pointer: String(publication.publication_pointer || ''),
    d1_result_return_received: true,
    screen_assistant_reply_authority: false,
  };
}

class D3OfficialReturnCorrelator {
  constructor() {
    this.dispatches = new Map();
    this.officialReturns = new Map();
  }
  registerDispatch(input) {
    const d = normalizeDispatch(input);
    const existing = this.dispatches.get(d.command_id);
    if (existing) {
      const same = JSON.stringify(existing) === JSON.stringify(d);
      if (!same) {
        const e = new Error('DUPLICATE_COMMAND_CONFLICT'); e.code = e.message; throw e;
      }
      return { ...existing, duplicate_suppressed: true };
    }
    this.dispatches.set(d.command_id, d);
    return { ...d, duplicate_suppressed: false };
  }
  acceptUiResponse(commandId, ui) {
    const d = this.dispatches.get(commandId);
    if (!d) { const e = new Error('DISPATCH_NOT_REGISTERED'); e.code = e.message; throw e; }
    return classifyUiResponse(d, ui);
  }
  acceptOfficialReturn(commandId, publication) {
    const d = this.dispatches.get(commandId);
    if (!d) { const e = new Error('DISPATCH_NOT_REGISTERED'); e.code = e.message; throw e; }
    if (this.officialReturns.has(commandId)) {
      const old = this.officialReturns.get(commandId);
      const next = validateOfficialReturn(d, publication);
      if (JSON.stringify(old) !== JSON.stringify(next)) {
        const e = new Error('DUPLICATE_OFFICIAL_RETURN_CONFLICT'); e.code = e.message; throw e;
      }
      return { ...old, duplicate_suppressed: true };
    }
    const receipt = validateOfficialReturn(d, publication);
    this.officialReturns.set(commandId, receipt);
    return { ...receipt, duplicate_suppressed: false };
  }
}

module.exports = {
  D3OfficialReturnCorrelator,
  classifyUiResponse,
  normalizeDispatch,
  validateOfficialReturn,
  sha256,
};
