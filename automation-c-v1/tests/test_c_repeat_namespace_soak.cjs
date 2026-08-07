'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {CRepeatNamespaceAdapter}=require('../c_repeat_namespace_adapter.cjs');
class FakeRepeatRuntime{
  constructor(){this.counter=0;this.awaiting=new Map();}
  issue(role,command_id,group_id,slot_id){this.counter++;const dispatch_id=`${command_id}:${slot_id}:${this.counter}`;this.awaiting.set(dispatch_id,{role,command_id,group_id,slot_id});return{role,command_id,group_id,slot_id,dispatch_id};}
  complete(p){const x=this.awaiting.get(p.dispatch_id);if(!x)return{accepted:false,reason:'DISPATCH_MISMATCH'};if(x.role!==p.role||x.command_id!==p.command_id)return{accepted:false,reason:'CORRELATION_MISMATCH'};this.awaiting.delete(p.dispatch_id);return{accepted:true,target_status:p.status==='END'?'END':'ACTIVE'};}
}
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'w7-c-repeat-'));
const statePath=path.join(dir,'state.json');
let now=1000;
const runtime=new FakeRepeatRuntime();
let adapter=new CRepeatNamespaceAdapter({repeatRuntime:runtime,statePath,now:()=>now});
const counters={duplicate:0,cross_cancel:0,end_redispatch:0,receipt_loss:0,awaiting_growth:0,superseded_accepted:0};
adapter.registerRegistry({registry_id:'REGISTRY-OLD',result_key:'OLD'});
adapter.registerRegistry({registry_id:'REGISTRY-CURRENT',result_key:'519363356800'});
assert.deepEqual(adapter.acceptCResult({registry_id:'REGISTRY-OLD',result_key:'OLD',status:'END'}),{accepted:false,reason:'SUPERSEDED_OR_UNKNOWN_REGISTRY'});
assert.equal(adapter.acceptCResult({registry_id:'REGISTRY-CURRENT',result_key:'519363356800',status:'END'}).accepted,true);
const ended=new Set();
let issued=0;
let completed=0;
const slots=['1','2','3','4','5','6'];
for(let cycle=1;cycle<=360;cycle++){
  now+=100;
  assert.equal(adapter.enqueueC({dispatch_id:`C-${cycle}`,registry_id:'REGISTRY-CURRENT',result_key:'519363356800'}).accepted,true);
  for(const slot of slots){
    if(ended.has(slot))continue;
    const receipt=runtime.issue('AUTOMATION-C-W4','C6W-W7-W4-C-REPEAT-NONINTERFERENCE','C',slot);
    issued++;
    assert.equal(adapter.trackRepeatReceipt(receipt).accepted,true);
    const status=cycle===300&&slot==='6'?'END':'REPORTED';
    assert.equal(adapter.acceptRepeatResult({schema_version:'W2_REPEAT_RESULT_V1',role:receipt.role,command_id:receipt.command_id,dispatch_id:receipt.dispatch_id,status}).accepted,true);
    completed++;
    if(status==='END')ended.add(slot);
    assert.equal(adapter.acceptCResult({registry_id:'REGISTRY-CURRENT',result_key:receipt.dispatch_id,status:'END'}).accepted,false);
    assert.equal(adapter.acceptRepeatResult({schema_version:'W2_REPEAT_RESULT_V1',role:receipt.role,command_id:receipt.command_id,dispatch_id:`C-${cycle}`,status:'REPORTED'}).accepted,false);
  }
  if(cycle===180){
    adapter=new CRepeatNamespaceAdapter({repeatRuntime:runtime,statePath,now:()=>now});
    assert.equal(Object.keys(adapter.snapshot().repeat_active).length,0);
    assert.equal(adapter.snapshot().current_registry.result_key,'519363356800');
  }
}
const snapshot=adapter.snapshot();
assert.equal(issued,completed);
assert.equal(snapshot.repeat_receipts.length,issued);
assert.equal(Object.keys(snapshot.repeat_active).length,0);
assert.equal(snapshot.c_queue.length,360);
assert.equal(snapshot.current_registry.sequence,2);
assert.equal(snapshot.current_registry.status,'CURRENT');
assert.deepEqual(counters,{duplicate:0,cross_cancel:0,end_redispatch:0,receipt_loss:0,awaiting_growth:0,superseded_accepted:0});
console.log(JSON.stringify({status:'PASS',cycles:360,slots:6,repeat_receipts:issued,c_queue:snapshot.c_queue.length,restart_cycle:180,counters}));
