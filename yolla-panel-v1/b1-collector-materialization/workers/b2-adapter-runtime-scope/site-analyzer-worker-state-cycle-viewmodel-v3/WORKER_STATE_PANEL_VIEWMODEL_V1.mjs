const WORKER = new Set(['IDLE','DISPATCHED','GENERATING','COMPLETE','BLOCKED','UNKNOWN']);
const SENSOR = new Set(['IDLE','DISPATCHED','GENERATING','COMPLETE','BLOCKED','UNKNOWN']);
const clone = v => v === undefined ? undefined : structuredClone(v);
const parseTime = v => Number.isFinite(Date.parse(v || '')) ? Date.parse(v) : 0;

function normalizedTask(raw, browser, resultPointer, blocker) {
  const v=String(raw || '').toUpperCase();
  if (v === 'RESPONSE_COMPLETE_RESULT_PENDING') return 'COMPLETE_RESULT_PENDING';
  if (v === 'RESPONSE_COMPLETE_RESULT_BOUND') return resultPointer ? 'COMPLETE' : 'COMPLETE_RESULT_PENDING';
  if (['EXECUTING','RUNNING','GENERATING'].includes(v)) return 'GENERATING';
  if (['RECEIVED','ACCEPTED','DISPATCHED'].includes(v)) return 'DISPATCHED';
  if (v === 'BLOCKED') return blocker ? 'BLOCKED' : 'UNKNOWN';
  if (v === 'COMPLETE') return resultPointer ? 'COMPLETE' : 'COMPLETE_RESULT_PENDING';
  if (['IDLE','UNKNOWN'].includes(v)) return v;
  if (browser === 'COMPLETE') return resultPointer ? 'COMPLETE' : 'COMPLETE_RESULT_PENDING';
  if (browser === 'BLOCKED') return blocker ? 'BLOCKED' : 'UNKNOWN';
  if (browser === 'GENERATING') return 'GENERATING';
  if (browser === 'DISPATCHED') return 'DISPATCHED';
  return 'UNKNOWN';
}

