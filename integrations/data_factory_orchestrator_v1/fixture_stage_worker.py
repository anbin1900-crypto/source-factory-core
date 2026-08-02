#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage", required=True, choices=["SPLIT", "GPT_STRUCTURING", "COMBINE"])
    parser.add_argument("--state", required=True)
    args = parser.parse_args()
    state = json.loads(Path(args.state).read_text(encoding="utf-8"))
    result = {
        "stage": args.stage,
        "fixture_adapter": True,
        "project_id": state["project_id"],
        "source_id": state["source_id"],
        "execution_id": state["execution_id"],
        "artifact_pointer": state["artifact_pointer"],
        "production": False,
    }
    print("YOLLA_RESULT_JSON=" + json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
