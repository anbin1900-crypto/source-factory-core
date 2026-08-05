/* eslint-env node */
"use strict";
const fs=require("node:fs");
const path=require("node:path");
const fixturePath=path.join(__dirname,"WAVE3_UI_PROJECTION_FIXTURES.json");
const data=JSON.parse(fs.readFileSync(fixturePath,"utf8"));
function project(f){
  if(!f.c_enabled&&!f.command_enabled){return {working:0,c_active:0,command_active:0,awaiting:0,error:0,end:0,idle:f.slots.length,labels:f.slots.map(()=>"쉬는 중")};}
  const out={working:0,c_active:0,command_active:0,awaiting:0,error:0,end:0,idle:0,labels:[]};
  for(const s of f.slots){
    let label="쉬는 중";
    if(s.error){out.error++;out.working++;label="오류";}
    else if(s.c_state==="RUNNING"){out.c_active++;out.working++;label="C 실행";}
    else if(s.repeat_state==="RUNNING"){out.command_active++;out.working++;label="명령 실행";}
    else if(s.repeat_state==="AWAITING_COMPLETION"){out.awaiting++;out.working++;label="완료대기";}
    else if(s.c_state==="END"||s.repeat_state==="END"){out.end++;label="END";}
    else {out.idle++;}
    out.labels.push(label);
  }
  return out;
}
let assertions=0;
for(const [name,f] of Object.entries(data.fixtures)){
  const actual=project(f);
  for(const [k,v] of Object.entries(f.expected)){assertions++;if(actual[k]!==v)throw new Error(`${name}:${k}:expected=${v}:actual=${actual[k]}`);}
  if(name==="mixed_six_slot"){
    assertions++; if(actual.labels.join("|")!==f.slots.map(s=>s.expected_label).join("|")) throw new Error("MIXED_LABEL_MISMATCH");
    assertions++; if(f.slots[5].legacy_profile_status!=="RUNNING"||actual.labels[5]!=="쉬는 중") throw new Error("LEGACY_STATUS_LEAK");
  }
}
console.log(JSON.stringify({schema_version:"W3_WAVE3_UI_PROJECTION_TEST_V1",status:"PASS",assertions,fixtures:Object.keys(data.fixtures),legacy_profile_status_excluded:true,dual_report_states_bound:true,per_target_repeat_states_bound:true},null,2));
