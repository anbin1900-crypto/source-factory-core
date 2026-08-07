const WORKER = new Set(['IDLE','DISPATCHED','GENERATING','COMPLETE','BLOCKED','UNKNOWN']);
const SENSOR = new Set(['IDLE','DISPATCHED','GENERATING','COMPLETE','BLOCKED','UNKNOWN','LIKELY_COMPLETE']);
const TASK = new Set(['IDLE','DISPATCHED','GENERATING','COMPLETE','COMPLETE_RESULT_PENDING','BLOCKED','UNKNOWN']);
const clone = v => v === undefined ? undefined : structuredClone(v);
const ts = v => Number.isFinite(Date.parse(v || '')) ? Date.parse(v) : 0;

export class WorkerStateCycleViewModel {
  constructor(cycleId='AI001-AB-SITE-ANALYZER-PREBUILD-CYCLE3-20260807-001') {
    this.cycleId = cycleId;
    this.cards = new Map();
    this.eventIds = new Set();
    this.lastByCommand = new Map();
    this.ignored = {duplicate:0, stale:0, invalid:0};
  }

  ingest(event) {
    if (!event || event.schema_version !== 'WORKER_BROWSER_STATE_EVENT_V1') return this._invalid('SCHEMA');
    for (const k of ['worker_id','page_id','command_id','browser_state','observed_at']) if (!event[k]) return this._invalid(`MISSING_${k}`);
    const sensor = String(event.browser_state).toUpperCase();
    if (!SENSOR.has(sensor)) return this._invalid('BROWSER_STATE');
    if (event.event_id && this.eventIds.has(event.event_id)) { this.ignored.duplicate++; return {accepted:false, reason:'DUPLICATE'}; }
    const key = `${event.worker_id}:${event.command_id}`;
    const priorMeta = this.lastByCommand.get(key);
    const seq = Number(event.sequence || 0);
    if (priorMeta) {
      if (seq > 0 && priorMeta.sequence > 0 && seq < priorMeta.sequence) { this.ignored.stale++; return {accepted:false, reason:'STALE_SEQUENCE'}; }
      if ((seq === 0 || priorMeta.sequence === 0) && ts(event.observed_at) < priorMeta.observedAt) { this.ignored.stale++; return {accepted:false, reason:'STALE_TIME'}; }
    }
    if (event.event_id) this.eventIds.add(event.event_id);
    this.lastByCommand.set(key, {sequence:seq, observedAt:ts(event.observed_at)});

    const prior = this.cards.get(event.worker_id);
    let taskState = String(event.task_status || sensor).toUpperCase();
    if (sensor === 'LIKELY_COMPLETE') taskState = 'UNKNOWN';
    if (!TASK.has(taskState)) taskState = 'UNKNOWN';
    const selectorStatus = String(event.selector_status || 'NOT_APPLICABLE').toUpperCase();
    const selectorMiss = selectorStatus === 'SELECTOR_MISS';
    const resultPointer = event.latest_result_pointer || null;
    const terminal = event.latest_terminal || null;
    const blocker = event.blocker || null;

    if ((sensor === 'COMPLETE' || taskState === 'COMPLETE') && !resultPointer) taskState = 'COMPLETE_RESULT_PENDING';
    if (sensor === 'BLOCKED' && !blocker) taskState = 'UNKNOWN';
    if (selectorMiss || sensor === 'UNKNOWN' || sensor === 'LIKELY_COMPLETE') taskState = taskState === 'BLOCKED' ? 'BLOCKED' : 'UNKNOWN';

    let workerState;
    if (taskState === 'COMPLETE' || taskState === 'COMPLETE_RESULT_PENDING') workerState = 'COMPLETE';
    else if (TASK.has(taskState) && WORKER.has(taskState)) workerState = taskState;
    else workerState = 'UNKNOWN';
    if (selectorMiss || sensor === 'UNKNOWN' || sensor === 'LIKELY_COMPLETE') workerState = blocker ? 'BLOCKED' : 'UNKNOWN';

    const badges = [];
    if (taskState === 'COMPLETE_RESULT_PENDING') badges.push('COMPLETE_RESULT_PENDING');
    if (selectorMiss) badges.push('SELECTOR_MISS');
    if (sensor === 'LIKELY_COMPLETE') badges.push('LIKELY_COMPLETE_UNVERIFIED');

    const card = {
      schema_version:'WORKER_STATE_CARD_RUNTIME_V1',
      worker_id:event.worker_id,
      worker_state:workerState,
      browser_state:{sensor_state:sensor,page_id:event.page_id,selector_status:selectorStatus,generation_ui_active:Boolean(event.generation_ui_active),dom_stable:event.dom_stable === true,observed_at:event.observed_at},
      task_status:{state:taskState,command_id:event.command_id,latest_terminal:terminal,latest_result_pointer:resultPointer,blocker,observed_at:event.observed_at},
      command_id:event.command_id,
      latest_terminal:terminal,
      latest_result_pointer:resultPointer,
      observed_at:event.observed_at,
      badges,
      previous_worker_state:prior?.worker_state || null
    };
    this.cards.set(event.worker_id, card);
    return {accepted:true, card:clone(card), summary:this.summary()};
  }

  summary() {
    const cards=[...this.cards.values()];
    const s={total:cards.length,complete:0,generating:0,blocked:0,unknown:0,idle:0,dispatched:0,result_pending:0,cycle_state:'IDLE'};
    for (const c of cards) {
      if (c.worker_state === 'COMPLETE') s.complete++;
      if (c.worker_state === 'GENERATING') s.generating++;
      if (c.worker_state === 'BLOCKED') s.blocked++;
      if (c.worker_state === 'UNKNOWN') s.unknown++;
      if (c.worker_state === 'IDLE') s.idle++;
      if (c.worker_state === 'DISPATCHED') s.dispatched++;
      if (c.task_status.state === 'COMPLETE_RESULT_PENDING') s.result_pending++;
    }
    if (s.unknown > 0) s.cycle_state='UNKNOWN';
    else if (s.blocked > 0) s.cycle_state='BLOCKED';
    else if (s.total > 0 && s.complete === s.total && s.result_pending > 0) s.cycle_state='RESULT_PENDING';
    else if (s.total > 0 && s.complete === s.total) s.cycle_state='COMPLETE';
    else if (s.generating > 0 || s.dispatched > 0) s.cycle_state='ACTIVE';
    else s.cycle_state='IDLE';
    return s;
  }

  export() { return {schema_version:'WORKER_STATE_AND_CYCLE_STATUS_PANEL_EXPORT_V1',cycle_id:this.cycleId,workers:[...this.cards.values()].map(clone),cycle_summary:this.summary(),ignored_events:clone(this.ignored)}; }
  _invalid(reason){ this.ignored.invalid++; return {accepted:false, reason:`INVALID_${reason}`}; }
}
