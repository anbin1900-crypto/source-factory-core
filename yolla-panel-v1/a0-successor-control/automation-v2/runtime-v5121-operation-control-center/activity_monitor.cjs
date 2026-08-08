/* eslint-env node */
"use strict";

class PanelActivityMonitor {
  constructor(options = {}) {
    this.getSnapshot = typeof options.getSnapshot === "function" ? options.getSnapshot : async () => ({});
    this.now = typeof options.now === "function" ? options.now : () => new Date();
    this.autoRepairEnabled = Boolean(options.autoRepairEnabled);
  }

  async evaluate() {
    const runtime = await this.getSnapshot();
    const diagnostics = runtime.schedule_diagnostics || {};
    const anomalies = [];
    const add = (code, severity, message, recommended_action) => anomalies.push({ code, severity, message, recommended_action });

    const dispatchable = Array.isArray(diagnostics.dispatchable_workers) ? diagnostics.dispatchable_workers : [];
    const active = new Set(Array.isArray(diagnostics.active_workers) ? diagnostics.active_workers : []);
    const dispatchableNotRunning = dispatchable.filter(workerId => !active.has(workerId));
    if (dispatchableNotRunning.length) {
      add(
        "DISPATCHABLE_WORKERS_NOT_RUNNING",
        "ERROR",
        `실행 가능한 워커 ${dispatchableNotRunning.join(", ")}가 작업을 받지 못하고 있습니다.`,
        "Schedule Tick을 다시 실행하고 워커별 전송 가능 상태를 재평가하십시오."
      );
    }

    const starved = Array.isArray(diagnostics.starved_workers) ? diagnostics.starved_workers : [];
    if (starved.length) {
      add(
        "WORKER_STARVATION_DETECTED",
        "ERROR",
        `활성 그룹의 워커 ${starved.join(", ")}가 배포 없이 대기하고 있습니다.`,
        "독립 실행 가능 작업 또는 준비 Epic을 같은 Cycle에서 배포하십시오."
      );
    }

    const orderGaps = Array.isArray(diagnostics.order_gaps) ? diagnostics.order_gaps : [];
    if (orderGaps.length) {
      add(
        "SCHEDULE_JOB_ORDER_GAP",
        "ERROR",
        orderGaps.map(gap => `${gap.worker_id}가 ${gap.skipped_order}번을 건너뛰고 ${gap.advanced_order}번으로 이동했습니다.`).join(" "),
        "건너뛴 작업의 실제 Terminal·Result Pointer를 확인하고 current_order를 재조정하십시오."
      );
    }

    const workers = diagnostics.workers || {};
    for (const [workerId, worker] of Object.entries(workers)) {
      const job = worker && worker.current_job;
      if (!job || job.status !== "BLOCKED_EXTERNAL") continue;
      const attempt = Number(job.attempt || 0);
      const retryLimit = Number(job.retry_limit || 0);
      if (attempt <= 1 && retryLimit > attempt) {
        add(
          "PREMATURE_BLOCKED_EXTERNAL",
          "ERROR",
          `${workerId}의 ${job.job_id}가 ${attempt}회 시도 후 BLOCKED_EXTERNAL로 종결되었습니다.`,
          "같은 오류 반복 여부를 확인하고 Source·명령·순서·경로·도구를 교정한 뒤 재시도하십시오."
        );
      }
      if (job.status === "RESULT_WAITING") {
        add(
          "WORKER_RESULT_WAITING_TOO_LONG",
          "WARNING",
          `${workerId}의 ${job.job_id}가 결과 대기 중입니다.`,
          "GitHub Result Watcher와 정확한 Result Pointer를 확인하십시오."
        );
      }
    }

    const runtimeState = runtime.automation_schedule && runtime.automation_schedule.runtime || {};
    if (runtimeState.running && runtimeState.last_tick_at) {
      const elapsed = this.now().getTime() - new Date(runtimeState.last_tick_at).getTime();
      if (elapsed > 60000) {
        add(
          "SCHEDULE_TICK_STALLED",
          "ERROR",
          `Schedule Tick이 ${Math.round(elapsed / 1000)}초 동안 갱신되지 않았습니다.`,
          "Schedule Runtime을 재평가하고 안전한 Tick 재실행을 수행하십시오."
        );
      }
    }

    const relayRuntime = runtime.automation_relay && runtime.automation_relay.runtime || {};
    if (relayRuntime.last_error) {
      add("COMMANDER_WORKER_RELAY_ERROR", "ERROR", `Commander-Worker Relay 오류: ${relayRuntime.last_error}`, "Relay 상태와 게시물 번호 인식 결과를 확인하십시오.");
    }
    if (relayRuntime.enabled === false) {
      add("COMMANDER_WORKER_RELAY_PAUSED", "WARNING", "Commander-Worker Relay가 정지되어 있습니다.", "Relay를 재시작하고 중복키를 유지한 채 상태를 재조정하십시오.");
    }

    const overallState = anomalies.some(item => item.severity === "ERROR") ? "ERROR" : anomalies.length ? "WARNING" : "HEALTHY";
    return {
      schema_version: "YOLLA_OPERATION_CONTROL_CENTER_SNAPSHOT_V5121",
      observed_at: this.now().toISOString(),
      overall_state: overallState,
      headline: overallState === "ERROR" ? `교정이 필요한 이상징후 ${anomalies.length}건이 발견되었습니다.` : overallState === "WARNING" ? `확인이 필요한 경고 ${anomalies.length}건이 있습니다.` : "현재 자동화 운영은 정상입니다.",
      runtime_status: { schedule_diagnostics: diagnostics },
      anomalies,
      safe_auto_repair_enabled: this.autoRepairEnabled
    };
  }
}

module.exports = { PanelActivityMonitor };
