'use strict';
class ActualCandidateBridgeBinding{
  constructor({releaseAdapter,namespaceAdapter}={}){if(!releaseAdapter||!namespaceAdapter)throw new Error('INVALID_ADAPTERS');this.releaseAdapter=releaseAdapter;this.namespaceAdapter=namespaceAdapter;}
  dispatchDue(at){const rs=this.releaseAdapter.dispatchDue(at);for(const r of rs){const x=this.namespaceAdapter.trackRepeatReceipt(r);if(!x.accepted)throw new Error(x.reason);}return rs;}
  acceptRepeatResult(p){const released=this.releaseAdapter.acceptResult(p);if(!released.accepted)return released;const recorded=this.namespaceAdapter.acceptCompletedRepeatResult(p);if(!recorded.accepted)throw new Error(recorded.reason);return released;}
  registerRegistry(x){return this.namespaceAdapter.registerRegistry(x);}
  acceptCResult(x){return this.namespaceAdapter.acceptCResult(x);}
  enqueueC(x){const a=this.namespaceAdapter.enqueueC(x);if(!a.accepted)return a;return this.releaseAdapter.enqueueCMode(x);}
  snapshot(){return{release:this.releaseAdapter.snapshot(),namespace:this.namespaceAdapter.snapshot()};}
}
module.exports={ActualCandidateBridgeBinding};
