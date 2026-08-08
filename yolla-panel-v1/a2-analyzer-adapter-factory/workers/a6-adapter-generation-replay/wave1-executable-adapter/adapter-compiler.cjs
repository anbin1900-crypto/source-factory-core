#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function stable(v){
  if(Array.isArray(v)) return v.map(stable);
  if(v && typeof v === 'object') return Object.keys(v).sort().reduce((o,k)=>(o[k]=stable(v[k]),o),{});
  return v;
}
function digest(v){return crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');}
function writeJson(file, value){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');}
function chooseMode(obs){
  const api = obs.api && obs.api.confidence >= 0.75 && /json/i.test(obs.api.response_mime || '');
  const dom = obs.dom && obs.dom.confidence >= 0.70 && obs.dom.record_pattern;
  if(api && dom) return 'HYBRID';
  if(api) return 'API';
  if(dom) return 'DOM';
  throw new Error('NO_EXECUTABLE_EXTRACTION_MODE');
}
function main(){
  const inputPath = process.argv[2];
  const outDir = process.argv[3];
  if(!inputPath || !outDir) throw new Error('usage: node adapter-compiler.cjs <compiler-input.json> <out-dir>');
  const input = JSON.parse(fs.readFileSync(inputPath,'utf8'));
  const mode = chooseMode(input.observations);
  const generatedAt = new Date().toISOString();
  const adapter = {
    schema_version:'EXECUTABLE_ADAPTER_MANIFEST_V1',
    adapter_id:input.adapter_id,
    mode,
    entrypoint:'adapter.cjs',
    target:input.target,
    capabilities:{observe:true,act:true,action_cache:true,failed_step_repair:true,replay:true,trace:true,pagination:true},
    contracts:{selectors:'selectors.json',requests:'request-templates.json',input_schema:'input-schema.json',output_schema:'output-schema.json',pagination:'pagination.json',workflow:'workflow-recipe.json'},
    generated_at:generatedAt,
    compiler_input_sha256:digest(input)
  };
  const recipe = {
    schema_version:'EXECUTABLE_WORKFLOW_RECIPE_V1',
    adapter_id:input.adapter_id,
    mode,
    steps:[
      {id:'observe-input',kind:'observe',cache_key:'input-observation-v1'},
      {id:'load-api-or-fixture',kind:'act',when:['API','HYBRID'],repair:'rediscover-json-items-path'},
      {id:'load-dom-or-fixture',kind:'act',when:['DOM','HYBRID'],repair:'fallback-record-and-field-patterns'},
      {id:'merge-hybrid',kind:'transform',when:['HYBRID'],strategy:'api-primary-dom-fill'},
      {id:'validate-output',kind:'validate',repair:'drop-invalid-record-and-continue'},
      {id:'paginate',kind:'loop',contract:'pagination.json'},
      {id:'emit-trace',kind:'trace'}
    ]
  };
  const selectors = {
    schema_version:'EXECUTABLE_SELECTOR_CONTRACT_V1',
    record_pattern:input.observations.dom?.record_pattern || null,
    field_patterns:input.observations.dom?.field_patterns || {},
    fallback_patterns:{
      record_pattern:'<article[^>]*data-post-id="(?<id>[^"]+)"[^>]*>(?<content>[\\s\\S]*?)</article>',
      title:'<h2[^>]*>(?<value>[\\s\\S]*?)</h2>',
      body:'<p[^>]*>(?<value>[\\s\\S]*?)</p>',
      user_id:'data-user-id="(?<value>[^"]+)"'
    }
  };
  const requests = {
    schema_version:'EXECUTABLE_REQUEST_TEMPLATE_CATALOG_V1',
    templates:[{id:'posts-list',method:input.observations.api?.request.method || 'GET',url:new URL(input.observations.api?.request.path || '/',input.target.base_url).toString(),headers:{accept:'application/json'},items_path:input.observations.api?.items_path || '$',field_map:input.observations.api?.field_map || {},identity_path:input.observations.api?.identity_path || 'id',timeout_ms:15000,retry:{max_attempts:3,backoff_ms:[250,1000,3000],retry_status:[408,425,429,500,502,503,504]}}]
  };
  const inputSchema = {$schema:'https://json-schema.org/draft/2020-12/schema',title:'Executable adapter run input',type:'object',additionalProperties:false,properties:{live:{type:'boolean'},api_fixture:{type:'string'},dom_fixture:{type:'string'},max_records:{type:'integer',minimum:1,maximum:20},override_items_path:{type:'string'},trace_path:{type:'string'},cache_path:{type:'string'}},required:['max_records']};
  const required = input.output.required_fields;
  const outputSchema = {$schema:'https://json-schema.org/draft/2020-12/schema',title:'Extracted records',type:'array',minItems:1,maxItems:input.output.max_sample_records,items:{type:'object',additionalProperties:true,required,properties:{id:{type:['string','number']},user_id:{type:['string','number']},title:{type:'string',minLength:1},body:{type:'string',minLength:1}}}};
  const pagination = {schema_version:'EXECUTABLE_PAGINATION_CONTRACT_V1',...input.observations.pagination,loop_guard:{max_pages:input.observations.pagination.max_pages,stop_on_repeated_identity:true,stop_on_empty_page:true}};
  for(const [name,value] of [['adapter.json',adapter],['workflow-recipe.json',recipe],['selectors.json',selectors],['request-templates.json',requests],['input-schema.json',inputSchema],['output-schema.json',outputSchema],['pagination.json',pagination]]) writeJson(path.join(outDir,name),value);
  fs.copyFileSync(path.join(__dirname,'adapter-runtime-template.cjs'),path.join(outDir,'adapter.cjs'));
  const manifest = {adapter_id:input.adapter_id,mode,files:fs.readdirSync(outDir).sort().map(name=>{const p=path.join(outDir,name);return {name,size:fs.statSync(p).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}})};
  writeJson(path.join(outDir,'package-manifest.json'),manifest);
  console.log(JSON.stringify({status:'PASS',mode,generated_files:manifest.files.length,manifest_sha256:digest(manifest)},null,2));
}
main();
