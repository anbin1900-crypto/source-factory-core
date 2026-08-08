import json, sys, tempfile, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; sys.path.insert(0,str(ROOT/"src"))
from composite_evidence_lineage import CompositeEvidenceLineageIndex, CompositeEvidenceError
SEM=json.loads((ROOT/"artifacts/UPSTREAM_SEMANTIC_FIXTURE_MINIMAL_V1.json").read_text())
RAW=set(json.loads((ROOT/"artifacts/UPSTREAM_CYCLE4_RAW_EVIDENCE_IDS_V1.json").read_text()))
class T(unittest.TestCase):
 def make(self):
  td=tempfile.TemporaryDirectory(); self.addCleanup(td.cleanup); return CompositeEvidenceLineageIndex(Path(td.name),SEM,RAW)
 def app(self,s,**kw):
  d=dict(composite_id="c1",composite_entity_type="NODE",mode="DATA",producer_id="P",producer_assertion={"x":1},semantic_evidence_pointers=["semantic://000001/1b159296e1d7a0e2"],created_at="2026-08-08T03:00:00+09:00"); d.update(kw); return s.append(**d)
 def test_append_and_reverse(self):
  s=self.make(); r=self.app(s); t=s.reverse_trace(r["entry"]["composite_pointer"]); self.assertEqual(t["raw_evidence_pointers"],["evidence-45dc26a0ed1139eebe7837e6","evidence-9c5de9ba71755ad58c862ef8"])
 def test_duplicate(self):
  s=self.make(); self.app(s); self.assertEqual(self.app(s)["disposition"],"DUPLICATE_IDENTICAL_SUPPRESSED")
 def test_modes(self):
  s=self.make()
  for i,m in enumerate(["DATA","PRODUCT","WRITE","MY_LISTING","EDIT"]): self.app(s,composite_id=f"c{i}",mode=m)
  self.assertEqual(set(s.rebuild_projection()["modes"]),{"DATA","PRODUCT","WRITE","MY_LISTING","EDIT"})
 def test_invalid_semantic_pointer(self):
  s=self.make()
  with self.assertRaises(CompositeEvidenceError): self.app(s,semantic_evidence_pointers=["semantic://missing"])
 def test_raw_pointer_validation(self):
  broken={"entries":[dict(SEM["entries"][0],raw_evidence_pointers=["evidence-missing"])]}
  td=tempfile.TemporaryDirectory(); self.addCleanup(td.cleanup); s=CompositeEvidenceLineageIndex(Path(td.name),broken,RAW)
  with self.assertRaises(CompositeEvidenceError): s.append(composite_id="x",composite_entity_type="NODE",mode="DATA",producer_id="P",producer_assertion={"x":1},semantic_evidence_pointers=[broken["entries"][0]["semantic_pointer"]],created_at="t")
 def test_hash_chain(self):
  s=self.make(); self.app(s); self.assertTrue(s.verify())
 def test_no_raw_materialization(self):
  s=self.make(); self.app(s); self.assertEqual(s.rebuild_projection()["raw_artifact_materialization_count"],0)
if __name__=="__main__": unittest.main()
