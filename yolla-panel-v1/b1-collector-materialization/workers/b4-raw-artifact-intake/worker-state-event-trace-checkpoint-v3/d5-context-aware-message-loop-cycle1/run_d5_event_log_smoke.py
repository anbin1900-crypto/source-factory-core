from __future__ import annotations
import json, sys, tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'src'))
sys.path.insert(0,str(ROOT.parent/'src'))
sys.path.insert(0,str(ROOT/'upstream'))
from automation_event_log import AutomationEventLogAndMetrics

def run(root: Path):
    s=AutomationEventLogAndMetrics(root)
    base=dict(command_id='D1-CYCLE1-CMD-001',context_id='CTX-D1-AUTOMATION-001',responsible_worker_id='AUTOMATION-W5',source_pointer='fixture://d1-cycle1')
    events=[
        ('COMMAND_CREATED','2026-08-07T23:10:00+09:00'),
        ('CONTEXT_SELECTED','2026-08-07T23:10:01+09:00'),
        ('MESSAGE_SENT','2026-08-07T23:10:02+09:00'),
        ('WORKING','2026-08-07T23:10:03+09:00'),
        ('REPLY_COMPLETED','2026-08-07T23:10:07+09:00'),
        ('RESULT_RETURNED','2026-08-07T23:10:08+09:00'),
    ]
    queued=[s.emit_nonblocking(**base,event_type=e,observed_at=t) for e,t in events]
    persisted=s.flush()
    restart=s.restart_readback(base['command_id'],base['context_id'])
    metrics=s.metrics(); s.close()
    result={'status':'PASS','queued_count':len(queued),'persisted_dispositions':[r['disposition'] for r in persisted],'restart_readback':restart,'metrics':metrics}
    assert all(x=='ACCEPTED' for x in result['persisted_dispositions'])
    assert restart['restored_event_type']=='RESULT_RETURNED' and restart['restored_event_seq']==6
    assert metrics['MESSAGE_SEND_SUCCESS_RATE']==1.0 and metrics['AVERAGE_REPLY_TIME']==5.0 and metrics['COMMAND_TO_RESULT_ELAPSED_TIME']==8.0
    return result

if __name__=='__main__':
    with tempfile.TemporaryDirectory() as td:
        print(json.dumps(run(Path(td)),ensure_ascii=False,indent=2,sort_keys=True))
