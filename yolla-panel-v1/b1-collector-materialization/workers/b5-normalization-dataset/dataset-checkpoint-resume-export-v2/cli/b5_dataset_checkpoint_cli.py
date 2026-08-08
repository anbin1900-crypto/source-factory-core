#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, sys
from pathlib import Path
HERE=Path(__file__).resolve()
sys.path.insert(0,str(HERE.parents[1]/"src"))
from dataset_checkpoint_resume_export import CheckpointDataset, smoke

p=argparse.ArgumentParser()
sub=p.add_subparsers(dest="cmd",required=True)
s=sub.add_parser("resume-smoke")
s.add_argument("--workdir",required=True)
s.add_argument("--records",type=int,default=1205)
s.add_argument("--cut",type=int,default=600)

q=sub.add_parser("init")
q.add_argument("--workdir",required=True)
q.add_argument("--command-id",required=True)
q.add_argument("--session-id",required=True)
q.add_argument("--dataset-id",required=True)
q.add_argument("--recipe-version",required=True)
q.add_argument("--artifact-pointer",required=True)
q.add_argument("--schema-pointer",required=True)

q=sub.add_parser("append")
q.add_argument("--workdir",required=True)
q.add_argument("--input",required=True)
q.add_argument("--last-cursor")
q.add_argument("--last-action-id")

q=sub.add_parser("preview")
q.add_argument("--workdir",required=True)
q.add_argument("--offset",type=int,default=0)
q.add_argument("--limit",type=int,default=30)
q.add_argument("--overscan",type=int,default=5)

q=sub.add_parser("export")
q.add_argument("--workdir",required=True)
q.add_argument("--outdir",required=True)

for name in ("projection","resume-state"):
    q=sub.add_parser(name)
    q.add_argument("--workdir",required=True)

a=p.parse_args()
if a.cmd=="resume-smoke":
    out=smoke(Path(a.workdir),a.records,a.cut)
elif a.cmd=="init":
    ds=CheckpointDataset(
        Path(a.workdir),
        command_id=a.command_id,
        session_id=a.session_id,
        dataset_id=a.dataset_id,
        recipe_version=a.recipe_version,
        artifact_pointer=a.artifact_pointer,
        schema_pointer=a.schema_pointer,
    )
    out=ds.initialize()
else:
    ds=CheckpointDataset.open_existing(Path(a.workdir))
    if a.cmd=="append":
        rows=json.loads(Path(a.input).read_text(encoding="utf-8"))
        out=ds.append_after_checkpoint(rows,last_cursor=a.last_cursor,last_action_id=a.last_action_id)
    elif a.cmd=="preview":
        out=ds.reconstruct_preview(offset=a.offset,limit=a.limit,overscan=a.overscan)
    elif a.cmd=="export":
        out=ds.export(Path(a.outdir))
    elif a.cmd=="projection":
        out=ds.a7_projection()
    else:
        out=ds.resume_state()
print(json.dumps(out,ensure_ascii=False,indent=2,sort_keys=True))
