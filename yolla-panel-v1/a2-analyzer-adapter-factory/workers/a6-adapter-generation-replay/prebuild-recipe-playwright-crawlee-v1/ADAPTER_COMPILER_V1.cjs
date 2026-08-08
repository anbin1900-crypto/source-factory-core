'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const stable = v => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.keys(v).sort().reduce((a,k)=>(a[k]=stable(v[k]),a),{}) : v;
const sha256 = v => crypto.createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(stable(v))).digest('hex');
const ALLOWED = new Set(['Navigate','Input','Click','Wait','Loop','Extract','Pagination']);
function validateRecipe(recipe){
  if(recipe?.schema_version !== 'EXTRACTION_RECIPE_V1') throw new Error('BAD_SCHEMA_VERSION');
  if(!recipe.recipe_id || !Array.isArray(recipe.steps) || !recipe.steps.length) throw new Error('BAD_RECIPE');
  for(const step of recipe.steps){ if(!step.step_id || !ALLOWED.has(step.type)) throw new Error(`BAD_STEP:${step.step_id||'missing'}`); }
  return true;
}
function locatorExpr(locator){
  if(!locator) return 'null';
  if(locator.strategy === 'test_id') return `page.getByTestId(${JSON.stringify(locator.value)})`;
  if(locator.strategy === 'role') return `page.getByRole(${JSON.stringify(locator.role)}, ${JSON.stringify(locator.options||{})})`;
  if(locator.strategy === 'text') return `page.getByText(${JSON.stringify(locator.value)}, { exact: true })`;
  const css = String(locator.value||'').split('@')[0];
  return `page.locator(${JSON.stringify(css)})`;
}
function compileStep(step){
  switch(step.type){
    case 'Navigate': return `await ctx.navigate(interpolate(${JSON.stringify(step.url)}, vars), ${JSON.stringify(step.step_id)});`;
    case 'Input': return `await ctx.input(${locatorExpr(step.locator)}, interpolate(${JSON.stringify(step.value)}, vars), ${JSON.stringify(step.step_id)});`;
    case 'Click': return `await ctx.click(${locatorExpr(step.locator)}, ${JSON.stringify(step.step_id)});`;
    case 'Wait': return `await ctx.wait(${locatorExpr(step.locator)}, ${JSON.stringify(step.state||'visible')}, ${JSON.stringify(step.step_id)});`;
    case 'Loop': return `for(let i=0;i<${Number(step.times||1)};i++){ ${step.steps.map((s,j)=>compileStep({...s,step_id:`${step.step_id}.loop.${j+1}`})).join(' ')} }`;
    case 'Extract': return `await ctx.extract(${JSON.stringify(step.fields||[])}, ${JSON.stringify(step.step_id)});`;
    case 'Pagination': return `await ctx.paginate(${locatorExpr(step.locator)}, ${JSON.stringify(step.mode||'NEXT')}, ${Number(step.max_pages||1)}, ${JSON.stringify(step.step_id)});`;
    default: throw new Error(`UNSUPPORTED_STEP:${step.type}`);
  }
}
function compileRecipe(recipe){
  validateRecipe(recipe);
  const source = `'use strict';\nconst { PlaywrightCrawler, RequestQueue } = require('crawlee');\nconst { chromium } = require('playwright');\nconst crypto=require('node:crypto');\nconst interpolate=(s,v)=>String(s).replace(/\\$\\{([^}]+)\\}/g,(_,k)=>v[k]??(k==='start_url'?v.start_url:''));\nconst stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.keys(v).sort().reduce((a,k)=>(a[k]=stable(v[k]),a),{}):v;\nconst sha=v=>crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');\nasync function runAdapter({recipe,checkpointStore,receiptSink}){\n const requestQueue=await RequestQueue.open(\\`a6-\\${recipe.recipe_id}\\`);\n const vars={...recipe.variables,start_url:recipe.start_url};\n const completed=new Set((await checkpointStore.load(recipe.recipe_id))?.completed_idempotency_keys||[]);\n const crawler=new PlaywrightCrawler({requestQueue,maxRequestRetries:recipe.runtime.max_request_retries??2,requestHandler:async({page,request})=>{\n   const receipts=[]; const outputs=[];\n   const ctx={\n     navigate:async(url,stepId)=>{await page.goto(url);receipts.push({step_id:stepId,status:'PASS',kind:'Navigate'});},\n     input:async(locator,value,stepId)=>{await locator.fill(value);receipts.push({step_id:stepId,status:'PASS',kind:'Input'});},\n     click:async(locator,stepId)=>{await locator.click();receipts.push({step_id:stepId,status:'PASS',kind:'Click'});},\n     wait:async(locator,state,stepId)=>{await locator.waitFor({state});receipts.push({step_id:stepId,status:'PASS',kind:'Wait'});},\n     extract:async(fields,stepId)=>{const row={};for(const f of fields){const [css,attr]=String(f.locator.value).split('@');const loc=page.locator(css).first();row[f.name]=attr?await loc.getAttribute(attr):await loc.textContent();}outputs.push(row);receipts.push({step_id:stepId,status:'PASS',kind:'Extract'});},\n     paginate:async(locator,mode,maxPages,stepId)=>{if(mode!=='NEXT')throw new Error('ONLY_NEXT_PREBUILD');const href=await locator.getAttribute('href');if(href)await requestQueue.addRequest({url:new URL(href,page.url()).href,uniqueKey:sha({recipe_id:recipe.recipe_id,step_id:stepId,href})});receipts.push({step_id:stepId,status:'PASS',kind:'Pagination',max_pages:maxPages});}\n   };\n   ${recipe.steps.map(compileStep).join('\n   ')}\n   await receiptSink.write({request_url:request.url,receipts,outputs,outputs_sha256:sha(outputs)});\n }});\n await requestQueue.addRequest({url:recipe.start_url,uniqueKey:sha({recipe_id:recipe.recipe_id,url:recipe.start_url})});\n await crawler.run();\n}\nmodule.exports={runAdapter};\n`;
  return { source, recipe_sha256: sha256(recipe), source_sha256: sha256(source) };
}
function regenerateStep(recipe, stepId, replacement){
  validateRecipe(recipe); if(!replacement || replacement.step_id !== stepId || !ALLOWED.has(replacement.type)) throw new Error('INVALID_REPLACEMENT');
  const idx=recipe.steps.findIndex(s=>s.step_id===stepId); if(idx<0) throw new Error('STEP_NOT_FOUND');
  const next=JSON.parse(JSON.stringify(recipe)); next.steps[idx]=replacement;
  return {recipe:next,receipt:{schema_version:'A6_PARTIAL_REGEN_RECEIPT_V1',step_id:stepId,before_sha256:sha256(recipe.steps[idx]),after_sha256:sha256(replacement),scope:'STEP_ONLY',full_recipe_regeneration:false}};
}
function main(){
  const args=process.argv.slice(2); const recipePath=args[0]; const outPath=args[1];
  if(!recipePath||!outPath) throw new Error('usage: node ADAPTER_COMPILER_V1.cjs <recipe.json> <generated.cjs>');
  const recipe=JSON.parse(fs.readFileSync(recipePath,'utf8')); const result=compileRecipe(recipe); fs.mkdirSync(path.dirname(outPath),{recursive:true}); fs.writeFileSync(outPath,result.source);
  process.stdout.write(JSON.stringify({status:'PASS',recipe_sha256:result.recipe_sha256,generated_source_sha256:result.source_sha256,output:outPath})+'\n');
}
module.exports={validateRecipe,compileRecipe,regenerateStep,sha256};
if(require.main===module){try{main()}catch(e){console.error(e.stack);process.exit(1)}}
