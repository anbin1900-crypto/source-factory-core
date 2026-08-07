import sys,tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parents[1]/'src'))
from cycle3_recovery_ingestion import Cycle3RecoveryIngestion

def test_d2_live_resumed_ingest_and_metrics():
    with tempfile.TemporaryDirectory() as td:
        s=Cycle3RecoveryIngestion(Path(td))
        assert [x['disposition'] for x in s.replay_cycle2_baseline()]==['ACCEPTED']*3
        assert s.ingest_d2_live_resumed()['disposition']=='ACCEPTED'
        m=s.recovery_metrics()
        assert m['workers']['D-2']['latest_status']=='LIVE_RESUMED'
        assert m['workers']['D-2']['blocker_duration_seconds']==6209.469848
        assert m['workers']['D-2']['recovery_latency_seconds']==1338.469848
        assert m['workers']['D-2']['retry_to_recovery_seconds']==1378.469848
        assert m['recovered_worker_count']==1
        assert m['open_blocker_count']==2
        assert m['workers']['D-4']['latest_status']=='ADAPTER_UNAVAILABLE'
        assert m['workers']['D-6']['latest_status']=='BLOCKED_EXTERNAL'
        assert m['d4_d6_completion_inference_count']==0
        assert m['upstream_mutation_count']==0
        s.close()

def test_duplicate_guard():
    with tempfile.TemporaryDirectory() as td:
        s=Cycle3RecoveryIngestion(Path(td)); s.replay_cycle2_baseline()
        assert s.ingest_d2_live_resumed()['disposition']=='ACCEPTED'
        assert s.ingest_d2_live_resumed()['disposition']=='DUPLICATE_SUPPRESSED'; s.close()

def test_order_guard():
    with tempfile.TemporaryDirectory() as td:
        s=Cycle3RecoveryIngestion(Path(td)); s.replay_cycle2_baseline(); data,r=s.load_live_receipt()
        old=s.mod.Receipt(**{**r.__dict__,'source_receipt_pointer':'github://source-factory-core/pr81/comment/order-test','observed_at':'2026-08-07T15:00:00+00:00'})
        assert s.store.ingest(old)['disposition']=='ORDER_REVERSED_REJECTED'; s.close()

def test_restart_after_resume():
    with tempfile.TemporaryDirectory() as td:
        p=Path(td); s=Cycle3RecoveryIngestion(p); s.replay_cycle2_baseline(); s.ingest_d2_live_resumed(); s.close()
        s2=Cycle3RecoveryIngestion(p); rb=s2.restart_readback()
        assert rb['restored_event_seq']==2
        assert rb['restored_state']['status']=='LIVE_RESUMED'; s2.close()

def test_nonblocking_writer():
    with tempfile.TemporaryDirectory() as td:
        s=Cycle3RecoveryIngestion(Path(td)); s.replay_cycle2_baseline()
        q=s.ingest_d2_live_resumed_nonblocking(); assert q['disposition']=='QUEUED_NON_BLOCKING'
        out=s.store.flush(); assert out[0]['disposition']=='ACCEPTED'; s.close()
