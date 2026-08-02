#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parent
schema = json.loads((ROOT / 'ROLE_REGISTRY_SCHEMA.json').read_text(encoding='utf-8'))
fixture = json.loads((ROOT / 'ROLE_REGISTRY_FIXTURE.json').read_text(encoding='utf-8'))
validator = Draft202012Validator(schema, format_checker=FormatChecker())
errors = sorted(validator.iter_errors(fixture), key=lambda item: list(item.absolute_path))
if errors:
    for error in errors:
        print(f"FAIL path={list(error.absolute_path)} message={error.message}")
    raise SystemExit(1)
print(json.dumps({
    'status': 'PASS',
    'schema': 'ROLE_REGISTRY_SCHEMA.json',
    'fixture': 'ROLE_REGISTRY_FIXTURE.json',
    'group_count': len(fixture['groups']),
    'role_count': len(fixture['roles'])
}, ensure_ascii=False, indent=2))
