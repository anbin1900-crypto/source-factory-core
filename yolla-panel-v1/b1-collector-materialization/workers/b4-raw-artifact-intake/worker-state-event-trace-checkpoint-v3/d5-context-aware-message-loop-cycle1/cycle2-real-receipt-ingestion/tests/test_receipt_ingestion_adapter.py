import sys,tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parents[1]/"src"))
from receipt_ingestion_adapter import RealReceiptIngestion,load_receipts,Receipt

FIX=Path(__file__).parents[1]/"ACTUAL_CYCLE1_RECEIPTS_V1.json"

def test_actual_receipts_3_ingest():
    with tempfile.TemporaryDirectory() as td:
        s=RealReceiptIngestion(Path(td)); rs=load_receipts(FIX)
        out=[s.ingest(r) for r in rs]
        assert [x["disposition"] for x in out]==["ACCEPTED"]*3
        m=s.metrics("2026-08-07T16:39:42+00:00")
        assert m["actual_receipt_count"]==3
        assert m["actual_worker_receipt_count"]==3
        assert m["d3_independent_progress"]==1.0
        assert m["open_blocker_count"]==3
        s.close()

def test_common_event_exact_8_fields():
    for r in load_receipts(FIX): assert len(r.common_event())==8

def test_duplicate_suppression():
    with tempfile.TemporaryDirectory() as td:
        s=RealReceiptIngestion(Path(td)); r=load_receipts(FIX)[0]
        assert s.ingest(r)["disposition"]=="ACCEPTED"
        assert s.ingest(r)["disposition"]=="DUPLICATE_SUPPRESSED"
        assert s.metrics("2026-08-07T16:39:42+00:00")["actual_receipt_count"]==1
        s.close()

def test_order_reversal_block():
    with tempfile.TemporaryDirectory() as td:
        s=RealReceiptIngestion(Path(td)); r=load_receipts(FIX)[0]
        assert s.ingest(r)["disposition"]=="ACCEPTED"
        old=Receipt(**{**r.__dict__,"source_receipt_pointer":"github://old","observed_at":"2026-08-07T15:00:00+00:00"})
        assert s.ingest(old)["disposition"]=="ORDER_REVERSED_REJECTED"
        assert s.metrics("2026-08-07T16:39:42+00:00")["actual_receipt_count"]==1
        s.close()

def test_restart_restore():
    with tempfile.TemporaryDirectory() as td:
        p=Path(td); s=RealReceiptIngestion(p); r=load_receipts(FIX)[1]
        s.ingest(r); s.close(); s2=RealReceiptIngestion(p)
        rb=s2.restart_readback(r.command_id,r.context_id)
        assert rb["restored_event_seq"]==1
        assert rb["restored_state"]["status"]=="ADAPTER_UNAVAILABLE"
        s2.close()

def test_nonblocking_writer():
    with tempfile.TemporaryDirectory() as td:
        s=RealReceiptIngestion(Path(td))
        for r in load_receipts(FIX): assert s.ingest_nonblocking(r)["disposition"]=="QUEUED_NON_BLOCKING"
        out=s.flush(); assert [x["disposition"] for x in out]==["ACCEPTED"]*3; s.close()

def test_blocker_durations_lower_bound():
    with tempfile.TemporaryDirectory() as td:
        s=RealReceiptIngestion(Path(td))
        for r in load_receipts(FIX): s.ingest(r)
        m=s.metrics("2026-08-07T16:39:42+00:00")
        assert m["workers"]["D-2"]["blocker_duration_seconds"]==4873.0
        assert m["workers"]["D-4"]["blocker_duration_seconds"]==5671.0
        assert m["workers"]["D-6"]["blocker_duration_seconds"]==6043.0
        assert all(v["blocker_duration_is_lower_bound"] for v in m["workers"].values()); s.close()

def test_live_resumed_recovery_latency():
    with tempfile.TemporaryDirectory() as td:
        s=RealReceiptIngestion(Path(td)); r=load_receipts(FIX)[0]; s.ingest(r)
        resumed=Receipt(**{**r.__dict__,"source_receipt_pointer":"github://resume","observed_at":"2026-08-07T15:20:29+00:00","status":"LIVE_RESUMED","detail_code":"ACTIVE_CONTEXT_IDENTIFICATION_LIVE_PASS","terminal":"ACTIVE_CONTEXT_IDENTIFICATION_LIVE_PASS"})
        assert s.ingest(resumed)["disposition"]=="ACCEPTED"
        m=s.metrics("2026-08-07T16:39:42+00:00")
        assert m["workers"]["D-2"]["recovery_latency_seconds"]==120.0
        assert m["workers"]["D-2"]["retry_to_recovery_seconds"]==120.0
        assert not m["workers"]["D-2"]["blocker_duration_is_lower_bound"]; s.close()

def test_projection_codes():
    with tempfile.TemporaryDirectory() as td:
        s=RealReceiptIngestion(Path(td)); r=load_receipts(FIX)[0]; bad=Receipt(**{**r.__dict__,"status":"UNKNOWN"})
        try: s.ingest(bad)
        except ValueError: pass
        else: raise AssertionError("unknown status accepted")
        s.close()

def test_improvement_items():
    with tempfile.TemporaryDirectory() as td:
        s=RealReceiptIngestion(Path(td))
        for r in load_receipts(FIX): s.ingest(r)
        m=s.metrics("2026-08-07T16:39:42+00:00")
        assert m["workers"]["D-2"]["improvement_item"]=="PC_EXECUTOR_CLAIM_LOOP_RECOVERY"
        assert m["workers"]["D-4"]["improvement_item"]=="TARGET_PC_BROWSER_AGENT_ROUTE_BINDING"
        assert m["workers"]["D-6"]["improvement_item"]=="APPROVED_EXECUTOR_TUNNEL_INVOKE_SURFACE_RECOVERY"; s.close()
