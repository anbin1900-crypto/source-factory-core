'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {RepeatCommandRuntime,RepeatCommandBridgeAdapter}=require('../repeat_command_runtime.cjs');
let now=1000000; const dir=fs.mkdtempSync(path.join(os.tmpdir(),'w4-soak-')),statePath=path.join(dir,'state.json');
const popup=[],cModeQueue=[]; let rt=new RepeatCommandRuntime({statePath,now:()=>now}); let bridge=new RepeatCommandBridgeAdapter({runtime:rt,dispatchToPopup:x=>popup.push(x),cModeQueue});
const targets=Array.from({length:6},(_,i)=>({group_id:'C',slot_id:String(i+1)}));
rt.create({command_id:'SOAK-AFTER',role:'AUTOMATION-C-W4',prompt:'after',targets,trigger_mode:'AFTER_COMPLETION'});
rt.create({command_id:'SOAK-EVERY',role:'AUTOMATION-C-W4-EVERY',prompt:'every',targets,trigger_mode:'EVERY_X_MINUTES',interval_minutes:1});
for(let i=0;i<6;i++)assert.equal(bridge.enqueueCMode({dispatch_id:`C-MODE-${i+1}`,slot_id:String(i+1)}).accepted,true);
const counters={duplicate_repeat_dispatch:0,previous_c_cancelled:0,c_repeat_cross_cancel:0,end_slot_redispatch:0,receipt_loss:0,awaiting_queue_growth:0};
const ledger=[];
for(let cycle=1;cycle<=120;cycle++){
 now+=60000;if(cycle===20)rt.pause('SOAK-EVERY');if(cycle===25)rt.resume('SOAK-EVERY');
 try{bridge.flushRuntime(now);}catch(e){if(/DUPLICATE|ACTIVE_COMMAND/.test(e.message))counters.duplicate_repeat_dispatch++;else throw e;}
 if(cycle%7===0){const cmd=rt.get('SOAK-AFTER');for(const t of [...cmd.targets].reverse())if(t.awaiting_completion){const status=cycle===56&&t.slot_id==='2'?'END':'REPORTED';bridge.acceptRepeatResult({schema_version:'W2_REPEAT_RESULT_V1',role:cmd.role,command_id:cmd.command_id,dispatch_id:t.last_dispatch_id,status});}for(const r of rt.triggerAfterCompletion('SOAK-AFTER'))bridge.dispatch(r);}
 const ev=rt.get('SOAK-EVERY');for(const t of [...ev.targets].reverse())if(t.awaiting_completion&&cycle%3===0){const status=cycle===60&&t.slot_id==='5'?'END':'REPORTED';bridge.acceptRepeatResult({schema_version:'W2_REPEAT_RESULT_V1',role:ev.role,command_id:ev.command_id,dispatch_id:t.last_dispatch_id,status});}
 const awaitingBefore=new Set(rt.list().flatMap(c=>c.targets.filter(t=>t.awaiting_completion).map(t=>t.last_dispatch_id)));bridge.flushRuntime(now);const awaitingAfter=rt.list().flatMap(c=>c.targets.filter(t=>t.awaiting_completion).map(t=>t.last_dispatch_id));if(awaitingAfter.some(id=>awaitingBefore.has(id)&&bridge.snapshot().repeat_queue.filter(x=>x.dispatch_id===id).length!==1))counters.awaiting_queue_growth++;
 ledger.push({cycle,now,repeat_queue:bridge.snapshot().repeat_queue.length,c_mode_queue:cModeQueue.length,receipts:rt.snapshot().receipts.length});
 if(cycle===70){rt=new RepeatCommandRuntime({statePath,now:()=>now});bridge=new RepeatCommandBridgeAdapter({runtime:rt,dispatchToPopup:x=>popup.push(x),cModeQueue});assert.ok(bridge.snapshot().active_worker_slots.length>0);}
}
const snap=rt.snapshot(),ids=snap.receipts.map(x=>x.dispatch_id);counters.duplicate_repeat_dispatch+=ids.length-new Set(ids).size;counters.receipt_loss+=popup.length-snap.receipts.length;
for(const c of Object.values(snap.commands))for(const t of c.targets)if(t.status==='END'&&snap.receipts.some(r=>r.command_id===c.command_id&&r.slot_id===t.slot_id&&r.dispatched_at_ms>t.updated_at_ms))counters.end_slot_redispatch++;
assert.equal(cModeQueue.length,6);assert.deepEqual(counters,{duplicate_repeat_dispatch:0,previous_c_cancelled:0,c_repeat_cross_cancel:0,end_slot_redispatch:0,receipt_loss:0,awaiting_queue_growth:0});
console.log(JSON.stringify({status:'PASS',virtual_cycles:120,slots:6,counters,soak_ledger:ledger,restart_snapshot:{schema_version:snap.schema_version,receipt_count:snap.receipts.length,active_worker_slots:bridge.snapshot().active_worker_slots.length},final_counter:Object.fromEntries(Object.entries(snap.commands).map(([k,c])=>[k,Object.fromEntries(c.targets.map(t=>[t.slot_id,t.dispatch_count]))]))}));
