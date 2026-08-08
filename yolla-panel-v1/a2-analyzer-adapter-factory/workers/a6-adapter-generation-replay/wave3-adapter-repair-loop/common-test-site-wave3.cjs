'use strict';
const http=require('node:http');
function records(){return Array.from({length:10},(_,i)=>({record_id:String(i+1),listingId:`L${String(i+1).padStart(2,'0')}`,name:`Fixture Item ${String(i+1).padStart(2,'0')}`,category:(i+1)%2?'odd':'even',value:(i+1)*100,detail_url:`/detail/${i+1}`}));}
function html(items,{locatorDrift=false}={}){const cls=locatorDrift?'record-card':'item';return `<!doctype html><html><body><main id="records">${items.map(r=>`<article class="${cls}" data-record-id="${r.record_id}"><h2 class="name">${r.name}</h2><span class="category">${r.category}</span><span class="value">${r.value}</span><a class="detail" href="${r.detail_url}">Detail</a></article>`).join('')}</main><a id="next-page" href="/list?page=2">Next</a></body></html>`;}
async function start(){const all=records();let transientHits=0;const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://127.0.0.1');const drift=u.searchParams.get('fault')||'';const page=Number(u.searchParams.get('page')||u.searchParams.get('p')||1);const size=5;res.setHeader('content-type',u.pathname.startsWith('/api/')?'application/json; charset=utf-8':'text/html; charset=utf-8');
 if(u.pathname==='/list'){const start=(page-1)*size;res.end(html(all.slice(start,start+size),{locatorDrift:drift==='locator'}));return;}
 if(u.pathname==='/api/listings'){
   if(drift==='transient' && page===2 && transientHits++===0){res.statusCode=503;res.end(JSON.stringify({error:'transient'}));return;}
   let effective=page;if(drift==='pagination' && u.searchParams.has('page') && page===2) effective=1;
   const start=(effective-1)*size;const payload={page:effective,size,lastPage:effective>=2};const rows=all.slice(start,start+size).map(r=>({listingId:r.listingId,record_id:r.record_id,name:r.name,category:r.category,value:r.value,detail_url:r.detail_url}));
   if(drift==='schema') payload.records=rows; else payload.items=rows;
   res.end(JSON.stringify(payload));return;
 }
 res.statusCode=404;res.end('not found');
});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));return {server,baseUrl:`http://127.0.0.1:${server.address().port}`};}
module.exports={start,records};
