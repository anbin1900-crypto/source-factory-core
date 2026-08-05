from __future__ import annotations
import copy,json,sys,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; sys.path.insert(0,str(ROOT/"src"))
from raw_artifact_manifest_v2 import ManifestValidationError,digest,load,secret_keys,validate_entry,validate_manifest,validate_root
class T(unittest.TestCase):
 @classmethod
 def setUpClass(c): c.m=load(ROOT/"RAW_ARTIFACT_MANIFEST_V2.json"); c.e=c.m["entries"]; c.r=validate_root(ROOT)
 def test_01_valid(c): c.assertEqual(c.r,{"result":"PASS","artifact_count":2,"total_record_count":4})
checks=[
("02_schema",lambda c:c.m["schema_version"]=="RAW_ARTIFACT_MANIFEST_V2"),
("03_comment",lambda c:c.m["directive_comment_id"]==5196652743),
("04_v1_blob",lambda c:c.m["source_v1_authority"]["manifest_blob"]=="bca1029b2587b4c78f6fdd78df6c9b95031addb1"),
("05_count",lambda c:c.m["artifact_count"]==2),
("06_records",lambda c:c.m["total_record_count"]==4),
("07_size1",lambda c:c.e[0]["byte_size"]==254),("08_size2",lambda c:c.e[1]["byte_size"]==246),
("09_sha1",lambda c:c.e[0]["sha256"]=="b8ab938fbc39b3f3b41f73f3b819a871c9e8416aa269e18278682ae0362338f0"),
("10_sha2",lambda c:c.e[1]["sha256"]=="c2bd6c5ae5921e520c35fbc7ebe22baff7926944bc001277b9d95931947ab4d2"),
("11_mime",lambda c:all(x["mime_type"]=="application/json" for x in c.e)),
("12_storage",lambda c:all("@6dfe697363a69f83797775aa549f34614aa3748a/" in x["storage_pointer"] for x in c.e)),
("13_blobs",lambda c:[x["locator"]["blob_sha"] for x in c.e]==["9d34c7e31534906f6d067214f7ddf31f8262c398","9b51ca590b05383ccf891e6ddb7c18cf56160d36"]),
("14_urls",lambda c:all(x["official_source_url"].startswith("https://") for x in c.e)),
("15_time",lambda c:all(x["captured_at"]=="2026-08-04T05:22:00+09:00" for x in c.e)),
("16_immutable",lambda c:all(x["immutability"]=="APPEND_ONLY_NO_OVERWRITE" for x in c.e)),
("17_overwrite",lambda c:all(x["raw_overwrite"] is False for x in c.e)),
("18_secret",lambda c:all(x["secret_storage"] is False for x in c.e)),
("19_site_unobserved",lambda c:all(x["observation"]["actual_site_response_observed"] is False for x in c.e)),
("20_mime_unobserved",lambda c:all(x["observation"]["actual_site_mime_type"]=="NOT_OBSERVED" for x in c.e)),
("21_sha_unobserved",lambda c:all(x["observation"]["actual_site_sha256"]=="NOT_OBSERVED" for x in c.e)),
("22_pii",lambda c:all(x["personal_data_status"]=="ALLOW" for x in c.e)),
("23_redaction",lambda c:all(x["redaction_status"]=="NOT_REQUIRED_FIXTURE_NO_PERSONAL_DATA" for x in c.e)),
("24_no_promotion",lambda c:all(x["personal_data_review"]["personal_data_promotion"] is False for x in c.e)),
("25_no_secrets_in_raw",lambda c:all(not secret_keys(json.loads(p.read_text())) for p in ROOT.glob("raw/*.json"))),
("26_boundaries",lambda c:all(c.m["boundaries"][k] is False for k in "production ready merge actual_site_extraction".split())),
]
def make_check(fn):
 def t(self): self.assertTrue(fn(self))
 return t
for name,fn in checks: setattr(T,"test_"+name,make_check(fn))
mutations=[
("27_bad_hash",lambda m:m["entries"][0].__setitem__("sha256","0"*64)),
("28_bad_size",lambda m:m["entries"][0].__setitem__("byte_size",255)),
("29_overwrite",lambda m:m["entries"][0].__setitem__("raw_overwrite",True)),
("30_secret",lambda m:m["entries"][0].__setitem__("secret_storage",True)),
("31_actual_mime",lambda m:m["entries"][0]["observation"].__setitem__("actual_site_mime_type","application/json")),
("32_pii_promotion",lambda m:m["entries"][0]["personal_data_review"].__setitem__("personal_data_promotion",True)),
("33_dup_key",lambda m:m["entries"][1].__setitem__("artifact_native_key",m["entries"][0]["artifact_native_key"])),
("34_bad_total",lambda m:m.__setitem__("total_record_count",3)),
("35_bad_boundary",lambda m:m["boundaries"].__setitem__("personal_data_promotion",True)),
]
def make_mut(fn):
 def t(self):
  m=copy.deepcopy(self.m); fn(m)
  with self.assertRaises(ManifestValidationError): validate_manifest(m,ROOT)
 return t
for name,fn in mutations: setattr(T,"test_"+name,make_mut(fn))
if __name__=="__main__": unittest.main(verbosity=2)
