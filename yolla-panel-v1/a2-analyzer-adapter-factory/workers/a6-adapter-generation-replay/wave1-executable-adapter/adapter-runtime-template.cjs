#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const here=__dirname;
const load=n=>JSON.parse(fs.readFileSync(path.join(here,n),'utf8'));
const manifest=load('adapter.json'),requests=load('request-templates.json'),selectors=load('selectors.json'),outSchema=load('output-schema.json');
const trace=[];
function event(type,step,data={}){trace.push({seq:trace.length+1,at:new Date().toISOString(),type,step,...data});}
function cleanHtml(s){return String(s??'').replace(/<[^>]+>/g,' ').replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();}
function getPath(obj,p){if(p==='$'||p===''||p==null)return obj;return String(p).split('.').reduce((v,k)=>v==null?undefined:v[k],obj);}
function scanArrays(value,required,p='$',seen=new Set()){
  if(!value||typeof value!=='object'||seen.has(value))return null;seen.add(value);
  if(Array.isArray(value)&&value.length&&value.some(x=>x&&typeof x==='object'&&required.filter(k=>k in x).length>=Math.min(2,required.length)))return {path:p,value};
  for(const [k,v] of Object.entries(value)){const hit=scanArrays(v,required,p==='$'?k:`${p}.${k}`,seen);if(hit)return hit;}return null;
}
function mapApiRecord(x,map){const o={};for(const [out,src] of Object.entries(map))o[out]=getPath(x,src);return o;}
function extractApi(payload,template,overridePath){
  const requested=overridePath??template.items_path;let items=getPath(payload,requested),used=requested;
  if(!Array.isArray(items)){event('STEP_FAILED','api-items-path',{requested_path:requested});const repaired=scanArrays(payload,Object.values(template.field_map));if(!repaired)throw new Error('API_ITEMS_PATH_NOT_REPAIRABLE');items=repaired.value;used=repaired.path;event('STEP_REPAIRED','api-items-path',{old_path:requested,new_path:used});}
  return {records:items.map(x=>mapApiRecord(x,template.field_map)),used_items_path:used};
}
function matchNamed(text,pattern,name){if(!pattern)return null;const m=new RegExp(pattern,'i').exec(text);return m?.groups?.[name]??null;}
function extractDom(html,sel){
  let rp=sel.record_pattern,rx;try{rx=new RegExp(rp,'gi')}catch{rx=null}
  if(!rx){event('STEP_FAILED','dom-record-pattern',{pattern:rp});rp=sel.fallback_patterns.record_pattern;rx=new RegExp(rp,'gi');event('STEP_REPAIRED','dom-record-pattern',{new_pattern:rp});}
  const records=[];let m;
  while((m=rx.exec(html))){const content=m.groups?.content||m[0],record={id:m.groups?.id};for(const field of ['title','body','user_id']){let pattern=sel.field_patterns[field];let val=matchNamed(field==='user_id'?m[0]:content,pattern,'value');if(val==null){pattern=sel.fallback_patterns[field];val=matchNamed(field==='user_id'?m[0]:content,pattern,'value');if(val!=null)event('STEP_REPAIRED',`dom-field-${field}`,{fallback:true});}record[field]=field==='user_id'&&val!=null&&/^\d+$/.test(val)?Number(val):cleanHtml(val);}records.push(record)}
  return records;
}
function mergeHybrid(api,dom){const by=new Map(dom.map(r=>[String(r.id),r]));return api.map(r=>{const d=by.get(String(r.id))||{};return Object.fromEntries(Object.entries({...d,...r}).map(([k,v])=>[k,v==null||v===''?d[k]:v]))}).concat(dom.filter(d=>!api.some(a=>String(a.id)===String(d.id))));}
function validate(records){const req=outSchema.items.required,valid=[],invalid=[];for(const r of records){const miss=req.filter(k=>r[k]==null||r[k]==='');if(miss.length)invalid.push({record:r,missing:miss});else valid.push(r)}if(invalid.length)event('STEP_REPAIRED','validate-output',{strategy:'drop-invalid-record-and-continue',dropped:invalid.length});if(!valid.length)throw new Error('NO_VALID_RECORDS');return valid;}
async function fetchJson(template){const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),template.timeout_ms);try{event('ACT','live-fetch',{url:template.url});const r=await fetch(template.url,{headers:template.headers,signal:ctrl.signal});if(!r.ok)throw new Error(`HTTP_${r.status}`);return await r.json()}finally{clearTimeout(timer)}}
function parseArgs(argv){const o={max_records:20,live:false};for(let i=0;i<argv.length;i++){const k=argv[i],v=argv[i+1];if(k==='--live')o.live=true;else if(k==='--api-fixture')o.api_fixture=v,i++;else if(k==='--dom-fixture')o.dom_fixture=v,i++;else if(k==='--max-records')o.max_records=Number(v),i++;else if(k==='--override-items-path')o.override_items_path=v,i++;else if(k==='--output')o.output=v,i++;else if(k==='--trace')o.trace_path=v,i++;else if(k==='--cache')o.cache_path=v,i++;}if(!Number.isInteger(o.max_records)||o.max_records<1||o.max_records>20)throw new Error('MAX_RECORDS_OUT_OF_RANGE');if(!o.output||!o.trace_path)throw new Error('OUTPUT_AND_TRACE_REQUIRED');return o;}
async function main(){const a=parseArgs(process.argv.slice(2)),template=requests.templates[0];event('OBSERVE','adapter-start',{adapter_id:manifest.adapter_id,mode:manifest.mode});let api=[],dom=[];
  if(['API','HYBRID'].includes(manifest.mode)){let payload;if(a.live){payload=await fetchJson(template)}else{if(!a.api_fixture)throw new Error('API_FIXTURE_REQUIRED');payload=JSON.parse(fs.readFileSync(a.api_fixture,'utf8'));event('CACHE_HIT','api-fixture',{path:a.api_fixture});}api=extractApi(payload,template,a.override_items_path).records;}
  if(['DOM','HYBRID'].includes(manifest.mode)){if(a.dom_fixture){dom=extractDom(fs.readFileSync(a.dom_fixture,'utf8'),selectors);event('CACHE_HIT','dom-fixture',{path:a.dom_fixture});}else if(manifest.mode==='DOM')throw new Error('DOM_FIXTURE_REQUIRED');}
  let records=manifest.mode==='HYBRID'?mergeHybrid(api,dom):manifest.mode==='API'?api:dom;records=validate(records).slice(0,a.max_records);event('REPLAY_COMPLETE','emit',{record_count:records.length});
  const result={schema_version:'EXECUTABLE_ADAPTER_RUN_RESULT_V1',adapter_id:manifest.adapter_id,mode:manifest.mode,record_count:records.length,records,repair_count:trace.filter(x=>x.type==='STEP_REPAIRED').length,trace_event_count:trace.length,source:a.live?'LIVE_PUBLIC_API':'REPLAY_FIXTURE'};
  result.result_sha256=crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex');fs.writeFileSync(a.output,JSON.stringify(result,null,2)+'\n');fs.writeFileSync(a.trace_path,JSON.stringify({schema_version:'EXECUTABLE_ADAPTER_TRACE_V1',adapter_id:manifest.adapter_id,events:trace},null,2)+'\n');console.log(JSON.stringify(result,null,2));}
main().catch(e=>{event('TERMINAL_ERROR','adapter-run',{message:e.message});const t=process.argv.includes('--trace')?process.argv[process.argv.indexOf('--trace')+1]:null;if(t)fs.writeFileSync(t,JSON.stringify({schema_version:'EXECUTABLE_ADAPTER_TRACE_V1',events:trace,error:e.message},null,2)+'\n');console.error(e.stack||e.message);process.exit(2)});
