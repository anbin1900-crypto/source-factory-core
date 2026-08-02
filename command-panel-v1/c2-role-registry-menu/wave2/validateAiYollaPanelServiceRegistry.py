#!/usr/bin/env python3
import json
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker
root=Path(__file__).resolve().parent
schema=json.loads((root/'AI_YOLLA_PANEL_SERVICE_REGISTRY_CONTRACT_V1.json').read_text(encoding='utf-8'))
registry=json.loads((root/'AI_YOLLA_PANEL_SERVICE_REGISTRY_V1.json').read_text(encoding='utf-8'))
errors=sorted(Draft202012Validator(schema,format_checker=FormatChecker()).iter_errors(registry),key=lambda e:list(e.path))
if errors: raise SystemExit('\n'.join(f"{list(e.path)}: {e.message}" for e in errors))
print(json.dumps({'status':'PASS','contract':'AI_YOLLA_PANEL_SERVICE_REGISTRY_CONTRACT_V1','component_count':len(registry['components']),'service_count':len(registry['services']),'wave_id':registry['wave_metadata']['wave_id']},ensure_ascii=False,indent=2))
