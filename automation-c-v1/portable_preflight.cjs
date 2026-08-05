'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
function sha256(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function assert(cond,msg){if(!cond)throw new Error(msg);}
function run({root=process.cwd(),manifestPath,installerPath}={}){
  const manifestFile=path.resolve(root,manifestPath||'RC3_IMMUTABLE_PAYLOAD_MANIFEST_V1.json');
  const installerFile=path.resolve(root,installerPath||'INSTALL_RC3_IMMUTABLE_ARTIFACT.bat');
  assert(fs.existsSync(manifestFile),'MANIFEST_MISSING');
  assert(fs.existsSync(installerFile),'INSTALLER_MISSING');
  const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
  const installer=fs.readFileSync(installerFile,'utf8');
  assert(manifest&&typeof manifest==='object','MANIFEST_INVALID');
  const inputs=manifest.inputs||manifest.files||manifest.payload_files||[];
  assert(Array.isArray(inputs)&&inputs.length>0,'MANIFEST_INPUTS_EMPTY');
  for(const item of inputs){
    const p=item.path||item.file||item.relative_path;
    const hash=item.sha256||item.sha_256;
    assert(typeof p==='string'&&p.length>0,'INPUT_PATH_MISSING');
    assert(typeof hash==='string'&&/^[a-f0-9]{64}$/i.test(hash),'INPUT_SHA256_INVALID');
  }
  const preserve=manifest.preserve||manifest.preservation||manifest.preserve_gate||{};
  const preserveText=JSON.stringify(preserve).toUpperCase();
  for(const key of ['LOGIN_PROFILE','RUNTIME_LOG','WORK_CONTROL_JSONL','DISPATCH_RECEIPT','C_STATE','REPEAT_STATE']) assert(preserveText.includes(key),'PRESERVE_GATE_MISSING_'+key);
  assert(!/LEGACY[_ -]?[AE].*(TRUE|1|ENABLE)/i.test(JSON.stringify(manifest)),'LEGACY_A_E_REINTRODUCED');
  assert(/Build-RC3ImmutableArtifact\.ps1/i.test(installer)||/powershell/i.test(installer),'INSTALLER_ENTRY_INVALID');
  return {schema_version:'PORTABLE_PREFLIGHT_RECEIPT_V1',status:'PASS',manifest_sha256:sha256(manifestFile),installer_sha256:sha256(installerFile),input_count:inputs.length,preserve_gate_count:6,legacy_a_e_reintroduction_count:0};
}
if(require.main===module){try{console.log(JSON.stringify(run({manifestPath:process.argv[2],installerPath:process.argv[3]})));}catch(e){console.error(e.stack||e);process.exit(1);}}
module.exports={run};