export class WorkerStateCycleViewModel {
  constructor(cycleId='AI001-AB-SITE-ANALYZER-PREBUILD-CYCLE3-20260807-001') {
    this.cycleId=cycleId; this.cards=new Map(); this.eventIds=new Set(); this.lastByCorrelation=new Map(); this.ignored={duplicate:0,stale:0,invalid:0};
  }
  normalize(input) {
    if (!input || input.schema_version !== 'WORKER_BROWSER_STATE_EVENT_V1') return null;
    if ('state' in input && 'observed_at' in input && 'page_id' in input) {
      return {
        source_schema:'A3_RAW_SENSOR', event_id:input.event_id, worker_id:input.worker_id, page_id:input.page_id,
        command_id:input.command_id || null, cycle_id:this.cycleId, browser_state:String(input.state||'UNKNOWN').toUpperCase(),
        raw_task_status:input.work_status || input.state || 'UNKNOWN', latest_terminal:input.terminal || null, latest_result_pointer:null,
        blocker:input.blocker || null, observed_at:input.observed_at, sequence:Number(input.sequence||0),
        selector_status:input.selector_match === false ? 'SELECTOR_MISS' : 'MATCH', completion_assessment:input.completion_assessment || 'NONE',
        generation_ui_active:Boolean(input.generating_ui_active), dom_stable_ms:Number(input.dom_stable_ms||0), source_pointer:null
      };
    }
    if ('browser_state' in input && 'occurred_at' in input && 'cycle_id' in input) {
      return {
        source_schema:'B1_AGGREGATED', event_id:input.event_id, worker_id:input.worker_id, page_id:null,
        command_id:input.command_id || null, cycle_id:input.cycle_id, browser_state:String(input.browser_state||'UNKNOWN').toUpperCase(),
        raw_task_status:input.task_status || 'UNKNOWN', latest_terminal:null,
        latest_result_pointer:input.result_pointer || input.result_envelope_pointer || null, blocker:input.blocker || null,
        observed_at:input.occurred_at, sequence:Number(input.sequence_no||0), selector_status:'NOT_APPLICABLE',
        completion_assessment:'NONE', generation_ui_active:input.browser_state === 'GENERATING', dom_stable_ms:0, source_pointer:input.source_pointer || null
      };
    }
    return null;
  }
  ingest(input) {
    const event=this.normalize(input); if (!event) return this._invalid('UNSUPPORTED_SHAPE');
    if (!event.worker_id || !event.event_id || !event.observed_at || !SENSOR.has(event.browser_state)) return this._invalid('REQUIRED');
    if (this.eventIds.has(event.event_id)) { this.ignored.duplicate++; return {accepted:false,reason:'DUPLICATE'}; }
    const correlation=`${event.worker_id}:${event.command_id || event.page_id || 'UNBOUND'}`;
    const priorMeta=this.lastByCorrelation.get(correlation);
    if (priorMeta) {
      if (event.sequence > 0 && priorMeta.sequence > 0 && event.sequence < priorMeta.sequence) { this.ignored.stale++; return {accepted:false,reason:'STALE_SEQUENCE'}; }
      if ((event.sequence===0 || priorMeta.sequence===0) && parseTime(event.observed_at) < priorMeta.observed_at) { this.ignored.stale++; return {accepted:false,reason:'STALE_TIME'}; }
    }
    this.eventIds.add(event.event_id); this.lastByCorrelation.set(correlation,{sequence:event.sequence,observed_at:parseTime(event.observed_at)});
    const prior=this.cards.get(event.worker_id);
    if (event.source_schema==='B1_AGGREGATED' && prior) {
      if (!event.page_id) event.page_id=prior.browser_state.page_id || null;
      if (!event.latest_terminal) event.latest_terminal=prior.latest_terminal || null;
    }
    const likely=event.completion_assessment==='LIKELY_COMPLETE';
    const selectorMiss=event.selector_status==='SELECTOR_MISS';
    let taskState=normalizedTask(event.raw_task_status,event.browser_state,event.latest_result_pointer,event.blocker);
    if (likely || selectorMiss || event.browser_state==='UNKNOWN') taskState=event.blocker ? 'BLOCKED' : 'UNKNOWN';
    if (event.browser_state==='BLOCKED' && !event.blocker) taskState='UNKNOWN';
    let workerState=taskState==='COMPLETE_RESULT_PENDING'?'COMPLETE':taskState;
    if (!WORKER.has(workerState)) workerState='UNKNOWN';
    if (likely || selectorMiss || event.browser_state==='UNKNOWN') workerState=event.blocker?'BLOCKED':'UNKNOWN';
    const badges=[];
    if(taskState==='COMPLETE_RESULT_PENDING')badges.push('COMPLETE_RESULT_PENDING');
    if(selectorMiss)badges.push('SELECTOR_MISS');
    if(likely)badges.push('LIKELY_COMPLETE_UNVERIFIED');
    if(!event.command_id)badges.push('COMMAND_ID_PENDING');
    const correlationState=!event.command_id?'COMMAND_ID_PENDING':(!event.page_id?'PAGE_ID_PENDING':'BOUND');
    const card={
      schema_version:'WORKER_STATE_CARD_RUNTIME_V1', worker_id:event.worker_id, worker_state:workerState,
      browser_state:{source_schema:event.source_schema,sensor_state:event.browser_state,page_id:event.page_id,selector_status:event.selector_status,completion_assessment:event.completion_assessment,generation_ui_active:event.generation_ui_active,dom_stable_ms:event.dom_stable_ms,observed_at:event.observed_at},
      task_status:{state:taskState,raw_state:event.raw_task_status,command_id:event.command_id,latest_terminal:event.latest_terminal,latest_result_pointer:event.latest_result_pointer,blocker:event.blocker,observed_at:event.observed_at},
      command_id:event.command_id, latest_terminal:event.latest_terminal, latest_result_pointer:event.latest_result_pointer,
      observed_at:event.observed_at, source_pointer:event.source_pointer, correlation_state:correlationState, badges, previous_worker_state:prior?.worker_state||null
    };
    this.cards.set(event.worker_id,card); return {accepted:true,card:clone(card),summary:this.summary()};
  }
  summary(){
    const cards=[...this.cards.values()]; const s={total:cards.length,complete:0,generating:0,blocked:0,unknown:0,idle:0,dispatched:0,result_pending:0,cycle_state:'IDLE'};
    for(const c of cards){if(c.worker_state==='COMPLETE')s.complete++;if(c.worker_state==='GENERATING')s.generating++;if(c.worker_state==='BLOCKED')s.blocked++;if(c.worker_state==='UNKNOWN')s.unknown++;if(c.worker_state==='IDLE')s.idle++;if(c.worker_state==='DISPATCHED')s.dispatched++;if(c.task_status.state==='COMPLETE_RESULT_PENDING')s.result_pending++;}
    if(s.unknown>0)s.cycle_state='UNKNOWN';else if(s.blocked>0)s.cycle_state='BLOCKED';else if(s.total>0&&s.complete===s.total&&s.result_pending>0)s.cycle_state='RESULT_PENDING';else if(s.total>0&&s.complete===s.total)s.cycle_state='COMPLETE';else if(s.generating>0||s.dispatched>0)s.cycle_state='ACTIVE';else s.cycle_state='IDLE'; return s;
  }
  export(){return {schema_version:'WORKER_STATE_AND_CYCLE_STATUS_PANEL_EXPORT_V1',cycle_id:this.cycleId,workers:[...this.cards.values()].map(clone),cycle_summary:this.summary(),ignored_events:clone(this.ignored)};}
  _invalid(reason){this.ignored.invalid++;return {accepted:false,reason:`INVALID_${reason}`};}
}
