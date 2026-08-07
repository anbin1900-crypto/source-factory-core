import hashlib, tempfile, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/"src"));sys.path.insert(0,str(ROOT))
from real_site_evidence_lineage import RealSiteEvidenceLineageStore,EvidenceLineageError
from run_real_site_lineage_smoke import fixture
def store():
    td=tempfile.TemporaryDirectory(); return td,RealSiteEvidenceLineageStore(Path(td.name))
def test_fixture_smoke_and_duplicate():
    td,s=store()
    try:
      assert s.ingest_receipt(fixture(),allow_fixture=True)["disposition"]=="BOUND"
      assert s.ingest_receipt(fixture(),allow_fixture=True)["disposition"]=="DUPLICATE_IDENTICAL_SUPPRESSED"
      assert s.verify_chain()
    finally: td.cleanup()
def test_fixture_rejected_without_flag():
    td,s=store()
    try:
      try:s.ingest_receipt(fixture());assert False
      except EvidenceLineageError:pass
    finally:td.cleanup()
def test_sensitive_reject():
    td,s=store(); x=fixture();x["token"]="secret-value"
    try:
      try:s.ingest_receipt(x,allow_fixture=True);assert False
      except EvidenceLineageError:pass
    finally:td.cleanup()
def test_correlation_reject():
    td,s=store();x=fixture();x["evidence"][0]["command_id"]="OTHER"
    try:
      try:s.ingest_receipt(x,allow_fixture=True);assert False
      except EvidenceLineageError:pass
    finally:td.cleanup()
def test_inferred_derivation_required():
    td,s=store();x=fixture();x["semantic_results"][0]["derivation_reference"]=None
    try:
      try:s.ingest_receipt(x,allow_fixture=True);assert False
      except EvidenceLineageError:pass
    finally:td.cleanup()
def test_status_waiting_without_actual():
    td,s=store()
    try: assert s.status()["status"]=="WAITING_INPUT"
    finally:td.cleanup()
def test_no_raw_materialization():
    td,s=store()
    try:
      s.ingest_receipt(fixture(),allow_fixture=True)
      assert not any(p.suffix in {".bin",".raw"} for p in Path(td.name).rglob("*"))
      assert s.status()["actual_site_receipt_count"]==0
    finally:td.cleanup()
