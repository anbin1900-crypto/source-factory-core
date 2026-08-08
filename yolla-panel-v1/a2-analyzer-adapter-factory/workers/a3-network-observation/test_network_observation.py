from __future__ import annotations
import importlib.util, json, sys, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parent
SPEC=importlib.util.spec_from_file_location('replay',ROOT/'replay_fixture_trace.py')
M=importlib.util.module_from_spec(SPEC); assert SPEC.loader; sys.modules[SPEC.name]=M; SPEC.loader.exec_module(M)
class A3Tests(unittest.TestCase):
 def test_schema_and_fixture_pass(self):
  fixture,p,d,e=M.validate(ROOT); self.assertFalse(e); self.assertGreaterEqual(len(p),12)
 def test_replay_is_deterministic(self):
  _,p1,d1,e1=M.validate(ROOT); _,p2,d2,e2=M.validate(ROOT); self.assertEqual(p1,p2); self.assertEqual(d1,d2); self.assertEqual(e1,e2)
 def test_classification_types(self):
  _,p,_,_=M.validate(ROOT); self.assertGreaterEqual(len({x['classification'] for x in p}),8); self.assertIn('UNKNOWN',{x['classification'] for x in p})
 def test_no_raw_secret(self):
  _,p,_,_=M.validate(ROOT); self.assertEqual(sum(x['raw_secret_value_count'] for x in p),0)
 def test_live_site_zero(self):
  f,_,_,_=M.validate(ROOT); self.assertEqual(f['derivation']['live_site_call_count'],0); self.assertFalse(f['derivation']['actual_browser_capture'])
 def test_rate_limit_states(self):
  r=json.loads((ROOT/'RATE_LIMIT_RETRY_OBSERVATION_V1.json').read_text()); self.assertEqual(r['observations']['http_429']['state'],'OBSERVED'); self.assertEqual(r['observations']['backoff_execution']['state'],'NOT_OBSERVED'); self.assertEqual(r['observations']['server_rate_limit_headers_other_than_retry_after']['state'],'UNKNOWN')
 def test_handoff_boundaries(self):
  a5=json.loads((ROOT/'A3_TO_A5_OBSERVATION_HANDOFF_V1.json').read_text()); a6=json.loads((ROOT/'A3_TO_A6_FIXTURE_TRACE_HANDOFF_V1.json').read_text()); self.assertFalse(a5['authoritative_endpoint_catalog']); self.assertTrue(a5['ready']); self.assertTrue(a6['ready'])
if __name__=='__main__': unittest.main(verbosity=2)
