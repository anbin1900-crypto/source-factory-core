from pathlib import Path
import json, sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'src'))
from worker_state_command_correlation_v3 import WorkerStateCommandCorrelation

def main():
    fx=json.loads((ROOT/'fixtures/worker_state_command_smoke_v3.json').read_text())
    c=WorkerStateCommandCorrelation(mission_id=fx['mission_id']); decisions=[]
    for e in fx['events']:
        b=fx['action_bindings'][e['command_id']]
        decisions.append(c.consume_a3_event(e,action_id=b['action_id'],session_id=b['session_id']))
    receipt=c.bind_result_receipt(command_id='cmd-1',receipt=fx['result_receipt'])
    state_path=ROOT/'generated/B3_WORKER_STATE_COMMAND_STATE_V3.json'; c.save(state_path)
    restored=WorkerStateCommandCorrelation.load(state_path); rebuilt=restored.reconstruct_from_ledger()
    out={
      'schema_version':'B3_WORKER_STATE_COMMAND_SMOKE_RECEIPT_V3','status':'PASS',
      'accepted_count':sum(1 for d in decisions if d['decision']=='ACCEPTED'),
      'duplicate_suppressed_count':sum(1 for d in decisions if d['decision'].startswith('DUPLICATE')),
      'stale_suppressed_count':sum(1 for d in decisions if d['decision']=='STALE_SUPPRESSED'),
      'unknown_side_state_count':sum(1 for d in decisions if d['decision']=='UNKNOWN_SIDE_STATE_RECORDED'),
      'cmd1_final_state':restored.current_state('cmd-1')['state'],'cmd2_final_state':restored.current_state('cmd-2')['state'],
      'result_receipt_bound':receipt['receipt_id'],'restart_replay_state':rebuilt['command_state']['cmd-1']['state'],
      'ledger_record_count':len(restored.state['event_ledger']),'target_pc_execution':False
    }
    (ROOT/'generated/B3_WORKER_STATE_COMMAND_SMOKE_RECEIPT_V3.json').write_text(json.dumps(out,indent=2)+'\n')
    print(json.dumps(out,sort_keys=True))
if __name__=='__main__': main()
