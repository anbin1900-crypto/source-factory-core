'use strict';
const { PlaywrightCrawler, RequestQueue } = require('crawlee');
const { chromium } = require('playwright');
const crypto=require('node:crypto');
const interpolate=(s,v)=>String(s).replace(/\$\{([^}]+)\}/g,(_,k)=>v[k]??(k==='start_url'?v.start_url:''));
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.keys(v).sort().reduce((a,k)=>(a[k]=stable(v[k]),a),{}):v;
const sha=v=>crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');
async function runAdapter({recipe,checkpointStore,receiptSink}){
 const requestQueue=await RequestQueue.open(`a6-${recipe.recipe_id}`);
 const vars={...recipe.variables,start_url:recipe.start_url};
 const completed=new Set((await checkpointStore.load(recipe.recipe_id))?.completed_idempotency_keys||[]);
 const crawler=new PlaywrightCrawler({requestQueue,maxRequestRetries:recipe.runtime.max_request_retries??2,requestHandler:async({page,request})=>{
   const receipts=[]; const outputs=[];
   const ctx={
     navigate:async(url,stepId)=>{await page.goto(url);receipts.push({step_id:stepId,status:'PASS',kind:'Navigate'});},
     input:async(locator,value,stepId)=>{await locator.fill(value);receipts.push({step_id:stepId,status:'PASS',kind:'Input'});},
     click:async(locator,stepId)=>{await locator.click();receipts.push({step_id:stepId,status:'PASS',kind:'Click'});},
     wait:async(locator,state,stepId)=>{await locator.waitFor({state});receipts.push({step_id:stepId,status:'PASS',kind:'Wait'});},
     extract:async(fields,stepId)=>{const row={};for(const f of fields){const [css,attr]=String(f.locator.value).split('@');const loc=page.locator(css).first();row[f.name]=attr?await loc.getAttribute(attr):await loc.textContent();}outputs.push(row);receipts.push({step_id:stepId,status:'PASS',kind:'Extract'});},
     paginate:async(locator,mode,maxPages,stepId)=>{if(mode!=='NEXT')throw new Error('ONLY_NEXT_PREBUILD');const href=await locator.getAttribute('href');if(href)await requestQueue.addRequest({url:new URL(href,page.url()).href,uniqueKey:sha({recipe_id:recipe.recipe_id,step_id:stepId,href})});receipts.push({step_id:stepId,status:'PASS',kind:'Pagination',max_pages:maxPages});}
   };
   await ctx.navigate(interpolate("${start_url}", vars), "s01");
   await ctx.input(page.getByTestId("keyword-input"), interpolate("${keyword}", vars), "s02");
   await ctx.click(page.getByTestId("search-submit"), "s03");
   await ctx.wait(page.locator("article.item"), "visible", "s04");
   for(let i=0;i<1;i++){ await ctx.click(page.locator("a.detail"), "s05.loop.1"); }
   await ctx.extract([{"name":"record_id","locator":{"strategy":"css_attr","value":"article.item@data-record-id"}},{"name":"name","locator":{"strategy":"css_text","value":"h2.name"}}], "s06");
   await ctx.paginate(page.locator("#next-page"), "NEXT", 2, "s07");
   await receiptSink.write({request_url:request.url,receipts,outputs,outputs_sha256:sha(outputs)});
 }});
 await requestQueue.addRequest({url:recipe.start_url,uniqueKey:sha({recipe_id:recipe.recipe_id,url:recipe.start_url})});
 await crawler.run();
}
module.exports={runAdapter};
