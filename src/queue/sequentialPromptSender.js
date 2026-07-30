export class SequentialPromptSender {
  constructor({ sendPrompt, cooldownMs = 120000, onEvent = () => {} }) {
    if (typeof sendPrompt !== 'function') throw new Error('sendPrompt function is required');
    this.sendPrompt = sendPrompt;
    this.cooldownMs = cooldownMs;
    this.onEvent = onEvent;
  }

  async run(tasks) {
    const results = [];
    for (const task of tasks) {
      this.onEvent({ type: 'TASK_START', task_id: task.task_id, order: task.order });
      const result = await this.sendPrompt(task);
      results.push({ task, result });
      this.onEvent({ type: 'TASK_DONE', task_id: task.task_id, order: task.order });
      await sleep(this.cooldownMs);
    }
    return results;
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
