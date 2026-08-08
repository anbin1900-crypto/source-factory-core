import importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('m',Path(__file__).parents[1]/'src'/'cycle4_event_ingestion.py')
m=importlib.util.module_from_spec(spec); import sys; sys.modules['m']=m; spec.loader.exec_module(m)

class FakeBackend:
    def __init__(self): self.rows={}
    def accepted_events(self,c,w): return self.rows.setdefault((c,w),[])
    def restart_readback(self,c,w): return {'restored_event_seq':len(self.accepted_events(c,w))}
    def append_event(self,**kw):
        rows=self.accepted_events(kw['command_id'],kw['worker_id']); expected=len(rows)+1
        if kw['event_seq']!=expected:return {'disposition':'OUT_OF_ORDER_REJECTED','event':None}
        row=dict(kw); rows.append(row); return {'disposition':'ACCEPTED','event':row}

def seed(b):
    b.append_event(command_id=m.D2_LINEAGE_COMMAND,worker_id=m.D2_LINEAGE_CONTEXT,page_id='PR-81',event_seq=1,observed_at='2026-08-07T15:18:29Z',state={'status':'CLAIM_STALLED'},task_status='ERROR',source_pointer='old-claim',metadata={})
    b.append_event(command_id=m.D2_LINEAGE_COMMAND,worker_id=m.D2_LINEAGE_CONTEXT,page_id='PR-81',event_seq=2,observed_at='2026-08-07T17:01:58.4698489Z',state={'status':'LIVE_RESUMED'},task_status='COMPLETE',source_pointer='live-resumed',metadata={})

def test_cycle4_acceptance():
    n=0; b=FakeBackend(); seed(b); s=m.Cycle4EventIngestion(b)
    assert s.ingest(s.d2_freshness_event())['disposition']=='ACCEPTED'; n+=1
    assert len(b.accepted_events(m.D2_LINEAGE_COMMAND,m.D2_LINEAGE_CONTEXT))==3; n+=1
    assert b.accepted_events(m.D2_LINEAGE_COMMAND,m.D2_LINEAGE_CONTEXT)[-1]['state']['event_type']=='FRESHNESS_CONFIRMED'; n+=1
    assert s.ingest(s.d2_freshness_event())['disposition']=='DUPLICATE_SUPPRESSED'; n+=1
    sent,reply=s.d3_events(); assert s.ingest(sent)['disposition']=='ACCEPTED'; n+=1; assert s.ingest(reply)['disposition']=='ACCEPTED'; n+=1
    rows=b.accepted_events(m.D3_COMMAND,m.D2_RESOLVED_CONTEXT)
    assert [x['state']['event_type'] for x in rows]==['MESSAGE_SENT','ASSISTANT_REPLY_RECOVERED']; n+=1
    assert all(x['page_id']==m.PAGE_ID for x in rows); n+=1
    assert rows[1]['state']['assistant_reply_sha256']==m.REPLY_SHA256; n+=1
    old=m.ProjectionEvent(m.D3_COMMAND,m.D2_RESOLVED_CONTEXT,m.PAGE_ID,'MESSAGE_SENT','2026-08-07T18:25:00Z','github://old',{'event_type':'MESSAGE_SENT'})
    assert s.ingest(old)['disposition']=='ORDER_REVERSED_REJECTED'; n+=1
    assert s.ingest(reply)['disposition']=='DUPLICATE_SUPPRESSED'; n+=1
    assert b.restart_readback(m.D3_COMMAND,m.D2_RESOLVED_CONTEXT)['restored_event_seq']==2; n+=1
    b2=FakeBackend(); seed(b2); s2=m.Cycle4EventIngestion(b2)
    assert s2.ingest_nonblocking(s2.d2_freshness_event())['disposition']=='QUEUED_NON_BLOCKING'; n+=1
    a,r=s2.d3_events(); s2.ingest_nonblocking(a); s2.ingest_nonblocking(r)
    assert [x['disposition'] for x in s2.flush()]==['ACCEPTED','ACCEPTED','ACCEPTED']; n+=1
    met=s.metrics(); assert abs(met['freshness_latency_seconds']-551.453821)<1e-6; n+=1
    assert met['freshness_guard_valid_at_dispatch'] is False; n+=1
    assert abs(met['freshness_guard_breach_seconds']-251.453821)<1e-6; n+=1
    assert abs(met['message_to_reply_latency_seconds']-38.136206)<1e-6; n+=1
    assert met['dispatch_success_rate']==1.0; n+=1
    assert met['remaining_open_workers']==['D-4','D-6'] and met['remaining_open_blocker_count']==2; n+=1
    assert met['d4_d6_completion_inference_count']==0; n+=1
    assert met['upstream_event_store_mutation_count']==0; n+=1
    s.close(); s2.close(); assert n==22
