'use strict';

class BackgroundBrowserDispatch {
  constructor({open, send, close, sleep = ms => new Promise(r => setTimeout(r, ms)), maxAttempts = 5, retryMs = 30000} = {}) {
    if (![open, send, close].every(fn => typeof fn === 'function')) throw new Error('DISPATCH_DEPENDENCY_MISSING');
    this.open = open; this.send = send; this.close = close; this.sleep = sleep;
    this.maxAttempts = maxAttempts; this.retryMs = retryMs; this.completed = new Set();
  }
  async dispatch(job) {
    if (!job || !job.dispatch_id || !job.target) throw new Error('INVALID_DISPATCH_JOB');
    if (this.completed.has(job.dispatch_id)) return {status:'DUPLICATE_SUPPRESSED', dispatch_id:job.dispatch_id};
    let lastError = null;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      let handle = null;
      try {
        handle = await this.open(job.target, {hidden:true, temporaryProfile:true});
        const receipt = await this.send(handle, job.payload);
        this.completed.add(job.dispatch_id);
        return {status:'PASS', dispatch_id:job.dispatch_id, attempt, receipt};
      } catch (error) {
        lastError = error;
        if (attempt < this.maxAttempts) await this.sleep(this.retryMs);
      } finally {
        if (handle) await this.close(handle);
      }
    }
    const error = new Error('BACKGROUND_DISPATCH_EXHAUSTED');
    error.cause = lastError; throw error;
  }
  snapshot() { return {completed:[...this.completed]}; }
  restore(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.completed)) throw new Error('INVALID_DISPATCH_SNAPSHOT');
    this.completed = new Set(snapshot.completed);
  }
}

module.exports = { BackgroundBrowserDispatch };
