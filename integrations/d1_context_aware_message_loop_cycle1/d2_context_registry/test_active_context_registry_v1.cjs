'use strict';
const assert = require('node:assert/strict');
const { ActiveContextRegistryV1, parseChatGptContext } = require('./active_context_registry_v1.cjs');
let now = Date.parse('2026-08-07T14:40:00Z');
const clock = () => now;
const r = new ActiveContextRegistryV1({ clock, duplicateWindowMs: 5000 });
let n=0; const ok=(c,m)=>{assert.ok(c,m);n++;};

ok(parseChatGptContext('https://chatgpt.com/c/ctx-1').context_id==='ctx-1','parse');
ok(parseChatGptContext('https://chatgpt.com/g/g-x/c/ctx-2').context_id==='ctx-2','project parse');

r.bind({ roleId:'D-2_CONTEXT_REGISTRY_AND_ACTIVE_WORKER_OWNER', contextId:'ctx-1', pageId:'page-a', commandId:'CMD-1', contextName:'Context A', startedAt:'2026-08-07T14:39:00Z' });
let row=r.observe({page_id:'page-a',url:'https://chatgpt.com/c/ctx-1',title:'Context A | ChatGPT',browser_event:{state:'GENERATING'},observed_at:'2026-08-07T14:40:00Z'});
ok(row.ROLE_ID.startsWith('D-2_'),'bound role');
ok(row.CONTEXT_ID==='ctx-1','ctx');
ok(row.PAGE_ID==='page-a','page');
ok(row.COMMAND_ID==='CMD-1','command');
ok(row.WORK_STATUS==='WORKING','working');
ok(row.STARTED_AT==='2026-08-07T14:39:00.000Z','started');

now += 1000;
row=r.observe({page_id:'page-a',url:'https://chatgpt.com/c/ctx-1',title:'Context A | ChatGPT',view_model_card:{worker_state:'COMPLETE',task_status:{state:'COMPLETE'},command_id:'CMD-1'}});
ok(row.ROLE_ID!==null,'refresh retained'); ok(row.WORK_STATUS==='COMPLETED','complete');

now += 1000;
row=r.observe({page_id:'page-a',url:'https://chatgpt.com/c/ctx-new',title:'New Context | ChatGPT',browser_event:{state:'IDLE'}});
ok(row.ROLE_ID===null,'new chat unbound'); ok(row.BINDING_STATE==='CONTEXT_UNBOUND','new chat state');

r.bind({roleId:'D-3',contextId:'ctx-new',pageId:'page-a',commandId:'CMD-NEW'});
row=r.observe({page_id:'page-a',url:'https://chatgpt.com/c/ctx-new',title:'New Context | ChatGPT',browser_event:{state:'DISPATCHED'}});
ok(row.ROLE_ID==='D-3','new bind'); ok(row.WORK_STATUS==='WORKING','dispatched working');

r.closePage('page-a'); now += 1000;
row=r.observe({page_id:'page-b',url:'https://chatgpt.com/c/ctx-new',title:'New Context | ChatGPT',browser_event:{state:'IDLE'}});
ok(row.ROLE_ID==='D-3','reopen same context role'); ok(row.PAGE_ID==='page-b','new page');

now += 1000;
r.observe({page_id:'page-c',url:'https://chatgpt.com/c/ctx-new',title:'New Context | ChatGPT',browser_event:{state:'IDLE'}});
row=r.observe({page_id:'page-b',url:'https://chatgpt.com/c/ctx-new',title:'New Context | ChatGPT',browser_event:{state:'IDLE'}});
ok(row.ROLE_ID===null,'duplicate unbound'); ok(row.WORK_STATUS==='REVIEW_REQUIRED','duplicate review');

now += 6000;
row=r.observe({page_id:'page-z',url:'https://chatgpt.com/',title:'ChatGPT',browser_event:{state:'IDLE'}});
ok(row.CONTEXT_ID===null,'new chat id pending'); ok(row.ROLE_ID===null,'new chat role null');

r.bind({roleId:'D-4',contextId:'ctx-rp',pageId:'page-rp',commandId:'CMD-RP'});
row=r.observe({page_id:'page-rp',url:'https://chatgpt.com/c/ctx-rp',title:'RP | ChatGPT',view_model_card:{task_status:{state:'COMPLETE_RESULT_PENDING'},worker_state:'COMPLETE'}});
ok(row.WORK_STATUS==='RESULT_PENDING','result pending');

console.log(`PASS_${n}_ASSERTIONS`);
