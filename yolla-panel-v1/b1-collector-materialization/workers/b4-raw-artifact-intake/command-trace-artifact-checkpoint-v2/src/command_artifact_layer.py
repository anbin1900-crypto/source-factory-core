from __future__ import annotations
import hashlib, json, os, re
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Mapping

FORBIDDEN_SECRET_KEYS={"authorization","cookie","token","access_token","refresh_token","api_key","apikey","secret","password","sessionid","session_id"}
SECRET_PATTERNS=[re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/\-=]{8,}\b"),re.compile(r"(?i)\b(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]{4,}")]

class CommandArtifactError(ValueError): pass

def cjson(v:Any)->bytes: return json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(",",":")).encode()
def sha(data:bytes)->str: return hashlib.sha256(data).hexdigest()

def _check_meta(v:Any,path:str="$"):
    if isinstance(v,Mapping):
        for k,n in v.items():
            if str(k).lower() in FORBIDDEN_SECRET_KEYS: raise CommandArtifactError(f"secret metadata prohibited at {path}.{k}")
            _check_meta(n,f"{path}.{k}")
    elif isinstance(v,list):
        for i,n in enumerate(v): _check_meta(n,f"{path}[{i}]")

def _check_raw(b:bytes):
    t=b.decode("utf-8",errors="ignore")
    if any(p.search(t) for p in SECRET_PATTERNS): raise CommandArtifactError("secret-like raw content prohibited")

@dataclass(frozen=True)
class CommandTraceArtifact:
    schema_version:str; command_id:str; attempt_no:int; step_id:str; artifact_id:str; sha256:str; size:int; created_at:str; source_pointer:str; previous_artifact_pointer:str|None; idempotency_key:str; status:str; b5_dataset_checkpoint_pointer:str|None

