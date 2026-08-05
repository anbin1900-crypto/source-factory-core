'use strict';
const crypto=require('node:crypto');
function validateWave10Bat(buffer){
  if(!Buffer.isBuffer(buffer)) throw new Error('BYTE_BUFFER_REQUIRED');
  const text=buffer.toString('utf8');
  const sha256=crypto.createHash('sha256').update(buffer).digest('hex');
  const runtimeExtensions=['.cjs','.js','.css','.ps1'];
  const runtimePayloadCount=runtimeExtensions.reduce((n,x)=>n+(text.includes(x)?1:0),0);
  const resultJsonOnly=/WAVE7_.*RESULT.*\.json/i.test(text)&&/Compress-Archive/i.test(text);
  const installsRuntime=/copy\s+.*\.(cjs|js|css|ps1)/i.test(text)||/Expand-Archive/i.test(text)||/npm\s+install/i.test(text);
  return {
    schema_version:'WAVE11_CONNECTOR_BYTE_NEGATIVE_FIXTURE_V1',
    size_bytes:buffer.length,
    sha256,
    expected_sha256:'21587622092a36b16c054569ee97463cfc9458b945a26018c486f0f83f5c6447',
    sha256_match:sha256==='21587622092a36b16c054569ee97463cfc9458b945a26018c486f0f83f5c6447',
    result_json_only:resultJsonOnly,
    runtime_payload_reference_count:runtimePayloadCount,
    runtime_install_action_present:installsRuntime,
    installable_runtime:false,
    negative_fixture_pass:resultJsonOnly&&!installsRuntime&&runtimePayloadCount===0
  };
}
module.exports={validateWave10Bat};
