'use strict';

const REQUIRED_PANEL_FIELDS = [
  'current_worker','context_name','context_id','current_command','status',
  'started_at','elapsed_ms','recent_event','error','retry_count','result_return_status'
];

function nonEmpty(v) { return v !== undefined && v !== null && String(v).trim() !== ''; }

function bindCycle3({d2Cycle2,d2Cycle3Guard,d5Cycle2,d5Cycle3,d4TerminalPresent=false, nowIso}) {
  if (!d2Cycle2 || d2Cycle2.outcome !== 'PASS' || d2Cycle2.terminal !== 'ACTIVE_CONTEXT_IDENTIFICATION_LIVE_PASS') {
    throw new Error('D2_CYCLE2_LIVE_RECEIPT_REQUIRED');
  }
  for (const k of ['CONTEXT_ID','CONTEXT_NAME','PAGE_ID','STARTED_AT']) {
    if (!nonEmpty(d2Cycle2.runtime_fields && d2Cycle2.runtime_fields[k])) throw new Error(`D2_${k}_REQUIRED`);
  }
  if (!d5Cycle2 || d5Cycle2.terminal !== 'CYCLE2_REAL_RECEIPT_INGESTION_AND_BLOCKER_METRICS_PASS') {
    throw new Error('D5_CYCLE2_RESULT_REQUIRED');
  }
  if (!d5Cycle3 || d5Cycle3.terminal !== 'D2_LIVE_RECOVERY_INGESTION_AND_METRIC_CLOSURE_PASS') {
    throw new Error('D5_CYCLE3_RECOVERY_RESULT_REQUIRED');
  }
  if (!d2Cycle3Guard || d2Cycle3Guard.terminal !== 'LIVE_CONTEXT_HANDOFF_AND_FRESHNESS_GUARD_PASS') {
    throw new Error('D2_CYCLE3_FRESHNESS_GUARD_REQUIRED');
  }

  const started = Date.parse(d2Cycle2.runtime_fields.STARTED_AT);
  const now = Date.parse(nowIso || new Date().toISOString());
  const elapsed = Number.isFinite(started) && Number.isFinite(now) ? Math.max(0, now - started) : null;
  const resolved = [
    'PC_EXECUTOR_V2_COMMAND_CLAIM_LOOP_STALLED',
    'D5_CYCLE2_RESULT_NOT_PUBLISHED'
  ];
  const gap = d4TerminalPresent ? null : 'D4_OBSERVER_RECEIPT_MISSING';
  const panel = {
    current_worker: 'D-6_AUTOMATION_CONTROL_PANEL_AND_E2E_OWNER',
    context_name: d2Cycle2.runtime_fields.CONTEXT_NAME,
    context_id: d2Cycle2.runtime_fields.CONTEXT_ID,
    current_command: 'C3-W6-D2-D5-LIVE-REBIND-AND-D4-GAP-ISOLATION-V1-20260808-001',
    status: gap ? 'PARTIAL_LIVE_D4_GAP' : 'D2_D5_PANEL_BOUND',
    started_at: d2Cycle2.runtime_fields.STARTED_AT,
    elapsed_ms: elapsed,
    recent_event: d5Cycle3.terminal,
    error: gap,
    retry_count: Number(d2Cycle2.retry_count || 2),
    result_return_status: gap ? 'D2_D5_BOUND_D4_PENDING' : 'D2_D5_BOUND'
  };
  for (const k of REQUIRED_PANEL_FIELDS) if (!(k in panel)) throw new Error(`PANEL_FIELD_MISSING:${k}`);

  return {
    ok: true,
    resolved_blockers: resolved,
    resolved_blocker_count: resolved.length,
    remaining_gap: gap,
    remaining_gap_count: gap ? 1 : 0,
    d4_state_inferred: false,
    synthetic_working_completed_count: 0,
    new_panel_count: 0,
    new_executor_count: 0,
    new_tunnel_count: 0,
    new_transport_count: 0,
    d3_wait_count: 0,
    panel,
    d2_context_authority: 'CYCLE2_IMMUTABLE_TARGET_PC_RECEIPT',
    d2_cycle3_guard_used_as: 'FRESHNESS_GUARD_EVIDENCE_ONLY_NOT_CURRENT_BINDING_AUTHORITY',
    d5_metric_authority: 'CYCLE3_LIVE_RESUMED_RECOVERY_FINAL_REPORT'
  };
}

module.exports = { bindCycle3, REQUIRED_PANEL_FIELDS };
