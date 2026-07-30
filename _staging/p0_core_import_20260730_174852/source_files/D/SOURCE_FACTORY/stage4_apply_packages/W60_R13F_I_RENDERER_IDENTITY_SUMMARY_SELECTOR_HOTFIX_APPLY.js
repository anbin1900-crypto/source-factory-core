#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const APPLY_ID = 'W60_R13F_I_RENDERER_IDENTITY_SUMMARY_SELECTOR_HOTFIX';
const HOTFIX_VERSION = 'v60.13f.i.1-renderer-identity-summary-selector-hotfix';
const PROJECT_ROOT = process.cwd();
const TARGET = 'safe_panel_v10/safe_panel_renderer.js';
const RESULT_REL = 'reports/W60_R13F_I_RENDERER_IDENTITY_SUMMARY_SELECTOR_HOTFIX_RESULT.json';
const BACKUP_ROOT_REL = 'stage4_apply_packages/_rollback_backups/W60_R13F_I_RENDERER_IDENTITY_SUMMARY_SELECTOR_HOTFIX';

const STATUS = {
  GREEN: 'GREEN_W60_R13F_I_RENDERER_IDENTITY_SUMMARY_SELECTOR_HOTFIX_APPLIED',
  YELLOW: 'YELLOW_W60_R13F_I_RENDERER_IDENTITY_SUMMARY_SELECTOR_HOTFIX_GUARDED_STOP',
  RED: 'RED_W60_R13F_I_RENDERER_IDENTITY_SUMMARY_SELECTOR_HOTFIX_BLOCKED'
};

const PROTECTED = [
  'package.json',
  'safe_panel_v10/safe_panel_preload.js',
  'safe_panel_v10/safe_panel.html',
  'safe_panel_v10/safe_panel_main.js',
  'safe_panel_v10/ipc/stage4StationBindingHandlers.js',
  'src/shared/stage4/sequentialPromptSender.js',
  'src/shared/stage4/stores/taeoRawOutputStore.js',
  'src/shared/stage4/stores/workerOutputBatchStore.js',
  'src/shared/stage4/collectorCommanderGateHandoffAdapter.js',
  'src/shared/stage4/stores/panelRecordExecutionStore.js'
];

const MARKER_PATTERNS = [
  { name: 'selectedPrompt', pattern: /selectedPrompt/g },
  { name: 'logPanel', pattern: /logPanel/g },
  { name: 'W49', pattern: /W49/g },
  { name: 'W50', pattern: /W50/g }
];

function nowIso() { return new Date().toISOString(); }
function abs(rel) { return path.join(PROJECT_ROOT, String(rel).split('/').join(path.sep)); }
function exists(rel) { const p = abs(rel); return fs.existsSync(p) && fs.statSync(p).isFile(); }
function read(rel) { return fs.readFileSync(abs(rel), 'utf8'); }
function write(rel, text) { const p = abs(rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text, 'utf8'); }
function sha(rel) { return exists(rel) ? crypto.createHash('sha256').update(fs.readFileSync(abs(rel))).digest('hex') : null; }
function snapshot() { const files = [TARGET].concat(PROTECTED); const out = {}; Array.from(new Set(files)).forEach((f) => out[f] = sha(f)); return out; }
function changed(before, after) { return Array.from(new Set(Object.keys(before).concat(Object.keys(after)))).sort().filter((k) => before[k] !== after[k]); }

function nodeCheckText(label, text) {
  const tempRel = 'stage4_apply_packages/_tmp_node_check/W60_R13F_I_RENDERER_IDENTITY_SUMMARY_SELECTOR_HOTFIX/' + label.replace(/[^A-Za-z0-9_.-]/g, '_');
  write(tempRel, text);
  return nodeCheck(tempRel);
}

