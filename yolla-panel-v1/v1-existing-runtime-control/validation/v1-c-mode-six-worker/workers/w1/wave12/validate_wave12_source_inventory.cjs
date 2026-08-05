'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = process.argv[2] || __dirname;
const inv = JSON.parse(fs.readFileSync(path.join(root,'W1_EXECUTABLE_SOURCE_INVENTORY_LOCK_V5.json'),'utf8'));
const map = JSON.parse(fs.readFileSync(path.join(root,'W1_RC4_COMPATIBILITY_AND_IMPLEMENTATION_GAP_MAP_V1.json'),'utf8'));
const hex40=/^[0-9a-f]{40}$/; const hex64=/^[0-9a-f]{64}$/;
assert.equal(inv.schema_version,'W1_EXECUTABLE_SOURCE_INVENTORY_LOCK_V5');
assert.equal(inv.result_key,'519516821900');
assert.equal(inv.counts.unclassified_required_component_count,0);
assert.equal(inv.counts.result_report_schema_fixture_pointer_in_payload_count,0);
assert.equal(inv.files.length,17);
assert.deepEqual(inv.files.map(x=>x.load_order),Array.from({length:17},(_,i)=>i+1));
for(const f of inv.files){
  assert.match(f.source_commit,hex40); assert.match(f.blob_sha1,hex40); assert.match(f.sha256,hex64);
  assert.ok(f.size_bytes>0); assert.ok(f.source_path); assert.ok(f.install_destination); assert.ok(f.package_path);
}
for(const k of ['BACKGROUND_BROWSER_DISPATCH','WORK_CONTROL_EVENT_LOGGING','ROLLBACK_RUNTIME','LAUNCHER_SWITCH_AFTER_SMOKE']) {
  assert.equal(inv.special_gap_closure[k],'EXECUTABLE_SOURCE_LOCKED');
}
assert.equal(map.source_absence_gap_count,0);
assert.equal(map.implementation_action_count,3);
assert.equal(map.compatibility_status,'PASS_WITH_IMPLEMENTATION_ACTIONS');
console.log(JSON.stringify({status:'PASS',assertions:17+17*7+4+3,locked_files:17,implementation_actions:3}));
