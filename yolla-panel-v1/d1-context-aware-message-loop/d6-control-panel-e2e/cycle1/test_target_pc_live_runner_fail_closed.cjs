'use strict';
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const inputPath=path.join(__dirname,'_runner_input.json');
fs.writeFileSync(inputPath, JSON.stringify({cycle_id:'c',worker_id:'D-6',command:'x'}));
const r=cp.spawnSync(process.execPath,[path.join(__dirname,'target_pc_live_runner.cjs'),'--input',inputPath],{encoding:'utf8',env:{...process.env,YOLLA_EXISTING_BROWSER_AGENT_ADAPTER:''}});
try {
  assert.equal(r.status,41);
  assert.match(r.stderr,/EXISTING_BROWSER_AGENT_ADAPTER_NOT_BOUND/);
  console.log('PASS_FAIL_CLOSED_NO_ADAPTER');
} finally { fs.unlinkSync(inputPath); }
