export const TASK_STATUS = Object.freeze({
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  DONE: 'DONE',
  FAILED: 'FAILED',
  BLOCKED: 'BLOCKED',
  SKIPPED: 'SKIPPED'
});

export function nextPendingTask(tasks) {
  return [...tasks]
    .sort((a, b) => a.order - b.order)
    .find((task) => !task.status || task.status === TASK_STATUS.PENDING) || null;
}

export function markTaskStatus(tasks, order, status, extra = {}) {
  return tasks.map((task) => {
    if (task.order !== order) return task;
    return {
      ...task,
      status,
      updated_at: new Date().toISOString(),
      ...extra
    };
  });
}

export function buildRunOutputPath(task) {
  return `${task.output_dir.replace(/\/$/, '')}/output.txt`;
}

export function buildWorkerReportPath(task) {
  return `${task.output_dir.replace(/\/$/, '')}/WORKER_REPORT.md`;
}

export function buildResultPath(task) {
  return `${task.output_dir.replace(/\/$/, '')}/RESULT.json`;
}
