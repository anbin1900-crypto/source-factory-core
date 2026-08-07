'use strict';
const STATES={CURRENT:'CURRENT_REGISTRY_RESULT',HISTORICAL:'HISTORICAL_REGISTRY_RESULT',MISSING:'REPORT_MISSING',DUPLICATE:'DUPLICATE_REPORT',ERROR:'ERROR',END:'END',IDLE:'IDLE'};
function upper(v){return String(v??'').trim().toUpperCase();}
function project(entry={},ctx={}){
  const currentRegistryId=String(ctx.current_registry_id||'');
  const entryRegistryId=String(entry.registry_id||'');
  const hasCurrent=entryRegistryId&&entryRegistryId===currentRegistryId;
  const hasResultComment=Number.isInteger(entry.result_comment_id)&&entry.result_comment_id>0;
  const resultKey=String(entry.result_key||'');
  const duplicateCount=Number(entry.duplicate_count||0);
  const status=upper(entry.status);
  if(status==='ERROR') return {state:STATES.ERROR,label:'오류',display_ref:hasResultComment?String(entry.result_comment_id):resultKey};
  if(duplicateCount>1) return {state:STATES.DUPLICATE,label:'중복 결과',display_ref:hasResultComment?String(entry.result_comment_id):resultKey};
  if(entry.result_commit&&!hasResultComment) return {state:STATES.MISSING,label:'미보고',display_ref:resultKey};
  if(status==='END') return {state:STATES.END,label:'END',display_ref:hasResultComment?String(entry.result_comment_id):resultKey};
  if(hasResultComment&&hasCurrent) return {state:STATES.CURRENT,label:'현재 Registry 결과',display_ref:String(entry.result_comment_id)};
  if(hasResultComment&&entryRegistryId&&!hasCurrent) return {state:STATES.HISTORICAL,label:'과거 Registry 결과',display_ref:String(entry.result_comment_id)};
  return {state:STATES.IDLE,label:'쉬는 중',display_ref:''};
}
function counts(entries,ctx){const out={working:0,current:0,historical:0,missing:0,duplicate:0,error:0,end:0,idle:0};for(const e of entries){const s=project(e,ctx).state;if(s===STATES.CURRENT)out.current++;else if(s===STATES.HISTORICAL)out.historical++;else if(s===STATES.MISSING)out.missing++;else if(s===STATES.DUPLICATE)out.duplicate++;else if(s===STATES.ERROR){out.error++;out.working++;}else if(s===STATES.END)out.end++;else out.idle++;}return out;}
module.exports={STATES,project,counts};
