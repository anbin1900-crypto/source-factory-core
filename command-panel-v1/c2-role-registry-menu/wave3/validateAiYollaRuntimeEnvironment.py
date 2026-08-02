#!/usr/bin/env python3
import json
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker

root = Path(__file__).resolve().parent
schema = json.loads((root / 'AI_YOLLA_RUNTIME_ENVIRONMENT_CONTRACT_V1.json').read_text(encoding='utf-8'))
environment = json.loads((root / 'AI_YOLLA_RUNTIME_ENVIRONMENT_V1.json').read_text(encoding='utf-8'))
errors = sorted(
    Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(environment),
    key=lambda error: list(error.path),
)
if errors:
    raise SystemExit('\n'.join(f"{list(error.path)}: {error.message}" for error in errors))
print(json.dumps({
    'status': 'PASS',
    'contract': 'AI_YOLLA_RUNTIME_ENVIRONMENT_CONTRACT_V1',
    'environment_id': environment['environment_id'],
    'target_pc_terminal': environment['authority']['target_pc_terminal'],
    'context_freshness': environment['context_freshness']['status'],
    'actual_pc_command_count': environment['safety']['actual_pc_command_count'],
    'actual_pc_file_read_count': environment['safety']['actual_pc_file_read_count'],
}, ensure_ascii=False, indent=2))
