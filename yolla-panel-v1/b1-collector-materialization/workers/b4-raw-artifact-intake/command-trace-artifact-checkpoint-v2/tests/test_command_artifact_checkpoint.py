from pathlib import Path
import sys,tempfile,unittest
sys.path.insert(0,str(Path(__file__).parents[1]/'src'))
from command_artifact_layer import DurableCommandArtifactLayer,CommandArtifactError
class T(unittest.TestCase):
 def store(self):
  t=tempfile.TemporaryDirectory(); self.addCleanup(t.cleanup); return DurableCommandArtifactLayer(Path(t.name))
 def test_partial_does_not_advance(self):
  s=self.store(); s.stage_partial(command_id='c',attempt_no=1,step_id='s',raw_bytes=b'{}',created_at='t',source_pointer='u'); self.assertIsNone(s.recovery('c')['last_durable_artifact_pointer'])
 def test_promote_advances_checkpoint(self):
  s=self.store(); p=s.stage_partial(command_id='c',attempt_no=1,step_id='s',raw_bytes=b'{}',created_at='t',source_pointer='u'); r=s.promote(p['partial_id'],next_resumable_step='n'); self.assertEqual(s.recovery('c')['last_durable_artifact_pointer'],r['artifact']['artifact_id'])
 def test_duplicate_identical(self):
  s=self.store(); p=s.stage_partial(command_id='c',attempt_no=1,step_id='s',raw_bytes=b'{}',created_at='t',source_pointer='u'); s.promote(p['partial_id'],next_resumable_step='n'); p2=s.stage_partial(command_id='c',attempt_no=1,step_id='s',raw_bytes=b'{}',created_at='t2',source_pointer='u'); self.assertEqual(s.promote(p2['partial_id'],next_resumable_step='n')['disposition'],'DUPLICATE_IDENTICAL')
 def test_distinct_hash_is_distinct(self):
  s=self.store(); p=s.stage_partial(command_id='c',attempt_no=1,step_id='s',raw_bytes=b'{"x":1}',created_at='t',source_pointer='u'); s.promote(p['partial_id'],next_resumable_step='n'); p2=s.stage_partial(command_id='c',attempt_no=1,step_id='s',raw_bytes=b'{"x":2}',created_at='t2',source_pointer='u'); self.assertEqual(s.promote(p2['partial_id'],next_resumable_step='n')['disposition'],'NEW_COMPLETED')
 def test_a7_projection(self):
  s=self.store(); p=s.stage_partial(command_id='c',attempt_no=1,step_id='s',raw_bytes=b'{}',created_at='t',source_pointer='u',b5_dataset_checkpoint_pointer='b5://x'); s.promote(p['partial_id'],next_resumable_step='n'); q=s.a7_projection('c'); self.assertEqual(q['artifact_count'],1); self.assertEqual(q['b5_dataset_checkpoint_pointer'],'b5://x')
 def test_secret_rejected(self):
  s=self.store();
  with self.assertRaises(CommandArtifactError): s.stage_partial(command_id='c',attempt_no=1,step_id='s',raw_bytes=b'Authorization: Bearer abcdefghijklmnop',created_at='t',source_pointer='u')
if __name__=='__main__': unittest.main()
