'use strict';

const TERMINAL_STATES = new Set(['COMPLETED','FAILED','BLOCKED']);

function iso(now) { return (now ? now() : new Date()).toISOString(); }
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

function buildPanelState(run, nowFn) {
  const nowMs = (nowFn ? nowFn() : new Date()).getTime();
  const startedMs = Date.parse(run.started_at || '') || nowMs;
  return {
    schema_version: 'D6_CONTEXT_MESSAGE_PANEL_STATE_V1',
    current_worker: run.worker_id,
    context_name: run.context_name,
    context_id: run.context_id,
    current_command: run.command,
    status: run.status,
    started_at: run.started_at,
    elapsed_ms: Math.max(0, nowMs - startedMs),
    recent_event: run.events.length ? clone(run.events[run.events.length - 1]) : null,
    error: run.error || null,
    retry_count: run.retry_count,
    result_return_status: run.result_return_status
  };
}

class ContextAwareMessageLoop {
  constructor(adapters = {}, options = {}) {
    this.a = adapters;
    this.now = options.now || (() => new Date());
    this.maxPolls = Number.isInteger(options.maxPolls) ? options.maxPolls : 30;
    this.pollDelayMs = Number.isInteger(options.pollDelayMs) ? options.pollDelayMs : 1000;
  }

  async emit(run, type, details = {}) {
    const event = {
      schema_version: 'D6_CONTEXT_MESSAGE_EVENT_V1',
      cycle_id: run.cycle_id,
      correlation_id: run.correlation_id,
      context_id: run.context_id || null,
      event_type: type,
      occurred_at: iso(this.now),
      details: clone(details)
    };
    run.events.push(event);
    if (this.a.appendEvent) await this.a.appendEvent(clone(event));
    if (this.a.updatePanel) await this.a.updatePanel(buildPanelState(run, this.now));
    return event;
  }

  async run(input) {
    assert(input && input.cycle_id, 'cycle_id required');
    assert(input.worker_id, 'worker_id required');
    assert(input.command, 'command required');
    assert(this.a.identifyContext, 'identifyContext adapter required');
    assert(this.a.sendMessage, 'sendMessage adapter required');
    assert(this.a.readStatus, 'readStatus adapter required');
    assert(this.a.fetchReply, 'fetchReply adapter required');

    const run = {
      cycle_id: input.cycle_id,
      worker_id: input.worker_id,
      correlation_id: input.correlation_id || `${input.cycle_id}:${input.worker_id}`,
      command: input.command,
      context_name: null,
      context_id: null,
      status: 'STARTING',
      started_at: iso(this.now),
      retry_count: 0,
      error: null,
      result_return_status: 'PENDING',
      reply: null,
      events: []
    };

    try {
      const ctx = await this.a.identifyContext(clone(input.context_selector || {}));
      assert(ctx && ctx.context_id && ctx.context_name, 'context identification incomplete');
      run.context_id = String(ctx.context_id);
      run.context_name = String(ctx.context_name);
      run.status = 'CONTEXT_IDENTIFIED';
      await this.emit(run, 'CONTEXT_IDENTIFIED', { context_name: run.context_name });

      const sendReceipt = await this.a.sendMessage({
        correlation_id: run.correlation_id,
        context_id: run.context_id,
        command: run.command,
        idempotency_key: input.idempotency_key || run.correlation_id
      });
      assert(sendReceipt && sendReceipt.accepted === true, 'message dispatch not accepted');
      assert(!sendReceipt.context_id || String(sendReceipt.context_id) === run.context_id, 'dispatch context mismatch');
      run.status = 'WORKING';
      await this.emit(run, 'MESSAGE_SENT', { dispatch_id: sendReceipt.dispatch_id || null });
      await this.emit(run, 'WORKING', {});

      let terminal = null;
      for (let i = 0; i < this.maxPolls; i += 1) {
        const s = await this.a.readStatus({ correlation_id: run.correlation_id, context_id: run.context_id });
        assert(s && (!s.context_id || String(s.context_id) === run.context_id), 'status context mismatch');
        if (s && s.error) {
          run.retry_count += 1;
          run.error = String(s.error);
          await this.emit(run, 'RETRYABLE_ERROR', { error: run.error, retry_count: run.retry_count });
        }
        if (s && TERMINAL_STATES.has(String(s.status || '').toUpperCase())) {
          terminal = String(s.status).toUpperCase();
          break;
        }
        if (this.a.sleep) await this.a.sleep(this.pollDelayMs);
      }
      assert(terminal === 'COMPLETED', terminal ? `terminal status ${terminal}` : 'completion timeout');
      run.status = 'COMPLETED';
      run.error = null;
      await this.emit(run, 'COMPLETED', {});

      const reply = await this.a.fetchReply({ correlation_id: run.correlation_id, context_id: run.context_id });
      assert(reply && typeof reply.text === 'string' && reply.text.length > 0, 'reply missing');
      assert(!reply.context_id || String(reply.context_id) === run.context_id, 'reply context mismatch');
      run.reply = reply.text;
      run.result_return_status = 'COLLECTED';
      await this.emit(run, 'REPLY_COLLECTED', { reply_sha256: reply.sha256 || null, length: reply.text.length });

      run.result_return_status = 'RETURNED_TO_D1';
      await this.emit(run, 'RESULT_RETURNED', { destination: 'D-1' });
      return { ok: true, run: clone(run), panel: buildPanelState(run, this.now) };
    } catch (err) {
      run.status = 'FAILED';
      run.error = err && err.message ? err.message : String(err);
      run.result_return_status = 'FAILED';
      await this.emit(run, 'FAILED', { error: run.error });
      return { ok: false, run: clone(run), panel: buildPanelState(run, this.now) };
    }
  }
}

module.exports = { ContextAwareMessageLoop, buildPanelState };
