'use strict';
const assert = require('node:assert/strict');
const { ContextAwareMessageLoop } = require('./context_aware_message_loop.cjs');

async function happy() {
  let tick = 0;
  const events=[]; const panels=[];
  const loop = new ContextAwareMessageLoop({
    identifyContext: async () => ({context_id:'ctx-001',context_name:'D-2 Worker'}),
    sendMessage: async x => ({accepted:true,dispatch_id:'d-1',context_id:x.context_id}),
    readStatus: async x => ({context_id:x.context_id,status: ++tick >= 2 ? 'COMPLETED':'WORKING'}),
    fetchReply: async x => ({context_id:x.context_id,text:'done',sha256:'abc'}),
    appendEvent: async e => events.push(e),
    updatePanel: async p => panels.push(p),
    sleep: async () => {}
  }, {maxPolls:3, pollDelayMs:0, now:(()=>{let n=0; return ()=>new Date(1700000000000+(n++*1000));})()});
  const r=await loop.run({cycle_id:'c1',worker_id:'D-6',command:'do',context_selector:{}});
  assert.equal(r.ok,true);
  assert.equal(r.run.status,'COMPLETED');
  assert.equal(r.run.result_return_status,'RETURNED_TO_D1');
  assert.equal(r.panel.current_worker,'D-6');
  assert.equal(r.panel.context_id,'ctx-001');
  assert.ok(events.some(e=>e.event_type==='WORKING'));
  assert.ok(events.some(e=>e.event_type==='COMPLETED'));
  assert.ok(panels.length >= 5);
}

async function crossContextFails() {
  const loop = new ContextAwareMessageLoop({
    identifyContext: async () => ({context_id:'ctx-A',context_name:'A'}),
    sendMessage: async () => ({accepted:true,dispatch_id:'d',context_id:'ctx-B'}),
    readStatus: async () => ({status:'COMPLETED'}),
    fetchReply: async () => ({text:'x'}),
    appendEvent: async()=>{}, updatePanel: async()=>{}
  });
  const r=await loop.run({cycle_id:'c2',worker_id:'D-6',command:'do'});
  assert.equal(r.ok,false);
  assert.match(r.run.error,/context mismatch/);
}

async function missingReplyFails() {
  const loop = new ContextAwareMessageLoop({
    identifyContext: async () => ({context_id:'ctx',context_name:'X'}),
    sendMessage: async () => ({accepted:true,context_id:'ctx'}),
    readStatus: async () => ({status:'COMPLETED',context_id:'ctx'}),
    fetchReply: async () => ({text:'',context_id:'ctx'}),
    appendEvent: async()=>{}, updatePanel: async()=>{}
  });
  const r=await loop.run({cycle_id:'c3',worker_id:'D-6',command:'do'});
  assert.equal(r.ok,false);
  assert.match(r.run.error,/reply missing/);
}

async function retryAndPanelFields() {
  let tick=0; const panels=[]; const events=[];
  const loop = new ContextAwareMessageLoop({
    identifyContext: async () => ({context_id:'ctx-r',context_name:'Retry Context'}),
    sendMessage: async x => ({accepted:true,dispatch_id:'d-r',context_id:x.context_id}),
    readStatus: async x => {
      tick++;
      if (tick===1) return {context_id:x.context_id,status:'WORKING',error:'TEMPORARY'};
      return {context_id:x.context_id,status:'COMPLETED'};
    },
    fetchReply: async x => ({context_id:x.context_id,text:'ok'}),
    appendEvent: async e => events.push(e), updatePanel: async p => panels.push(p), sleep: async()=>{}
  }, {maxPolls:3,pollDelayMs:0});
  const r=await loop.run({cycle_id:'c4',worker_id:'D-6',command:'retry'});
  assert.equal(r.ok,true);
  assert.equal(r.run.retry_count,1);
  assert.ok(events.some(e=>e.event_type==='RETRYABLE_ERROR'));
  const required=['current_worker','context_name','context_id','current_command','status','started_at','elapsed_ms','recent_event','error','retry_count','result_return_status'];
  for(const key of required) assert.ok(Object.prototype.hasOwnProperty.call(r.panel,key), key);
}

async function replyContextMismatchFails() {
  const loop = new ContextAwareMessageLoop({
    identifyContext: async () => ({context_id:'ctx-a',context_name:'A'}),
    sendMessage: async x => ({accepted:true,context_id:x.context_id}),
    readStatus: async x => ({status:'COMPLETED',context_id:x.context_id}),
    fetchReply: async () => ({text:'wrong',context_id:'ctx-b'}),
    appendEvent: async()=>{}, updatePanel: async()=>{}
  });
  const r=await loop.run({cycle_id:'c5',worker_id:'D-6',command:'do'});
  assert.equal(r.ok,false);
  assert.match(r.run.error,/reply context mismatch/);
}

Promise.all([happy(), crossContextFails(), missingReplyFails(), retryAndPanelFields(), replyContextMismatchFails()])
  .then(()=>console.log('PASS_5_OF_5'))
  .catch(e=>{console.error(e);process.exit(1)});
