from __future__ import annotations
from pathlib import Path
from typing import Any, Dict, List
import hashlib
import json
import sqlite3

REQUIRED_ADAPTER_FIELDS = {
    'schema_version','package_type','adapter_id','verification_status',
    'source_base_url','endpoint_template','method','parameters','pagination',
    'response','field_mapping','retry_policy','rate_policy'
}
FORBIDDEN_SECRET_KEYS = {'api_key','apikey','secret','token','password','authorization','cookie'}

class ContractError(ValueError):
    pass

def canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')

def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def validate_adapter_package(package: Dict[str, Any], mode: str) -> None:
    missing = sorted(REQUIRED_ADAPTER_FIELDS - set(package))
    if missing:
        raise ContractError(f'missing required fields: {missing}')
    if package['package_type'] != 'VERIFIED_ADAPTER_PACKAGE_V1':
        raise ContractError('unsupported package_type')
    exposed = sorted({str(k).lower() for k in package} & FORBIDDEN_SECRET_KEYS)
    if exposed:
        raise ContractError(f'raw secret fields prohibited: {exposed}')
    if package.get('credential_reference') not in (None, '') and not isinstance(package.get('credential_reference'), str):
        raise ContractError('credential_reference must be string or null')
    if mode == 'actual':
        if package.get('verification_status') != 'A2_VERIFIED' or package.get('actual_mode_allowed') is not True:
            raise ContractError('actual mode requires A2_VERIFIED package and explicit allowance')
    elif mode == 'fixture':
        if package.get('verification_status') not in {'FIXTURE_ONLY', 'A2_VERIFIED'}:
            raise ContractError('fixture mode requires fixture or A2 verification')
    else:
        raise ContractError('unknown mode')

def nested_get(obj: Dict[str, Any], path: str) -> Any:
    cur: Any = obj
    for part in path.split('.'):
        if not isinstance(cur, dict) or part not in cur:
            raise ContractError(f'missing response path: {path}')
        cur = cur[part]
    return cur

def build_progress(run_id: str, sequence: int, stage: str, completed: int, total: int, occurred_at: str) -> Dict[str, Any]:
    pct = 100 if total == 0 else round(completed * 100 / total, 4)
    return {'run_id': run_id, 'sequence': sequence, 'stage': stage, 'completed_units': completed, 'total_units': total, 'percent': pct, 'occurred_at': occurred_at}

def _source_url(adapter: Dict[str, Any], page_no: int) -> str:
    return adapter['source_base_url'].rstrip('/') + adapter['endpoint_template'].format(page=page_no)

