from __future__ import annotations
import argparse, json
from pathlib import Path
from edge_regression_harness import execute

def main()->int:
    p=argparse.ArgumentParser();p.add_argument('--output-dir',default='artifacts/wave3-run');args=p.parse_args();r=execute(Path(args.output_dir));print(json.dumps(r,indent=2,sort_keys=True));return 0 if r['status']=='PASS' else 1
if __name__=='__main__': raise SystemExit(main())