class DurableCommandArtifactLayer:
    def __init__(self,root:Path):
        self.root=Path(root); self.completed=self.root/'completed'; self.partial=self.root/'partial'; self.checkpoints=self.root/'checkpoints'; self.ledger=self.root/'command-artifacts.jsonl'; self.index_path=self.root/'COMMAND_ARTIFACT_INDEX_V1.json'
        for p in (self.completed,self.partial,self.checkpoints): p.mkdir(parents=True,exist_ok=True)
    def _rows(self):
        if not self.ledger.exists(): return []
        return [json.loads(x) for x in self.ledger.read_text(encoding='utf-8').splitlines() if x.strip()]
    def _idem(self,command_id,attempt_no,step_id,digest): return sha(cjson({"command_id":command_id,"attempt_no":attempt_no,"step_id":step_id,"sha256":digest}))
    def stage_partial(self,*,command_id,attempt_no,step_id,raw_bytes,created_at,source_pointer,b5_dataset_checkpoint_pointer=None,metadata=None):
        if attempt_no<1: raise CommandArtifactError('attempt_no must be >=1')
        _check_raw(raw_bytes); _check_meta(metadata or {})
        digest=sha(raw_bytes); idem=self._idem(command_id,attempt_no,step_id,digest)
        instance=sha(cjson({'created_at':created_at,'source_pointer':source_pointer,'metadata':metadata or {}}))[:8]
        pid=f"partial-{command_id}-{attempt_no}-{step_id}-{digest[:12]}-{instance}".replace('/','_')
        data_path=self.partial/f'{pid}.bin'; meta_path=self.partial/f'{pid}.json'
        if data_path.exists() or meta_path.exists(): raise CommandArtifactError('partial overwrite rejected')
        with data_path.open('xb') as f: f.write(raw_bytes); f.flush(); os.fsync(f.fileno())
        meta={"schema_version":"COMMAND_TRACE_ARTIFACT_PARTIAL_V1","status":"PARTIAL","partial_id":pid,"command_id":command_id,"attempt_no":attempt_no,"step_id":step_id,"sha256":digest,"size":len(raw_bytes),"created_at":created_at,"source_pointer":source_pointer,"idempotency_key":idem,"b5_dataset_checkpoint_pointer":b5_dataset_checkpoint_pointer,"metadata":metadata or {},"stored_path":str(data_path.relative_to(self.root)).replace('\\','/')}
        meta_path.write_text(json.dumps(meta,indent=2,sort_keys=True),encoding='utf-8')
        return meta
    def promote(self,partial_id,*,next_resumable_step):
        meta_path=self.partial/f'{partial_id}.json'; meta=json.loads(meta_path.read_text()); raw=(self.root/meta['stored_path']).read_bytes()
        if sha(raw)!=meta['sha256']: raise CommandArtifactError('partial hash mismatch')
        for row in self._rows():
            if row['artifact']['idempotency_key']==meta['idempotency_key']:
                meta['status']='DEDUPLICATED'; meta['existing_artifact_id']=row['artifact']['artifact_id']
                meta_path.write_text(json.dumps(meta,indent=2,sort_keys=True),encoding='utf-8')
                partial_path=self.root/meta['stored_path']
                if partial_path.exists(): partial_path.unlink()
                return {"disposition":"DUPLICATE_IDENTICAL","artifact":row['artifact'],"checkpoint":self._read_checkpoint(meta['command_id'])}
        prev=None
        for row in reversed(self._rows()):
            if row['artifact']['command_id']==meta['command_id']:
                prev=row['artifact']['artifact_id']; break
        aid=f"cmdart-{meta['command_id']}-{meta['attempt_no']}-{meta['step_id']}-{meta['sha256'][:12]}".replace('/','_')
        target=self.completed/f'{aid}.bin'
        if target.exists(): raise CommandArtifactError('completed overwrite rejected')
        with target.open('xb') as f: f.write(raw); f.flush(); os.fsync(f.fileno())
        art=CommandTraceArtifact("COMMAND_TRACE_ARTIFACT_V1",meta['command_id'],meta['attempt_no'],meta['step_id'],aid,meta['sha256'],meta['size'],meta['created_at'],meta['source_pointer'],prev,meta['idempotency_key'],"COMPLETED",meta.get('b5_dataset_checkpoint_pointer'))
        row={"event":"COMMAND_ARTIFACT_COMPLETED","artifact":asdict(art)}
        with self.ledger.open('a',encoding='utf-8') as f: f.write(json.dumps(row,sort_keys=True)+'\n'); f.flush(); os.fsync(f.fileno())
        checkpoint={"schema_version":"COMMAND_ARTIFACT_CHECKPOINT_V1","command_id":meta['command_id'],"last_durable_artifact_pointer":aid,"next_resumable_step":next_resumable_step,"last_attempt_no":meta['attempt_no'],"last_step_id":meta['step_id'],"b5_dataset_checkpoint_pointer":meta.get('b5_dataset_checkpoint_pointer'),"recovery_rule":"RESUME_FROM_LAST_DURABLE_COMPLETED_ARTIFACT_ONLY"}
        cp=self.checkpoints/f"{meta['command_id']}.json"; tmp=cp.with_suffix('.tmp'); tmp.write_text(json.dumps(checkpoint,indent=2,sort_keys=True)); os.replace(tmp,cp)
        meta['status']='PROMOTED'; meta['promoted_artifact_id']=aid; meta_path.write_text(json.dumps(meta,indent=2,sort_keys=True)); (self.root/meta['stored_path']).unlink()
        self.rebuild_index()
        return {"disposition":"NEW_COMPLETED","artifact":asdict(art),"checkpoint":checkpoint}
    def abandon_partial(self,partial_id,reason):
        p=self.partial/f'{partial_id}.json'; m=json.loads(p.read_text()); m['status']='ABANDONED'; m['reason']=reason; p.write_text(json.dumps(m,indent=2,sort_keys=True)); return m
    def _read_checkpoint(self,command_id):
        p=self.checkpoints/f'{command_id}.json'; return json.loads(p.read_text()) if p.exists() else {"schema_version":"COMMAND_ARTIFACT_CHECKPOINT_V1","command_id":command_id,"last_durable_artifact_pointer":None,"next_resumable_step":"STEP_1","recovery_rule":"RESUME_FROM_LAST_DURABLE_COMPLETED_ARTIFACT_ONLY"}
    def recovery(self,command_id): return self._read_checkpoint(command_id)
    def rebuild_index(self):
        commands={}
        for row in self._rows():
            a=row['artifact']; commands.setdefault(a['command_id'],[]).append({"artifact_id":a['artifact_id'],"attempt_no":a['attempt_no'],"step_id":a['step_id'],"sha256":a['sha256'],"previous_artifact_pointer":a['previous_artifact_pointer'],"source_pointer":a['source_pointer'],"b5_dataset_checkpoint_pointer":a.get('b5_dataset_checkpoint_pointer')})
        payload={"schema_version":"COMMAND_ARTIFACT_INDEX_V1","commands":commands,"command_count":len(commands)}; self.index_path.write_text(json.dumps(payload,indent=2,sort_keys=True)); return payload
    def a7_projection(self,command_id):
        idx=self.rebuild_index(); chain=idx['commands'].get(command_id,[]); cp=self.recovery(command_id)
        return {"schema_version":"A7_RECOVERY_ARTIFACT_PROJECTION_V1","command_id":command_id,"artifact_chain":chain,"artifact_count":len(chain),"last_durable_artifact_pointer":cp.get('last_durable_artifact_pointer'),"next_resumable_step":cp.get('next_resumable_step'),"lookup_key":"command_id","b5_dataset_checkpoint_pointer":cp.get('b5_dataset_checkpoint_pointer')}
