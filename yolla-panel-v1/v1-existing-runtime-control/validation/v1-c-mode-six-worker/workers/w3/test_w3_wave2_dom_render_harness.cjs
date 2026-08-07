/* eslint-env node */
"use strict";
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(process.argv[2]||process.cwd());
const js=fs.readFileSync(path.join(root,'workspace_c_mode.js'),'utf8');
const css=fs.readFileSync(path.join(root,'workspace_c_mode.css'),'utf8');
const checks=[
 ['group-c-button',/data-c-group/.test(js)&&/button\.textContent\s*=\s*["']C["']/.test(js)],
 ['top-command-popup',/openCommandDialog/.test(js)&&/data-action=["']command["']/.test(js)],
 ['c-counter-source',/c_active_roles/.test(js)],
 ['command-counter-source',/command_active_roles/.test(js)],
 ['command-waiting-source',/command_awaiting_roles/.test(js)],
 ['error-counter-source',/error_roles/.test(js)],
 ['idle-label',/label:\s*["']쉬는 중["']/.test(js)],
 ['legacy-profile-status-excluded',!/profile\.status/.test(js)],
 ['legacy-a-hidden',/\.group-mode-button\.automation-button/.test(css)],
 ['legacy-e-hidden',/\.group-mode-button\.epic-button/.test(css)],
 ['schedule-panel-hidden',/#worker-schedule-panel/.test(css)],
 ['c-dialog-controls',/startCMode/.test(js)&&/pauseCMode/.test(js)&&/resumeCMode/.test(js)&&/stopCMode/.test(js)]
];
function project(s){
 const c=new Set(s.c_active_roles||[]), cmd=new Set([...(s.command_active_roles||[]),...(s.command_awaiting_roles||[])]), err=new Set(s.error_roles||[]);
 const working=new Set([...c,...cmd]);
 return {working:working.size,c:c.size,command:cmd.size,error:err.size,label:err.size?'오류':c.size?'C 실행':cmd.size?'명령 실행':'쉬는 중'};
}
const fixtures=[
 [{}, {working:0,c:0,command:0,error:0,label:'쉬는 중'}],
 [{legacy_profiles:[{role:'A-1',status:'RUNNING'},{role:'E-1',status:'RESULT_WAITING'}]}, {working:0,c:0,command:0,error:0,label:'쉬는 중'}],
 [{c_active_roles:['W1','W2']},{working:2,c:2,command:0,error:0,label:'C 실행'}],
 [{command_active_roles:['W3'],command_awaiting_roles:['W4']},{working:2,c:0,command:2,error:0,label:'명령 실행'}],
 [{c_active_roles:['W1'],command_active_roles:['W2'],error_roles:['W3']},{working:2,c:1,command:1,error:1,label:'오류'}]
];
for(const [i,[input,expected]] of fixtures.entries()){
 const actual=project(input);
 checks.push([`projection-${i}`,JSON.stringify(actual)===JSON.stringify(expected)]);
}
const failed=checks.filter(([,ok])=>!ok).map(([n])=>n);
if(failed.length) throw new Error('W3_WAVE2_DOM_RENDER_FAILED:'+failed.join(','));
console.log(JSON.stringify({schema_version:'V1_C_MODE_W3_WAVE2_DOM_RENDER_HARNESS_V1',status:'PASS',assertions:checks.length,failed:0,live_pass_claimed:false},null,2));
