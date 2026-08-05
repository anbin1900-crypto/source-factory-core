'use strict';
class BackgroundBrowserDispatch {
  constructor({open,send,close,sleep=ms=>new Promise(r=>setTimeout(r,ms)),maxAttempts=5,retryMs=30000,profile='E:\\SOURCE FACTORY\\.yolla\\yolla-workspace-browser-profile',workerPartition='persist:sf4-safe-panel-worker-1',analysisPartition='persist:yolla-analysis-browser-v1'}={}){
    if(![open,send,close].every(fn=>typeof fn==='function')) throw new Error('DISPATCH_DEPENDENCY_MISSING');
    this.open=open;this.send=send;this.close=close;this.sleep=sleep;this.maxAttempts=maxAttempts;this.retryMs=retryMs;this.profile=profile;this.workerPartition=workerPartition;this.analysisPartition=analysisPartition;this.completed=new Set();
  }
  async dispatch(job){if(!job?.dispatch_id||!job?.target)throw new Error('INVALID_DISPATCH_JOB');if(this.completed.has(job.dispatch_id))return{status:'DUPLICATE_SUPPRESSED',dispatch_id:job.dispatch_id};let lastError=null;for(let attempt=1;attempt<=this.maxAttempts;attempt++){let handle=null;try{handle=await this.open(job.target,{hidden:true,profile:this.profile,partition:job.analysis?this.analysisPartition:this.workerPartition,temporaryProfile:false});const receipt=await this.send(handle,job.payload);this.completed.add(job.dispatch_id);return{status:'PASS',dispatch_id:job.dispatch_id,attempt,receipt,profile:this.profile};}catch(error){lastError=error;if(attempt<this.maxAttempts)await this.sleep(this.retryMs);}finally{if(handle)await this.close(handle);}}const e=new Error('BACKGROUND_DISPATCH_EXHAUSTED');e.cause=lastError;throw e;}
  snapshot(){return{completed:[...this.completed],profile:this.profile,workerPartition:this.workerPartition,analysisPartition:this.analysisPartition};}
  restore(s){if(!s||!Array.isArray(s.completed)||s.profile!==this.profile)throw new Error('INVALID_DISPATCH_SNAPSHOT');this.completed=new Set(s.completed);}
}
module.exports={BackgroundBrowserDispatch};
