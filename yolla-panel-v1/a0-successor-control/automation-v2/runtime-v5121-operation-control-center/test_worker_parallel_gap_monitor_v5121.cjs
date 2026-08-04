/* eslint-env node */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { PanelActivityMonitor } = require("./activity_monitor.cjs");
const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "yolla-monitor-gap-"));
const now = new Date("2026-08-04T03:50:00.000Z");
const runtime = {
  app_version: "5.12.1",
  panel_open: true,
  workspace_open: true,
  monitor_open: true,
  workspace_rendered: true,
  fixed_user_data_root: "E:/SOURCE FACTORY/.yolla/profile",
  state_path: "E:/SOURCE FACTORY/.yolla/state.json",
  pc_agent_bridge_root_exists: true,
  pc_agent_likely_connected: true,
  data_factory_provider_ready: true,
  active_command_cycle_count: 2,
  active_command_cycles: [
    { seat_code: "B-2", cycle_id: "C1", status: "RUNNING" },
    { seat_code: "B-3", cycle_id: "C2", status: "RUNNING" }
  ],
  browsers: { worker: { created: true, loading: false }, analysis: { created: true, loading: false } },
  automation_schedule: {
    schema_version: "WORKER_SCHEDULE_PANEL_STATE_V1",
    watcher_mode: "GH_CLI",
    runtime: { enabled: true, running: true, last_error: null, last_tick_at: "2026-08-04T03:49:40.000Z" },
    workers: {
      "B-2": { total_count: 3, completed_count: 1, current_job: { job_id: "B2-JOB-002", status: "RESULT_WAITING", attempt: 1, retry_limit: 3 } },
      "B-3": { total_count: 3, completed_count: 0, current_job: { job_id: "B3-JOB-002", status: "BLOCKED_EXTERNAL", attempt: 1, retry_limit: 3 } },
      "B-4": { total_count: 3, completed_count: 0, current_job: { job_id: "B4-JOB-001", status: "PENDING", attempt: 0, retry_limit: 3 } },
      "B-5": { total_count: 2, completed_count: 0, current_job: { job_id: "B5-JOB-001", status: "PENDING", attempt: 0, retry_limit: 3 } },
      "B-6": { total_count: 2, completed_count: 0, current_job: { job_id: "B6-JOB-001", status: "PENDING", attempt: 0, retry_limit: 3 } }
    }
  },
  schedule_diagnostics: {
    enabled_worker_count: 5,
    active_worker_count: 1,
    dispatchable_worker_count: 3,
    active_workers: ["B-2"],
    dispatchable_workers: ["B-4", "B-5", "B-6"],
    waiting_workers: [],
    blocked_workers: ["B-3"],
    starved_workers: ["B-4", "B-5", "B-6"],
    order_gaps: [{ worker_id: "B-3", skipped_order: 1, advanced_order: 2, advanced_job_id: "B3-JOB-002", advanced_status: "BLOCKED_EXTERNAL" }],
    workers: {
      "B-2": { worker_id: "B-2", current_job: { job_id: "B2-JOB-002", status: "RESULT_WAITING", attempt: 1, retry_limit: 3 }, completed_count: 1, total_count: 3, selection_action: "ACTIVE" },
      "B-3": { worker_id: "B-3", current_job: { job_id: "B3-JOB-002", status: "BLOCKED_EXTERNAL", attempt: 1, retry_limit: 3 }, completed_count: 0, total_count: 3, selection_action: "WAIT_DEPENDENCY" },
      "B-4": { worker_id: "B-4", current_job: { job_id: "B4-JOB-001", status: "PENDING", attempt: 0, retry_limit: 3 }, completed_count: 0, total_count: 3, selection_action: "READY" },
      "B-5": { worker_id: "B-5", current_job: { job_id: "B5-JOB-001", status: "PENDING", attempt: 0, retry_limit: 3 }, completed_count: 0, total_count: 2, selection_action: "READY" },
      "B-6": { worker_id: "B-6", current_job: { job_id: "B6-JOB-001", status: "PENDING", attempt: 0, retry_limit: 3 }, completed_count: 0, total_count: 2, selection_action: "READY" }
    }
  },
  automation_relay: { schema_version: "YOLLA_PANEL_GROUP_EPIC_RELAY_RUNTIME_V1", runtime: { enabled: true, last_error: null }, workers: {} },
  observed_at: now.toISOString()
};
(async () => {
  const monitor = new PanelActivityMonitor({ stateRoot, autoRepairEnabled: false, now: () => new Date(now), getSnapshot: () => runtime });
  const snapshot = await monitor.evaluate();
  const codes = new Set(snapshot.anomalies.map(item => item.code));
  for (const code of ["DISPATCHABLE_WORKERS_NOT_RUNNING","WORKER_STARVATION_DETECTED","SCHEDULE_JOB_ORDER_GAP","PREMATURE_BLOCKED_EXTERNAL"]) assert.ok(codes.has(code), code);
  assert.equal(snapshot.overall_state, "ERROR");
  assert.equal(snapshot.runtime_status.schedule_diagnostics.dispatchable_worker_count, 3);
  assert.match(snapshot.headline, /교정이 필요한 이상징후/);
  console.log(JSON.stringify({ terminal: "V5121_WORKER_PARALLEL_GAP_MONITOR_PASS", assertions: 7, anomaly_codes: [...codes].sort() }, null, 2));
})().catch(error => { console.error(error); process.exit(1); });
