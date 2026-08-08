from __future__ import annotations
import json, re, unicodedata
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

TRACE_FIELDS = [
    'SOURCE_FIELD','TRANSFORMATION_RULE_ID','TARGET_ENTITY','TARGET_FIELD','TARGET_TYPE',
    'FORMAT_CONVERSION','UNIT_CONVERSION','CODE_NORMALIZATION','IDENTIFIER_NORMALIZATION',
    'RELATION_MAPPING','MAPPING_VERSION'
]
HEX40 = re.compile(r'^[0-9a-f]{40}$')
HEX64 = re.compile(r'^[0-9a-f]{64}$')
SEMVER = re.compile(r'^\d+\.\d+\.\d+$')
UPPER_SNAKE = re.compile(r'^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$')

class MappingValidationError(ValueError):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code

def load_json(path):
    path=Path(path)
    obj=json.loads(path.read_text(encoding='utf-8'))
    obj['_base_path']=str(path.parent)
    return obj

def expand_rows(columns, rows):
    return [dict(zip(columns,row)) for row in rows]

def catalog_rules(catalog):
    if 'trace_rows' in catalog:
        return expand_rows(catalog['trace_columns'],catalog['trace_rows'])
    rows=[]
    base=Path(catalog['_base_path'])
    import hashlib
    for shard in catalog['trace_shards']:
        raw=(base/shard['path']).read_bytes()
        if hashlib.sha256(raw).hexdigest()!=shard['sha256']:
            raise MappingValidationError('CATALOG_SHARD_HASH_MISMATCH')
        obj=json.loads(raw)
        if obj['rule_count']!=len(obj['trace_rows']): raise MappingValidationError('CATALOG_SHARD_COUNT_MISMATCH')
        rows.extend(expand_rows(obj['trace_columns'],obj['trace_rows']))
    return rows

def consumer_targets(consumer):
    return expand_rows(consumer['d_target_field_catalog_columns'],consumer['d_target_field_catalog_rows'])

def validate_catalog(catalog, consumer):
    errors=[]
    if catalog.get('rule_count') != len(catalog_rules(catalog)): errors.append('RULE_COUNT_MISMATCH')
    if catalog.get('rule_count') != 69: errors.append('EXPECTED_69_RULES')
    if not SEMVER.match(str(catalog.get('mapping_version',''))): errors.append('MAPPING_VERSION_INVALID')
    ids=set()
    target={(x['TARGET_ENTITY'],x['TARGET_FIELD']):x['TARGET_TYPE'] for x in consumer_targets(consumer)}
    allowed=set(consumer['d_transformation_rule_ids'])
    for row in catalog_rules(catalog):
        missing=[f for f in TRACE_FIELDS if f not in row]
        if missing: errors.append(f"MISSING_TRACE:{row.get('RULE_ID')}:{','.join(missing)}")
        rid=row.get('RULE_ID')
        if rid in ids: errors.append(f'DUPLICATE_RULE:{rid}')
        ids.add(rid)
        key=(row.get('TARGET_ENTITY'),row.get('TARGET_FIELD'))
        if key not in target: errors.append(f'UNKNOWN_TARGET:{rid}:{key}')
        elif target[key] != row.get('TARGET_TYPE'): errors.append(f'TARGET_TYPE_MISMATCH:{rid}')
        if row.get('TRANSFORMATION_RULE_ID') not in allowed: errors.append(f'UNKNOWN_TRANSFORM:{rid}')
        if row.get('MAPPING_VERSION') != catalog.get('mapping_version'): errors.append(f'ROW_MAPPING_VERSION_MISMATCH:{rid}')
    if catalog.get('no_silent_drop',{}).get('enabled') is not True: errors.append('SILENT_DROP_POLICY_NOT_ENABLED')
    if catalog.get('canonical_identifier_policy',{}).get('c3_may_generate_canonical_ids') is not False: errors.append('C3_CANONICAL_ID_GENERATION_NOT_FORBIDDEN')
    for item in consumer['d_authority']['contracts'].values():
        if not HEX40.match(item['blob']): errors.append('D_BLOB_INVALID')
        if not HEX64.match(item['declared_sha256']): errors.append('D_DECLARED_HASH_INVALID')
    return errors

def _uri_normalize(value):
    parts=urlsplit(str(value).strip())
    if parts.scheme.lower() not in {'http','https'} or not parts.netloc: raise MappingValidationError('FORMAT_ERROR')
    host=parts.hostname.lower() if parts.hostname else ''
    port=f':{parts.port}' if parts.port else ''
    seg=[]
    for p in parts.path.split('/'):
        if p in ('','.'): continue
        if p=='..':
            if seg: seg.pop()
        else: seg.append(p)
    return urlunsplit((parts.scheme.lower(),host+port,'/'+('/'.join(seg)),parts.query,''))

def _rfc3339_to_utc(value):
    text=str(value).strip().replace('Z','+00:00')
    try: dt=datetime.fromisoformat(text)
    except ValueError: raise MappingValidationError('FORMAT_ERROR')
    if dt.tzinfo is None: raise MappingValidationError('FORMAT_ERROR')
    return dt.astimezone(timezone.utc).isoformat().replace('+00:00','Z')

