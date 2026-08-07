'use strict';
const fs = require('node:fs');
const path = require('node:path');

function rollback({releaseDir, backupDir, launcherFile, baseline='5.10.2.4.0'}) {
  if (!releaseDir || !backupDir || !launcherFile) throw new Error('ROLLBACK_ARGUMENT_MISSING');
  if (!fs.existsSync(backupDir)) throw new Error('BACKUP_DIRECTORY_MISSING');
  if (fs.existsSync(releaseDir)) fs.rmSync(releaseDir, {recursive:true, force:true});
  fs.mkdirSync(path.dirname(releaseDir), {recursive:true});
  fs.cpSync(backupDir, releaseDir, {recursive:true});
  fs.writeFileSync(launcherFile, JSON.stringify({version:baseline, release_dir:releaseDir}, null, 2), 'utf8');
  return {status:'PASS', restored_version:baseline, preserved:['login-profile','runtime-log','work-control-jsonl','dispatch-receipts','c-repeat-state']};
}
module.exports = { rollback };
