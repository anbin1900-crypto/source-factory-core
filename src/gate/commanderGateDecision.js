import { CANONICAL_STATUSES } from './statusClassifier.js';

export function buildCommanderDecision({ decisionId, sourceReports = [], statuses = [], blockers = [], nextActions = [] }) {
  const finalStatus = decideFinalStatus(statuses, blockers);
  return {
    commander_decision_id: decisionId,
    created_at: new Date().toISOString(),
    source_report_count: sourceReports.length,
    source_reports: sourceReports,
    status: finalStatus,
    production_gate: finalStatus === CANONICAL_STATUSES.GREEN_READY ? 'REVIEW_REQUIRED' : 'CLOSED',
    promotion_candidate_allowed: false,
    production_promoted: false,
    blockers,
    next_actions: nextActions
  };
}

export function decideFinalStatus(statuses, blockers) {
  if (blockers?.some((b) => String(b.severity || '').toUpperCase() === 'BLACK')) return CANONICAL_STATUSES.BLACK_FORBIDDEN;
  if (statuses.includes(CANONICAL_STATUSES.RED_FIX_REQUIRED)) return CANONICAL_STATUSES.RED_FIX_REQUIRED;
  if (statuses.includes(CANONICAL_STATUSES.BLOCKED_BY_MISSING_INPUT)) return CANONICAL_STATUSES.BLOCKED_BY_MISSING_INPUT;
  if (statuses.includes(CANONICAL_STATUSES.BLOCKED_BY_RUNTIME)) return CANONICAL_STATUSES.BLOCKED_BY_RUNTIME;
  if (statuses.includes(CANONICAL_STATUSES.YELLOW_INPUT_PENDING)) return CANONICAL_STATUSES.YELLOW_INPUT_PENDING;
  if (statuses.includes(CANONICAL_STATUSES.YELLOW_RUNTIME_PENDING)) return CANONICAL_STATUSES.YELLOW_RUNTIME_PENDING;
  if (statuses.length && statuses.every((s) => s === CANONICAL_STATUSES.GREEN_READY)) return CANONICAL_STATUSES.GREEN_READY;
  return CANONICAL_STATUSES.UNKNOWN;
}
