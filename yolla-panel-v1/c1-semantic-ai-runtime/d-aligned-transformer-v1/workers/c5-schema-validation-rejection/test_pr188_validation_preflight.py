import copy
import json
import unittest
from pathlib import Path
from pr188_validation_preflight import ALLOWED_DECISIONS, FailClosedError, build_receipt_candidate, decide, validate_preflight_contract, validate_rejected_records

CONTRACT=json.loads((Path(__file__).parent/"C5_PR188_VALIDATION_PREFLIGHT_CONTRACT_V1.json").read_text(encoding="utf-8"))

class TestPR188ValidationPreflight(unittest.TestCase):
    def test_contract_pass(self): self.assertEqual(validate_preflight_contract(CONTRACT)["decision"],"PASS")
    def test_exact_head_bound(self): self.assertEqual(CONTRACT["authority"]["head"],"1bb475c440983aae761b897a3b58a8f4dab880cc")
    def test_exact_blobs_four_of_four(self):
        c=CONTRACT["authority"]["contracts"]
        self.assertEqual([c[k]["blob"] for k in ("schema_profile","mapping_contract","validation_ruleset","acceptance_receipt_contract")],["710f1de7860f62143f81f36bd3eb4fbe2b613ff1","fcd879221b8d2b2c8f988a76e4045877ced9336b","7bc601dd16a84f44b95c7e5757a1a796cb5fd793","c5b2d0087c52fb1af4b9c0a31f7181aedebfd410"])
    def test_mapping_counts(self):
        m=CONTRACT["authority"]["contracts"]["mapping_contract"]
        self.assertEqual((m["mapping_rule_count"],m["required_lineage_field_count"]),(43,12))
    def test_decision_values(self): self.assertEqual(tuple(CONTRACT["decision_engine"]["allowed_decisions"]),ALLOWED_DECISIONS)
    def test_accepted(self): self.assertEqual(decide(True,1,0),"ACCEPTED")
    def test_partially_accepted(self): self.assertEqual(decide(True,1,1),"PARTIALLY_ACCEPTED")
    def test_rejected_package_gate(self): self.assertEqual(decide(False,5,0),"REJECTED")
    def test_rejected_zero_accepted(self): self.assertEqual(decide(True,0,3),"REJECTED")
    def test_negative_count_fail_closed(self):
        with self.assertRaises(FailClosedError): decide(True,-1,0)
    def sample(self):
        return [{"source_record_id":"R1","source_field":"price","source_value":{"original":100},"target_entity":"DOCUMENT_VERSION","target_field":"source_payload","reason_codes":["UNMAPPED_FIELD"],"retryable":True,"source_value_preserved":True}]
    def test_rejected_source_value_preserved(self): self.assertEqual(validate_rejected_records(self.sample()),{"rejected_count":1,"silent_drop_count":0})
    def test_rejected_missing_field_fails(self):
        bad=self.sample(); del bad[0]["source_value"]
        with self.assertRaises(FailClosedError): validate_rejected_records(bad)
    def test_rejected_missing_reason_fails(self):
        bad=self.sample(); bad[0]["reason_codes"]=[]
        with self.assertRaises(FailClosedError): validate_rejected_records(bad)
    def test_receipt_candidate_boundary(self):
        c=build_receipt_candidate(package_gate_pass=True,accepted_record_ids=["A1"],rejected_records=self.sample())
        self.assertEqual(c["decision"],"PARTIALLY_ACCEPTED")
        self.assertFalse(c["d_authority_acceptance_receipt_issued"])
        self.assertFalse(c["authoritative_db_write_performed"])
        self.assertEqual(c["actual_db_authority"],"D-1_ONLY")
    def test_gate_closed(self):
        self.assertFalse(CONTRACT["entry_gate_open"]); self.assertFalse(CONTRACT["final_decision_update_allowed"])
    def test_tampered_blob_fails(self):
        bad=copy.deepcopy(CONTRACT); bad["authority"]["contracts"]["schema_profile"]["blob"]="0"*40
        with self.assertRaises(FailClosedError): validate_preflight_contract(bad)
    def test_tampered_authority_fails(self):
        bad=copy.deepcopy(CONTRACT); bad["authority"]["control_pr"]=21
        with self.assertRaises(FailClosedError): validate_preflight_contract(bad)
    def test_premature_gate_open_fails(self):
        bad=copy.deepcopy(CONTRACT); bad["entry_gate_open"]=True
        with self.assertRaises(FailClosedError): validate_preflight_contract(bad)

if __name__=="__main__": unittest.main(verbosity=2)
