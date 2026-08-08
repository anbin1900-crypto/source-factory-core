#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from blueprint_ontology_binding_dataset import smoke

parser = argparse.ArgumentParser()
parser.add_argument("command", choices=["smoke"])
parser.add_argument("--workdir", required=True)
parser.add_argument("--fixture", required=True)
args = parser.parse_args()
print(json.dumps(smoke(Path(args.workdir), Path(args.fixture)), ensure_ascii=False, indent=2, sort_keys=True))
