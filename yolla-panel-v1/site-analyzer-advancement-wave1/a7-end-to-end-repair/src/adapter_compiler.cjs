'use strict';
const vm = require('node:vm');
const crypto = require('node:crypto');

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.keys(value).sort().reduce((o,k) => (o[k] = stable(value[k]), o), {});
  return value;
}
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }

function compileAdapter({ structure, endpointInference, adapterId = 'site-adapter-v1' }) {
  const fields = (structure.field_candidates || []).slice(0, 20).map(f => ({ name: f.name, source_keys: f.source_keys }));
  const mode = endpointInference.extraction_mode;
  const recipe = {
    schema_version: 'EXECUTABLE_EXTRACTION_RECIPE_V1', adapter_id: adapterId, mode,
    fields, pagination: structure.pagination,
    endpoint_templates: endpointInference.endpoint_groups.map(g => ({ endpoint_id: g.endpoint_id, method: g.method, url_template: g.url_template, record_path: g.record_paths[0]?.path || null }))
  };
  const source = `'use strict';\nfunction arrays(v,p='$',o=[]){if(Array.isArray(v)){if(v.some(x=>x&&typeof x==='object'&&!Array.isArray(x)))o.push({path:p,records:v.filter(x=>x&&typeof x==='object'&&!Array.isArray(x))});v.forEach((x,i)=>arrays(x,p+'['+i+']',o));}else if(v&&typeof v==='object'){for(const [k,x] of Object.entries(v))arrays(x,p+'.'+k,o);}return o;}\nfunction shape(record,fields){const out={};for(const f of fields){let value;for(const k of f.source_keys||[]){if(record[k]!=null){value=record[k];break;}}if(value===undefined&&record[f.name]!=null)value=record[f.name];out[f.name]=value??null;}return out;}\nmodule.exports={adapter_id:${JSON.stringify(adapterId)},mode:${JSON.stringify(mode)},async extract(input={}){let records=[];if(this.mode!=='DOM'){for(const body of input.apiBodies||[]){let value=body;try{if(typeof body==='string')value=JSON.parse(body);}catch{}const found=arrays(value).sort((a,b)=>b.records.length-a.records.length)[0];if(found)records.push(...found.records);}}if((this.mode==='DOM'||this.mode==='HYBRID')&&records.length===0)records.push(...(input.domRecords||[]));return records.slice(0,20).map(r=>shape(r,${JSON.stringify(fields)}));}};\n`;
  return { schema_version: 'EXECUTABLE_ADAPTER_PACKAGE_V1', adapter_id: adapterId, mode, source, recipe, source_sha256: digest(source), recipe_sha256: digest(recipe) };
}

async function executeAdapterSource(source, input) {
  const sandbox = { module: { exports: {} }, exports: {} };
  vm.runInNewContext(source, sandbox, { timeout: 1000, filename: 'generated-adapter.cjs' });
  if (typeof sandbox.module.exports.extract !== 'function') throw new Error('GENERATED_ADAPTER_EXTRACT_MISSING');
  return sandbox.module.exports.extract(input);
}

async function replayPackage(pkg, input) {
  const first = await executeAdapterSource(pkg.source, input);
  const second = await executeAdapterSource(pkg.source, input);
  const firstSha = digest(first), secondSha = digest(second);
  return { schema_version: 'ADAPTER_REPLAY_TRACE_V1', success: firstSha === secondSha && first.length > 0, first_sha256: firstSha, second_sha256: secondSha, deterministic: firstSha === secondSha, record_count: first.length, records: first, repair_count: 0 };
}

module.exports = { compileAdapter, executeAdapterSource, replayPackage, digest };
