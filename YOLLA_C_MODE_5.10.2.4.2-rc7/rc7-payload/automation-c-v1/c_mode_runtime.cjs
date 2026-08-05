'use strict';

const STATES = Object.freeze({ IDLE:'IDLE', START:'START', RUNNING:'RUNNING', PAUSED:'PAUSED', END:'END' });

class CRuntimeStateMachine {
  constructor(snapshot = null) {
    this.state = STATES.IDLE;
    this.receipts = new Set();
    this.wave = null;
    this.workerReports = new Map();
    this.progress = 0;
    this.publicationRequests = new Map();
    this.replacements = new Map();
    this.assistants = [];
    this.pausedFrom = null;
    if (snapshot) this.restore(snapshot);
  }

  start(receipts) {
    if (![STATES.IDLE, STATES.END].includes(this.state)) throw new Error('INVALID_START_STATE');
    if (!Array.isArray(receipts) || receipts.length !== 7 || new Set(receipts).size !== 7) throw new Error('START_REQUIRES_7_UNIQUE_RECEIPTS');
    this.receipts = new Set(receipts);
    this.state = STATES.START;
    return this.state;
  }

  registerWave(waveId, workerIds, startedAt) {
    if (this.state !== STATES.START && this.state !== STATES.RUNNING) throw new Error('WAVE_REQUIRES_ACTIVE_STATE');
    if (!Array.isArray(workerIds) || workerIds.length !== 6 || new Set(workerIds).size !== 6) throw new Error('WAVE_REQUIRES_6_UNIQUE_WORKERS');
    if (!waveId || !Number.isFinite(Date.parse(startedAt))) throw new Error('INVALID_WAVE');
    this.wave = { id: waveId, workers: [...workerIds], startedAt: new Date(startedAt).toISOString() };
    this.workerReports = new Map(workerIds.map(id => [id, null]));
    this.state = STATES.RUNNING;
    return this.wave;
  }

  report(workerId, status, progress) {
    if (this.state !== STATES.RUNNING) throw new Error('REPORT_REQUIRES_RUNNING');
    if (!this.workerReports.has(workerId)) throw new Error('UNKNOWN_WORKER');
    if (!['REPORTED','END'].includes(status)) throw new Error('INVALID_REPORT_STATUS');
    if (!Number.isFinite(progress) || progress < this.progress || progress > 100) throw new Error('PROGRESS_MUST_BE_MONOTONIC_0_100');
    this.progress = progress;
    this.workerReports.set(workerId, { status, progress });
  }

  evaluate20Minutes(now) {
    this.#assertElapsed(now, 20);
    const missing = [...this.workerReports].filter(([,v]) => v === null).map(([k]) => k);
    if (missing.length === 0) return { action:'ADVANCE_WAVE', missing };
    if (missing.length <= 2) return { action:'RETRY_MISSING_ONLY', missing };
    return { action:'PAUSE_AND_ESCALATE', missing };
  }

  evaluate90Minutes(now, assistantPool) {
    this.#assertElapsed(now, 90);
    const missing = [...this.workerReports].filter(([,v]) => v === null).map(([k]) => k);
    if (missing.length === 0) return { action:'NO_ASSISTANTS', assistants:[] };
    const unique = [...new Set(assistantPool || [])].filter(x => !this.wave.workers.includes(x));
    if (unique.length < 2) throw new Error('EXACTLY_2_ASSISTANTS_REQUIRED');
    this.assistants = unique.slice(0,2);
    return { action:'ASSIGN_ASSISTANTS', assistants:[...this.assistants], missing };
  }

  requestPublication(workerId) {
    const count = (this.publicationRequests.get(workerId) || 0) + 1;
    this.publicationRequests.set(workerId, count);
    if (count >= 4 && !this.replacements.has(workerId)) {
      const replacement = `${workerId}-R1`;
      this.replacements.set(workerId, replacement);
      return { action:'REPLACE_WORKER', workerId, replacement, count };
    }
    return { action:'REQUEST_PUBLICATION', workerId, count };
  }

  pause() {
    if (![STATES.START, STATES.RUNNING].includes(this.state)) throw new Error('PAUSE_REQUIRES_ACTIVE_STATE');
    this.pausedFrom = this.state;
    this.state = STATES.PAUSED;
  }

  resume() {
    if (this.state !== STATES.PAUSED) throw new Error('RESUME_REQUIRES_PAUSED');
    this.state = this.pausedFrom || STATES.RUNNING;
    this.pausedFrom = null;
  }

  end() {
    if (![STATES.START, STATES.RUNNING, STATES.PAUSED].includes(this.state)) throw new Error('END_REQUIRES_STARTED_STATE');
    this.state = STATES.END;
  }

  snapshot() {
    return JSON.parse(JSON.stringify({
      state:this.state, receipts:[...this.receipts], wave:this.wave,
      workerReports:[...this.workerReports], progress:this.progress,
      publicationRequests:[...this.publicationRequests], replacements:[...this.replacements],
      assistants:this.assistants, pausedFrom:this.pausedFrom
    }));
  }

  restore(s) {
    if (!s || !Object.values(STATES).includes(s.state)) throw new Error('INVALID_SNAPSHOT');
    this.state=s.state; this.receipts=new Set(s.receipts||[]); this.wave=s.wave||null;
    this.workerReports=new Map(s.workerReports||[]); this.progress=s.progress||0;
    this.publicationRequests=new Map(s.publicationRequests||[]); this.replacements=new Map(s.replacements||[]);
    this.assistants=[...(s.assistants||[])]; this.pausedFrom=s.pausedFrom||null;
  }

  #assertElapsed(now, minutes) {
    if (!this.wave) throw new Error('NO_ACTIVE_WAVE');
    const elapsed = Date.parse(now) - Date.parse(this.wave.startedAt);
    if (!Number.isFinite(elapsed) || elapsed < minutes * 60000) throw new Error(`WAIT_${minutes}_MINUTES`);
  }
}

module.exports = { CRuntimeStateMachine, STATES };
