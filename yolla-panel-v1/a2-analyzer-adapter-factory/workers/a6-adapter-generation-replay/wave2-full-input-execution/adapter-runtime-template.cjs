'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.keys(v).sort().reduce((a,k)=>(a[k]=stable(v[k]),a),{}):v;
const sha=v=>crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');
function parseDom(html){const records=[];const re=/<article class="property-card listing-card" data-id="([^"]+)"><a class="title" href="([^"]+)">([^<]+)<\/a><span class="price">([^<]+)<\/span><p class="address">([^<]+)<\/p><span class="region">([^<]+)<\/span><\/article>/g;let m;while((m=re.exec(html)))records.push({listingId:m[1],detailUrl:m[2],title:m[3],price:Number(m[4]),address:m[5],regionId:m[6]});return records;}
async function execute({baseUrl,maxRecords=10,capturePath,tracePath,injectTransient=true}){
 if(maxRecords!==10) throw new Error('Wave2 contract requires exactly 10 records');
 const trace=[];let seq=0;const emit=(type,data={})=>trace.push({seq:++seq,at:new Date().toISOString(),type,...data});
 emit('analyzer.action',{action_type:'navigation',url:`${baseUrl}/search`,source:'B-3_RECIPE'});
 emit('network.requestWillBeSent',{method:'GET',url:`${baseUrl}/search`});
 const htmlResp=await fetch(`${baseUrl}/search`); const html=await htmlResp.text();
 emit('network.responseReceived',{status:htmlResp.status,url:`${baseUrl}/search`,content_type:htmlResp.headers.get('content-type')}); emit('network.responseBody',{url:`${baseUrl}/search`,size_bytes:Buffer.byteLength(html),sha256:crypto.createHash('sha256').update(html).digest('hex')});
 const domRecords=parseDom(html); emit('dom.snapshot',{record_candidates:domRecords.length,locator:'.property-card'});
 let endpoint='/api/listing', repaired=false; const pages=[]; const apiRecords=[];
 for(let page=1;page<=2;page++){
   let attempts=0;
   while(attempts<3){attempts++; const suffix=`?page=${page}&size=5${injectTransient&&page===2&&attempts===1?'&inject=transient':''}`; const url=`${baseUrl}${endpoint}${suffix}`; emit('network.requestWillBeSent',{method:'GET',url,page,attempt:attempts}); const response=await fetch(url); const text=await response.text(); emit('network.responseReceived',{status:response.status,url,page,attempt:attempts}); emit('network.responseBody',{url,page,size_bytes:Buffer.byteLength(text),sha256:crypto.createHash('sha256').update(text).digest('hex')});
     if(response.status===404&&endpoint==='/api/listing'){emit('adapter.stepFailed',{step:'list-endpoint',endpoint,status:404}); endpoint='/api/listings'; repaired=true; emit('adapter.stepRepaired',{step:'list-endpoint',old_endpoint:'/api/listing',new_endpoint:endpoint,scope:'FAILED_STEP_ONLY'}); continue;}
     if([429,500,502,503,504].includes(response.status)){emit('adapter.retry',{step:'list-request',status:response.status,page,attempt:attempts}); continue;}
     if(!response.ok) throw new Error(`HTTP ${response.status}`); const body=JSON.parse(text); if(!Array.isArray(body.items)) throw new Error('$.items missing'); pages.push(body); apiRecords.push(...body.items); break;
   }
 }
 const domById=new Map(domRecords.map(r=>[r.listingId,r])); const merged=apiRecords.map(r=>({...domById.get(r.listingId),...r})); const unique=[...new Map(merged.map(r=>[r.listingId,r])).values()].slice(0,maxRecords);
 if(unique.length!==10) throw new Error(`EXACT_RECORD_COUNT_MISMATCH expected=10 actual=${unique.length}`);
 emit('adapter.replayComplete',{record_count:unique.length,unique_id_count:new Set(unique.map(r=>r.listingId)).size,repaired});
 const capture={schema_version:'A6_WAVE2_LIVE_LOCAL_HTTP_CAPTURE_V1',base_url:baseUrl,actual_http:true,fixture_only:false,pages,dom_record_count:domRecords.length,records:unique,record_count:unique.length,records_sha256:sha(unique),endpoint_final:endpoint,repaired};
 if(capturePath)fs.writeFileSync(capturePath,JSON.stringify(capture,null,2)+'\n'); if(tracePath)fs.writeFileSync(tracePath,JSON.stringify({schema_version:'A6_WAVE2_TRACE_V1',events:trace},null,2)+'\n'); return {capture,trace};
}
async function replay(capture,tracePath){const records=capture.records;const trace=[{seq:1,at:new Date().toISOString(),type:'replay.start',capture_sha256:sha(capture)},{seq:2,at:new Date().toISOString(),type:'replay.complete',record_count:records.length,records_sha256:sha(records)}];if(records.length!==10)throw new Error('Replay must contain exactly 10 records');if(tracePath)fs.writeFileSync(tracePath,JSON.stringify({schema_version:'A6_WAVE2_REPLAY_TRACE_V1',events:trace},null,2)+'\n');return{records,records_sha256:sha(records),trace};}
module.exports={execute,replay,parseDom,sha};
if(require.main===module){const [baseUrl,capturePath,tracePath]=process.argv.slice(2);execute({baseUrl,capturePath,tracePath}).then(r=>console.log(JSON.stringify({status:'PASS',record_count:r.capture.record_count,records_sha256:r.capture.records_sha256,repaired:r.capture.repaired}))).catch(e=>{console.error(e.stack);process.exit(1)});}
