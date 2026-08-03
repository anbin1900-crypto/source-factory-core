#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, re, sys
from pathlib import Path
from jsonschema import Draft202012Validator

SECRET_PATTERNS=[
 re.compile(r'(?i)bearer\s+(?!<redacted>)[a-z0-9._-]{8,}'),
 re.compile(r'(?i)(api[_-]?key|token|secret|password)\s*[:=]\s*(?!<redacted>)[^\s<]+'),
 re.compile(r'(?i)session(id)?=(?!<redacted>)[^;\s<]+'),
]
FORBIDDEN_HEADERS={'authorization','cookie','set-cookie','proxy-authorization','x-api-key','x-auth-token'}
REQUIRED_TYPES={'PAGE_ENTRY','REGION_DISCOVERY','SEARCH','FILTER','LIST','DETAIL','PAGINATION','MAP_MOVE','AUTH_SESSION','STATIC','UNKNOWN'}

def canonical(obj):
 return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(',',':')).encode('utf-8')

def validate(root:Path):
 schema=json.loads((root/'NETWORK_OBSERVATION_EVENT_V1.json').read_text(encoding='utf-8'))
 fixture=json.loads((root/'FIXTURE_TRACE_BUNDLE_V1.json').read_text(encoding='utf-8'))
 validator=Draft202012Validator(schema)
 errors=[]
 for ev in fixture['events']:
  for err in validator.iter_errors(ev): errors.append(f"{ev.get('event_id')}:{err.json_path}:{err.message}")
  for hdr in ev['request']['headers']+ev['response']['headers']:
   if hdr['name'].lower() in FORBIDDEN_HEADERS and hdr['value_state']!='PRESENT_REDACTED':
    errors.append(f"{ev['event_id']}:SENSITIVE_HEADER_NOT_REDACTED:{hdr['name']}")
 text=json.dumps(fixture,ensure_ascii=False)
 for p in SECRET_PATTERNS:
  if p.search(text): errors.append('SECRET_LIKE_VALUE:'+p.pattern)
 types={e['classification']['type'] for e in fixture['events']}
 missing=sorted(REQUIRED_TYPES-types)
 if missing: errors.append('MISSING_CLASSIFICATIONS:'+','.join(missing))
 if not any(e['classification']['type']=='UNKNOWN' for e in fixture['events']): errors.append('UNKNOWN_NOT_PRESERVED')
 ordered=sorted(fixture['events'],key=lambda e:(e['sequence'],e['event_id']))
 projection=[{
  'event_id':e['event_id'],'sequence':e['sequence'],'method':e['request']['method'],
  'url_pattern':e['request']['url_pattern'],'resource_type':e['request']['resource_type'],
  'status':e['response']['status'],'content_type':e['response']['content_type'],
  'classification':e['classification']['type'],'parameter_names':sorted(e['request']['parameter_names']),
  'timing_outcome':e['timing']['outcome'],'raw_secret_value_count':e['redaction']['raw_secret_value_count']
 } for e in ordered]
 digest=hashlib.sha256(canonical(projection)).hexdigest()
 return fixture,projection,digest,errors

def main():
 ap=argparse.ArgumentParser(); ap.add_argument('--root',default='.'); ap.add_argument('--output'); args=ap.parse_args()
 root=Path(args.root); fixture,projection,digest,errors=validate(root)
 result={'schema_version':'A3_FIXTURE_REPLAY_RESULT_V1','fixture_id':fixture['fixture_id'],'event_count':len(projection),'classification_type_count':len({x['classification'] for x in projection}),'canonical_sha256':digest,'raw_secret_value_count':sum(x['raw_secret_value_count'] for x in projection),'live_site_call_count':fixture['derivation']['live_site_call_count'],'status':'PASS' if not errors else 'FAIL','errors':errors,'projection':projection}
 text=json.dumps(result,ensure_ascii=False,indent=2,sort_keys=True)+'\n'
 if args.output: Path(args.output).write_text(text,encoding='utf-8')
 else: print(text,end='')
 return 0 if not errors else 1
if __name__=='__main__': sys.exit(main())
