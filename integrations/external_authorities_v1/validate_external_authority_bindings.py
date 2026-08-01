#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

HEX40 = set('0123456789abcdef')
HEX64 = set('0123456789abcdef')


def is_hex(value: object, length: int) -> bool:
    return isinstance(value, str) and len(value) == length and set(value) <= (HEX40 if length == 40 else HEX64)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('manifest', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    data = json.loads(args.manifest.read_text(encoding='utf-8'))
    findings: list[dict[str, object]] = []

    for key in ['source_factory', 'api_w01', 'knowledge_db', 'b_group', 'c_group', 'boundaries']:
        if key not in data:
            findings.append({'code': 'MISSING_SECTION', 'section': key})

    sf = data.get('source_factory', {})
    if not is_hex(sf.get('support_head'), 40):
        findings.append({'code': 'BAD_SOURCE_FACTORY_HEAD'})
    if not is_hex(sf.get('bundle_sha256'), 64):
        findings.append({'code': 'BAD_SOURCE_FACTORY_BUNDLE_SHA'})
    if sf.get('terminal') != 'SOURCE_FACTORY_PC_AGENT_ADAPTER_SUPPORT_READY':
        findings.append({'code': 'BAD_SOURCE_FACTORY_TERMINAL'})

    api = data.get('api_w01', {})
    if not is_hex(api.get('contract_source_commit'), 40):
        findings.append({'code': 'BAD_API_CONTRACT_COMMIT'})
    if api.get('canonical_identifiers') != ['source_system_id', 'request_id', 'artifact_id', 'dataset_id']:
        findings.append({'code': 'BAD_CANONICAL_IDENTIFIERS'})
    if len(api.get('files', [])) != 2:
        findings.append({'code': 'BAD_API_FILE_COUNT'})

    d1 = data.get('knowledge_db', {})
    if d1.get('terminal') != 'D1_KNOWLEDGE_DB_MINIMUM_MAPPING_FIXTURE_READY':
        findings.append({'code': 'BAD_D1_TERMINAL'})
    for name in ('pointer', 'exact_ledger'):
        obj = d1.get(name, {})
        if not is_hex(obj.get('commit'), 40) or not is_hex(obj.get('blob'), 40):
            findings.append({'code': 'BAD_D1_BINDING', 'name': name})

    b1 = data.get('b_group', {})
    if b1.get('terminal') != 'B1_A1_FRONTLINE_RUNTIME_SUPPORT_PACKAGE_READY':
        findings.append({'code': 'BAD_B1_TERMINAL'})
    for name in ('pointer', 'package', 'materializer', 'archive'):
        obj = b1.get(name, {})
        if not is_hex(obj.get('commit'), 40) or not is_hex(obj.get('blob'), 40):
            findings.append({'code': 'BAD_B1_BINDING', 'name': name})

    c1 = data.get('c_group', {})
    if c1.get('terminal') != 'C1_A1_MINIMUM_INTEGRATION_FIXTURE_HARNESS_READY':
        findings.append({'code': 'BAD_C1_TERMINAL'})
    if len(c1.get('artifacts', {})) != 6:
        findings.append({'code': 'BAD_C1_ARTIFACT_COUNT'})
    for name, obj in c1.get('artifacts', {}).items():
        if not is_hex(obj.get('commit'), 40) or not is_hex(obj.get('blob'), 40):
            findings.append({'code': 'BAD_C1_BINDING', 'name': name})

    boundaries = data.get('boundaries', {})
    forbidden_true = [key for key, value in boundaries.items() if value is True]
    if forbidden_true:
        findings.append({'code': 'FORBIDDEN_BOUNDARY_TRUE', 'fields': forbidden_true})

    result = {
        'schema_version': 'YOLLA_A1_EXTERNAL_AUTHORITY_BINDINGS_VALIDATION_V1',
        'accepted': not findings,
        'finding_count': len(findings),
        'findings': findings,
        'bound_authority_count': 5,
        'production': False,
        'ready': False,
        'merge': False,
    }
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result['accepted'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
