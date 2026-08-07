'use strict';
const crypto=require('node:crypto');
function sha256(v){return crypto.createHash('sha256').update(v).digest('hex');}
function validateManifest(manifest, filesByBlob){
  const issues=[];
  const all=[...(manifest.runtime_files||[]),...(manifest.evidence_files||[])];
  for(const item of all){
    const bytes=filesByBlob[item.source_blob];
    if(!Buffer.isBuffer(bytes)){issues.push({type:'MISSING_BLOB',blob:item.source_blob,path:item.source_path});continue;}
    if(bytes.length!==item.size_bytes)issues.push({type:'SIZE_MISMATCH',path:item.source_path,expected:item.size_bytes,actual:bytes.length});
    const actual=sha256(bytes);if(actual!==item.sha256)issues.push({type:'SHA256_MISMATCH',path:item.source_path,expected:item.sha256,actual});
  }
  return {accepted:issues.length===0,checked:all.length,issues};
}
function validateCounters(counters){const names=['DUPLICATE','C_REPEAT_CROSS_CANCEL','END_REDISPATCH','RECEIPT_LOSS','QUEUE_GROWTH'];return {accepted:names.every(k=>counters&&counters[k]===0),names};}
module.exports={validateManifest,validateCounters};
