'use strict';

const ACTIVE = new Set(['C_ACTIVE','REPEAT_ACTIVE','AWAITING','ERROR']);

function normalizeRegistryEntry(entry = {}) {
  const resultComment = Number(entry.result_comment_id || 0) || null;
  const resultKey = String(entry.result_key || '');
  const current = entry.registry_relation === 'CURRENT';
  const historical = entry.registry_relation === 'HISTORICAL';
  let state = 'IDLE';
  if (entry.error) state = 'ERROR';
  else if (entry.duplicate_report) state = 'DUPLICATE_REPORT';
  else if (entry.end) state = 'END';
  else if (entry.report_missing || (entry.result_commit && !resultComment)) state = 'REPORT_MISSING';
  else if (entry.awaiting_result) state = 'AWAITING';
  else if (entry.repeat_active) state = 'REPEAT_ACTIVE';
  else if (entry.c_active) state = 'C_ACTIVE';
  else if (current && resultComment) state = 'CURRENT_REGISTRY_RESULT';
  else if (historical && resultComment) state = 'HISTORICAL_REGISTRY_RESULT';
  return {
    role: entry.role,
    state,
    display_result_reference: resultComment ? `RESULT_COMMENT #${resultComment}` : (resultKey ? `RESULT_KEY ${resultKey}` : ''),
    result_comment_id: resultComment,
    result_key: resultKey,
    legacy_profile_status_ignored: true
  };
}

function project(entries = [], options = {}) {
  const projections = entries.map(normalizeRegistryEntry);
  const counts = {working:0,current:0,historical:0,awaiting:0,missing:0,duplicate:0,error:0,end:0,idle:0};
  for (const p of projections) {
    if (ACTIVE.has(p.state)) counts.working++;
    if (p.state === 'CURRENT_REGISTRY_RESULT') counts.current++;
    if (p.state === 'HISTORICAL_REGISTRY_RESULT') counts.historical++;
    if (p.state === 'AWAITING') counts.awaiting++;
    if (p.state === 'REPORT_MISSING') counts.missing++;
    if (p.state === 'DUPLICATE_REPORT') counts.duplicate++;
    if (p.state === 'ERROR') counts.error++;
    if (p.state === 'END') counts.end++;
    if (p.state === 'IDLE') counts.idle++;
  }
  if (!options.c_enabled && !options.command_enabled) counts.working = 0;
  return {projections, counts};
}

module.exports = {normalizeRegistryEntry, project};
