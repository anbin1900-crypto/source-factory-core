'use strict';

const crypto = require('node:crypto');

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function requiredText(value, code) {
  const text = String(value == null ? '' : value).trim();
  if (!text) {
    const error = new Error(code);
    error.code = code;
    throw error;
  }
  return text;
}

function assertFunction(value, code) {
  if (typeof value !== 'function') {
    const error = new Error(code);
    error.code = code;
    throw error;
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function normalizeCommand(input = {}) {
  return {
    schema_version: 'D3_CONTEXT_MESSAGE_COMMAND_V1',
    cycle_id: requiredText(input.cycle_id, 'CYCLE_ID_REQUIRED'),
    command_id: requiredText(input.command_id, 'COMMAND_ID_REQUIRED'),
    context_id: requiredText(input.context_id, 'CONTEXT_ID_REQUIRED'),
    context_name: requiredText(input.context_name, 'CONTEXT_NAME_REQUIRED'),
    page_id: requiredText(input.page_id, 'PAGE_ID_REQUIRED'),
    group_id: requiredText(input.group_id || 'D_GROUP', 'GROUP_ID_REQUIRED'),
    worker_id: requiredText(input.worker_id || 'D-2', 'WORKER_ID_REQUIRED'),
    message: requiredText(input.message, 'MESSAGE_REQUIRED'),
    return_target: requiredText(input.return_target || 'D-1_OR_SUCCESSOR', 'RETURN_TARGET_REQUIRED'),
    expected_reply_contains: String(input.expected_reply_contains || '').trim(),
  };
}

function assertBinding(snapshot, command) {
  if (!snapshot || typeof snapshot !== 'object') {
    const error = new Error('CONVERSATION_SNAPSHOT_REQUIRED');
    error.code = 'CONVERSATION_SNAPSHOT_REQUIRED';
    throw error;
  }
  if (String(snapshot.context_id || '') !== command.context_id) {
    const error = new Error('CONTEXT_BINDING_MISMATCH');
    error.code = 'CONTEXT_BINDING_MISMATCH';
    throw error;
  }
  if (String(snapshot.page_id || '') !== command.page_id) {
    const error = new Error('PAGE_BINDING_MISMATCH');
    error.code = 'PAGE_BINDING_MISMATCH';
    throw error;
  }
}

function assistantId(message) {
  return requiredText(message && (message.message_id || message.id), 'ASSISTANT_MESSAGE_ID_REQUIRED');
}

class ContextMessageDispatchResultReturn {
  constructor(adapters = {}, options = {}) {
    for (const name of [
      'stage4Dispatch',
      'sendToWorker',
      'observeConversation',
      'stage4RunCheck',
      'stage4AppendStationRecords',
      'returnResult',
    ]) {
      assertFunction(adapters[name], `${name.toUpperCase()}_ADAPTER_REQUIRED`);
    }
    this.adapters = adapters;
    this.appendEvent = typeof adapters.appendEvent === 'function' ? adapters.appendEvent : async () => {};
    this.sleep = typeof adapters.sleep === 'function' ? adapters.sleep : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    this.now = typeof options.now === 'function' ? options.now : () => new Date().toISOString();
    this.visibilityPolls = Number.isInteger(options.visibilityPolls) ? options.visibilityPolls : 30;
    this.replyPolls = Number.isInteger(options.replyPolls) ? options.replyPolls : 600;
    this.pollDelayMs = Number.isInteger(options.pollDelayMs) ? options.pollDelayMs : 1000;
    this.completed = new Map();
    this.running = new Set();
  }

  async _event(type, command, extra = {}) {
    const event = {
      schema_version: 'D3_CONTEXT_MESSAGE_EVENT_V1',
      event_type: type,
      cycle_id: command.cycle_id,
      command_id: command.command_id,
      context_id: command.context_id,
      page_id: command.page_id,
      occurred_at: this.now(),
      ...clone(extra),
    };
    await this.appendEvent(clone(event));
    return event;
  }

  async _observe(command) {
    const snapshot = await this.adapters.observeConversation({
      command_id: command.command_id,
      context_id: command.context_id,
      page_id: command.page_id,
    });
    assertBinding(snapshot, command);
    return snapshot;
  }

  async run(input) {
    const command = normalizeCommand(input);
    if (this.completed.has(command.command_id)) {
      return { ...clone(this.completed.get(command.command_id)), duplicate_suppressed: true };
    }
    if (this.running.has(command.command_id)) {
      const error = new Error('COMMAND_ALREADY_RUNNING');
      error.code = 'COMMAND_ALREADY_RUNNING';
      throw error;
    }
    this.running.add(command.command_id);

    try {
      const baseline = await this._observe(command);
      const baselineAssistantIds = new Set((baseline.assistant_messages || []).map(assistantId));
      if (command.expected_reply_contains && (baseline.assistant_messages || []).some((item) =>
        String(item.raw_text || item.text || '').includes(command.expected_reply_contains))) {
        const error = new Error('EXPECTED_REPLY_MARKER_PRESENT_BEFORE_DISPATCH');
        error.code = 'EXPECTED_REPLY_MARKER_PRESENT_BEFORE_DISPATCH';
        throw error;
      }

      await this._event('DISPATCH_STARTED', command, {
        baseline_assistant_count: baselineAssistantIds.size,
        message_sha256: sha256(command.message),
      });

      const stage4Dispatch = await this.adapters.stage4Dispatch({
        prompt_id: command.command_id,
        prompt_text: command.message,
        worker_id: command.worker_id,
        target_stage: 'D3_CONTEXT_MESSAGE_DISPATCH',
        dedupe_key: command.command_id,
        context_id: command.context_id,
        page_id: command.page_id,
      });

      const transportReceipt = await this.adapters.sendToWorker(
        command.group_id,
        command.worker_id,
        command.message,
        {
          mode: 'CONTEXT_AWARE_MESSAGE_LOOP',
          cycleId: command.cycle_id,
          commandId: command.command_id,
          contextId: command.context_id,
          pageId: command.page_id,
          sentAt: this.now(),
          stage4Dispatch: clone(stage4Dispatch),
        },
      );

      let visibleSnapshot = null;
      let visibleMessage = null;
      for (let attempt = 0; attempt < this.visibilityPolls; attempt += 1) {
        const snapshot = await this._observe(command);
        const userMessages = Array.isArray(snapshot.user_messages) ? snapshot.user_messages : [];
        const match = userMessages.find((item) =>
          item && item.visible === true && String(item.raw_text || item.text || '') === command.message);
        if (match) {
          visibleSnapshot = snapshot;
          visibleMessage = match;
          break;
        }
        await this.sleep(this.pollDelayMs);
      }

      if (!visibleMessage) {
        await this._event('MESSAGE_VISIBILITY_FAILED', command, {
          transport_receipt: clone(transportReceipt),
          message_sent_emitted: false,
        });
        const error = new Error('USER_MESSAGE_NOT_VISIBLE_IN_TARGET_CONVERSATION');
        error.code = 'USER_MESSAGE_NOT_VISIBLE_IN_TARGET_CONVERSATION';
        throw error;
      }

      const messageSentEvent = await this._event('MESSAGE_SENT', command, {
        user_message_id: String(visibleMessage.message_id || visibleMessage.id || ''),
        message_sha256: sha256(command.message),
        visible_in_conversation: true,
        composer_contains_message: visibleSnapshot.composer_contains_message === true,
        transport_receipt: clone(transportReceipt),
      });
      if (messageSentEvent.composer_contains_message) {
        const error = new Error('MESSAGE_VISIBLE_ONLY_IN_COMPOSER');
        error.code = 'MESSAGE_VISIBLE_ONLY_IN_COMPOSER';
        throw error;
      }

      let reply = null;
      let completionSnapshot = null;
      for (let attempt = 0; attempt < this.replyPolls; attempt += 1) {
        const snapshot = await this._observe(command);
        const assistantMessages = Array.isArray(snapshot.assistant_messages) ? snapshot.assistant_messages : [];
        const candidates = assistantMessages.filter((item) => {
          if (!item || item.completed !== true) return false;
          const id = assistantId(item);
          const raw = String(item.raw_text || item.text || '');
          if (baselineAssistantIds.has(id) || !raw.trim()) return false;
          if (item.created_after_dispatch === false) return false;
          if (command.expected_reply_contains && !raw.includes(command.expected_reply_contains)) return false;
          return true;
        });
        if (candidates.length) {
          reply = candidates[candidates.length - 1];
          completionSnapshot = snapshot;
          break;
        }
        await this.sleep(this.pollDelayMs);
      }

      if (!reply) {
        await this._event('REPLY_COLLECTION_TIMEOUT', command, { baseline_assistant_count: baselineAssistantIds.size });
        const error = new Error('NEW_COMPLETED_ASSISTANT_REPLY_NOT_FOUND');
        error.code = 'NEW_COMPLETED_ASSISTANT_REPLY_NOT_FOUND';
        throw error;
      }

      const replyRaw = String(reply.raw_text || reply.text || '');
      const result = {
        schema_version: 'D3_CONTEXT_MESSAGE_RESULT_RETURN_V1',
        terminal: 'MESSAGE_DISPATCH_AND_RESULT_RETURN_LIVE_PASS',
        cycle_id: command.cycle_id,
        command_id: command.command_id,
        context_id: command.context_id,
        context_name: command.context_name,
        page_id: command.page_id,
        worker_id: command.worker_id,
        return_target: command.return_target,
        user_message_id: String(visibleMessage.message_id || visibleMessage.id || ''),
        message_sha256: sha256(command.message),
        message_sent_event: clone(messageSentEvent),
        assistant_message_id: assistantId(reply),
        assistant_reply_raw: replyRaw,
        assistant_reply_sha256: sha256(replyRaw),
        assistant_reply_completed: true,
        completion_observed_at: this.now(),
        conversation_revision: completionSnapshot.revision || null,
        stage4_dispatch_receipt: clone(stage4Dispatch),
        transport_receipt: clone(transportReceipt),
        new_system_build: false,
        production: false,
        ready: false,
        merge: false,
      };

      const runCheck = await this.adapters.stage4RunCheck(clone(result));
      result.stage4_run_check = clone(runCheck);
      const storage = await this.adapters.stage4AppendStationRecords(clone(result));
      result.stage4_storage = clone(storage);
      await this._event('REPLY_COLLECTED', command, {
        assistant_message_id: result.assistant_message_id,
        assistant_reply_sha256: result.assistant_reply_sha256,
      });
      result.return_receipt = clone(await this.adapters.returnResult(command.return_target, clone(result)));
      await this._event('RESULT_RETURNED', command, {
        return_target: command.return_target,
        return_receipt: clone(result.return_receipt),
      });
      this.completed.set(command.command_id, clone(result));
      return clone(result);
    } catch (error) {
      await this._event('DISPATCH_RESULT_RETURN_FAILED', command, {
        error_code: String(error.code || 'UNEXPECTED_ERROR'),
        error_message: String(error.message || error),
      });
      throw error;
    } finally {
      this.running.delete(command.command_id);
    }
  }
}

module.exports = {
  ContextMessageDispatchResultReturn,
  assertBinding,
  normalizeCommand,
  sha256,
};
