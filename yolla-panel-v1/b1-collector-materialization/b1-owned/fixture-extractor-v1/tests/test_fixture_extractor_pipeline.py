import copy, hashlib, json, sqlite3, tempfile, unittest, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from src.fixture_extractor_pipeline import ContractError, run_fixture_pipeline, validate_adapter_package

class T(unittest.TestCase):
    def setUp(self):
        self.adapter=json.loads((ROOT/'fixtures/FIXTURE_ADAPTER_PACKAGE_V1.json').read_text())
        self.pages=[ROOT/'fixtures/page_001.json',ROOT/'fixtures/page_002.json']
    def run_once(self):
        td=tempfile.TemporaryDirectory(); out=Path(td.name)/'out'; r=run_fixture_pipeline(self.adapter,self.pages,out); return td,out,r
    def test_01_fixture_package_accepted(self): validate_adapter_package(self.adapter,'fixture')
    def test_02_actual_mode_rejects_fixture(self):
        with self.assertRaises(ContractError): validate_adapter_package(self.adapter,'actual')
    def test_03_missing_field_rejected(self):
        bad=copy.deepcopy(self.adapter); bad.pop('pagination')
        with self.assertRaises(ContractError): validate_adapter_package(bad,'fixture')
    def test_04_raw_secret_rejected(self):
        bad=copy.deepcopy(self.adapter); bad['api_key']='x'
        with self.assertRaises(ContractError): validate_adapter_package(bad,'fixture')
    def test_05_two_pages(self): td,o,r=self.run_once(); self.addCleanup(td.cleanup); self.assertEqual(r['manifest']['artifact_count'],2)
    def test_06_progress_monotonic(self): td,o,r=self.run_once(); self.addCleanup(td.cleanup); p=[x['percent'] for x in r['progress']]; self.assertEqual(p,sorted(p))
    def test_07_raw_sha(self): td,o,r=self.run_once(); self.addCleanup(td.cleanup); self.assertEqual(r['manifest']['entries'][0]['sha256'],hashlib.sha256(self.pages[0].read_bytes()).hexdigest())
    def test_08_mutation_changes_sha(self): raw=self.pages[0].read_bytes(); self.assertNotEqual(hashlib.sha256(raw).hexdigest(),hashlib.sha256(raw+b' ').hexdigest())
    def test_09_source_url(self): td,o,r=self.run_once(); self.addCleanup(td.cleanup); self.assertEqual(r['manifest']['entries'][0]['source_url'],'https://fixture.invalid/listings?page=1')
    def test_10_time(self): td,o,r=self.run_once(); self.addCleanup(td.cleanup); self.assertEqual(r['envelopes']['records'][0]['collected_at'],'2026-08-04T05:22:00+09:00')
    def test_11_input_count(self): td,o,r=self.run_once(); self.addCleanup(td.cleanup); self.assertEqual(r['dataset']['input_record_count'],4)
    def test_12_duplicate_count(self): td,o,r=self.run_once(); self.addCleanup(td.cleanup); self.assertEqual(r['dataset']['duplicate_count'],1)
    def test_13_output_count(self): td,o,r=self.run_once(); self.addCleanup(td.cleanup); self.assertEqual(r['dataset']['output_record_count'],3)
    def test_14_loss_zero(self): td,o,r=self.run_once(); self.addCleanup(td.cleanup); self.assertEqual(r['dataset']['source_field_loss_count'],0)
    def test_15_unmapped_preserved(self):
        td,o,r=self.run_once(); self.addCleanup(td.cleanup); a=next(x for x in r['dataset']['records'] if x['record_id']=='L-001'); self.assertEqual(a['unmapped_fields']['extra']['floor'],3); self.assertEqual(a['source_fields']['address'],'Seoul')
    def test_16_lineage(self): td,o,r=self.run_once(); self.addCleanup(td.cleanup); self.assertEqual(len(r['dataset']['dedup_lineage']['L-002']),2)
    def test_17_sqlite_rows(self):
        td,o,r=self.run_once(); self.addCleanup(td.cleanup); c=sqlite3.connect(o/'fixture_materialized.sqlite'); n=c.execute('select count(*) from records').fetchone()[0]; c.close(); self.assertEqual(n,3)
    def test_18_network_zero(self): td,o,r=self.run_once(); self.addCleanup(td.cleanup); self.assertEqual(r['receipt']['network_call_count'],0)
    def test_19_semantic_d_write_zero(self): td,o,r=self.run_once(); self.addCleanup(td.cleanup); self.assertEqual(r['dataset']['semantic_transformation_count'],0); self.assertEqual(r['package']['d_canonical_db_write_count'],0)
    def test_20_deterministic(self):
        td1,o1,r1=self.run_once(); self.addCleanup(td1.cleanup); td2,o2,r2=self.run_once(); self.addCleanup(td2.cleanup)
        for n in ['RAW_ARTIFACT_MANIFEST_V1.json','SOURCE_RECORD_ENVELOPE_V1.json','NORMALIZED_DATASET_V1.json','EXTRACTION_RECEIPT_V1.json','MATERIALIZED_DATABASE_PACKAGE_V1.json','D_INTAKE_REQUEST_V1.json']:
            self.assertEqual((o1/n).read_bytes(),(o2/n).read_bytes())
    def test_21_receipt_hashes(self):
        td,o,r=self.run_once(); self.addCleanup(td.cleanup); self.assertEqual(r['receipt']['normalized_dataset_sha256'],hashlib.sha256((o/'NORMALIZED_DATASET_V1.json').read_bytes()).hexdigest()); self.assertEqual(r['receipt']['raw_artifact_manifest_sha256'],hashlib.sha256((o/'RAW_ARTIFACT_MANIFEST_V1.json').read_bytes()).hexdigest())
    def test_22_actual_false(self): td,o,r=self.run_once(); self.addCleanup(td.cleanup); self.assertFalse(r['receipt']['actual_site_extraction'])
if __name__=='__main__': unittest.main(verbosity=2)
