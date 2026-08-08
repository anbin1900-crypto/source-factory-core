'use strict';

const PANEL_FIELDS = [
  'current_worker','context_name','context_id','current_command','status','started_at',
  'elapsed_ms','recent_event','error','retry_count','result_return_status'
];

function msBetween(started, completed) {
  const a = Date.parse(started || '');
  const b = Date.parse(completed || '');
  return Number.isFinite(a) && Number.isFinite(b) && b >= a ? b - a : 0;
}

function projectCycle5(input = {}) {
  const d4 = input.d4_attempt || {};
  const d5 = input.d5_metrics || {};
  const context = input.context || {};
  const events = Array.isArray(d4.events) ? d4.events : [];
  const working = d4.working_observed === true || events.some(e => e && e.state === 'WORKING');
  const errorEvent = events.find(e => e && e.state === 'ERROR') || null;
  const d4Pass = d4.live_pass_claimed === true && d4.terminal === 'CHROME_REPLY_COMPLETION_LIVE_PASS';

  let status = 'DISPATCHED';
  if (working) status = 'WORKING';
  if (errorEvent || d4.status === 'BLOCKED') status = 'ERROR_CORRECTION_PENDING';
  if (d4Pass) status = 'COMPLETED';

  const errorCode = d4.internal_failure || d4.exact_internal_failure ||
    (errorEvent && errorEvent.reason) ||
    (d4.status === 'BLOCKED' ? 'D4_LIVE_COMPLETION_NOT_CONFIRMED' : null);

  const panel = {
    current_worker: 'D-4_CHROME_WORKER_STATE_OBSERVER_OWNER',
    context_name: context.context_name || null,
    context_id: context.context_id || null,
    current_command: d4.command_id || null,
    status,
    started_at: d4.started_at || null,
    elapsed_ms: msBetween(d4.started_at, d4.completed_at),
    recent_event: d4Pass ? 'COMPLETED' : errorEvent ? `ERROR:${errorCode}` : working ? 'WORKING' : 'DISPATCHED',
    error: errorCode,
    retry_count: Number.isInteger(d4.retry_count) ? d4.retry_count : 0,
    result_return_status: d4Pass ? 'D4_COMPLETED_READY_FOR_FULL_E2E_ACTIVATION' : 'D4_COMPLETION_PENDING'
  };

  if (Object.keys(panel).length !== 11 || PANEL_FIELDS.some(k => !(k in panel))) throw new Error('PANEL_FIELDS_11_REQUIRED');
  if (!d4Pass && panel.status === 'COMPLETED') throw new Error('SYNTHETIC_COMPLETED_FORBIDDEN');

  return {
    schema_version: 'D6_CYCLE5_PANEL_TRUTH_PROJECTION_V1',
    panel,
    execution_truth: {
      powershell_restart_effect: d4.powershell_restart_effect || null,
      queue_unlocked: d4.queue_unlocked === true,
      executor_receipt_status: d4.executor_receipt_status || null,
      working_observed: working,
      error_observed: Boolean(errorEvent) || d4.error_observed === true,
      completed_observed: d4Pass,
      internal_schema_correction_pending: !d4Pass && Boolean(errorCode),
      full_message_loop_live_pass: d4Pass,
      d5_cycle5_late_bind_ready: true,
      d5_latest_terminal: d5.terminal || null,
      d5_cycle5_result_available: Boolean(d5.cycle5_result_available)
    },
    activation_contract: {
      trigger_terminal: 'CHROME_REPLY_COMPLETION_LIVE_PASS',
      require_actual_d4_pass_receipt: true,
      rebuild_required: false,
      activation_action: 'LATE_BIND_D4_PASS_RECEIPT_AND_REPROJECT_PANEL_ONCE',
      synthetic_completion_allowed: false
    },
    forbidden_counters: {
      synthetic_completed: 0,
      d4_pass_inference: 0,
      new_panel: 0,
      new_executor: 0,
      new_tunnel: 0,
      new_transport: 0,
      d3_wait: 0
    }
  };
}

module.exports = { projectCycle5, PANEL_FIELDS };
