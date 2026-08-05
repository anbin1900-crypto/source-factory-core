'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { BackgroundBrowserDispatch } = require('../background_browser_dispatch.cjs');
const { WorkControlEventLog } = require('../work_control_event_log.cjs');
const { switchLauncher } = require('../rc4_launcher_switch.cjs');

(async()=>{
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'rc4-smoke-'));
  const log = new WorkControlEventLog(path.join(root,'work-control.jsonl'));
  log.append({type:'SMOKE_START',role:'AUTOMATION-C-W5'});
  assert.equal(log.verify(), true);
  let closeCount=0;
  const dispatcher = new BackgroundBrowserDispatch({open:async()=>({}),send:async()=>({ok:true}),close:async()=>{closeCount++;},sleep:async()=>{},retryMs:0});
  const receipt = await dispatcher.dispatch({dispatch_id:'smoke-1',target:'fixture',payload:{}});
  assert.equal(receipt.status,'PASS'); assert.equal(closeCount,1);
  assert.equal((await dispatcher.dispatch({dispatch_id:'smoke-1',target:'fixture',payload:{}})).status,'DUPLICATE_SUPPRESSED');
  const releaseDir=path.join(root,'release'); fs.mkdirSync(releaseDir);
  const launcher=switchLauncher({launcherFile:path.join(root,'launcher.json'),releaseDir,version:'5.10.2.4.2-rc4',smokeReceipt:{status:'PASS'}});
  assert.equal(launcher.status,'PASS');
  assert.throws(()=>switchLauncher({launcherFile:path.join(root,'bad.json'),releaseDir,version:'x',smokeReceipt:{status:'FAIL'}}),/SMOKE_PASS_REQUIRED/);
  console.log('PASS_7_OF_7');
})().catch(e=>{console.error(e);process.exit(1);});