def run_fixture_pipeline(adapter: Dict[str, Any], fixture_paths: List[Path], output_dir: Path, *, run_id: str='fixture-run-001', collected_at: str='2026-08-04T05:22:00+09:00') -> Dict[str, Any]:
    validate_adapter_package(adapter, 'fixture')
    output_dir.mkdir(parents=True, exist_ok=True)
    raw_dir = output_dir / 'raw'
    raw_dir.mkdir(exist_ok=True)
    manifests, envelopes, progress = [], [], []
    total_pages = len(fixture_paths)
    sequence = 1
    progress.append(build_progress(run_id, sequence, 'START', 0, total_pages, collected_at)); sequence += 1

    for page_no, fixture_path in enumerate(fixture_paths, start=1):
        raw_bytes = fixture_path.read_bytes()
        parsed = json.loads(raw_bytes.decode('utf-8'))
        records = nested_get(parsed, adapter['response']['records_path'])
        if not isinstance(records, list):
            raise ContractError('records_path must resolve to list')
        source_url = _source_url(adapter, page_no)
        artifact_id = f'raw-{page_no:03d}-{sha256_bytes(raw_bytes)[:16]}'
        raw_target = raw_dir / f'{artifact_id}.json'
        if raw_target.exists():
            raise ContractError('raw artifact overwrite rejected')
        raw_target.write_bytes(raw_bytes)
        manifests.append({
            'artifact_id': artifact_id, 'source_url': source_url, 'collected_at': collected_at,
            'sha256': sha256_bytes(raw_bytes), 'size_bytes': len(raw_bytes), 'record_count': len(records),
            'metadata': parsed.get('metadata', {}),
            'request_summary': {'method': adapter['method'], 'page': page_no, 'credential_reference': adapter.get('credential_reference')},
            'stored_path': raw_target.name,
        })
        for idx, record in enumerate(records):
            source_bytes = canonical_json_bytes(record)
            envelopes.append({
                'source_record_id': f'{artifact_id}:{idx}', 'raw_artifact_id': artifact_id,
                'source_url': source_url, 'collected_at': collected_at, 'record_index': idx,
                'source_fields': record, 'source_sha256': sha256_bytes(source_bytes),
            })
        progress.append(build_progress(run_id, sequence, 'PAGE_STORED', page_no, total_pages, collected_at)); sequence += 1

    mapping = adapter['field_mapping']
    mapped_source_keys = set(mapping.values())
    normalized_records, dedup_lineage, seen = [], {}, {}
    duplicate_count = 0
    for envelope in envelopes:
        src = envelope['source_fields']
        record_id = str(src[mapping['record_id']])
        dedup_lineage.setdefault(record_id, []).append(envelope['source_record_id'])
        if record_id in seen:
            if canonical_json_bytes(seen[record_id]['source_fields']) != canonical_json_bytes(src):
                raise ContractError(f'conflicting duplicate record: {record_id}')
            duplicate_count += 1
            continue
        normalized = {
            'record_id': record_id,
            'normalized_fields': {'record_id': record_id, 'title': src.get(mapping['title']), 'price': src.get(mapping['price'])},
            'source_fields': src,
            'unmapped_fields': {k: v for k, v in src.items() if k not in mapped_source_keys},
            'provenance': {'source_record_ids': [envelope['source_record_id']], 'raw_artifact_ids': [envelope['raw_artifact_id']], 'source_urls': [envelope['source_url']]},
        }
        seen[record_id] = normalized
        normalized_records.append(normalized)
    for rec in normalized_records:
        ids = dedup_lineage[rec['record_id']]
        rec['provenance']['source_record_ids'] = ids
        rec['provenance']['raw_artifact_ids'] = sorted({x.split(':')[0] for x in ids})

    manifest = {'schema_version':'1.0.0','manifest_id':f'{run_id}-raw-manifest','entries':manifests,'artifact_count':len(manifests),'total_record_count':sum(e['record_count'] for e in manifests),'immutability':'APPEND_ONLY_NO_OVERWRITE'}
    envelope_bundle = {'schema_version':'1.0.0','bundle_id':f'{run_id}-source-envelope','records':envelopes,'record_count':len(envelopes),'semantic_transformation_count':0}
    dataset = {'schema_version':'1.0.0','dataset_id':f'{run_id}-normalized-dataset','records':normalized_records,'input_record_count':len(envelopes),'output_record_count':len(normalized_records),'duplicate_count':duplicate_count,'source_field_loss_count':0,'dedup_lineage':dedup_lineage,'semantic_transformation_count':0,'d_canonical_schema_decision_count':0}

    manifest_bytes, envelope_bytes, dataset_bytes = map(canonical_json_bytes, [manifest, envelope_bundle, dataset])
    receipt = {'schema_version':'1.0.0','run_id':run_id,'adapter_id':adapter['adapter_id'],'mode':'FIXTURE','raw_artifact_manifest_sha256':sha256_bytes(manifest_bytes),'source_record_envelope_sha256':sha256_bytes(envelope_bytes),'normalized_dataset_sha256':sha256_bytes(dataset_bytes),'input_record_count':dataset['input_record_count'],'output_record_count':dataset['output_record_count'],'duplicate_count':duplicate_count,'network_call_count':0,'actual_site_extraction':False,'status':'FIXTURE_E2E_PASS'}
    receipt_bytes = canonical_json_bytes(receipt)
    outputs = {'RAW_ARTIFACT_MANIFEST_V1.json':manifest_bytes,'SOURCE_RECORD_ENVELOPE_V1.json':envelope_bytes,'NORMALIZED_DATASET_V1.json':dataset_bytes,'EXTRACTION_RECEIPT_V1.json':receipt_bytes}
    for name, data in outputs.items(): (output_dir/name).write_bytes(data)

    db_path = output_dir / 'fixture_materialized.sqlite'
    if db_path.exists(): db_path.unlink()
    conn = sqlite3.connect(db_path)
    try:
        conn.execute('CREATE TABLE records (record_id TEXT PRIMARY KEY, normalized_json TEXT NOT NULL, source_fields_json TEXT NOT NULL, provenance_json TEXT NOT NULL)')
        for rec in normalized_records:
            conn.execute('INSERT INTO records VALUES(?,?,?,?)',(rec['record_id'],json.dumps(rec['normalized_fields'],ensure_ascii=False,sort_keys=True),json.dumps(rec['source_fields'],ensure_ascii=False,sort_keys=True),json.dumps(rec['provenance'],ensure_ascii=False,sort_keys=True)))
        conn.commit()
    finally:
        conn.close()
    db_bytes = db_path.read_bytes()
    package = {'schema_version':'1.0.0','package_id':f'{run_id}-materialized-db','database_file':db_path.name,'database_sha256':sha256_bytes(db_bytes),'database_size_bytes':len(db_bytes),'row_count':len(normalized_records),'normalized_dataset_sha256':receipt['normalized_dataset_sha256'],'extraction_receipt_sha256':sha256_bytes(receipt_bytes),'database_type':'SQLITE_FIXTURE','d_canonical_schema':False,'d_canonical_db_write_count':0}
    package_bytes = canonical_json_bytes(package)
    (output_dir/'MATERIALIZED_DATABASE_PACKAGE_V1.json').write_bytes(package_bytes)
    d_intake = {'schema_version':'1.0.0','request_id':f'{run_id}-d-intake','materialized_database_package':{'package_id':package['package_id'],'manifest_sha256':sha256_bytes(package_bytes),'database_sha256':package['database_sha256']},'source_evidence':{'raw_artifact_manifest_sha256':receipt['raw_artifact_manifest_sha256'],'source_record_envelope_sha256':receipt['source_record_envelope_sha256'],'extraction_receipt_sha256':sha256_bytes(receipt_bytes)},'requested_action':'D1_REVIEW_AND_CANONICAL_MAPPING','authority_boundary':{'b1_defines_d_canonical_schema':False,'b1_writes_d_canonical_db':False,'production':False}}
    (output_dir/'D_INTAKE_REQUEST_V1.json').write_bytes(canonical_json_bytes(d_intake))
    c1_handoff = {'schema_version':'1.0.0','handoff_id':f'{run_id}-c1-source-evidence','source_record_envelope_sha256':receipt['source_record_envelope_sha256'],'normalized_dataset_sha256':receipt['normalized_dataset_sha256'],'extraction_receipt_sha256':sha256_bytes(receipt_bytes),'semantic_decision_count':0,'scope':'SOURCE_EVIDENCE_ONLY'}
    (output_dir/'B1_TO_C1_SOURCE_EVIDENCE_HANDOFF_V1.json').write_bytes(canonical_json_bytes(c1_handoff))
    progress.append(build_progress(run_id, sequence, 'COMPLETE', total_pages, total_pages, collected_at))
    (output_dir/'COLLECTION_PROGRESS_EVENTS_V1.json').write_bytes(canonical_json_bytes({'events':progress}))
    return {'manifest':manifest,'envelopes':envelope_bundle,'dataset':dataset,'receipt':receipt,'package':package,'d_intake':d_intake,'c1_handoff':c1_handoff,'progress':progress,'output_dir':str(output_dir)}

def provider_status(result: Dict[str, Any]) -> Dict[str, Any]:
    return {'provider_id':'B1_FIXTURE_COLLECTOR_PROVIDER_V1','status':result['receipt']['status'],'input_record_count':result['receipt']['input_record_count'],'output_record_count':result['receipt']['output_record_count'],'duplicate_count':result['receipt']['duplicate_count'],'actual_site_extraction':False,'production':False,'ready':False,'merge':False}
