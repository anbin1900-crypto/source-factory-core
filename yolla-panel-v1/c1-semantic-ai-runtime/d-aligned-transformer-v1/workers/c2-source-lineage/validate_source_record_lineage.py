#!/usr/bin/env python3
from __future__ import annotations
import hashlib
import json
from pathlib import Path
from typing import Any
ROOT = Path(__file__).resolve().parent

class LineageValidationError(ValueError):
    def __init__(self, code: str, message: str, details: dict[str, Any] | None=None):
        super().__init__(message)
        self.code = code
        self.details = details or {}

def canonical_sha256(value: Any) -> str:
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
    return hashlib.sha256(encoded).hexdigest()

def fail(condition: bool, code: str, message: str, details: dict[str, Any] | None=None) -> None:
    if not condition:
        raise LineageValidationError(code, message, details)

def validate_schema(bundle: dict[str, Any], schema: dict[str, Any]) -> None:
    fail(schema.get('$schema') == 'https://json-schema.org/draft/2020-12/schema', 'CONTRACT_SCHEMA_DRAFT_MISMATCH', 'contract must declare JSON Schema Draft 2020-12')
    required_top = set(schema.get('required', []))
    fail(required_top.issubset(bundle), 'CONTRACT_REQUIRED_FIELD_MISSING', 'bundle is missing a required top-level field', {'missing': sorted(required_top - set(bundle))})
    fail(bundle.get('schema_version') == '1.0.0', 'SCHEMA_VERSION_MISMATCH', 'schema_version mismatch')
    fail(bundle.get('contract_id') == 'SOURCE_RECORD_LINEAGE_CONTRACT_V1', 'CONTRACT_ID_MISMATCH', 'contract_id mismatch')
    required_assignment = {'assignment_id','directive_id','directive_comment','duplicate_prompt_key','control_pr','branch','owned_root','official_assignment_blob'}
    assignment = bundle.get('assignment', {})
    fail(required_assignment.issubset(assignment), 'ASSIGNMENT_FIELD_MISSING', 'assignment is incomplete', {'missing': sorted(required_assignment - set(assignment))})
    required_authority = {'mode','producer','control_pr','accepted_input_types','actual_input_used','exact_head','exact_path','exact_blob','first_blocker'}
    authority = bundle.get('source_authority', {})
    fail(required_authority.issubset(authority), 'SOURCE_AUTHORITY_FIELD_MISSING', 'source authority is incomplete', {'missing': sorted(required_authority - set(authority))})
    fail(authority.get('accepted_input_types') == ['NORMALIZED_DATASET_V1','RAW_ARTIFACT_MANIFEST_V1'], 'ACCEPTED_INPUT_TYPES_MISMATCH', 'accepted input types mismatch')
    required_record = {'SOURCE_RECORD_ID','SOURCE_RECORD_VERSION','FIELDS','PROVENANCE_REF','EVIDENCE_REF'}
    for index, record in enumerate(bundle.get('source_records', [])):
        fail(required_record.issubset(record), 'SOURCE_RECORD_FIELD_MISSING', 'source record is incomplete', {'index': index, 'missing': sorted(required_record - set(record))})
        fail(isinstance(record.get('FIELDS'), dict) and bool(record['FIELDS']), 'SOURCE_RECORD_FIELDS_EMPTY', 'source record fields must be a non-empty object', {'index': index})
    required_entry = {'LINEAGE_ENTRY_ID','SOURCE_RECORD_ID','SOURCE_RECORD_VERSION','SOURCE_FIELD','SOURCE_VALUE','SOURCE_VALUE_SHA256','PROVENANCE_REF','EVIDENCE_REF','VALIDATION_STATUS','REJECTION_REASON'}
    allowed_status = {'ACCEPTED','REJECTED','PENDING_MAPPING'}
    for index, entry in enumerate(bundle.get('lineage_entries', [])):
        fail(required_entry.issubset(entry), 'LINEAGE_ENTRY_FIELD_MISSING', 'lineage entry is incomplete', {'index': index, 'missing': sorted(required_entry - set(entry))})
        fail(entry.get('VALIDATION_STATUS') in allowed_status, 'UNKNOWN_VALIDATION_STATUS', 'invalid validation status', {'index': index})
        fail(isinstance(entry.get('SOURCE_VALUE_SHA256'), str) and len(entry['SOURCE_VALUE_SHA256']) == 64, 'SOURCE_VALUE_DIGEST_FORMAT', 'source value digest must be 64 hex characters', {'index': index})
    required_summary = {'source_record_count','source_field_count','lineage_entry_count','silent_drop_count','duplicate_lineage_count','source_value_mutation_count','accepted_count','rejected_count','pending_count'}
    fail(required_summary.issubset(bundle.get('coverage_summary', {})), 'COVERAGE_SUMMARY_FIELD_MISSING', 'coverage summary is incomplete')
    required_safety = {'site_analyzer_ownership','site_extraction_runtime_ownership','d_canonical_schema_mutation','d_canonical_db_write','panel_shell_direct_edit','production','ready','merge'}
    safety = bundle.get('safety', {})
    fail(required_safety.issubset(safety), 'SAFETY_FIELD_MISSING', 'safety block is incomplete')
    fail(all(safety[key] is False for key in required_safety), 'SAFETY_BOUNDARY_VIOLATION', 'all C-2 safety boundaries must remain false')

