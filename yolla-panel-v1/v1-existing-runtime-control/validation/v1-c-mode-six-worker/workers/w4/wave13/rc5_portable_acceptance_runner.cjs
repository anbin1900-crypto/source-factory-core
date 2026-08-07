'use strict';
const {validate}=require('./rc5_package_validator.cjs');
function run({root,manifest,repeatRunner}){
  const packageGate=validate(root,manifest);
  const counters={DUPLICATE:0,C_REPEAT_CROSS_CANCEL:0,END_REDISPATCH:0,RECEIPT_LOSS:0,QUEUE_GROWTH:0};
  const rounds=[];
  for(let round=1;round<=3;round++)for(let worker=1;worker<=6;worker++)rounds.push({worker:`W${worker}`,round,status:'EXPECTED'});
  let runtime={status:'NOT_RUN',restart_resume:false,exactly_once:false,namespace_noninterference:false};
  if(packageGate.status==='PASS'&&typeof repeatRunner==='function'){
    const r=repeatRunner({cycles:1200});
    runtime={status:r.status,restart_resume:r.restart_cycle>0,exactly_once:r.counters&&r.counters.DUPLICATE===0,namespace_noninterference:r.counters&&r.counters.C_REPEAT_CROSS_CANCEL===0};
    Object.assign(counters,r.counters||{});
  }
  const pass=packageGate.status==='PASS'&&runtime.status==='PASS'&&Object.values(counters).every(v=>v===0);
  return {schema_version:'W4_RC5_PORTABLE_ACCEPTANCE_V1',status:pass?'PASS':'BLOCKED',package_gate:packageGate,runtime,workers:6,rounds:3,round_receipts:rounds,counters,rollback_pre_post_readback:manifest&&manifest.rollback_pre_post_readback===true};
}
module.exports={run};
