#!/usr/bin/env python3
import json
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker

root = Path(__file__).resolve().parent
schema = json.loads((root / 'ROLE_SELECTION_CONTEXT_CONTRACT_V2.json').read_text(encoding='utf-8'))
fixture = {
  'schema_version': 'ROLE_SELECTION_CONTEXT_V2',
  'role_id': 'C-2', 'group_id': 'C_GROUP', 'role_type': 'WORKER', 'status': 'DIRECTIVE_READY',
  'repository': 'anbin1900-crypto/yolla-real-estate-data-engine', 'pr_number': 168,
  'comment_id': 5155839489, 'directive_id': 'C1-TO-C2-ROLE-SELECTION-CARD-HANDOFF-V2-20260802-001',
  'cycle_id': 'COMMAND-PANEL-CYCLE2-20260802', 'assignment_id': 'C2-ROLE-SELECTION-CARD-HANDOFF',
  'source_time': '2026-08-02T06:20:00Z', 'selection_reason': 'latest valid C-2 Cycle 2 directive',
  'result_comment_id': None, 'remote_head': None, 'output_pointer': None, 'blocker': None
}
validator = Draft202012Validator(schema, format_checker=FormatChecker())
errors = sorted(validator.iter_errors(fixture), key=lambda e: list(e.path))
if errors:
    raise SystemExit('\n'.join(error.message for error in errors))
print(json.dumps({'status':'PASS','contract':'ROLE_SELECTION_CONTEXT_CONTRACT_V2','fixture_count':1}, indent=2))
