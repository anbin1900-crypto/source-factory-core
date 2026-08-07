from pathlib import Path
import json, shutil, sys
sys.path.insert(0,str(Path(__file__).parent/'src'))
from command_artifact_layer import DurableCommandArtifactLayer

def run(root:Path):
    if root.exists(): shutil.rmtree(root)
    s=DurableCommandArtifactLayer(root); cmd='CMD-FIXTURE-001'
    p1=s.stage_partial(command_id=cmd,attempt_no=1,step_id='FETCH_PAGE_1',raw_bytes=b'{"records":[1,2,3,4,5]}',created_at='2026-08-07T22:00:00+09:00',source_pointer='fixture://page/1',b5_dataset_checkpoint_pointer='b5://dataset/checkpoint/0',metadata={'redaction_applied':True})
    r1=s.promote(p1['partial_id'],next_resumable_step='FETCH_PAGE_2')
    p2=s.stage_partial(command_id=cmd,attempt_no=1,step_id='FETCH_PAGE_2',raw_bytes=b'{"records":[6,7]}',created_at='2026-08-07T22:00:01+09:00',source_pointer='fixture://page/2',metadata={'redaction_applied':True})
    cp_before=s.recovery(cmd); s.abandon_partial(p2['partial_id'],'SIMULATED_INTERRUPTION')
    p3=s.stage_partial(command_id=cmd,attempt_no=2,step_id='FETCH_PAGE_2',raw_bytes=b'{"records":[6,7,8,9,10]}',created_at='2026-08-07T22:00:02+09:00',source_pointer='fixture://page/2',b5_dataset_checkpoint_pointer='b5://dataset/checkpoint/10',metadata={'redaction_applied':True})
    r2=s.promote(p3['partial_id'],next_resumable_step='DONE')
    p4=s.stage_partial(command_id=cmd,attempt_no=2,step_id='FETCH_PAGE_2',raw_bytes=b'{"records":[6,7,8,9,10]}',created_at='2026-08-07T22:00:03+09:00',source_pointer='fixture://page/2',metadata={'redaction_applied':True})
    d=s.promote(p4['partial_id'],next_resumable_step='DONE')
    out={'status':'PASS','command_id':cmd,'first_artifact':r1['artifact']['artifact_id'],'checkpoint_before_resume':cp_before,'second_artifact':r2['artifact']['artifact_id'],'duplicate_disposition':d['disposition'],'checkpoint_after':s.recovery(cmd),'index':s.rebuild_index(),'a7_projection':s.a7_projection(cmd)}
    assert cp_before['last_durable_artifact_pointer']==r1['artifact']['artifact_id'] and cp_before['next_resumable_step']=='FETCH_PAGE_2'
    assert out['checkpoint_after']['next_resumable_step']=='DONE'; assert out['duplicate_disposition']=='DUPLICATE_IDENTICAL'; assert out['a7_projection']['artifact_count']==2
    return out
if __name__=='__main__': print(json.dumps(run(Path(sys.argv[1] if len(sys.argv)>1 else 'smoke-out')),indent=2,sort_keys=True))
