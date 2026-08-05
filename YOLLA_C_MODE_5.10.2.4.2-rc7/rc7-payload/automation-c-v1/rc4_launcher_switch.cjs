'use strict';
const fs = require('node:fs');
const path = require('node:path');

function switchLauncher({launcherFile, releaseDir, version, smokeReceipt}) {
  if (!launcherFile || !releaseDir || !version) throw new Error('LAUNCHER_ARGUMENT_MISSING');
  if (!smokeReceipt || smokeReceipt.status !== 'PASS') throw new Error('SMOKE_PASS_REQUIRED');
  if (!fs.existsSync(releaseDir)) throw new Error('RELEASE_DIRECTORY_MISSING');
  const next = `${launcherFile}.next`;
  const previous = fs.existsSync(launcherFile) ? fs.readFileSync(launcherFile, 'utf8') : '';
  fs.mkdirSync(path.dirname(launcherFile), {recursive:true});
  fs.writeFileSync(next, JSON.stringify({version, release_dir:releaseDir, previous}, null, 2), 'utf8');
  fs.renameSync(next, launcherFile);
  return {status:'PASS', version, launcher_file:launcherFile};
}
module.exports = { switchLauncher };
