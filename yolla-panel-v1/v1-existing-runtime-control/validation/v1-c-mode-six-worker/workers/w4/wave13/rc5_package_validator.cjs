'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
function sha256(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function validate(root,manifest){
  const failures=[];const required=['runtime-files','ui','profiles','smoke','rollback'];
  for(const dir of required)if(!fs.existsSync(path.join(root,dir)))failures.push('MISSING_PACKAGE_DIRECTORY:'+dir);
  if(!manifest||!Array.isArray(manifest.members))failures.push('MISSING_MEMBER_MANIFEST');
  const members=(manifest&&manifest.members)||[];
  for(const m of members){const file=path.join(root,m.package_path||'');if(!fs.existsSync(file)){failures.push('MISSING_MEMBER:'+m.package_path);continue;}if(m.sha256&&sha256(file)!==m.sha256)failures.push('HASH_MISMATCH:'+m.package_path);}
  if(!manifest||manifest.runtime_root!=='runtime-files')failures.push('RUNTIME_ROOT_MISMATCH');
  if(!manifest||manifest.ui_root!=='ui')failures.push('UI_PATH_MISMATCH');
  if(!manifest||manifest.fixed_profile_partition!==true)failures.push('FIXED_PROFILE_NOT_BOUND');
  if(!manifest||!Array.isArray(manifest.required_imports)||manifest.required_imports.length<6)failures.push('SMOKE_SCOPE_INSUFFICIENT');
  if(!manifest||manifest.rollback_pre_post_readback!==true)failures.push('ROLLBACK_READBACK_MISSING');
  if(!manifest||!Array.isArray(manifest.ui_load_order)||manifest.ui_load_order.length<3)failures.push('UI_LOAD_ORDER_MISSING');
  return {schema_version:'W4_RC5_PACKAGE_VALIDATION_V1',status:failures.length?'FAIL':'PASS',failures};
}
module.exports={validate};