def transform(rule, value, context):
    t=rule['TRANSFORMATION_RULE_ID']
    if t=='CANONICAL_ID_LOOKUP_OR_D_GENERATE': return {'status':'D_GENERATION_REQUIRED','value':None}
    if t=='UNICODE_NFC_TRIM': return {'status':'PASS','value':unicodedata.normalize('NFC',str(value)).strip().replace('\u00a0',' ')}
    if t=='ENUM_EXACT':
        allowed=set(context.get('allowed_values',[]))
        if allowed and value not in allowed: raise MappingValidationError('INVALID_CODE')
        return {'status':'PASS','value':value}
    if t=='URI_NORMALIZE': return {'status':'PASS','value':_uri_normalize(value)}
    if t in {'SHA256_LOWERCASE_VERIFY','SHA256_QUOTE_VERIFY'}:
        v=str(value).strip().lower()
        if not HEX64.match(v): raise MappingValidationError('FORMAT_ERROR')
        return {'status':'PASS','value':v}
    if t=='RFC3339_TO_UTC': return {'status':'PASS','value':_rfc3339_to_utc(value)}
    if t=='DATE_NORMALIZE':
        try: return {'status':'PASS','value':datetime.fromisoformat(str(value)).date().isoformat()}
        except ValueError: raise MappingValidationError('FORMAT_ERROR')
    if t=='MIME_LOWERCASE_VALIDATE':
        v=str(value).strip().lower()
        if '/' not in v: raise MappingValidationError('FORMAT_ERROR')
        return {'status':'PASS','value':v}
    if t=='PATH_OR_URI_VALIDATE':
        v=str(value).strip()
        if not v: raise MappingValidationError('FORMAT_ERROR')
        return {'status':'PASS','value':v}
    if t=='INTEGER_NONNEGATIVE':
        if isinstance(value,bool) or not isinstance(value,int): raise MappingValidationError('TYPE_ERROR')
        if value<0: raise MappingValidationError('RANGE_ERROR')
        return {'status':'PASS','value':value}
    if t=='DOCUMENT_TYPE_CODE_MAP_V1':
        if value not in set(context.get('allowed_values',[])): raise MappingValidationError('INVALID_CODE')
        return {'status':'PASS','value':value}
    if t=='ISO_639_1_LOWERCASE':
        v=str(value).strip().lower()
        if not re.match(r'^[a-z]{2}$',v): raise MappingValidationError('INVALID_CODE')
        return {'status':'PASS','value':v}
    if t=='UPPER_SNAKE_CASE':
        v=re.sub(r'[^A-Za-z0-9]+','_',unicodedata.normalize('NFC',str(value)).strip()).strip('_').upper()
        if not UPPER_SNAKE.match(v): raise MappingValidationError('INVALID_CODE')
        return {'status':'PASS','value':v}
    if t=='ARRAY_TEXT_NORMALIZE':
        if not isinstance(value,list): raise MappingValidationError('TYPE_ERROR')
        return {'status':'PASS','value':[unicodedata.normalize('NFC',str(x)).strip() for x in value]}
    if t=='DECIMAL_0_1_VALIDATE':
        if isinstance(value,bool) or not isinstance(value,(int,float)): raise MappingValidationError('TYPE_ERROR')
        if value<0 or value>1: raise MappingValidationError('RANGE_ERROR')
        return {'status':'PASS','value':value}
    refmap={'EXISTING_FRAGMENT_REFERENCE_ONLY':'FRAGMENT','EXISTING_DOCUMENT_VERSION_REFERENCE_ONLY':'DOCUMENT_VERSION','EXISTING_ASSERTION_REFERENCE_ONLY':'ASSERTION','EXISTING_CANONICAL_OBJECT_REFERENCE_ONLY':'CANONICAL_OBJECT'}
    if t in refmap:
        if value not in context['existing_references'][refmap[t]]: raise MappingValidationError('FOREIGN_REFERENCE_MISSING')
        return {'status':'PASS','value':value}
    if t in {'LOSSLESS_JSON_PRESERVE','LOSSLESS_TEXT_PRESERVE','LOCATOR_VALIDATE'}: return {'status':'PASS','value':value}
    raise MappingValidationError('TRANSFORMATION_RULE_NOT_FOUND')

def run_fixture(catalog, fixture):
    by_id={r['RULE_ID']:r for r in catalog_rules(catalog)}
    results=[]
    for case in fixture['cases']:
        if case.get('rule_id')=='UNMAPPED':
            results.append({'case_id':case['case_id'],'status':'REJECT_PRESERVED','reason_code':'UNMAPPED_FIELD','source_value_preserved':case['source_value'],'pass':case['expected_status']=='REJECT_PRESERVED'})
            continue
        rule=by_id[case['rule_id']]
        ctx=dict(fixture); ctx.update(case)
        try:
            out=transform(rule,case.get('source_value'),ctx); status=out['status']
            result={'case_id':case['case_id'],'rule_id':case['rule_id'],**out}
        except MappingValidationError as exc:
            status='REJECT'; result={'case_id':case['case_id'],'rule_id':case['rule_id'],'status':status,'reason_code':exc.code,'source_value_preserved':case.get('source_value')}
        result['expected_status']=case['expected_status']; result['pass']=status==case['expected_status']
        if 'expected_value' in case and status in {'PASS','D_GENERATION_REQUIRED'}: result['pass'] = result['pass'] and result.get('value')==case['expected_value']
        if 'reason_code' in case and status.startswith('REJECT'): result['pass'] = result['pass'] and result.get('reason_code')==case['reason_code']
        results.append(result)
    return results
