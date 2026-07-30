import fs from 'node:fs/promises';
import path from 'node:path';

export async function readJsonFile(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

export async function readDailyPlan(planPath) {
  const plan = await readJsonFile(planPath);
  validateDailyPlan(plan);
  return plan;
}

export function validateDailyPlan(plan) {
  if (!plan || typeof plan !== 'object') throw new Error('Daily plan must be an object');
  if (!plan.date) throw new Error('Daily plan missing date');
  if (!plan.run_id) throw new Error('Daily plan missing run_id');
  if (!Array.isArray(plan.tasks)) throw new Error('Daily plan tasks must be an array');
  for (const task of plan.tasks) {
    if (!Number.isInteger(task.order)) throw new Error('Task missing integer order');
    if (!task.task_id) throw new Error(`Task ${task.order} missing task_id`);
    if (!task.prompt_path) throw new Error(`Task ${task.order} missing prompt_path`);
    if (!task.output_dir) throw new Error(`Task ${task.order} missing output_dir`);
  }
}

export function sortTasksByOrder(tasks) {
  return [...tasks].sort((a, b) => a.order - b.order);
}

export async function resolvePromptText(rootDir, promptPath) {
  const fullPath = path.resolve(rootDir, promptPath);
  return fs.readFile(fullPath, 'utf8');
}
