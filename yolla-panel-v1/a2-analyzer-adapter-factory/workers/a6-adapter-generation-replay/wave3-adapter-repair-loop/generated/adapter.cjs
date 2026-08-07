// GENERATED_BY=A6_WAVE3_COMPILER
// INPUT_SHA256=b6f987e409110f822a2b57660ea7dadcaac6554e1c365fc7bf26ac64a29798da
'use strict';
const crypto=require('node:crypto');
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.keys(v).sort().reduce((a,k)=>(a[k]=stable(v[k]),a),{}):v;
const sha=v=>crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');
function parseDom(html,selector){const cls=selector==='article.item'?'item':'record-card';const re=new RegExp(`<article class="${cls}" data-record-id="([^"]+)"><h2 class="name">([^<]+)<\\/h2><span class="category">([^<]+)<\\/span><span class="value">([^<]+)<\\/span><a class="detail" href="([^"]+)">Detail<\\/a><\\/article>`,'g');const out=[];let m;while((m=re.exec(html)))out.push({record_id:m[1],name:m[2],category:m[3],value:Number(m[4]),detail_url:m[5]});return out;}
function findArray(body,preferred){if(Array.isArray(body?.[preferred]))return {path:`$.${preferred}`,rows:body[preferred]};for(const [k,v] of Object.entries(body||{}))if(Array.isArray(v)&&v.every(x=>x&&typeof x==='object'))return{path:`$.${k}`,rows:v};return null;}
async function requestJson(url,trace,meta){const response=await fetch(url);const text=await response.text();trace.push({type:'network.response',status:response.status,url,...meta});let body=null;try{body=JSON.parse(text)}catch{}return {response,body,text};}
async function execute({baseUrl,fault='none',config,trace}){const repaired=structuredClone(config);const repairs=[];
 const listUrl=`${baseUrl}/list?page=1${fault==='locator'?'&fault=locator':''}`;const domResp=await fetch(listUrl);const domText=await domResp.text();trace.push({type:'dom.fetch',status:domResp.status,url:listUrl});let domRows=parseDom(domText,repaired.dom_selector);if(!domRows.length){trace.push({type:'step.failed',step:'dom-locator',selector:repaired.dom_selector});const alt='article.record-card';const altRows=parseDom(domText,alt);if(!altRows.length)throw new Error('LOCATOR_DRIFT_UNREPAIRABLE');repairs.push({fault:'locator_drift',step:'dom-locator',before:repaired.dom_selector,after:alt,scope:'STEP_ONLY'});repaired.dom_selector=alt;domRows=altRows;trace.push({type:'step.repaired',step:'dom-locator',selector:alt});}
 const apiRows=[];let pageParam=repaired.page_parameter;
 for(let page=1;page<=2;page++){
   let attempt=0,done=false;
   while(!done&&attempt<repaired.max_attempts){attempt++;const params=new URLSearchParams({[pageParam]:String(page),size:'5'});if(fault!=='none')params.set('fault',fault);const url=`${baseUrl}/api/listings?${params}`;trace.push({type:'network.request',url,page,attempt,page_parameter:pageParam});const {response,body}=await requestJson(url,trace,{page,attempt});
     if([429,500,502,503,504].includes(response.status)){trace.push({type:'step.failed',step:'transient-response',status:response.status,page,attempt});if(attempt>=repaired.max_attempts)throw new Error('RETRY_EXHAUSTED');if(!repairs.some(r=>r.fault==='transient_response'))repairs.push({fault:'transient_response',step:'retry-policy',before:'single-attempt-observation',after:`retry-up-to-${repaired.max_attempts}`,scope:'POLICY_ONLY'});trace.push({type:'step.repaired',step:'retry-policy',page,next_attempt:attempt+1});continue;}
     if(!response.ok)throw new Error(`HTTP_${response.status}`);
     let found=findArray(body,repaired.record_key);if(!found){trace.push({type:'step.failed',step:'schema-record-path',record_key:repaired.record_key,page});throw new Error('SCHEMA_ARRAY_NOT_FOUND');}
     if(found.path!==`$.${repaired.record_key}`){trace.push({type:'step.failed',step:'schema-record-path',expected:`$.${repaired.record_key}`,observed:found.path,page});repairs.push({fault:'schema_drift',step:'schema-record-path',before:`$.${repaired.record_key}`,after:found.path,scope:'CONTRACT_ONLY'});repaired.record_key=found.path.slice(2);trace.push({type:'step.repaired',step:'schema-record-path',record_key:repaired.record_key});}
     const ids=found.rows.map(x=>x.listingId||x.record_id);if(page===2 && ids.some(id=>apiRows.some(x=>(x.listingId||x.record_id)===id))){trace.push({type:'step.failed',step:'pagination',reason:'DUPLICATE_IDS',page_parameter:pageParam});pageParam='p';repaired.page_parameter='p';repairs.push({fault:'pagination_failure',step:'pagination-parameter',before:config.page_parameter,after:'p',scope:'PAGINATION_ONLY'});trace.push({type:'step.repaired',step:'pagination',page_parameter:'p'});attempt=0;continue;}
     apiRows.push(...found.rows);done=true;
   }
 }
 const domById=new Map(domRows.map(r=>[r.record_id,r]));const merged=apiRows.map(r=>({...domById.get(String(r.record_id))||{},...r}));const unique=[...new Map(merged.map(r=>[r.listingId||r.record_id,r])).values()].slice(0,10);if(unique.length!==10)throw new Error(`EXACT10_FAILED_${unique.length}`);const digest=sha(unique);trace.push({type:'adapter.complete',record_count:unique.length,digest});return {records:unique,digest,repairs,repaired_config:repaired};}
module.exports={execute,sha};
