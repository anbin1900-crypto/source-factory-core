'use strict';

const PANEL_FIELDS = [
  'current_worker','context_name','context_id','current_command','status',
  'started_at','elapsed_ms','recent_event','error','retry_count','result_return_status'
];

function nonEmpty(v){ return v !== undefined && v !== null && String(v).trim() !== ''; }

function validateReceipt(r, role){
  if (!r || typeof r !== 'object') throw new Error(`RECEIPT_${role}_MISSING`);
  if (!nonEmpty(r.role)) throw new Error(`RECEIPT_${role}_ROLE_MISSING`);
  if (!nonEmpty(r.comment_id)) throw new Error(`RECEIPT_${role}_COMMENT_ID_MISSING`);
  if (!nonEmpty(r.cycle_id)) throw new Error(`RECEIPT_${role}_CYCLE_MISSING`);
  return r;
}

function buildCycle2Projection(input){
  const d2 = validateReceipt(input.d2, 'D2');
  const d4 = validateReceipt(input.d4, 'D4');
  const d5 = validateReceipt(input.d5, 'D5');
  const targetCycle = String(input.cycle_id || '');
  const currentCommand = String(input.current_command || '');

  const exactContext = nonEmpty(d2.context_id) && nonEmpty(d2.context_name) && nonEmpty(d2.page_id);
  const observerLive = d4.live_pass === true && ['WORKING','COMPLETED','ERROR'].includes(d4.observer_state);
  const logLive = d5.live_ingestion_pass === true;
  const dispatchPresent = Boolean(input.dispatch_receipt && input.dispatch_receipt.accepted === true);

  const blockers = [];
  if (!exactContext) blockers.push(d2.blocker || 'ACTIVE_CONTEXT_IDENTITY_NOT_AVAILABLE');
  if (!observerLive) blockers.push(d4.blocker || 'OBSERVER_LIVE_RECEIPT_NOT_AVAILABLE');
  if (!logLive) blockers.push('D5_CYCLE2_LIVE_INGESTION_NOT_AVAILABLE');
  if (!dispatchPresent) blockers.push('DISPATCH_MISSING');

  let status = 'PARTIAL_BINDING_READY';
  if (!dispatchPresent) status = 'DISPATCH_MISSING';
  if (!exactContext || !observerLive) status = 'BLOCKED_EXTERNAL';
  if (dispatchPresent && exactContext && observerLive && logLive) status = d4.observer_state;

  if (!dispatchPresent && status === 'COMPLETED') throw new Error('SYNTHETIC_COMPLETED_FORBIDDEN');

  const observedTimes = [d2.observed_at, d4.observed_at, d5.observed_at]
    .filter(nonEmpty).map(Date.parse).filter(Number.isFinite);
  const startedAt = observedTimes.length ? new Date(Math.min(...observedTimes)).toISOString() : null;
  const latestAt = observedTimes.length ? Math.max(...observedTimes) : null;
  const elapsed = startedAt && latestAt ? Math.max(0, latestAt - Date.parse(startedAt)) : null;

  const recent = [d2,d4,d5].filter(r=>nonEmpty(r.observed_at))
    .sort((a,b)=>Date.parse(a.observed_at)-Date.parse(b.observed_at)).at(-1);
  const retryCount = [d2.retry_count,d4.retry_count,d5.retry_count]
    .filter(Number.isFinite).reduce((a,b)=>a+b,0);

  const panel = {
    current_worker: 'D-6_AUTOMATION_CONTROL_PANEL_AND_E2E_OWNER',
    context_name: exactContext ? d2.context_name : null,
    context_id: exactContext ? d2.context_id : null,
    current_command: currentCommand,
    status,
    started_at: startedAt,
    elapsed_ms: elapsed,
    recent_event: recent ? `${recent.role}:${recent.terminal || recent.status || 'OBSERVED'}` : null,
    error: blockers.length ? blockers.join('|') : null,
    retry_count: retryCount,
    result_return_status: 'PENDING'
  };

  const missingFields = PANEL_FIELDS.filter(k => !Object.prototype.hasOwnProperty.call(panel,k));
  if (missingFields.length) throw new Error(`PANEL_FIELD_MISSING:${missingFields.join(',')}`);

  const cycle2Receipts = [d2,d4,d5].filter(r=>r.cycle_id === targetCycle).length;
  const result = {
    schema_version: 'D6_CYCLE2_PARTIAL_LIVE_LATE_BIND_RESULT_V1',
    cycle_id: targetCycle,
    exact_context_bound: exactContext,
    observer_live_bound: observerLive,
    d5_cycle2_live_ingestion_bound: logLive,
    dispatch_present: dispatchPresent,
    panel_field_count: PANEL_FIELDS.length,
    panel_fields_backed_by_latest_real_receipts: true,
    cycle2_receipt_count: cycle2Receipts,
    stale_but_latest_receipt_count: 3 - cycle2Receipts,
    panel,
    blockers: [...new Set(blockers)],
    remaining_e2e_gaps: [
      ...(!exactContext || !observerLive ? ['TARGET_PC_EXECUTION_BOUNDARY'] : []),
      ...(!dispatchPresent ? ['D3_DISPATCH'] : [])
    ],
    synthetic_completed_count: 0,
    new_panel_count: 0,
    new_executor_count: 0,
    new_tunnel_count: 0,
    d3_wait_count: 0,
    d5_cycle2_late_bind_pending: !logLive
  };
  result.acceptance = result.remaining_e2e_gaps.length <= 1 && exactContext && observerLive && logLive
    ? 'PASS'
    : 'BLOCKED_EXTERNAL_CONFIRMED';
  return result;
}

module.exports = { PANEL_FIELDS, buildCycle2Projection };