def validate_lineage_bundle(bundle: dict[str, Any], schema: dict[str, Any] | None=None) -> dict[str, Any]:
    if schema is not None:
        validate_schema(bundle, schema)
    records = bundle.get('source_records', [])
    entries = bundle.get('lineage_entries', [])
    fail(bool(records), 'SOURCE_RECORDS_EMPTY', 'at least one source record is required')
    fail(bool(entries), 'LINEAGE_ENTRIES_EMPTY', 'at least one lineage entry is required')
    record_map: dict[str, dict[str, Any]] = {}
    source_pairs: list[tuple[str, str]] = []
    for record in records:
        record_id = record['SOURCE_RECORD_ID']
        fail(record_id not in record_map, 'DUPLICATE_SOURCE_RECORD_ID', 'duplicate source record id', {'record_id': record_id})
        record_map[record_id] = record
        for field_name in record['FIELDS'].keys():
            source_pairs.append((record_id, field_name))
    entry_pairs: list[tuple[str, str]] = []
    seen_entry_ids: set[str] = set()
    accepted = rejected = pending = 0
    for entry in entries:
        entry_id = entry['LINEAGE_ENTRY_ID']
        fail(entry_id not in seen_entry_ids, 'DUPLICATE_LINEAGE_ENTRY_ID', 'duplicate lineage entry id', {'entry_id': entry_id})
        seen_entry_ids.add(entry_id)
        record_id = entry['SOURCE_RECORD_ID']
        source_field = entry['SOURCE_FIELD']
        fail(record_id in record_map, 'UNKNOWN_SOURCE_RECORD_ID', 'lineage entry references unknown record', {'record_id': record_id})
        record = record_map[record_id]
        fail(source_field in record['FIELDS'], 'UNKNOWN_SOURCE_FIELD', 'lineage entry references unknown field', {'field': source_field})
        pair = (record_id, source_field)
        fail(pair not in entry_pairs, 'DUPLICATE_SOURCE_FIELD_LINEAGE', 'source field has more than one lineage entry', {'pair': pair})
        entry_pairs.append(pair)
        original_value = record['FIELDS'][source_field]
        fail(entry['SOURCE_VALUE'] == original_value, 'SOURCE_VALUE_MUTATED', 'source value changed in lineage entry', {'pair': pair})
        fail(entry['SOURCE_VALUE_SHA256'] == canonical_sha256(original_value), 'SOURCE_VALUE_DIGEST_MISMATCH', 'source value digest mismatch', {'pair': pair})
        fail(entry['SOURCE_RECORD_VERSION'] == record['SOURCE_RECORD_VERSION'], 'SOURCE_RECORD_VERSION_MISMATCH', 'source record version mismatch', {'pair': pair})
        fail(entry['PROVENANCE_REF'] == record['PROVENANCE_REF'], 'PROVENANCE_REF_MISMATCH', 'provenance reference mismatch', {'pair': pair})
        fail(entry['EVIDENCE_REF'] == record['EVIDENCE_REF'], 'EVIDENCE_REF_MISMATCH', 'evidence reference mismatch', {'pair': pair})
        fail(bool(entry['PROVENANCE_REF']), 'PROVENANCE_REF_MISSING', 'provenance reference is missing', {'pair': pair})
        fail(bool(entry['EVIDENCE_REF']), 'EVIDENCE_REF_MISSING', 'evidence reference is missing', {'pair': pair})
        status = entry['VALIDATION_STATUS']
        reason = entry['REJECTION_REASON']
        if status == 'ACCEPTED':
            fail(reason is None, 'ACCEPTED_WITH_REJECTION_REASON', 'accepted entry must not have rejection reason', {'pair': pair})
            accepted += 1
        elif status == 'REJECTED':
            fail(isinstance(reason, str) and bool(reason), 'REJECTED_WITHOUT_REASON', 'rejected entry must have rejection reason', {'pair': pair})
            rejected += 1
        elif status == 'PENDING_MAPPING':
            fail(isinstance(reason, str) and bool(reason), 'PENDING_WITHOUT_REASON', 'pending entry must have reason', {'pair': pair})
            pending += 1
        else:
            raise LineageValidationError('UNKNOWN_VALIDATION_STATUS', f'unknown validation status: {status}')
    source_set = set(source_pairs)
    entry_set = set(entry_pairs)
    missing = sorted(source_set - entry_set)
    extra = sorted(entry_set - source_set)
    fail(not missing, 'SILENT_DROP_DETECTED', 'one or more source fields have no lineage entry', {'missing': missing})
    fail(not extra, 'EXTRA_LINEAGE_DETECTED', 'lineage entries contain non-source fields', {'extra': extra})
    fail(len(source_pairs) == len(entry_pairs), 'LINEAGE_COUNT_MISMATCH', 'source field and lineage counts differ')
    authority = bundle['source_authority']
    if authority['mode'] == 'B1_EXACT_AUTHORITY':
        for key in ('exact_head','exact_path','exact_blob'):
            fail(bool(authority[key]), 'B1_EXACT_AUTHORITY_INCOMPLETE', f'{key} is required for actual B-1 binding')
        fail(authority['actual_input_used'] is True, 'ACTUAL_INPUT_FLAG_MISMATCH', 'actual input flag must be true')
    else:
        fail(authority['actual_input_used'] is False, 'FIXTURE_ACTUAL_INPUT_OVERCLAIM', 'fixture must not claim actual B input')
        fail(authority['first_blocker'] == 'B1_NORMALIZED_DATASET_OR_RAW_ARTIFACT_MANIFEST_NOT_PUBLISHED', 'FIXTURE_BLOCKER_MISMATCH', 'fixture blocker must identify missing B-1 authority input')
    summary = bundle['coverage_summary']
    expected = {'source_record_count': len(records),'source_field_count': len(source_pairs),'lineage_entry_count': len(entries),'silent_drop_count': 0,'duplicate_lineage_count': 0,'source_value_mutation_count': 0,'accepted_count': accepted,'rejected_count': rejected,'pending_count': pending}
    fail(all(summary.get(k) == v for k, v in expected.items()), 'COVERAGE_SUMMARY_MISMATCH', 'coverage summary does not match computed values', {'expected': expected, 'actual': summary})
    return {'status': 'PASS','source_record_count': len(records),'source_field_count': len(source_pairs),'lineage_entry_count': len(entries),'accepted_count': accepted,'rejected_count': rejected,'pending_count': pending,'silent_drop_count': 0,'source_value_mutation_count': 0,'actual_b_input_used': authority['actual_input_used'],'first_blocker': authority['first_blocker']}

def main() -> None:
    schema = json.loads((ROOT / 'SOURCE_RECORD_LINEAGE_CONTRACT_V1.json').read_text(encoding='utf-8'))
    bundle = json.loads((ROOT / 'SOURCE_RECORD_LINEAGE_FIXTURE_V1.json').read_text(encoding='utf-8'))
    print(json.dumps(validate_lineage_bundle(bundle, schema), ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
