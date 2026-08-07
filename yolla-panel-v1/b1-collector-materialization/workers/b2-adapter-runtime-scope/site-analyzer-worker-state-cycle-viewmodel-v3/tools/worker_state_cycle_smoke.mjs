import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {WorkerStateCycleViewModel} from '../WORKER_STATE_PANEL_VIEWMODEL_V1.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
for (const f of ['WORKER_STATE_CARD_VIEWMODEL_V1.json','CYCLE_STATUS_VIEWMODEL_V1.json','WORKER_STATE_EVENT_BINDING_V1.json']) JSON.parse(fs.readFileSync(path.join(ROOT,f),'utf8'));
const fixture=JSON.parse(fs.readFileSync(path.join(ROOT,'fixtures/WORKER_BROWSER_STATE_EVENT_STREAM_FIXTURE_V1.json'),'utf8'));
const vm=new WorkerStateCycleViewModel();
let pendingSeen=false;
for (const event of fixture.events) {
  const out=vm.ingest(event); assert.equal(out.accepted,true);
  if (event.event_id==='e3') { assert.equal(out.card.worker_state,'COMPLETE'); assert.equal(out.card.task_status.state,'COMPLETE_RESULT_PENDING'); pendingSeen=true; }
}
const exp=vm.export();
const a3=exp.workers.find(x=>x.worker_id==='A-3');
const b1=exp.workers.find(x=>x.worker_id==='B-1');
const a5=exp.workers.find(x=>x.worker_id==='A-5');
const a4=exp.workers.find(x=>x.worker_id==='A-4');
assert.equal(pendingSeen,true);
assert.equal(a3.task_status.state,'COMPLETE'); assert.equal(a3.latest_result_pointer,'A3_RESULT_POINTER');
assert.equal(b1.browser_state.sensor_state,'GENERATING'); assert.equal(b1.task_status.state,'GENERATING');
assert.equal(a5.worker_state,'BLOCKED'); assert.equal(a5.task_status.blocker,'FIXTURE_BLOCKER');
assert.equal(a4.worker_state,'UNKNOWN'); assert.ok(a4.badges.includes('SELECTOR_MISS'));
assert.deepEqual(exp.cycle_summary,{total:4,complete:1,generating:1,blocked:1,unknown:1,idle:0,dispatched:0,result_pending:0,cycle_state:'UNKNOWN'});
const dup=vm.ingest(fixture.events[0]); assert.equal(dup.accepted,false); assert.equal(dup.reason,'DUPLICATE');
const stale=vm.ingest({...fixture.events[4],event_id:'stale-b1',sequence:0,observed_at:'2026-08-07T22:19:00+09:00'}); assert.equal(stale.accepted,false); assert.equal(stale.reason,'STALE_TIME');
const likely=vm.ingest({schema_version:'WORKER_BROWSER_STATE_EVENT_V1',event_id:'likely',worker_id:'A-6',page_id:'page-a6',command_id:'cmd-a6',browser_state:'LIKELY_COMPLETE',selector_status:'PRIMARY_MATCH',observed_at:'2026-08-07T22:20:20+09:00',sequence:1}); assert.equal(likely.card.worker_state,'UNKNOWN'); assert.equal(likely.card.task_status.state,'UNKNOWN');
console.log(JSON.stringify({status:'PASS',assertions:18,summary:exp.cycle_summary,complete_result_pending_verified:true,selector_fail_safe:true,likely_complete_not_promoted:true,duplicate_suppression:true,stale_suppression:true}));
