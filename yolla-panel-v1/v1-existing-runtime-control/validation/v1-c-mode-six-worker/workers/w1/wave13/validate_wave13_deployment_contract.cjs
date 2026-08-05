'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = __dirname;
const layout = JSON.parse(fs.readFileSync(path.join(root,'DEPLOYMENT_LAYOUT_V1.json'),'utf8'));
const map = JSON.parse(fs.readFileSync(path.join(root,'SOURCE_TO_TARGET_MAP_V1.json'),'utf8'));
const contract = JSON.parse(fs.readFileSync(path.join(root,'STARTUP_AND_ROLLBACK_CONTRACT_V1.json'),'utf8'));
let n=0; const ok=(v,m)=>{assert.ok(v,m);n++;};
ok(layout.schema_version==='DEPLOYMENT_LAYOUT_V1','layout schema');
ok(map.schema_version==='SOURCE_TO_TARGET_MAP_V1','map schema');
ok(contract.schema_version==='STARTUP_AND_ROLLBACK_CONTRACT_V1','contract schema');
for (const x of [layout,map,contract]) {
  ok(x.result_key==='519605250600','result key');
  ok(x.wave_id==='V1-C-MODE-6W-WAVE-013','wave');
  ok(x.production===false && x.ready===false && x.merge===false,'safety');
}
ok(layout.roots.RELEASE_ROOT==='E:\\SOURCE FACTORY\\.yolla\\releases\\5.10.2.4.2-rc4','release root');
ok(layout.roots.STATE_ROOT==='E:\\SOURCE FACTORY\\.yolla\\state','state root');
ok(layout.roots.PROFILE_ROOT==='E:\\SOURCE FACTORY\\.yolla\\profiles','profile root');
ok(layout.partitions.PARTITION_C==='persist:yolla-v510241-c','partition c');
ok(layout.partitions.PARTITION_REPEAT==='persist:yolla-v510241-repeat','partition repeat');
ok(map.SOURCE_MEMBER_COUNT===17 && map.SOURCE_MEMBERS.length===17,'17 members');
const fields=['SOURCE_PATH','SOURCE_COMMIT','SOURCE_BLOB_SHA1','SOURCE_SHA256','PACKAGE_RELATIVE_PATH','TARGET_PC_ROOT','TARGET_PC_PATH','LOAD_ORDER','STARTUP_ENTRYPOINT','ROLLBACK_TARGET','OWNER'];
for (const row of map.SOURCE_MEMBERS) {
  for (const f of fields) ok(row[f]!==undefined && row[f]!==null && row[f]!=='',`${row.LOGICAL_ROLE}:${f}`);
  ok(/^[0-9a-f]{40}$/.test(row.SOURCE_COMMIT),`${row.LOGICAL_ROLE}:commit`);
  ok(/^[0-9a-f]{40}$/.test(row.SOURCE_BLOB_SHA1),`${row.LOGICAL_ROLE}:blob`);
  ok(/^[0-9a-f]{64}$/.test(row.SOURCE_SHA256),`${row.LOGICAL_ROLE}:sha256`);
  ok(row.CLASSIFICATION==='EXECUTABLE_SOURCE',`${row.LOGICAL_ROLE}:classification`);
}
ok(new Set(map.SOURCE_MEMBERS.map(x=>x.LOGICAL_ROLE)).size===17,'role unique');
ok(map.installer_patch_requirements.length===4,'patch requirements');
ok(contract.installation_order.length===14,'install order');
ok(contract.rollback_restoration_order.length===9,'rollback order');
ok(contract.startup_wrapper_generation.status==='GENERATE_BY_W5_FROM_CONTRACT','wrapper generation');
ok(contract.startup_wrapper_generation.files.length===3,'wrapper count');
ok(contract.launcher_pointer.write_gate.includes('PASS'),'smoke gate');
ok(contract.acceptance_gates.RESULT_REPORT_POINTER_SCHEMA_FIXTURE_PAYLOAD_COUNT===0,'no evidence payload');
ok(contract.acceptance_gates.STARTUP_WRAPPER_UNSPECIFIED_GAP_COUNT===0,'no unspecified gaps');
console.log(`PASS_${n}_ASSERTIONS`);
