from __future__ import annotations
import importlib.util, json
from datetime import datetime
from pathlib import Path

HERE=Path(__file__).resolve().parent
CYCLE3=HERE.parent
D5=CYCLE3.parent
CYCLE2=D5/'cycle2-real-receipt-ingestion'

def _load_cycle2():
    path=CYCLE2/'src'/'receipt_ingestion_adapter.py'
    spec=importlib.util.spec_from_file_location('d5_cycle2_receipt_ingestion_adapter',path)
    mod=importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    return mod

def ts(v:str): return datetime.fromisoformat(v.replace('Z','+00:00'))

class Cycle3RecoveryIngestion:
    def __init__(self,root:Path):
        self.mod=_load_cycle2(); self.store=self.mod.RealReceiptIngestion(Path(root))

    def replay_cycle2_baseline(self):
        data=json.loads((CYCLE2/'ACTUAL_CYCLE1_RECEIPTS_V1.json').read_text(encoding='utf-8'))
        return [self.store.ingest(self.mod.Receipt(**r)) for r in data['receipts']]

    def load_live_receipt(self):
        data=json.loads((CYCLE3/'D2_CYCLE2_LIVE_RESUMED_RECEIPT_V1.json').read_text(encoding='utf-8'))
        return data,self.mod.Receipt(**data['receipt'])

    def ingest_d2_live_resumed(self):
        data,r=self.load_live_receipt()
        if r.worker_id!='D-2' or r.status!='LIVE_RESUMED': raise ValueError('D2 LIVE_RESUMED required')
        if r.command_id!='D1-CONTEXT-AWARE-MESSAGE-LOOP-CYCLE1-20260807-001:D-2' or r.context_id!='UNRESOLVED:D-2': raise ValueError('same lineage required')
        return self.store.ingest(r)

    def ingest_d2_live_resumed_nonblocking(self):
        _,r=self.load_live_receipt(); return self.store.ingest_nonblocking(r)

    def recovery_metrics(self,as_of='2026-08-07T17:59:19+00:00'):
        base=self.store.metrics(as_of)
        rows=self.store._rows(); d2=sorted([r['state'] for r in rows if r['state']['worker_id']=='D-2'],key=lambda e:ts(e['observed_at']))
        blocked=next((e for e in d2 if e['status']=='CLAIM_STALLED'),None)
        resumed=next((e for e in reversed(d2) if e['status']=='LIVE_RESUMED'),None)
        if not blocked or not resumed: raise ValueError('actual D2 blocker and live resume required')
        contract=json.loads((CYCLE3/'D5_CYCLE3_D2_LIVE_RECOVERY_CONTRACT_V1.json').read_text(encoding='utf-8'))
        at=contract['actual_times']
        live=ts(at['live_resumed_at'])
        d2m=base['workers']['D-2']
        d2m['blocker_duration_seconds']=(live-ts(at['blocker_observed_at'])).total_seconds()
        d2m['blocker_duration_is_lower_bound']=False
        d2m['recovery_latency_seconds']=(live-ts(at['recovery_directive_created_at'])).total_seconds()
        d2m['retry_to_recovery_seconds']=(live-ts(at['retry_started_at'])).total_seconds()
        d2m['latest_status']='LIVE_RESUMED'; d2m['improvement_item']=None
        base['schema_version']='D5_CYCLE3_RECOVERY_METRICS_V1'
        base['open_blocker_count']=sum(1 for w in base['workers'].values() if w['blocker_duration_is_lower_bound'])
        base['recovered_worker_count']=sum(1 for w in base['workers'].values() if w['recovery_latency_seconds'] is not None)
        base['d4_d6_completion_inference_count']=0
        base['upstream_mutation_count']=0
        return base

    def restart_readback(self):
        return self.store.restart_readback('D1-CONTEXT-AWARE-MESSAGE-LOOP-CYCLE1-20260807-001:D-2','UNRESOLVED:D-2')

    def close(self): self.store.close()