function nodeCheck(rel) {
  if (!exists(rel)) return { ok: false, file: rel, reason: 'file_missing' };
  try {
    const stdout = cp.execFileSync(process.execPath, ['--check', abs(rel)], { cwd: PROJECT_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, file: rel, stdout: stdout.trim() };
  } catch (err) {
    return { ok: false, file: rel, stdout: err.stdout ? String(err.stdout).trim() : '', stderr: err.stderr ? String(err.stderr).trim() : String(err.message || err) };
  }
}

function count(text, pattern) { const m = text.match(pattern); return m ? m.length : 0; }
function markerCounts(text) { const out = {}; MARKER_PATTERNS.forEach((x) => out[x.name] = count(text, x.pattern)); return out; }
function markerRegression(before, after) {
  const b = markerCounts(before);
  const a = markerCounts(after);
  const regressions = [];
  Object.keys(b).forEach((k) => { if (a[k] < b[k]) regressions.push({ name: k, before: b[k], after: a[k] }); });
  return { before: b, after: a, regressions };
}

function result(status, payload, code) {
  const out = Object.assign({
    object_type: 'W60_R13F_I_RENDERER_IDENTITY_SUMMARY_SELECTOR_HOTFIX_RESULT',
    apply_id: APPLY_ID,
    hotfix_version: HOTFIX_VERSION,
    created_at: nowIso(),
    project_root: PROJECT_ROOT,
    class_contract_status: status
  }, payload || {});
  write(RESULT_REL, JSON.stringify(out, null, 2) + '\n');
  console.log('[W60_R13F-I]', status);
  console.log('Result:', RESULT_REL);
  if (Array.isArray(out.modified_files)) console.log('modified_files:', out.modified_files.join(', ') || '[]');
  process.exitCode = code || 0;
}

function backupFile(rel) {
  const stamp = nowIso().replace(/[:.]/g, '-');
  const backupRel = path.join(BACKUP_ROOT_REL, stamp, rel).split(path.sep).join('/');
  fs.mkdirSync(path.dirname(abs(backupRel)), { recursive: true });
  fs.copyFileSync(abs(rel), abs(backupRel));
  return { stamp, file: rel, backup: backupRel };
}

function patchRenderer(text) {
  const producerStart = text.indexOf('W60_R13F_H_LIFECYCLE_EVENT_PRODUCER_START');
  const producerEnd = text.indexOf('W60_R13F_H_LIFECYCLE_EVENT_PRODUCER_END');
  if (producerStart < 0 || producerEnd < 0 || producerEnd <= producerStart) {
    return { ok: false, reason: 'r13f_h_renderer_producer_marker_missing' };
  }
  const block = text.slice(producerStart, producerEnd);
  if (block.includes('#sf-project-panel-identity-summary')) {
    return { ok: true, text, idempotent: true, reason: 'identity_summary_selector_already_present' };
  }

  const oldLine = "    return target.closest(['[data-project-panel-id]', '[data-panel-id]', '[data-project-id]', '[data-project-name]', '[data-role=\"project-panel\"]', '.project-panel'].join(','));";
  const newLines = [
    "    return target.closest([",
    "      '#sf-project-panel-identity-summary',",
    "      '[data-project-panel-identity]',",
    "      '[data-project-panel-identity-container]',",
    "      '[data-stage4-project-panel-identity]',",
    "      '[data-stage4-project-panel-identity-container]',",
    "      '[data-project-panel-id]',",
    "      '[data-panel-id]',",
    "      '[data-project-id]',",
    "      '[data-project-name]',",
    "      '[data-role=\"project-panel\"]',",
    "      '.sf-project-panel-identity-summary',",
    "      '.project-panel-identity',",
    "      '.project-panel'",
    "    ].join(','));"
  ].join('\n');

  if (!text.includes(oldLine)) {
    return { ok: false, reason: 'exact_existing_selector_line_not_found', expected_line: oldLine };
  }
  return { ok: true, text: text.replace(oldLine, newLines), idempotent: false, inserted_selector_count: 8 };
}

function main() {
  const beforeHashes = snapshot();
  const selfCheck = nodeCheckText('self_apply.js', fs.readFileSync(__filename, 'utf8'));
  if (!selfCheck.ok) return result(STATUS.RED, { applied: false, modified_files: [], reason: 'self_node_check_failed', self_node_check: selfCheck, protected_hashes_before: beforeHashes }, 1);
  if (!exists(TARGET)) return result(STATUS.YELLOW, { applied: false, modified_files: [], reason: 'renderer_target_missing', target: TARGET, protected_hashes_before: beforeHashes, protected_hashes_after: snapshot() });

  const preCheck = nodeCheck(TARGET);
  if (!preCheck.ok) return result(STATUS.RED, { applied: false, modified_files: [], reason: 'pre_node_check_failed', pre_node_check: preCheck, protected_hashes_before: beforeHashes }, 1);

  const beforeText = read(TARGET);
  const patch = patchRenderer(beforeText);
  if (!patch.ok) return result(STATUS.YELLOW, { applied: false, modified_files: [], reason: 'renderer_selector_anchor_guarded_stop', patch, protected_hashes_before: beforeHashes, protected_hashes_after: snapshot() });

  if (patch.idempotent) {
    const afterHashes = snapshot();
    return result(STATUS.GREEN, { applied: false, idempotent: true, modified_files: [], reason: patch.reason, pre_node_check: preCheck, protected_hashes_before: beforeHashes, protected_hashes_after: afterHashes, protected_hash_diff: changed(beforeHashes, afterHashes), next_needed: ['Restart SAFE Panel.', 'Click Project Panel Identity area.', 'Run W60_R13F actual UI lifecycle proof again.'] });
  }

  const markerCheck = markerRegression(beforeText, patch.text);
  if (markerCheck.regressions.length) return result(STATUS.RED, { applied: false, modified_files: [], reason: 'marker_regression_before_write', marker_check: markerCheck, protected_hashes_before: beforeHashes }, 1);

  const tempCheck = nodeCheckText('patched_safe_panel_renderer.js', patch.text);
  if (!tempCheck.ok) return result(STATUS.RED, { applied: false, modified_files: [], reason: 'temp_node_check_failed_before_write', temp_node_check: tempCheck, protected_hashes_before: beforeHashes, protected_hashes_after: snapshot() }, 1);

  const backup = backupFile(TARGET);
  write(TARGET, patch.text);
  const postCheck = nodeCheck(TARGET);
  if (!postCheck.ok) {
    fs.copyFileSync(abs(backup.backup), abs(TARGET));
    return result(STATUS.RED, { applied: false, modified_files: [], reason: 'post_node_check_failed_rollback_restored', post_node_check: postCheck, rollback: backup, protected_hashes_before: beforeHashes, protected_hashes_after: snapshot() }, 1);
  }

  const afterHashes = snapshot();
  const diff = changed(beforeHashes, afterHashes);
  const disallowed = diff.filter((f) => f !== TARGET);
  if (disallowed.length) {
    fs.copyFileSync(abs(backup.backup), abs(TARGET));
    return result(STATUS.RED, { applied: false, modified_files: [], reason: 'disallowed_hash_diff_rollback_restored', changed_files: diff, disallowed, rollback: backup, protected_hashes_before: beforeHashes, protected_hashes_after: snapshot() }, 1);
  }

  result(STATUS.GREEN, {
    applied: true,
    modified_files: [TARGET],
    reason: 'renderer_producer_selector_expanded_to_actual_project_panel_identity_summary_anchor',
    selectors_added: [
      '#sf-project-panel-identity-summary',
      '[data-project-panel-identity]',
      '[data-project-panel-identity-container]',
      '[data-stage4-project-panel-identity]',
      '[data-stage4-project-panel-identity-container]',
      '.sf-project-panel-identity-summary',
      '.project-panel-identity'
    ],
    self_node_check: selfCheck,
    pre_node_check: preCheck,
    temp_node_check: tempCheck,
    post_node_check: postCheck,
    marker_check: markerCheck,
    rollback: backup,
    protected_hashes_before: beforeHashes,
    protected_hashes_after: afterHashes,
    protected_hash_diff: diff,
    modified_files_allowlist_ok: true,
    preload_unchanged: beforeHashes['safe_panel_v10/safe_panel_preload.js'] === afterHashes['safe_panel_v10/safe_panel_preload.js'],
    package_json_unchanged: beforeHashes['package.json'] === afterHashes['package.json'],
    w54_shared_files_unchanged: [
      'src/shared/stage4/sequentialPromptSender.js',
      'src/shared/stage4/stores/taeoRawOutputStore.js',
      'src/shared/stage4/stores/workerOutputBatchStore.js',
      'src/shared/stage4/collectorCommanderGateHandoffAdapter.js',
      'src/shared/stage4/stores/panelRecordExecutionStore.js'
    ].every((f) => beforeHashes[f] === afterHashes[f]),
    next_needed: [
      'Restart SAFE Panel so renderer producer reloads.',
      'Click Project Panel Identity area.',
      'Run W60_R13F actual UI lifecycle proof again.',
      'Keep W61 gate closed until proof returns runtime_event_registry and panel_instance_id.'
    ]
  });
}

try { main(); } catch (err) { result(STATUS.RED, { applied: false, modified_files: [], reason: 'unhandled_exception', error: String(err && err.stack ? err.stack : err), protected_hashes_before: snapshot(), protected_hashes_after: snapshot() }, 1); }
