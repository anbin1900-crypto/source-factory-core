export const CANONICAL_STATUSES = Object.freeze({
  GREEN_READY: 'GREEN_READY',
  YELLOW_INPUT_PENDING: 'YELLOW_INPUT_PENDING',
  YELLOW_RUNTIME_PENDING: 'YELLOW_RUNTIME_PENDING',
  RED_FIX_REQUIRED: 'RED_FIX_REQUIRED',
  BLOCKED_BY_MISSING_INPUT: 'BLOCKED_BY_MISSING_INPUT',
  BLOCKED_BY_RUNTIME: 'BLOCKED_BY_RUNTIME',
  BLACK_FORBIDDEN: 'BLACK_FORBIDDEN',
  UNKNOWN: 'UNKNOWN'
});

export function classifyWorkerReport(fields = {}) {
  const raw = String(fields.class_contract_status || fields.priority_0_status || '').toUpperCase();
  if (!raw) return CANONICAL_STATUSES.UNKNOWN;
  if (raw.includes('BLACK') || raw.includes('FORBIDDEN')) return CANONICAL_STATUSES.BLACK_FORBIDDEN;
  if (raw.includes('RED')) return CANONICAL_STATUSES.RED_FIX_REQUIRED;
  if (raw.includes('MISSING') || raw.includes('INPUT_PENDING')) return CANONICAL_STATUSES.BLOCKED_BY_MISSING_INPUT;
  if (raw.includes('RUNTIME') && (raw.includes('BLOCK') || raw.includes('PENDING'))) return CANONICAL_STATUSES.BLOCKED_BY_RUNTIME;
  if (raw.includes('YELLOW') && raw.includes('RUNTIME')) return CANONICAL_STATUSES.YELLOW_RUNTIME_PENDING;
  if (raw.includes('YELLOW')) return CANONICAL_STATUSES.YELLOW_INPUT_PENDING;
  if (raw.includes('GREEN')) return CANONICAL_STATUSES.GREEN_READY;
  return CANONICAL_STATUSES.UNKNOWN;
}

export function shouldContinue(status, policy = {}) {
  if (status === CANONICAL_STATUSES.BLACK_FORBIDDEN) return false;
  if (status === CANONICAL_STATUSES.RED_FIX_REQUIRED) return policy.continueOnRed === true;
  if (status === CANONICAL_STATUSES.BLOCKED_BY_RUNTIME) return policy.continueOnRuntimeBlocked !== false;
  if (status === CANONICAL_STATUSES.BLOCKED_BY_MISSING_INPUT) return policy.continueOnMissingInput !== false;
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(classifyWorkerReport({ class_contract_status: 'YELLOW_INPUT_PENDING' }));
}
