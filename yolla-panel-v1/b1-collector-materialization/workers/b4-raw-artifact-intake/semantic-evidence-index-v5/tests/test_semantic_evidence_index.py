import tempfile, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT));sys.path.insert(0,str(ROOT/'src'))
from semantic_evidence_index import SemanticEvidenceIndex, SemanticEvidenceError
from run_semantic_evidence_smoke import CAT, run

def test_smoke():
 with tempfile.TemporaryDirectory() as td: assert run(Path(td))['status']=='PASS'
def test_invalid_class():
 with tempfile.TemporaryDirectory() as td:
  s=SemanticEvidenceIndex(Path(td),CAT)
  try:s.append_assertion(semantic_id='x',entity_type='NODE',producer_id='p',producer_assertion={},evidence_class='BAD',confidence=1,raw_evidence_pointers=['evidence-0c9073a255074c4a2fc66e8e'],derived_evidence_pointers=[],derivation_reference=None,created_at='x');assert False
  except SemanticEvidenceError:pass
def test_inferred_requires_derivation():
 with tempfile.TemporaryDirectory() as td:
  s=SemanticEvidenceIndex(Path(td),CAT)
  try:s.append_assertion(semantic_id='x',entity_type='NODE',producer_id='p',producer_assertion={},evidence_class='INFERRED',confidence=.5,raw_evidence_pointers=['evidence-0c9073a255074c4a2fc66e8e'],derived_evidence_pointers=[],derivation_reference=None,created_at='x');assert False
  except SemanticEvidenceError:pass
def test_unknown_raw_pointer_rejected():
 with tempfile.TemporaryDirectory() as td:
  s=SemanticEvidenceIndex(Path(td),CAT)
  try:s.append_assertion(semantic_id='x',entity_type='EDGE',producer_id='p',producer_assertion={},evidence_class='UNKNOWN',confidence=0,raw_evidence_pointers=['bad'],derived_evidence_pointers=[],derivation_reference='unknown://x',created_at='x');assert False
  except SemanticEvidenceError:pass
def test_confidence_range():
 with tempfile.TemporaryDirectory() as td:
  s=SemanticEvidenceIndex(Path(td),CAT)
  try:s.append_assertion(semantic_id='x',entity_type='NODE',producer_id='p',producer_assertion={},evidence_class='OBSERVED',confidence=1.1,raw_evidence_pointers=['evidence-0c9073a255074c4a2fc66e8e'],derived_evidence_pointers=[],derivation_reference=None,created_at='x');assert False
  except SemanticEvidenceError:pass
def test_no_pointer_rejected():
 with tempfile.TemporaryDirectory() as td:
  s=SemanticEvidenceIndex(Path(td),CAT)
  try:s.append_assertion(semantic_id='x',entity_type='NODE',producer_id='p',producer_assertion={},evidence_class='UNKNOWN',confidence=0,raw_evidence_pointers=[],derived_evidence_pointers=[],derivation_reference='unknown://x',created_at='x');assert False
  except SemanticEvidenceError:pass
