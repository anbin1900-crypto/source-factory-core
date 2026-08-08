#!/usr/bin/env python3
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve()
SRC = HERE.parents[1] / "src"
sys.path.insert(0, str(SRC))
from dataset_preview_checkpoint import DatasetStore, fixture_records, smoke


def main() -> int:
    parser = argparse.ArgumentParser(description="B-5 Dataset Preview/Checkpoint/Export CLI")
    sub = parser.add_subparsers(dest="command", required=True)
    s = sub.add_parser("smoke")
    s.add_argument("--workdir", required=True)
    s.add_argument("--records", type=int, default=1205)
    a = sub.add_parser("append")
    a.add_argument("--workdir", required=True)
    a.add_argument("--input", required=True)
    p = sub.add_parser("preview")
    p.add_argument("--workdir", required=True)
    p.add_argument("--offset", type=int, default=0)
    p.add_argument("--limit", type=int, default=50)
    p.add_argument("--overscan", type=int, default=5)
    e = sub.add_parser("export")
    e.add_argument("--workdir", required=True)
    e.add_argument("--outdir", required=True)
    args = parser.parse_args()
    if args.command == "smoke":
        result = smoke(Path(args.workdir), args.records)
    elif args.command == "append":
        records = json.loads(Path(args.input).read_text(encoding="utf-8"))
        store = DatasetStore(Path(args.workdir))
        store.initialize()
        result = store.append(records)
    elif args.command == "preview":
        store = DatasetStore.recover_from_pointer(Path(args.workdir) / "LATEST_POINTER.json")
        result = store.preview_window(args.offset, args.limit, args.overscan)
    elif args.command == "export":
        store = DatasetStore.recover_from_pointer(Path(args.workdir) / "LATEST_POINTER.json")
        result = store.export(Path(args.outdir))
    else:
        raise AssertionError(args.command)
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
